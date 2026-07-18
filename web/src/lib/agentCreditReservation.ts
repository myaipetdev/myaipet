import { prisma } from "@/lib/prisma";

type AgentReservationDb = any;
export const AGENT_RESERVATION_TTL_MS = 5 * 60_000;

export type AgentCreditReservation = {
  id: string;
  userId: number;
  petId: number;
  amount: number;
  creditsRemaining: number;
  expiresAt: Date;
};

/**
 * Reserve credits before any paid agent work starts. The conditional UPDATE is
 * authoritative under concurrency and cannot take a balance below zero. The
 * durable reservation is inserted in the same transaction as the debit.
 */
export async function reserveAgentCreditsWithDb(
  db: AgentReservationDb,
  userId: number,
  petId: number,
  amount: number,
  now = new Date(),
): Promise<AgentCreditReservation | null> {
  if (!Number.isSafeInteger(userId) || userId <= 0 || !Number.isSafeInteger(petId) || petId <= 0) {
    return null;
  }
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new Error("Agent credit reservation amount must be a positive integer");
  }
  const expiresAt = new Date(now.getTime() + AGENT_RESERVATION_TTL_MS);

  return db.$transaction(async (tx: AgentReservationDb) => {
    const ownedPet = await tx.pet.findFirst({
      where: { id: petId, user_id: userId, is_active: true },
      select: { id: true },
    });
    if (!ownedPet) return null;

    const debit = await tx.user.updateMany({
      where: { id: userId, credits: { gte: amount } },
      data: { credits: { decrement: amount } },
    });
    if (debit.count !== 1) return null;

    const reservation = await tx.agentCreditReservation.create({
      data: {
        user_id: userId,
        pet_id: petId,
        purpose: "pet_agent_loop",
        amount,
        status: "reserved",
        created_at: now,
        expires_at: expiresAt,
      },
      select: { id: true },
    });
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { credits: true } });

    return {
      id: reservation.id,
      userId,
      petId,
      amount,
      creditsRemaining: user.credits,
      expiresAt,
    };
  });
}

export function reserveAgentCredits(
  userId: number,
  petId: number,
  amount: number,
): Promise<AgentCreditReservation | null> {
  return reserveAgentCreditsWithDb(prisma, userId, petId, amount);
}

async function currentBalance(db: AgentReservationDb, userId: number): Promise<number> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { credits: true } });
  return user?.credits ?? 0;
}

/** Mark a successfully used reservation as charged. Safe to retry. */
export async function commitAgentCreditsWithDb(
  db: AgentReservationDb,
  reservation: AgentCreditReservation,
): Promise<number> {
  await db.agentCreditReservation.updateMany({
    where: {
      id: reservation.id,
      user_id: reservation.userId,
      amount: reservation.amount,
      status: "reserved",
    },
    data: { status: "committed", settled_at: new Date() },
  });
  return currentBalance(db, reservation.userId);
}

export function commitAgentCredits(reservation: AgentCreditReservation): Promise<number> {
  return commitAgentCreditsWithDb(prisma, reservation);
}

/**
 * Refund a failed/no-op reservation exactly once. The status transition and
 * credit increment are one transaction: only the caller that changes
 * `reserved` → `refunded` can increment the wallet. Every later retry observes
 * a terminal row and returns the live balance without another increment.
 */
export async function refundAgentCreditsOnceWithDb(
  db: AgentReservationDb,
  reservation: AgentCreditReservation,
): Promise<number> {
  return db.$transaction(async (tx: AgentReservationDb) => {
    const refundClaim = await tx.agentCreditReservation.updateMany({
      where: {
        id: reservation.id,
        user_id: reservation.userId,
        amount: reservation.amount,
        status: "reserved",
      },
      data: { status: "refunded", settled_at: new Date() },
    });

    if (refundClaim.count === 1) {
      const user = await tx.user.update({
        where: { id: reservation.userId },
        data: { credits: { increment: reservation.amount } },
        select: { credits: true },
      });
      return user.credits;
    }

    const user = await tx.user.findUnique({
      where: { id: reservation.userId },
      select: { credits: true },
    });
    return user?.credits ?? 0;
  });
}

export function refundAgentCreditsOnce(reservation: AgentCreditReservation): Promise<number> {
  return refundAgentCreditsOnceWithDb(prisma, reservation);
}

/**
 * Recover debits stranded by process crashes/reboots. One SQL statement claims
 * expired reservations with SKIP LOCKED, flips them by CAS, and credits each
 * wallet by exactly the sum of rows it won. A concurrent commit can win first;
 * in that case the row is no longer `reserved` and is never refunded.
 */
export async function refundStaleAgentCreditReservationsWithDb(
  db: AgentReservationDb,
  now = new Date(),
  limit = 100,
): Promise<{ refundedReservations: number; refundedCredits: number }> {
  const boundedLimit = Math.max(1, Math.min(500, Math.floor(limit)));
  const rows = await db.$queryRaw`
    WITH candidates AS (
      SELECT "id"
      FROM "agent_credit_reservations"
      WHERE "status" = 'reserved' AND "expires_at" <= ${now}
      ORDER BY "expires_at", "id"
      FOR UPDATE SKIP LOCKED
      LIMIT ${boundedLimit}
    ), claimed AS (
      UPDATE "agent_credit_reservations" AS reservation
      SET "status" = 'refunded', "settled_at" = ${now}
      FROM candidates
      WHERE reservation."id" = candidates."id"
        AND reservation."status" = 'reserved'
      RETURNING reservation."user_id", reservation."amount"
    ), totals AS (
      SELECT "user_id", SUM("amount")::integer AS "amount"
      FROM claimed
      GROUP BY "user_id"
    ), wallet_refunds AS (
      UPDATE "users" AS owner
      SET "credits" = owner."credits" + totals."amount"
      FROM totals
      WHERE owner."id" = totals."user_id"
      RETURNING owner."id"
    )
    SELECT
      (SELECT COUNT(*)::integer FROM claimed) AS "refunded_reservations",
      (SELECT COALESCE(SUM("amount"), 0)::integer FROM claimed) AS "refunded_credits"
  ` as Array<{ refunded_reservations: number; refunded_credits: number }>;
  return {
    refundedReservations: rows[0]?.refunded_reservations ?? 0,
    refundedCredits: rows[0]?.refunded_credits ?? 0,
  };
}

export function refundStaleAgentCreditReservations(
  now = new Date(),
  limit = 100,
): Promise<{ refundedReservations: number; refundedCredits: number }> {
  return refundStaleAgentCreditReservationsWithDb(prisma, now, limit);
}
