/**
 * Live event ticker — last N notable events for social proof.
 *
 *   GET /api/dashboard/ticker?limit=20
 *     → [{ at, kind, text, accent }]
 *
 * Pulled from: paid_actions (upgrades, battle entries), battle_history (wins),
 * memory_nfts (care-streak/evolution NFT mints), weekly_battle_pools (closes).
 *
 * Public, no auth — drives the "people are paying / climbing" feeling.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rateLimit";

interface TickerEvent {
  at: string;        // ISO
  kind: "upgrade" | "battle" | "nft" | "pool_close";
  text: string;
  accent: string;
}

const ACCENTS = { upgrade: "#dc2626", battle: "#f59e0b", nft: "#a855f7", pool_close: "#16a34a" };

function shortenWallet(w?: string | null | unknown): string {
  if (typeof w !== "string" || !w) return "anon";
  return `${w.slice(0, 6)}…${w.slice(-4)}`;
}

export async function GET(req: NextRequest) {
  const rl = rateLimit(req, { key: "ticker", limit: 120, windowMs: 60_000 });
  if (!rl.ok) return rl.response;

  const limit = Math.min(50, Math.max(5, Number(req.nextUrl.searchParams.get("limit")) || 20));

  // Pull in parallel
  const since = new Date(Date.now() - 7 * 86_400_000);
  const [upgrades, battles, nfts, poolCloses] = await Promise.all([
    prisma.paidAction.findMany({
      where: {
        action_key: { in: ["stat_upgrade_atk", "stat_upgrade_def", "stat_upgrade_spd"] },
        created_at: { gte: since },
      },
      orderBy: { created_at: "desc" }, take: limit,
      select: { action_key: true, created_at: true, user_id: true },
    }),
    prisma.battleHistory.findMany({
      where: { won: true, created_at: { gte: since } },
      orderBy: { created_at: "desc" }, take: limit,
      select: { player_pet_id: true, opponent_name: true, turns: true, created_at: true },
    }),
    prisma.memoryNft.findMany({
      where: { created_at: { gte: since } },
      orderBy: { created_at: "desc" }, take: limit,
      select: { memory_type: true, title: true, created_at: true, pet_id: true },
    }),
    prisma.weeklyBattlePool.findMany({
      orderBy: { closed_at: "desc" }, take: 3,
      select: { week_key: true, pool_usd: true, closed_at: true, payouts: true },
    }),
  ]);

  // Resolve user wallets + pet names where needed (one round of joins)
  const userIds = [...new Set(upgrades.map(u => u.user_id))];
  const petIds = [...new Set([
    ...battles.map(b => b.player_pet_id),
    ...nfts.map(n => n.pet_id),
  ])];
  const [users, pets] = await Promise.all([
    userIds.length
      ? prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, wallet_address: true } })
      : Promise.resolve([]),
    petIds.length
      ? prisma.pet.findMany({ where: { id: { in: petIds } }, select: { id: true, name: true } })
      : Promise.resolve([]),
  ]);
  const userById = new Map(users.map(u => [u.id, u.wallet_address]));
  const petById = new Map(pets.map(p => [p.id, p.name]));

  const events: TickerEvent[] = [];

  for (const u of upgrades) {
    const statName = u.action_key.replace("stat_upgrade_", "").toUpperCase();
    events.push({
      at: u.created_at.toISOString(),
      kind: "upgrade",
      accent: ACCENTS.upgrade,
      text: `${shortenWallet(userById.get(u.user_id))} trained ${statName} +5`,
    });
  }
  for (const b of battles) {
    const petName = petById.get(b.player_pet_id) || "Someone";
    events.push({
      at: b.created_at.toISOString(),
      kind: "battle",
      accent: ACCENTS.battle,
      text: `${petName} defeated ${b.opponent_name} in ${b.turns} turns`,
    });
  }
  for (const n of nfts) {
    const petName = petById.get(n.pet_id) || "A pet";
    const kind = n.memory_type === 10 ? "Care-Streak"
              : n.memory_type === 20 ? "Evolution"
              : n.memory_type === 30 ? "Top-Content" : "Memory";
    events.push({
      at: n.created_at.toISOString(),
      kind: "nft",
      accent: ACCENTS.nft,
      text: `${petName} minted ${kind} NFT — ${n.title || "milestone"}`,
    });
  }
  for (const p of poolCloses) {
    const top = Array.isArray(p.payouts) && (p.payouts as any[])[0];
    if (top) {
      events.push({
        at: p.closed_at.toISOString(),
        kind: "pool_close",
        accent: ACCENTS.pool_close,
        text: `${p.week_key}: ${top.petName || "A pet"} won ${(top.pointsPayout || 0).toLocaleString()} pts`,
      });
    }
  }

  events.sort((a, b) => b.at.localeCompare(a.at));
  return NextResponse.json({ events: events.slice(0, limit) });
}
