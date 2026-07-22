/**
 * GET  /api/pets/[petId]/daydream
 *   → recent surfaced insights (marks them seen). Owner-only.
 *
 * POST /api/pets/[petId]/daydream
 *   → runs one daydream cycle (owner-gated, or cron via x-cron-secret).
 *     Persists any insights the critic kept. Rate-limited / cooldown so we
 *     don't burn Grok budget on every page view.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePetOwner } from "@/lib/authz";
import {
  daydream,
  persistDaydreamInsights,
} from "@/lib/petclaw/memory/daydream";
import { containsHangul } from "@/lib/generatedLanguage";

const COOLDOWN_MS = 6 * 60 * 60 * 1000; // 6h between cycles per pet

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ petId: string }> },
) {
  const { petId } = await params;
  const id = Number(petId);
  if (!Number.isSafeInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Bad petId" }, { status: 400 });
  }

  // Insights can contain private retained-memory inferences. Authenticate and
  // prove ownership before either reading them or mutating their seen state.
  const auth = await requirePetOwner(req, id);
  if (auth.error) return auth.error;

  const rows = await prisma.petInsight.findMany({
    // Linked tombstones are retained only as structural privacy markers for
    // their generated media. They are not owner-facing memory.
    where: { pet_id: id, mood: { not: "deleted" } },
    orderBy: { created_at: "desc" },
    take: 5,
  });

  // Mark the freshest as seen so the "new" badge clears.
  const unseen = rows.filter(r => !r.seen).map(r => r.id);
  if (unseen.length) {
    await prisma.petInsight.updateMany({ where: { id: { in: unseen } }, data: { seen: true } }).catch(() => {});
  }

  return NextResponse.json({
    // Keep legacy rows in sovereign storage/export, but never put generated
    // Hangul back onto this English-only product surface.
    insights: rows.filter((r) => !containsHangul(r.insight)).map(r => ({
      id: r.id, insight: r.insight, mood: r.mood, score: r.score,
      created_at: r.created_at.toISOString(), wasNew: !r.seen,
    })),
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ petId: string }> },
) {
  const { petId } = await params;
  const id = Number(petId);
  if (!Number.isSafeInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Bad petId" }, { status: 400 });
  }

  // Auth: either the owner, or a cron call with the shared secret.
  const cronSecret = req.headers.get("x-cron-secret");
  const isCron = !!cronSecret && cronSecret === process.env.CRON_SECRET;
  let expectedMemoryEpoch: number;
  if (isCron) {
    const pet = await prisma.pet.findUnique({
      where: { id },
      select: { memory_epoch: true },
    });
    if (!pet) return NextResponse.json({ error: "Pet not found" }, { status: 404 });
    expectedMemoryEpoch = pet.memory_epoch;
  } else {
    const auth = await requirePetOwner(req, id);
    if (auth.error) return auth.error;
    expectedMemoryEpoch = auth.pet.memory_epoch;
  }

  // Cooldown — skip if we daydreamed recently (unless forced by cron).
  const last = await prisma.petInsight.findFirst({
    where: { pet_id: id, mood: { not: "deleted" } },
    orderBy: { created_at: "desc" },
    select: { created_at: true },
  });
  if (last && Date.now() - last.created_at.getTime() < COOLDOWN_MS && !isCron) {
    return NextResponse.json({ ok: true, skipped: "cooldown" });
  }

  const insights = await daydream(id, expectedMemoryEpoch);

  const safeInsights = insights.filter(
    (ins) => !containsHangul(ins.insight) && !containsHangul(ins.rationale),
  );
  // Persist even an empty result: the locked epoch check is what lets the API
  // distinguish a genuine no-op from provider work invalidated by deletion.
  const persisted = await persistDaydreamInsights(
    id,
    expectedMemoryEpoch,
    safeInsights,
  );
  if (persisted.discarded) {
    return NextResponse.json({
      ok: false,
      code: "daydream_stale",
      created: 0,
      discarded: true,
      error: "Memory changed while the daydream was running; the stale result was discarded.",
    }, { status: 409 });
  }

  if (insights.length === 0) {
    return NextResponse.json({ ok: true, created: 0, discarded: false, note: "Not enough memories yet — keep chatting." });
  }
  if (safeInsights.length === 0) {
    return NextResponse.json({ ok: true, created: 0, discarded: false, note: "No English insight was generated this time." });
  }

  return NextResponse.json({ ok: true, created: persisted.created, discarded: false });
}
