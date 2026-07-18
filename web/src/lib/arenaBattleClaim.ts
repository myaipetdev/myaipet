import type { Prisma } from "@/generated/prisma/client";
import { DAILY_BATTLE_CAP, DAILY_EXP_CAP } from "@/lib/skills";

type LockedDailyTrainingLog = {
  id: number;
  battles: number;
  exp_earned: number;
};

export type LockedArenaPet = {
  id: number;
  user_id: number;
  level: number;
  experience: number;
  element: string;
};

export type ArenaBattleClaim = {
  pet: LockedArenaPet;
  expGain: number;
  leveledUp: boolean;
  newLevel: number;
  newExperience: number;
  dailyBattles: number;
  dailyExpEarned: number;
};

export class ArenaDailyBattleCapError extends Error {
  readonly battles: number;
  readonly cap: number;

  constructor(battles: number, cap = DAILY_BATTLE_CAP) {
    super("Daily battle cap reached");
    this.name = "ArenaDailyBattleCapError";
    this.battles = battles;
    this.cap = cap;
  }
}

export class ArenaClaimPetNotFoundError extends Error {
  constructor() {
    super("Pet not found");
    this.name = "ArenaClaimPetNotFoundError";
  }
}

/** Paid-growth-influenced level-ups belong only in the non-ranking ledger. */
export async function recordArenaLevelUpRecognition(
  tx: Prisma.TransactionClient,
  userId: number,
  leveledUp: boolean,
): Promise<void> {
  if (!leveledUp) return;
  await tx.userStreak.upsert({
    where: { user_id: userId },
    create: { user_id: userId, total_points_earned: 50 },
    update: { total_points_earned: { increment: 50 } },
  });
}

/**
 * Atomically consume one shared Arena daily claim and apply pet EXP.
 *
 * The caller must execute every other reward (points, history, skills, PvE
 * progress) with the same transaction after this returns. Both Arena reward
 * routes use this exact lock order: daily log, then pet.
 */
export async function claimArenaBattle(
  tx: Prisma.TransactionClient,
  input: {
    userId: number;
    petId: number;
    date: Date;
    requestedExp: number;
  },
): Promise<ArenaBattleClaim> {
  const requestedExp = Number.isFinite(input.requestedExp)
    ? Math.max(0, Math.floor(input.requestedExp))
    : 0;

  await tx.dailyTrainingLog.upsert({
    where: {
      user_id_pet_id_date: {
        user_id: input.userId,
        pet_id: input.petId,
        date: input.date,
      },
    },
    create: {
      user_id: input.userId,
      pet_id: input.petId,
      date: input.date,
      battles: 0,
      exp_earned: 0,
      credits_spent: 0,
    },
    update: {},
  });

  const logs = await tx.$queryRaw<LockedDailyTrainingLog[]>`
    SELECT "id", "battles", "exp_earned"
    FROM "daily_training_logs"
    WHERE "user_id" = ${input.userId}
      AND "pet_id" = ${input.petId}
      AND "date" = ${input.date}
    FOR UPDATE
  `;
  const log = logs[0];
  if (!log) throw new Error("Daily Arena claim row was not created");
  if (log.battles >= DAILY_BATTLE_CAP) {
    throw new ArenaDailyBattleCapError(log.battles);
  }

  const pets = await tx.$queryRaw<LockedArenaPet[]>`
    SELECT "id", "user_id", "level", "experience", "element"
    FROM "pets"
    WHERE "id" = ${input.petId}
    FOR UPDATE
  `;
  const pet = pets[0];
  if (!pet || pet.user_id !== input.userId) {
    throw new ArenaClaimPetNotFoundError();
  }

  const expGain = Math.min(
    requestedExp,
    Math.max(0, DAILY_EXP_CAP - log.exp_earned),
  );
  const accumulatedExp = pet.experience + expGain;
  const expNeeded = pet.level * 100;
  const leveledUp = accumulatedExp >= expNeeded;
  const newLevel = pet.level + (leveledUp ? 1 : 0);
  const newExperience = leveledUp ? accumulatedExp - expNeeded : accumulatedExp;

  // The row lock is authoritative; this conditional predicate is a second DB
  // backstop so a future caller cannot accidentally increment beyond the cap.
  const claimed = await tx.dailyTrainingLog.updateMany({
    where: { id: log.id, battles: { lt: DAILY_BATTLE_CAP } },
    data: {
      battles: { increment: 1 },
      exp_earned: { increment: expGain },
    },
  });
  if (claimed.count !== 1) {
    throw new ArenaDailyBattleCapError(log.battles);
  }

  await tx.pet.update({
    where: { id: pet.id },
    data: {
      level: { set: newLevel },
      experience: { set: newExperience },
      total_interactions: { increment: 1 },
    },
  });

  return {
    pet,
    expGain,
    leveledUp,
    newLevel,
    newExperience,
    dailyBattles: log.battles + 1,
    dailyExpEarned: log.exp_earned + expGain,
  };
}
