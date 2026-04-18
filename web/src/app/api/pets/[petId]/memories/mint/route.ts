import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { mintMemoryNft } from "@/lib/services/soul";

interface MintBody {
  memory_id?: number;
  title: string;
  description: string;
  memory_type: number;
  importance?: number;
}

/**
 * POST /api/pets/[petId]/memories/mint
 * Mint a memory as an NFT.
 */
export async function POST(
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

  let body: MintBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { memory_id, title, description, memory_type, importance } = body;

  if (!title || typeof title !== "string" || title.trim().length === 0) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }
  if (!description || typeof description !== "string") {
    return NextResponse.json({ error: "description is required" }, { status: 400 });
  }
  if (typeof memory_type !== "number" || memory_type < 0 || memory_type > 3) {
    return NextResponse.json(
      { error: "memory_type must be 0-3 (conversation/milestone/dream/achievement)" },
      { status: 400 },
    );
  }

  // If memory_id provided, verify it belongs to this pet
  if (memory_id !== undefined) {
    const mem = await prisma.petMemory.findFirst({
      where: { id: Number(memory_id), pet_id: pid },
    });
    if (!mem) {
      return NextResponse.json({ error: "Memory not found" }, { status: 404 });
    }
    if ((mem as any).is_minted) {
      return NextResponse.json({ error: "Memory already minted" }, { status: 409 });
    }
  }

  try {
    const nft = await mintMemoryNft(pid, {
      memoryId: memory_id,
      title: title.trim().slice(0, 200),
      description: description.slice(0, 4000),
      memoryType: Math.max(0, Math.min(3, Number(memory_type) || 0)) as 0 | 1 | 2 | 3,
      importance: (typeof importance === "number" ? Math.max(1, Math.min(5, importance)) : 1) as 1 | 2 | 3 | 4 | 5,
    });

    if (memory_id !== undefined) {
      await prisma.petMemory
        .update({
          where: { id: Number(memory_id) },
          data: { is_minted: true, memory_nft_id: (nft as any)?.id },
        })
        .catch((e) => console.error("[memories/mint] link update error:", e));
    }

    return NextResponse.json({ ok: true, memory_nft: nft }, { status: 201 });
  } catch (err: any) {
    console.error("[memories/mint] error:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to mint memory" },
      { status: 500 },
    );
  }
}
