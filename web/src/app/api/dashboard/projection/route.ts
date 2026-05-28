/**
 * Personal airdrop projection — turns the abstract pool into "YOU'd earn X".
 *
 *   GET /api/dashboard/projection
 *     → { signedIn: true,
 *         pets: [{ petId, name, rank, projectedShare, rival, ranksFromOneUpgrade }],
 *         pool: { points, entries, closesAtIso },
 *         topThree: [...]  // sneak preview }
 *     → { signedIn: false, ... }     (still shows pool so visitors get the hook)
 *
 * This is the answer to "why spend money?" — every $1 USDT of Power Training
 * jumps you N ranks, which translates to +X projected pool share. Concrete.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { rateLimit } from "@/lib/rateLimit";

const POOL_POINTS_PER_USD = 1000;
const POOL_MIN_DISPLAY = 100_000;    // floor for visual until activity ramps

// Same tiering as the cron (50/25/15/10 split, max 100 winners)
function payoutTier(rank: number, poolPoints: number): number {
  if (rank === 1) return Math.round(poolPoints * 0.50);
  if (rank <= 3) return Math.round((poolPoints * 0.25) / 2);
  if (rank <= 10) return Math.round((poolPoints * 0.15) / 7);
  if (rank <= 100) return Math.round((poolPoints * 0.10) / 90);
  return 0;
}

export async function GET(req: NextRequest) {
  const rl = rateLimit(req, { key: "projection", limit: 60, windowMs: 60_000 });
  if (!rl.ok) return rl.response;

  // ── 1. Current week pool (sum of battle entries since last close) ──
  const lastClose = await prisma.weeklyBattlePool.findFirst({
    orderBy: { closed_at: "desc" },
  });
  const since = lastClose ? lastClose.closed_at : new Date(Date.UTC(2026, 0, 1));
  const agg = await prisma.paidAction.aggregate({
    _sum: { amount_usd: true }, _count: { _all: true },
    where: { action_key: "battle_entry", created_at: { gte: since } },
  });
  const liveUsd = agg._sum.amount_usd || 0;
  const livePoints = Math.round(liveUsd * POOL_POINTS_PER_USD);
  const poolPoints = Math.max(POOL_MIN_DISPLAY, livePoints);

  // Sunday 00:00 UTC of the upcoming weekend
  const closes = new Date();
  const dow = closes.getUTCDay();
  closes.setUTCDate(closes.getUTCDate() + ((7 - dow) % 7 || 7));
  closes.setUTCHours(0, 0, 0, 0);

  // ── 2. Top-3 sneak preview (always shown) ──
  const topRows = await prisma.$queryRaw<Array<any>>`
    SELECT p.id, p.name, p.level, p.avatar_url,
           (p.atk + p.def + p.spd) AS combined_power
    FROM pets p
    WHERE p.is_active = true
    ORDER BY combined_power DESC, p.level DESC, p.total_interactions DESC
    LIMIT 3
  `;
  const topThree = topRows.map((r, i) => ({
    rank: i + 1,
    petId: r.id, name: r.name, level: r.level, avatar: r.avatar_url,
    combinedPower: Number(r.combined_power),
    projectedShare: payoutTier(i + 1, poolPoints),
  }));

  // ── 3. If signed in, compute per-pet projection ──
  const user = await getUser(req).catch(() => null);
  if (!user) {
    return NextResponse.json({
      signedIn: false,
      pool: { points: poolPoints, livePoints, entries: agg._count._all, closesAtIso: closes.toISOString() },
      topThree,
    });
  }

  const userPets = await prisma.pet.findMany({
    where: { user_id: user.id, is_active: true },
    select: { id: true, name: true, atk: true, def: true, spd: true, level: true, avatar_url: true, total_interactions: true },
  });

  const projections = await Promise.all(userPets.map(async (pet) => {
    const myPower = pet.atk + pet.def + pet.spd;

    // How many active pets have strictly more power? → my rank.
    const aboveCount = await prisma.$queryRaw<Array<{ c: bigint }>>`
      SELECT COUNT(*) AS c FROM pets
      WHERE is_active = true AND (atk + def + spd) > ${myPower}
    `;
    const rank = Number(aboveCount[0].c) + 1;

    // After a single +5 stat upgrade, what would my rank become?
    const afterPower = myPower + 5;
    const aboveAfter = await prisma.$queryRaw<Array<{ c: bigint }>>`
      SELECT COUNT(*) AS c FROM pets
      WHERE is_active = true AND (atk + def + spd) > ${afterPower}
    `;
    const rankAfter = Number(aboveAfter[0].c) + 1;
    const ranksGained = Math.max(0, rank - rankAfter);

    // The rival JUST above — what we're chasing
    const rivalRows = await prisma.$queryRaw<Array<any>>`
      SELECT p.id, p.name, p.level, p.avatar_url, (p.atk + p.def + p.spd) AS combined_power
      FROM pets p
      WHERE p.is_active = true
        AND (p.atk + p.def + p.spd) > ${myPower}
        AND p.user_id != ${user.id}
      ORDER BY combined_power ASC
      LIMIT 1
    `;
    const rival = rivalRows[0] ? {
      petId: rivalRows[0].id,
      name: rivalRows[0].name,
      level: rivalRows[0].level,
      avatar: rivalRows[0].avatar_url,
      combinedPower: Number(rivalRows[0].combined_power),
      powerGap: Number(rivalRows[0].combined_power) - myPower,
    } : null;

    const projectedShare = payoutTier(rank, poolPoints);
    const projectedShareAfter = payoutTier(rankAfter, poolPoints);

    return {
      petId: pet.id, name: pet.name, level: pet.level, avatar: pet.avatar_url,
      combinedPower: myPower,
      rank, projectedShare,
      afterOneUpgrade: {
        ranksGained, newRank: rankAfter, newProjectedShare: projectedShareAfter,
        shareDelta: projectedShareAfter - projectedShare,
      },
      rival,
    };
  }));

  return NextResponse.json({
    signedIn: true,
    pool: { points: poolPoints, livePoints, entries: agg._count._all, closesAtIso: closes.toISOString() },
    pets: projections,
    topThree,
  });
}
