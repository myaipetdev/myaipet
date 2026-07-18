import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

type LockedPetSlotUser = {
  id: number;
  pet_slots: number;
};

type LockedPetSlotPurchaseUser = LockedPetSlotUser & {
  credits: number;
};

type PetSlotDb = {
  $transaction<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T>;
};

export const MAX_PET_SLOTS = 5;
export const PET_SLOT_PRICES = [0, 50, 100, 200, 500] as const;

/** Raised after the authoritative, locked slot check rejects a pet create. */
export class PetSlotLimitError extends Error {
  readonly petSlots: number;

  constructor(petSlots: number) {
    super("No available pet slots");
    this.name = "PetSlotLimitError";
    this.petSlots = petSlots;
  }
}

export class PetSlotUserNotFoundError extends Error {
  constructor() {
    super("User not found");
    this.name = "PetSlotUserNotFoundError";
  }
}

export class PetSlotPurchaseConflictError extends Error {
  constructor() {
    super("Pet slot count changed; refresh and try again");
    this.name = "PetSlotPurchaseConflictError";
  }
}

export class PetSlotMaximumReachedError extends Error {
  constructor() {
    super("Maximum slots reached");
    this.name = "PetSlotMaximumReachedError";
  }
}

export class PetSlotInsufficientCreditsError extends Error {
  constructor(readonly required: number, readonly available: number) {
    super("Insufficient credits");
    this.name = "PetSlotInsufficientCreditsError";
  }
}

/**
 * Lock the owning user row and prove that one active-pet slot is available.
 *
 * The caller MUST create the pet with the same transaction before it commits.
 * Every pet-creation path uses this user-row lock, so concurrent creates for a
 * user serialize before counting active pets and cannot oversubscribe slots.
 */
export async function lockAvailablePetSlot(
  tx: Prisma.TransactionClient,
  userId: number,
): Promise<LockedPetSlotUser> {
  const users = await tx.$queryRaw<LockedPetSlotUser[]>`
    SELECT "id", "pet_slots"
    FROM "users"
    WHERE "id" = ${userId}
    FOR UPDATE
  `;
  const user = users[0];
  if (!user) throw new PetSlotUserNotFoundError();

  const activePets = await tx.pet.count({
    where: { user_id: userId, is_active: true },
  });
  if (activePets >= user.pet_slots) {
    throw new PetSlotLimitError(user.pet_slots);
  }

  return user;
}

/**
 * Purchase exactly the next slot from an authoritative locked user row.
 * `expectedPetSlots` is the server-side snapshot read for this request; it turns
 * duplicate concurrent clicks into HTTP 409 instead of silently buying several
 * later slots or charging every request at the first stale price.
 */
export async function purchasePetSlotWithDb(
  db: PetSlotDb,
  input: { userId: number; expectedPetSlots: number },
) {
  return db.$transaction(async (tx) => {
    const users = await tx.$queryRaw<LockedPetSlotPurchaseUser[]>`
      SELECT "id", "pet_slots", "credits"
      FROM "users"
      WHERE "id" = ${input.userId}
      FOR UPDATE
    `;
    const user = users[0];
    if (!user) throw new PetSlotUserNotFoundError();
    if (user.pet_slots !== input.expectedPetSlots) {
      throw new PetSlotPurchaseConflictError();
    }
    if (user.pet_slots >= MAX_PET_SLOTS) {
      throw new PetSlotMaximumReachedError();
    }

    const price = PET_SLOT_PRICES[user.pet_slots] ?? PET_SLOT_PRICES[MAX_PET_SLOTS - 1];
    if (user.credits < price) {
      throw new PetSlotInsufficientCreditsError(price, user.credits);
    }
    const updated = await tx.user.update({
      where: { id: input.userId },
      data: {
        pet_slots: { increment: 1 },
        credits: { decrement: price },
      },
      select: { pet_slots: true, credits: true },
    });
    return {
      petSlots: updated.pet_slots,
      credits: updated.credits,
      pricePaid: price,
    };
  });
}

export function purchasePetSlot(input: { userId: number; expectedPetSlots: number }) {
  return purchasePetSlotWithDb(prisma, input);
}
