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

  // Guarded decrement (audit H17): balance check + debit + slot cap re-check in
  // ONE atomic statement — concurrent buys can't race the balance negative or
  // exceed MAX_SLOTS.
  const dec = await prisma.user.updateMany({
    where: { id: user.id, credits: { gte: price }, pet_slots: { lt: MAX_SLOTS } },
    data: { pet_slots: { increment: 1 }, credits: { decrement: price } },
  });
  if (dec.count === 0) {
    return NextResponse.json(
      { error: "Insufficient credits", required: price, available: user.credits },
      { status: 400 }
    );
  }
  const updatedUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { pet_slots: true, credits: true },
  });

  return NextResponse.json({
    pet_slots: updatedUser?.pet_slots ?? user.pet_slots + 1,
    credits: updatedUser?.credits ?? 0,
    price_paid: price,
  });
}
