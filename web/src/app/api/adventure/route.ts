import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { SKILL_DB, SKILL_MAP, SPECIES_ELEMENTS } from "@/lib/skills";
import { NextRequest, NextResponse } from "next/server";

// POST /api/adventure — Execute an adventure action (wild, explore, gym)
export async function POST(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { mode, pet_id } = await req.json();
    if (!pet_id || !mode) {
      return NextResponse.json({ error: "pet_id and mode required" }, { status: 400 });
    }

    const pet = await prisma.pet.findFirst({
      where: { id: pet_id, user_id: user.id, is_active: true },
      include: { skills: true },
    });
    if (!pet) return NextResponse.json({ error: "Pet not found" }, { status: 404 });

    // Energy check — calculate actual cost based on mode before checking
    const energyCostMap: Record<string, number> = { wild: 15, explore: 20, gym: 20 };
    const minEnergyCost = energyCostMap[mode];
    if (minEnergyCost === undefined) {
      return NextResponse.json({ error: "Invalid mode" }, { status: 400 });
    }
    if (pet.energy < minEnergyCost) {
      return NextResponse.json({ error: "Not enough energy. Let your pet rest!" }, { status: 400 });
    }

    switch (mode) {
      case "wild": return handleWildEncounter(user, pet);
      case "explore": return handleExplore(user, pet);
      case "gym": return handleGym(user, pet);
      default: return NextResponse.json({ error: "Invalid mode" }, { status: 400 });
    }
  } catch (error) {
    console.error("Adventure error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ── Wild Encounter ──
// Meet a wild pet, chance to learn a new skill or gain items
async function handleWildEncounter(user: any, pet: any) {
  const WILD_PETS = [
    { name: "Mossy Frog", emoji: "🐸", element: "grass", rarity: "common" },
    { name: "Shadow Fox", emoji: "🦊", element: "fire", rarity: "uncommon" },
    { name: "Crystal Bunny", emoji: "🐰", element: "normal", rarity: "rare" },
    { name: "Thunder Pup", emoji: "🐶", element: "electric", rarity: "uncommon" },
    { name: "Mystic Owl", emoji: "🦉", element: "normal", rarity: "rare" },
    { name: "Flame Lizard", emoji: "🦎", element: "fire", rarity: "uncommon" },
    { name: "Coral Turtle", emoji: "🐢", element: "water", rarity: "common" },
    { name: "Starlight Cat", emoji: "🐱", element: "electric", rarity: "rare" },
    { name: "Berry Hamster", emoji: "🐹", element: "grass", rarity: "common" },
    { name: "Wind Parrot", emoji: "🦜", element: "grass", rarity: "uncommon" },
    { name: "Magma Drake", emoji: "🐉", element: "fire", rarity: "rare" },
    { name: "Tide Shark", emoji: "🦈", element: "water", rarity: "uncommon" },
  ];

  const wild = WILD_PETS[Math.floor(Math.random() * WILD_PETS.length)];
  const roll = Math.random();

  const outcomes: string[] = [];
  let expGain = 15;
  let creditsGain = 0;
  let skillDropped: string | null = null;

  // Encounter resolution based on rarity
  if (wild.rarity === "rare" && roll < 0.15) {
    // Rare encounter + skill discovery (15% chance)
    const learnedKeys = new Set(pet.skills.map((s: any) => s.skill_key));
    const droppable = SKILL_DB.filter(
      (s) =>
        !learnedKeys.has(s.key) &&
        s.levelReq <= pet.level + 3 &&
        (s.element === wild.element || s.element === "normal") &&
        s.rarity >= 2
    );
    if (droppable.length > 0) {
      const drop = droppable[Math.floor(Math.random() * droppable.length)];
      skillDropped = drop.key;
      await prisma.petSkill.create({
        data: { pet_id: pet.id, skill_key: drop.key, level: 1, slot: null },
      });
      outcomes.push(`Learned ${drop.name} from ${wild.name}!`);
    }
    expGain = 30;
  } else if (roll < 0.4) {
    // Befriend — bonus exp
    expGain = 25;
    outcomes.push(`${wild.name} is friendly! Bonus EXP!`);
  } else if (roll < 0.65) {
    // Fight and win — normal rewards
    expGain = 20;
    creditsGain = 5;
    outcomes.push(`Defeated ${wild.name} in a quick scuffle!`);
  } else if (roll < 0.85) {
    // Find item
    creditsGain = 10 + Math.floor(Math.random() * 15);
    outcomes.push(`Found treasure near ${wild.name}! +${creditsGain} credits`);
  } else {
    // It fled
    expGain = 8;
    outcomes.push(`${wild.name} fled before you could react!`);
  }

  // Apply rewards
  await prisma.$transaction([
    prisma.pet.update({
      where: { id: pet.id },
      data: {
        experience: { increment: expGain },
        energy: { decrement: 15 },
        happiness: { increment: 3 },
      },
    }),
    ...(creditsGain > 0
      ? [prisma.user.update({ where: { id: user.id }, data: { credits: { increment: creditsGain } } })]
      : []),
  ]);

  return NextResponse.json({
    mode: "wild",
    wild_pet: wild,
    outcomes,
    rewards: { exp: expGain, credits: creditsGain, skill: skillDropped },
  });
}

// ── Explore ──
// Send pet on a timed adventure — discover skills, treasure, or training
async function handleExplore(user: any, pet: any) {
  const LOCATIONS = [
    { name: "Ancient Ruins", emoji: "🏚️", type: "treasure", desc: "Crumbling stones hide wealth" },
    { name: "Sunlit Meadow", emoji: "🌻", type: "rest", desc: "Warm grass and gentle breeze" },
    { name: "Training Dojo", emoji: "🥋", type: "training", desc: "A master awaits within" },
    { name: "Crystal Cave", emoji: "💎", type: "treasure", desc: "Gems line the walls" },
    { name: "Hot Springs", emoji: "♨️", type: "rest", desc: "Rejuvenating waters" },
    { name: "Obstacle Course", emoji: "🏋️", type: "training", desc: "Test your limits" },
    { name: "Pirate Cove", emoji: "🏴‍☠️", type: "treasure", desc: "X marks the spot" },
    { name: "Zen Garden", emoji: "🌿", type: "rest", desc: "Inner peace and recovery" },
    { name: "Sparring Ring", emoji: "🥊", type: "training", desc: "Practice makes perfect" },
  ];

  const location = LOCATIONS[Math.floor(Math.random() * LOCATIONS.length)];
  let expGain = 12;
  let creditsGain = 0;
  let happinessChange = 0;
  let energyCost = 20;
  let skillDropped: string | null = null;
  const outcomes: string[] = [];

  switch (location.type) {
    case "treasure": {
      creditsGain = 8 + Math.floor(Math.random() * 20);
      expGain = 15;
      outcomes.push(`Found ${creditsGain} credits in ${location.name}!`);

      // 8% chance to find a skill scroll
      if (Math.random() < 0.08) {
        const learnedKeys = new Set(pet.skills.map((s: any) => s.skill_key));
        const available = SKILL_DB.filter(
          (s) => !learnedKeys.has(s.key) && s.levelReq <= pet.level + 5 && s.rarity >= 3
        );
        if (available.length > 0) {
          const skill = available[Math.floor(Math.random() * available.length)];
          skillDropped = skill.key;
          await prisma.petSkill.create({
            data: { pet_id: pet.id, skill_key: skill.key, level: 1, slot: null },
          });
          outcomes.push(`Discovered a skill scroll: ${skill.name}!`);
        }
      }
      break;
    }
    case "rest": {
      happinessChange = 10;
      energyCost = 5; // Rest costs less energy
      outcomes.push(`${pet.name} relaxed at ${location.name}. Happiness up!`);
      break;
    }
    case "training": {
      expGain = 25;
      energyCost = 25;
      outcomes.push(`Intense training at ${location.name}! Big EXP gain!`);
      break;
    }
  }

  await prisma.$transaction([
    prisma.pet.update({
      where: { id: pet.id },
      data: {
        experience: { increment: expGain },
        energy: { decrement: Math.min(energyCost, pet.energy) },
        happiness: { increment: happinessChange },
      },
    }),
    ...(creditsGain > 0
      ? [prisma.user.update({ where: { id: user.id }, data: { credits: { increment: creditsGain } } })]
      : []),
  ]);

  return NextResponse.json({
    mode: "explore",
    location,
    outcomes,
    rewards: { exp: expGain, credits: creditsGain, happiness: happinessChange, skill: skillDropped },
  });
}

// ── Gym Challenge ──
// Train specific stats — focused stat improvement
async function handleGym(user: any, pet: any) {
  const CHALLENGES = [
    { name: "Power Training", stat: "atk", emoji: "💪", desc: "Boost your attack power" },
    { name: "Endurance Run", stat: "def", emoji: "🛡️", desc: "Toughen up your defense" },
    { name: "Speed Drill", stat: "spd", emoji: "🏃", desc: "Improve reaction time" },
    { name: "Meditation", stat: "bond", emoji: "🧘", desc: "Deepen your bond" },
  ];

  const challenge = CHALLENGES[Math.floor(Math.random() * CHALLENGES.length)];
  const success = Math.random() < 0.7 + (pet.level * 0.005); // Higher level = more success
  const expGain = success ? 20 : 10;
  const outcomes: string[] = [];

  if (success) {
    outcomes.push(`${challenge.emoji} ${challenge.name} complete! Great workout!`);
    outcomes.push(`+${expGain} EXP`);
  } else {
    outcomes.push(`${challenge.emoji} ${challenge.name} was too tough this time...`);
    outcomes.push(`+${expGain} EXP (participation)`);
  }

  // Level up check
  const newExp = pet.experience + expGain;
  const expNeeded = pet.level * 100;
  const leveledUp = newExp >= expNeeded;

  await prisma.pet.update({
    where: { id: pet.id },
    data: leveledUp
      ? {
          experience: { set: newExp - expNeeded },
          level: { increment: 1 },
          energy: { decrement: Math.min(20, pet.energy) },
          happiness: { increment: success ? 5 : 2 },
        }
      : {
          experience: { increment: expGain },
          energy: { decrement: Math.min(20, pet.energy) },
          happiness: { increment: success ? 5 : 2 },
        },
  });

  if (leveledUp) {
    outcomes.push(`🎉 Level Up! Now Lv.${pet.level + 1}!`);
  }

  return NextResponse.json({
    mode: "gym",
    challenge,
    success,
    leveled_up: leveledUp,
    outcomes,
    rewards: { exp: expGain },
  });
}
