/**
 * Data Sovereignty Layer
 * Core differentiator: Users own their pet's data with full export/import/delete rights
 */

import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import {
  PETCLAW_PROTOCOL,
  PETCLAW_VERSION,
  buildPetDID,
  computeIntegrityHash,
  type SoulExport,
  type ConsentSettings,
} from "./petclaw";

// ── Export: Full pet data as portable JSON ──

export async function exportPetData(petId: number, userId: number): Promise<SoulExport> {
  // Verify ownership
  const pet = await prisma.pet.findFirst({
    where: { id: petId, user_id: userId, is_active: true },
  });
  if (!pet) throw new Error("Pet not found or not owned by you");

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error("User not found");

  // Fetch all related data in parallel
  // Fetch persistent memory + learning data
  const { createMemoryManager } = await import("./memory/persistent-memory");
  const { createSelfLearner } = await import("./memory/self-learning");
  const memoryManager = createMemoryManager(petId);
  const selfLearner = createSelfLearner(petId);

  const [memories, skills, persona, soulNft, checkpoints, memoryNfts] = await Promise.all([
    prisma.petMemory.findMany({
      where: { pet_id: petId },
      orderBy: { created_at: "desc" },
      take: 1000,
    }),
    prisma.petSkill.findMany({ where: { pet_id: petId } }),
    prisma.petPersona.findFirst({ where: { pet_id: petId } }),
    prisma.petSoulNft.findFirst({ where: { pet_id: petId } }),
    prisma.personaCheckpoint.findMany({
      where: { pet_id: petId },
      orderBy: { version: "desc" },
    }),
    prisma.memoryNft.findMany({ where: { pet_id: petId } }),
  ]);

  const exportData: Omit<SoulExport, "integrityHash"> = {
    protocol: PETCLAW_PROTOCOL,
    version: PETCLAW_VERSION,
    exportedAt: new Date().toISOString(),

    pet: {
      name: pet.name,
      species: pet.species,
      personalityType: pet.personality_type,
      element: (pet.element as string) || "normal",
      level: pet.level,
      experience: pet.experience,
      happiness: pet.happiness,
      bondLevel: pet.bond_level,
      evolutionStage: pet.evolution_stage || 0,
      evolutionName: pet.evolution_name || undefined,
      avatarUrl: pet.avatar_url || undefined,
      appearanceDesc: pet.appearance_desc || undefined,
    },

    persona: persona ? {
      speechStyle: persona.owner_speech_style || undefined,
      interests: persona.owner_interests || undefined,
      tone: persona.owner_tone || undefined,
      language: persona.owner_language || undefined,
      bio: persona.owner_bio || undefined,
      analyzedPatterns: persona.analyzed_patterns as Record<string, unknown> || undefined,
    } : undefined,

    memories: memories.map(m => ({
      type: m.memory_type,
      content: m.content,
      emotion: m.emotion || undefined,
      importance: m.importance,
      createdAt: m.created_at.toISOString(),
    })),

    skills: skills.map(s => ({
      key: s.skill_key,
      level: s.level,
      slot: s.slot ?? undefined,
    })),

    soul: soulNft ? {
      tokenId: soulNft.token_id || undefined,
      genesisHash: soulNft.genesis_hash,
      currentHash: soulNft.current_hash,
      version: soulNft.current_version,
      successor: soulNft.successor_wallet || undefined,
    } : undefined,

    checkpoints: checkpoints.map(c => ({
      version: c.version,
      hash: c.persona_hash,
      trigger: c.trigger_event,
      createdAt: c.created_at.toISOString(),
    })),

    consent: {
      allowPublicProfile: true,
      allowDataSharing: false,
      allowAITraining: false,
      allowInteraction: true,
    },
  };

  const integrityHash = computeIntegrityHash(exportData);

  // Attach persistent memory + learning data as extended fields
  let persistentMemory = null;
  let learningData = null;
  try {
    persistentMemory = await memoryManager.exportMemory();
    learningData = await selfLearner.exportLearning();
  } catch {}

  return {
    ...exportData,
    integrityHash,
    // Extended PetClaw v1.1 fields
    ...(persistentMemory && { persistentMemory }),
    ...(learningData && { learningData }),
  } as any;
}

// ── Import: Restore pet from SOUL.md export ──

export async function importSoulData(userId: number, soulData: SoulExport): Promise<{ petId: number }> {
  // Verify integrity
  const { integrityHash, ...rest } = soulData;
  const computed = computeIntegrityHash(rest);
  if (computed !== integrityHash) {
    throw new Error("Data integrity check failed — export may be tampered");
  }

  if (soulData.protocol !== PETCLAW_PROTOCOL) {
    throw new Error(`Unsupported protocol: ${soulData.protocol}`);
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error("User not found");

  // Check pet slots
  const activePets = await prisma.pet.count({ where: { user_id: userId, is_active: true } });
  if (activePets >= user.pet_slots) {
    throw new Error("No available pet slots");
  }

  // Create pet from export
  const pet = await prisma.pet.create({
    data: {
      user_id: userId,
      name: soulData.pet.name,
      species: soulData.pet.species,
      personality_type: soulData.pet.personalityType,
      element: soulData.pet.element,
      level: soulData.pet.level,
      experience: soulData.pet.experience,
      happiness: soulData.pet.happiness,
      bond_level: soulData.pet.bondLevel,
      evolution_stage: soulData.pet.evolutionStage,
      evolution_name: soulData.pet.evolutionName,
      avatar_url: soulData.pet.avatarUrl,
      appearance_desc: soulData.pet.appearanceDesc,
      total_interactions: 0,
      energy: 100,
      hunger: 0,
      is_active: true,
    },
  });

  // Restore persona
  if (soulData.persona) {
    await prisma.petPersona.create({
      data: {
        pet_id: pet.id,
        owner_speech_style: soulData.persona.speechStyle,
        owner_interests: soulData.persona.interests,
        owner_tone: soulData.persona.tone,
        owner_language: soulData.persona.language,
        owner_bio: soulData.persona.bio,
        analyzed_patterns: (soulData.persona.analyzedPatterns as any) || undefined,
      },
    });
  }

  // Restore memories (batch)
  if (soulData.memories.length > 0) {
    await prisma.petMemory.createMany({
      data: soulData.memories.map(m => ({
        pet_id: pet.id,
        memory_type: m.type,
        content: m.content,
        emotion: m.emotion,
        importance: m.importance,
        created_at: new Date(m.createdAt),
      })),
    });
  }

  // Restore skills
  if (soulData.skills.length > 0) {
    await prisma.petSkill.createMany({
      data: soulData.skills.map(s => ({
        pet_id: pet.id,
        skill_key: s.key,
        level: s.level,
        slot: s.slot ?? null,
      })),
    });
  }

  // Create import memory
  await prisma.petMemory.create({
    data: {
      pet_id: pet.id,
      memory_type: "milestone",
      content: `Imported from another platform via PetClaw protocol. Original export: ${soulData.exportedAt}`,
      emotion: "hopeful",
      importance: 5,
    },
  });

  return { petId: pet.id };
}

// ── Delete: Complete data removal with proof ──

export async function deletePetData(petId: number, userId: number): Promise<{ deletionHash: string; deletedAt: string }> {
  // Verify ownership
  const pet = await prisma.pet.findFirst({
    where: { id: petId, user_id: userId },
  });
  if (!pet) throw new Error("Pet not found or not owned by you");

  // Generate deletion proof before deleting
  const deletionPayload = JSON.stringify({
    petId,
    petName: pet.name,
    userId,
    deletedAt: new Date().toISOString(),
    protocol: PETCLAW_PROTOCOL,
  });
  const deletionHash = createHash("sha256").update(deletionPayload).digest("hex");
  const deletedAt = new Date().toISOString();

  // Delete all related data in correct order (respecting foreign keys)
  await prisma.$transaction([
    prisma.memoryNft.deleteMany({ where: { pet_id: petId } }),
    prisma.personaCheckpoint.deleteMany({ where: { pet_id: petId } }),
    prisma.petSoulNft.deleteMany({ where: { pet_id: petId } }),
    prisma.petPersona.deleteMany({ where: { pet_id: petId } }),
    prisma.petSkill.deleteMany({ where: { pet_id: petId } }),
    prisma.petMemory.deleteMany({ where: { pet_id: petId } }),
    prisma.petInteraction.deleteMany({ where: { pet_id: petId } }),
    prisma.battleHistory.deleteMany({ where: { player_pet_id: petId } }),
    prisma.pveProgress.deleteMany({ where: { pet_id: petId } }),
    prisma.pet.delete({ where: { id: petId } }),
  ]);

  return { deletionHash, deletedAt };
}

// ── Consent Management ──

export async function getConsent(petId: number, userId: number): Promise<ConsentSettings> {
  const pet = await prisma.pet.findFirst({
    where: { id: petId, user_id: userId },
    select: { personality_modifiers: true },
  });
  if (!pet) throw new Error("Pet not found");

  const mods = (pet.personality_modifiers as Record<string, unknown>) || {};
  return {
    allowPublicProfile: (mods.consent_public_profile as boolean) ?? true,
    allowDataSharing: (mods.consent_data_sharing as boolean) ?? false,
    allowAITraining: (mods.consent_ai_training as boolean) ?? false,
    allowInteraction: (mods.consent_interaction as boolean) ?? true,
  };
}

export async function updateConsent(
  petId: number,
  userId: number,
  consent: ConsentSettings
): Promise<ConsentSettings> {
  const pet = await prisma.pet.findFirst({
    where: { id: petId, user_id: userId },
    select: { personality_modifiers: true },
  });
  if (!pet) throw new Error("Pet not found");

  const mods = (pet.personality_modifiers as Record<string, unknown>) || {};
  await prisma.pet.update({
    where: { id: petId },
    data: {
      personality_modifiers: {
        ...mods,
        consent_public_profile: consent.allowPublicProfile,
        consent_data_sharing: consent.allowDataSharing,
        consent_ai_training: consent.allowAITraining,
        consent_interaction: consent.allowInteraction,
      },
    },
  });

  return consent;
}

// ── Verify Ownership ──

export async function verifyPetOwnership(
  petId: number,
  walletAddress: string
): Promise<{ verified: boolean; petDID: string; soulNftId?: number }> {
  const pet = await prisma.pet.findUnique({
    where: { id: petId },
    include: { user: true },
  });
  if (!pet || !pet.user) return { verified: false, petDID: "" };

  const isOwner = pet.user.wallet_address.toLowerCase() === walletAddress.toLowerCase();
  const petDID = buildPetDID(walletAddress, petId);

  let soulNftId: number | undefined;
  if (isOwner) {
    const soul = await prisma.petSoulNft.findFirst({ where: { pet_id: petId } });
    soulNftId = soul?.token_id || undefined;
  }

  return { verified: isOwner, petDID, soulNftId };
}
