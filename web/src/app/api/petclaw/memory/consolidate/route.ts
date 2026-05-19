/**
 * Trigger memory consolidation for a pet.
 *
 *   POST /api/petclaw/memory/consolidate?petId=N           (owner-only)
 *   POST /api/petclaw/memory/consolidate?cron=1&secret=... (system cron — all eligible pets)
 *
 * Force=true bypasses the "20 new turns or 7 days" gate. Otherwise the gate
 * keeps cost bounded — most calls are no-ops.
 */

import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rateLimit";
import { consolidateMemory } from "@/lib/petclaw/memory/consolidate";

export async function POST(req: NextRequest) {
  const cron = req.nextUrl.searchParams.get("cron") === "1";
  const secret = req.nextUrl.searchParams.get("secret") || req.headers.get("x-cron-secret");

  if (cron) {
    if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    // Find pets active in the last 7 days — no point consolidating dead pets
    const since = new Date(Date.now() - 7 * 86_400_000);
    const pets = await prisma.pet.findMany({
      where: { is_active: true, last_interaction_at: { gte: since } },
      select: { id: true },
      take: 200,
    });
    const results = [];
    for (const p of pets) {
      const r = await consolidateMemory(p.id, false);
      if (r) results.push(r);
    }
    return NextResponse.json({ ok: true, processed: pets.length, consolidated: results.length, details: results });
  }

  // User-triggered: owner + per-user rate limit
  const rl = rateLimit(req, { key: "memory-consolidate", limit: 3, windowMs: 60 * 60_000 });
  if (!rl.ok) return rl.response;

  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const petId = Number(req.nextUrl.searchParams.get("petId"));
  if (!Number.isInteger(petId) || petId <= 0) {
    return NextResponse.json({ error: "Invalid petId" }, { status: 400 });
  }
  const pet = await prisma.pet.findFirst({ where: { id: petId, user_id: user.id, is_active: true } });
  if (!pet) return NextResponse.json({ error: "Pet not found" }, { status: 404 });

  const force = req.nextUrl.searchParams.get("force") === "1";
  const result = await consolidateMemory(petId, force);
  if (!result) return NextResponse.json({ ok: true, skipped: true, reason: "gated_or_nothing_to_do" });
  return NextResponse.json({ ok: true, result });
}
