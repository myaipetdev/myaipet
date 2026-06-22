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
      data: { season_points: { increment: points } },
    });

    // Log not needed with raw SQL tables, but we track in user.season_points
    return { points, reason };
  } catch (e) {
    console.error("Award points error:", e);
    return { points: 0 };
  }
}

// Per-user/day ceilings on "soft" (free, repeatable) airdrop earnings. Without
// these, actions like `interact` can be scripted to mint the airdrop allocation
// currency at near-zero cost (audit H5) and there is no bound on total emission
// (audit M5). Hard-gated actions (purchases, evolutions) are not capped here.
export const DAILY_POINT_CAPS: Record<string, number> = {
  interact: 150,    // ≈30 interactions/day count toward the airdrop
  catch: 300,       // Cat/dog catches (points scaled by rarity, capped/day)
  card_battle: 40,  // Card duels (small, anti-spam)
  studio_gen: 120,  // Studio generations (World Cup pet, card art, etc.)
  worldcup: 30,     // World Cup national-pet + champion prediction
};

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Award airdrop points for a repeatable action, enforcing a per-user/day cap
 * tracked in DailyActionCount (action_key = "ap:<reason>"). Grants only the
 * remaining headroom (possibly 0). Soft cap — a tiny overage is possible under
 * heavy concurrency, which is acceptable for an anti-farm ceiling.
 */
export async function awardPointsCapped(
  userId: number,
  reason: string,
  perActionPoints: number,
  dailyCap: number,
) {
  if (perActionPoints <= 0 || dailyCap <= 0) return { points: 0 };
  const day = todayKey();
  const action_key = `ap:${reason}`;
  try {
    const granted = await prisma.$transaction(async (tx) => {
      const row = await tx.dailyActionCount.upsert({
        where: { user_action_day: { user_id: userId, action_key, day } },
        create: { user_id: userId, action_key, day, count: 0 },
        update: {},
      });
      const remaining = Math.max(0, dailyCap - row.count);
      const give = Math.min(perActionPoints, remaining);
      if (give <= 0) return 0;
      await tx.dailyActionCount.update({ where: { id: row.id }, data: { count: { increment: give } } });
      await tx.user.update({ where: { id: userId }, data: { season_points: { increment: give } } });
      return give;
    });
    return { points: granted, reason, capped: granted < perActionPoints };
  } catch (e) {
    console.error("Award capped points error:", e);
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
