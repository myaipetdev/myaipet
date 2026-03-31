import { prisma } from "./prisma";

// Points for different actions
const POINT_REWARDS: Record<string, number> = {
  interact: 5,        // Feed, play, talk etc
  generate_image: 10, // Create an image
  generate_video: 25, // Create a video
  level_up: 50,       // Pet levels up
  evolve: 200,        // Pet evolves to next stage
  daily_login: 10,    // First action of the day
  streak_7: 100,      // 7-day streak bonus
  streak_30: 500,     // 30-day streak bonus
};

export async function awardPoints(
  userId: number,
  petId: number | null,
  reason: keyof typeof POINT_REWARDS
) {
  const points = POINT_REWARDS[reason] || 0;
  if (points === 0) return { points: 0 };

  try {
    await prisma.user.update({
      where: { id: userId },
      data: { airdrop_points: { increment: points } },
    });

    // Log not needed with raw SQL tables, but we track in user.airdrop_points
    return { points, reason };
  } catch (e) {
    console.error("Award points error:", e);
    return { points: 0 };
  }
}

// Evolution stages with requirements
export const EVOLUTION_STAGES = [
  { stage: 0, name: "Baby", minLevel: 1, icon: "🥚" },
  { stage: 1, name: "Youth", minLevel: 5, icon: "🐣" },
  { stage: 2, name: "Teen", minLevel: 10, icon: "⭐" },
  { stage: 3, name: "Adult", minLevel: 20, icon: "🔥" },
  { stage: 4, name: "Elder", minLevel: 35, icon: "👑" },
  { stage: 5, name: "Legendary", minLevel: 50, icon: "💎" },
];

export function getEvolutionStage(level: number) {
  let current = EVOLUTION_STAGES[0];
  for (const stage of EVOLUTION_STAGES) {
    if (level >= stage.minLevel) current = stage;
    else break;
  }
  return current;
}

export function getNextEvolution(level: number) {
  const current = getEvolutionStage(level);
  const nextIdx = EVOLUTION_STAGES.findIndex(s => s.stage === current.stage) + 1;
  return nextIdx < EVOLUTION_STAGES.length ? EVOLUTION_STAGES[nextIdx] : null;
}
