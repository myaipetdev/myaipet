/**
 * Live event ticker — last N notable events for social proof.
 *
 *   GET /api/dashboard/ticker?limit=20
 *     → [{ at, kind, text, accent }]
 *
 * Points-aligned + on-brand: AI creations, Memory-NFT mints (care-streak /
 * evolution), and weekly Season Rewards pool closes. No battle/training events
 * (those mechanics are paused).
 *
 * Public, no auth — drives the "people are creating / earning" feeling.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rateLimit";
import { publicGenerationWhere } from "@/lib/publicFeed";
import { publicPetWhere } from "@/lib/publicPet";

interface TickerEvent {
  at: string;        // ISO
  kind: "create" | "nft" | "pool_close";
  text: string;
  accent: string;
}

const ACCENTS = { create: "#BE4F28", nft: "#6B4FA0", pool_close: "#1A7E68" };

function shortenWallet(w?: string | null | unknown): string {
  if (typeof w !== "string" || !w) return "anon";
  return `${w.slice(0, 6)}…${w.slice(-4)}`;
}

export async function GET(req: NextRequest) {
  const rl = rateLimit(req, { key: "ticker", limit: 120, windowMs: 60_000 });
  if (!rl.ok) return rl.response;

  const limit = Math.min(50, Math.max(5, Number(req.nextUrl.searchParams.get("limit")) || 20));

  const since = new Date(Date.now() - 7 * 86_400_000);
  const [creations, nfts] = await Promise.all([
    prisma.generation.findMany({
      where: await publicGenerationWhere({ created_at: { gte: since } }),
      orderBy: { created_at: "desc" }, take: limit,
      select: { user_id: true, video_path: true, created_at: true },
    }),
    prisma.memoryNft.findMany({
      where: { created_at: { gte: since } },
      orderBy: { created_at: "desc" }, take: limit,
      // Memory titles are owner-authored private text. A public pet profile is
      // not consent to republish that text in an unauthenticated ticker.
      select: { memory_type: true, created_at: true, pet_id: true },
    }),
  ]);

  // Resolve user wallets + pet names (one round of joins)
  const userIds = [...new Set(creations.map(c => c.user_id).filter((x): x is number => x != null))];
  const petIds: number[] = Array.from(new Set<number>(
    nfts.map(n => Number(n.pet_id)).filter(Number.isSafeInteger),
  ));
  const [users, pets] = await Promise.all([
    userIds.length
      ? prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, wallet_address: true } })
      : Promise.resolve([] as Array<{ id: number; wallet_address: string }>),
    petIds.length
      ? prisma.pet.findMany({ where: publicPetWhere({ id: { in: petIds } }), select: { id: true, name: true } })
      : Promise.resolve([] as Array<{ id: number; name: string }>),
  ]);
  const userById = new Map(users.map(u => [u.id, u.wallet_address]));
  const petById = new Map(pets.map(p => [p.id, p.name]));

  const events: TickerEvent[] = [];

  for (const c of creations) {
    events.push({
      at: c.created_at.toISOString(),
      kind: "create",
      accent: ACCENTS.create,
      text: `${shortenWallet(c.user_id != null ? userById.get(c.user_id) : null)} created an AI ${c.video_path ? "video" : "image"}`,
    });
  }
  for (const n of nfts) {
    const petName = petById.get(n.pet_id);
    if (!petName) continue;
    const kind = n.memory_type === 10 ? "Care-Streak"
              : n.memory_type === 20 ? "Evolution"
              : n.memory_type === 30 ? "Top-Content" : "Memory";
    events.push({
      at: n.created_at.toISOString(),
      kind: "nft",
      accent: ACCENTS.nft,
      text: `${petName} recorded a ${kind} milestone`,
    });
  }

  events.sort((a, b) => b.at.localeCompare(a.at));
  return NextResponse.json({ events: events.slice(0, limit) });
}
