/**
 * POST /api/streak/repair
 * Body: { paymentMethod: "credits" }
 *
 * Restores the streak to its pre-break value. Pricing scales with the longest
 * streak that's being recovered (see repairPriceForStreak).
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { getOrCreateStreak, repairPriceForStreak, streakAfterRepair, todayUtcString } from "@/lib/missions/streak";

function diffDays(a: string, b: string) {
  const da = new Date(`${a}T00:00:00Z`).getTime();
  const db = new Date(`${b}T00:00:00Z`).getTime();
  return Math.round((da - db) / 86400000);
}

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const method = String(body.paymentMethod || "credits");
  if (method !== "credits") {
    return NextResponse.json({ error: "Only `credits` is supported in this build" }, { status: 400 });
  }

  const s = await getOrCreateStreak(user.id);
  if (!s.last_completed_date) {
    return NextResponse.json({ error: "No streak to repair" }, { status: 400 });
  }
  const today = todayUtcString();
  const gap = diffDays(today, s.last_completed_date) - 1;
  if (gap < 1) {
    return NextResponse.json({ error: "Streak is not broken" }, { status: 400 });
  }
  if (s.longest_streak < 3) {
    return NextResponse.json({ error: "Streak too short to repair (build it up first!)" }, { status: 400 });
  }

  const price = repairPriceForStreak(s.longest_streak);
  const u = await prisma.user.findUnique({ where: { id: user.id }, select: { credits: true } });
  if (!u || u.credits < price.credits) {
    return NextResponse.json({ error: "Not enough credits", needed: price.credits }, { status: 402 });
  }

  const newStreak = streakAfterRepair(0, s.longest_streak);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { credits: { decrement: price.credits } },
    }),
    prisma.userStreak.update({
      where: { user_id: user.id },
      data: {
        current_streak: newStreak,
        last_completed_date: today,
        pending_apology: false,
        pending_apology_days: 0,
      },
    }),
    prisma.streakPurchase.create({
      data: {
        user_id: user.id,
        kind: price.kind,
        price_usd: price.usd,
        paid_via: "credits",
        paid_credits: price.credits,
        streak_before: s.current_streak,
        streak_after: newStreak,
      },
    }),
  ]);

  return NextResponse.json({
    ok: true,
    streak: newStreak,
    creditsRemaining: u.credits - price.credits,
    price,
  });
}
