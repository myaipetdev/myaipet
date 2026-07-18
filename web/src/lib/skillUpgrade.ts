import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getSkillUpgradeCost } from "@/lib/skills";

type SkillUpgradeDb = {
  $transaction<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T>;
};

type LockedSkillOwner = { id: number; credits: number };
type LockedSkill = { id: number; level: number };

export class SkillUpgradeConflictError extends Error {
  constructor() {
    super("Skill level changed; refresh and try again");
    this.name = "SkillUpgradeConflictError";
  }
}

export class SkillUpgradeUnavailableError extends Error {
  constructor(message = "Skill not found") {
    super(message);
    this.name = "SkillUpgradeUnavailableError";
  }
}

export class SkillAlreadyMaxLevelError extends Error {
  constructor() {
    super("Already max level");
    this.name = "SkillAlreadyMaxLevelError";
  }
}

export class SkillUpgradeInsufficientCreditsError extends Error {
  constructor(readonly required: number, readonly available: number) {
    super("Insufficient credits");
    this.name = "SkillUpgradeInsufficientCreditsError";
  }
}

export type SkillUpgradeInput = {
  userId: number;
  petId: number;
  skillKey: string;
  expectedLevel: number;
  maxLevel: number;
  rarity: number;
};

export async function upgradeSkillWithDb(db: SkillUpgradeDb, input: SkillUpgradeInput) {
  return db.$transaction(async (tx) => {
    // Canonical order for wallet-backed skill mutations: user wallet, then skill.
    const owners = await tx.$queryRaw<LockedSkillOwner[]>`
      SELECT "id", "credits"
      FROM "users"
      WHERE "id" = ${input.userId}
      FOR UPDATE
    `;
    const owner = owners[0];
    if (!owner) throw new SkillUpgradeUnavailableError();

    const skills = await tx.$queryRaw<LockedSkill[]>`
      SELECT skill."id", skill."level"
      FROM "pet_skills" AS skill
      INNER JOIN "pets" AS pet ON pet."id" = skill."pet_id"
      WHERE pet."id" = ${input.petId}
        AND pet."user_id" = ${input.userId}
        AND skill."skill_key" = ${input.skillKey}
      FOR UPDATE OF skill
    `;
    const skill = skills[0];
    if (!skill) throw new SkillUpgradeUnavailableError();
    if (skill.level !== input.expectedLevel) throw new SkillUpgradeConflictError();
    if (skill.level >= input.maxLevel) throw new SkillAlreadyMaxLevelError();

    const cost = getSkillUpgradeCost(skill.level, input.rarity);
    if (owner.credits < cost) {
      throw new SkillUpgradeInsufficientCreditsError(cost, owner.credits);
    }

    const updatedUser = await tx.user.update({
      where: { id: input.userId },
      data: { credits: { decrement: cost } },
      select: { credits: true },
    });
    const updatedSkill = await tx.petSkill.update({
      where: { id: skill.id },
      data: { level: { increment: 1 } },
      select: { level: true },
    });
    return {
      newLevel: updatedSkill.level,
      creditsSpent: cost,
      creditsRemaining: updatedUser.credits,
    };
  });
}

export function upgradeSkill(input: SkillUpgradeInput) {
  return upgradeSkillWithDb(prisma, input);
}
