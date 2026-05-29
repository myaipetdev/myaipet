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

const BSC_RPC_URL = "https://bsc-dataseed1.binance.org";
const USDT_CONTRACT = "0x55d398326f99059fF775485246999027B3197955";
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const TREASURY_WALLET = process.env.TREASURY_WALLET || "";

async function verifyUSDT(txHash: string, expectedFrom: string, minAmount: number) {
  const res = await fetch(BSC_RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getTransactionReceipt", params: [txHash] }),
  });
  const j = await res.json();
  const receipt = j.result;
  if (!receipt) return { ok: false as const, error: "Transaction not found — TX may be pending" };
  if (receipt.status !== "0x1") return { ok: false as const, error: "Transaction reverted on-chain" };

  const log = (receipt.logs || []).find((l: any) =>
    l.address.toLowerCase() === USDT_CONTRACT.toLowerCase() &&
    l.topics?.[0] === TRANSFER_TOPIC
  );
  if (!log) return { ok: false as const, error: "No USDT transfer in transaction" };
  const from = "0x" + log.topics[1].slice(26);
  const to = "0x" + log.topics[2].slice(26);
  const amount = Number(BigInt(log.data)) / 1e18;

  if (from.toLowerCase() !== expectedFrom.toLowerCase()) return { ok: false as const, error: "Sender mismatch" };
  if (TREASURY_WALLET && to.toLowerCase() !== TREASURY_WALLET.toLowerCase()) return { ok: false as const, error: "Recipient mismatch" };
  if (amount < minAmount * 0.99) return { ok: false as const, error: `Insufficient: sent ${amount.toFixed(2)} need ${minAmount}` };
  return { ok: true as const, amount };
}

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sub = await getCurrentSubscription(user.id);
  return NextResponse.json(sub);
}

export async function POST(req: NextRequest) {
  const rl = rateLimit(req, { key: "studio-sub", limit: 10, windowMs: 60_000 });
  if (!rl.ok) return rl.response;

  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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

  // Replay protection
  const existing = await prisma.userSubscription.findFirst({ where: { last_payment_tx: txHash } });
  if (existing) {
    if (existing.user_id !== user.id) {
      return NextResponse.json({ error: "Transaction already used by another account" }, { status: 409 });
    }
    return NextResponse.json({ ok: true, reused: true });
  }

  const verify = await verifyUSDT(txHash, user.wallet_address, price);
  if (!verify.ok) return NextResponse.json({ error: verify.error }, { status: 400 });

  // Extend or set expires_at — 30 days from now or from existing expiry if still active
  const sub = await prisma.userSubscription.findUnique({ where: { user_id: user.id } });
  const now = new Date();
  const baseDate = sub?.expires_at && sub.expires_at > now ? sub.expires_at : now;
  const newExpiry = new Date(baseDate.getTime() + 30 * 86_400_000);

  const updated = await prisma.userSubscription.upsert({
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

  return NextResponse.json({
    ok: true,
    tier: updated.tier,
    expiresAt: updated.expires_at,
    amountPaid: verify.amount,
  });
}
