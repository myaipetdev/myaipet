/**
 * POST /api/streak/shield/buy
 * Body: { paymentMethod: "credits" }   (USDT/token paths added in Phase 3)
 *
 * Debits credits, increments shields_owned (cap at SHIELD_MAX_OWNED), and
 * stamps a streak_purchases row.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { getOrCreateStreak, SHIELD_PRICE, SHIELD_MAX_OWNED } from "@/lib/missions/streak";

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const method = String(body.paymentMethod || "credits");
  if (method !== "credits") {
    return NextResponse.json({ error: "Only `credits` is supported in this build" }, { status: 400 });
  }

  const s = await getOrCreateStreak(user.id);
  if (s.shields_owned >= SHIELD_MAX_OWNED) {
    return NextResponse.json({ error: `Shield inventory full (${SHIELD_MAX_OWNED})` }, { status: 400 });
  }

  // Guarded decrement (audit H17): the balance check and the debit are ONE
  // atomic statement, so concurrent buys can't race a balance negative.
  const after = await prisma.$transaction(async (tx) => {
    const dec = await tx.user.updateMany({
      where: { id: user.id, credits: { gte: SHIELD_PRICE.credits } },
      data: { credits: { decrement: SHIELD_PRICE.credits } },
    });
    if (dec.count === 0) return null; // insufficient credits
    await tx.userStreak.update({
      where: { user_id: user.id },
      data: { shields_owned: { increment: 1 } },
    });
    await tx.streakPurchase.create({
      data: {
        user_id: user.id,
        kind: "shield",
        price_usd: SHIELD_PRICE.usd,
        paid_via: "credits",
        paid_credits: SHIELD_PRICE.credits,
        streak_before: s.current_streak,
        streak_after: s.current_streak,
      },
    });
    const fresh = await tx.user.findUnique({ where: { id: user.id }, select: { credits: true } });
    return fresh?.credits ?? 0;
  });
  if (after === null) {
    return NextResponse.json({ error: "Not enough credits" }, { status: 402 });
  }

  return NextResponse.json({
    ok: true,
    shieldsOwned: s.shields_owned + 1,
    creditsRemaining: after,
  });
}
