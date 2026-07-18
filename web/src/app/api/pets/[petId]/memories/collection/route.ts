import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/pets/[petId]/memories/collection
 * Returns preserved memory milestones. Only rows with a transaction hash are
 * described as submitted on-chain.
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

  const records = await prisma.memoryNft.findMany({
    where: { pet_id: pid },
    orderBy: { created_at: "desc" },
    select: {
      id: true,
      memory_token_id: true,
      memory_type: true,
      title: true,
      description: true,
      importance: true,
      content_hash: true,
      mint_tx_hash: true,
      minted_at: true,
      created_at: true,
    },
  });

  const items = records.map((record) => ({
    id: record.id,
    token_id: record.memory_token_id,
    memory_type: record.memory_type,
    title: record.title,
    description: record.description,
    importance: record.importance,
    content_hash: record.content_hash,
    tx_hash: record.mint_tx_hash,
    minted_at: record.minted_at,
    recorded_at: record.created_at,
    status: record.memory_token_id != null
      ? "on_chain"
      : record.mint_tx_hash
        ? "submitted"
        : "off_chain_history",
  }));

  return NextResponse.json({ items, total: items.length });
}
