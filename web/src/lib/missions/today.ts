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
            data: { airdrop_points: { increment: row.points } },
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
  if (allComplete) earned += BONUS_ALL_COMPLETE;

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
