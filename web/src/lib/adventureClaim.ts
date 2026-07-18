import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { grantEarnedCreditsInTransaction } from "@/lib/economyGuards";

export const DAILY_ADVENTURE_CAP = 15;

export type AdventureMode = "wild" | "explore" | "gym";

export type AdventureClaimInput = {
  userId: number;
  petId: number;
  mode: AdventureMode;
  energyCost: number;
  experienceGain: number;
  happinessChange?: number;
  creditsRequested?: number;
  skillKey?: string | null;
};

export type AdventureClaimResult = {
  creditsGranted: number;
  skillGranted: string | null;
  leveledUp: boolean;
  level: number;
  adventureNumber: number;
};

export class AdventureClaimError extends Error {
  constructor(
    public readonly code: "DAILY_LIMIT" | "NOT_ENOUGH_ENERGY" | "PET_NOT_FOUND",
    public readonly status: 400 | 404 | 429,
    message: string,
  ) {
    super(message);
    this.name = "AdventureClaimError";
  }
}

function utcDayBounds(): { day: string; start: Date } {
  const day = new Date().toISOString().slice(0, 10);
  return { day, start: new Date(`${day}T00:00:00.000Z`) };
}

/**
 * Atomically claims one adventure and applies every side effect. The lock order
 * is stable: daily counter → pet → earned-credit counters → user. A failed
 * energy guard or any reward write rolls the daily claim back as well.
 */
export async function commitAdventureClaim(
  input: AdventureClaimInput,
): Promise<AdventureClaimResult> {
  const energyCost = Math.max(1, Math.floor(input.energyCost));
  const experienceGain = Math.max(0, Math.floor(input.experienceGain));
  const happinessChange = Math.floor(input.happinessChange ?? 0);
  const creditsRequested = Math.max(0, Math.floor(input.creditsRequested ?? 0));
  const interactionType = `adventure_${input.mode}`;
  const quotaKey = `adventure:${input.petId}`;
  const { day, start } = utcDayBounds();

  return prisma.$transaction(
    async (tx) => {
      // Seed from today's authoritative interaction trail so a mid-day deploy
      // cannot reset users who already adventured before this counter existed.
      const existingInteractions = await tx.petInteraction.count({
        where: {
          pet_id: input.petId,
          user_id: input.userId,
          interaction_type: { startsWith: "adventure_" },
          created_at: { gte: start },
        },
      });

      await tx.dailyActionCount.upsert({
        where: {
          user_action_day: {
            user_id: input.userId,
            action_key: quotaKey,
            day,
          },
        },
        create: {
          user_id: input.userId,
          action_key: quotaKey,
          day,
          count: Math.min(existingInteractions, DAILY_ADVENTURE_CAP),
        },
        update: {},
      });

      const lockedCounters = (await tx.$queryRaw(
        Prisma.sql`
          SELECT id, count
          FROM daily_action_counts
          WHERE user_id = ${input.userId}
            AND action_key = ${quotaKey}
            AND day = ${day}
          FOR UPDATE
        `,
      )) as Array<{ id: number; count: number }>;
      const [lockedCounter] = lockedCounters;
      if (!lockedCounter) throw new Error("Adventure quota row was not created");

      // Reconcile only upward; never erase already-claimed slots.
      const reconciledCount = Math.max(
        lockedCounter.count,
        Math.min(existingInteractions, DAILY_ADVENTURE_CAP),
      );
      if (reconciledCount !== lockedCounter.count) {
        await tx.dailyActionCount.update({
          where: { id: lockedCounter.id },
          data: { count: reconciledCount },
        });
      }

      const dailyClaim = await tx.dailyActionCount.updateMany({
        where: { id: lockedCounter.id, count: { lt: DAILY_ADVENTURE_CAP } },
        data: { count: { increment: 1 } },
      });
      if (dailyClaim.count !== 1) {
        throw new AdventureClaimError(
          "DAILY_LIMIT",
          429,
          "Daily adventure limit reached (15/day). Come back tomorrow!",
        );
      }

      // This conditional UPDATE is both the row lock and the authoritative
      // no-negative-energy guard under concurrent requests.
      const energyClaim = await tx.pet.updateMany({
        where: {
          id: input.petId,
          user_id: input.userId,
          is_active: true,
          energy: { gte: energyCost },
        },
        data: {
          energy: { decrement: energyCost },
          happiness: { increment: happinessChange },
        },
      });
      if (energyClaim.count !== 1) {
        const ownedPet = await tx.pet.findFirst({
          where: { id: input.petId, user_id: input.userId, is_active: true },
          select: { id: true },
        });
        if (!ownedPet) {
          throw new AdventureClaimError("PET_NOT_FOUND", 404, "Pet not found");
        }
        throw new AdventureClaimError(
          "NOT_ENOUGH_ENERGY",
          400,
          "Not enough energy. Let your pet rest!",
        );
      }

      const currentPet = await tx.pet.findUniqueOrThrow({
        where: { id: input.petId },
        select: { experience: true, level: true },
      });

      let leveledUp = false;
      let resultingLevel = currentPet.level;
      if (input.mode === "gym") {
        const expNeeded = currentPet.level * 100;
        const nextExperience = currentPet.experience + experienceGain;
        leveledUp = nextExperience >= expNeeded;
        if (leveledUp) resultingLevel += 1;
        await tx.pet.update({
          where: { id: input.petId },
          data: leveledUp
            ? {
                experience: nextExperience - expNeeded,
                level: { increment: 1 },
              }
            : { experience: { increment: experienceGain } },
        });
      } else if (experienceGain > 0) {
        await tx.pet.update({
          where: { id: input.petId },
          data: { experience: { increment: experienceGain } },
        });
      }

      let skillGranted: string | null = null;
      if (input.skillKey) {
        const inserted = await tx.petSkill.createMany({
          data: [{ pet_id: input.petId, skill_key: input.skillKey, level: 1, slot: null }],
          skipDuplicates: true,
        });
        if (inserted.count === 1) skillGranted = input.skillKey;
      }

      const creditGrant = await grantEarnedCreditsInTransaction(
        tx,
        input.userId,
        "adventure",
        creditsRequested,
      );

      await tx.petInteraction.create({
        data: {
          pet_id: input.petId,
          user_id: input.userId,
          interaction_type: interactionType,
          happiness_change: happinessChange,
          energy_change: -energyCost,
          experience_gained: experienceGain,
        },
      });

      return {
        creditsGranted: creditGrant.granted,
        skillGranted,
        leveledUp,
        level: resultingLevel,
        adventureNumber: reconciledCount + 1,
      };
    },
    { maxWait: 10_000, timeout: 20_000 },
  );
}
