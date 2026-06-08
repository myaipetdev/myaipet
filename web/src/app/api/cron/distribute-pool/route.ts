/**
 * Weekly battle-pool closing cron.
 *
 *   POST /api/cron/distribute-pool?week=2026-W21   (optional week override)
 *   header: x-cron-secret: $CRON_SECRET
 *
 * Closes the current ISO week, calculates the Airdrop Points prize pool from
 * battle_entry paid_actions, snapshots the top-100 by combined power, credits
 * winners' airdrop_points balances.
 *
 * Pool sizing:
 *   - Each $1 USDT of battle entries = 1000 airdrop points to the pool
 *   - 50% of pool → #1
 *   - 25% of pool → #2..#3 split evenly
 *   - 15% of pool → #4..#10 split evenly
 *   - 10% of pool → #11..#100 split evenly
 *
 * Points are credited atomically inside the close — no separate transfer step
 * needed (unlike a token mint). Idempotent: re-running on a closed week_key
 * is a no-op (UNIQUE constraint).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rateLimit";
import { verifyCron } from "@/lib/cronAuth";

function isoWeekKey(d: Date): string {
  // ISO week (Monday start). Returns "YYYY-Www"
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = date.getUTCDay() || 7;     // Sunday → 7
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

const POINTS_PER_USD = 1000;

function payoutTier(rank: number, poolPoints: number): number {
  if (rank === 1) return Math.round(poolPoints * 0.50);
  if (rank <= 3) return Math.round((poolPoints * 0.25) / 2);
  if (rank <= 10) return Math.round((poolPoints * 0.15) / 7);
  if (rank <= 100) return Math.round((poolPoints * 0.10) / 90);
  return 0;
}

export async function POST(req: NextRequest) {
  // Brute-force resistance on the cron secret
  const rl = rateLimit(req, { key: "cron-distribute-pool", limit: 5, windowMs: 60_000 });
  if (!rl.ok) return rl.response;

  // audit L13: accept the secret via header only (never a query string, which
  // leaks into access logs / referrers); audit H12: fail closed if unset.
  const gate = verifyCron(req);
  if (gate) return gate;

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
  const poolPoints = Math.round(totalUsd * POINTS_PER_USD);

  // Snapshot top-100 by combined power — audit M4: only pets that actually
  // battled during this period are eligible, so the pool (funded by entrants)
  // isn't paid out to high-power pets that never participated.
  const top = await prisma.$queryRaw<Array<any>>`
    SELECT
      p.id AS pet_id, p.name, p.user_id,
      (p.atk + p.def + p.spd) AS combined_power,
      u.wallet_address
    FROM pets p
    JOIN users u ON u.id = p.user_id
    WHERE p.is_active = true
      AND EXISTS (
        SELECT 1 FROM battle_history bh
        WHERE bh.player_pet_id = p.id AND bh.created_at >= ${sinceDate}
      )
    ORDER BY combined_power DESC, p.level DESC, p.total_interactions DESC
    LIMIT 100
  `;

  const payouts = top.map((r, i) => ({
    rank: i + 1,
    petId: r.pet_id,
    petName: r.name,
    userId: r.user_id,
    walletAddress: r.wallet_address,
    pointsPayout: payoutTier(i + 1, poolPoints),
  })).filter(p => p.pointsPayout > 0);

  // Credit winners' airdrop_points balances atomically + record the pool
  const result = await prisma.$transaction(async (tx) => {
    const row = await tx.weeklyBattlePool.create({
      data: {
        week_key: weekKey,
        pool_usd: Number(totalUsd.toFixed(4)),   // keep for analytics
        total_entries: totalEntries,
        payouts: payouts as any,
        paid_out: true,
        paid_at: new Date(),
      },
    });
    for (const p of payouts) {
      await tx.user.update({
        where: { id: p.userId },
        data: { airdrop_points: { increment: p.pointsPayout } },
      });
    }
    return row;
  });

  return NextResponse.json({
    ok: true, weekKey,
    poolPoints, totalEntries,
    winnersCount: payouts.length,
    poolRecordId: result.id,
  });
}

// audit L14: the public leaderboard must not expose winners' wallet addresses
// or internal user IDs. Strip them, keeping rank / pet name / payout only.
function publicPool(row: any) {
  const payouts = Array.isArray(row?.payouts)
    ? row.payouts.map((p: any) => ({
        rank: p.rank,
        petName: p.petName,
        pointsPayout: p.pointsPayout,
      }))
    : row?.payouts;
  return { ...row, payouts };
}

// Read-only week summary (no auth — for the leaderboard UI)
export async function GET(req: NextRequest) {
  const weekKey = req.nextUrl.searchParams.get("week");
  if (weekKey) {
    const row = await prisma.weeklyBattlePool.findUnique({ where: { week_key: weekKey } });
    if (!row) return NextResponse.json({ error: "Week not found" }, { status: 404 });
    return NextResponse.json(publicPool(row));
  }
  const recent = await prisma.weeklyBattlePool.findMany({
    orderBy: { closed_at: "desc" }, take: 8,
  });
  return NextResponse.json({ weeks: recent.map(publicPool) });
}
