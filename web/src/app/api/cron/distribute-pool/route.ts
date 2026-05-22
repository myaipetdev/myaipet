/**
 * Weekly battle-pool closing cron.
 *
 *   POST /api/cron/distribute-pool?week=2026-W21   (optional week override)
 *   header: x-cron-secret: $CRON_SECRET
 *
 * Closes the current ISO week, calculates the prize pool from battle_entry
 * paid_actions, snapshots the top-100 by combined power, and records payouts.
 *
 * Distribution rules:
 *   - Pool = 70% of sum(battle_entry.amount_usd) since previous close
 *   - 50% of pool → #1
 *   - 25% of pool → #2..#3 split evenly
 *   - 15% of pool → #4..#10 split evenly
 *   - 10% of pool → #11..#100 split evenly
 *
 * Actual USDT transfer is not done here — the row records who gets what.
 * A separate step (manual or funded relayer) consumes paid_out=false rows
 * and sends USDT, then flips paid_out=true with the tx hash.
 *
 * Idempotent: closing the same week twice is a no-op (week_key is UNIQUE).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function isoWeekKey(d: Date): string {
  // ISO week (Monday start). Returns "YYYY-Www"
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = date.getUTCDay() || 7;     // Sunday → 7
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

function payoutTier(rank: number, pool: number): number {
  if (rank === 1) return pool * 0.50;
  if (rank <= 3) return (pool * 0.25) / 2;
  if (rank <= 10) return (pool * 0.15) / 7;
  if (rank <= 100) return (pool * 0.10) / 90;
  return 0;
}

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret") || req.nextUrl.searchParams.get("secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const overrideWeek = req.nextUrl.searchParams.get("week");
  const weekKey = overrideWeek || isoWeekKey(new Date());

  // Idempotency
  const existing = await prisma.weeklyBattlePool.findUnique({ where: { week_key: weekKey } });
  if (existing) {
    return NextResponse.json({ ok: true, weekKey, alreadyClosed: true, existing });
  }

  // Find the prior close so we know the start of this period
  const prior = await prisma.weeklyBattlePool.findFirst({
    orderBy: { closed_at: "desc" },
  });
  const sinceDate = prior ? prior.closed_at : new Date(Date.UTC(2026, 0, 1));

  const agg = await prisma.paidAction.aggregate({
    where: {
      action_key: "battle_entry",
      created_at: { gte: sinceDate },
    },
    _sum: { amount_usd: true },
    _count: { _all: true },
  });
  const totalEntries = agg._count._all;
  const totalUsd = agg._sum.amount_usd || 0;
  const poolUsd = totalUsd * 0.7;

  // Snapshot top-100 by combined power
  const top = await prisma.$queryRaw<Array<any>>`
    SELECT
      p.id AS pet_id, p.name, p.user_id,
      (p.atk + p.def + p.spd) AS combined_power,
      u.wallet_address
    FROM pets p
    JOIN users u ON u.id = p.user_id
    WHERE p.is_active = true
    ORDER BY combined_power DESC, p.level DESC, p.total_interactions DESC
    LIMIT 100
  `;

  const payouts = top.map((r, i) => ({
    rank: i + 1,
    petId: r.pet_id,
    petName: r.name,
    userId: r.user_id,
    walletAddress: r.wallet_address,
    payoutUsd: Number(payoutTier(i + 1, poolUsd).toFixed(4)),
  })).filter(p => p.payoutUsd > 0);

  const row = await prisma.weeklyBattlePool.create({
    data: {
      week_key: weekKey,
      pool_usd: Number(poolUsd.toFixed(4)),
      total_entries: totalEntries,
      payouts: payouts as any,
    },
  });

  return NextResponse.json({
    ok: true, weekKey,
    poolUsd: row.pool_usd,
    totalEntries,
    winnersCount: payouts.length,
    poolRecordId: row.id,
  });
}

// Read-only week summary (no auth — for the leaderboard UI)
export async function GET(req: NextRequest) {
  const weekKey = req.nextUrl.searchParams.get("week");
  if (weekKey) {
    const row = await prisma.weeklyBattlePool.findUnique({ where: { week_key: weekKey } });
    if (!row) return NextResponse.json({ error: "Week not found" }, { status: 404 });
    return NextResponse.json(row);
  }
  const recent = await prisma.weeklyBattlePool.findMany({
    orderBy: { closed_at: "desc" }, take: 8,
  });
  return NextResponse.json({ weeks: recent });
}
