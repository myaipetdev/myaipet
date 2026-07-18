import { getUser } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import {
  MAX_PET_SLOTS,
  PetSlotInsufficientCreditsError,
  PetSlotMaximumReachedError,
  PetSlotPurchaseConflictError,
  PetSlotUserNotFoundError,
  purchasePetSlot,
} from "@/lib/petSlots";

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (user.pet_slots >= MAX_PET_SLOTS) {
    return NextResponse.json({ error: "Maximum slots reached" }, { status: 400 });
  }

  try {
    const result = await purchasePetSlot({
      userId: user.id,
      expectedPetSlots: user.pet_slots,
    });
    return NextResponse.json({
      pet_slots: result.petSlots,
      credits: result.credits,
      price_paid: result.pricePaid,
    });
  } catch (error) {
    if (error instanceof PetSlotPurchaseConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof PetSlotMaximumReachedError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof PetSlotInsufficientCreditsError) {
      return NextResponse.json(
        { error: error.message, required: error.required, available: error.available },
        { status: 400 },
      );
    }
    if (error instanceof PetSlotUserNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    throw error;
  }
}
