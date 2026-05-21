/**
 * Auto-mint hooks for milestone NFTs.
 *
 * Three triggers:
 *   1. Care Streak — every 7-day consecutive care streak mints a `care-streak` NFT
 *   2. Evolution — when evolution_stage advances, mints an `evolution` NFT
 *   3. Content — when a pet generation crosses `MIN_LIKES_FOR_NFT`, mints a `content` NFT
 *
 * All three reuse `mintContentNFT()` (PETContent.mintContent) with different genType.
 * Gated by `BLOCKCHAIN_ENABLED=true` + funded relayer. If gas/relayer missing,
 * mints are recorded off-chain in `memoryNft` table with `is_minted=false`
 * (so the visual badge still appears, and we can backfill mints later).
 */

import { prisma } from "@/lib/prisma";
import { mintContentNFT } from "@/lib/blockchain";

const MIN_LIKES_FOR_CONTENT_NFT = 50;
const STREAK_NFT_INTERVAL_DAYS = 7;     // mint every 7 consecutive care days

interface MintResult {
  ok: boolean;
  kind: "care-streak" | "evolution" | "content";
  txHash?: string;
  reason?: string;
}

// memory_type is INT in the schema; map our string kinds to stable codes.
const MEMORY_TYPE_CODE: Record<string, number> = {
  "care-streak": 10, "evolution": 20, "content": 30,
};

async function attemptMint(
  petId: number,
  genType: "care-streak" | "evolution" | "content",
  contentHash: string,
  title: string,
  importance: number = 3,
): Promise<MintResult> {
  const pet = await prisma.pet.findUnique({
    where: { id: petId },
    include: { user: { select: { wallet_address: true } } },
  });
  if (!pet?.user?.wallet_address) return { ok: false, kind: genType, reason: "no_owner_wallet" };

  // Off-chain record first (always) — content_hash is unique so this is idempotent
  await prisma.memoryNft.upsert({
    where: { content_hash: contentHash },
    create: {
      pet_id: petId,
      owner_wallet: pet.user.wallet_address,
      title: title.slice(0, 200),
      description: `Auto-minted ${genType} milestone`,
      memory_type: MEMORY_TYPE_CODE[genType] || 0,
      content_hash: contentHash,
      importance,
    },
    update: {},
  });

  // On-chain mint if enabled (mintContentNFT returns null if BLOCKCHAIN_ENABLED!=true or relayer unfunded)
  const result = await mintContentNFT(pet.user.wallet_address, 0, 0, genType, contentHash).catch(() => null);
  if (!result) return { ok: false, kind: genType, reason: "chain_disabled_or_failed" };

  await prisma.memoryNft.update({
    where: { content_hash: contentHash },
    data: { mint_tx_hash: result.txHash, memory_token_id: result.tokenId || null, minted_at: new Date() },
  });

  return { ok: true, kind: genType, txHash: result.txHash };
}

/**
 * Care Streak — called from /api/pets/[petId]/interact after every feed.
 * Increments pet.care_streak by 1 if last_care_at is yesterday, else resets to 1.
 * Mints when streak hits a multiple of STREAK_NFT_INTERVAL_DAYS.
 */
export async function checkCareStreak(petId: number): Promise<{ streak: number; minted?: MintResult }> {
  const pet = await prisma.pet.findUnique({ where: { id: petId } });
  if (!pet) return { streak: 0 };

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const last = pet.last_care_at ? new Date(pet.last_care_at) : null;
  const lastDay = last ? new Date(last.getFullYear(), last.getMonth(), last.getDate()) : null;

  let nextStreak = pet.care_streak;
  if (!lastDay) {
    nextStreak = 1;
  } else {
    const diffDays = Math.round((today.getTime() - lastDay.getTime()) / 86_400_000);
    if (diffDays === 0) {
      // Already counted today
      return { streak: nextStreak };
    } else if (diffDays === 1) {
      nextStreak = pet.care_streak + 1;
    } else {
      // Broke the streak
      nextStreak = 1;
    }
  }

  await prisma.pet.update({
    where: { id: petId },
    data: { care_streak: nextStreak, last_care_at: now },
  });

  if (nextStreak > 0 && nextStreak % STREAK_NFT_INTERVAL_DAYS === 0) {
    const hash = `0x${Buffer.from(`care-streak-${petId}-${nextStreak}-${today.toISOString().slice(0, 10)}`).toString("hex").slice(0, 64).padEnd(64, "0")}`;
    const minted = await attemptMint(petId, "care-streak", hash, `${nextStreak}-day care streak`);
    return { streak: nextStreak, minted };
  }

  return { streak: nextStreak };
}

/**
 * Evolution — called from wherever evolution_stage gets bumped. Mints once
 * per stage transition (idempotent: checks memoryNft for same content_hash).
 */
export async function recordEvolution(petId: number, newStage: number, evolutionName?: string): Promise<MintResult> {
  const hash = `0x${Buffer.from(`evolution-${petId}-${newStage}`).toString("hex").slice(0, 64).padEnd(64, "0")}`;
  // Idempotency
  const already = await prisma.memoryNft.findFirst({ where: { pet_id: petId, content_hash: hash } });
  if (already) return { ok: true, kind: "evolution", reason: "already_recorded" };

  return attemptMint(petId, "evolution", hash, `Evolved to stage ${newStage}${evolutionName ? `: ${evolutionName}` : ""}`);
}

/**
 * Content NFT — called when a generation crosses the like threshold.
 * The generation table tracks likes; we hash generationId + likes to keep
 * it idempotent at one mint per threshold crossing.
 */
export async function autoMintTopContent(generationId: number): Promise<MintResult | null> {
  const gen = await prisma.generation.findUnique({
    where: { id: generationId },
    select: { id: true, user_id: true, photo_path: true, _count: { select: { likes: true } } },
  });
  if (!gen) return null;
  const likeCount = gen._count.likes || 0;
  if (likeCount < MIN_LIKES_FOR_CONTENT_NFT) return null;

  // Generation doesn't have pet_id directly — resolve via user's primary pet
  const pet = gen.user_id ? await prisma.pet.findFirst({
    where: { user_id: gen.user_id, is_active: true },
    orderBy: { id: "asc" },
  }) : null;
  if (!pet) return null;

  const hash = `0x${Buffer.from(`content-${gen.id}-${Math.floor(likeCount / 10) * 10}`).toString("hex").slice(0, 64).padEnd(64, "0")}`;
  return attemptMint(pet.id, "content", hash, `Top content: ${likeCount}+ likes`);
}

export const MIN_LIKES_FOR_NFT = MIN_LIKES_FOR_CONTENT_NFT;
