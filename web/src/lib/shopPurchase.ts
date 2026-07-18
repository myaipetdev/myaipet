import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

// Launch catalog: consumables have an immediate server-side effect; accessory
// and cosmetic purchases have a visible wardrobe effect. Equipment/furniture
// remain hidden until their advertised passive effects are implemented.
const EQUIPPABLE_CATEGORIES = new Set(["accessory", "cosmetic"]);
const SUPPORTED_CATEGORIES = new Set(["consumable", ...EQUIPPABLE_CATEGORIES]);

type ShopPurchaseDb = {
  $transaction<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T>;
};

type LockedShopPet = {
  id: number;
  happiness: number;
  energy: number;
  hunger: number;
  bond_level: number;
  experience: number;
};

type LockedShopUser = {
  id: number;
  credits: number;
};

export type ShopPurchaseResult = {
  purchased: string;
  itemPrice: number;
  burnAmount: number;
  creditsSpent: number;
  creditsRemaining: number;
  equippedSlot: string | null;
};

export class ShopItemUnavailableError extends Error {
  constructor() {
    super("Item not found");
    this.name = "ShopItemUnavailableError";
  }
}

export class ShopPetUnavailableError extends Error {
  constructor() {
    super("Active pet not found");
    this.name = "ShopPetUnavailableError";
  }
}

export class ShopInsufficientCreditsError extends Error {
  constructor(
    readonly required: number,
    readonly available: number,
  ) {
    super("Insufficient credits");
    this.name = "ShopInsufficientCreditsError";
  }
}

export class ShopItemAlreadyOwnedError extends Error {
  constructor() {
    super("You already own this wardrobe item");
    this.name = "ShopItemAlreadyOwnedError";
  }
}

export function parseShopPetId(value: unknown): number | null {
  const parsed = typeof value === "number"
    ? value
    : typeof value === "string" && /^[1-9][0-9]*$/.test(value)
      ? Number(value)
      : Number.NaN;
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function integerBonus(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : 0;
}

/**
 * Authoritative credit-shop mutation. Pet authorization, debit, receipt,
 * consumable effect, and equipment upsert commit or roll back together.
 */
export async function purchaseShopItemWithDb(
  db: ShopPurchaseDb,
  input: { userId: number; petId: number; itemKey: string },
): Promise<ShopPurchaseResult> {
  if (!Number.isSafeInteger(input.userId) || input.userId <= 0) {
    throw new ShopPetUnavailableError();
  }
  if (!Number.isSafeInteger(input.petId) || input.petId <= 0) {
    throw new ShopPetUnavailableError();
  }
  if (!input.itemKey || input.itemKey.length > 40) {
    throw new ShopItemUnavailableError();
  }

  return db.$transaction(async (tx) => {
    const item = await tx.shopItem.findUnique({
      where: { key: input.itemKey },
      select: {
        id: true,
        name: true,
        category: true,
        price: true,
        stat_bonus: true,
        is_active: true,
      },
    });
    if (
      !item
      || !item.is_active
      || !SUPPORTED_CATEGORIES.has(item.category)
      || !Number.isSafeInteger(item.price)
      || item.price < 0
    ) {
      throw new ShopItemUnavailableError();
    }

    // Lock the target before any debit. Both owner and active-state predicates
    // are authoritative inside the same transaction as the purchase effects.
    const pets = await tx.$queryRaw<LockedShopPet[]>`
      SELECT "id", "happiness", "energy", "hunger", "bond_level", "experience"
      FROM "pets"
      WHERE "id" = ${input.petId}
        AND "user_id" = ${input.userId}
        AND "is_active" = true
      FOR UPDATE
    `;
    const pet = pets[0];
    if (!pet) throw new ShopPetUnavailableError();

    const burnAmount = Math.floor(item.price * 0.05);
    const creditsSpent = item.price + burnAmount;

    // Serialize all purchases for this wallet before checking buy-once
    // ownership or balance. A second concurrent wardrobe request observes the
    // first receipt and cannot charge the same item again.
    const users = await tx.$queryRaw<LockedShopUser[]>`
      SELECT "id", "credits"
      FROM "users"
      WHERE "id" = ${input.userId}
      FOR UPDATE
    `;
    const lockedUser = users[0];
    if (!lockedUser) throw new ShopPetUnavailableError();
    if (EQUIPPABLE_CATEGORIES.has(item.category)) {
      const alreadyOwned = await tx.itemPurchase.findFirst({
        where: { user_id: input.userId, item_id: item.id },
        select: { id: true },
      });
      if (alreadyOwned) throw new ShopItemAlreadyOwnedError();
    }
    if (lockedUser.credits < creditsSpent) {
      throw new ShopInsufficientCreditsError(creditsSpent, lockedUser.credits);
    }
    const updatedUser = await tx.user.update({
      where: { id: input.userId },
      data: { credits: { decrement: creditsSpent } },
      select: { credits: true },
    });

    await tx.itemPurchase.create({
      data: {
        user_id: input.userId,
        item_id: item.id,
        quantity: 1,
        total_cost: creditsSpent,
      },
      select: { id: true },
    });

    let equippedSlot: string | null = null;
    if (item.category === "consumable") {
      const bonus = item.stat_bonus && typeof item.stat_bonus === "object" && !Array.isArray(item.stat_bonus)
        ? item.stat_bonus as Record<string, unknown>
        : {};
      await tx.pet.update({
        where: { id: pet.id },
        data: {
          happiness: Math.min(100, Math.max(0, pet.happiness + integerBonus(bonus.happiness))),
          energy: Math.min(100, Math.max(0, pet.energy + integerBonus(bonus.energy))),
          hunger: Math.min(100, Math.max(0, pet.hunger + integerBonus(bonus.hunger))),
          bond_level: Math.min(100, Math.max(0, pet.bond_level + integerBonus(bonus.bond_level))),
          experience: Math.max(0, pet.experience + integerBonus(bonus.experience)),
        },
        select: { id: true },
      });
    } else if (EQUIPPABLE_CATEGORIES.has(item.category)) {
      equippedSlot = item.category;
      await tx.petEquippedItem.upsert({
        where: { pet_id_slot: { pet_id: pet.id, slot: equippedSlot } },
        create: { pet_id: pet.id, item_id: item.id, slot: equippedSlot },
        update: { item_id: item.id, equipped_at: new Date() },
        select: { id: true },
      });
    }

    return {
      purchased: item.name,
      itemPrice: item.price,
      burnAmount,
      creditsSpent,
      creditsRemaining: updatedUser.credits,
      equippedSlot,
    };
  });
}

export function purchaseShopItem(input: {
  userId: number;
  petId: number;
  itemKey: string;
}): Promise<ShopPurchaseResult> {
  return purchaseShopItemWithDb(prisma, input);
}
