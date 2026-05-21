/**
 * Pet Power Leaderboard — drives Dashboard ranking + weekly airdrop pool.
 *
 *   GET /api/dashboard/leaderboard?limit=100
 *     → top pets ordered by (atk + def + spd) DESC, tie-break by level
 *
 *   GET /api/dashboard/leaderboard?petId=42
 *     → that pet's current rank + neighbors (for "you are #N" display)
 *
 * Public read-only — no auth needed (leaderboard is meant to be a public moat).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rateLimit";

const MAX_LIMIT = 200;

export async function GET(req: NextRequest) {
  const rl = rateLimit(req, { key: "leaderboard", limit: 60, windowMs: 60_000 });
  if (!rl.ok) return rl.response;

  const limit = Math.min(MAX_LIMIT, Math.max(10, Number(req.nextUrl.searchParams.get("limit")) || 100));
  const petId = req.nextUrl.searchParams.get("petId");

  // Aggregate with raw SQL — Prisma can't ORDER BY computed expression cleanly here.
  // combined_power = atk + def + spd. Tie-break: level DESC, total_interactions DESC.
  const rows = await prisma.$queryRaw<Array<{
    id: number; name: string; level: number; evolution_stage: number;
    atk: number; def: number; spd: number; combined_power: number;
    avatar_url: string | null; total_interactions: number;
    wallet_address: string;
  }>>`
    SELECT
      p.id, p.name, p.level, p.evolution_stage,
      p.atk, p.def, p.spd, (p.atk + p.def + p.spd) AS combined_power,
      p.avatar_url, p.total_interactions,
      u.wallet_address
    FROM pets p
    JOIN users u ON u.id = p.user_id
    WHERE p.is_active = true
    ORDER BY combined_power DESC, p.level DESC, p.total_interactions DESC
    LIMIT ${limit}
  `;

  const leaderboard = rows.map((r, i) => ({
    rank: i + 1,
    petId: r.id,
    name: r.name,
    level: r.level,
    evolutionStage: r.evolution_stage,
    stats: { atk: r.atk, def: r.def, spd: r.spd },
    combinedPower: Number(r.combined_power),
    avatarUrl: r.avatar_url,
    ownerWallet: r.wallet_address.slice(0, 6) + "…" + r.wallet_address.slice(-4),
    totalInteractions: r.total_interactions,
  }));

  // If a specific petId was requested, include its rank + neighbors
  if (petId && /^\d+$/.test(petId)) {
    const id = Number(petId);
    const myIndex = leaderboard.findIndex(p => p.petId === id);
    if (myIndex !== -1) {
      const start = Math.max(0, myIndex - 2);
      const end = Math.min(leaderboard.length, myIndex + 3);
      return NextResponse.json({
        leaderboard,
        you: {
          rank: myIndex + 1,
          entry: leaderboard[myIndex],
          neighbors: leaderboard.slice(start, end),
        },
      });
    }
    // Pet exists but outside top N → compute their rank with a separate count query
    const myPet = await prisma.pet.findFirst({
      where: { id, is_active: true },
      select: { id: true, name: true, atk: true, def: true, spd: true, level: true, total_interactions: true, avatar_url: true, evolution_stage: true, user: { select: { wallet_address: true } } },
    });
    if (myPet) {
      const myPower = myPet.atk + myPet.def + myPet.spd;
      const rankBelow = await prisma.$queryRaw<Array<{ rank: bigint }>>`
        SELECT COUNT(*) + 1 AS rank
        FROM pets
        WHERE is_active = true
          AND (atk + def + spd) > ${myPower}
      `;
      return NextResponse.json({
        leaderboard,
        you: {
          rank: Number(rankBelow[0]?.rank || -1),
          entry: {
            rank: Number(rankBelow[0]?.rank || -1),
            petId: myPet.id,
            name: myPet.name,
            level: myPet.level,
            evolutionStage: myPet.evolution_stage,
            stats: { atk: myPet.atk, def: myPet.def, spd: myPet.spd },
            combinedPower: myPower,
            avatarUrl: myPet.avatar_url,
            ownerWallet: myPet.user.wallet_address.slice(0, 6) + "…" + myPet.user.wallet_address.slice(-4),
            totalInteractions: myPet.total_interactions,
          },
          neighbors: [],
        },
      });
    }
  }

  return NextResponse.json({ leaderboard });
}
