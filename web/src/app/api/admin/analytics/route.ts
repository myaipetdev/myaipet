/**
 * Admin analytics endpoint.
 *
 *   GET /api/admin/analytics?days=7
 *
 * Returns:
 *   - revenue (USDT) by action_key, last N days
 *   - paywall hit rate per action (free vs paid)
 *   - daily user activity (DAU)
 *   - top spenders
 *   - PET burn earmark total
 *   - leaderboard snapshot (top-10)
 *
 * Access: gated by ADMIN_WALLETS env (comma-separated wallet addresses).
 * Anyone else: 403.
 */

import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rateLimit";

function isAdmin(walletAddress: string): boolean {
  const admins = (process.env.ADMIN_WALLETS || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
  return admins.includes(walletAddress.toLowerCase());
}

export async function GET(req: NextRequest) {
  // Rate limit even though it's admin-gated — aggregations are expensive
  const rl = rateLimit(req, { key: "admin-analytics", limit: 30, windowMs: 60_000 });
  if (!rl.ok) return rl.response;

  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(user.wallet_address)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const days = Math.max(1, Math.min(90, Number(req.nextUrl.searchParams.get("days")) || 7));
  const since = new Date(Date.now() - days * 86_400_000);

  // ── 1. Revenue by action_key ──
  const revenueGroups = await prisma.paidAction.groupBy({
    by: ["action_key"],
    where: { created_at: { gte: since } },
    _sum: { amount_usd: true, burn_amount: true },
    _count: { _all: true },
    orderBy: { _sum: { amount_usd: "desc" } },
  });

  const revenueByAction = revenueGroups.map(g => ({
    actionKey: g.action_key,
    txCount: g._count._all,
    revenueUsd: g._sum.amount_usd || 0,
    burnEarmarkUsd: g._sum.burn_amount || 0,
  }));

  const totalRevenue = revenueByAction.reduce((s, x) => s + x.revenueUsd, 0);
  const totalBurnEarmark = revenueByAction.reduce((s, x) => s + x.burnEarmarkUsd, 0);

  // ── 2. Paywall conversion: how many users hit free cap and converted to paid ──
  // For each action with freeCap > 0: count distinct users in daily_action_counts
  // who hit count = cap (= they tried 5+ times → cap exhausted), vs count of paid_actions
  // with same action_key (= they bought).
  const capExhaustedUsers = await prisma.$queryRaw<Array<{ action_key: string; users: bigint }>>`
    SELECT action_key, COUNT(DISTINCT user_id) AS users
    FROM daily_action_counts
    WHERE count >= 5
      AND day >= ${since.toISOString().slice(0, 10)}
    GROUP BY action_key
  `;
  const paidUsers = await prisma.paidAction.groupBy({
    by: ["action_key"],
    where: { created_at: { gte: since } },
    _count: { user_id: true },
  });
  const paywallConversion = capExhaustedUsers.map(c => {
    const paid = paidUsers.find(p => p.action_key === c.action_key);
    const total = Number(c.users);
    const converted = paid?._count.user_id || 0;
    return {
      actionKey: c.action_key,
      capExhausted: total,
      converted,
      conversionRate: total > 0 ? converted / total : 0,
    };
  });

  // ── 3. DAU (last 7 days, per UTC day) ──
  const dauRows = await prisma.$queryRaw<Array<{ day: string; users: bigint }>>`
    SELECT TO_CHAR(DATE_TRUNC('day', created_at), 'YYYY-MM-DD') AS day,
           COUNT(DISTINCT user_id) AS users
    FROM pet_interactions
    WHERE created_at >= ${since}
    GROUP BY day
    ORDER BY day DESC
  `;
  const dailyActiveUsers = dauRows.map(r => ({ day: r.day, dau: Number(r.users) }));

  // ── 4. Top spenders ──
  const topSpenders = await prisma.$queryRaw<Array<any>>`
    SELECT pa.user_id, u.wallet_address,
           SUM(pa.amount_usd) AS total_spent,
           COUNT(*) AS tx_count
    FROM paid_actions pa
    JOIN users u ON u.id = pa.user_id
    WHERE pa.created_at >= ${since}
    GROUP BY pa.user_id, u.wallet_address
    ORDER BY total_spent DESC
    LIMIT 10
  `;
  const topSpendersOut = topSpenders.map(r => ({
    userId: r.user_id,
    wallet: `${r.wallet_address.slice(0, 6)}…${r.wallet_address.slice(-4)}`,
    totalSpentUsd: Number(r.total_spent),
    txCount: Number(r.tx_count),
  }));

  // ── 5. Headline stats ──
  const [
    totalUsers, totalActivePets, totalInteractions, totalMemories, totalBattles,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.pet.count({ where: { is_active: true } }),
    prisma.petInteraction.count({ where: { created_at: { gte: since } } }),
    prisma.petMemory.count({ where: { created_at: { gte: since } } }),
    prisma.battleHistory.count({ where: { created_at: { gte: since } } }),
  ]);

  // ── 6. Current weekly pool projection ──
  const battlePoolAgg = await prisma.paidAction.aggregate({
    _sum: { amount_usd: true },
    _count: { _all: true },
    where: { action_key: "battle_entry", created_at: { gte: since } },
  });

  return NextResponse.json({
    windowDays: days,
    since: since.toISOString(),
    headline: {
      totalUsers,
      totalActivePets,
      interactionsInWindow: totalInteractions,
      memoriesInWindow: totalMemories,
      battlesInWindow: totalBattles,
      revenueUsd: Number(totalRevenue.toFixed(4)),
      burnEarmarkUsd: Number(totalBurnEarmark.toFixed(4)),
    },
    revenueByAction,
    paywallConversion,
    dailyActiveUsers,
    topSpenders: topSpendersOut,
    battlePool: {
      entriesInWindow: battlePoolAgg._count._all,
      grossUsd: battlePoolAgg._sum.amount_usd || 0,
      projectedPayoutUsd: (battlePoolAgg._sum.amount_usd || 0) * 0.7,
    },
  });
}
