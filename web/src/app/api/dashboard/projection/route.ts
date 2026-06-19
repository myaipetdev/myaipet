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
import { SEASON_START_MS as SEASON_START, SEASON_END_MS as SEASON_END, seasonPhase } from "@/lib/season";
import { readSeasonSnapshot, computeFinalStandings } from "@/lib/seasonSnapshot";

export async function GET(req: NextRequest) {
  const rl = rateLimit(req, { key: "projection", limit: 60, windowMs: 60_000 });
  if (!rl.ok) return rl.response;

  const now = Date.now();
  const started = now >= SEASON_START;
  const phase = seasonPhase(now);
  const closed = phase === "ended";
  const closesAtIso = new Date(started ? SEASON_END : SEASON_START).toISOString();

  // ── Season ended: report CLOSED with final standings ──────────────────────
  // Prefer the durable snapshot frozen by the season-close cron; if the cron
  // hasn't run yet, fall back to live-computed final standings (honestly
  // flagged `final: false` so the client knows they may still settle slightly).
  if (closed) {
    const frozen = await readSeasonSnapshot();
    const standings = frozen ?? (await computeFinalStandings());
    const user = await getUser(req).catch(() => null);

    let me: any = undefined;
    if (user) {
      const myPoints = user.airdrop_points ?? 0;
      const minePet = await prisma.pet.findFirst({
        where: { user_id: user.id, is_active: true },
        orderBy: { level: "desc" },
        select: { id: true, name: true, avatar_url: true, level: true },
      });
      // Rank from the snapshot if listed; else compute live rank.
      const fromSnap = standings.top.find(e => e.userId === user.id);
      const rank = fromSnap
        ? fromSnap.rank
        : (await prisma.user.count({
            where: { airdrop_points: { gt: myPoints }, pets: { some: { is_active: true } } },
          })) + 1;
      me = {
        rank,
        points: myPoints,
        petId: minePet?.id ?? null,
        petName: minePet?.name ?? "Your pet",
        petAvatar: minePet?.avatar_url ?? null,
        petLevel: minePet?.level ?? 1,
        pointsToNextRank: 0,
        inTop100: rank <= 100,
      };
    }

    return NextResponse.json({
      signedIn: !!user,
      started: true,
      seasonClosed: true,
      final: !!frozen, // true = frozen snapshot; false = live standings, cron pending
      pool: { points: standings.poolPoints, participants: standings.participants, closesAtIso },
      closedAtIso: standings.closedAtIso,
      me,
      topThree: standings.top.slice(0, 3).map(e => ({
        rank: e.rank, petId: e.petId, name: e.petName, level: e.petLevel, avatar: e.petAvatar, points: e.points,
      })),
      finalStandings: standings.top, // full frozen/live final ranking
    });
  }

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
      signedIn: false, started, seasonClosed: false,
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
    signedIn: true, started, seasonClosed: false,
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
