import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { SKILL_DB } from "@/lib/skills";
import { rateLimit } from "@/lib/rateLimit";
import { AdventureClaimError, commitAdventureClaim } from "@/lib/adventureClaim";
import { NextRequest, NextResponse } from "next/server";

// POST /api/adventure — Execute an adventure action (wild, explore, gym)
export async function POST(req: NextRequest) {
  try {
    const rl = rateLimit(req, { key: "adventure", limit: 20, windowMs: 60_000 });
    if (!rl.ok) return rl.response;

    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const mode = body?.mode;
    const pet_id = Number(body?.pet_id);
    if (!Number.isInteger(pet_id) || pet_id <= 0 || !mode) {
      return NextResponse.json({ error: "pet_id and mode required" }, { status: 400 });
    }

    const pet = await prisma.pet.findFirst({
      where: { id: pet_id, user_id: user.id, is_active: true },
      include: { skills: true },
    });
    if (!pet) return NextResponse.json({ error: "Pet not found" }, { status: 404 });

    if (mode !== "wild" && mode !== "explore" && mode !== "gym") {
      return NextResponse.json({ error: "Invalid mode" }, { status: 400 });
    }

    switch (mode) {
      case "wild": return handleWildEncounter(user, pet);
      case "explore": return handleExplore(user, pet);
      case "gym": return handleGym(user, pet);
      default: return NextResponse.json({ error: "Invalid mode" }, { status: 400 });
    }
  } catch (error) {
    if (error instanceof AdventureClaimError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
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
    outcomes.push(`Found treasure near ${wild.name}!`);
  } else {
    // It fled
    expGain = 8;
    outcomes.push(`${wild.name} fled before you could react!`);
  }

  const claim = await commitAdventureClaim({
    userId: user.id,
    petId: pet.id,
    mode: "wild",
    energyCost: 15,
    experienceGain: expGain,
    happinessChange: 3,
    creditsRequested: creditsGain,
    skillKey: skillDropped,
  });

  skillDropped = claim.skillGranted;
  if (skillDropped) {
    const skill = SKILL_DB.find((candidate) => candidate.key === skillDropped);
    outcomes.push(`Learned ${skill?.name ?? skillDropped} from ${wild.name}!`);
  }
  if (creditsGain > 0) {
    outcomes.push(
      claim.creditsGranted > 0
        ? `+${claim.creditsGranted} credits${claim.creditsGranted < creditsGain ? " (daily cap applied)" : ""}`
        : "Daily earned-credit limit reached; no credits awarded.",
    );
  }

  return NextResponse.json({
    mode: "wild",
    wild_pet: wild,
    outcomes,
    rewards: { exp: expGain, credits: claim.creditsGranted, skill: skillDropped },
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
      outcomes.push(`Found treasure in ${location.name}!`);

      // 8% chance to find a skill scroll
      if (Math.random() < 0.08) {
        const learnedKeys = new Set(pet.skills.map((s: any) => s.skill_key));
        const available = SKILL_DB.filter(
          (s) => !learnedKeys.has(s.key) && s.levelReq <= pet.level + 5 && s.rarity >= 3
        );
        if (available.length > 0) {
          const skill = available[Math.floor(Math.random() * available.length)];
          skillDropped = skill.key;
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

  const claim = await commitAdventureClaim({
    userId: user.id,
    petId: pet.id,
    mode: "explore",
    energyCost,
    experienceGain: expGain,
    happinessChange,
    creditsRequested: creditsGain,
    skillKey: skillDropped,
  });

  skillDropped = claim.skillGranted;
  if (skillDropped) {
    const skill = SKILL_DB.find((candidate) => candidate.key === skillDropped);
    outcomes.push(`Discovered a skill scroll: ${skill?.name ?? skillDropped}!`);
  }
  if (creditsGain > 0) {
    outcomes.push(
      claim.creditsGranted > 0
        ? `Found ${claim.creditsGranted} credits${claim.creditsGranted < creditsGain ? " (daily cap applied)" : ""}!`
        : "Daily earned-credit limit reached; no credits awarded.",
    );
  }

  return NextResponse.json({
    mode: "explore",
    location,
    outcomes,
    rewards: { exp: expGain, credits: claim.creditsGranted, happiness: happinessChange, skill: skillDropped },
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

  const claim = await commitAdventureClaim({
    userId: user.id,
    petId: pet.id,
    mode: "gym",
    energyCost: 20,
    experienceGain: expGain,
    happinessChange: success ? 5 : 2,
  });

  if (claim.leveledUp) {
    outcomes.push(`🎉 Level Up! Now Lv.${claim.level}!`);
  }

  return NextResponse.json({
    mode: "gym",
    challenge,
    success,
    leveled_up: claim.leveledUp,
    outcomes,
    rewards: { exp: expGain },
  });
}
