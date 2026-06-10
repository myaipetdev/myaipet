/**
 * GET  /api/subscription/me — read the user's subscription tier (free|pro|studio)
 * POST /api/subscription/me — Body: { plan: "pro"|"studio", txHash, source }
 *
 * For now the POST path is gated to internal use until billing flow is wired.
 * The same UserSubscription table powers both Studio + Mission premium gates.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";

const PRICE_USD: Record<string, number> = { pro: 4.99, studio: 9.99 };

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let sub = await prisma.userSubscription.findUnique({ where: { user_id: user.id } });
  if (!sub) {
    sub = await prisma.userSubscription.create({ data: { user_id: user.id, tier: "free" } });
  }
  let effective = sub.tier;
  if (sub.expires_at && sub.expires_at < new Date() && effective !== "free") {
    effective = "free";
    await prisma.userSubscription.update({ where: { id: sub.id }, data: { tier: "free", expires_at: null } });
  }

  return NextResponse.json({
    tier: effective,
    expires_at: sub.expires_at?.toISOString() || null,
    benefits: benefitsFor(effective),
  });
}

export function benefitsFor(tier: string) {
  if (tier === "studio") return {
    monthly_shields: 999,            // effectively unlimited
    repair_free: true,
    studio_video_limit: 120,
    studio_image_limit: 2000,
    priority_queue: true,
    no_ads: true,
    monthly_credits_drop: 500,
  };
  if (tier === "pro") return {
    monthly_shields: 8,
    repair_free: false,
    studio_video_limit: 30,
    studio_image_limit: 300,
    priority_queue: true,
    no_ads: true,
    monthly_credits_drop: 100,
  };
  return {
    monthly_shields: 1,
    repair_free: false,
    studio_video_limit: 3,
    studio_image_limit: 30,
    priority_queue: false,
    no_ads: false,
    monthly_credits_drop: 0,
  };
}

export async function POST(req: NextRequest) {
  // Body validation but DO NOT actually grant — billing wiring is gated to
  // the Phase 3 follow-up. We return a quote so the UI can render pricing.
  const body = await req.json().catch(() => ({}));
  const plan = String(body.plan || "");
  if (!PRICE_USD[plan]) return NextResponse.json({ error: "Unknown plan" }, { status: 400 });
  return NextResponse.json({
    plan, price_usd: PRICE_USD[plan],
    status: "coming_soon",
    note: "Subscription billing is coming in the next release. For now your free tier covers daily missions and 1 shield/month.",
  }, { status: 202 });
}
