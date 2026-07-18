/**
 * Economy guards — the Lane-B cost backstops from docs/POINTS-ECONOMY.md.
 *
 * DOCTRINE (POINTS-ECONOMY §0): protect COST, not COUNT. Season points are
 * non-financial recognition ($0 to us) and are NOT guarded here. This module
 * only meters the calls that spend real Grok/fal money without a purchased
 * credit behind them — so every rule below is about credits + global budgets,
 * never about points.
 *
 * All guards FAIL OPEN on internal error and return friendly, typed results so
 * callers can answer 402/429 instead of crashing (never 500 the pet).
 *
 * ── Env knobs the founder can tune (all have sane defaults) ──
 *   EARNED_CREDIT_DAILY_CAP      per-wallet earned-credit ceiling/day   (default 100)
 *   ARENA_CREDIT_DAILY_CAP       arena PvE earned-credit ceiling/day    (default 50)
 *   CATCH_FREE_VERIFY_PER_DAY    free catch-vision verifies/day/wallet  (default 3)
 *   CATCH_VERIFY_CREDIT_COST     credits charged per paid catch verify  (default 1)
 *   FREE_VIDEO_DAILY_CAP         GLOBAL free-origin video generations   (default 300)
 *   FREE_ORIGIN_VIDEO_PER_WALLET free-origin video/day/wallet           (default 2)
 *   VIDEO_UNLOCK_DAY             wallet-lifetime day a free video unlocks (default 2)
 *   LLM_SKILL_DAILY_CAP          authed PetClaw skill runs/day/pet       (default 50)
 *   (VISION_DAILY_CAP lives in lib/llm/router.ts alongside the LLM budget.)
 */

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

function envCap(name: string, def: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : def;
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Generic per-wallet daily quota, tracked atomically in DailyActionCount
 * (action_key + day, unique with user_id). Increments by one only when under
 * `cap`. FAILS OPEN (returns ok:true) on DB error so a guard hiccup never blocks
 * a user — the global in-memory budgets are the real wall.
 */
export async function consumeDailyQuota(
  userId: number,
  actionKey: string,
  cap: number,
): Promise<{ ok: boolean; count: number; cap: number }> {
  if (cap <= 0) return { ok: false, count: 0, cap };
  const day = todayKey();
  try {
    return await prisma.$transaction(async (tx) => {
      const row = await tx.dailyActionCount.upsert({
        where: { user_action_day: { user_id: userId, action_key: actionKey, day } },
        create: { user_id: userId, action_key: actionKey, day, count: 0 },
        update: {},
      });
      if (row.count >= cap) return { ok: false, count: row.count, cap };
      await tx.dailyActionCount.update({ where: { id: row.id }, data: { count: { increment: 1 } } });
      return { ok: true, count: row.count + 1, cap };
    });
  } catch (e) {
    console.error("consumeDailyQuota error:", e);
    return { ok: true, count: 0, cap };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// EARNED-CREDIT CEILING (POINTS-ECONOMY §2.2 / knobs #1, #9)
//
// A shared helper every FREE credit-earning faucet (arena, adventure, …) routes
// through. Enforces (a) an optional per-source daily cap and (b) a global
// per-wallet earned-credit ceiling. Belt-and-suspenders: 100 cr/day × $0.006 =
// $0.60/day/wallet absolute worst-case exposure, only if the credits are spent.
// ─────────────────────────────────────────────────────────────────────────────

const EARNED_TOTAL_KEY = "credits:earned";

/**
 * Grant up to `amount` earned (free) credits to a wallet, clamped by BOTH an
 * optional per-source daily cap (`credits:<source>`) and the global per-wallet
 * `credits:earned` ceiling. Atomic; returns how many were actually granted
 * (possibly 0). FAILS CLOSED (grants 0) on error — a free faucet that can't
 * verify its ceiling must not pay out.
 */
export async function grantEarnedCredits(
  userId: number,
  source: string,
  amount: number,
  sourceDailyCap?: number,
): Promise<{ granted: number; source: string }> {
  if (amount <= 0) return { granted: 0, source };
  try {
    return await prisma.$transaction((tx) =>
      grantEarnedCreditsInTransaction(tx, userId, source, amount, sourceDailyCap),
    );
  } catch (e) {
    console.error("grantEarnedCredits error:", e);
    return { granted: 0, source };
  }
}

/**
 * Transaction-scoped form of `grantEarnedCredits`. Free-credit rewards that are
 * part of a larger gameplay claim must use this function so the reward, quota,
 * energy debit, and earned-credit ceilings commit (or roll back) together.
 *
 * The upserts deliberately run in a stable source → global order. PostgreSQL's
 * conflict-update path locks the counter row, so a waiter observes the prior
 * grant before calculating its own headroom.
 */
export async function grantEarnedCreditsInTransaction(
  tx: Prisma.TransactionClient,
  userId: number,
  source: string,
  amount: number,
  sourceDailyCap?: number,
): Promise<{ granted: number; source: string }> {
  if (amount <= 0) return { granted: 0, source };

  const day = todayKey();
  const globalCap = envCap("EARNED_CREDIT_DAILY_CAP", 100);
  const sourceKey = `credits:${source}`;
  let headroom = amount;

  // Per-source headroom (e.g. credits:arena ≤ 50/day).
  if (sourceDailyCap && sourceDailyCap > 0) {
    const sourceCounter = await tx.dailyActionCount.upsert({
      where: { user_action_day: { user_id: userId, action_key: sourceKey, day } },
      create: { user_id: userId, action_key: sourceKey, day, count: 0 },
      update: {},
    });
    headroom = Math.min(headroom, Math.max(0, sourceDailyCap - sourceCounter.count));
  }

  // Global per-wallet earned headroom (credits:earned ≤ configured cap).
  const globalCounter = await tx.dailyActionCount.upsert({
    where: { user_action_day: { user_id: userId, action_key: EARNED_TOTAL_KEY, day } },
    create: { user_id: userId, action_key: EARNED_TOTAL_KEY, day, count: 0 },
    update: {},
  });
  headroom = Math.min(headroom, Math.max(0, globalCap - globalCounter.count));

  const grant = Math.max(0, Math.min(Math.floor(amount), headroom));
  if (grant <= 0) return { granted: 0, source };

  if (sourceDailyCap && sourceDailyCap > 0) {
    await tx.dailyActionCount.update({
      where: { user_action_day: { user_id: userId, action_key: sourceKey, day } },
      data: { count: { increment: grant } },
    });
  }
  await tx.dailyActionCount.update({
    where: { user_action_day: { user_id: userId, action_key: EARNED_TOTAL_KEY, day } },
    data: { count: { increment: grant } },
  });
  await tx.user.update({ where: { id: userId }, data: { credits: { increment: grant } } });

  return { granted: grant, source };
}

export function arenaCreditDailyCap(): number {
  return envCap("ARENA_CREDIT_DAILY_CAP", 50);
}

// ─────────────────────────────────────────────────────────────────────────────
// CATCH-VISION BILLING (POINTS-ECONOMY §2.4 / knob #2)
//
// 3 free verify attempts/day/wallet, then 1 credit per attempt — charged on
// ATTEMPT, not success, because WE pay the vendor on attempt. (The global
// VISION_DAILY_CAP backstop lives in router.ts.)
// ─────────────────────────────────────────────────────────────────────────────

// Flat (non-discriminated) result shape — the project compiles with
// `strict: false`, under which TS does NOT narrow a union on a negated boolean
// discriminant. Optional fields keep `.error`/`.status` accessible either way.
export async function consumeCatchVerify(
  userId: number,
): Promise<{ ok: boolean; mode?: "free" | "credit"; status?: number; error?: string }> {
  const freePerDay = envCap("CATCH_FREE_VERIFY_PER_DAY", 3);
  const q = await consumeDailyQuota(userId, "vision:free", freePerDay);
  if (q.ok) return { ok: true, mode: "free" };

  const cost = envCap("CATCH_VERIFY_CREDIT_COST", 1);
  let dec = { count: 0 };
  try {
    dec = await prisma.user.updateMany({
      where: { id: userId, credits: { gte: cost } },
      data: { credits: { decrement: cost } },
    });
  } catch (e) {
    console.error("consumeCatchVerify decrement error:", e);
    return { ok: false, status: 402, error: "Couldn't process that scan right now — try again shortly." };
  }
  if (dec.count === 0) {
    return {
      ok: false,
      status: 402,
      error: `Out of free scans today (${freePerDay}/day). Each extra scan costs ${cost} credit — top up to keep hunting. 🐾`,
    };
  }
  return { ok: true, mode: "credit" };
}

/** Refund a catch-verify credit (used when the global vision budget trips after billing). */
export async function refundCatchCredit(userId: number): Promise<void> {
  const cost = envCap("CATCH_VERIFY_CREDIT_COST", 1);
  await prisma.user
    .update({ where: { id: userId }, data: { credits: { increment: cost } } })
    .catch(() => {});
}

// ─────────────────────────────────────────────────────────────────────────────
// FREE-ORIGIN VIDEO GATE (POINTS-ECONOMY §2.2 / §2.5 / knobs #4, #10)
//
// Video-kind generation for a NEVER-PAID wallet is gated three ways:
//   1. day-2 lifetime pacing gate (images are available immediately),
//   2. per-wallet 2/day free-origin videos,
//   3. a GLOBAL 300/day free-origin video budget (the actual wall).
// Wallets that have EVER purchased credits bypass all of this — their credits
// are revenue and ECONOMY.md guarantees the margin.
// ─────────────────────────────────────────────────────────────────────────────

/** Whole-days since a wallet was created (its "lifetime"). */
export function walletAgeDays(createdAt: Date): number {
  return Math.floor((Date.now() - new Date(createdAt).getTime()) / 86_400_000);
}

// Process-wide daily counter — same posture as the LLM budget in router.ts
// (in-memory, resets on deploy; acceptable for a global grief backstop).
const freeVideoBudget = { date: "", total: 0 };

export async function hasEverPurchased(userId: number): Promise<boolean> {
  const n = await prisma.creditPurchase
    .count({ where: { user_id: userId, status: "confirmed" } })
    .catch(() => 0);
  return n > 0;
}

/**
 * Decide whether this wallet may generate a VIDEO right now. Call ONLY for
 * video-kind generations, before charging credits. Paying wallets always pass.
 */
export async function checkVideoAllowed(user: {
  id: number;
  created_at: Date;
}): Promise<{ ok: boolean; status?: number; error?: string }> {
  if (await hasEverPurchased(user.id)) return { ok: true };

  const unlockDay = envCap("VIDEO_UNLOCK_DAY", 2);
  if (walletAgeDays(user.created_at) < unlockDay) {
    return {
      ok: false,
      status: 403,
      error:
        "🎬 Video memories unlock on day 2 of your pet's life — images are ready to make right now. Come back tomorrow, or grab a credit pack to start today.",
    };
  }

  const perWallet = envCap("FREE_ORIGIN_VIDEO_PER_WALLET", 2);
  const q = await consumeDailyQuota(user.id, "video:free", perWallet);
  if (!q.ok) {
    return {
      ok: false,
      status: 429,
      error: `You've used your ${perWallet} free videos for today — grab a credit pack to keep creating, or come back tomorrow.`,
    };
  }

  const today = todayKey();
  if (freeVideoBudget.date !== today) {
    freeVideoBudget.date = today;
    freeVideoBudget.total = 0;
  }
  if (freeVideoBudget.total >= envCap("FREE_VIDEO_DAILY_CAP", 300)) {
    return {
      ok: false,
      status: 429,
      error:
        "The free video studio is at capacity today — queued for tomorrow, or grab a credit pack to skip the line.",
    };
  }
  freeVideoBudget.total++;
  return { ok: true };
}

/** Global free-origin-video budget snapshot (for admin/ops surfaces). */
export function getFreeVideoBudget(): { date: string; total: number; cap: number } {
  const today = todayKey();
  const fresh = freeVideoBudget.date !== today;
  return { date: today, total: fresh ? 0 : freeVideoBudget.total, cap: envCap("FREE_VIDEO_DAILY_CAP", 300) };
}

export function llmSkillDailyCap(): number {
  return envCap("LLM_SKILL_DAILY_CAP", 50);
}
