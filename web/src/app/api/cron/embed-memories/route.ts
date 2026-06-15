/**
 * Backfill pet_memories.embedding for pets whose owners connected an embedding
 * key (OpenAI/Google). Reuses the router's callEmbedding (key decryption +
 * provider dispatch) — no crypto replication. Idempotent + capped per run, so
 * it's safe to schedule. No-op (embedded:0) until someone connects a key.
 *
 *   POST /api/cron/embed-memories?secret=$CRON_SECRET
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { callEmbedding } from "@/lib/llm/router";

const PER_PET_CAP = 300; // memories embedded per pet per run
const BATCH = 64;

export async function POST(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret") || req.headers.get("x-cron-secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Owners with an embedding-capable connection (OpenAI/Google).
  const conns = await prisma.modelConnection.findMany({
    where: { is_active: true, provider: { in: ["openai", "google"] } },
    select: { owner_user_id: true },
  });
  const ownerIds = [...new Set(conns.map((c) => c.owner_user_id))];
  if (ownerIds.length === 0) {
    return NextResponse.json({ ok: true, embedded: 0, note: "no embedding-capable model connections" });
  }

  const pets = await prisma.pet.findMany({
    where: { user_id: { in: ownerIds }, is_active: true },
    select: { id: true },
    take: 500,
  });

  let embedded = 0;
  for (const pet of pets) {
    const mems = await prisma.petMemory.findMany({
      where: { pet_id: pet.id },
      select: { id: true, content: true, embedding: true },
      orderBy: { created_at: "desc" },
      take: 1000,
    });
    const todo = mems.filter((m) => !m.embedding && m.content?.trim()).slice(0, PER_PET_CAP);
    for (let i = 0; i < todo.length; i += BATCH) {
      const chunk = todo.slice(i, i + BATCH);
      const vecs = await callEmbedding(chunk.map((m) => m.content), pet.id).catch(() => null);
      if (!vecs || vecs.length !== chunk.length) break; // key missing / provider failed
      await Promise.all(
        chunk.map((m, j) =>
          prisma.petMemory.update({ where: { id: m.id }, data: { embedding: vecs[j] as any } }).catch(() => {})
        )
      );
      embedded += chunk.length;
    }
  }

  return NextResponse.json({ ok: true, embedded, pets: pets.length, owners: ownerIds.length });
}
