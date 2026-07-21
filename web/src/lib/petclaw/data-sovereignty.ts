/**
 * Data Sovereignty Layer
 * Core differentiator: Users own their pet's data with full export/import/delete rights
 */

import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { deleteStoredFile, listStoredFileReferencesByPrefix, storedFileExists } from "@/lib/storage";
import { enqueueExpiredAvatarMediaObjects } from "@/lib/avatarMedia";
import {
  applicationMediaKey,
  applicationMediaReferences,
  isFreshOwnerUploadKey,
} from "@/lib/mediaOwnership";
import { publicPetWhere } from "@/lib/publicPet";
import { lockAvailablePetSlot } from "@/lib/petSlots";
import { isExpressionKey } from "@/lib/moodPortraits";
import type { Prisma } from "@/generated/prisma/client";
import {
  PETCLAW_PROTOCOL,
  PETCLAW_VERSION,
  buildPetDID,
  computeIntegrityHash,
  type SoulExport,
  type SoulImportReport,
  type SoulImportResult,
  type ConsentSettings,
} from "./petclaw";

type JsonRecord = Record<string, unknown>;
const MEDIA_RETENTION_RETRY_MS = 60_000;

const PORTABLE_MODIFIER_KEYS = new Set([
  // Identity/context only. Combat stats, unlocked skills/combos, interaction
  // ledgers and pending actions are server-authoritative and never portable.
  "bond_reflections", "custom_traits", "learned_patterns",
  "persistent_memories", "species_name", "thought_of_day", "user_profile",
  "weekly_diary",
]);

const LINKED_DATA_CATEGORIES = new Set([
  "petState", "personaDetails", "memoryNfts", "soulExportHistory",
  "interactions", "dreamJournals", "insights", "loras", "notifications",
  "autonomousActions", "trainingLogs", "pveProgress", "battleHistory",
  "equippedItems", "platformConnections", "agentMessages", "agentSchedule",
  "conversations", "inheritanceEvents", "agentReactions", "likes", "comments",
  "paidActions", "linkedGenerations", "petDates", "installedSkills",
  "catchRecords",
]);

function asRecord(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

function rowsFrom(value: unknown): JsonRecord[] {
  return Array.isArray(value)
    ? value.map(asRecord).filter((row): row is JsonRecord => row !== null)
    : [];
}

function sourceCount(value: unknown): number {
  if (Array.isArray(value)) return value.length;
  return value === null || value === undefined ? 0 : 1;
}

function isSensitiveExtensionKey(key: string): boolean {
  const normalized = key.replace(/[^a-z0-9]/gi, "").toLowerCase();
  return ["__proto__", "prototype", "constructor"].includes(key.toLowerCase())
    || normalized.includes("password")
    || normalized.includes("passphrase")
    || normalized.includes("secret")
    || normalized.includes("credential")
    || normalized.includes("apikey")
    || normalized.includes("privatekey")
    || normalized.includes("accesstoken")
    || normalized.includes("refreshtoken")
    || normalized.endsWith("token")
    || normalized.includes("tokenhash")
    || normalized.includes("webhooksecret")
    || normalized.includes("connectcode")
    || normalized.includes("authorization")
    || normalized.includes("cookie")
    || normalized === "wallet"
    || normalized.endsWith("wallet")
    || normalized.endsWith("walletaddress")
    || normalized.endsWith("userid")
    || normalized.endsWith("ownerid")
    || normalized.endsWith("accountid")
    || normalized.endsWith("tenantid")
    || normalized.endsWith("petid")
    || normalized.endsWith("generationid")
    || normalized.endsWith("chatid")
    || normalized.endsWith("messageid")
    || normalized.endsWith("msgid")
    || normalized.endsWith("sessionid")
    || normalized.endsWith("tokenid")
    || normalized.endsWith("nftid")
    || normalized.endsWith("txhash")
    || normalized.endsWith("transactionhash");
}

function countSensitivePortableFields(value: unknown, depth = 0): number {
  if (depth > 32 || value === null || value === undefined) return 0;
  if (Array.isArray(value)) {
    return value.reduce((count, entry) => count + countSensitivePortableFields(entry, depth + 1), 0);
  }
  const record = asRecord(value);
  if (!record) return 0;
  let count = 0;
  for (const [key, entry] of Object.entries(record)) {
    if (isSensitiveExtensionKey(key)) count += 1;
    else count += countSensitivePortableFields(entry, depth + 1);
  }
  return count;
}

/** Clone portable JSON while dropping credential-shaped keys at every depth. */
function sanitizePortableJson(value: unknown, depth = 0): unknown {
  if (depth > 32 || value === undefined || typeof value === "function" || typeof value === "symbol") {
    return undefined;
  }
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    return value
      .map((entry) => sanitizePortableJson(entry, depth + 1))
      .filter((entry) => entry !== undefined);
  }
  const record = asRecord(value);
  if (!record) return undefined;
  const result: JsonRecord = {};
  for (const [key, entry] of Object.entries(record)) {
    if (isSensitiveExtensionKey(key)) continue;
    const clean = sanitizePortableJson(entry, depth + 1);
    if (clean !== undefined) result[key] = clean;
  }
  return result;
}

function portablePetModifiers(value: unknown): JsonRecord {
  const source = asRecord(value) || {};
  const result: JsonRecord = {};
  for (const key of PORTABLE_MODIFIER_KEYS) {
    if (!(key in source)) continue;
    const clean = sanitizePortableJson(source[key]);
    if (clean !== undefined) result[key] = clean;
  }
  return result;
}

function safeString(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string" || value.length === 0 || value.length > maxLength) return undefined;
  return value;
}

function safeInteger(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max
    ? value
    : fallback;
}

function safeDate(value: unknown): Date | undefined {
  if (typeof value !== "string" && !(value instanceof Date)) return undefined;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function addRestored(report: SoulImportReport, category: string, count: number): void {
  if (count > 0) report.restored[category] = (report.restored[category] || 0) + count;
}

function addSkipped(report: SoulImportReport, category: string, count: number, reason: string): void {
  if (count <= 0) return;
  const current = report.skipped[category] || { count: 0, reasons: [] };
  current.count += count;
  if (!current.reasons.includes(reason)) current.reasons.push(reason);
  report.skipped[category] = current;
}

function jsonContainsAnyReference(value: unknown, references: Set<string>): boolean {
  if (typeof value === "string") return references.has(value);
  if (Array.isArray(value)) return value.some((entry) => jsonContainsAnyReference(entry, references));
  const record = asRecord(value);
  return !!record && Object.values(record).some((entry) => jsonContainsAnyReference(entry, references));
}

function moodPortraitMediaValues(value: unknown): string[] {
  const modifiers = asRecord(value);
  const portraits = asRecord(modifiers?.mood_portraits);
  if (!portraits) return [];
  return Object.entries(portraits)
    .filter((entry): entry is [string, string] => isExpressionKey(entry[0]) && typeof entry[1] === "string")
    .map(([, portrait]) => portrait);
}

function moodPortraitContainsReference(value: unknown, references: Set<string>): boolean {
  return moodPortraitMediaValues(value).some((portrait) => references.has(portrait));
}

/** True while any live row still points at this first-party object. */
async function mediaObjectIsStillReferenced(value: string): Promise<boolean> {
  const key = applicationMediaKey(value);
  if (!key) return true; // fail closed: never delete an ambiguous value
  const references = applicationMediaReferences(key);
  const referenceSet = new Set(references);
  const [generation, pet, profile, caught, battle, avatarLifecycle, loras, modifierPets] = await Promise.all([
    prisma.generation.findFirst({
      where: { OR: [{ photo_path: { in: references } }, { video_path: { in: references } }] },
      select: { id: true },
    }),
    prisma.pet.findFirst({
      where: { OR: [{ avatar_url: { in: references } }, { codex_url: { in: references } }] },
      select: { id: true },
    }),
    prisma.userProfile.findFirst({ where: { avatar_url: { in: references } }, select: { id: true } }),
    prisma.caughtCat.findFirst({ where: { photo_path: { in: references } }, select: { id: true } }),
    prisma.battleHistory.findFirst({
      where: { OR: [{ player_avatar: { in: references } }, { opponent_avatar: { in: references } }] },
      select: { id: true },
    }),
    prisma.$queryRaw<Array<{ id: string }>>`
      SELECT "id"::text AS "id"
      FROM "avatar_media_objects"
      WHERE "object_ref" = ${`/uploads/${key}`}
      LIMIT 1
    `,
    prisma.petLora.findMany({ select: { lora_url: true, training_archive_ref: true, images_used: true } }),
    prisma.pet.findMany({ select: { personality_modifiers: true } }),
  ]);
  if (generation || pet || profile || caught || battle || avatarLifecycle[0]) return true;
  if (loras.some((row) =>
    references.includes(row.lora_url)
    || references.includes(row.training_archive_ref)
    || jsonContainsAnyReference(row.images_used, referenceSet)
  )) return true;
  // personality_modifiers is mostly arbitrary user/profile JSON. Only the
  // product-owned, key-bounded mood_portraits subtree is media-bearing; an
  // unrelated string elsewhere must never grant retention/ownership.
  return modifierPets.some((row) => moodPortraitContainsReference(row.personality_modifiers, referenceSet));
}

/**
 * Drain committed media-deletion tasks. DB ownership disappears first; physical
 * deletion is attempted only when no remaining row references the object.
 * Failed tasks stay durable and can be retried by the protected cron route.
 */
export async function processMediaDeletionTasks(options: { sourcePetId?: number; limit?: number } = {}) {
  const expiredAvatarPreviews = await enqueueExpiredAvatarMediaObjects(options.limit || 100);
  const dueAt = new Date();
  const tasks = await prisma.mediaDeletionTask.findMany({
    where: {
      ...(options.sourcePetId !== undefined ? { source_pet_id: options.sourcePetId } : {}),
      updated_at: { lte: dueAt },
    },
    // A retained shared reference is rescheduled by updated_at below. Ordering
    // by the oldest reservation prevents a fixed head of live shared refs from
    // starving newer deletable objects forever.
    orderBy: [{ updated_at: "asc" }, { id: "asc" }],
    take: Math.min(Math.max(options.limit || 100, 1), 500),
  });
  let deleted = 0;
  let retained = 0;
  let failed = 0;
  for (const task of tasks) {
    try {
      const key = applicationMediaKey(task.object_ref);
      if (!key) {
        // Ambiguous references fail closed and remain visible for operator
        // repair; silently dropping the tombstone would make cleanup
        // permanently impossible.
        failed += 1;
        await prisma.mediaDeletionTask.update({
          where: { id: task.id },
          data: {
            attempts: { increment: 1 },
            last_error: "Invalid application media reference",
            // Invalid/operator-repair tasks also back off so a malformed head
            // cannot hot-loop ahead of valid cleanup work.
            updated_at: new Date(Date.now() + MEDIA_RETENTION_RETRY_MS),
          },
        });
        continue;
      }
      if (await mediaObjectIsStillReferenced(task.object_ref)) {
        // Keep the tombstone while another live row shares the object. Its
        // unique object_ref also blocks the last owner deletion from losing
        // the cleanup intent; a later cron deletes it once every reference is
        // detached.
        retained += 1;
        await prisma.mediaDeletionTask.update({
          where: { id: task.id },
          data: {
            attempts: { increment: 1 },
            last_error: "Retained while a live row references this object",
            // A true not-before reservation avoids relying on millisecond
            // timestamp ordering: even a very fast 200-row drain moves every
            // retained head behind currently-due tail work.
            updated_at: new Date(Date.now() + MEDIA_RETENTION_RETRY_MS),
          },
        });
        continue;
      }
      await deleteStoredFile(`/uploads/${key}`);
      await prisma.mediaDeletionTask.delete({ where: { id: task.id } });
      deleted += 1;
    } catch (error: any) {
      failed += 1;
      await prisma.mediaDeletionTask.update({
        where: { id: task.id },
        data: {
          attempts: { increment: 1 },
          last_error: String(error?.message || "media deletion failed").slice(0, 500),
          updated_at: new Date(Date.now() + MEDIA_RETENTION_RETRY_MS),
        },
      }).catch(() => {});
    }
  }
  return { processed: tasks.length, deleted, retained, failed, expiredAvatarPreviews };
}

async function createManyInBatches(
  delegate: { createMany: (args: { data: JsonRecord[] }) => Promise<unknown> },
  data: JsonRecord[],
): Promise<void> {
  const batchSize = 500;
  for (let index = 0; index < data.length; index += batchSize) {
    const batch = data.slice(index, index + batchSize).map((row) =>
      Object.fromEntries(Object.entries(row).filter(([, value]) => value !== undefined))
    );
    await delegate.createMany({ data: batch });
  }
}

// Read the pet's consent settings from its stored personality_modifiers.
// Single source of truth shared by getConsent() and exportPetData() so the
// exported (and hashed) consent block always matches the live stored values.
function readConsentFromPet(personalityModifiers: unknown): ConsentSettings {
  const mods = (personalityModifiers as Record<string, unknown>) || {};
  return {
    allowPublicProfile: (mods.consent_public_profile as boolean) ?? false,
    allowDataSharing: (mods.consent_data_sharing as boolean) ?? false,
    allowAITraining: (mods.consent_ai_training as boolean) ?? false,
    allowInteraction: (mods.consent_interaction as boolean) ?? false,
  };
}

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

  // Pet-scoped activity archive. Secrets (provider credentials, webhook
  // secrets, encrypted model keys, and PAT hashes) are intentionally excluded.
  const [
    interactions,
    dreamJournals,
    insights,
    loras,
    notifications,
    autonomousActions,
    trainingLogs,
    pveProgress,
    battleHistory,
    equippedItems,
    platformConnections,
    agentMessages,
    agentSchedule,
    conversations,
    inheritanceEvents,
    agentReactions,
    petLikes,
    petComments,
    paidActions,
    soulExportHistory,
    petDates,
  ] = await Promise.all([
    prisma.petInteraction.findMany({ where: { pet_id: petId }, orderBy: { created_at: "asc" } }),
    prisma.dreamJournal.findMany({ where: { pet_id: petId }, orderBy: { created_at: "asc" } }),
    prisma.petInsight.findMany({ where: { pet_id: petId }, orderBy: { created_at: "asc" } }),
    prisma.petLora.findMany({ where: { pet_id: petId }, orderBy: { created_at: "asc" } }),
    prisma.petNotification.findMany({ where: { pet_id: petId }, orderBy: { created_at: "asc" } }),
    prisma.petAutonomousAction.findMany({ where: { pet_id: petId }, orderBy: { created_at: "asc" } }),
    prisma.dailyTrainingLog.findMany({ where: { pet_id: petId }, orderBy: { date: "asc" } }),
    prisma.pveProgress.findMany({ where: { pet_id: petId }, orderBy: { stage_id: "asc" } }),
    prisma.battleHistory.findMany({
      where: { OR: [{ player_pet_id: petId }, { opponent_pet_id: petId }] },
      orderBy: { created_at: "asc" },
    }),
    prisma.petEquippedItem.findMany({ where: { pet_id: petId }, include: { item: true } }),
    prisma.petPlatformConnection.findMany({
      where: { pet_id: petId },
      select: {
        platform: true,
        is_active: true,
        platform_chat_id: true,
        connected_at: true,
        last_active_at: true,
      },
    }),
    prisma.petAgentMessage.findMany({ where: { pet_id: petId }, orderBy: { created_at: "asc" } }),
    prisma.petAgentSchedule.findUnique({ where: { pet_id: petId } }),
    prisma.petConversation.findMany({ where: { pet_id: petId }, orderBy: { created_at: "asc" } }),
    prisma.inheritanceEvent.findMany({ where: { pet_id: petId }, orderBy: { claimed_at: "asc" } }),
    prisma.petAgentReaction.findMany({ where: { pet_id: petId }, orderBy: { created_at: "asc" } }),
    prisma.like.findMany({ where: { pet_id: petId }, orderBy: { created_at: "asc" } }),
    prisma.comment.findMany({ where: { pet_id: petId }, orderBy: { created_at: "asc" } }),
    prisma.paidAction.findMany({ where: { pet_id: petId }, orderBy: { created_at: "asc" } }),
    prisma.soulExport.findMany({ where: { pet_id: petId }, orderBy: { exported_at: "asc" } }),
    prisma.petDate.findMany({
      where: { OR: [{ pet_a_id: petId }, { pet_b_id: petId }] },
      orderBy: { created_at: "asc" },
    }),
  ]);

  // "Skills travel with SOUL": installed PetClaw skills — marketplace installs
  // AND learned (auto-promoted) skills with their example-response prompts —
  // are part of the exported bundle. sanitizePortableJson strips any
  // credential-shaped config values (API keys, tokens) at every depth.
  const installedSkillsSource = asRecord(pet.personality_modifiers)?.installed_skills;
  const installedSkills = sanitizePortableJson(
    Array.isArray(installedSkillsSource) ? installedSkillsSource : [],
  ) ?? [];

  // The owner's Catch collection travels with the bundle too. Raw GPS stays
  // private: coordinates are included ONLY for catches the owner explicitly
  // opted onto the public map (map_public), the same rule /api/catch/nearby
  // enforces. Internal anti-farming fields (photo_hash, spawn_key) stay local.
  const catchRecords = (await prisma.caughtCat.findMany({
    where: { owner_user_id: userId },
    orderBy: { caught_at: "asc" },
  })).map((row) => ({
    kind: row.kind,
    name: row.name,
    breed: row.breed,
    rarity: row.rarity,
    element: row.element,
    hp: row.hp,
    atk: row.atk,
    def: row.def,
    spd: row.spd,
    level: row.level,
    photo_path: row.photo_path,
    source: row.source,
    map_public: row.map_public,
    caught_at: row.caught_at,
    ...(row.map_public ? { lat: row.lat, lng: row.lng } : {}),
  }));

  const linkedGenerationIds = Array.from(new Set([
    ...insights.map((row) => row.video_generation_id),
    ...autonomousActions.map((row) => row.generation_id),
  ].filter((id): id is number => Number.isInteger(id))));
  const linkedGenerations = await prisma.generation.findMany({
    where: {
      OR: [
        { pet_id: petId },
        ...(linkedGenerationIds.length > 0 ? [{ id: { in: linkedGenerationIds } }] : []),
      ],
    },
    orderBy: { created_at: "asc" },
  });

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

    // Export the pet's REAL stored consent (persisted in personality_modifiers by
    // updateConsent), not hardcoded defaults — otherwise the integrity hash signs a
    // consent block that doesn't reflect what the owner actually chose.
    consent: readConsentFromPet(pet.personality_modifiers),
  };

  // Attach persistent memory + learning data as extended fields
  let persistentMemory = null;
  let learningData = null;
  try {
    persistentMemory = await memoryManager.exportMemory();
    learningData = await selfLearner.exportLearning();
  } catch {}

  const linkedData = JSON.parse(JSON.stringify({
    // Explicit whitelist: local user_id/id and any future secret-bearing fields
    // must never become portable ownership claims by accident.
    petState: {
      energy: pet.energy,
      hunger: pet.hunger,
      total_interactions: pet.total_interactions,
      soul_version: pet.soul_version,
      last_dream_at: pet.last_dream_at,
      last_interaction_at: pet.last_interaction_at,
      created_at: pet.created_at,
      codex_url: pet.codex_url,
      atk: pet.atk,
      def: pet.def,
      spd: pet.spd,
      care_streak: pet.care_streak,
      last_care_at: pet.last_care_at,
      personality_modifiers: portablePetModifiers(pet.personality_modifiers),
    },
    personaDetails: persona ? {
      owner_expressions: persona.owner_expressions,
      sample_messages: persona.sample_messages,
      vocabulary_style: persona.vocabulary_style,
      observed_topics: persona.observed_topics,
      observed_style: persona.observed_style,
      last_observed_at: persona.last_observed_at,
      persona_version: persona.persona_version,
      created_at: persona.created_at,
    } : null,
    memoryNfts,
    soulExportHistory,
    interactions,
    dreamJournals,
    insights,
    loras,
    notifications,
    autonomousActions,
    trainingLogs,
    pveProgress,
    battleHistory: battleHistory.map((row) => ({
      source_role: row.player_pet_id === petId ? "player" : "opponent",
      opponent_name: row.opponent_name,
      won: row.won,
      turns: row.turns,
      player_hp_left: row.player_hp_left,
      exp_gained: row.exp_gained,
      points_earned: row.points_earned,
      skill_drop_key: row.skill_drop_key,
      battle_type: row.battle_type,
      stage_id: row.stage_id,
      created_at: row.created_at,
      battle_log: row.battle_log,
      seed: row.seed,
      player_hp_max: row.player_hp_max,
      opponent_hp_max: row.opponent_hp_max,
      opponent_avatar: row.opponent_avatar,
    })),
    equippedItems,
    platformConnections,
    agentMessages,
    agentSchedule,
    conversations,
    inheritanceEvents,
    agentReactions,
    likes: petLikes,
    comments: petComments,
    paidActions,
    linkedGenerations,
    petDates,
    installedSkills,
    catchRecords,
  })) as Record<string, unknown>;

  const completeExport: Omit<SoulExport, "integrityHash"> = {
    ...exportData,
    ...(persistentMemory && { persistentMemory }),
    ...(learningData && { learningData }),
    linkedData,
  };
  const integrityHash = computeIntegrityHash(completeExport);

  return { ...completeExport, integrityHash };
}

// ── Import: Restore pet from SOUL.md export ──

export async function importSoulData(
  userId: number,
  soulData: SoulExport,
  database: typeof prisma = prisma,
): Promise<SoulImportResult> {
  // Verify integrity
  const { integrityHash, ...rest } = soulData;
  const computed = computeIntegrityHash(rest);
  if (computed !== integrityHash) {
    throw new Error("Data integrity check failed — export may be tampered");
  }

  if (soulData.protocol !== PETCLAW_PROTOCOL) {
    throw new Error(`Unsupported protocol: ${soulData.protocol}`);
  }

  const linkedData = asRecord(soulData.linkedData) || {};
  const petState = asRecord(linkedData.petState) || {};
  const personaDetails = asRecord(linkedData.personaDetails) || {};
  const sourceExportedAt = safeDate(soulData.exportedAt) || new Date();
  const report: SoulImportReport = {
    sourceIntegrityHash: integrityHash,
    restored: {},
    skipped: {},
    warnings: [],
  };

  const sensitiveFieldCount = countSensitivePortableFields({
    persona: soulData.persona,
    persistentMemory: soulData.persistentMemory,
    learningData: soulData.learningData,
    linkedData,
  });
  addSkipped(
    report,
    "security.sensitiveFields",
    sensitiveFieldCount,
    "Credential, token, webhook, external-account, transaction, and foreign-ownership fields are never restored",
  );

  for (const [category, value] of Object.entries(linkedData)) {
    if (!LINKED_DATA_CATEGORIES.has(category)) {
      addSkipped(report, `linkedData.${category}`, sourceCount(value), "Unknown extension category; retained only by the source integrity hash");
    }
  }

  // These records make claims about an external account, chain, transaction,
  // provider job, or media owner. They remain cryptographically covered by the
  // source hash but are never materialized as ownership on this server.
  addSkipped(report, "soul", soulData.soul ? 1 : 0, "On-chain identity and successor ownership cannot be transferred by JSON import");
  addSkipped(report, "checkpoints", soulData.checkpoints.length, "Persona checkpoint hashes belong to the source Soul identity");
  addSkipped(report, "linkedData.memoryNfts", sourceCount(linkedData.memoryNfts), "NFT ownership must be proven on-chain");
  addSkipped(report, "linkedData.soulExportHistory", sourceCount(linkedData.soulExportHistory), "Source export transactions are provenance, not local ownership records");
  addSkipped(report, "linkedData.loras", sourceCount(linkedData.loras), "Provider jobs and model assets require source ownership verification");
  addSkipped(report, "linkedData.platformConnections", sourceCount(linkedData.platformConnections), "Provider credentials, chat identifiers, token hashes, and webhook secrets are never restored; reconnect explicitly");
  addSkipped(report, "linkedData.inheritanceEvents", sourceCount(linkedData.inheritanceEvents), "Wallet inheritance ownership must be proven on-chain");
  addSkipped(report, "linkedData.likes", sourceCount(linkedData.likes), "Generation ownership cannot be inferred from a portable JSON file");
  addSkipped(report, "linkedData.comments", sourceCount(linkedData.comments), "Generation and author ownership cannot be inferred from a portable JSON file");
  addSkipped(report, "linkedData.agentReactions", sourceCount(linkedData.agentReactions), "Generation ownership cannot be inferred from a portable JSON file");
  addSkipped(report, "linkedData.paidActions", sourceCount(linkedData.paidActions), "Payment and transaction claims are never recreated by import");
  addSkipped(report, "linkedData.linkedGenerations", sourceCount(linkedData.linkedGenerations), "Media ownership cannot be proven; re-upload or regenerate assets under the new owner");
  addSkipped(report, "linkedData.petDates", sourceCount(linkedData.petDates), "Other pets and initiating-user ownership cannot be transferred by import");
  addSkipped(report, "linkedData.catchRecords", sourceCount(linkedData.catchRecords), "Catches are vision-verified, owner-scoped records; photo ownership and anti-farming ledgers cannot be transferred by import");
  addSkipped(report, "pet.progression", 1, "Level, experience, happiness, bond, evolution and combat state are server-authoritative and start from new-pet defaults");
  addSkipped(report, "skills", soulData.skills.length, "Skills and equipped slots are server-authoritative and cannot be granted by a portable file");
  addSkipped(report, "linkedData.interactions", sourceCount(linkedData.interactions), "Interaction ledgers can affect missions and rewards, so they are not restored");
  addSkipped(report, "linkedData.trainingLogs", sourceCount(linkedData.trainingLogs), "Training and credit ledgers are server-authoritative");
  addSkipped(report, "linkedData.pveProgress", sourceCount(linkedData.pveProgress), "PvE progress is server-authoritative");
  addSkipped(report, "linkedData.battleHistory", sourceCount(linkedData.battleHistory), "Battle results, points and drops are server-authoritative");
  addSkipped(report, "linkedData.equippedItems", sourceCount(linkedData.equippedItems), "Equipment ownership must be earned or purchased on this server");
  addSkipped(report, "linkedData.autonomousActions", sourceCount(linkedData.autonomousActions), "Execution and credit ledgers are not portable identity data");
  addSkipped(report, "linkedData.insights", sourceCount(linkedData.insights), "Imported insights could trigger automated provider spend and are not restored");
  addSkipped(report, "linkedData.notifications", sourceCount(linkedData.notifications), "Server notifications are not portable identity data");
  addSkipped(report, "linkedData.agentSchedule", sourceCount(linkedData.agentSchedule), "Imported automation remains disabled and must be configured explicitly by the owner");
  if (Object.keys(petState).length > 0) {
    addSkipped(report, "linkedData.petState.authoritative", 1, "Counters, timestamps, energy, hunger, care state and combat stats reset to safe defaults");
  }

  // A portable hash proves file integrity, not ownership of a URL or object.
  // All media must be uploaded or generated again under the destination owner.
  const avatarUrl = undefined;
  if (soulData.pet.avatarUrl) {
    addSkipped(report, "pet.avatarUrl", 1, "Media references cannot be re-owned by import; upload the avatar again");
  }
  const codexUrl = undefined;
  if (petState.codex_url) {
    addSkipped(report, "linkedData.petState.codex_url", 1, "Media references cannot be re-owned by import; regenerate Codex art");
  }

  const persistentMemory = asRecord(soulData.persistentMemory);
  const learningData = asRecord(soulData.learningData);
  const restoredMods: JsonRecord = portablePetModifiers(petState.personality_modifiers);
  const importedModifiers = asRecord(petState.personality_modifiers);
  if (importedModifiers?.mood_portraits) {
    addSkipped(report, "pet.personality_modifiers.mood_portraits", 1, "Media references cannot be re-owned by import; regenerate mood portraits");
  }
  if (Array.isArray(persistentMemory?.memories)) {
    restoredMods.persistent_memories = sanitizePortableJson(persistentMemory.memories) || [];
    addRestored(report, "persistentMemory.memories", persistentMemory.memories.length);
  }
  if (Array.isArray(persistentMemory?.userProfile)) {
    restoredMods.user_profile = sanitizePortableJson(persistentMemory.userProfile) || [];
    addRestored(report, "persistentMemory.userProfile", persistentMemory.userProfile.length);
  }
  if (Array.isArray(learningData?.patterns)) {
    restoredMods.learned_patterns = sanitizePortableJson(learningData.patterns) || [];
    addRestored(report, "learningData.patterns", learningData.patterns.length);
  }
  // Learned (auto-promoted) skills are the pet's own hard-won expertise and are
  // restored with the pet. Marketplace installs are server-authoritative
  // (level gates, registry versions) and must be reinstalled from PetHub.
  const installedSkillRows = rowsFrom(linkedData.installedSkills);
  const learnedSkillRows = installedSkillRows.filter((row) => row.isLearned === true);
  if (learnedSkillRows.length > 0) {
    restoredMods.installed_skills = sanitizePortableJson(learnedSkillRows) || [];
    addRestored(report, "linkedData.installedSkills.learned", learnedSkillRows.length);
  }
  addSkipped(
    report,
    "linkedData.installedSkills",
    installedSkillRows.length - learnedSkillRows.length,
    "Marketplace skill installs are server-authoritative; reinstall them from PetHub",
  );
  // Consent is destination-specific and must be opted into again. An import can
  // never silently publish a pet or authorize training/interaction.
  restoredMods.consent_public_profile = false;
  restoredMods.consent_data_sharing = false;
  restoredMods.consent_ai_training = false;
  restoredMods.consent_interaction = false;
  restoredMods.import_provenance = {
    source_integrity_hash: integrityHash,
    source_exported_at: soulData.exportedAt,
    competitive_state_restored: false,
    consent_restored: false,
  };
  if (Object.values(soulData.consent).some(Boolean)) {
    addSkipped(report, "consent", 1, "Consent is destination-specific and must be enabled again by the owner");
  }

  return database.$transaction(async (tx: typeof prisma) => {
    await lockAvailablePetSlot(tx, userId);

    const pet = await tx.pet.create({
      data: {
        user_id: userId,
        name: soulData.pet.name,
        species: soulData.pet.species,
        personality_type: soulData.pet.personalityType,
        element: soulData.pet.element,
        avatar_url: avatarUrl,
        codex_url: codexUrl,
        appearance_desc: soulData.pet.appearanceDesc,
        personality_modifiers: restoredMods as any,
        is_active: true,
      },
    });
    addRestored(report, "pet", 1);

    if (soulData.persona || Object.keys(personaDetails).length > 0) {
      await tx.petPersona.create({
        data: {
          pet_id: pet.id,
          owner_speech_style: soulData.persona?.speechStyle,
          owner_interests: soulData.persona?.interests,
          owner_expressions: safeString(personaDetails.owner_expressions, 20_000),
          owner_tone: soulData.persona?.tone,
          owner_language: soulData.persona?.language,
          owner_bio: soulData.persona?.bio,
          analyzed_patterns: sanitizePortableJson(soulData.persona?.analyzedPatterns) as any,
          sample_messages: sanitizePortableJson(personaDetails.sample_messages) as any,
          vocabulary_style: safeString(personaDetails.vocabulary_style, 20_000),
          observed_topics: sanitizePortableJson(personaDetails.observed_topics) as any,
          observed_style: sanitizePortableJson(personaDetails.observed_style) as any,
          // Version/timestamps are local server state, not portable authority.
          persona_version: 1,
        },
      });
      addRestored(report, "persona", 1);
    }

    const memoryRows: JsonRecord[] = soulData.memories.map((memory) => ({
      pet_id: pet.id,
      memory_type: memory.type,
      content: memory.content,
      emotion: memory.emotion || "calm",
      importance: memory.importance,
      created_at: safeDate(memory.createdAt) || sourceExportedAt,
    }));
    await createManyInBatches(tx.petMemory as any, memoryRows);
    addRestored(report, "memories", memoryRows.length);

    const dreamRows: JsonRecord[] = [];
    for (const row of rowsFrom(linkedData.dreamJournals)) {
      const summary = typeof row.summary === "string" && row.summary.length > 0 ? row.summary : undefined;
      const emotionalTone = safeString(row.emotional_tone, 30);
      const dreamDate = safeDate(row.dream_date);
      if (!summary || !emotionalTone || !dreamDate) {
        addSkipped(report, "linkedData.dreamJournals", 1, "Invalid dream journal row");
        continue;
      }
      dreamRows.push({
        pet_id: pet.id,
        dream_date: dreamDate,
        summary,
        emotional_tone: emotionalTone,
        personality_changes: sanitizePortableJson(row.personality_changes),
        // Imported journals are narrative context only, never a mechanics input.
        stat_changes: null,
        significant_events: sanitizePortableJson(row.significant_events),
        created_at: safeDate(row.created_at) || dreamDate,
      });
    }
    await createManyInBatches(tx.dreamJournal as any, dreamRows);
    addRestored(report, "linkedData.dreamJournals", dreamRows.length);

    const agentMessageRows: JsonRecord[] = [];
    for (const row of rowsFrom(linkedData.agentMessages)) {
      const platform = safeString(row.platform, 20);
      const direction = safeString(row.direction, 10);
      const content = typeof row.content === "string" && row.content.length > 0 ? row.content : undefined;
      if (!platform || !direction || !content) {
        addSkipped(report, "linkedData.agentMessages", 1, "Invalid agent-message row");
        continue;
      }
      agentMessageRows.push({
        pet_id: pet.id,
        platform,
        direction,
        message_type: safeString(row.message_type, 20) || "text",
        content,
        // External message/chat identifiers are ownership-bearing links. The
        // content is portable; those identifiers are not.
        platform_msg_id: null,
        chat_id: null,
        credits_used: 0,
        metadata: null,
        created_at: safeDate(row.created_at) || sourceExportedAt,
      });
    }
    await createManyInBatches(tx.petAgentMessage as any, agentMessageRows);
    addRestored(report, "linkedData.agentMessages", agentMessageRows.length);

    const conversationRows: JsonRecord[] = [];
    rowsFrom(linkedData.conversations).forEach((row, index) => {
      const platform = safeString(row.platform, 20);
      if (!platform) {
        addSkipped(report, "linkedData.conversations", 1, "Invalid conversation row");
        return;
      }
      conversationRows.push({
        pet_id: pet.id,
        platform,
        // Source chat IDs can point at another account. A deterministic local ID
        // preserves separate histories without restoring that external link.
        chat_id: `import:${integrityHash.slice(0, 12)}:${index}`,
        participant_name: safeString(row.participant_name, 100),
        summary: typeof row.summary === "string" ? row.summary : null,
        // This is narrative context, not a trusted activity counter.
        message_count: 0,
        last_message_at: safeDate(row.last_message_at),
        created_at: safeDate(row.created_at) || sourceExportedAt,
      });
    });
    await createManyInBatches(tx.petConversation as any, conversationRows);
    addRestored(report, "linkedData.conversations", conversationRows.length);

    // Retain the exact verified source hash as local provenance. We intentionally
    // do not copy source tx_hash/IPFS/chain ownership claims.
    await tx.soulExport.create({
      data: {
        pet_id: pet.id,
        ipfs_cid: `petclaw-import:${integrityHash}`,
        soul_hash: integrityHash,
        chain: "none",
        version: 1,
        exported_at: safeDate(soulData.exportedAt) || new Date(),
      },
    });
    addRestored(report, "sourceIntegrityHash", 1);

    // Product-visible provenance is an intentional extra memory, so this import
    // is a safe, reported reconstruction—not a misleading byte-for-byte clone.
    await tx.petMemory.create({
      data: {
        pet_id: pet.id,
        memory_type: "milestone",
        content: `Imported from another platform via PetClaw protocol. Original export: ${soulData.exportedAt}`,
        emotion: "hopeful",
        importance: 5,
      },
    });
    addRestored(report, "importMilestone", 1);

    return { petId: pet.id, sourceIntegrityHash: integrityHash, report };
  }, { maxWait: 10_000, timeout: 120_000 });
}

// ── Delete: Complete data removal with proof ──

type LockedDeletionPet = {
  id: number;
  user_id: number;
  name: string;
  avatar_url: string | null;
  codex_url: string | null;
  personality_modifiers: unknown;
};

type LockedDeletionGeneration = {
  id: number;
  photo_path: string;
  video_path: string | null;
};

type LockedDeletionLora = {
  lora_url: string | null;
  training_archive_ref: string | null;
  images_used: unknown;
};

async function transactionProvesUserMediaOwnership(
  tx: Prisma.TransactionClient,
  userId: number,
  value: string,
): Promise<boolean> {
  const key = applicationMediaKey(value);
  if (!key) return false;
  const references = applicationMediaReferences(key);
  const avatarLifecycle = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id"::text AS "id"
    FROM "avatar_media_objects"
    WHERE "object_ref" = ${`/uploads/${key}`}
      AND "owner_user_id" = ${userId}
    LIMIT 1
  `;
  if (avatarLifecycle[0]) return true;
  const generation = await tx.generation.findFirst({
    where: {
      user_id: userId,
      OR: [{ photo_path: { in: references } }, { video_path: { in: references } }],
    },
    select: { id: true },
  });
  if (generation) return true;
  const caught = await tx.caughtCat.findFirst({
    where: { owner_user_id: userId, photo_path: { in: references } },
    select: { id: true },
  });
  if (caught) return true;
  return isFreshOwnerUploadKey(userId, key) && await storedFileExists(`/uploads/${key}`);
}

export async function deletePetData(petId: number, userId: number): Promise<{
  deletionHash: string;
  deletedAt: string;
  mediaCleanup: { processed: number; deleted: number; retained: number; failed: number };
}> {
  // Cheap preflight before touching storage. Ownership is re-verified under the
  // authoritative Pet row lock in the deletion transaction below.
  const preflightPet = await prisma.pet.findFirst({
    where: { id: petId, user_id: userId },
    select: { id: true },
  });
  if (!preflightPet) throw new Error("Pet not found or not owned by you");

  // Rows created before training_archive_ref existed have no DB pointer to
  // their ZIP. Inventory only the exact server-issued pet prefix, with a hard
  // bound. Truncation fails closed so deleting the pet cannot erase the last
  // ownership metadata while silently leaving an unbounded archive tail.
  const legacyLoraArchives = await listStoredFileReferencesByPrefix(
    `lora-train/pet-${petId}-`,
    500,
  );
  if (legacyLoraArchives.truncated) {
    throw new Error("Too many legacy LoRA training archives; operator cleanup is required before pet deletion");
  }

  // One timestamp is used byte-for-byte by the hash payload, durable proof and
  // API response. Multiple Date reads would make a returned proof impossible
  // to recompute exactly.
  const deletedAt = new Date().toISOString();

  // The deletion proof must be RECOVERABLE later, not just returned once. The pet
  // and all its pet-scoped rows (incl. its own soul_exports / notifications) are
  // about to be wiped, so the proof can't live on the deleted pet. Anchor it on a
  // surviving sibling pet of the SAME owner via the existing soul_exports table:
  // soul_hash holds the SHA-256 deletion hash; ipfs_cid carries a recoverable
  // marker (`petclaw-deletion:<deletedPetId>`) so the owner can look the proof up.
  // If the user has no other pet, the proof is still returned to the caller, but
  // there is no surviving owner-scoped row to anchor it to (see couldNotDo).
  const proofAnchor = await prisma.pet.findFirst({
    where: { user_id: userId, id: { not: petId } },
    orderBy: { id: "desc" },
    select: { id: true },
  });

  const collectStrings = (value: unknown): string[] => {
    if (typeof value === "string") return [value];
    if (Array.isArray(value)) return value.flatMap(collectStrings);
    if (value && typeof value === "object") {
      return Object.values(value as Record<string, unknown>).flatMap(collectStrings);
    }
    return [];
  };
  const deletionHash = await prisma.$transaction(async (tx) => {
    // Arena's global order is daily log -> Pet. Deletion uses the same order so
    // a reward transaction can never hold Pet while waiting on a daily row that
    // deletion already holds. Multiple rows are locked deterministically.
    await tx.$queryRaw`
      SELECT "id"
      FROM "daily_training_logs"
      WHERE "pet_id" = ${petId}
      ORDER BY "id"
      FOR UPDATE
    `;

    const lockedPets = await tx.$queryRaw<LockedDeletionPet[]>`
      SELECT "id", "user_id", "name", "avatar_url", "codex_url", "personality_modifiers"
      FROM "pets"
      WHERE "id" = ${petId} AND "user_id" = ${userId}
      FOR UPDATE
    `;
    const pet = lockedPets[0];
    if (!pet) throw new Error("Pet not found or not owned by you");

    // Lock link rows before resolving Generation ids. Existing link updates can
    // otherwise slide between an unlocked snapshot and their later cascade.
    await tx.$queryRaw`
      SELECT "id"
      FROM "pet_insights"
      WHERE "pet_id" = ${petId}
      ORDER BY "id"
      FOR UPDATE
    `;
    await tx.$queryRaw`
      SELECT "id"
      FROM "pet_autonomous_actions"
      WHERE "pet_id" = ${petId}
      ORDER BY "id"
      FOR UPDATE
    `;
    const loras = await tx.$queryRaw<LockedDeletionLora[]>`
      SELECT "lora_url", "training_archive_ref", "images_used"
      FROM "pet_loras"
      WHERE "pet_id" = ${petId}
      ORDER BY "id"
      FOR UPDATE
    `;

    const linkedGenerations = await tx.$queryRaw<LockedDeletionGeneration[]>`
      SELECT g."id", g."photo_path", g."video_path"
      FROM "generations" AS g
      WHERE g."pet_id" = ${petId}
         OR (
           g."user_id" = ${userId}
           AND (
             g."id" IN (
               SELECT pi."video_generation_id"
               FROM "pet_insights" AS pi
               WHERE pi."pet_id" = ${petId} AND pi."video_generation_id" IS NOT NULL
             )
             OR g."id" IN (
               SELECT paa."generation_id"
               FROM "pet_autonomous_actions" AS paa
               WHERE paa."pet_id" = ${petId} AND paa."generation_id" IS NOT NULL
             )
           )
         )
      ORDER BY g."id"
      FOR UPDATE
    `;
    const generationIds = linkedGenerations.map((row) => row.id);

    // Every media reference is read after its authoritative owner row is
    // locked, then tombstoned before any owner row is removed.
    const ownedFiles = new Set<string>();
    const addCanonicalFile = (value: unknown) => {
      if (typeof value !== "string") return;
      const key = applicationMediaKey(value);
      if (key) ownedFiles.add(`/uploads/${key}`);
    };
    for (const value of loras.flatMap((row) => [
      row.lora_url,
      row.training_archive_ref,
      ...collectStrings(row.images_used),
    ])) addCanonicalFile(value);
    for (const value of legacyLoraArchives.references) addCanonicalFile(value);
    for (const value of linkedGenerations.flatMap((row) => [row.photo_path, row.video_path])) {
      addCanonicalFile(value);
    }
    // Avatar/codex columns were historically user-editable. Require separate
    // owner proof rather than treating the destination Pet row as proof itself.
    for (const value of [pet.avatar_url, pet.codex_url]) {
      if (
        typeof value === "string"
        && await transactionProvesUserMediaOwnership(tx, userId, value)
      ) addCanonicalFile(value);
    }
    for (const value of moodPortraitMediaValues(pet.personality_modifiers)) {
      if (await transactionProvesUserMediaOwnership(tx, userId, value)) addCanonicalFile(value);
    }

    const deletionPayload = JSON.stringify({
      petId,
      petName: pet.name,
      userId,
      deletedAt,
      protocol: PETCLAW_PROTOCOL,
    });
    const hash = createHash("sha256").update(deletionPayload).digest("hex");

    for (const objectRefs of Array.from(ownedFiles).reduce<string[][]>((batches, objectRef, index) => {
      if (index % 500 === 0) batches.push([]);
      batches[batches.length - 1].push(objectRef);
      return batches;
    }, [])) {
      await tx.mediaDeletionTask.createMany({
        data: objectRefs.map((objectRef) => ({
          owner_user_id: userId,
          source_pet_id: petId,
          object_ref: objectRef,
        })),
        skipDuplicates: true,
      });
    }

    // Delete all related data in FK-safe order. Restrict children are explicit;
    // cascade children are harmless if already gone. Referral is user-scoped and
    // intentionally remains untouched.
    await tx.memoryNft.deleteMany({ where: { pet_id: petId } });
    await tx.personaCheckpoint.deleteMany({ where: { pet_id: petId } });
    await tx.petSoulNft.deleteMany({ where: { pet_id: petId } });
    await tx.petPersona.deleteMany({ where: { pet_id: petId } });
    await tx.petSkill.deleteMany({ where: { pet_id: petId } });
    await tx.petMemory.deleteMany({ where: { pet_id: petId } });
    await tx.petInteraction.deleteMany({ where: { pet_id: petId } });
    await tx.battleHistory.updateMany({
      where: { opponent_pet_id: petId },
      data: {
        opponent_pet_id: null,
        opponent_name: "Deleted Pet",
        opponent_avatar: null,
        battle_log: null,
        seed: null,
      },
    });
    await tx.battleHistory.deleteMany({ where: { player_pet_id: petId } });
    await tx.pveProgress.deleteMany({ where: { pet_id: petId } });
    await tx.dreamJournal.deleteMany({ where: { pet_id: petId } });
    await tx.petNotification.deleteMany({ where: { pet_id: petId } });
    await tx.petAutonomousAction.deleteMany({ where: { pet_id: petId } });
    await tx.dailyTrainingLog.deleteMany({ where: { pet_id: petId } });
    // Financial receipts are an audit ledger, not disposable pet content.
    // Detach the deleted pet while preserving tx hash, payer, amount, action,
    // and consumed state. The DB FK independently enforces ON DELETE SET NULL.
    await tx.paidAction.updateMany({ where: { pet_id: petId }, data: { pet_id: null } });
    await tx.petDate.updateMany({ where: { pet_a_id: petId }, data: { pet_a_id: null } });
    await tx.petDate.updateMany({ where: { pet_b_id: petId }, data: { pet_b_id: null } });
    await tx.soulExport.deleteMany({ where: { pet_id: petId } });
    if (generationIds.length > 0) {
      await tx.like.deleteMany({ where: { generation_id: { in: generationIds } } });
      await tx.comment.deleteMany({ where: { generation_id: { in: generationIds } } });
      await tx.petAgentReaction.deleteMany({ where: { generation_id: { in: generationIds } } });
      await tx.generation.deleteMany({ where: { id: { in: generationIds } } });
    }
    await tx.pet.delete({ where: { id: petId } });

    if (proofAnchor) {
      await tx.soulExport.create({
        data: {
          pet_id: proofAnchor.id,
          ipfs_cid: `petclaw-deletion:${petId}`,
          soul_hash: hash,
          chain: "none",
          exported_at: new Date(deletedAt),
        },
      });
    }
    return hash;
  }, { maxWait: 20_000, timeout: 120_000 });

  const mediaCleanup = await processMediaDeletionTasks({ sourcePetId: petId, limit: 500 });
  return { deletionHash, deletedAt, mediaCleanup };
}

// ── Consent Management ──

export async function getConsent(petId: number, userId: number): Promise<ConsentSettings> {
  const pet = await prisma.pet.findFirst({
    where: { id: petId, user_id: userId },
    select: { personality_modifiers: true },
  });
  if (!pet) throw new Error("Pet not found");

  return readConsentFromPet(pet.personality_modifiers);
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
  const pet = await prisma.pet.findFirst({
    where: publicPetWhere({ id: petId }),
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
