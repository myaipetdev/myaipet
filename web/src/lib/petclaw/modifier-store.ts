import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

const PET_MODIFIER_LOCK_NAMESPACE = 1_347_566_928;

export type PetModifierRecord = Record<string, unknown>;

export interface LockedPetModifierContext {
  tx: Prisma.TransactionClient;
  pet: {
    id: number;
    memory_epoch: number;
    personality_modifiers: Prisma.JsonValue | null;
  };
  modifiers: PetModifierRecord;
}

/**
 * Acquire the shared modifier locks inside an existing transaction.
 *
 * IDs are de-duplicated and sorted so a future operation touching more than
 * one pet cannot invert lock order. PostgreSQL transaction advisory locks are
 * re-entrant for the current transaction, so a lower-level wallet/paywall call
 * may safely reinforce a lock already acquired by its route.
 */
export async function lockPetModifiersInTransaction(
  tx: Prisma.TransactionClient,
  petIds: number | readonly number[],
): Promise<void> {
  const ids = [...new Set(typeof petIds === "number" ? [petIds] : petIds)]
    .filter((petId) => Number.isSafeInteger(petId) && petId > 0)
    .sort((a, b) => a - b);
  if (ids.length === 0) throw new Error("At least one valid pet id is required");

  for (const petId of ids) {
    // pg_advisory_xact_lock returns PostgreSQL `void`, which Prisma's pg driver
    // adapter cannot deserialize. Cast the result while preserving the VOLATILE
    // call and transaction-scoped blocking semantics.
    await tx.$queryRaw<Array<{ acquired: string }>>`
      SELECT pg_advisory_xact_lock(${PET_MODIFIER_LOCK_NAMESPACE}, ${petId})::text AS acquired
    `;
  }
}

/**
 * Serialize read/modify/write access to a pet's shared JSON modifier document.
 * Every PetClaw memory/consent/skill writer should use this lock namespace.
 */
export async function withLockedPetModifiers<T>(
  petId: number,
  work: (context: LockedPetModifierContext) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await lockPetModifiersInTransaction(tx, petId);
    const pet = await tx.pet.findUnique({
      where: { id: petId },
      select: { id: true, memory_epoch: true, personality_modifiers: true },
    });
    if (!pet) throw new Error("Pet not found");
    return work({
      tx,
      pet,
      modifiers: (pet.personality_modifiers as PetModifierRecord | null) || {},
    });
  });
}

export async function readPetMemoryEpoch(petId: number): Promise<number> {
  const pet = await prisma.pet.findUnique({
    where: { id: petId },
    select: { memory_epoch: true },
  });
  if (!pet) throw new Error("Pet not found");
  return pet.memory_epoch;
}
