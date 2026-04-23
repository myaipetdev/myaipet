import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

// GET: List all shop items
export async function GET() {
  const items = await prisma.shopItem.findMany({
    where: { is_active: true },
    orderBy: [{ rarity: "asc" }, { price: "asc" }],
  });

  return NextResponse.json(items);
}

// POST: Purchase an item
export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { item_key, pet_id } = await req.json();

  if (!item_key) {
    return NextResponse.json({ error: "item_key required" }, { status: 400 });
  }

  const item = await prisma.shopItem.findUnique({ where: { key: item_key } });
  if (!item || !item.is_active) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }

  if (user.credits < item.price) {
    return NextResponse.json({
      error: "Insufficient credits",
      required: item.price,
      available: user.credits,
    }, { status: 400 });
  }

  // Deduct credits + 5% burn + record purchase atomically
  const burnAmount = Math.floor(item.price * 0.05);
  const totalDeduct = item.price + burnAmount;

  const updatedUser = await prisma.$transaction(async (tx) => {
    const userResult = await tx.user.update({
      where: { id: user.id },
      data: { credits: { decrement: totalDeduct } },
    });

    // Prevent negative credits (race condition guard)
    if (userResult.credits < 0) {
      throw new Error("Insufficient credits");
    }

    await tx.itemPurchase.create({
      data: {
        user_id: user.id,
        item_id: item.id,
        quantity: 1,
        total_cost: item.price,
      },
    });

    // If consumable and pet_id provided, apply stat bonus immediately
    if (item.category === "consumable" && pet_id) {
      const bonus = (item.stat_bonus as any) || {};
      const pet = await tx.pet.findFirst({
        where: { id: Number(pet_id), user_id: user.id, is_active: true },
      });
      if (pet) {
        await tx.pet.update({
          where: { id: pet.id },
          data: {
            happiness: Math.min(100, pet.happiness + (bonus.happiness || 0)),
            energy: Math.min(100, pet.energy + (bonus.energy || 0)),
            hunger: Math.max(0, pet.hunger + (bonus.hunger || 0)),
            bond_level: Math.min(100, pet.bond_level + (bonus.bond_level || 0)),
            experience: pet.experience + (bonus.experience || 0),
          },
        });
      }
    }

    return userResult;
  });

  // If equipment/accessory and pet_id, equip it
  if (["equipment", "accessory", "cosmetic", "furniture"].includes(item.category) && pet_id) {
    const slot = item.category;
    await prisma.petEquippedItem.upsert({
      where: { pet_id_slot: { pet_id: Number(pet_id), slot } },
      create: { pet_id: Number(pet_id), item_id: item.id, slot },
      update: { item_id: item.id },
    });
  }

  return NextResponse.json({
    purchased: item.name,
    credits_spent: item.price,
    credits_remaining: updatedUser.credits,
  });
}
