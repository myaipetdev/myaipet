/**
 * Personal Season Rewards standing — "where you rank this season, by loyalty points".
 *
 *   GET /api/dashboard/projection
 *     → { signedIn, started,
 *         pool: { points, participants, closesAtIso },
 *         me?: { rank, points, petId, petName, petAvatar, petLevel, pointsToNextRank, inTop100 },
 *         topThree: [{ rank, petId, name, level, avatar, points }] }
 *
 * Points are non-financial loyalty, earned by caring + creating (see lib/airdrop).
 * Season 1 runs Jul 1 → Aug 1 2026 — mirrors the SeasonBanner window in App.tsx.
 * Before the season opens the countdown targets the START; once running, the END.
 *
 * (Replaces the old battle-power / weekly-USDT-pool projection: battles + Power
 * Training were retired, so ranking by combined power and a battle_entry pool no
 * longer reflects the product. Loyalty points are the live currency.)
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { rateLimit } from "@/lib/rateLimit";

const SEASON_START = Date.UTC(2026, 6, 1); // 2026-07-01 00:00 UTC
const SEASON_END = Date.UTC(2026, 7, 1);   // 2026-08-01 00:00 UTC

export async function GET(req: NextRequest) {
  const rl = rateLimit(req, { key: "projection", limit: 60, windowMs: 60_000 });
  if (!rl.ok) return rl.response;

  const now = Date.now();
  const started = now >= SEASON_START;
  const closesAtIso = new Date(started ? SEASON_END : SEASON_START).toISOString();

  // "Pool" = total loyalty points in play across active raisers. This genuinely
  // grows as players raise & create (each care/creation banks points), so the
  // "grows as players raise & create" copy is now true.
  const onlyRaisers = { airdrop_points: { gt: 0 }, pets: { some: { is_active: true } } };
  const [poolAgg, participants] = await Promise.all([
    prisma.user.aggregate({ _sum: { airdrop_points: true }, where: onlyRaisers }),
    prisma.user.count({ where: onlyRaisers }),
  ]);
  const poolPoints = poolAgg._sum.airdrop_points ?? 0;

  // Top-3 by points (sneak preview, always shown)
  const topUsers = await prisma.user.findMany({
    where: { pets: { some: { is_active: true } } },
    orderBy: { airdrop_points: "desc" },
    take: 3,
    select: {
      airdrop_points: true,
      pets: { where: { is_active: true }, orderBy: { level: "desc" }, take: 1, select: { id: true, name: true, level: true, avatar_url: true } },
    },
  });
  const topThree = topUsers.map((u, i) => ({
    rank: i + 1,
    petId: u.pets[0]?.id ?? null,
    name: u.pets[0]?.name ?? "—",
    level: u.pets[0]?.level ?? 1,
    avatar: u.pets[0]?.avatar_url ?? null,
    points: u.airdrop_points,
  }));

  const user = await getUser(req).catch(() => null);
  if (!user) {
    return NextResponse.json({
      signedIn: false, started,
      pool: { points: poolPoints, participants, closesAtIso },
      topThree,
    });
  }

  const myPoints = user.airdrop_points ?? 0;
  const [myPet, higherCount, above] = await Promise.all([
    prisma.pet.findFirst({
      where: { user_id: user.id, is_active: true },
      orderBy: { level: "desc" },
      select: { id: true, name: true, avatar_url: true, level: true },
    }),
    prisma.user.count({ where: { airdrop_points: { gt: myPoints }, pets: { some: { is_active: true } } } }),
    // The raiser just above me — how many points to climb one rank.
    prisma.user.findFirst({
      where: { airdrop_points: { gt: myPoints }, pets: { some: { is_active: true } } },
      orderBy: { airdrop_points: "asc" },
      select: { airdrop_points: true },
    }),
  ]);
  const rank = higherCount + 1;
  const pointsToNextRank = above ? Math.max(1, above.airdrop_points - myPoints) : 0;

  return NextResponse.json({
    signedIn: true, started,
    pool: { points: poolPoints, participants, closesAtIso },
    me: {
      rank,
      points: myPoints,
      petId: myPet?.id ?? null,
      petName: myPet?.name ?? "Your pet",
      petAvatar: myPet?.avatar_url ?? null,
      petLevel: myPet?.level ?? 1,
      pointsToNextRank,
      inTop100: rank <= 100,
    },
    topThree,
  });
}
