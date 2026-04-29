import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { awardPoints } from "@/lib/airdrop";
import {
  BASE_EFFECTS,
  applyPersonality,
  gateInteraction,
  detectCombo,
  generateRequest,
  intimacyMultiplier,
  type InteractionType,
} from "@/lib/petMechanics";
import { NextRequest, NextResponse } from "next/server";

const VALID_TYPES = Object.keys(BASE_EFFECTS) as InteractionType[];

const SPECIES_MAP: Record<number, string> = {
  0: "cat", 1: "dog", 2: "parrot", 3: "turtle",
  4: "hamster", 5: "rabbit", 6: "fox", 7: "pomeranian",
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function generateResponse(
  petName: string,
  species: string,
  personality: string,
  interactionType: string
): string {
  const responses: Record<string, string[]> = {
    feed: [`${petName} happily munches on the food!`, `${petName} beams with joy at the delicious meal!`, `The ${species} gobbles up every last bite!`],
    play: [`${petName} bounces around excitedly!`, `The ${personality} ${species} plays enthusiastically!`, `${petName} is having so much fun playing with you!`],
    talk: [`${petName} listens intently and tilts their head.`, `The ${species} seems to understand every word!`, `${petName} responds with a cheerful sound!`],
    pet:  [`${petName} nuzzles against your hand.`, `The ${species} relaxes contentedly as you pet them.`, `${petName} closes their eyes in bliss!`],
    walk: [`${petName} trots happily beside you!`, `The ${personality} ${species} explores everything on the walk!`, `${petName} found something interesting on the path!`],
    train:[`${petName} focuses hard and learns something new!`, `The ${species} is getting smarter with each session!`, `${petName} nailed the training exercise!`],
  };
  const options = responses[interactionType] || [`${petName} responds happily!`];
  return options[Math.floor(Math.random() * options.length)];
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ petId: string }> }
) {
  const user = await getUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { petId } = await params;
  const body = await req.json();
  const interaction_type = body.interaction_type as InteractionType;

  if (!interaction_type || !VALID_TYPES.includes(interaction_type)) {
    return NextResponse.json(
      { error: `Invalid interaction_type. Valid types: ${VALID_TYPES.join(", ")}` },
      { status: 400 }
    );
  }

  const pet = await prisma.pet.findFirst({
    where: { id: Number(petId), user_id: user.id, is_active: true },
  });

  if (!pet) {
    return NextResponse.json({ error: "Pet not found" }, { status: 404 });
  }

  // ── Gate check (energy/hunger) ──
  const blocked = gateInteraction(interaction_type, {
    energy: pet.energy,
    hunger: pet.hunger,
    happiness: pet.happiness,
  });
  if (blocked) {
    return NextResponse.json(
      { error: blocked, blocked: true, reason: blocked },
      { status: 400 }
    );
  }

  // ── Apply personality modifiers ──
  const base = BASE_EFFECTS[interaction_type];
  const adjusted = applyPersonality(interaction_type, pet.personality_type, base);

  // ── Read pending request and history from JSON modifiers ──
  const mods: any = pet.personality_modifiers || {};
  const history: InteractionType[] = Array.isArray(mods.interaction_history) ? mods.interaction_history : [];
  const pendingRequest = mods.pending_request;
  const combosUnlocked: string[] = Array.isArray(mods.combos_unlocked) ? mods.combos_unlocked : [];

  // ── Check if fulfilling request ──
  let requestFulfilled: { name: string; bonus: { happiness: number; bond: number; exp: number } } | null = null;
  let stillValidRequest = pendingRequest;
  if (pendingRequest && pendingRequest.type) {
    const expired = pendingRequest.expiresAt && new Date(pendingRequest.expiresAt).getTime() < Date.now();
    if (expired) {
      stillValidRequest = null;
    } else if (pendingRequest.type === interaction_type) {
      requestFulfilled = {
        name: "Request Fulfilled",
        bonus: pendingRequest.reward || { happiness: 10, bond: 5, exp: 5 },
      };
      stillValidRequest = null; // consumed
    }
  }

  // ── Combo detection ──
  const newHistory = [...history, interaction_type].slice(-8); // keep last 8
  const combo = detectCombo(newHistory);
  let comboBonus = { happiness: 0, energy: 0, hunger: 0, exp: 0, bond: 0 };
  if (combo) {
    comboBonus = { happiness: 0, energy: 0, hunger: 0, exp: 0, bond: 0, ...combo.bonusEffects };
  }

  // ── Calculate final stats ──
  const intimacyMult = intimacyMultiplier(pet.personality_type, interaction_type);
  const bondGain = Math.round(adjusted.bond * intimacyMult);

  const reqHap = requestFulfilled?.bonus.happiness || 0;
  const reqBond = requestFulfilled?.bonus.bond || 0;
  const reqExp = requestFulfilled?.bonus.exp || 0;

  const newHappiness = clamp(pet.happiness + adjusted.happiness + comboBonus.happiness + reqHap, 0, 100);
  const newEnergy = clamp(pet.energy + adjusted.energy + comboBonus.energy, 0, 100);
  const newHunger = clamp(pet.hunger + adjusted.hunger + comboBonus.hunger, 0, 100);
  const newExperience = pet.experience + adjusted.exp + comboBonus.exp + reqExp;
  const newBondLevel = clamp(pet.bond_level + bondGain + comboBonus.bond + reqBond, 0, 100);
  const newLevel = Math.floor(newExperience / 100) + 1;
  const leveledUp = newLevel > pet.level;

  const species = mods.species_name || SPECIES_MAP[pet.species] || pet.name;
  const responseText = generateResponse(pet.name, species, pet.personality_type, interaction_type);

  // ── Generate next event request (if no current valid one) ──
  let nextRequest = stillValidRequest;
  if (!nextRequest) {
    nextRequest = generateRequest(
      { energy: newEnergy, hunger: newHunger, happiness: newHappiness, bond_level: newBondLevel, last_interaction_at: new Date() },
      pet.personality_type
    );
  }

  // ── Track unlocked combos ──
  let updatedCombos = combosUnlocked;
  if (combo && !combosUnlocked.includes(combo.name)) {
    updatedCombos = [...combosUnlocked, combo.name];
  }

  const updatedPet = await prisma.pet.update({
    where: { id: pet.id },
    data: {
      happiness: newHappiness,
      energy: newEnergy,
      hunger: newHunger,
      experience: newExperience,
      level: newLevel,
      bond_level: newBondLevel,
      total_interactions: pet.total_interactions + 1,
      last_interaction_at: new Date(),
      personality_modifiers: {
        ...mods,
        interaction_history: newHistory,
        pending_request: nextRequest,
        combos_unlocked: updatedCombos,
      } as any,
    },
  });

  await prisma.petInteraction.create({
    data: {
      pet_id: pet.id,
      user_id: user.id,
      interaction_type,
      response_text: responseText,
      happiness_change: adjusted.happiness + comboBonus.happiness + reqHap,
      energy_change: adjusted.energy + comboBonus.energy,
      hunger_change: adjusted.hunger + comboBonus.hunger,
      experience_gained: adjusted.exp + comboBonus.exp + reqExp,
    },
  });

  await prisma.petMemory.create({
    data: {
      pet_id: pet.id,
      memory_type: combo ? "combo" : "interaction",
      content: combo
        ? `${combo.emoji} ${combo.name} combo activated! ${combo.description}`
        : responseText,
      emotion: newHappiness >= 70 ? "happy" : newHappiness >= 40 ? "calm" : "sad",
      importance: leveledUp ? 3 : combo ? 4 : 1,
    },
  });

  // Award airdrop points
  const pointsResult = await awardPoints(user.id, pet.id, "interact");
  if (leveledUp) await awardPoints(user.id, pet.id, "level_up");
  if (combo) await awardPoints(user.id, pet.id, "interact"); // bonus

  return NextResponse.json({
    pet: updatedPet,
    interaction: {
      type: interaction_type,
      response: responseText,
      effects: {
        happiness: adjusted.happiness + comboBonus.happiness + reqHap,
        energy: adjusted.energy + comboBonus.energy,
        hunger: adjusted.hunger + comboBonus.hunger,
        experience: adjusted.exp + comboBonus.exp + reqExp,
        bond: bondGain + comboBonus.bond + reqBond,
      },
      leveled_up: leveledUp,
      points_earned: pointsResult.points + (leveledUp ? 50 : 0) + (combo ? 30 : 0),
      combo: combo
        ? { name: combo.name, description: combo.description, emoji: combo.emoji }
        : null,
      request_fulfilled: requestFulfilled,
      next_request: nextRequest,
    },
  });
}

// ── GET: returns current pending request without performing action ──
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ petId: string }> }
) {
  const user = await getUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { petId } = await params;
  const pet = await prisma.pet.findFirst({
    where: { id: Number(petId), user_id: user.id, is_active: true },
  });
  if (!pet) return NextResponse.json({ error: "Pet not found" }, { status: 404 });

  const mods: any = pet.personality_modifiers || {};
  let request = mods.pending_request;

  // Drop expired
  if (request?.expiresAt && new Date(request.expiresAt).getTime() < Date.now()) {
    request = null;
  }

  // Generate one if missing
  if (!request) {
    request = generateRequest(
      {
        energy: pet.energy,
        hunger: pet.hunger,
        happiness: pet.happiness,
        bond_level: pet.bond_level,
        last_interaction_at: pet.last_interaction_at,
      },
      pet.personality_type
    );
    if (request) {
      await prisma.pet.update({
        where: { id: pet.id },
        data: {
          personality_modifiers: { ...mods, pending_request: request } as any,
        },
      });
    }
  }

  return NextResponse.json({
    pet_id: pet.id,
    request,
    combos_unlocked: mods.combos_unlocked || [],
    history: mods.interaction_history || [],
  });
}
