/**
 * POST /api/checkout/paddle  { plan: "starter" | "creator" | "pro" }
 *
 * Returns the config the client (Paddle.js) needs to open a hosted checkout for a
 * credit pack, tagging the transaction with the user id via custom_data so the
 * webhook can grant to the right account. ENV-GATED: 503 until Paddle is
 * configured (see docs/PAYMENTS-AUTH-SETUP.md) — we never open a dead checkout.
 */
import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { rateLimit } from "@/lib/rateLimit";
import { paddleConfig, priceIdForPlan, CARD_PLANS } from "@/lib/paddle";

export async function POST(req: NextRequest) {
  const cfg = paddleConfig();
  if (!cfg) {
    return NextResponse.json(
      { error: "Card payments are not enabled yet.", code: "PADDLE_DISABLED" },
      { status: 503 },
    );
  }

  const rl = rateLimit(req, { key: "checkout-paddle", limit: 20, windowMs: 60_000 });
  if (!rl.ok) return rl.response;

  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const plan = CARD_PLANS.find((p) => p.key === body?.plan);
  if (!plan) {
    return NextResponse.json(
      { error: `Invalid plan: ${CARD_PLANS.map((p) => p.key).join(", ")}` },
      { status: 400 },
    );
  }
  const priceId = priceIdForPlan(plan.key);
  if (!priceId) {
    return NextResponse.json(
      { error: `Plan ${plan.key} has no Paddle price configured.`, code: "PRICE_UNCONFIGURED" },
      { status: 503 },
    );
  }

  // Paddle.js opens the overlay client-side with these; custom_data.user_id ties
  // the resulting transaction back to this account for the webhook grant.
  return NextResponse.json({
    clientToken: cfg.clientToken,
    environment: cfg.env,
    priceId,
    quantity: 1,
    customData: { user_id: user.id, plan: plan.key },
    grants: { credits: plan.credits, priceUsd: plan.priceUsd },
  });
}
