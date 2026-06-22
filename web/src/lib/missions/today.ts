/**
 * "Today" view assembler — used by GET /api/missions/today.
 *
 * For a given user:
 *   1. Look up today's daily_missions rows; if none, materialise the 5-pick
 *      via pickDailyMissionIds.
 *   2. For each PENDING mission whose template is auto-verified, run the
 *      check predicate. If it returns true, atomically flip status →
 *      completed and bump UserStreak via the streak engine.
 *   3. Return a serialisable shape consumed by the home Mission card.
 */

import { prisma } from "@/lib/prisma";
import { getMission, MISSION_CATALOG, pickDailyMissionIds, type MissionTemplate } from "./catalog";
import { recordCompletionForStreakBookkeeping, todayUtcString, getOrCreateStreak, nextMilestone } from "./streak";

export interface MissionView {
  id: string;
  category: string;
  title: string;
  description: string;
  points: number;
  status: "pending" | "completed";
  cta: { label: string; href: string } | null;
  verifier: "auto" | "manual";
  completed_at: string | null;
}

export interface TodayResponse {
  date: string;                // YYYY-MM-DD UTC
  missions: MissionView[];
  earnedToday: number;
  remainingToday: number;
  bonusAllComplete: number;    // bonus pts for clearing 5/5
  streak: {
    current: number;
    longest: number;
    shields: number;
    next_milestone: number | null;
    pending_apology: boolean;
    pending_apology_days: number;
  };
}

const BONUS_ALL_COMPLETE = 25;
const ALL_COMPLETE_GUARD_KEY = "daily_all_complete_bonus";

/**
 * Credit the "all daily missions complete" +25 bonus — ONCE per user per UTC day.
 *
 * Idempotency: we reuse the DailyActionCount table as a per-user/day flag. The
 * row's composite unique (user_id, action_key, day) means createMany w/
 * skipDuplicates lets exactly one caller win; the grant only fires when that
 * insert actually created a row. This guards against:
 *   - double-grant across the two completion paths (auto-verify in
 *     getOrAssignToday + manual /complete route), and
 *   - re-grant on every subsequent today-fetch once 5/5 is reached.
 *
 * Returns true iff the bonus was credited on THIS call.
 */
export async function tryGrantAllCompleteBonus(userId: number, date: string): Promise<boolean> {
  // Only grant when all of today's missions are actually completed.
  const rows = await prisma.dailyMission.findMany({
    where: { user_id: userId, date },
    select: { status: true },
  });
  if (rows.length === 0 || !rows.every(r => r.status === "completed")) return false;

  return prisma.$transaction(async (tx: any) => {
    // Atomic claim of the per-user/day flag — skipDuplicates means the row is
    // inserted at most once, so count===1 only for the winning caller.
    const claim = await tx.dailyActionCount.createMany({
      data: [{ user_id: userId, action_key: ALL_COMPLETE_GUARD_KEY, day: date, count: 1 }],
      skipDuplicates: true,
    });
    if (claim.count !== 1) return false; // already granted today
    await tx.user.update({
      where: { id: userId },
      data: { season_points: { increment: BONUS_ALL_COMPLETE } },
    });
    await tx.userStreak.upsert({
      where: { user_id: userId },
      update: { total_points_earned: { increment: BONUS_ALL_COMPLETE } },
      create: { user_id: userId, total_points_earned: BONUS_ALL_COMPLETE },
    });
    return true;
  });
}

/** Has the all-complete bonus already been credited for this user/day? */
export async function allCompleteBonusGranted(userId: number, date: string): Promise<boolean> {
  const row = await prisma.dailyActionCount.findUnique({
    where: { user_action_day: { user_id: userId, action_key: ALL_COMPLETE_GUARD_KEY, day: date } },
    select: { id: true },
  });
  return !!row;
}

export async function getOrAssignToday(userId: number): Promise<TodayResponse> {
  const date = todayUtcString();

  // Materialise the day's 5 missions if needed
  const existing = await prisma.dailyMission.findMany({
    where: { user_id: userId, date },
  });

  let assigned = existing;
  if (existing.length === 0) {
    const ids = pickDailyMissionIds(userId, date);
    const rows = ids.map(id => {
      const tpl = getMission(id);
      if (!tpl) return null;
      return {
        user_id: userId,
        date,
        mission_id: id,
        category: tpl.category,
        title: tpl.title,
        points: tpl.points,
        status: "pending" as const,
      };
    }).filter(Boolean) as any[];

    await prisma.dailyMission.createMany({ data: rows, skipDuplicates: true });
    assigned = await prisma.dailyMission.findMany({
      where: { user_id: userId, date },
    });
  }

  // Auto-verify pending auto missions
  let anyFlipped = false;
  for (const row of assigned) {
    if (row.status === "completed") continue;
    const tpl: MissionTemplate | undefined = getMission(row.mission_id);
    if (!tpl || tpl.verifier !== "auto" || !tpl.check) continue;
    try {
      const passed = await tpl.check(userId, date);
      if (passed) {
        // Atomic claim: the flip only matches while not yet completed, so two
        // concurrent today-fetches can't both grant the points (was a racy
        // read-then-write across three un-transacted writes).
        const flipped = await prisma.$transaction(async (tx: any) => {
          const f = await tx.dailyMission.updateMany({
            where: { user_id: userId, date, mission_id: row.mission_id, status: { not: "completed" } },
            data: { status: "completed", completed_at: new Date() },
          });
          if (f.count !== 1) return false;
          await tx.user.update({
            where: { id: userId },
            data: { season_points: { increment: row.points } },
          });
          await tx.userStreak.upsert({
            where: { user_id: userId },
            update: { total_points_earned: { increment: row.points } },
            create: { user_id: userId, total_points_earned: row.points },
          });
          return true;
        });
        if (flipped) anyFlipped = true;
      }
    } catch { /* skip — never fail the GET on a bad mission */ }
  }

  if (anyFlipped) {
    await recordCompletionForStreakBookkeeping(userId);
    assigned = await prisma.dailyMission.findMany({
      where: { user_id: userId, date },
    });
  }

  const streak = await getOrCreateStreak(userId);

  // Project to view
  let earned = 0;
  let remaining = 0;
  const missions: MissionView[] = assigned.map(row => {
    const tpl = getMission(row.mission_id);
    const completed = row.status === "completed";
    if (completed) earned += row.points;
    else remaining += row.points;
    return {
      id: row.mission_id,
      category: row.category,
      title: row.title,
      description: tpl?.description ?? "",
      points: row.points,
      status: completed ? "completed" : "pending",
      cta: tpl?.cta || null,
      verifier: tpl?.verifier || "manual",
      completed_at: row.completed_at?.toISOString() || null,
    };
  });

  const allComplete = missions.length > 0 && missions.every(m => m.status === "completed");
  if (allComplete) {
    // Credit the +25 bonus for real (idempotent). The displayed earnedToday
    // total must equal what we actually grant — so we add the bonus to the
    // shown total only once 5/5 is reached, which is exactly when the guarded
    // grant succeeds (or has already succeeded earlier today).
    await tryGrantAllCompleteBonus(userId, date);
    earned += BONUS_ALL_COMPLETE;
  }

  return {
    date,
    missions: missions.sort((a, b) => {
      const ao = a.status === "pending" ? 0 : 1;
      const bo = b.status === "pending" ? 0 : 1;
      if (ao !== bo) return ao - bo;
      return b.points - a.points;
    }),
    earnedToday: earned,
    remainingToday: remaining,
    bonusAllComplete: BONUS_ALL_COMPLETE,
    streak: {
      current: streak.current_streak,
      longest: streak.longest_streak,
      shields: streak.shields_owned,
      next_milestone: nextMilestone(streak.current_streak),
      pending_apology: streak.pending_apology,
      pending_apology_days: streak.pending_apology_days,
    },
  };
}
