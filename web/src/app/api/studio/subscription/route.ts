/**
 * Studio subscription endpoint.
 *
 *   GET  /api/studio/subscription → current tier + usage + limits
 *   POST /api/studio/subscription { tier: "pro" | "studio", txHash } → upgrade
 *
 * Upgrade flow: client signs USDT.transfer(treasury, $19 or $49) on BSC,
 * posts the tx_hash here. Server verifies the transfer (reusing the same
 * BSC verifier as credits/purchase + action-pay), then either creates a new
 * 30-day window or extends the current one.
 */

import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rateLimit";
import { TIER_LIMITS } from "@/lib/studio/providers";
import { getCurrentSubscription } from "@/lib/studio/subscription";
import { consumePaymentTx, PaymentAlreadyConsumed } from "@/lib/payments";
import { verifyUsdtTransfer, treasuryConfigured } from "@/lib/onchain";

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sub = await getCurrentSubscription(user.id);
  return NextResponse.json(sub);
}

// Memberships are NOT on sale yet — every membership surface (PremiumTeaser,
// PetStudioPro) says "coming soon", so selling a tier here would contradict the
// product's own copy AND charge for benefits that aren't all enforced yet.
// Flip to true only when the canonical price is decided and the UI sells it.
const SUBSCRIPTION_SALES_ENABLED = false;

export async function POST(req: NextRequest) {
  const rl = rateLimit(req, { key: "studio-sub", limit: 10, windowMs: 60_000 });
  if (!rl.ok) return rl.response;

  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!SUBSCRIPTION_SALES_ENABLED) {
    return NextResponse.json(
      { status: "coming_soon", message: "Memberships aren't on sale yet — Studio runs pay-per-creation on credits for now." },
      { status: 202 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const tier = body?.tier as "pro" | "studio";
  const txHash = body?.txHash as string;

  if (tier !== "pro" && tier !== "studio") {
    return NextResponse.json({ error: "tier must be pro or studio" }, { status: 400 });
  }
  if (!txHash || !/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
    return NextResponse.json({ error: "Invalid txHash" }, { status: 400 });
  }

  const price = TIER_LIMITS[tier].pricePerMonthUsd;
  if (price <= 0) return NextResponse.json({ error: "Tier price misconfigured" }, { status: 500 });

  // audit H4: fail closed if treasury isn't configured.
  if (!treasuryConfigured()) {
    return NextResponse.json({ error: "Payments are temporarily unavailable" }, { status: 503 });
  }

  // Replay protection via global ledger (audit C3) with same-user idempotency.
  // (last_payment_tx alone is insufficient — it's overwritten on each renewal.)
  const seen = await prisma.consumedPayment.findUnique({ where: { tx_hash: txHash } });
  if (seen) {
    if (seen.purpose === "subscription" && seen.user_id === user.id) {
      return NextResponse.json({ ok: true, reused: true });
    }
    return NextResponse.json({ error: "Transaction already used" }, { status: 409 });
  }

  const verify = await verifyUsdtTransfer(txHash, user.wallet_address, price);
  if (verify.ok !== true) return NextResponse.json({ error: verify.error }, { status: 400 });

  // Extend or set expires_at — 30 days from now or from existing expiry if still active
  const sub = await prisma.userSubscription.findUnique({ where: { user_id: user.id } });
  const now = new Date();
  const baseDate = sub?.expires_at && sub.expires_at > now ? sub.expires_at : now;
  const newExpiry = new Date(baseDate.getTime() + 30 * 86_400_000);

  let updated;
  try {
    updated = await prisma.$transaction(async (tx) => {
      await consumePaymentTx(tx, {
        txHash,
        userId: user.id,
        purpose: "subscription",
        amountUsd: verify.amount,
      });
      return tx.userSubscription.upsert({
        where: { user_id: user.id },
        create: {
          user_id: user.id, tier, expires_at: newExpiry,
          last_payment_tx: txHash, total_paid_usd: verify.amount,
        },
        update: {
          tier, expires_at: newExpiry,
          last_payment_tx: txHash,
          total_paid_usd: { increment: verify.amount },
        },
      });
    });
  } catch (e) {
    if (e instanceof PaymentAlreadyConsumed) {
      return NextResponse.json({ error: "Transaction already used" }, { status: 409 });
    }
    throw e;
  }

  return NextResponse.json({
    ok: true,
    tier: updated.tier,
    expiresAt: updated.expires_at,
    amountPaid: verify.amount,
  });
}
