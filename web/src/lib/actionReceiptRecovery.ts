import type { Prisma } from "@/generated/prisma/client";

type ActionReceiptRecoveryDb = {
  $transaction<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T>;
};

type LockedReceipt = {
  id: number;
  user_id: number;
  pet_id: number | null;
  action_key: string;
  amount_usd: number;
  consumed_at: Date | null;
};

export type ActionReceiptRecoveryResult =
  | { kind: "pet_not_found" }
  | { kind: "conflict" }
  | { kind: "reused" | "rebound"; receipt: unknown; alreadyApplied: boolean };

/**
 * Recover an idempotent action-pay registration without ever reusing money.
 * The requested active pet is locked before the receipt, matching the action
 * execution lock order. Only an unconsumed receipt detached by ON DELETE SET
 * NULL may move to another active pet owned by the same payer.
 */
export async function recoverActionReceiptWithDb(
  db: ActionReceiptRecoveryDb,
  input: { userId: number; petId: number; actionKey: string; txHash: string },
): Promise<ActionReceiptRecoveryResult> {
  return db.$transaction(async (tx) => {
    const pets = await tx.$queryRaw<Array<{ id: number }>>`
      SELECT "id"
      FROM "pets"
      WHERE "id" = ${input.petId}
        AND "user_id" = ${input.userId}
        AND "is_active" = true
      FOR UPDATE
    `;
    if (!pets[0]) return { kind: "pet_not_found" };

    const receipts = await tx.$queryRaw<LockedReceipt[]>`
      SELECT "id", "user_id", "pet_id", "action_key", "amount_usd", "consumed_at"
      FROM "paid_actions"
      WHERE "tx_hash" = ${input.txHash}
      FOR UPDATE
    `;
    const receipt = receipts[0];
    if (!receipt) return { kind: "conflict" };

    const ledger = await tx.consumedPayment.findUnique({
      where: { tx_hash: input.txHash },
      select: { user_id: true, purpose: true, amount_usd: true },
    });
    if (
      !ledger
      || ledger.user_id !== input.userId
      || ledger.purpose !== "action"
      || ledger.amount_usd !== receipt.amount_usd
      || receipt.user_id !== input.userId
      || receipt.action_key !== input.actionKey
    ) {
      return { kind: "conflict" };
    }

    if (receipt.consumed_at) {
      if (receipt.pet_id !== input.petId) return { kind: "conflict" };
      const existing = await tx.paidAction.findUnique({ where: { id: receipt.id } });
      return { kind: "reused", receipt: existing, alreadyApplied: true };
    }
    if (receipt.pet_id === input.petId) {
      const existing = await tx.paidAction.findUnique({ where: { id: receipt.id } });
      return { kind: "reused", receipt: existing, alreadyApplied: false };
    }
    if (receipt.pet_id !== null) return { kind: "conflict" };

    const rebound = await tx.paidAction.update({
      where: { id: receipt.id },
      data: { pet_id: input.petId },
    });
    return { kind: "rebound", receipt: rebound, alreadyApplied: false };
  });
}
