/**
 * Memory Hash Anchor
 *
 * Computes a deterministic hash over the pet's MEMORY.md + USER.md + learned
 * skills, and records it as a checkpoint. The hash is always recorded locally
 * (DB); if `BLOCKCHAIN_ENABLED=true` and a relayer wallet is funded, the same
 * hash is also anchored on-chain via PETContent.mintContent with
 * genType="memory-anchor".
 *
 * Use case: prove "at time T, pet X knew this set of facts". Soul export
 * already includes the data; the anchor proves the export wasn't fabricated
 * later.
 */

import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { mintContentNFT } from "@/lib/blockchain";

/**
 * Canonical hash — must be reproducible given the same inputs in any order.
 * We sort keys so order doesn't matter, and use only the durable fields
 * (not updatedAt timestamps, which would change every consolidation).
 */
function canonicalize(obj: Record<string, unknown>): string {
  if (Array.isArray(obj)) {
    return "[" + obj.map(canonicalize as any).join(",") + "]";
  }
  if (obj && typeof obj === "object") {
    const keys = Object.keys(obj).sort();
    return "{" + keys.map(k => JSON.stringify(k) + ":" + canonicalize((obj as any)[k])).join(",") + "}";
  }
  return JSON.stringify(obj);
}

export async function computeMemoryHash(petId: number): Promise<string> {
  const pet = await prisma.pet.findUnique({ where: { id: petId } });
  if (!pet) throw new Error("Pet not found");

  const mods = (pet.personality_modifiers as any) || {};
  const memories = (mods.persistent_memories || []).map((m: any) => ({
    key: m.key, content: m.content, category: m.category, importance: m.importance,
  }));
  const profile = (mods.user_profile || []).map((u: any) => ({
    key: u.key, content: u.content, category: u.category,
  }));
  const learned = (mods.learned_patterns || []).map((p: any) => ({
    id: p.id, topic: p.topic, frequency: p.frequency,
    successRate: p.successRate, promotedToSkill: p.promotedToSkill,
  }));

  const canonical = canonicalize({ petId, memories, profile, learned });
  return "0x" + createHash("sha256").update(canonical).digest("hex");
}

export interface AnchorResult {
  hash: string;
  version: number;
  triggerEvent: string;
  txHash?: string;
  chain?: string;
  onChain: boolean;
}

export async function anchorMemory(
  petId: number,
  triggerEvent: string = "manual_anchor",
  // Optional, human-meaningful detail about what this anchor captured (e.g. the
  // before/after memory counts from a consolidation). Stored in persona_snapshot
  // so the Persona Evolution timeline can show a real per-row summary instead of
  // a generic repeated sentence.
  detail?: Record<string, unknown>,
): Promise<AnchorResult> {
  const hash = await computeMemoryHash(petId);

  // Off-chain checkpoint — store as PersonaCheckpoint linked to soul if exists
  const soul = await prisma.petSoulNft.findFirst({ where: { pet_id: petId } });
  let version = 1;
  let txHash: string | undefined;
  let chain: string | undefined;
  let onChain = false;

  if (soul) {
    const last = await prisma.personaCheckpoint.findFirst({
      where: { pet_id: petId },
      orderBy: { version: "desc" },
    });
    version = (last?.version || 0) + 1;

    // Try on-chain anchor if enabled. We mint a PETContent NFT with
    // genType="memory-anchor" and the hash in contentHash — gives us provable
    // immutable storage without a dedicated contract.
    const pet = await prisma.pet.findUnique({
      where: { id: petId },
      include: { user: { select: { wallet_address: true } } },
    });
    if (pet?.user?.wallet_address) {
      const mint = await mintContentNFT(
        pet.user.wallet_address, 0, 0, "memory-anchor", hash
      ).catch(() => null);
      if (mint) {
        txHash = mint.txHash;
        chain = "BSC";
        onChain = true;
      }
    }

    await prisma.personaCheckpoint.create({
      data: {
        soul_id: soul.id,
        pet_id: petId,
        version,
        persona_hash: hash.slice(0, 66),
        persona_snapshot: { kind: "memory_anchor", computedAt: new Date().toISOString(), ...(detail || {}) },
        trigger_event: triggerEvent.slice(0, 50),
        tx_hash: txHash?.slice(0, 66),
        on_chain: onChain,
      },
    });
  }

  return { hash, version, triggerEvent, txHash, chain, onChain };
}
