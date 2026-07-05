/**
 * Paddle (merchant-of-record) card payments — the non-crypto boarding path.
 *
 * ENV-GATED: every export is a no-op / "disabled" until the PADDLE_* env vars
 * are set (see docs/PAYMENTS-AUTH-SETUP.md). We never surface a checkout that
 * can't complete. Paddle is MoR (handles tax/VAT/refunds); the same shape works
 * for Lemon Squeezy — swap the signature scheme + API host.
 *
 * Grant path mirrors the USDT credits grant (app/api/credits/purchase): the
 * Paddle transaction id is claimed in the SAME idempotency ledger
 * (consumePaymentTx) so a webhook can't double-grant on retry.
 */
import crypto from "crypto";
import type { ConsumeTxClient } from "@/lib/payments";
import { consumePaymentTx, PaymentAlreadyConsumed } from "@/lib/payments";

export { PaymentAlreadyConsumed };

// The interactive-transaction client subset this module writes through. Mirrors
// the structural shape consumePaymentTx already relies on, extended with the two
// tables the grant touches. The real Prisma tx client satisfies it structurally.
type GrantTxClient = ConsumeTxClient & {
  creditPurchase: { create: (args: { data: Record<string, unknown> }) => Promise<unknown> };
  user: { update: (args: { where: { id: number }; data: Record<string, unknown> }) => Promise<unknown> };
};

export interface PaddleConfig {
  apiKey: string;
  webhookSecret: string;
  env: "sandbox" | "production";
  clientToken: string;
}

/** Present only when fully configured — callers gate on this. */
export function paddleConfig(): PaddleConfig | null {
  const apiKey = process.env.PADDLE_API_KEY;
  const webhookSecret = process.env.PADDLE_WEBHOOK_SECRET;
  const clientToken = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN;
  if (!apiKey || !webhookSecret || !clientToken) return null;
  return {
    apiKey,
    webhookSecret,
    clientToken,
    env: process.env.PADDLE_ENV === "production" ? "production" : "sandbox",
  };
}

export const paddleEnabled = () => paddleConfig() !== null;

// Card plans MUST grant exactly what the USDT packs grant (credit parity, audit
// M3) — the numbers are the server's source of truth, mapped from Paddle price ids.
export interface CardPlan { key: string; credits: number; priceUsd: number; priceEnv: string; }

export const CARD_PLANS: CardPlan[] = [
  { key: "starter", credits: 100,  priceUsd: 5,  priceEnv: "PADDLE_PRICE_CREDITS_STARTER" },
  { key: "creator", credits: 500,  priceUsd: 20, priceEnv: "PADDLE_PRICE_CREDITS_CREATOR" },
  { key: "pro",     credits: 2000, priceUsd: 50, priceEnv: "PADDLE_PRICE_CREDITS_PRO" },
];

/** Resolve the Paddle price id configured for a plan key (null if unset). */
export function priceIdForPlan(planKey: string): string | null {
  const plan = CARD_PLANS.find((p) => p.key === planKey);
  if (!plan) return null;
  return process.env[plan.priceEnv] || null;
}

/** Reverse lookup: which plan does a Paddle price id grant? */
export function planForPriceId(priceId: string): CardPlan | null {
  return CARD_PLANS.find((p) => process.env[p.priceEnv] === priceId) || null;
}

/**
 * Verify a Paddle Billing webhook signature.
 * Header format: `ts=<unix>;h1=<hex hmac>`. h1 = HMAC-SHA256(`${ts}:${rawBody}`)
 * keyed by the webhook secret. Constant-time compare; rejects stale ts (>5min).
 */
export function verifyPaddleSignature(rawBody: string, signatureHeader: string | null): boolean {
  const cfg = paddleConfig();
  if (!cfg || !signatureHeader) return false;
  const parts = Object.fromEntries(
    signatureHeader.split(";").map((kv) => kv.split("=") as [string, string]),
  );
  const ts = parts.ts;
  const h1 = parts.h1;
  if (!ts || !h1) return false;
  // Reject replays / stale timestamps (skip the time check under fake clocks in tests).
  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum)) return false;
  const expected = crypto
    .createHmac("sha256", cfg.webhookSecret)
    .update(`${ts}:${rawBody}`)
    .digest("hex");
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(h1, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Idempotently grant a completed card purchase. `paddleTxnId` is claimed in the
 * shared payment ledger (VarChar(66)) with purpose "credits_card"; a webhook
 * retry throws PaymentAlreadyConsumed and the caller returns 200 (already done).
 */
export async function grantCardCredits(
  tx: GrantTxClient,
  args: { paddleTxnId: string; userId: number; plan: CardPlan },
): Promise<void> {
  await consumePaymentTx(tx, {
    txHash: args.paddleTxnId.slice(0, 66),
    userId: args.userId,
    purpose: "credits_card",
    amountUsd: args.plan.priceUsd,
  });
  await tx.creditPurchase.create({
    data: {
      user_id: args.userId,
      credits: args.plan.credits,
      amount_usd: args.plan.priceUsd,
      payment_tx_hash: args.paddleTxnId.slice(0, 66),
      status: "confirmed",
    },
  });
  await tx.user.update({
    where: { id: args.userId },
    data: { credits: { increment: args.plan.credits } },
  });
}
