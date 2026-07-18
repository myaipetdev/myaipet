/**
 * Owner-only ops overview — GET /api/admin/overview
 *
 * Access: requires a signed-in user (getUser) whose wallet_address appears in
 * the ADMIN_WALLETS env var — a comma-separated, case-insensitive list of
 * wallet addresses, e.g.
 *
 *   ADMIN_WALLETS=0xAbC123...,0xDeF456...
 *
 * Anyone else (including unauthenticated) gets a plain 404 so the endpoint is
 * indistinguishable from a route that doesn't exist. The page at /admin is
 * likewise unlisted — no nav links anywhere.
 *
 * Every number here is a REAL DB aggregate, including persistent cluster-wide
 * text and vision LLM budget counters. Empty tables return zeros — nothing is
 * ever fabricated.
 *
 * NOTE on "credits spent": there is no single credit-debit ledger table; spends
 * are recorded per-feature. We sum the per-feature ledgers that carry a credit
 * amount + timestamp: generations.credits_charged, pet_autonomous_actions
 * .credits_used, pet_agent_messages.credits_used, daily_training_logs
 * .credits_spent, item_purchases.total_cost (shop is credit-priced) and
 * streak_purchases.paid_credits (paid_via=credits).
 *
 * NOTE on "season points issued": only the CAPPED award path (awardPointsCapped)
 * leaves a dated trail — DailyActionCount rows with action_key "ap:<reason>".
 * The small uncapped grants (interact/generate_image/level_up via awardPoints)
 * increment users.season_points directly with no dated row, so they are not in
 * this 7d figure. Labeled "capped ledger" in the payload for honesty.
 */

import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rateLimit";
import { getImageDailyCounters, getLLMDailyCounters, getVisionDailyCounters } from "@/lib/llm/router";

export const dynamic = "force-dynamic";

function isAdmin(walletAddress: string): boolean {
  const admins = (process.env.ADMIN_WALLETS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return admins.includes(walletAddress.toLowerCase());
}

const NOT_FOUND = () => NextResponse.json({ error: "Not found" }, { status: 404 });

/** Sum every per-feature credit-spend ledger since `since`. */
async function creditsSpentSince(since: Date) {
  const [gen, agentRuns, agentMsgs, training, shop, streak] = await Promise.all([
    prisma.generation.aggregate({ where: { created_at: { gte: since } }, _sum: { credits_charged: true } }),
    prisma.petAutonomousAction.aggregate({ where: { created_at: { gte: since } }, _sum: { credits_used: true } }),
    prisma.petAgentMessage.aggregate({ where: { created_at: { gte: since } }, _sum: { credits_used: true } }),
    prisma.dailyTrainingLog.aggregate({ where: { date: { gte: since } }, _sum: { credits_spent: true } }),
    prisma.itemPurchase.aggregate({ where: { created_at: { gte: since } }, _sum: { total_cost: true } }),
    prisma.streakPurchase.aggregate({
      where: { created_at: { gte: since }, paid_via: "credits" },
      _sum: { paid_credits: true },
    }),
  ]);
  const breakdown = {
    studio: gen._sum.credits_charged || 0,
    agentRuns: agentRuns._sum.credits_used || 0,
    agentMessages: agentMsgs._sum.credits_used || 0,
    training: training._sum.credits_spent || 0,
    shop: shop._sum.total_cost || 0,
    streak: streak._sum.paid_credits || 0,
  };
  const total = Object.values(breakdown).reduce((s, n) => s + n, 0);
  return { total, breakdown };
}

export async function GET(req: NextRequest) {
  // Rate limit first — aggregate queries are not free even for the owner.
  const rl = rateLimit(req, { key: "admin-overview", limit: 30, windowMs: 60_000 });
  if (!rl.ok) return rl.response;

  const user = await getUser(req);
  // Non-admins (and the logged-out) get the same 404 — this route "doesn't exist".
  if (!user || !isAdmin(user.wallet_address)) return NOT_FOUND();

  const now = Date.now();
  const todayStart = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z"); // UTC midnight
  const d7 = new Date(now - 7 * 86_400_000);
  const day7Key = d7.toISOString().slice(0, 10); // DailyActionCount.day is "YYYY-MM-DD"

  const [
    usersTotal,
    usersNew7d,
    petsTotal,
    petsActive,
    creditsToday,
    credits7d,
    purchases7d,
    studioToday,
    studio7d,
    agentRunsToday,
    caught7d,
    seasonPointsCapped7d,
    recentPurchases,
    recentRuns,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { created_at: { gte: d7 } } }),
    prisma.pet.count(),
    prisma.pet.count({ where: { is_active: true } }),
    creditsSpentSince(todayStart),
    creditsSpentSince(d7),
    // ConsumedPayment is the single global ledger EVERY paid endpoint writes to
    // (credits / subscription / action / shop_premium) — the honest USDT total.
    prisma.consumedPayment.aggregate({
      where: { created_at: { gte: d7 } },
      _count: { _all: true },
      _sum: { amount_usd: true },
    }),
    prisma.generation.count({ where: { created_at: { gte: todayStart } } }),
    prisma.generation.count({ where: { created_at: { gte: d7 } } }),
    prisma.petAutonomousAction.count({ where: { created_at: { gte: todayStart } } }),
    prisma.caughtCat.count({ where: { caught_at: { gte: d7 } } }),
    prisma.dailyActionCount.aggregate({
      where: { action_key: { startsWith: "ap:" }, day: { gte: day7Key } },
      _sum: { count: true },
    }),
    prisma.consumedPayment.findMany({
      orderBy: { created_at: "desc" },
      take: 8,
      select: { id: true, user_id: true, purpose: true, amount_usd: true, created_at: true },
    }),
    prisma.petAutonomousAction.findMany({
      orderBy: { created_at: "desc" },
      take: 8,
      select: {
        id: true,
        urge_type: true,
        action_taken: true,
        credits_used: true,
        platform: true,
        created_at: true,
        pet: { select: { name: true } },
      },
    }),
  ]);

  // Resolve wallets for the recent-purchase user ids (ConsumedPayment has no relation).
  const purchaserIds = [...new Set(recentPurchases.map((p) => p.user_id))];
  const purchasers = purchaserIds.length
    ? await prisma.user.findMany({
        where: { id: { in: purchaserIds } },
        select: { id: true, wallet_address: true },
      })
    : [];
  const walletById = new Map<number, string>(purchasers.map((u) => [u.id, u.wallet_address]));
  const shortWallet = (w: string | undefined) => (w ? `${w.slice(0, 6)}…${w.slice(-4)}` : "?");
  const [llmToday, visionToday, imageToday] = await Promise.all([
    getLLMDailyCounters(),
    getVisionDailyCounters(),
    getImageDailyCounters(),
  ]);

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    todayStartsAt: todayStart.toISOString(), // "today" = UTC day
    users: { total: usersTotal, new7d: usersNew7d },
    pets: { total: petsTotal, active: petsActive },
    creditsSpent: { today: creditsToday.total, last7d: credits7d.total, breakdown7d: credits7d.breakdown },
    purchases7d: { count: purchases7d._count._all, usdtSum: purchases7d._sum.amount_usd || 0 },
    studioGenerations: { today: studioToday, last7d: studio7d },
    agentRunsToday,
    caughtAnimals7d: caught7d,
    // Capped award-path ledger only (ap:* DailyActionCount rows); the small
    // uncapped grants have no dated trail and are deliberately NOT estimated.
    seasonPointsIssued7d: { cappedLedger: seasonPointsCapped7d._sum.count || 0 },
    // Persistent cluster-wide platform attempts; owner/BYOK calls are excluded.
    llmToday,
    visionToday,
    imageToday,
    recentPurchases: recentPurchases.map((p) => ({
      id: p.id,
      wallet: shortWallet(walletById.get(p.user_id)),
      purpose: p.purpose,
      usd: p.amount_usd,
      at: p.created_at.toISOString(),
    })),
    recentRuns: recentRuns.map((r) => ({
      id: r.id,
      pet: r.pet?.name || "?",
      urge: r.urge_type,
      action: r.action_taken,
      credits: r.credits_used,
      platform: r.platform,
      at: r.created_at.toISOString(),
    })),
  });
}
