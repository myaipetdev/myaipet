import type { Prisma } from "@/generated/prisma/client";

export type MemoryModifierRecord = Record<string, unknown>;

export interface RecallStoreRedaction {
  memoryRows: number;
  agentMessages: number;
  conversations: number;
  personaRows: number;
  insightsSanitized: number;
  daydreamClaimsRevoked: number;
}

export interface InvalidatedMemoryModifiers {
  modifiers: MemoryModifierRecord;
  learnedSkillsRemoved: number;
}

/**
 * Remove JSON fields whose text was derived from retained memory without
 * per-source provenance. Owner configuration and server-authoritative product
 * state remain untouched. Marketplace/core skills remain installed; only
 * auto-learned skills disappear with the learned patterns that created them.
 *
 * `replacement` is used by a targeted owner edit to put the corrected ledger
 * back after every other unprovenanced derived store has been invalidated.
 */
export function invalidateDerivedMemoryModifiers(
  current: MemoryModifierRecord,
  replacement: Partial<MemoryModifierRecord> = {},
): InvalidatedMemoryModifiers {
  const installedSkills = Array.isArray(current.installed_skills)
    ? current.installed_skills
    : [];
  const retainedSkills = installedSkills.filter(
    (skill) => !(
      skill
      && typeof skill === "object"
      && (skill as Record<string, unknown>).isLearned === true
    ),
  );
  const modifiers: MemoryModifierRecord = {
    ...current,
    persistent_memories: [],
    user_profile: [],
    learned_patterns: [],
    bond_reflections: [],
    installed_skills: retainedSkills,
    ...replacement,
  };

  // These are generated from memory/persona source snapshots. Advancing the
  // epoch prevents an old cache from being served, and removing the values
  // prevents a later SOUL export/import from making them current again.
  delete modifiers.thought_of_day;
  delete modifiers.weekly_diary;
  delete modifiers.proactive;

  // A new post-edit corpus must establish its own consolidation watermark.
  delete modifiers.last_consolidation_at;
  delete modifiers.last_consolidation_turn_count;

  return {
    modifiers,
    learnedSkillsRemoved: installedSkills.length - retainedSkills.length,
  };
}

/**
 * Delete text stores that can be selected for a later agent/provider prompt
 * but cannot prove which retained fact they came from. By default this includes
 * every PetMemory type. A session-specific owner deletion may retain raw rows
 * carrying a different normalized session id while still purging all legacy
 * and non-session rows. PetMemory rows are
 * recall projections, not the authoritative generation/training/game records,
 * so deleting all memory types does not delete the underlying product state.
 *
 * Call only inside the shared per-pet advisory-lock transaction, followed by a
 * memory_epoch increment in that same transaction.
 */
export async function redactUnprovenancedRecallStores(
  tx: Prisma.TransactionClient,
  petId: number,
  options: {
    preserveNormalizedSessions?: boolean;
    revocationReason?: string;
  } = {},
): Promise<RecallStoreRedaction> {
  const memoryRows = await tx.petMemory.deleteMany({
    where: {
      pet_id: petId,
      ...(options.preserveNormalizedSessions
        ? {
            NOT: {
              AND: [
                { memory_type: { startsWith: "session_" } },
                { session_id: { not: null } },
              ],
            },
          }
        : {}),
    },
  });
  const agentMessages = await tx.petAgentMessage.deleteMany({ where: { pet_id: petId } });
  const conversations = await tx.petConversation.deleteMany({ where: { pet_id: petId } });
  const personaRows = await tx.petPersona.deleteMany({ where: { pet_id: petId } });

  // PetInsight row identity and any Generation link are privacy/provenance
  // markers. Keep those structural links, but erase all inferred text and
  // revoke work derived from the old memory generation. This also prevents a
  // daydream endpoint or worker from restating a corrected/deleted fact.
  const activeClaims = await tx.petInsight.findMany({
    where: {
      pet_id: petId,
      video_generation_id: { not: null },
      conversion_status: { in: ["claimed", "submitted"] },
    },
    select: { video_generation_id: true },
  });
  const activeGenerationIds = activeClaims
    .map((row) => row.video_generation_id)
    .filter((id): id is number => Number.isSafeInteger(id));
  const revokedGenerations = activeGenerationIds.length > 0
    ? await tx.generation.updateMany({
        where: {
          id: { in: activeGenerationIds },
          source_kind: "memory_daydream",
          status: { in: ["reserved", "pending", "processing", "persisting"] },
        },
        data: {
          status: "failed",
          visibility: "private",
          prompt: null,
          error_message: "Owner changed retained memory while daydream video work was in flight.",
        },
      })
    : { count: 0 };
  const insightsSanitized = await tx.petInsight.updateMany({
    where: { pet_id: petId },
    data: {
      insight: "Memory insight deleted by owner.",
      rationale: null,
      mood: "deleted",
      score: 0,
      source_keys: [],
      seen: true,
      reacted: false,
      conversion_status: "revoked",
      conversion_memory_epoch: null,
      conversion_claimed_at: null,
      conversion_retry_at: null,
      conversion_error: options.revocationReason
        || "Owner changed retained memory; derived insight was revoked.",
    },
  });

  return {
    memoryRows: memoryRows.count,
    agentMessages: agentMessages.count,
    conversations: conversations.count,
    personaRows: personaRows.count,
    insightsSanitized: insightsSanitized.count,
    daydreamClaimsRevoked: revokedGenerations.count,
  };
}
