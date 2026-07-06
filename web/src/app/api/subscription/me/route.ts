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

// HONESTY: only list benefits the server actually enforces. The old
// monthly_shields / repair_free / priority_queue / no_ads / monthly_credits_drop
// fields had NO granting or reading code anywhere — advertising them was a
// promise without a handler. The Studio quotas are the two real enforced limits.
export function benefitsFor(tier: string) {
  if (tier === "studio") return { studio_video_limit: 120, studio_image_limit: 2000 };
  if (tier === "pro") return { studio_video_limit: 30, studio_image_limit: 300 };
  return { studio_video_limit: 3, studio_image_limit: 30 };
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
    note: "Membership billing isn't live yet — daily missions and Studio pay-per-creation are fully available on the free tier.",
  }, { status: 202 });
}
