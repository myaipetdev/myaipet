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

const BSC_RPC_URL = "https://bsc-dataseed1.binance.org";
const USDT_CONTRACT = "0x55d398326f99059fF775485246999027B3197955";
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const TREASURY_WALLET = process.env.TREASURY_WALLET || "";

async function verifyUSDTTransfer(txHash: string, expectedFrom: string, minAmount: number):
  Promise<{ ok: true; from: string; to: string; amount: number } | { ok: false; error: string }>
{
  try {
    const res = await fetch(BSC_RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getTransactionReceipt", params: [txHash] }),
    });
    const json = await res.json();
    const receipt = json.result;
    if (!receipt) return { ok: false, error: "Transaction receipt not found — TX may be pending" };
    if (receipt.status !== "0x1") return { ok: false, error: "Transaction reverted on-chain" };

    const transferLog = (receipt.logs || []).find((log: any) =>
      log.address.toLowerCase() === USDT_CONTRACT.toLowerCase() &&
      log.topics?.[0] === TRANSFER_TOPIC
    );
    if (!transferLog) return { ok: false, error: "No USDT transfer found in transaction" };

    const from = "0x" + transferLog.topics[1].slice(26);
    const to = "0x" + transferLog.topics[2].slice(26);
    const amount = Number(BigInt(transferLog.data)) / 1e18;

    if (from.toLowerCase() !== expectedFrom.toLowerCase()) {
      return { ok: false, error: "Transaction sender does not match your wallet" };
    }
    if (TREASURY_WALLET && to.toLowerCase() !== TREASURY_WALLET.toLowerCase()) {
      return { ok: false, error: "Payment was not sent to the configured treasury" };
    }
    if (amount < minAmount * 0.99) {
      return { ok: false, error: `Insufficient amount: sent ${amount.toFixed(4)} USDT, required ${minAmount}` };
    }
    return { ok: true, from, to, amount };
  } catch (e: any) {
    console.error("[action-pay] verification failed:", e?.message);
    return { ok: false, error: "Failed to verify transaction on-chain" };
  }
}

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

  // Replay prevention
  const existing = await prisma.paidAction.findUnique({ where: { tx_hash: txHash } });
  if (existing) {
    if (existing.user_id !== user.id) {
      return NextResponse.json({ error: "Transaction already claimed by another account" }, { status: 409 });
    }
    // Idempotent: return existing receipt
    return NextResponse.json({ ok: true, receipt: existing, reused: true });
  }

  const verification = await verifyUSDTTransfer(txHash, user.wallet_address, cfg.priceUsd);
  if (verification.ok !== true) {
    return NextResponse.json({ error: verification.error }, { status: 400 });
  }

  const burnAmount = Math.round(verification.amount * 100 * 0.5) / 100;  // 50% burn earmark
  const receipt = await prisma.paidAction.create({
    data: {
      user_id: user.id,
      pet_id: petId ? Number(petId) : null,
      action_key: actionKey,
      amount_usd: verification.amount,
      tx_hash: txHash,
      burn_amount: burnAmount,
      metadata: { from: verification.from, to: verification.to } as any,
    },
  });

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
      treasury: TREASURY_WALLET || null,
      usdtAddress: USDT_CONTRACT,
      chainId: 56,
    });
  }
  return NextResponse.json({
    actions: Object.entries(ACTIONS).map(([k, v]) => ({ key: k, ...v })),
    treasury: TREASURY_WALLET || null,
    usdtAddress: USDT_CONTRACT,
    chainId: 56,
  });
}
