import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/pets/[petId]/soul/checkpoints?limit=20&offset=0
 * Returns paginated persona checkpoint history.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ petId: string }> },
) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { petId } = await params;
  const pid = Number(petId);
  if (!pid || Number.isNaN(pid)) {
    return NextResponse.json({ error: "Invalid petId" }, { status: 400 });
  }

  const pet = await prisma.pet.findFirst({
    where: { id: pid, user_id: user.id, is_active: true },
  });
  if (!pet) return NextResponse.json({ error: "Pet not found" }, { status: 404 });

  const { searchParams } = new URL(req.url);
  const limit = Math.max(1, Math.min(100, Number(searchParams.get("limit")) || 20));
  const offset = Math.max(0, Number(searchParams.get("offset")) || 0);

  const [rows, total] = await Promise.all([
    prisma.personaCheckpoint.findMany({
      where: { pet_id: pid },
      orderBy: { version: "desc" },
      skip: offset,
      take: limit,
      select: {
        id: true,
        version: true,
        persona_hash: true,
        persona_snapshot: true,
        trigger_event: true,
        on_chain: true,
        tx_hash: true,
        block_number: true,
        created_at: true,
      },
    }),
    prisma.personaCheckpoint.count({ where: { pet_id: pid } }),
  ]);

  // Derive a real, human-readable summary from the stored snapshot (we do NOT
  // ship the raw snapshot to the client). Consolidation checkpoints now carry
  // before/after memory counts (anchor.ts detail), so the timeline can show
  // "Distilled 12 → 8 memories" instead of a repeated generic sentence.
  const checkpoints = rows.map(({ persona_snapshot, ...ck }) => {
    const snap = (persona_snapshot || {}) as Record<string, unknown>;
    let summary: string | undefined;
    if (ck.trigger_event === "post_consolidation" && typeof snap.memoriesAfter === "number") {
      const before = snap.memoriesBefore as number | undefined;
      const after = snap.memoriesAfter as number;
      summary = typeof before === "number" && before !== after
        ? `Distilled ${before} → ${after} memories`
        : `${after} memories kept tidy`;
    }
    return summary ? { ...ck, summary } : ck;
  });

  return NextResponse.json({ checkpoints, total, limit, offset });
}
