import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { awardPoints } from "@/lib/airdrop";
import { NextRequest, NextResponse } from "next/server";

const SPECIES_MAP: Record<number, string> = {
  0: "cat",
  1: "dog",
  2: "parrot",
  3: "turtle",
  4: "hamster",
  5: "rabbit",
  6: "fox",
  7: "pomeranian",
};

const INTERACTION_EFFECTS: Record<
  string,
  { happiness: number; energy: number; hunger: number; exp: number }
> = {
  feed: { happiness: 5, energy: 3, hunger: -25, exp: 5 },
  play: { happiness: 15, energy: -20, hunger: 10, exp: 10 },
  talk: { happiness: 8, energy: -3, hunger: 2, exp: 8 },
  pet: { happiness: 10, energy: 5, hunger: 2, exp: 5 },
  walk: { happiness: 12, energy: -15, hunger: 8, exp: 12 },
  train: { happiness: 3, energy: -25, hunger: 5, exp: 20 },
};

const VALID_TYPES = Object.keys(INTERACTION_EFFECTS);

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
    feed: [
      `${petName} happily munches on the food!`,
      `${petName} beams with joy at the delicious meal!`,
      `The ${species} gobbles up every last bite!`,
    ],
    play: [
      `${petName} bounces around excitedly!`,
      `The ${personality} ${species} plays enthusiastically!`,
      `${petName} is having so much fun playing with you!`,
    ],
    talk: [
      `${petName} listens intently and tilts their head.`,
      `The ${species} seems to understand every word!`,
      `${petName} responds with a cheerful sound!`,
    ],
    pet: [
      `${petName} nuzzles against your hand.`,
      `The ${species} relaxes contentedly as you pet them.`,
      `${petName} closes their eyes in bliss!`,
    ],
    walk: [
      `${petName} trots happily beside you!`,
      `The ${personality} ${species} explores everything on the walk!`,
      `${petName} found something interesting on the path!`,
    ],
    train: [
      `${petName} focuses hard and learns something new!`,
      `The ${species} is getting smarter with each session!`,
      `${petName} nailed the training exercise!`,
    ],
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
  const { interaction_type } = body;

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

  const effects = INTERACTION_EFFECTS[interaction_type];

  const newHappiness = clamp(pet.happiness + effects.happiness, 0, 100);
  const newEnergy = clamp(pet.energy + effects.energy, 0, 100);
  const newHunger = clamp(pet.hunger + effects.hunger, 0, 100);
  const newExperience = pet.experience + effects.exp;
  const newLevel = Math.floor(newExperience / 100) + 1;
  const leveledUp = newLevel > pet.level;

  const mods = pet.personality_modifiers as any;
  const species = mods?.species_name || pet.name;
  const responseText = generateResponse(
    pet.name,
    species,
    pet.personality_type,
    interaction_type
  );

  const updatedPet = await prisma.pet.update({
    where: { id: pet.id },
    data: {
      happiness: newHappiness,
      energy: newEnergy,
      hunger: newHunger,
      experience: newExperience,
      level: newLevel,
      total_interactions: pet.total_interactions + 1,
      last_interaction_at: new Date(),
    },
  });

  await prisma.petInteraction.create({
    data: {
      pet_id: pet.id,
      user_id: user.id,
      interaction_type,
      response_text: responseText,
      happiness_change: effects.happiness,
      energy_change: effects.energy,
      hunger_change: effects.hunger,
      experience_gained: effects.exp,
    },
  });

  await prisma.petMemory.create({
    data: {
      pet_id: pet.id,
      memory_type: "interaction",
      content: responseText,
      emotion: newHappiness >= 70 ? "happy" : newHappiness >= 40 ? "calm" : "sad",
      importance: leveledUp ? 3 : 1,
    },
  });

  // Award airdrop points
  const pointsResult = await awardPoints(user.id, pet.id, "interact");
  if (leveledUp) {
    await awardPoints(user.id, pet.id, "level_up");
  }

  return NextResponse.json({
    pet: updatedPet,
    interaction: {
      type: interaction_type,
      response: responseText,
      effects: {
        happiness: effects.happiness,
        energy: effects.energy,
        hunger: effects.hunger,
        experience: effects.exp,
      },
      leveled_up: leveledUp,
      points_earned: pointsResult.points + (leveledUp ? 50 : 0),
    },
  });
}
