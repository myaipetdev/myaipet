import { prisma } from "@/lib/prisma";

type GenerationSettlementDb = any;

export interface FailedGenerationSettlement {
  transitioned: boolean;
  refundedCredits: number;
}

/**
 * Atomically move a paid generation from an explicitly allowed non-terminal
 * status to failed and refund its recorded charge. The guarded status update
 * is the CAS: a concurrent completion or another failure can win, but only one
 * transition can mutate the row and therefore only one refund can occur.
 */
export async function failGenerationAndRefundWithDb(
  db: GenerationSettlementDb,
  input: {
    generationId: number;
    ownerUserId: number;
    fromStatuses: string[];
    errorMessage: string;
  },
): Promise<FailedGenerationSettlement> {
  if (!Number.isSafeInteger(input.generationId) || input.generationId <= 0) {
    return { transitioned: false, refundedCredits: 0 };
  }
  if (!Number.isSafeInteger(input.ownerUserId) || input.ownerUserId <= 0) {
    return { transitioned: false, refundedCredits: 0 };
  }
  const fromStatuses = [...new Set(input.fromStatuses.filter(status =>
    typeof status === "string" && status.length > 0 && status !== "failed" && status !== "completed"
  ))];
  if (fromStatuses.length === 0) return { transitioned: false, refundedCredits: 0 };

  return db.$transaction(async (tx: GenerationSettlementDb) => {
    const transitioned = await tx.generation.updateMany({
      where: {
        id: input.generationId,
        user_id: input.ownerUserId,
        status: { in: fromStatuses },
      },
      data: {
        status: "failed",
        error_message: input.errorMessage.slice(0, 500),
        completed_at: null,
      },
    });
    if (transitioned.count !== 1) return { transitioned: false, refundedCredits: 0 };

    const generation = await tx.generation.findUnique({
      where: { id: input.generationId },
      select: { credits_charged: true, user_id: true },
    });
    if (!generation || generation.user_id !== input.ownerUserId) {
      throw new Error("Generation settlement owner changed during transaction");
    }

    const refund = Number.isSafeInteger(generation.credits_charged)
      ? Math.max(0, generation.credits_charged)
      : 0;
    if (refund > 0) {
      await tx.user.update({
        where: { id: input.ownerUserId },
        data: { credits: { increment: refund } },
        select: { id: true },
      });
    }
    return { transitioned: true, refundedCredits: refund };
  });
}

export function failGenerationAndRefund(input: {
  generationId: number;
  ownerUserId: number;
  fromStatuses: string[];
  errorMessage: string;
}): Promise<FailedGenerationSettlement> {
  return failGenerationAndRefundWithDb(prisma, input);
}
