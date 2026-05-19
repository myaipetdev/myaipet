/**
 * Compute and (optionally) record a memory hash anchor.
 *
 *   GET  /api/petclaw/memory/anchor?petId=N  → returns current hash (read-only, free)
 *   POST /api/petclaw/memory/anchor?petId=N  → records checkpoint (+ on-chain if enabled)
 */

import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rateLimit";
import { computeMemoryHash, anchorMemory } from "@/lib/petclaw/memory/anchor";

async function ownsPet(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return null;
  const petId = Number(req.nextUrl.searchParams.get("petId"));
  if (!Number.isInteger(petId) || petId <= 0) return null;
  const pet = await prisma.pet.findFirst({ where: { id: petId, user_id: user.id, is_active: true } });
  if (!pet) return null;
  return { user, petId };
}

export async function GET(req: NextRequest) {
  const ctx = await ownsPet(req);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const hash = await computeMemoryHash(ctx.petId);
  return NextResponse.json({ ok: true, petId: ctx.petId, hash });
}

export async function POST(req: NextRequest) {
  const rl = rateLimit(req, { key: "memory-anchor", limit: 10, windowMs: 60 * 60_000 });
  if (!rl.ok) return rl.response;

  const ctx = await ownsPet(req);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const result = await anchorMemory(ctx.petId, "user_trigger");
  return NextResponse.json({ ok: true, anchor: result });
}
