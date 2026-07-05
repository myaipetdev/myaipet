/**
 * POST /api/webhooks/paddle — Paddle Billing event sink.
 *
 * Verifies the `Paddle-Signature` HMAC over the RAW body, then on a completed
 * transaction maps the purchased price id → credit plan and grants idempotently
 * (the Paddle txn id is claimed in the shared payment ledger, so retries are safe).
 * ENV-GATED via verifyPaddleSignature (fails closed if PADDLE_* unset).
 *
 * Register this URL in Paddle → Notifications. Must read the raw body for the
 * signature, so we do NOT use req.json() before verifying.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  verifyPaddleSignature,
  planForPriceId,
  grantCardCredits,
  PaymentAlreadyConsumed,
} from "@/lib/paddle";

export async function POST(req: NextRequest) {
  const raw = await req.text();
  const sig = req.headers.get("paddle-signature");

  if (!verifyPaddleSignature(raw, sig)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: any;
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Bad JSON" }, { status: 400 });
  }

  // Only completed transactions grant. Everything else is acked (200) so Paddle
  // doesn't retry events we intentionally ignore.
  if (event?.event_type !== "transaction.completed") {
    return NextResponse.json({ ok: true, ignored: event?.event_type ?? "unknown" });
  }

  const data = event.data ?? {};
  const paddleTxnId: string | undefined = data.id;
  const userId = Number(data.custom_data?.user_id);
  const priceId: string | undefined = data.items?.[0]?.price?.id;

  if (!paddleTxnId || !Number.isInteger(userId) || !priceId) {
    // Ack so Paddle stops retrying a shape we can't act on, but log for triage.
    console.warn("[paddle] completed txn missing fields", { paddleTxnId, userId, priceId });
    return NextResponse.json({ ok: true, skipped: "missing_fields" });
  }

  const plan = planForPriceId(priceId);
  if (!plan) {
    console.warn("[paddle] no plan mapped for price", priceId);
    return NextResponse.json({ ok: true, skipped: "unmapped_price" });
  }

  try {
    await prisma.$transaction((tx) => grantCardCredits(tx, { paddleTxnId, userId, plan }));
  } catch (e) {
    if (e instanceof PaymentAlreadyConsumed) {
      // Duplicate delivery — already granted. Ack so Paddle stops retrying.
      return NextResponse.json({ ok: true, duplicate: true });
    }
    console.error("[paddle] grant failed", e);
    return NextResponse.json({ error: "Grant failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, granted: plan.credits });
}
