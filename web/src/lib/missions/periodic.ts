/**
 * Periodic missions — Weekly (3) and Monthly (1 epic). Same shape as the daily
 * system but with target/progress instead of pass/fail.
 *
 * Weekly resets at Monday 00:00 UTC. Monthly resets at the 1st of the month.
 * Picker is deterministic so users get the same set throughout the week.
 */

import { prisma } from "@/lib/prisma";

export interface PeriodicTemplate {
  id: string;
  category: string;
  title: string;
  target: number;
  points: number;
  description: string;
  /** Counts the user's progress for this template, given a period window. */
  progressFor: (userId: number, start: Date, end: Date) => Promise<number>;
}

function rangeCount(start: Date, end: Date) { return { gte: start, lte: end }; }

export const WEEKLY_POOL: PeriodicTemplate[] = [
  {
    id: "week_chats_30",
    category: "conversation",
    title: "Have 30 chats with your pet this week",
    target: 30, points: 50,
    description: "Chat across multiple days. Bond grows fast.",
    progressFor: async (u, s, e) => prisma.petInteraction.count({
      where: { user_id: u, interaction_type: "chat", created_at: rangeCount(s, e) },
    }),
  },
  {
    id: "week_gen_5",
    category: "creation",
    title: "Generate 5 things in Studio",
    target: 5, points: 60,
    description: "Image or video, free or paid models all count.",
    progressFor: async (u, s, e) => prisma.generation.count({
      where: { user_id: u, created_at: rangeCount(s, e) },
    }),
  },
  {
    id: "week_memories_10",
    category: "memory",
    title: "Form 10 memories",
    target: 10, points: 50,
    description: "Deep conversations leave traces.",
    progressFor: async (u, s, e) => {
      const pets = await prisma.pet.findMany({ where: { user_id: u }, select: { id: true } });
      if (!pets.length) return 0;
      return prisma.petMemory.count({
        where: { pet_id: { in: pets.map(p => p.id) }, created_at: rangeCount(s, e) },
      });
    },
  },
  {
    id: "week_follows_3",
    category: "social",
    title: "Follow 3 new pets",
    target: 3, points: 30,
    description: "Build your network.",
    progressFor: async (u, s, e) => prisma.follow.count({
      where: { follower_id: u, created_at: rangeCount(s, e) },
    }),
  },
  {
    id: "week_comments_10",
    category: "social",
    title: "Comment on 10 community posts",
    target: 10, points: 40,
    description: "Be the friend you wish you had.",
    progressFor: async (u, s, e) => prisma.comment.count({
      where: { user_id: u, created_at: rangeCount(s, e) },
    }),
  },
  {
    id: "week_streak_7",
    category: "streak",
    title: "Keep the streak alive 7 days",
    target: 7, points: 70,
    description: "All 7 days of the week with ≥1 mission done.",
    progressFor: async (u, s, e) => prisma.dailyMission.findMany({
      where: { user_id: u, status: "completed", completed_at: rangeCount(s, e) },
      distinct: ["date"], select: { date: true },
    }).then(rows => rows.length),
  },
];

export const MONTHLY_POOL: PeriodicTemplate[] = [
  {
    id: "month_legend",
    category: "streak",
    title: "Complete 25 of 30 days this month",
    target: 25, points: 300,
    description: "Almost-perfect month. Gives the Legend badge.",
    progressFor: async (u, s, e) => prisma.dailyMission.findMany({
      where: { user_id: u, status: "completed", completed_at: rangeCount(s, e) },
      distinct: ["date"], select: { date: true },
    }).then(rows => rows.length),
  },
  {
    id: "month_studio_pro",
    category: "creation",
    title: "Make 30 generations in Studio this month",
    target: 30, points: 250,
    description: "Hit your stride. Earns Filmmaker badge.",
    progressFor: async (u, s, e) => prisma.generation.count({
      where: { user_id: u, created_at: rangeCount(s, e) },
    }),
  },
  {
    id: "month_conversationalist",
    category: "conversation",
    title: "Have 150 chats this month",
    target: 150, points: 200,
    description: "Talk to your pet every day. Earns Conversationalist badge.",
    progressFor: async (u, s, e) => prisma.petInteraction.count({
      where: { user_id: u, interaction_type: "chat", created_at: rangeCount(s, e) },
    }),
  },
];

// ── Date helpers ───────────────────────────────────────────────────────────
function isoWeek(d: Date): { key: string; start: Date; end: Date } {
  // ISO week (year-Wnn) — Mondays are day 1, weeks belong to the year of the
  // Thursday. Picker math goes off this so the period_key is stable.
  const tmp = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = tmp.getUTCDay() || 7;
  if (day !== 4) tmp.setUTCDate(tmp.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((tmp.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);

  // start = Monday of this week (in d's actual UTC week)
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const offsetToMon = (start.getUTCDay() + 6) % 7;
  start.setUTCDate(start.getUTCDate() - offsetToMon);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start.getTime() + 7 * 86400000 - 1);

  return { key: `${tmp.getUTCFullYear()}-W${String(week).padStart(2, "0")}`, start, end };
}

function monthBounds(d: Date): { key: string; start: Date; end: Date } {
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) - 1);
  return { key: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`, start, end };
}

function seedPick<T>(seed: string, pool: T[], n: number): T[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  const sorted = pool.slice().sort(() => {
    h = (h + 0x6D2B79F5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296 - 0.5;
  });
  return sorted.slice(0, n);
}

export interface PeriodicView {
  id: string;
  category: string;
  title: string;
  description: string;
  target: number;
  progress: number;
  points: number;
  status: "pending" | "completed";
  completed_at: string | null;
}

export interface PeriodicResponse {
  period: "week" | "month";
  period_key: string;
  starts_at: string;
  ends_at: string;
  missions: PeriodicView[];
  earned: number;
  remaining: number;
}

async function ensurePeriodicSet(
  userId: number,
  period: "week" | "month",
  periodKey: string,
  picks: PeriodicTemplate[],
) {
  const existing = await prisma.periodicMission.findMany({
    where: { user_id: userId, period, period_key: periodKey },
  });
  if (existing.length >= picks.length) return;
  const have = new Set(existing.map(r => r.mission_id));
  const toInsert = picks.filter(t => !have.has(t.id)).map(t => ({
    user_id: userId, period, period_key: periodKey, mission_id: t.id,
    category: t.category, title: t.title, target: t.target, points: t.points,
  }));
  if (toInsert.length) {
    await prisma.periodicMission.createMany({ data: toInsert, skipDuplicates: true });
  }
}

export async function getOrAssignWeekly(userId: number): Promise<PeriodicResponse> {
  const now = new Date();
  const { key, start, end } = isoWeek(now);
  const picks = seedPick(`week:${userId}:${key}`, WEEKLY_POOL, 3);
  await ensurePeriodicSet(userId, "week", key, picks);

  const rows = await prisma.periodicMission.findMany({
    where: { user_id: userId, period: "week", period_key: key },
  });
  return projectPeriodic("week", key, start, end, rows, WEEKLY_POOL, userId);
}

export async function getOrAssignMonthly(userId: number): Promise<PeriodicResponse> {
  const now = new Date();
  const { key, start, end } = monthBounds(now);
  const picks = seedPick(`month:${userId}:${key}`, MONTHLY_POOL, 1);
  await ensurePeriodicSet(userId, "month", key, picks);

  const rows = await prisma.periodicMission.findMany({
    where: { user_id: userId, period: "month", period_key: key },
  });
  return projectPeriodic("month", key, start, end, rows, MONTHLY_POOL, userId);
}

async function projectPeriodic(
  period: "week" | "month",
  key: string,
  start: Date,
  end: Date,
  rows: any[],
  pool: PeriodicTemplate[],
  userId: number,
): Promise<PeriodicResponse> {
  let earned = 0, remaining = 0;
  const tplById: Record<string, PeriodicTemplate> = {};
  for (const t of pool) tplById[t.id] = t;

  const missions: PeriodicView[] = [];
  for (const r of rows) {
    const tpl = tplById[r.mission_id];
    let progress = r.progress;
    let status: "pending" | "completed" = r.status === "completed" ? "completed" : "pending";

    // Live-recompute progress on every read so we don't need a cron.
    if (tpl && status === "pending") {
      progress = await tpl.progressFor(userId, start, end).catch(() => r.progress);
      if (progress >= r.target) {
        await prisma.periodicMission.update({
          where: { id: r.id },
          data: { progress, status: "completed", completed_at: new Date() },
        });
        await prisma.user.update({
          where: { id: userId },
          data: { airdrop_points: { increment: r.points } },
        });
        status = "completed";
      } else if (progress !== r.progress) {
        await prisma.periodicMission.update({ where: { id: r.id }, data: { progress } });
      }
    }

    if (status === "completed") earned += r.points;
    else remaining += r.points;

    missions.push({
      id: r.mission_id, category: r.category, title: r.title,
      description: tpl?.description || "",
      target: r.target, progress, points: r.points,
      status, completed_at: r.completed_at?.toISOString() || null,
    });
  }

  return {
    period, period_key: key,
    starts_at: start.toISOString(), ends_at: end.toISOString(),
    missions, earned, remaining,
  };
}
