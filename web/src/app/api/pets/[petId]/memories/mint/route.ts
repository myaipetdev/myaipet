import { getUser } from "@/lib/auth";
import { blockchainEnabled } from "@/lib/onchain";
import { NextRequest, NextResponse } from "next/server";
import {
  BlockchainPausedError,
  MemoryClaimNotFoundError,
  mintMemoryNft,
  SoulNotAnchoredError,
} from "@/lib/services/soul";

interface MintBody {
  memory_id: number;
  title: string;
  description: string;
  memory_type: number;
  importance?: number;
}

/**
 * POST /api/pets/[petId]/memories/mint
 * Submit one stored memory for on-chain minting.
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

  // This endpoint promises an on-chain action, so it must never silently create
  // an off-chain row while the master switch is paused.
  if (!blockchainEnabled()) {
    return NextResponse.json(
      { error: "On-chain minting is temporarily unavailable" },
      { status: 503 },
    );
  }

  let body: MintBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { memory_id, title, description, memory_type, importance } = body;

  if (!Number.isSafeInteger(memory_id) || memory_id <= 0) {
    return NextResponse.json({ error: "memory_id is required" }, { status: 400 });
  }

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

  try {
    const mint = await mintMemoryNft(pid, user.id, {
      memoryId: memory_id,
      title: title.trim().slice(0, 200),
      description: description.slice(0, 4000),
      memoryType: Math.max(0, Math.min(3, Number(memory_type) || 0)) as 0 | 1 | 2 | 3,
      importance: (typeof importance === "number" ? Math.max(1, Math.min(5, importance)) : 1) as 1 | 2 | 3 | 4 | 5,
    });

    return NextResponse.json({
      ok: true,
      memory_mint: {
        id: mint.memoryNftId,
        content_hash: mint.contentHash,
        tx_hash: mint.mintTxHash,
        chain_status: mint.mintTxHash
          ? "submitted"
          : mint.shouldSubmit
            ? "queued"
            : "submission_in_progress",
        idempotent_replay: !mint.created,
      },
    }, { status: mint.created ? 201 : 200 });
  } catch (err: unknown) {
    if (err instanceof BlockchainPausedError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    if (err instanceof MemoryClaimNotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    if (err instanceof SoulNotAnchoredError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    console.error("[memories/mint] error:", err);
    return NextResponse.json(
      { error: "Failed to submit memory mint" },
      { status: 500 },
    );
  }
}
