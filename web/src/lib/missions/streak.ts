/**
 * Streak engine — UTC-day-based mission streak.
 *
 * "Today is alive" = the user has completed ≥1 daily mission with status
 * 'completed' and completed_at within the current UTC day.
 *
 * Streak rules:
 *   - +1 if today is alive and last_completed_date == yesterday
 *   - +1 if today is alive and last_completed_date == null/first ever
 *   - reset to 1 if today is alive but last_completed_date < yesterday (gap)
 *     UNLESS a shield is auto-consumed to bridge a single-day gap
 *   - Streak holds (no change) for today if today already counted
 *
 * Shields:
 *   - bridge a single-day gap. Auto-consumed when a gap is detected and the
 *     user has shields_owned > 0.
 *
 * Repairs:
 *   - paid recovery for missed streaks of N days. Sets current_streak back
 *     to what it was N days ago + 1 (because today counts too).
 */

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export type LockedStreakOwner = {
  id: number;
  credits: number;
};

export type LockedUserStreak = {
  user_id: number;
  current_streak: number;
  longest_streak: number;
  last_completed_date: string | null;
  shields_owned: number;
  shields_used: number;
  last_shield_used_at: Date | null;
  total_missions_done: number;
  total_points_earned: number;
  pending_apology: boolean;
  pending_apology_days: number;
  updated_at: Date;
};

/**
 * Canonical lock order for every mutation that combines a wallet balance with
 * mission-streak state: users first, user_streaks second. Keeping both the paid
 * purchase routes and the completion writer on this order prevents deadlocks
 * and stops a stale completion write from erasing a paid repair.
 */
export async function lockStreakOwnerAndState(
  tx: Prisma.TransactionClient,
  userId: number,
): Promise<{ owner: LockedStreakOwner; streak: LockedUserStreak }> {
  const owners = await tx.$queryRaw<LockedStreakOwner[]>`
    SELECT "id", "credits"
    FROM "users"
    WHERE "id" = ${userId}
    FOR UPDATE
  `;
  const owner = owners[0];
  if (!owner) throw new Error("Streak owner not found");

  await tx.userStreak.upsert({
    where: { user_id: userId },
    create: { user_id: userId },
    update: {},
    select: { user_id: true },
  });
  const streaks = await tx.$queryRaw<LockedUserStreak[]>`
    SELECT
      "user_id", "current_streak", "longest_streak", "last_completed_date",
      "shields_owned", "shields_used", "last_shield_used_at",
      "total_missions_done", "total_points_earned", "pending_apology",
      "pending_apology_days", "updated_at"
    FROM "user_streaks"
    WHERE "user_id" = ${userId}
    FOR UPDATE
  `;
  const streak = streaks[0];
  if (!streak) throw new Error("Streak row lock failed");
  return { owner, streak };
}

export function todayUtcString(): string {
  return new Date().toISOString().slice(0, 10);
}

export function offsetDateString(daysFromToday: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysFromToday);
  return d.toISOString().slice(0, 10);
}

function diffDays(a: string, b: string): number {
  // Days from b → a (positive if a > b)
  const da = new Date(`${a}T00:00:00.000Z`).getTime();
  const db = new Date(`${b}T00:00:00.000Z`).getTime();
  return Math.round((da - db) / 86400000);
}

/** Read-only view of the user's streak state. Creates a row if missing. */
export async function getOrCreateStreak(userId: number) {
  return prisma.userStreak.upsert({
    where: { user_id: userId },
    create: { user_id: userId },
    update: {},
  });
}

/**
 * Called after a mission completion. Advances the streak, consumes a shield
 * if a single-day gap was bridged, and stamps `last_completed_date = today`.
 * Idempotent — calling twice on the same day is a no-op.
 */
export async function recordCompletionForStreakBookkeeping(userId: number) {
  const today = todayUtcString();
  return prisma.$transaction(async (tx) => {
    const { streak: s } = await lockStreakOwnerAndState(tx, userId);

    // Same day → only bump totals, leave streak alone.
    if (s.last_completed_date === today) {
      await tx.userStreak.update({
        where: { user_id: userId },
        data: {
          total_missions_done: { increment: 1 },
          updated_at: new Date(),
        },
      });
      return { streak: s.current_streak, shieldUsed: false, newPeakReached: false };
    }

    const yesterday = offsetDateString(-1);
    let newStreak = s.current_streak;
    let shieldUsed = false;
    let pendingApologyDays = s.pending_apology_days;
    let pendingApology = s.pending_apology;

    if (!s.last_completed_date) {
      // First-ever completion
      newStreak = 1;
    } else if (s.last_completed_date === yesterday) {
      // Continuous
      newStreak = s.current_streak + 1;
    } else {
      // Gap detected
      const gap = diffDays(today, s.last_completed_date) - 1; // days missed
      if (gap === 1 && s.shields_owned > 0) {
        // Single-day gap bridged by shield
        newStreak = s.current_streak + 1;
        shieldUsed = true;
      } else {
        // Streak resets. Mark pending apology so the pet can react next chat.
        newStreak = 1;
        pendingApology = true;
        pendingApologyDays = gap;
      }
    }

    const longest = Math.max(s.longest_streak, newStreak);

    await tx.userStreak.update({
      where: { user_id: userId },
      data: {
        current_streak: newStreak,
        longest_streak: longest,
        last_completed_date: today,
        shields_owned: shieldUsed ? { decrement: 1 } : undefined,
        shields_used: shieldUsed ? { increment: 1 } : undefined,
        last_shield_used_at: shieldUsed ? new Date() : undefined,
        pending_apology: pendingApology,
        pending_apology_days: pendingApologyDays,
        total_missions_done: { increment: 1 },
        updated_at: new Date(),
      },
    });

    const newPeakReached = newStreak > s.longest_streak && newStreak > 1;
    return { streak: newStreak, shieldUsed, newPeakReached };
  });
}

/** Tiered repair pricing (USD). UI calls into this to render the right SKU. */
export function repairPriceForStreak(lost: number): { kind: string; usd: number; credits: number } {
  if (lost <= 0) return { kind: "repair-noop", usd: 0, credits: 0 };
  if (lost < 7)     return { kind: "repair-1d",   usd: 0.99,  credits: 100  };
  if (lost < 30)    return { kind: "repair-7d",   usd: 4.99,  credits: 500  };
  if (lost < 100)   return { kind: "repair-30d",  usd: 9.99,  credits: 1000 };
  if (lost < 365)   return { kind: "repair-100d", usd: 19.99, credits: 2000 };
  return                 { kind: "repair-365d",  usd: 49.99, credits: 5000 };
}

export const SHIELD_PRICE = { usd: 0.99, credits: 100 };
export const SHIELD_MAX_OWNED = 3;

/** Returns the streak that should be restored after a repair. */
export function streakAfterRepair(currentStreakBefore: number, lostDays: number): number {
  // For most repairs we bring back exactly what was lost + 1 (today counts).
  return currentStreakBefore + lostDays + 1;
}

/** Mission system milestone tiers — used for badge celebration. */
export const STREAK_MILESTONES = [3, 7, 14, 30, 50, 100, 200, 365, 500, 1000];

export function nextMilestone(streak: number): number | null {
  for (const m of STREAK_MILESTONES) if (m > streak) return m;
  return null;
}
