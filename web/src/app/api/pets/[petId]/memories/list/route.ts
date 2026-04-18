import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/pets/[petId]/memories/list?mintable=true
 * Returns pet memories with mint status. If mintable=true, only returns
 * unminted memories eligible for NFT minting.
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
  const mintableOnly = searchParams.get("mintable") === "true";
  const limit = Math.max(1, Math.min(200, Number(searchParams.get("limit")) || 50));
  const offset = Math.max(0, Number(searchParams.get("offset")) || 0);

  const where: any = { pet_id: pid };
  if (mintableOnly) {
    where.is_minted = false;
    where.importance = { gte: 3 };
  }

  const [rawItems, total] = await Promise.all([
    prisma.petMemory.findMany({
      where,
      orderBy: { created_at: "desc" },
      skip: offset,
      take: limit,
    }),
    prisma.petMemory.count({ where }),
  ]);

  // Fetch any linked MemoryNft records
  const mintedIds = rawItems
    .map((m: any) => m.memory_nft_id)
    .filter((id: any): id is number => typeof id === "number");

  const nftMap = new Map<number, any>();
  if (mintedIds.length > 0) {
    const nfts = await prisma.memoryNft.findMany({
      where: { id: { in: mintedIds } },
    });
    for (const n of nfts) nftMap.set(n.id, n);
  }

  const items = rawItems.map((m: any) => ({
    ...m,
    memory_nft: m.memory_nft_id ? nftMap.get(m.memory_nft_id) || null : null,
  }));

  return NextResponse.json({ items, total, limit, offset });
}
