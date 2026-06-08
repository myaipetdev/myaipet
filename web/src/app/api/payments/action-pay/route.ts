/**
 * Generic per-action USDT payment receipt.
 *
 *   POST /api/payments/action-pay
 *   { actionKey: "feed_extra", txHash: "0x...", petId?: number }
 *
 * Flow:
 *   1. Client signs ERC-20 transfer of `ACTIONS[actionKey].priceUsd` USDT to Treasury
 *   2. Wallet returns the tx hash
 *   3. Client POSTs here with { actionKey, txHash } before/while calling the
 *      gated action endpoint
 *   4. Server verifies tx on BSC, records PaidAction with that tx_hash
 *   5. Client then calls the actual action endpoint with ?tx_hash=… so
 *      enforcePaywall() finds the receipt and grants access
 *
 * Replay-proof: paid_actions.tx_hash is UNIQUE — same tx can't be consumed twice.
 * Reuses the on-chain verifier already living in /api/credits/purchase.
 */

import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rateLimit";
import { ACTIONS } from "@/lib/paywall";
import { consumePaymentTx, PaymentAlreadyConsumed } from "@/lib/payments";
import { verifyUsdtTransfer, treasuryConfigured, ONCHAIN } from "@/lib/onchain";

export async function POST(req: NextRequest) {
  const rl = rateLimit(req, { key: "action-pay", limit: 20, windowMs: 60_000 });
  if (!rl.ok) return rl.response;

  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { actionKey, txHash, petId } = body;
  const cfg = ACTIONS[actionKey];
  if (!cfg) return NextResponse.json({ error: `Unknown actionKey: ${actionKey}` }, { status: 400 });
  if (cfg.priceUsd <= 0) return NextResponse.json({ error: "This action has no paid tier" }, { status: 400 });
  if (!txHash || !/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
    return NextResponse.json({ error: "Invalid tx hash" }, { status: 400 });
  }

  // audit H4: fail closed if treasury isn't configured.
  if (!treasuryConfigured()) {
    return NextResponse.json({ error: "Payments are temporarily unavailable" }, { status: 503 });
  }

  // Replay prevention via the global ledger (audit C3) with same-user idempotency.
  const seen = await prisma.consumedPayment.findUnique({ where: { tx_hash: txHash } });
  if (seen) {
    if (seen.purpose === "action" && seen.user_id === user.id) {
      const existing = await prisma.paidAction.findUnique({ where: { tx_hash: txHash } });
      if (existing) return NextResponse.json({ ok: true, receipt: existing, reused: true });
    }
    return NextResponse.json({ error: "Transaction already used" }, { status: 409 });
  }

  const verification = await verifyUsdtTransfer(txHash, user.wallet_address, cfg.priceUsd);
  if (verification.ok !== true) {
    return NextResponse.json({ error: verification.error }, { status: 400 });
  }

  let receipt;
  try {
    receipt = await prisma.$transaction(async (tx) => {
      await consumePaymentTx(tx, {
        txHash,
        userId: user.id,
        purpose: "action",
        amountUsd: verification.amount,
      });
      return tx.paidAction.create({
        data: {
          user_id: user.id,
          pet_id: petId ? Number(petId) : null,
          action_key: actionKey,
          amount_usd: verification.amount,
          tx_hash: txHash,
          metadata: { from: verification.from, to: verification.to } as any,
        },
      });
    });
  } catch (e) {
    if (e instanceof PaymentAlreadyConsumed) {
      return NextResponse.json({ error: "Transaction already used" }, { status: 409 });
    }
    throw e;
  }

  return NextResponse.json({ ok: true, receipt });
}

/**
 * GET /api/payments/action-pay?actionKey=... — public action catalog + treasury
 * Used by client paywall modal to know the price + recipient before signing.
 */
export async function GET(req: NextRequest) {
  const actionKey = req.nextUrl.searchParams.get("actionKey");
  if (actionKey) {
    const cfg = ACTIONS[actionKey];
    if (!cfg) return NextResponse.json({ error: "Unknown actionKey" }, { status: 404 });
    return NextResponse.json({
      actionKey, ...cfg,
      treasury: ONCHAIN.treasuryWallet || null,
      usdtAddress: ONCHAIN.usdt.address,
      chainId: ONCHAIN.chainId,
    });
  }
  return NextResponse.json({
    actions: Object.entries(ACTIONS).map(([k, v]) => ({ key: k, ...v })),
    treasury: ONCHAIN.treasuryWallet || null,
    usdtAddress: ONCHAIN.usdt.address,
    chainId: ONCHAIN.chainId,
  });
}
