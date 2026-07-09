/**
 * GET /api/worldcup/bracket?size=16 — pool of REAL community pets for the
 * evergreen "Favorites Bracket" (이상형 월드컵) single-elimination pick game.
 *
 * Returns only real, active, avatar-bearing pets from the Pet table, ranked by
 * a real signal (level → bond → recency). No fabricated contestants: if the
 * community doesn't have enough public pets yet, the client shows an honest
 * low-data state. Read-only and public — the pick flow itself is client-managed
 * and personal (we do NOT invent global vote tallies).
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // Public, unauthenticated read — throttle per-IP so it can't be used to
  // hammer the DB or bulk-scrape the pet roster.
  const rl = rateLimit(req, { key: "worldcup-bracket", limit: 30, windowMs: 60_000 });
  if (!rl.ok) return rl.response;

  // Over-fetch a candidate pool (real signal ordering), then the client seeds a
  // power-of-two bracket from it. Cap keeps the payload small.
  const size = Math.min(32, Math.max(4, Number(req.nextUrl.searchParams.get("size")) || 24));

  const pets = await prisma.pet.findMany({
    where: { is_active: true, avatar_url: { not: null } },
    orderBy: [{ level: "desc" }, { bond_level: "desc" }, { created_at: "desc" }],
    take: size,
    select: { id: true, name: true, avatar_url: true, level: true },
  });

  return NextResponse.json({ pets });
}
