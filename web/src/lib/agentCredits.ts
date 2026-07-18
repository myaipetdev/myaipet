import { prisma } from "@/lib/prisma";

type AgentCreditDb = any;

function sameUtcDay(a: Date, b: Date): boolean {
  return a.getUTCFullYear() === b.getUTCFullYear()
    && a.getUTCMonth() === b.getUTCMonth()
    && a.getUTCDate() === b.getUTCDate();
}

/**
 * Atomically charge both the owner's wallet and the pet's daily agent budget.
 * The schedule row lock serializes same-pet requests; the guarded user UPDATE
 * serializes the shared owner wallet across every pet and never goes negative.
 */
export async function consumeAgentCreditsWithDb(
  db: AgentCreditDb,
  petId: number,
  amount: number,
  now = new Date(),
): Promise<boolean> {
  if (!Number.isSafeInteger(petId) || petId <= 0) return false;
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new Error("Agent credit amount must be a positive safe integer");
  }

  return db.$transaction(async (tx: AgentCreditDb) => {
    const pet = await tx.pet.findFirst({
      where: { id: petId, is_active: true },
      select: { id: true, user_id: true },
    });
    if (!pet) return false;

    await tx.petAgentSchedule.upsert({
      where: { pet_id: pet.id },
      create: {
        pet_id: pet.id,
        daily_credit_limit: 10,
        action_cooldown_minutes: 30,
        credits_used_today: 0,
        last_reset_at: now,
      },
      update: {},
      select: { id: true },
    });

    const lockedRows = await tx.$queryRaw`
      SELECT "id", "daily_credit_limit", "credits_used_today", "last_reset_at"
      FROM "pet_agent_schedules"
      WHERE "pet_id" = ${pet.id}
      FOR UPDATE
    ` as Array<{
      id: number;
      daily_credit_limit: number;
      credits_used_today: number;
      last_reset_at: Date;
    }>;
    const schedule = lockedRows[0];
    if (!schedule) throw new Error("Agent schedule lock failed");

    const used = sameUtcDay(new Date(schedule.last_reset_at), now)
      ? schedule.credits_used_today
      : 0;
    if (used + amount > schedule.daily_credit_limit) return false;

    const debit = await tx.user.updateMany({
      where: { id: pet.user_id, credits: { gte: amount } },
      data: { credits: { decrement: amount } },
    });
    if (debit.count !== 1) return false;

    await tx.petAgentSchedule.update({
      where: { id: schedule.id },
      data: {
        credits_used_today: used + amount,
        last_reset_at: now,
        last_action_at: now,
      },
    });
    return true;
  });
}

export async function consumeAgentCredits(petId: number, amount: number): Promise<boolean> {
  try {
    return await consumeAgentCreditsWithDb(prisma, petId, amount);
  } catch (error) {
    console.error("[pet-agent] consumeAgentCredits transaction failed:", error);
    return false;
  }
}
