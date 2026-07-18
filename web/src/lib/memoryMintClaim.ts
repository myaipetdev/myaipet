import type { Prisma } from "@/generated/prisma/client";
import { randomUUID } from "node:crypto";
import { keccak256, toUtf8Bytes } from "ethers";

export type MemoryMintType = 0 | 1 | 2 | 3;
export type MemoryMintImportance = 1 | 2 | 3 | 4 | 5;

export class MemoryClaimNotFoundError extends Error {
  constructor() {
    super("Memory not found");
    this.name = "MemoryClaimNotFoundError";
  }
}

export class SoulNotAnchoredError extends Error {
  constructor() {
    super("Pet Soul is not anchored on-chain yet");
    this.name = "SoulNotAnchoredError";
  }
}

type LockedMemory = {
  id: number;
  pet_id: number;
  memory_type: string;
  content: string;
  importance: number;
  is_minted: boolean;
  memory_nft_id: number | null;
  created_at: Date;
};

export type MemoryMintClaimInput = {
  userId: number;
  petId: number;
  memoryId: number;
  title: string;
  description: string;
  fallbackMemoryType: MemoryMintType;
};

export type MemoryMintClaim = {
  memoryNftId: number;
  contentHash: string;
  soulTokenId: number;
  ownerWallet: string;
  memoryType: MemoryMintType;
  importance: MemoryMintImportance;
  mintTxHash: string | null;
  created: boolean;
  shouldSubmit: boolean;
  claimToken: string | null;
};

const SUBMISSION_LEASE_MS = 5 * 60 * 1000;

function canonicalize(obj: Record<string, unknown>): string {
  return Object.keys(obj)
    .sort()
    .map((key) => {
      const value = obj[key];
      if (value === null || value === undefined) return `${key}=`;
      return `${key}=${String(value)}`;
    })
    .join("|");
}

/** Stable provenance hash of the stored memory, not caller-supplied display text. */
export function hashMemory(memory: {
  content: string;
  memory_type: string;
  created_at: Date;
}): string {
  const canonical = canonicalize({
    content: memory.content,
    memory_type: memory.memory_type,
    created_at: memory.created_at.toISOString(),
  });
  return keccak256(toUtf8Bytes(`memory:${canonical}`));
}

function toMemoryType(value: string, fallback: MemoryMintType): MemoryMintType {
  switch (value.trim().toLowerCase()) {
    case "conversation":
      return 0;
    case "milestone":
      return 1;
    case "dream":
      return 2;
    case "achievement":
      return 3;
    default:
      return fallback;
  }
}

function toImportance(value: number): MemoryMintImportance {
  return Math.max(1, Math.min(5, Math.trunc(value || 1))) as MemoryMintImportance;
}

/**
 * Atomic/idempotent claim core. The authoritative PetMemory row is locked
 * before checking/creating its chain-submission record. The database UNIQUE
 * index on memory_id is the final guard against any caller that bypasses this
 * helper.
 */
export async function claimMemoryMintRecord(
  tx: Prisma.TransactionClient,
  input: MemoryMintClaimInput,
): Promise<MemoryMintClaim> {
  const memories = await tx.$queryRaw<LockedMemory[]>`
    SELECT m."id", m."pet_id", m."memory_type", m."content",
           m."importance", m."is_minted", m."memory_nft_id", m."created_at"
      FROM "pet_memories" AS m
      JOIN "pets" AS p ON p."id" = m."pet_id"
     WHERE m."id" = ${input.memoryId}
       AND m."pet_id" = ${input.petId}
       AND p."user_id" = ${input.userId}
       AND p."is_active" = true
     FOR UPDATE OF m
  `;
  const memory = memories[0];
  if (!memory) throw new MemoryClaimNotFoundError();

  const soul = await tx.petSoulNft.findUnique({
    where: { pet_id: input.petId },
    select: { token_id: true, owner_wallet: true },
  });
  if (!soul || soul.token_id == null) throw new SoulNotAnchoredError();

  const existing = await tx.memoryNft.findUnique({
    where: { memory_id: input.memoryId },
    select: {
      id: true,
      pet_id: true,
      content_hash: true,
      mint_tx_hash: true,
    },
  });
  if (existing) {
    if (existing.pet_id !== input.petId) throw new MemoryClaimNotFoundError();
    if (!memory.is_minted || memory.memory_nft_id !== existing.id) {
      await tx.petMemory.update({
        where: { id: memory.id },
        data: { is_minted: true, memory_nft_id: existing.id },
        select: { id: true },
      });
    }
    let shouldSubmit = false;
    let claimToken: string | null = null;
    if (!existing.mint_tx_hash) {
      const leaseCutoff = new Date(Date.now() - SUBMISSION_LEASE_MS);
      claimToken = randomUUID();
      const lease = await tx.memoryNft.updateMany({
        where: {
          id: existing.id,
          mint_tx_hash: null,
          OR: [
            { mint_status: { in: ["recorded", "failed"] } },
            { mint_status: "submitting", mint_claimed_at: null },
            { mint_status: "submitting", mint_claimed_at: { lt: leaseCutoff } },
          ],
        },
        data: {
          mint_status: "submitting",
          mint_claim_token: claimToken,
          mint_claimed_at: new Date(),
          mint_attempts: { increment: 1 },
        },
      });
      shouldSubmit = lease.count === 1;
      if (!shouldSubmit) claimToken = null;
    }
    return {
      memoryNftId: existing.id,
      contentHash: existing.content_hash,
      soulTokenId: soul.token_id,
      ownerWallet: soul.owner_wallet,
      memoryType: toMemoryType(memory.memory_type, input.fallbackMemoryType),
      importance: toImportance(memory.importance),
      mintTxHash: existing.mint_tx_hash,
      created: false,
      shouldSubmit,
      claimToken,
    };
  }

  const memoryType = toMemoryType(memory.memory_type, input.fallbackMemoryType);
  const importance = toImportance(memory.importance);
  const contentHash = hashMemory(memory);
  const claimToken = randomUUID();
  const record = await tx.memoryNft.create({
    data: {
      pet_id: input.petId,
      memory_id: input.memoryId,
      soul_token_id: soul.token_id,
      content_hash: contentHash,
      memory_type: memoryType,
      importance,
      title: input.title,
      description: input.description,
      owner_wallet: soul.owner_wallet,
      chain: "bsc",
      mint_status: "submitting",
      mint_claim_token: claimToken,
      mint_claimed_at: new Date(),
      mint_attempts: 1,
    },
    select: { id: true, mint_tx_hash: true },
  });

  await tx.petMemory.update({
    where: { id: memory.id },
    data: { is_minted: true, memory_nft_id: record.id },
    select: { id: true },
  });

  return {
    memoryNftId: record.id,
    contentHash,
    soulTokenId: soul.token_id,
    ownerWallet: soul.owner_wallet,
    memoryType,
    importance,
    mintTxHash: record.mint_tx_hash,
    created: true,
    shouldSubmit: true,
    claimToken,
  };
}

/** Release only the lease owned by this relayer attempt. */
export async function markMemoryMintSubmissionFailed(
  tx: Prisma.TransactionClient,
  memoryNftId: number,
  claimToken: string,
): Promise<boolean> {
  const released = await tx.memoryNft.updateMany({
    where: {
      id: memoryNftId,
      mint_tx_hash: null,
      mint_status: "submitting",
      mint_claim_token: claimToken,
    },
    data: {
      mint_status: "failed",
      mint_claim_token: null,
    },
  });
  return released.count === 1;
}

/** A tx hash permanently closes the retry path for this memory. */
export async function markMemoryMintSubmitted(
  tx: Prisma.TransactionClient,
  memoryNftId: number,
  claimToken: string,
  txHash: string,
): Promise<boolean> {
  const submitted = await tx.memoryNft.updateMany({
    where: {
      id: memoryNftId,
      mint_tx_hash: null,
      mint_status: "submitting",
      mint_claim_token: claimToken,
    },
    data: {
      mint_tx_hash: txHash,
      mint_status: "submitted",
      mint_claim_token: null,
    },
  });
  return submitted.count === 1;
}
