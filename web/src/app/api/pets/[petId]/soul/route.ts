import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/pets/[petId]/soul
 * Returns the Web4 Soul NFT state for the pet.
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

  const soul = await prisma.petSoulNft.findUnique({
    where: { pet_id: pid },
  });

  if (!soul) {
    return NextResponse.json({
      soul: null,
      checkpoint_count: 0,
      memory_nft_count: 0,
    });
  }

  const [checkpoint_count, memory_nft_count] = await Promise.all([
    prisma.personaCheckpoint.count({ where: { soul_id: soul.id } }),
    prisma.memoryNft.count({ where: { pet_id: pid } }),
  ]);

  return NextResponse.json({
    soul: {
      token_id: soul.token_id,
      genesis_hash: soul.genesis_hash,
      current_hash: soul.current_hash,
      current_version: soul.current_version,
      mint_tx_hash: soul.mint_tx_hash,
      chain: soul.chain,
      minted_at: soul.minted_at,
      successor_wallet: soul.successor_wallet,
      is_deceased: soul.is_deceased,
      inherited_from: soul.inherited_from,
      last_heartbeat_at: soul.last_heartbeat_at,
    },
    checkpoint_count,
    memory_nft_count,
  });
}
