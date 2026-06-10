/**
 * GET /api/streak — read the user's streak state + pricing for shields/repair.
 *   { current, longest, shields, last_completed_date,
 *     shield: { usd, credits, max_owned, owned },
 *     repair: { applicable, lost_days, kind, usd, credits } | null,
 *     next_milestone, pending_apology }
 */
import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { getOrCreateStreak, todayUtcString, SHIELD_PRICE, SHIELD_MAX_OWNED, repairPriceForStreak, nextMilestone } from "@/lib/missions/streak";

function diffDays(a: string, b: string) {
  const da = new Date(`${a}T00:00:00Z`).getTime();
  const db = new Date(`${b}T00:00:00Z`).getTime();
  return Math.round((da - db) / 86400000);
}

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const s = await getOrCreateStreak(user.id);
  const today = todayUtcString();

  // Repair only applies if streak just broke (current === 0/1 and last date was a while ago).
  // We expose it conservatively: only if current_streak >= 1 was at risk but last_completed_date
  // is older than yesterday. UI surfaces the SKU.
  let repair: any = null;
  if (s.last_completed_date) {
    const gap = diffDays(today, s.last_completed_date) - 1;
    if (gap >= 1 && s.current_streak <= 1 && s.longest_streak >= 3) {
      const price = repairPriceForStreak(s.longest_streak);
      repair = { applicable: true, lost_days: s.longest_streak, ...price };
    }
  }

  return NextResponse.json({
    current: s.current_streak,
    longest: s.longest_streak,
    shields: s.shields_owned,
    last_completed_date: s.last_completed_date,
    shield: { ...SHIELD_PRICE, max_owned: SHIELD_MAX_OWNED, owned: s.shields_owned },
    repair,
    next_milestone: nextMilestone(s.current_streak),
    pending_apology: s.pending_apology,
    pending_apology_days: s.pending_apology_days,
  });
}
