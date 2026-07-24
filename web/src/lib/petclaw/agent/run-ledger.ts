import { prisma } from "@/lib/prisma";
import { AGENT_RESERVATION_TTL_MS, type AgentCreditReservation } from "@/lib/agentCreditReservation";
import {
  agentOfficeTaskKindFromExecutionContract,
  type AgentOfficeTaskKind,
} from "./office-task-contract";

type Db = any;

export const PET_AGENT_RUN_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type AgentRunBillingReceipt = {
  outcome: "charged" | "refunded";
  creditsCharged: number;
  reason: string;
  successfulToolCalls: number;
  failedToolCalls: number;
  committedSideEffects: number;
  usageKnown: boolean;
  modelCalls: number | null;
  orchestratorModelCalls: number | null;
  skillModelCalls: number | null;
};

export type PublicPetAgentRun = {
  runId: string;
  state: "reserved" | "running" | "terminal";
  petId: number;
  petName: string;
  goal: string;
  maxSteps: number;
  executionContract: string;
  taskKind: AgentOfficeTaskKind | null;
  ok?: boolean;
  completed?: boolean;
  answer?: string;
  steps?: unknown[];
  stoppedReason?: string;
  billing?: AgentRunBillingReceipt;
  creditsRemaining?: number;
  createdAt: Date;
  startedAt?: Date;
  terminalAt?: Date;
  updatedAt: Date;
};

class InsufficientAgentCreditsError extends Error {}
class PetAgentRunUnavailableError extends Error {}

export class PetAgentRunActiveError extends Error {
  readonly code = "agent_run_in_progress";

  constructor(
    readonly petId: number,
    readonly runId: string,
    readonly state: "reserved" | "running",
  ) {
    super("A paid agent run must reach a terminal receipt before pet data can be deleted");
    this.name = "PetAgentRunActiveError";
  }
}

function isUniqueConflict(error: unknown): boolean {
  return !!error && typeof error === "object" && (error as { code?: string }).code === "P2002";
}

function publicRun(row: any): PublicPetAgentRun {
  const terminal = row.state === "terminal";
  return {
    runId: row.run_id,
    state: row.state,
    petId: row.pet_id,
    petName: row.pet_name,
    goal: row.goal,
    maxSteps: row.max_steps,
    executionContract: row.execution_contract,
    taskKind: agentOfficeTaskKindFromExecutionContract(row.execution_contract),
    ...(terminal ? {
      ok: row.completed === true,
      completed: row.completed === true,
      answer: row.answer || "",
      steps: Array.isArray(row.steps) ? row.steps : [],
      stoppedReason: row.stopped_reason || "planner_error",
      billing: row.billing as AgentRunBillingReceipt,
      ...(typeof row.credits_remaining === "number"
        ? { creditsRemaining: row.credits_remaining }
        : {}),
    } : {}),
    createdAt: row.created_at,
    ...(row.started_at ? { startedAt: row.started_at } : {}),
    ...(row.terminal_at ? { terminalAt: row.terminal_at } : {}),
    updatedAt: row.updated_at,
  };
}

export type ReservePetAgentRunResult =
  | { kind: "created"; run: PublicPetAgentRun; reservation: AgentCreditReservation }
  | { kind: "existing"; run: PublicPetAgentRun; inputMatches: boolean }
  | { kind: "blocked"; run: PublicPetAgentRun }
  | { kind: "unavailable" }
  | { kind: "insufficient" };

/**
 * Create the idempotency ledger row, debit the wallet, and create its durable
 * reservation in one transaction. The unique owner/pet/run key is acquired
 * before the debit, so concurrent copies of one request cannot double-charge.
 */
export async function reservePetAgentRunWithDb(
  db: Db,
  input: {
    runId: string;
    userId: number;
    petId: number;
    petName: string;
    goal: string;
    maxSteps: number;
    executionContract?: string;
    amount: number;
    now?: Date;
  },
): Promise<ReservePetAgentRunResult> {
  const now = input.now ?? new Date();
  const executionContract = input.executionContract ?? "freeform:v1";
  const expiresAt = new Date(now.getTime() + AGENT_RESERVATION_TTL_MS);
  try {
    const created = await db.$transaction(async (tx: Db) => {
      const ownedPets = await tx.$queryRaw<Array<{ id: number }>>`
        SELECT "id"
        FROM "pets"
        WHERE "id" = ${input.petId}
          AND "user_id" = ${input.userId}
          AND "is_active" = TRUE
        FOR UPDATE
      `;
      if (!ownedPets[0]) throw new PetAgentRunUnavailableError();

      // The Pet row lock serializes every process/tab. One different active
      // run per pet is allowed, independent of local browser/CLI journals.
      const active = await tx.petAgentRun.findFirst({
        where: { user_id: input.userId, pet_id: input.petId, state: { in: ["reserved", "running"] } },
        orderBy: { created_at: "asc" },
      });
      if (active) {
        return {
          blocked: active.run_id !== input.runId,
          existing: active,
        };
      }
      const ledger = await tx.petAgentRun.create({
        data: {
          run_id: input.runId,
          user_id: input.userId,
          pet_id: input.petId,
          pet_name: input.petName,
          goal: input.goal,
          max_steps: input.maxSteps,
          execution_contract: executionContract,
          state: "reserved",
          created_at: now,
          updated_at: now,
        },
      });

      const debit = await tx.user.updateMany({
        where: { id: input.userId, credits: { gte: input.amount } },
        data: { credits: { decrement: input.amount } },
      });
      if (debit.count !== 1) throw new InsufficientAgentCreditsError();

      const reservation = await tx.agentCreditReservation.create({
        data: {
          user_id: input.userId,
          pet_id: input.petId,
          purpose: "pet_agent_loop",
          amount: input.amount,
          status: "reserved",
          created_at: now,
          expires_at: expiresAt,
        },
        select: { id: true },
      });
      const [updated, owner] = await Promise.all([
        tx.petAgentRun.update({
          where: { id: ledger.id },
          data: { reservation_id: reservation.id, updated_at: now },
        }),
        tx.user.findUniqueOrThrow({ where: { id: input.userId }, select: { credits: true } }),
      ]);
      return { updated, reservationId: reservation.id, credits: owner.credits, blocked: false };
    });

    if (created.existing) {
      return created.blocked
        ? { kind: "blocked", run: publicRun(created.existing) }
        : {
            kind: "existing",
            run: publicRun(created.existing),
            inputMatches:
              created.existing.goal === input.goal
              && created.existing.max_steps === input.maxSteps
              && created.existing.execution_contract === executionContract,
          };
    }

    return {
      kind: "created",
      run: publicRun(created.updated),
      reservation: {
        id: created.reservationId,
        userId: input.userId,
        petId: input.petId,
        amount: input.amount,
        purpose: "pet_agent_loop",
        creditsRemaining: created.credits,
        expiresAt,
      },
    };
  } catch (error) {
    if (error instanceof PetAgentRunUnavailableError) return { kind: "unavailable" };
    if (error instanceof InsufficientAgentCreditsError) return { kind: "insufficient" };
    if (!isUniqueConflict(error)) throw error;

    // PostgreSQL waits for the winning unique-key transaction before raising
    // the conflict, so the committed row is available here without polling.
    const existing = await db.petAgentRun.findUnique({
      where: {
        user_id_pet_id_run_id: {
          user_id: input.userId,
          pet_id: input.petId,
          run_id: input.runId,
        },
      },
    });
    if (!existing) throw error;
    return {
      kind: "existing",
      run: publicRun(existing),
      inputMatches:
        existing.goal === input.goal
        && existing.max_steps === input.maxSteps
        && existing.execution_contract === executionContract,
    };
  }
}

export function reservePetAgentRun(
  input: Parameters<typeof reservePetAgentRunWithDb>[1],
): Promise<ReservePetAgentRunResult> {
  return reservePetAgentRunWithDb(prisma, input);
}

export async function markPetAgentRunRunningWithDb(
  db: Db,
  userId: number,
  petId: number,
  runId: string,
  now = new Date(),
): Promise<void> {
  const updated = await db.petAgentRun.updateMany({
    where: { user_id: userId, pet_id: petId, run_id: runId, state: "reserved" },
    data: { state: "running", started_at: now, updated_at: now },
  });
  if (updated.count !== 1) {
    throw new Error("Agent run could not transition from reserved to running");
  }
}

export function markPetAgentRunRunning(
  userId: number,
  petId: number,
  runId: string,
): Promise<void> {
  return markPetAgentRunRunningWithDb(prisma, userId, petId, runId);
}

/**
 * Settle reservation, wallet, and owner receipt atomically. Repeated calls
 * return the already-terminal receipt without another wallet transition.
 */
export async function settlePetAgentRunWithDb(
  db: Db,
  input: {
    userId: number;
    petId: number;
    runId: string;
    outcome: "charged" | "refunded";
    completed: boolean;
    answer: string;
    steps: unknown[];
    stoppedReason: string;
    billing: AgentRunBillingReceipt;
    now?: Date;
  },
): Promise<PublicPetAgentRun> {
  const now = input.now ?? new Date();
  return db.$transaction(async (tx: Db) => {
    const identity = await tx.petAgentRun.findUnique({
      where: {
        user_id_pet_id_run_id: {
          user_id: input.userId,
          pet_id: input.petId,
          run_id: input.runId,
        },
      },
    });
    if (!identity) throw new Error("Agent run ledger is unavailable");
    if (identity.state === "terminal") {
      // Terminal receipts can still be privacy-scrubbed by owner deletion.
      // Serialize the replay with that scrub and read the locked version so a
      // response never resurrects content from a stale pre-deletion snapshot.
      await tx.$queryRaw`
        SELECT "id" FROM "pet_agent_runs"
        WHERE "user_id" = ${input.userId}
          AND "pet_id" = ${input.petId}
          AND "run_id" = ${input.runId}::uuid
        FOR UPDATE
      `;
      const terminalRow = await tx.petAgentRun.findUnique({
        where: {
          user_id_pet_id_run_id: {
            user_id: input.userId,
            pet_id: input.petId,
            run_id: input.runId,
          },
        },
      });
      if (!terminalRow) throw new Error("Agent run ledger is unavailable");
      return publicRun(terminalRow);
    }
    if (!identity.reservation_id) throw new Error("Agent run reservation is unavailable");

    // The stale-refund worker locks reservation → owner wallet → run. Acquire
    // those same rows in the same order so a timeout refund can never deadlock
    // with a provider completion that is settling this receipt.
    await tx.$queryRaw`
      SELECT "id" FROM "agent_credit_reservations"
      WHERE "id" = ${identity.reservation_id}::uuid
      FOR UPDATE
    `;
    await tx.$queryRaw`
      SELECT "id" FROM "users"
      WHERE "id" = ${input.userId}
      FOR UPDATE
    `;
    await tx.$queryRaw`
      SELECT "id" FROM "pet_agent_runs"
      WHERE "user_id" = ${input.userId}
        AND "pet_id" = ${input.petId}
        AND "run_id" = ${input.runId}::uuid
      FOR UPDATE
    `;

    // A stale-refund transaction may have won while this transaction waited
    // for the reservation lock. Re-read after all locks and replay its durable
    // terminal receipt instead of attempting a second wallet transition.
    const row = await tx.petAgentRun.findUnique({
      where: {
        user_id_pet_id_run_id: {
          user_id: input.userId,
          pet_id: input.petId,
          run_id: input.runId,
        },
      },
    });
    if (!row) throw new Error("Agent run ledger is unavailable");
    if (row.state === "terminal") return publicRun(row);
    if (row.reservation_id !== identity.reservation_id) {
      throw new Error("Agent run reservation changed during settlement");
    }

    const reservation = await tx.agentCreditReservation.findUnique({
      where: { id: identity.reservation_id },
      select: { status: true, amount: true, user_id: true, purpose: true },
    });
    if (!reservation || reservation.user_id !== input.userId || reservation.purpose !== "pet_agent_loop") {
      throw new Error("Agent run reservation does not match its owner");
    }

    if (input.outcome === "charged") {
      const claimed = await tx.agentCreditReservation.updateMany({
        where: { id: identity.reservation_id, status: "reserved" },
        data: { status: "committed", settled_at: now },
      });
      if (claimed.count !== 1 && reservation.status !== "committed") {
        throw new Error("Agent run reservation is no longer chargeable");
      }
    } else {
      const claimed = await tx.agentCreditReservation.updateMany({
        where: { id: identity.reservation_id, status: "reserved" },
        data: { status: "refunded", settled_at: now },
      });
      if (claimed.count === 1) {
        await tx.user.update({
          where: { id: input.userId },
          data: { credits: { increment: reservation.amount } },
        });
      } else if (reservation.status !== "refunded") {
        throw new Error("Agent run reservation is no longer refundable");
      }
    }

    const owner = await tx.user.findUniqueOrThrow({
      where: { id: input.userId },
      select: { credits: true },
    });
    const updated = await tx.petAgentRun.update({
      where: { id: row.id },
      data: {
        state: "terminal",
        completed: input.completed,
        answer: input.answer,
        steps: input.steps as any,
        stopped_reason: input.stoppedReason,
        billing: input.billing as any,
        credits_remaining: owner.credits,
        terminal_at: now,
        updated_at: now,
      },
    });
    return publicRun(updated);
  });
}

export function settlePetAgentRun(
  input: Parameters<typeof settlePetAgentRunWithDb>[1],
): Promise<PublicPetAgentRun> {
  return settlePetAgentRunWithDb(prisma, input);
}

export async function getPetAgentRunWithDb(
  db: Db,
  userId: number,
  petId: number,
  runId: string,
): Promise<PublicPetAgentRun | null> {
  const row = await db.petAgentRun.findUnique({
    where: { user_id_pet_id_run_id: { user_id: userId, pet_id: petId, run_id: runId } },
  });
  return row ? publicRun(row) : null;
}

export function getPetAgentRun(
  userId: number,
  petId: number,
  runId: string,
): Promise<PublicPetAgentRun | null> {
  return getPetAgentRunWithDb(prisma, userId, petId, runId);
}

/**
 * Full pet-data deletion boundary. A provider call cannot be forcibly stopped,
 * so any active paid run blocks deletion without changing the run, reservation,
 * or wallet. Once all runs are terminal, private content is scrubbed while the
 * minimum financial receipt remains owner-scoped and auditable.
 */
export async function assertNoActiveAndScrubPetAgentRunsWithDb(
  tx: Db,
  userId: number,
  petId: number,
  now = new Date(),
): Promise<{ scrubbedReceipts: number }> {
  const runs = await tx.$queryRaw<Array<{
    id: string;
    run_id: string;
    state: "reserved" | "running" | "terminal";
  }>>`
    SELECT "id"::text AS "id", "run_id"::text AS "run_id", "state"
    FROM "pet_agent_runs"
    WHERE "user_id" = ${userId} AND "pet_id" = ${petId}
    ORDER BY "id"
    FOR UPDATE
  `;
  const active = runs.find((run) => run.state === "reserved" || run.state === "running");
  if (active) {
    throw new PetAgentRunActiveError(petId, active.run_id, active.state);
  }

  const scrubbed = await tx.petAgentRun.updateMany({
    where: { user_id: userId, pet_id: petId, state: "terminal" },
    data: {
      pet_name: "Deleted Pet",
      goal: "[deleted]",
      answer: "",
      steps: [] as any,
      private_content_scrubbed: true,
      updated_at: now,
    },
  });
  return { scrubbedReceipts: scrubbed.count };
}
