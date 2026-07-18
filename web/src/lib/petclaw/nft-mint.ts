/**
 * Milestone history hooks with optional on-chain anchoring.
 *
 * Three triggers:
 *   1. Care Streak — records every 7-day consecutive care milestone
 *   2. Evolution — records each evolution-stage transition
 *   3. Content — records a generation after it crosses the like threshold
 *
 * The local row is always an off-chain milestone unless a real transaction hash
 * is returned. Optional chain submission is exact-gated by BLOCKCHAIN_ENABLED.
 */

import { prisma } from "@/lib/prisma";
import { mintContentNFT } from "@/lib/blockchain";
import { blockchainEnabled } from "@/lib/onchain";

const MIN_LIKES_FOR_CONTENT_MILESTONE = 50;
const STREAK_MILESTONE_INTERVAL_DAYS = 7;

export interface MilestoneResult {
  recorded: boolean;
  onChain: boolean;
  kind: "care-streak" | "evolution" | "content";
  txHash?: string;
  reason?: string;
}

// memory_type is INT in the schema; map our string kinds to stable codes.
const MEMORY_TYPE_CODE: Record<string, number> = {
  "care-streak": 10, "evolution": 20, "content": 30,
};

async function recordMilestone(
  petId: number,
  genType: "care-streak" | "evolution" | "content",
  contentHash: string,
  title: string,
  importance: number = 3,
): Promise<MilestoneResult> {
  const pet = await prisma.pet.findUnique({
    where: { id: petId },
    include: { user: { select: { wallet_address: true } } },
  });
  if (!pet?.user?.wallet_address) {
    return { recorded: false, onChain: false, kind: genType, reason: "no_owner_wallet" };
  }

  // Off-chain record first (always) — content_hash is unique so this is idempotent
  await prisma.memoryNft.upsert({
    where: { content_hash: contentHash },
    create: {
      pet_id: petId,
      owner_wallet: pet.user.wallet_address,
      title: title.slice(0, 200),
      description: `Recorded ${genType} milestone`,
      memory_type: MEMORY_TYPE_CODE[genType] || 0,
      content_hash: contentHash,
      importance,
    },
    update: {},
  });

  if (!blockchainEnabled()) {
    return { recorded: true, onChain: false, kind: genType, reason: "chain_paused" };
  }

  const result = await mintContentNFT(pet.user.wallet_address, 0, 0, genType, contentHash).catch(() => null);
  if (!result) return { recorded: true, onChain: false, kind: genType, reason: "chain_failed" };

  await prisma.memoryNft.update({
    where: { content_hash: contentHash },
    data: {
      mint_tx_hash: result.txHash,
      memory_token_id: result.tokenId || null,
      mint_status: "submitted",
    },
  });

  return { recorded: true, onChain: true, kind: genType, txHash: result.txHash };
}

/**
 * Care Streak — called from /api/pets/[petId]/interact after every feed.
 * Increments pet.care_streak by 1 if last_care_at is yesterday, else resets to 1.
 * Records a milestone when streak hits the configured interval.
 */
export async function checkCareStreak(petId: number): Promise<{ streak: number; milestone?: MilestoneResult }> {
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

  if (nextStreak > 0 && nextStreak % STREAK_MILESTONE_INTERVAL_DAYS === 0) {
    const hash = `0x${Buffer.from(`care-streak-${petId}-${nextStreak}-${today.toISOString().slice(0, 10)}`).toString("hex").slice(0, 64).padEnd(64, "0")}`;
    const milestone = await recordMilestone(petId, "care-streak", hash, `${nextStreak}-day care streak`);
    return { streak: nextStreak, milestone };
  }

  return { streak: nextStreak };
}

/**
 * Evolution — records once per stage transition.
 */
export async function recordEvolution(petId: number, newStage: number, evolutionName?: string): Promise<MilestoneResult> {
  const hash = `0x${Buffer.from(`evolution-${petId}-${newStage}`).toString("hex").slice(0, 64).padEnd(64, "0")}`;
  // Idempotency
  const already = await prisma.memoryNft.findFirst({ where: { pet_id: petId, content_hash: hash } });
  if (already) {
    return {
      recorded: true,
      onChain: Boolean(already.mint_tx_hash),
      kind: "evolution",
      txHash: already.mint_tx_hash || undefined,
      reason: "already_recorded",
    };
  }

  return recordMilestone(petId, "evolution", hash, `Evolved to stage ${newStage}${evolutionName ? `: ${evolutionName}` : ""}`);
}

/**
 * Content milestone — called when a generation crosses the like threshold.
 * The generation table tracks likes; we hash generationId + likes to keep
 * it idempotent at one mint per threshold crossing.
 */
export async function recordTopContentMilestone(generationId: number): Promise<MilestoneResult | null> {
  const gen = await prisma.generation.findUnique({
    where: { id: generationId },
    select: { id: true, user_id: true, photo_path: true, _count: { select: { likes: true } } },
  });
  if (!gen) return null;
  const likeCount = gen._count.likes || 0;
  if (likeCount < MIN_LIKES_FOR_CONTENT_MILESTONE) return null;

  // Generation doesn't have pet_id directly — resolve via user's primary pet
  const pet = gen.user_id ? await prisma.pet.findFirst({
    where: { user_id: gen.user_id, is_active: true },
    orderBy: { id: "asc" },
  }) : null;
  if (!pet) return null;

  const hash = `0x${Buffer.from(`content-${gen.id}-${Math.floor(likeCount / 10) * 10}`).toString("hex").slice(0, 64).padEnd(64, "0")}`;
  return recordMilestone(pet.id, "content", hash, `Top content: ${likeCount}+ likes`);
}

export const MIN_LIKES_FOR_MILESTONE = MIN_LIKES_FOR_CONTENT_MILESTONE;
