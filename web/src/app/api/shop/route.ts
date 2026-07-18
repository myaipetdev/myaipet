import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { rateLimit } from "@/lib/rateLimit";
import {
  parseShopPetId,
  purchaseShopItem,
  ShopInsufficientCreditsError,
  ShopItemAlreadyOwnedError,
  ShopItemUnavailableError,
  ShopPetUnavailableError,
} from "@/lib/shopPurchase";
import { NextRequest, NextResponse } from "next/server";

// GET: List all shop items
export async function GET() {
  const items = await prisma.shopItem.findMany({
    where: { is_active: true, category: { in: ["consumable", "accessory", "cosmetic"] } },
    orderBy: [{ rarity: "asc" }, { price: "asc" }],
  });

  return NextResponse.json(items);
}

// POST: Purchase an item
export async function POST(req: NextRequest) {
  const rl = rateLimit(req, { key: "shop-purchase", limit: 30, windowMs: 60_000 });
  if (!rl.ok) return rl.response;

  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { item_key, pet_id } = await req.json().catch(() => ({}));

  if (typeof item_key !== "string" || !item_key || item_key.length > 40) {
    return NextResponse.json({ error: "item_key required" }, { status: 400 });
  }
  const parsedPetId = parseShopPetId(pet_id);
  if (parsedPetId === null) {
    return NextResponse.json({ error: "A positive safe-integer pet_id is required" }, { status: 400 });
  }

  try {
    const result = await purchaseShopItem({ userId: user.id, petId: parsedPetId, itemKey: item_key });
    return NextResponse.json({
      purchased: result.purchased,
      item_price: result.itemPrice,
      burn_amount: result.burnAmount,
      credits_spent: result.creditsSpent,
      credits_remaining: result.creditsRemaining,
      equipped_slot: result.equippedSlot,
    });
  } catch (error) {
    if (error instanceof ShopItemUnavailableError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof ShopPetUnavailableError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof ShopInsufficientCreditsError) {
      return NextResponse.json({
        error: error.message,
        required: error.required,
        available: error.available,
      }, { status: 400 });
    }
    if (error instanceof ShopItemAlreadyOwnedError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error("Shop purchase failed:", error);
    return NextResponse.json({ error: "Purchase failed" }, { status: 500 });
  }
}
