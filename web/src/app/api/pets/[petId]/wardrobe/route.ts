/**
 * Pet wardrobe — buy-once-then-wear cosmetics on top of the shop.
 *
 *   GET  /api/pets/[petId]/wardrobe
 *     → { credits, items: [{ key, name, icon, category, rarity, price, owned, equipped }], equipped: { [slot]: {key,icon,category} } }
 *
 *   POST /api/pets/[petId]/wardrobe   { item_key, action: "equip" | "unequip" }
 *     → equips/unequips an item the user ALREADY owns (no charge). Buying happens
 *       via POST /api/shop (which charges + auto-equips). This lets a pet toggle
 *       owned looks freely without paying again.
 *
 * Wearables = shop items in the "accessory" / "cosmetic" categories (one slot each).
 */

import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

const WEARABLE = ["accessory", "cosmetic"];

async function ownedPet(req: NextRequest, petIdStr: string) {
  const user = await getUser(req);
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const petId = Number(petIdStr);
  const pet = await prisma.pet.findFirst({ where: { id: petId, user_id: user.id, is_active: true }, select: { id: true } });
  if (!pet) return { error: NextResponse.json({ error: "Pet not found" }, { status: 404 }) };
  return { user, petId };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ petId: string }> }) {
  const { petId } = await params;
  const ctx = await ownedPet(req, petId);
  if ("error" in ctx) return ctx.error;
  const { user, petId: pid } = ctx;

  const [items, purchases, equippedRows, fresh] = await Promise.all([
    prisma.shopItem.findMany({ where: { is_active: true, category: { in: WEARABLE } }, orderBy: [{ price: "asc" }] }),
    prisma.itemPurchase.findMany({ where: { user_id: user.id }, select: { item_id: true } }),
    prisma.petEquippedItem.findMany({ where: { pet_id: pid, slot: { in: WEARABLE } }, select: { item_id: true } }),
    prisma.user.findUnique({ where: { id: user.id }, select: { credits: true } }),
  ]);

  const owned = new Set(purchases.map((p) => p.item_id));
  const equippedIds = new Set(equippedRows.map((e) => e.item_id));
  const equipped: Record<string, { key: string; icon: string; category: string }> = {};

  const out = items.map((it) => {
    const isEq = equippedIds.has(it.id);
    if (isEq) equipped[it.category] = { key: it.key, icon: it.icon, category: it.category };
    return {
      key: it.key, name: it.name, description: it.description, icon: it.icon,
      category: it.category, rarity: it.rarity, price: it.price,
      owned: owned.has(it.id), equipped: isEq,
    };
  });

  return NextResponse.json({ credits: fresh?.credits ?? 0, items: out, equipped });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ petId: string }> }) {
  const { petId } = await params;
  const ctx = await ownedPet(req, petId);
  if ("error" in ctx) return ctx.error;
  const { user, petId: pid } = ctx;

  const { item_key, action } = await req.json().catch(() => ({}));
  if (!item_key || !["equip", "unequip"].includes(action)) {
    return NextResponse.json({ error: "item_key + action (equip|unequip) required" }, { status: 400 });
  }

  const item = await prisma.shopItem.findUnique({ where: { key: String(item_key) } });
  if (!item || !WEARABLE.includes(item.category)) {
    return NextResponse.json({ error: "Not a wearable item" }, { status: 404 });
  }

  if (action === "equip") {
    const owns = await prisma.itemPurchase.findFirst({ where: { user_id: user.id, item_id: item.id }, select: { id: true } });
    if (!owns) return NextResponse.json({ error: "You don't own this yet — buy it first." }, { status: 403 });
    await prisma.petEquippedItem.upsert({
      where: { pet_id_slot: { pet_id: pid, slot: item.category } },
      create: { pet_id: pid, item_id: item.id, slot: item.category },
      update: { item_id: item.id },
    });
    return NextResponse.json({ equipped: item.key });
  }

  // unequip — clear the slot only if it currently holds this item
  await prisma.petEquippedItem.deleteMany({ where: { pet_id: pid, slot: item.category, item_id: item.id } });
  return NextResponse.json({ unequipped: item.key });
}
