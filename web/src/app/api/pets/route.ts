import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { describePetAvatar } from "@/lib/services/video";
import { sanitizeName, sanitizeText, safeUrlOrEmpty } from "@/lib/sanitize";
import { moderateText } from "@/lib/moderation";
import { isHumanAvatar } from "@/lib/services/petAvatarGuard";
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
  const rawName = body.name;
  const rawSpeciesName = body.species_name;
  const rawAppearance = body.appearance_desc;
  const rawCustomTraits = body.custom_traits;
  const rawAvatar = body.avatar_url;
  const { species, personality } = body;

  // SCRUM-53/55: sanitize all user-supplied strings + validate URL scheme
  const name = sanitizeName(rawName, 50);
  const species_name = sanitizeName(rawSpeciesName, 50);
  const custom_traits = sanitizeText(rawCustomTraits, 500);
  const userAppearanceDesc = sanitizeText(rawAppearance, 2000);
  const avatar_url = safeUrlOrEmpty(rawAvatar);

  if (!name) {
    return NextResponse.json(
      { error: "name is required" },
      { status: 400 }
    );
  }

  // Moderation gate — pet name + species + traits all leak into prompts and
  // social feed. Reject NSFW/violence/minor/public-figure adversarial content here.
  for (const [field, value] of [
    ["name", name], ["species_name", species_name],
    ["custom_traits", custom_traits], ["appearance_desc", userAppearanceDesc],
  ] as const) {
    const r = moderateText(value, field);
    if (!r.ok) {
      console.warn(`[pets/POST] moderation reject ${field}:`, r.matched);
      return NextResponse.json({ error: r.reason }, { status: 400 });
    }
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

  // Pet avatars must be an animal/creature, not a human — this feeds the
  // Community showcase (studio generations of pets), so a human photo
  // shouldn't be able to slip in as a "pet".
  if (avatar_url && (await isHumanAvatar(avatar_url))) {
    return NextResponse.json(
      { error: "Pet avatars must be an animal or creature, not a person" },
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

  // Initial personality_modifiers: bootstrap empty memory containers so
  // PetMemoryManager has stable shape from turn 1 and onboarding can mirror into them.
  // Cross-pet inheritance: if the user already has pets with a user_profile,
  // we seed the new pet's USER.md with that. The owner is the same person, so
  // the new pet shouldn't cold-start with "I don't know you". Memories
  // (persistent_memories) and learned_patterns stay empty — those belong to
  // the *pet's* experience, not the owner's identity.
  const inheritedProfile: any[] = [];
  try {
    const existingPets = await prisma.pet.findMany({
      where: { user_id: user.id, is_active: true },
      select: { personality_modifiers: true },
      orderBy: { created_at: "desc" },
      take: 5,
    });
    const byKey = new Map<string, any>();
    for (const ep of existingPets) {
      const profile = (ep.personality_modifiers as any)?.user_profile;
      if (!Array.isArray(profile)) continue;
      for (const entry of profile) {
        // Prefer most-recently-updated version of each key
        const cur = byKey.get(entry.key);
        if (!cur || new Date(entry.updatedAt) > new Date(cur.updatedAt)) {
          byKey.set(entry.key, entry);
        }
      }
    }
    inheritedProfile.push(...byKey.values());
  } catch (e) {
    console.error("USER.md inheritance lookup failed:", e);
  }

  const initialMods: Record<string, any> = {
    persistent_memories: [],
    user_profile: inheritedProfile,
    interaction_history: [],
    combos_unlocked: [],
  };
  if (species_name) initialMods.species_name = species_name;
  if (custom_traits) initialMods.custom_traits = custom_traits;

  const pet = await prisma.pet.create({
    data: {
      user_id: user.id,
      name,
      species: species ?? 0,
      personality_type: finalPersonality,
      ...(avatar_url ? { avatar_url } : {}),
      ...(appearanceDesc ? { appearance_desc: appearanceDesc } : {}),
      personality_modifiers: initialMods as any,
    },
  });

  // Birth memory + first impression of the pet's own personality
  await prisma.petMemory.createMany({
    data: [
      {
        pet_id: pet.id,
        memory_type: "birth",
        content: `${name} was born! A new adventure begins.`,
        emotion: "happy",
        importance: 5,
      },
      {
        pet_id: pet.id,
        memory_type: "self",
        content: `I am ${name}, a ${finalPersonality} ${species_name || "companion"}. I just met my owner for the first time.`,
        emotion: "curious",
        importance: 4,
      },
    ],
  });

  // Create a community generation record so the pet shows up in the social feed
  if (avatar_url) {
    await prisma.generation.create({
      data: {
        user_id: user.id,
        pet_type: species ?? 0,
        style: 0,
        prompt: `${name} — newly adopted ${species_name || "pet"} companion`,
        duration: 0,
        photo_path: avatar_url,
        status: "completed",
        credits_charged: 0,
        completed_at: new Date(),
      },
    }).catch(() => {}); // non-fatal
  }

  return NextResponse.json(pet, { status: 201 });
}
