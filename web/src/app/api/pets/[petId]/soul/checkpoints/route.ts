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

  const [checkpoints, total] = await Promise.all([
    prisma.personaCheckpoint.findMany({
      where: { pet_id: pid },
      orderBy: { version: "desc" },
      skip: offset,
      take: limit,
      select: {
        id: true,
        version: true,
        persona_hash: true,
        trigger_event: true,
        on_chain: true,
        tx_hash: true,
        block_number: true,
        created_at: true,
      },
    }),
    prisma.personaCheckpoint.count({ where: { pet_id: pid } }),
  ]);

  return NextResponse.json({ checkpoints, total, limit, offset });
}
