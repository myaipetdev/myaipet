import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { describePetAvatar } from "@/lib/services/video";
import { NextRequest, NextResponse } from "next/server";

const PERSONALITIES = ["friendly", "playful", "shy", "brave", "lazy", "curious", "mischievous", "gentle", "adventurous", "dramatic", "wise", "sassy"] as const;
const SLOT_PRICES = [0, 50, 100, 200, 500]; // Cost for slot 2, 3, 4, 5

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const pets = await prisma.pet.findMany({
    where: { user_id: user.id, is_active: true },
    orderBy: { created_at: "desc" },
  });

  return NextResponse.json({
    pets,
    pet_slots: user.pet_slots,
    slot_prices: SLOT_PRICES,
  });
}

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { name, species, personality, avatar_url, species_name, appearance_desc: userAppearanceDesc, custom_traits } = body;

  if (!name) {
    return NextResponse.json(
      { error: "name is required" },
      { status: 400 }
    );
  }

  const activePetCount = await prisma.pet.count({
    where: { user_id: user.id, is_active: true },
  });

  if (activePetCount >= user.pet_slots) {
    return NextResponse.json(
      { error: `You need to unlock more pet slots. Current: ${user.pet_slots}` },
      { status: 400 }
    );
  }

  const finalPersonality = personality && PERSONALITIES.includes(personality as any)
    ? personality
    : PERSONALITIES[Math.floor(Math.random() * PERSONALITIES.length)];

  // Auto-analyze appearance from avatar using Vision API
  let appearanceDesc = userAppearanceDesc || undefined;
  if (!appearanceDesc && avatar_url) {
    try {
      appearanceDesc = await describePetAvatar(avatar_url);
    } catch (e) {
      console.error("Auto-describe failed:", e);
    }
  }

  const pet = await prisma.pet.create({
    data: {
      user_id: user.id,
      name,
      species: species ?? 0,
      personality_type: finalPersonality,
      ...(avatar_url ? { avatar_url } : {}),
      ...(appearanceDesc ? { appearance_desc: appearanceDesc } : {}),
      ...((species_name || custom_traits) ? { personality_modifiers: { ...(species_name ? { species_name } : {}), ...(custom_traits ? { custom_traits } : {}) } } : {}),
    },
  });

  await prisma.petMemory.create({
    data: {
      pet_id: pet.id,
      memory_type: "birth",
      content: `${name} was born! A new adventure begins.`,
      emotion: "happy",
      importance: 5,
    },
  });

  return NextResponse.json(pet, { status: 201 });
}
