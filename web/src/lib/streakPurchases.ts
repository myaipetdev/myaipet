import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  lockStreakOwnerAndState,
  repairPriceForStreak,
  SHIELD_MAX_OWNED,
  SHIELD_PRICE,
  streakAfterRepair,
} from "@/lib/missions/streak";

type StreakPurchaseDb = {
  $transaction<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T>;
};

export class StreakStateConflictError extends Error {
  constructor() {
    super("Streak state changed; refresh and try again");
    this.name = "StreakStateConflictError";
  }
}

export class StreakShieldInventoryFullError extends Error {
  constructor(readonly maxOwned = SHIELD_MAX_OWNED) {
    super(`Shield inventory full (${maxOwned})`);
    this.name = "StreakShieldInventoryFullError";
  }
}

export class StreakInsufficientCreditsError extends Error {
  constructor(readonly required: number, readonly available: number) {
    super("Not enough credits");
    this.name = "StreakInsufficientCreditsError";
  }
}

export type StreakRepairUnavailableReason = "no_streak" | "not_broken" | "too_short";

export class StreakRepairUnavailableError extends Error {
  constructor(readonly reason: StreakRepairUnavailableReason) {
    super(
      reason === "no_streak"
        ? "No streak to repair"
        : reason === "too_short"
          ? "Streak too short to repair (build it up first!)"
          : "Streak is not broken",
    );
    this.name = "StreakRepairUnavailableError";
  }
}

function sameVersion(actual: Date, expected: Date): boolean {
  return Number.isFinite(expected.getTime()) && actual.getTime() === expected.getTime();
}

function diffDays(a: string, b: string): number {
  const da = new Date(`${a}T00:00:00Z`).getTime();
  const db = new Date(`${b}T00:00:00Z`).getTime();
  return Math.round((da - db) / 86_400_000);
}

export async function buyStreakShieldWithDb(
  db: StreakPurchaseDb,
  input: { userId: number; expectedUpdatedAt: Date },
) {
  return db.$transaction(async (tx) => {
    const { owner, streak } = await lockStreakOwnerAndState(tx, input.userId);
    if (!sameVersion(streak.updated_at, input.expectedUpdatedAt)) {
      throw new StreakStateConflictError();
    }
    if (streak.shields_owned >= SHIELD_MAX_OWNED) {
      throw new StreakShieldInventoryFullError();
    }
    if (owner.credits < SHIELD_PRICE.credits) {
      throw new StreakInsufficientCreditsError(SHIELD_PRICE.credits, owner.credits);
    }

    const now = new Date();
    const updatedUser = await tx.user.update({
      where: { id: input.userId },
      data: { credits: { decrement: SHIELD_PRICE.credits } },
      select: { credits: true },
    });
    const updatedStreak = await tx.userStreak.update({
      where: { user_id: input.userId },
      data: { shields_owned: { increment: 1 }, updated_at: now },
      select: { shields_owned: true },
    });
    await tx.streakPurchase.create({
      data: {
        user_id: input.userId,
        kind: "shield",
        price_usd: SHIELD_PRICE.usd,
        paid_via: "credits",
        paid_credits: SHIELD_PRICE.credits,
        streak_before: streak.current_streak,
        streak_after: streak.current_streak,
      },
      select: { id: true },
    });

    return {
      shieldsOwned: updatedStreak.shields_owned,
      creditsRemaining: updatedUser.credits,
    };
  });
}

export function buyStreakShield(input: { userId: number; expectedUpdatedAt: Date }) {
  return buyStreakShieldWithDb(prisma, input);
}

export async function repairStreakWithDb(
  db: StreakPurchaseDb,
  input: { userId: number; expectedUpdatedAt: Date; today: string },
) {
  return db.$transaction(async (tx) => {
    const { owner, streak } = await lockStreakOwnerAndState(tx, input.userId);
    if (!sameVersion(streak.updated_at, input.expectedUpdatedAt)) {
      throw new StreakStateConflictError();
    }
    if (!streak.last_completed_date) {
      throw new StreakRepairUnavailableError("no_streak");
    }
    const gap = diffDays(input.today, streak.last_completed_date) - 1;
    if (gap < 1) {
      throw new StreakRepairUnavailableError("not_broken");
    }
    if (streak.longest_streak < 3) {
      throw new StreakRepairUnavailableError("too_short");
    }

    const price = repairPriceForStreak(streak.longest_streak);
    if (owner.credits < price.credits) {
      throw new StreakInsufficientCreditsError(price.credits, owner.credits);
    }
    const newStreak = streakAfterRepair(0, streak.longest_streak);
    const now = new Date();

    const updatedUser = await tx.user.update({
      where: { id: input.userId },
      data: { credits: { decrement: price.credits } },
      select: { credits: true },
    });
    await tx.userStreak.update({
      where: { user_id: input.userId },
      data: {
        current_streak: newStreak,
        last_completed_date: input.today,
        pending_apology: false,
        pending_apology_days: 0,
        updated_at: now,
      },
      select: { user_id: true },
    });
    await tx.streakPurchase.create({
      data: {
        user_id: input.userId,
        kind: price.kind,
        price_usd: price.usd,
        paid_via: "credits",
        paid_credits: price.credits,
        streak_before: streak.current_streak,
        streak_after: newStreak,
      },
      select: { id: true },
    });

    return {
      streak: newStreak,
      creditsRemaining: updatedUser.credits,
      price,
    };
  });
}

export function repairStreak(input: { userId: number; expectedUpdatedAt: Date; today: string }) {
  return repairStreakWithDb(prisma, input);
}
