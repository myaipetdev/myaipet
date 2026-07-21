/**
 * Mission catalog — 50+ daily missions across 8 categories.
 *
 * Every mission has:
 *   - id          stable slug (logged in daily_missions.mission_id)
 *   - category    drives UI grouping + daily-slot picking
 *   - title/desc  user-facing copy
 *   - points      base reward; hourly drops apply a multiplier on top
 *   - verifier    "auto" → backend checks data when /missions/today runs;
 *                  "manual" → user clicks "Mark done" (and we re-check anyway)
 *   - check       (optional) the auto-verification predicate
 *
 * Daily picker (lib/missions/picker.ts) draws 5 missions per user: one
 * cheap CHECK_IN mission + 4 weighted picks from the rest of the catalog,
 * shuffled by user_id+date so the set is stable per-day.
 */

import { prisma } from "@/lib/prisma";

export type MissionCategory =
  | "checkin"
  | "conversation"
  | "memory"
  | "creation"
  | "social"
  | "care"
  | "reflection"
  | "exploration"
  | "streak";

export type Verifier = "auto" | "manual";

/**
 * Anti-gaming: self-report ("manual") missions flip to completed on pure
 * self-report, so they must NOT credit the Season RANK pool (season_points) at
 * full weight or the leaderboard is trivially gameable. They credit a small
 * capped amount to rank; the full reward still accrues to the (non-ranking)
 * lifetime loyalty ledger.
 *
 * This cap is the single source of truth, shared by the /missions/today
 * assembler, the /complete route, AND the UI — so the points a mission DISPLAYS
 * always equal what actually credits to the balance the user sees.
 */
export const MANUAL_RANK_CAP = 2;
export function seasonEffectivePoints(points: number, verifier: Verifier): number {
  return verifier === "manual" ? Math.min(points, MANUAL_RANK_CAP) : points;
}

export interface MissionTemplate {
  id: string;
  category: MissionCategory;
  title: string;
  description: string;
  points: number;
  verifier: Verifier;
  /**
   * For auto-verified missions: predicate that returns true once the user
   * has satisfied the condition today. Implementations query the DB.
   * @returns true if the mission should be marked completed now.
   */
  check?: (userId: number, todayUtc: string) => Promise<boolean>;
  /**
   * Where in the app the user should go to complete this. Used by the UI to
   * surface a CTA button on each pending mission.
   */
  cta?: { label: string; href: string };
}

// ── Helper queries used by `check` ───────────────────────────────────────
const todayRange = (todayUtc: string) => {
  const start = new Date(`${todayUtc}T00:00:00.000Z`);
  const end = new Date(`${todayUtc}T23:59:59.999Z`);
  return { gte: start, lte: end };
};

async function countToday(userId: number, todayUtc: string, type: string) {
  return prisma.petInteraction.count({
    where: { user_id: userId, interaction_type: type, created_at: todayRange(todayUtc) },
  });
}
async function countGenerationsToday(userId: number, todayUtc: string) {
  return prisma.generation.count({
    where: { user_id: userId, created_at: todayRange(todayUtc) },
  });
}
async function countMemoriesToday(userId: number, todayUtc: string) {
  const pets = await prisma.pet.findMany({
    where: { user_id: userId },
    select: { id: true },
  });
  if (!pets.length) return 0;
  return prisma.petMemory.count({
    where: {
      pet_id: { in: pets.map(p => p.id) },
      created_at: todayRange(todayUtc),
    },
  });
}
async function countCommentsToday(userId: number, todayUtc: string) {
  return prisma.comment.count({
    where: { user_id: userId, created_at: todayRange(todayUtc) },
  });
}
async function countLikesToday(userId: number, todayUtc: string) {
  return prisma.like.count({
    where: { user_id: userId, created_at: todayRange(todayUtc) },
  });
}
async function countFollowsToday(userId: number, todayUtc: string) {
  return prisma.follow.count({
    where: { follower_id: userId, created_at: todayRange(todayUtc) },
  });
}

// ── Catalog ───────────────────────────────────────────────────────────────
export const MISSION_CATALOG: MissionTemplate[] = [
  // ── CHECK-IN (always one in daily set) ─────────────────────────────
  {
    id: "check_in",
    category: "checkin",
    title: "Daily check-in",
    description: "Tap check-in. Counts as 1 day for your streak.",
    points: 5,
    verifier: "auto",
    cta: { label: "Check in", href: "/?section=home" },
    check: async (u, d) => (await countToday(u, d, "checkin")) > 0,
  },

  // ── CONVERSATION (10) ──────────────────────────────────────────────
  {
    id: "say_hi",
    category: "conversation",
    title: "Say hi to your pet",
    description: "One message in chat is enough.",
    points: 5, verifier: "auto",
    cta: { label: "Open chat", href: "/?section=my pet" },
    check: async (u, d) => (await countToday(u, d, "chat")) > 0,
  },
  {
    id: "chat_5",
    category: "conversation",
    title: "Five-message conversation",
    description: "Have a real back-and-forth (5+ chat turns).",
    points: 10, verifier: "auto",
    cta: { label: "Open chat", href: "/?section=my pet" },
    check: async (u, d) => (await countToday(u, d, "chat")) >= 5,
  },
  {
    id: "chat_10",
    category: "conversation",
    title: "Ten-message conversation",
    description: "Deeper hang. 10+ turns today.",
    points: 15, verifier: "auto",
    cta: { label: "Open chat", href: "/?section=my pet" },
    check: async (u, d) => (await countToday(u, d, "chat")) >= 10,
  },
  {
    id: "ask_about_dream",
    category: "conversation",
    title: "Ask your pet about their dream",
    description: "Open today's chat by asking about last night's dream.",
    points: 10, verifier: "manual",
    cta: { label: "Ask about dream", href: "/?section=my pet" },
  },
  {
    id: "share_day",
    category: "conversation",
    title: "Tell your pet about your day",
    description: "Vent. They'll remember.",
    points: 10, verifier: "manual",
    cta: { label: "Open chat", href: "/?section=my pet" },
  },
  {
    id: "ask_advice",
    category: "conversation",
    title: "Ask your pet for advice",
    description: "On anything — work, life, weather. They'll have an opinion.",
    points: 10, verifier: "manual",
    cta: { label: "Ask for advice", href: "/?section=my pet" },
  },
  {
    id: "ask_fear",
    category: "conversation",
    title: "Ask what your pet is afraid of",
    description: "Their answer will tell you about their persona.",
    points: 10, verifier: "manual",
    cta: { label: "Ask", href: "/?section=my pet" },
  },
  {
    id: "share_secret",
    category: "conversation",
    title: "Tell your pet a secret",
    description: "Goes into their memory ledger. Only they see it.",
    points: 15, verifier: "manual",
    cta: { label: "Share secret", href: "/?section=my pet" },
  },
  {
    id: "teach_fact",
    category: "conversation",
    title: "Teach your pet one new fact about you",
    description: "Anything — favorite food, where you grew up.",
    points: 10, verifier: "manual",
    cta: { label: "Teach pet", href: "/?section=my pet" },
  },
  {
    id: "joke_today",
    category: "conversation",
    title: "Tell your pet a joke",
    description: "See if they laugh.",
    points: 10, verifier: "manual",
    cta: { label: "Joke time", href: "/?section=my pet" },
  },

  // ── MEMORY (5) ─────────────────────────────────────────────────────
  {
    id: "memory_1",
    category: "memory",
    title: "Create a memory",
    description: "Any meaningful chat triggers memory extraction.",
    points: 10, verifier: "auto",
    cta: { label: "Open chat", href: "/?section=my pet" },
    check: async (u, d) => (await countMemoriesToday(u, d)) >= 1,
  },
  {
    id: "memory_3",
    category: "memory",
    title: "Three new memories",
    description: "Have a longer conversation today (3+ memories formed).",
    points: 20, verifier: "auto",
    cta: { label: "Open chat", href: "/?section=my pet" },
    check: async (u, d) => (await countMemoriesToday(u, d)) >= 3,
  },
  {
    id: "review_memories",
    category: "memory",
    title: "Review last week's memories",
    description: "Visit your pet's memory ledger.",
    points: 10, verifier: "manual",
    cta: { label: "Open memories", href: "/?section=my pet" },
  },
  {
    id: "export_soul",
    category: "memory",
    title: "Export your pet's SOUL",
    description: "Export a signed snapshot of supported memory and persona data.",
    points: 15, verifier: "manual",
    cta: { label: "Export SOUL", href: "/sovereignty" },
  },
  {
    id: "dream_view",
    category: "memory",
    title: "Read your pet's dream journal",
    description: "Pet dreams while you sleep. Catch up on what they imagined.",
    points: 10, verifier: "manual",
    cta: { label: "Open dreams", href: "/?section=my pet" },
  },

  // ── CREATION (Studio) (6) ──────────────────────────────────────────
  {
    id: "gen_image_1",
    category: "creation",
    title: "Generate one image in Studio",
    description: "Free FLUX schnell counts.",
    points: 15, verifier: "auto",
    cta: { label: "Open Studio", href: "/studio" },
    check: async (u, d) => (await countGenerationsToday(u, d)) >= 1,
  },
  {
    id: "gen_3",
    category: "creation",
    title: "Three generations today",
    description: "Iterate on a scene. 3 generations.",
    points: 25, verifier: "auto",
    cta: { label: "Open Studio", href: "/studio" },
    check: async (u, d) => (await countGenerationsToday(u, d)) >= 3,
  },
  {
    id: "try_new_style",
    category: "creation",
    title: "Try a new style in Studio",
    description: "Pick a style you haven't used before.",
    points: 10, verifier: "manual",
    cta: { label: "Open Studio", href: "/studio" },
  },
  {
    id: "gen_video",
    category: "creation",
    title: "Make one video",
    description: "Switch Studio output to Video and generate.",
    points: 20, verifier: "manual",
    cta: { label: "Open Studio", href: "/studio" },
  },
  {
    id: "share_gen",
    category: "creation",
    title: "Share a generation to the gallery",
    description: "Public so others can see it.",
    points: 10, verifier: "manual",
    cta: { label: "Open gallery", href: "/?section=community" },
  },

  // ── SOCIAL (5) ─────────────────────────────────────────────────────
  {
    id: "follow_one",
    category: "social",
    title: "Follow another pet",
    description: "Build your network.",
    points: 5, verifier: "auto",
    cta: { label: "Find pets", href: "/?section=community" },
    check: async (u, d) => (await countFollowsToday(u, d)) >= 1,
  },
  {
    id: "comment_one",
    category: "social",
    title: "Comment on a pet's post",
    description: "One thoughtful comment.",
    points: 10, verifier: "auto",
    cta: { label: "Open gallery", href: "/?section=community" },
    check: async (u, d) => (await countCommentsToday(u, d)) >= 1,
  },
  {
    id: "like_5",
    category: "social",
    title: "Like five posts",
    description: "Spread love in the gallery.",
    points: 5, verifier: "auto",
    cta: { label: "Open gallery", href: "/?section=community" },
    check: async (u, d) => (await countLikesToday(u, d)) >= 5,
  },
  {
    id: "compliment",
    category: "social",
    title: "Compliment a top creator",
    description: "Find this week's top creator and leave kindness.",
    points: 10, verifier: "manual",
    cta: { label: "See leaderboard", href: "/?section=season&pillar=compete" },
  },
  {
    id: "send_friend",
    category: "social",
    title: "Buddy Lock is live — pair up for a shared streak",
    description: "Send a buddy request from the Connect tab to link your streaks.",
    points: 10, verifier: "manual",
    cta: { label: "Open Connect", href: "/?section=season&pillar=connect" },
  },

  // ── CARE (5) ───────────────────────────────────────────────────────
  {
    id: "feed",
    category: "care",
    title: "Feed your pet",
    description: "Hunger goes down. Bond goes up.",
    points: 5, verifier: "auto",
    cta: { label: "Open my pet", href: "/?section=my pet" },
    check: async (u, d) => (await countToday(u, d, "feed")) > 0,
  },
  {
    id: "play",
    category: "care",
    title: "Play with your pet",
    description: "Happiness up. Energy down.",
    points: 5, verifier: "auto",
    cta: { label: "Open my pet", href: "/?section=my pet" },
    check: async (u, d) => (await countToday(u, d, "play")) > 0,
  },
  {
    id: "train",
    category: "care",
    title: "Train your pet",
    description: "EXP for the next level.",
    points: 10, verifier: "auto",
    cta: { label: "Open my pet", href: "/?section=my pet" },
    check: async (u, d) => (await countToday(u, d, "train")) > 0,
  },
  {
    id: "groom",
    category: "care",
    title: "Groom or pet your pet",
    description: "Bond boost.",
    points: 5, verifier: "auto",
    cta: { label: "Open my pet", href: "/?section=my pet" },
    check: async (u, d) =>
      (await countToday(u, d, "pet")) + (await countToday(u, d, "groom")) > 0,
  },
  {
    id: "all_care_4",
    category: "care",
    title: "Do all four care actions",
    description: "Feed + Play + Train + Pet — full routine.",
    points: 20, verifier: "auto",
    cta: { label: "Open my pet", href: "/?section=my pet" },
    check: async (u, d) =>
      (await countToday(u, d, "feed")) > 0 &&
      (await countToday(u, d, "play")) > 0 &&
      (await countToday(u, d, "train")) > 0 &&
      (await countToday(u, d, "pet")) + (await countToday(u, d, "groom")) > 0,
  },

  // ── REFLECTION (4) ─────────────────────────────────────────────────
  {
    id: "view_streak",
    category: "reflection",
    title: "Check your streak",
    description: "How many days have you kept it going?",
    points: 3, verifier: "manual",
    cta: { label: "View streak", href: "/?section=home" },
  },
  {
    id: "view_rank",
    category: "reflection",
    title: "Check your leaderboard rank",
    description: "Where do you stand today?",
    points: 3, verifier: "manual",
    cta: { label: "Leaderboard", href: "/?section=season&pillar=compete" },
  },
  {
    id: "view_stats",
    category: "reflection",
    title: "Open your pet's stat sheet",
    description: "Quick health check on your pet.",
    points: 3, verifier: "manual",
    cta: { label: "Pet stats", href: "/?section=my pet" },
  },

  // ── EXPLORATION (4) ────────────────────────────────────────────────
  {
    id: "visit_sovereignty",
    category: "exploration",
    title: "Visit Sovereignty",
    description: "Review owner-scoped export, import, and deletion controls.",
    points: 8, verifier: "manual",
    cta: { label: "Open Sovereignty", href: "/sovereignty" },
  },
  {
    id: "open_studio",
    category: "exploration",
    title: "Open Pet Studio",
    description: "Pro video gen for your pet.",
    points: 5, verifier: "manual",
    cta: { label: "Open Studio", href: "/studio" },
  },
  {
    id: "telegram_bot",
    category: "exploration",
    title: "Try the Telegram bot",
    description: "Chat with your pet from Telegram.",
    points: 15, verifier: "manual",
    cta: { label: "Telegram", href: "https://t.me/myaipets_bot" },
  },
  {
    id: "browser_ext",
    category: "exploration",
    title: "Install the browser extension",
    description: "Pet roams across the web with you.",
    points: 15, verifier: "manual",
    cta: { label: "Get extension", href: "/?section=home" },
  },
];

const ID_INDEX: Record<string, MissionTemplate> = (() => {
  const out: Record<string, MissionTemplate> = {};
  for (const m of MISSION_CATALOG) out[m.id] = m;
  return out;
})();

export function getMission(id: string): MissionTemplate | undefined {
  return ID_INDEX[id];
}

/**
 * Deterministic picker — same (user, date) → same 5 missions. Lets us
 * compute the daily set on demand if a row doesn't yet exist.
 */
export function pickDailyMissionIds(userId: number, dateUtc: string): string[] {
  const checkinPick = "check_in";
  const pool = MISSION_CATALOG.filter(m => m.id !== checkinPick);
  // Mulberry32 PRNG seeded from userId + date — stable, no Math.random
  let h = 2166136261;
  const seedStr = `${userId}:${dateUtc}`;
  for (let i = 0; i < seedStr.length; i++) {
    h ^= seedStr.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  function rand() {
    h |= 0; h = (h + 0x6D2B79F5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  const shuffled = pool.slice().sort(() => rand() - 0.5);
  const picks = shuffled.slice(0, 4).map(m => m.id);
  return [checkinPick, ...picks];
}
