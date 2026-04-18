/**
 * Soul Service — Web4.0 Sovereignty
 *
 * Bridges off-chain persona data with the on-chain PetSoul NFT contract.
 * All on-chain calls are fire-and-forget and non-blocking — the pet functions
 * correctly whether or not the contract is deployed. DB state is the source
 * of truth; on-chain is a verification layer.
 */

import { prisma } from "@/lib/prisma";
import {
  keccak256,
  toUtf8Bytes,
  JsonRpcProvider,
  Wallet,
  Contract,
  zeroPadValue,
} from "ethers";
import { getPersona, type PersonaData } from "@/lib/services/persona";

// ═══════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════

const BSC_RPC = "https://bsc-dataseed1.binance.org";
const INACTIVITY_THRESHOLD_DAYS = 180;

// Minimal ABI for PetSoul contract
const PET_SOUL_ABI = [
  "function mintSoul(address owner, uint256 petId, bytes32 genesisHash) external returns (uint256)",
  "function recordCheckpoint(uint256 tokenId, bytes32 newHash) external",
  "function mintMemory(address owner, uint256 soulTokenId, bytes32 contentHash, uint8 memoryType, uint8 importance) external returns (uint256)",
  "function heartbeat(uint256 tokenId) external",
  "function setSuccessor(uint256 tokenId, address successor) external",
  "function claimInheritance(uint256 tokenId, address newOwner) external",
  "event SoulMinted(uint256 indexed tokenId, address indexed owner, uint256 indexed petId)",
  "event MemoryMinted(uint256 indexed tokenId, uint256 indexed soulTokenId)",
];

// ═══════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════

export type CheckpointTrigger =
  | "adoption"
  | "onboarding"
  | "chat_analysis"
  | "observation"
  | "manual";

export type MemoryType = 0 | 1 | 2 | 3;
export type MemoryImportance = 1 | 2 | 3 | 4 | 5;

// ═══════════════════════════════════════════════
// HASHING
// ═══════════════════════════════════════════════

/**
 * Build a canonical, order-independent string from an object.
 * Keys are sorted, values stringified, joined with "|".
 */
function canonicalize(obj: Record<string, unknown>): string {
  const parts: string[] = [];
  const keys = Object.keys(obj).sort();
  for (const k of keys) {
    const v = obj[k];
    if (v === null || v === undefined) {
      parts.push(`${k}=`);
      continue;
    }
    if (typeof v === "object") {
      // Deterministic JSON via sorted keys for nested objects/arrays
      parts.push(`${k}=${stableStringify(v)}`);
    } else {
      parts.push(`${k}=${String(v)}`);
    }
  }
  return parts.join("|");
}

/**
 * Deterministic JSON stringifier with sorted keys (recursive).
 */
function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(",")}}`;
}

/**
 * Compute a deterministic hash of a persona. Order-independent for JSON fields.
 */
export function hashPersona(persona: {
  owner_speech_style?: string | null;
  owner_interests?: string | null;
  owner_expressions?: string | null;
  owner_tone?: string | null;
  owner_language?: string | null;
  owner_bio?: string | null;
  vocabulary_style?: string | null;
  analyzed_patterns?: unknown;
  observed_topics?: unknown;
}): string {
  const canonical = canonicalize({
    owner_speech_style: persona.owner_speech_style ?? null,
    owner_interests: persona.owner_interests ?? null,
    owner_expressions: persona.owner_expressions ?? null,
    owner_tone: persona.owner_tone ?? null,
    owner_language: persona.owner_language ?? null,
    owner_bio: persona.owner_bio ?? null,
    vocabulary_style: persona.vocabulary_style ?? null,
    analyzed_patterns: persona.analyzed_patterns ?? null,
    observed_topics: persona.observed_topics ?? null,
  });
  return keccak256(toUtf8Bytes(`persona:${canonical}`));
}

/**
 * Hash the initial pet state for genesis checkpoint.
 */
export function hashGenesis(pet: {
  name: string;
  species: number;
  personality_type: string;
  created_at: Date;
  user_id: number;
}): string {
  const canonical = canonicalize({
    name: pet.name,
    species: pet.species,
    personality_type: pet.personality_type,
    created_at: pet.created_at.toISOString(),
    user_id: pet.user_id,
  });
  return keccak256(toUtf8Bytes(`genesis:${canonical}`));
}

/**
 * Hash arbitrary memory content for memory NFT.
 */
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

// ═══════════════════════════════════════════════
// ON-CHAIN INFRASTRUCTURE
// ═══════════════════════════════════════════════

function getSoulContract(): Contract | null {
  try {
    const address = process.env.NEXT_PUBLIC_PET_SOUL_ADDRESS;
    if (!address) {
      console.warn("[soul] NEXT_PUBLIC_PET_SOUL_ADDRESS not set, on-chain disabled");
      return null;
    }
    const key = process.env.BACKEND_RELAYER_KEY;
    if (!key) {
      console.warn("[soul] BACKEND_RELAYER_KEY not set, on-chain disabled");
      return null;
    }
    const provider = new JsonRpcProvider(BSC_RPC);
    const wallet = new Wallet(key, provider);
    return new Contract(address, PET_SOUL_ABI, wallet);
  } catch (err) {
    console.error("[soul] getSoulContract error:", err);
    return null;
  }
}

function toBytes32(hash: string): string {
  return zeroPadValue(hash, 32);
}

// ═══════════════════════════════════════════════
// SOUL NFT LIFECYCLE
// ═══════════════════════════════════════════════

/**
 * Create the initial Soul NFT record when a pet is adopted.
 * Also creates the genesis persona checkpoint.
 * Fire-and-forget: returns immediately, on-chain minting happens async.
 */
export async function initializeSoul(
  petId: number,
  ownerWallet: string,
): Promise<{ soulId: number; genesisHash: string }> {
  const pet = await prisma.pet.findUnique({
    where: { id: petId },
    select: {
      id: true,
      name: true,
      species: true,
      personality_type: true,
      created_at: true,
      user_id: true,
    },
  });
  if (!pet) throw new Error(`Pet ${petId} not found`);

  const existing = await prisma.petSoulNft.findUnique({ where: { pet_id: petId } });
  if (existing) {
    return { soulId: existing.id, genesisHash: existing.genesis_hash };
  }

  const genesisHash = hashGenesis({
    name: pet.name,
    species: pet.species,
    personality_type: pet.personality_type,
    created_at: pet.created_at,
    user_id: pet.user_id,
  });

  const soul = await prisma.$transaction(async (tx) => {
    const created = await tx.petSoulNft.create({
      data: {
        pet_id: petId,
        owner_wallet: ownerWallet.toLowerCase(),
        genesis_hash: genesisHash,
        current_hash: genesisHash,
        current_version: 1,
        chain: "bsc",
      },
    });

    await tx.personaCheckpoint.create({
      data: {
        soul_id: created.id,
        pet_id: petId,
        version: 1,
        persona_hash: genesisHash,
        persona_snapshot: {
          name: pet.name,
          species: pet.species,
          personality_type: pet.personality_type,
          genesis: true,
        },
        trigger_event: "adoption",
        on_chain: false,
      },
    });

    return created;
  });

  fireAndForgetMintSoul({
    ownerWallet: ownerWallet.toLowerCase(),
    petId,
    genesisHash,
    soulRecordId: soul.id,
  });

  return { soulId: soul.id, genesisHash };
}

/**
 * Record a new persona checkpoint (when persona evolves).
 * Updates PetSoulNft.current_hash / current_version and creates a
 * PersonaCheckpoint record. Triggers async on-chain recordCheckpoint.
 */
export async function recordCheckpoint(
  petId: number,
  triggerEvent: "onboarding" | "chat_analysis" | "observation" | "manual",
): Promise<{ version: number; hash: string; checkpointId: number }> {
  let soul = await prisma.petSoulNft.findUnique({ where: { pet_id: petId } });
  // Auto-initialize Soul if missing (handles pets created before Web4, test data, etc.)
  if (!soul) {
    const pet = await prisma.pet.findUnique({
      where: { id: petId },
      include: { user: true },
    });
    if (!pet || !pet.user) {
      throw new Error(`Pet ${petId} or owner not found`);
    }
    await initializeSoul(petId, pet.user.wallet_address);
    soul = await prisma.petSoulNft.findUnique({ where: { pet_id: petId } });
    if (!soul) {
      throw new Error(`Failed to auto-initialize soul for pet ${petId}`);
    }
  }

  const persona = (await getPersona(petId)) as PersonaData | null;
  if (!persona) {
    // No persona yet — nothing to checkpoint
    return {
      version: soul.current_version,
      hash: soul.current_hash,
      checkpointId: -1,
    };
  }

  const newHash = hashPersona({
    owner_speech_style: persona.owner_speech_style,
    owner_interests: persona.owner_interests,
    owner_expressions: persona.owner_expressions,
    owner_tone: persona.owner_tone,
    owner_language: persona.owner_language,
    owner_bio: persona.owner_bio,
    vocabulary_style: persona.vocabulary_style,
    analyzed_patterns: persona.analyzed_patterns,
    observed_topics: persona.observed_topics,
  });

  if (newHash === soul.current_hash) {
    // No change
    return {
      version: soul.current_version,
      hash: soul.current_hash,
      checkpointId: -1,
    };
  }

  const newVersion = soul.current_version + 1;

  const checkpoint = await prisma.$transaction(async (tx) => {
    const cp = await tx.personaCheckpoint.create({
      data: {
        soul_id: soul.id,
        pet_id: petId,
        version: newVersion,
        persona_hash: newHash,
        persona_snapshot: persona as unknown as object,
        trigger_event: triggerEvent,
        on_chain: false,
      },
    });

    await tx.petSoulNft.update({
      where: { id: soul.id },
      data: {
        current_hash: newHash,
        current_version: newVersion,
      },
    });

    return cp;
  });

  if (soul.token_id != null) {
    fireAndForgetCheckpoint({
      tokenId: soul.token_id,
      newHash,
      checkpointId: checkpoint.id,
    });
  }

  return { version: newVersion, hash: newHash, checkpointId: checkpoint.id };
}

/**
 * Record heartbeat (pet activity detected).
 * Updates User.last_active_at and PetSoulNft.last_heartbeat_at.
 */
export async function recordHeartbeat(petId: number): Promise<void> {
  try {
    const pet = await prisma.pet.findUnique({
      where: { id: petId },
      select: { user_id: true },
    });
    if (!pet) return;

    const now = new Date();
    await prisma.$transaction([
      prisma.user.update({
        where: { id: pet.user_id },
        data: { last_active_at: now },
      }),
      prisma.petSoulNft.updateMany({
        where: { pet_id: petId },
        data: { last_heartbeat_at: now },
      }),
    ]);
    // On-chain heartbeats are batched via cron — nothing to fire here.
  } catch (err) {
    console.error("[soul] recordHeartbeat error:", err);
  }
}

/**
 * Set successor wallet for inheritance.
 */
export async function setSuccessor(
  petId: number,
  successorWallet: string,
): Promise<void> {
  let soul = await prisma.petSoulNft.findUnique({ where: { pet_id: petId } });
  if (!soul) {
    const pet = await prisma.pet.findUnique({
      where: { id: petId },
      include: { user: true },
    });
    if (!pet || !pet.user) throw new Error(`Pet ${petId} or owner not found`);
    await initializeSoul(petId, pet.user.wallet_address);
    soul = await prisma.petSoulNft.findUnique({ where: { pet_id: petId } });
    if (!soul) throw new Error(`Failed to auto-initialize soul for pet ${petId}`);
  }

  const successor = successorWallet.toLowerCase();

  await prisma.$transaction([
    prisma.petSoulNft.update({
      where: { id: soul.id },
      data: { successor_wallet: successor },
    }),
    prisma.user.updateMany({
      where: { wallet_address: soul.owner_wallet },
      data: { successor_wallet: successor },
    }),
  ]);

  if (soul.token_id != null) {
    const contract = getSoulContract();
    if (contract) {
      (async () => {
        try {
          const tx = await contract.setSuccessor(soul.token_id, successor);
          console.log(`[soul] setSuccessor tx sent: ${tx.hash}`);
        } catch (err) {
          console.error("[soul] setSuccessor on-chain error:", err);
        }
      })();
    }
  }
}

// ═══════════════════════════════════════════════
// MEMORY NFT
// ═══════════════════════════════════════════════

/**
 * Mint a memory as NFT. Creates MemoryNft record and fires on-chain mint.
 */
export async function mintMemoryNft(
  petId: number,
  options: {
    memoryId?: number;
    title: string;
    description: string;
    memoryType: MemoryType;
    importance: MemoryImportance;
  },
): Promise<{ memoryNftId: number; contentHash: string }> {
  let soul = await prisma.petSoulNft.findUnique({ where: { pet_id: petId } });
  if (!soul) {
    const pet = await prisma.pet.findUnique({
      where: { id: petId },
      include: { user: true },
    });
    if (!pet || !pet.user) throw new Error(`Pet ${petId} or owner not found`);
    await initializeSoul(petId, pet.user.wallet_address);
    soul = await prisma.petSoulNft.findUnique({ where: { pet_id: petId } });
    if (!soul) throw new Error(`Failed to auto-initialize soul for pet ${petId}`);
  }

  const now = new Date();
  const contentHash = hashMemory({
    content: `${options.title}\n${options.description}`,
    memory_type: String(options.memoryType),
    created_at: now,
  });

  const record = await prisma.memoryNft.create({
    data: {
      pet_id: petId,
      memory_id: options.memoryId ?? null,
      soul_token_id: soul.token_id ?? null,
      content_hash: contentHash,
      memory_type: options.memoryType,
      importance: options.importance,
      title: options.title,
      description: options.description,
      owner_wallet: soul.owner_wallet,
      chain: "bsc",
    },
  });

  if (options.memoryId != null) {
    try {
      await prisma.petMemory.update({
        where: { id: options.memoryId },
        data: { is_minted: true, memory_nft_id: record.id },
      });
    } catch (err) {
      console.error("[soul] petMemory update skipped:", err);
    }
  }

  if (soul.token_id != null) {
    fireAndForgetMintMemory({
      ownerWallet: soul.owner_wallet,
      soulTokenId: soul.token_id,
      contentHash,
      memoryType: options.memoryType,
      importance: options.importance,
      memoryNftRecordId: record.id,
    });
  }

  return { memoryNftId: record.id, contentHash };
}

// ═══════════════════════════════════════════════
// INHERITANCE
// ═══════════════════════════════════════════════

/**
 * Check all pets with successors for inactivity. If user inactive
 * > INACTIVITY_THRESHOLD_DAYS, trigger inheritance. Called by cron job.
 */
export async function checkInheritance(): Promise<{
  checked: number;
  inherited: number;
  events: Array<{ petId: number; from: string; to: string }>;
}> {
  const souls = await prisma.petSoulNft.findMany({
    where: {
      successor_wallet: { not: null },
      is_deceased: false,
    },
  });

  const events: Array<{ petId: number; from: string; to: string }> = [];
  let inherited = 0;

  const now = Date.now();
  const thresholdMs = INACTIVITY_THRESHOLD_DAYS * 24 * 60 * 60 * 1000;

  for (const soul of souls) {
    try {
      const owner = await prisma.user.findFirst({
        where: { wallet_address: soul.owner_wallet },
        select: { id: true, last_active_at: true },
      });
      if (!owner) continue;

      const lastActive = owner.last_active_at?.getTime() ?? 0;
      const inactiveMs = now - lastActive;
      if (inactiveMs < thresholdMs) continue;

      const successor = soul.successor_wallet!;
      const inactiveDays = Math.floor(inactiveMs / (24 * 60 * 60 * 1000));
      const fromWallet = soul.owner_wallet;

      await prisma.$transaction([
        prisma.inheritanceEvent.create({
          data: {
            pet_id: soul.pet_id,
            from_wallet: fromWallet,
            to_wallet: successor,
            reason: "inactivity",
            inactive_days: inactiveDays,
          },
        }),
        prisma.petSoulNft.update({
          where: { id: soul.id },
          data: {
            owner_wallet: successor,
            inherited_from: fromWallet,
            successor_wallet: null,
          },
        }),
      ]);

      if (soul.token_id != null) {
        const contract = getSoulContract();
        if (contract) {
          (async () => {
            try {
              const tx = await contract.claimInheritance(soul.token_id, successor);
              console.log(`[soul] claimInheritance tx sent: ${tx.hash}`);
            } catch (err) {
              console.error("[soul] claimInheritance on-chain error:", err);
            }
          })();
        }
      }

      events.push({ petId: soul.pet_id, from: fromWallet, to: successor });
      inherited++;
    } catch (err) {
      console.error(`[soul] checkInheritance error for soul ${soul.id}:`, err);
    }
  }

  return { checked: souls.length, inherited, events };
}

// ═══════════════════════════════════════════════
// ON-CHAIN (Fire-and-forget wrappers)
// ═══════════════════════════════════════════════

function fireAndForgetMintSoul(params: {
  ownerWallet: string;
  petId: number;
  genesisHash: string;
  soulRecordId: number;
}): void {
  const contract = getSoulContract();
  if (!contract) return;

  (async () => {
    try {
      const tx = await contract.mintSoul(
        params.ownerWallet,
        params.petId,
        toBytes32(params.genesisHash),
      );
      console.log(`[soul] mintSoul tx sent: ${tx.hash}`);

      await prisma.petSoulNft.update({
        where: { id: params.soulRecordId },
        data: { mint_tx_hash: tx.hash, minted_at: new Date() },
      });

      tx.wait()
        .then(async (receipt: { blockNumber: number; logs: unknown[] }) => {
          try {
            let tokenId: number | null = null;
            for (const log of receipt.logs as Array<{
              topics: string[];
              data: string;
            }>) {
              try {
                const parsed = contract.interface.parseLog({
                  topics: log.topics,
                  data: log.data,
                });
                if (parsed && parsed.name === "SoulMinted") {
                  tokenId = Number(parsed.args.tokenId);
                  break;
                }
              } catch {
                // skip
              }
            }
            await prisma.petSoulNft.update({
              where: { id: params.soulRecordId },
              data: {
                mint_block: receipt.blockNumber,
                ...(tokenId !== null ? { token_id: tokenId } : {}),
              },
            });
            console.log(
              `[soul] mintSoul confirmed tokenId=${tokenId} block=${receipt.blockNumber}`,
            );
          } catch (err) {
            console.error("[soul] mintSoul post-confirm error:", err);
          }
        })
        .catch((err: unknown) => {
          console.error("[soul] mintSoul tx failed:", err);
        });
    } catch (err) {
      console.error("[soul] fireAndForgetMintSoul error:", err);
    }
  })();
}

function fireAndForgetCheckpoint(params: {
  tokenId: number;
  newHash: string;
  checkpointId: number;
}): void {
  const contract = getSoulContract();
  if (!contract) return;

  (async () => {
    try {
      const tx = await contract.recordCheckpoint(
        params.tokenId,
        toBytes32(params.newHash),
      );
      console.log(`[soul] recordCheckpoint tx sent: ${tx.hash}`);

      await prisma.personaCheckpoint.update({
        where: { id: params.checkpointId },
        data: { tx_hash: tx.hash },
      });

      tx.wait()
        .then(async (receipt: { blockNumber: number }) => {
          await prisma.personaCheckpoint.update({
            where: { id: params.checkpointId },
            data: { on_chain: true, block_number: receipt.blockNumber },
          });
        })
        .catch((err: unknown) => {
          console.error("[soul] recordCheckpoint tx failed:", err);
        });
    } catch (err) {
      console.error("[soul] fireAndForgetCheckpoint error:", err);
    }
  })();
}

function fireAndForgetMintMemory(params: {
  ownerWallet: string;
  soulTokenId: number;
  contentHash: string;
  memoryType: number;
  importance: number;
  memoryNftRecordId: number;
}): void {
  const contract = getSoulContract();
  if (!contract) return;

  (async () => {
    try {
      const tx = await contract.mintMemory(
        params.ownerWallet,
        params.soulTokenId,
        toBytes32(params.contentHash),
        params.memoryType,
        params.importance,
      );
      console.log(`[soul] mintMemory tx sent: ${tx.hash}`);

      await prisma.memoryNft.update({
        where: { id: params.memoryNftRecordId },
        data: { mint_tx_hash: tx.hash, minted_at: new Date() },
      });

      tx.wait()
        .then(async (receipt: { logs: unknown[] }) => {
          try {
            let tokenId: number | null = null;
            for (const log of receipt.logs as Array<{
              topics: string[];
              data: string;
            }>) {
              try {
                const parsed = contract.interface.parseLog({
                  topics: log.topics,
                  data: log.data,
                });
                if (parsed && parsed.name === "MemoryMinted") {
                  tokenId = Number(parsed.args.tokenId);
                  break;
                }
              } catch {
                // skip
              }
            }
            if (tokenId !== null) {
              await prisma.memoryNft.update({
                where: { id: params.memoryNftRecordId },
                data: { memory_token_id: tokenId },
              });
            }
          } catch (err) {
            console.error("[soul] mintMemory post-confirm error:", err);
          }
        })
        .catch((err: unknown) => {
          console.error("[soul] mintMemory tx failed:", err);
        });
    } catch (err) {
      console.error("[soul] fireAndForgetMintMemory error:", err);
    }
  })();
}
