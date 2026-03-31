import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

const MAX_SLOTS = 5;
const SLOT_PRICES = [0, 50, 100, 200, 500]; // price for slot 1,2,3,4,5

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (user.pet_slots >= MAX_SLOTS) {
    return NextResponse.json({ error: "Maximum slots reached" }, { status: 400 });
  }

  const nextSlotIndex = user.pet_slots; // 0-indexed: slot 1 = index 0
  const price = SLOT_PRICES[nextSlotIndex] || 500;

  if (user.credits < price) {
    return NextResponse.json(
      { error: "Insufficient $PET", required: price, available: user.credits },
      { status: 400 }
    );
  }

  const updatedUser = await prisma.user.update({
    where: { id: user.id },
    data: {
      pet_slots: { increment: 1 },
      credits: { decrement: price },
    },
  });

  return NextResponse.json({
    pet_slots: updatedUser.pet_slots,
    credits: updatedUser.credits,
    price_paid: price,
  });
}
