/**
 * Generic per-action USDT payment receipt.
 *
 *   POST /api/payments/action-pay
 *   { actionKey: "feed_extra", txHash: "0x...", petId: 123 }
 *
 * Flow:
 *   1. Client signs ERC-20 transfer of `ACTIONS[actionKey].priceUsd` USDT to Treasury
 *   2. Wallet returns the tx hash
 *   3. Client POSTs here with { actionKey, txHash } before/while calling the
 *      gated action endpoint
 *   4. Server verifies tx on BSC, records PaidAction with that tx_hash
 *   5. Client then calls the actual action endpoint with ?tx_hash=… so the
 *      failure-atomic action coordinator claims the receipt with the effect
 *
 * Replay-proof: paid_actions.tx_hash is UNIQUE — same tx can't be consumed twice.
 * Reuses the on-chain verifier already living in /api/credits/purchase.
 */

import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rateLimit";
import { ACTIONS } from "@/lib/paywall";
import { recoverActionReceiptWithDb } from "@/lib/actionReceiptRecovery";
import {
  consumePaymentTx,
  PaymentAlreadyConsumed,
  PaymentsPausedError,
} from "@/lib/payments";
import {
  canonicalizePaymentTxHash,
  InvalidPaymentTxHash,
  verifyUsdtTransfer,
  treasuryConfigured,
  ONCHAIN,
} from "@/lib/onchain";

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

  let canonicalTxHash: string;
  try {
    canonicalTxHash = canonicalizePaymentTxHash(txHash);
  } catch (error) {
    if (error instanceof InvalidPaymentTxHash) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }

  // Every action currently in ACTIONS mutates a pet. Bind the financial
  // receipt only to an active pet owned by the authenticated payer.
  const parsedPetId = typeof petId === "number"
    ? petId
    : typeof petId === "string" && /^[1-9][0-9]*$/.test(petId)
      ? Number(petId)
      : Number.NaN;
  if (!Number.isSafeInteger(parsedPetId) || parsedPetId <= 0) {
    return NextResponse.json({ error: "A positive safe-integer petId is required" }, { status: 400 });
  }
  const ownedPet = await prisma.pet.findFirst({
    where: { id: parsedPetId, user_id: user.id, is_active: true },
    select: { id: true },
  });
  if (!ownedPet) {
    return NextResponse.json({ error: "Active pet not found" }, { status: 404 });
  }

  // audit H4: fail closed if treasury isn't configured.
  if (!treasuryConfigured()) {
    return NextResponse.json({ error: "Payments are temporarily unavailable" }, { status: 503 });
  }

  // Replay prevention via the global ledger (audit C3) with same-user idempotency.
  const seen = await prisma.consumedPayment.findUnique({ where: { tx_hash: canonicalTxHash } });
  if (seen) {
    if (seen.purpose === "action" && seen.user_id === user.id) {
      const recovery = await recoverActionReceiptWithDb(prisma, {
        userId: user.id,
        petId: ownedPet.id,
        actionKey,
        txHash: canonicalTxHash,
      });
      if (recovery.kind === "pet_not_found") {
        return NextResponse.json({ error: "Active pet not found" }, { status: 404 });
      }
      if (recovery.kind === "reused" || recovery.kind === "rebound") {
        return NextResponse.json({
          ok: true,
          receipt: recovery.receipt,
          reused: recovery.kind === "reused",
          rebound: recovery.kind === "rebound",
          alreadyApplied: recovery.alreadyApplied,
        });
      }
    }
    return NextResponse.json({ error: "Transaction already used" }, { status: 409 });
  }

  const verification = await verifyUsdtTransfer(canonicalTxHash, user.wallet_address, cfg.priceUsd);
  if (verification.ok !== true) {
    return NextResponse.json({ error: verification.error }, { status: 400 });
  }

  let receipt;
  try {
    receipt = await prisma.$transaction(async (tx) => {
      await consumePaymentTx(tx, {
        txHash: canonicalTxHash,
        userId: user.id,
        purpose: "action",
        amountUsd: verification.amount,
      });
      return tx.paidAction.create({
        data: {
          user_id: user.id,
          pet_id: ownedPet.id,
          action_key: actionKey,
          amount_usd: verification.amount,
          tx_hash: canonicalTxHash,
          metadata: { from: verification.from, to: verification.to } as any,
        },
      });
    });
  } catch (e) {
    if (e instanceof PaymentAlreadyConsumed) {
      return NextResponse.json({ error: "Transaction already used" }, { status: 409 });
    }
    if (e instanceof PaymentsPausedError) {
      return NextResponse.json({ error: e.message }, { status: 503 });
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
  const enabled = treasuryConfigured();
  const actionKey = req.nextUrl.searchParams.get("actionKey");
  if (actionKey) {
    const cfg = ACTIONS[actionKey];
    if (!cfg) return NextResponse.json({ error: "Unknown actionKey" }, { status: 404 });
    return NextResponse.json({
      actionKey, ...cfg,
      paymentsEnabled: enabled,
      treasury: enabled ? ONCHAIN.treasuryWallet : null,
      usdtAddress: enabled ? ONCHAIN.usdt.address : null,
      chainId: ONCHAIN.chainId,
    });
  }
  return NextResponse.json({
    actions: Object.entries(ACTIONS).map(([k, v]) => ({ key: k, ...v })),
    paymentsEnabled: enabled,
    treasury: enabled ? ONCHAIN.treasuryWallet : null,
    usdtAddress: enabled ? ONCHAIN.usdt.address : null,
    chainId: ONCHAIN.chainId,
  });
}
