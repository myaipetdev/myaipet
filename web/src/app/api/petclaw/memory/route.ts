/**
 * Owner-facing memory inspection and edit API.
 *
 *   GET    /api/petclaw/memory?petId=N[&platform=web][&sessionId=web-42]
 *           → { memories[], userProfile[], sessions[], stats }
 *
 *   DELETE /api/petclaw/memory?petId=N&entryType=memory&key=user_name
 *           → drop a single entry (sovereignty: redact, not just bulk-export)
 *
 *   DELETE /api/petclaw/memory?petId=N&entryType=session&id=42
 *           → drop one session log row
 *
 *   DELETE /api/petclaw/memory?petId=N&entryType=all&all=1
 *           → atomically clear every recall-bearing chat row + learned state
 *
 *   PATCH  /api/petclaw/memory?petId=N&entryType=memory   body: {key, content?, importance?}
 *           → edit an entry's content/importance (e.g. correct a wrong fact)
 *
 * Sovereignty principle: the owner can see and edit anything the pet has stored
 * about them. Tokens still never appear — those live in pet_platform_connections.
 */

import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rateLimit";
import { containsHangul, generatedEnglishOrFallback } from "@/lib/generatedLanguage";
import { createMemoryManager } from "@/lib/petclaw/memory/persistent-memory";
import {
  invalidateDerivedMemoryModifiers,
  redactUnprovenancedRecallStores,
  type RecallStoreRedaction,
} from "@/lib/petclaw/memory/invalidation";
import { withLockedPetModifiers } from "@/lib/petclaw/modifier-store";
import type { Prisma } from "@/generated/prisma/client";

const HIDDEN_LEGACY_MEMORY = "Legacy retained content is hidden in this English-only inspector. Export SOUL to review it, or delete it here.";
const HIDDEN_LEGACY_SESSION = "Legacy session text is hidden in this English-only inspector. Export SOUL to review it, or delete it here.";

function emptyRecallStoreRedaction(): RecallStoreRedaction {
  return {
    memoryRows: 0,
    agentMessages: 0,
    conversations: 0,
    personaRows: 0,
    insightsSanitized: 0,
    daydreamClaimsRevoked: 0,
  };
}

function inspectableContentEntry(entry: any): any {
  if (!containsHangul(entry?.content)) return entry;
  return { ...entry, content: HIDDEN_LEGACY_MEMORY, contentHidden: true };
}

function inspectableLearnedPattern(entry: any): any {
  if (!containsHangul(entry)) return entry;
  return {
    id: typeof entry?.id === "string" ? entry.id : undefined,
    deleteKey: typeof entry?.id === "string" ? entry.id : entry?.topic,
    topic: "Legacy retained pattern",
    description: HIDDEN_LEGACY_MEMORY,
    frequency: Number(entry?.frequency) || 0,
    successRate: Number(entry?.successRate) || 0,
    examples: [],
    createdAt: entry?.createdAt,
    lastUsedAt: entry?.lastUsedAt,
    promotedToSkill: entry?.promotedToSkill === true,
    contentHidden: true,
  };
}

async function updateModifierArray<T>(
  petId: number,
  field: string,
  transform: (current: any[]) => { next: any[]; result: T; applied?: boolean },
  options: { invalidateDerivedRecall?: boolean } = {},
): Promise<{
  result: T;
  recallStoresRedacted: RecallStoreRedaction;
  learnedSkillsRemoved: number;
  applied: boolean;
}> {
  return withLockedPetModifiers(petId, async ({ tx, modifiers }) => {
    const current = Array.isArray(modifiers[field]) ? [...(modifiers[field] as any[])] : [];
    const { next, result, applied = true } = transform(current);
    if (!applied) {
      return {
        result,
        recallStoresRedacted: emptyRecallStoreRedaction(),
        learnedSkillsRemoved: 0,
        applied: false,
      };
    }

    // Old derived stores have no per-fact provenance, so a targeted correction
    // cannot prove which session, milestone, persona field, reflection, learned
    // pattern, or cached narrative contains the stale value. Fail closed in the
    // same advisory-lock transaction, then restore only the corrected ledger.
    const recallStoresRedacted = options.invalidateDerivedRecall
      ? await redactUnprovenancedRecallStores(tx, petId)
      : emptyRecallStoreRedaction();
    const invalidated = options.invalidateDerivedRecall
      ? invalidateDerivedMemoryModifiers(modifiers, { [field]: next })
      : { modifiers: { ...modifiers, [field]: next }, learnedSkillsRemoved: 0 };
    await tx.pet.update({
      where: { id: petId },
      data: {
        personality_modifiers: invalidated.modifiers as any,
        // Owner corrections/deletions outrank extraction, consolidation, bond
        // reflection, and self-learning work that began from the prior state.
        memory_epoch: { increment: 1 },
      },
    });
    return {
      result,
      recallStoresRedacted,
      learnedSkillsRemoved: invalidated.learnedSkillsRemoved,
      applied: true,
    };
  });
}

function recallRedactionPayload(mutation: {
  recallStoresRedacted: RecallStoreRedaction;
  learnedSkillsRemoved: number;
  applied?: boolean;
}) {
  return {
    // Backward-compatible aggregate used by existing CLI/dashboard clients.
    sourceRowsRedacted: mutation.recallStoresRedacted.memoryRows,
    recallStoresRedacted: mutation.recallStoresRedacted,
    learnedSkillsRemoved: mutation.learnedSkillsRemoved,
    resetScope: memoryResetScope(
      mutation.recallStoresRedacted,
      mutation.learnedSkillsRemoved,
      mutation.applied !== false,
      false,
    ),
  };
}

const CLEARED_DERIVED_MEMORY_STORES = [
  "persistent_memories",
  "user_profile",
  "learned_patterns",
  "bond_reflections",
  "thought_of_day",
  "weekly_diary",
  "proactive",
  "consolidation_watermarks",
] as const;

function memoryResetScope(
  recallStoresRedacted: RecallStoreRedaction,
  learnedSkillsRemoved: number,
  applied: boolean,
  preservedOtherNormalizedSessions: boolean,
) {
  return {
    applied,
    reason: "Unprovenanced derived stores may restate owner-deleted content",
    recallStoresRedacted,
    clearedDerivedStores: applied ? [...CLEARED_DERIVED_MEMORY_STORES] : [],
    autoLearnedSkillsRemoved: learnedSkillsRemoved,
    preservedOtherNormalizedSessions,
    preservedOwnerConfiguration: true,
    preservedMarketplaceAndCoreSkills: true,
  };
}

async function deleteLearnedRecords(
  petId: number,
  key?: string,
): Promise<{
  deleted: number;
  patternsInvalidated: number;
  recallStoresRedacted: RecallStoreRedaction;
  learnedSkillsRemoved: number;
}> {
  return withLockedPetModifiers(petId, async ({ tx, modifiers }) => {
    const patterns = Array.isArray(modifiers.learned_patterns)
      ? [...(modifiers.learned_patterns as any[])]
      : [];
    const removed = key
      ? patterns.filter((entry) => entry?.id === key || entry?.topic === key)
      : patterns;
    if (key && removed.length === 0) {
      return {
        deleted: 0,
        patternsInvalidated: 0,
        recallStoresRedacted: emptyRecallStoreRedaction(),
        learnedSkillsRemoved: 0,
      };
    }

    // Learned patterns have no durable source-row lineage. Removing one must
    // also remove milestones and every other derived recall projection that
    // could restate it. Core/marketplace installs remain in the JSON document.
    const recallStoresRedacted = await redactUnprovenancedRecallStores(tx, petId);
    const invalidated = invalidateDerivedMemoryModifiers(modifiers);

    await tx.pet.update({
      where: { id: petId },
      data: {
        personality_modifiers: invalidated.modifiers as any,
        memory_epoch: { increment: 1 },
      },
    });
    return {
      deleted: removed.length,
      patternsInvalidated: patterns.length,
      recallStoresRedacted,
      learnedSkillsRemoved: invalidated.learnedSkillsRemoved,
    };
  });
}

async function deleteSessionRows(
  petId: number,
  where: Prisma.PetMemoryWhereInput,
  options: { redactLegacyOnNoMatch?: boolean; expandNormalizedSession?: boolean } = {},
): Promise<{
  deleted: number;
  sourceRowsRedacted: number;
  recallStoresRedacted: RecallStoreRedaction;
  learnedSkillsRemoved: number;
  resetScope: ReturnType<typeof memoryResetScope>;
}> {
  return withLockedPetModifiers(petId, async ({ tx, modifiers }) => {
    const targets = options.expandNormalizedSession
      ? await tx.petMemory.findMany({
          where,
          take: 2,
          select: { session_id: true, platform: true, memory_type: true },
        })
      : [];
    const deleted = await tx.petMemory.deleteMany({ where });
    // A stale/non-owned id is a no-op. It must not become a surprising
    // whole-corpus purge merely because legacy rows cannot be correlated.
    if (deleted.count === 0 && !options.redactLegacyOnNoMatch) {
      return {
        deleted: 0,
        sourceRowsRedacted: 0,
        recallStoresRedacted: emptyRecallStoreRedaction(),
        learnedSkillsRemoved: 0,
        resetScope: memoryResetScope(emptyRecallStoreRedaction(), 0, false, true),
      };
    }
    // A single row belongs to a normalized session. Drop its sibling turns too
    // so a derived reply cannot repeat the deleted owner text, while retaining
    // raw rows from other, provably separate session ids.
    let siblingRowsDeleted = 0;
    const normalizedTarget = targets.find((target) => target.session_id);
    if (normalizedTarget?.session_id) {
      const siblings = await tx.petMemory.deleteMany({
        where: {
          pet_id: petId,
          memory_type: { startsWith: "session_" },
          session_id: normalizedTarget.session_id,
          ...(normalizedTarget.platform
            ? { platform: normalizedTarget.platform }
            : { platform: null, memory_type: normalizedTarget.memory_type }),
        },
      });
      siblingRowsDeleted = siblings.count;
    }

    // Non-session PetMemory rows and legacy session rows have no source-session
    // lineage. Purge them together with persona/bot histories, but preserve raw
    // rows that carry a different normalized session id.
    const recallStoresRedacted = await redactUnprovenancedRecallStores(
      tx,
      petId,
      { preserveNormalizedSessions: true },
    );
    const invalidated = invalidateDerivedMemoryModifiers(modifiers);
    // Fence a turn that started before this deletion but has not logged yet.
    await tx.pet.update({
      where: { id: petId },
      data: {
        personality_modifiers: invalidated.modifiers as any,
        memory_epoch: { increment: 1 },
      },
    });
    return {
      deleted: deleted.count + siblingRowsDeleted,
      sourceRowsRedacted: recallStoresRedacted.memoryRows,
      recallStoresRedacted,
      learnedSkillsRemoved: invalidated.learnedSkillsRemoved,
      resetScope: memoryResetScope(
        recallStoresRedacted,
        invalidated.learnedSkillsRemoved,
        true,
        options.expandNormalizedSession === true,
      ),
    };
  });
}

function sessionWhere(req: NextRequest, petId: number): Prisma.PetMemoryWhereInput {
  const rawPlatform = req.nextUrl.searchParams.get("platform")?.trim() || "";
  const platform = rawPlatform && rawPlatform.toLowerCase() !== "all"
    ? rawPlatform
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 20)
    : "";
  const sessionId = req.nextUrl.searchParams.get("sessionId")?.trim().slice(0, 128) || "";
  const filters: Prisma.PetMemoryWhereInput[] = [
    { memory_type: { startsWith: "session_" } },
  ];

  if (platform) {
    filters.push({
      OR: [
        { platform },
        // Legacy rows only encoded the platform in memory_type.
        {
          AND: [
            { session_id: null },
            { memory_type: `session_${platform.slice(0, 12)}` },
          ],
        },
      ],
    });
  }
  if (sessionId) filters.push({ session_id: sessionId });

  return { pet_id: petId, AND: filters };
}

async function ownsPet(req: NextRequest): Promise<{ user: { id: number } | null; petId: number; pet: any | null }> {
  const user = await getUser(req);
  const petId = Number(req.nextUrl.searchParams.get("petId"));
  if (!user || !Number.isInteger(petId) || petId <= 0) {
    return { user: null, petId, pet: null };
  }
  const pet = await prisma.pet.findFirst({ where: { id: petId, user_id: user.id, is_active: true } });
  return { user, petId, pet };
}

export async function GET(req: NextRequest) {
  const rl = rateLimit(req, { key: "memory-read", limit: 60, windowMs: 60_000 });
  if (!rl.ok) return rl.response;

  const { user, petId, pet } = await ownsPet(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!pet) return NextResponse.json({ error: "Pet not found" }, { status: 404 });

  const mods = (pet.personality_modifiers as any) || {};
  // Never drop retained rows from an owner-sovereignty surface. Legacy
  // non-English content is represented by a neutral placeholder so its key and
  // delete control remain available without rendering it into this release.
  const memories = (Array.isArray(mods.persistent_memories) ? mods.persistent_memories : [])
    .map(inspectableContentEntry);
  const userProfile = (Array.isArray(mods.user_profile) ? mods.user_profile : [])
    .map(inspectableContentEntry);
  const learnedPatterns = (Array.isArray(mods.learned_patterns) ? mods.learned_patterns : [])
    .map(inspectableLearnedPattern);
  // VIGIL bond-loop relationship notes — the second-person, actionable notes the
  // pet wrote about how to treat you (capped ring in bond_reflections).
  const bondNotes = Array.isArray(mods.bond_reflections)
    ? mods.bond_reflections
        .map((r: any) => (typeof r === "string" ? r : r?.note))
        .filter((note: unknown) => typeof note === "string" && !containsHangul(note))
        .slice(-8)
    : [];

  const sessions = await prisma.petMemory.findMany({
    where: sessionWhere(req, petId),
    orderBy: { created_at: "desc" },
    take: 100,
    select: {
      id: true,
      memory_type: true,
      session_id: true,
      platform: true,
      speaker_id: true,
      role: true,
      content: true,
      created_at: true,
    },
  });

  return NextResponse.json({
    petId,
    memories,
    userProfile,
    learnedPatterns,
    bondNotes,
    sessions: sessions.map(s => {
      const legacyUser = s.content.match(/^\[user(?::([^\]]+))?\]\s*/);
      const role = s.role === "user" || s.role === "pet"
        ? s.role
        : legacyUser
          ? "user"
          : "pet";
      const petGenerated = role === "pet";
      return {
        id: s.id,
        sessionId: s.session_id || null,
        platform: s.platform || s.memory_type.replace("session_", ""),
        speakerId: s.speaker_id || legacyUser?.[1] || null,
        role,
        // Preserve the row and delete handle even when either role contains
        // legacy non-English text. Owners can use SOUL export for the raw value.
        content: containsHangul(s.content)
          ? HIDDEN_LEGACY_SESSION
          : petGenerated
            ? generatedEnglishOrFallback(
                s.content,
                "[pet] A previous pet reply is unavailable in this English-only release.",
              )
            : s.content,
        contentHidden: containsHangul(s.content),
        createdAt: s.created_at,
      };
    }),
    stats: {
      memoryCount: memories.length,
      profileCount: userProfile.length,
      learnedPatternCount: learnedPatterns.length,
      learnedPatternThresholdCount: learnedPatterns.filter((p: any) => p.promotedToSkill).length,
      sessionCount: sessions.length,
      lastConsolidatedAt: mods.last_consolidation_at || null,
    },
  });
}

export async function DELETE(req: NextRequest) {
  const rl = rateLimit(req, { key: "memory-delete", limit: 30, windowMs: 60_000 });
  if (!rl.ok) return rl.response;

  const { user, petId, pet } = await ownsPet(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!pet) return NextResponse.json({ error: "Pet not found" }, { status: 404 });

  const entryType = req.nextUrl.searchParams.get("entryType");
  const all = req.nextUrl.searchParams.get("all") === "1";

  if (entryType === "all") {
    if (!all) {
      return NextResponse.json(
        { error: "all=1 confirmation required" },
        { status: 400 },
      );
    }
    const deleted = await createMemoryManager(petId).clearMemory();
    return NextResponse.json({ ok: true, deleted });
  }

  if (entryType === "session") {
    if (all) {
      const result = await deleteSessionRows(
        petId,
        sessionWhere(req, petId),
        { redactLegacyOnNoMatch: true },
      );
      return NextResponse.json({ ok: true, ...result });
    }
    const id = Number(req.nextUrl.searchParams.get("id"));
    if (!Number.isSafeInteger(id) || id <= 0) {
      return NextResponse.json({ error: "positive id required" }, { status: 400 });
    }
    const result = await deleteSessionRows(petId, {
      id,
      pet_id: petId,
      memory_type: { startsWith: "session_" },
    }, { expandNormalizedSession: true });
    if (result.deleted === 0) {
      return NextResponse.json({ error: "Session entry not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, ...result });
  }

  if (entryType === "memory") {
    if (all) {
      const mutation = await updateModifierArray(petId, "persistent_memories", (current) => ({
        next: [],
        result: current.length,
      }), { invalidateDerivedRecall: true });
      return NextResponse.json({
        ok: true,
        deleted: mutation.result,
        ...recallRedactionPayload(mutation),
      });
    }
    const key = req.nextUrl.searchParams.get("key");
    if (!key) return NextResponse.json({ error: "key required" }, { status: 400 });
    const mutation = await updateModifierArray(petId, "persistent_memories", (current) => {
      const next = current.filter((entry: any) => entry.key !== key);
      const deleted = current.length - next.length;
      return { next, result: deleted, applied: deleted > 0 };
    }, { invalidateDerivedRecall: true });
    return NextResponse.json({
      ok: true,
      deleted: mutation.result,
      ...recallRedactionPayload(mutation),
    });
  }

  if (entryType === "profile") {
    if (all) {
      const mutation = await updateModifierArray(petId, "user_profile", (current) => ({
        next: [],
        result: current.length,
      }), { invalidateDerivedRecall: true });
      return NextResponse.json({
        ok: true,
        deleted: mutation.result,
        ...recallRedactionPayload(mutation),
      });
    }
    const key = req.nextUrl.searchParams.get("key");
    if (!key) return NextResponse.json({ error: "key required" }, { status: 400 });
    const mutation = await updateModifierArray(petId, "user_profile", (current) => {
      const next = current.filter((entry: any) => entry.key !== key);
      const deleted = current.length - next.length;
      return { next, result: deleted, applied: deleted > 0 };
    }, { invalidateDerivedRecall: true });
    return NextResponse.json({
      ok: true,
      deleted: mutation.result,
      ...recallRedactionPayload(mutation),
    });
  }

  if (entryType === "learned") {
    if (all) {
      const mutation = await deleteLearnedRecords(petId);
      return NextResponse.json({
        ok: true,
        ...mutation,
        ...recallRedactionPayload(mutation),
      });
    }
    const id = req.nextUrl.searchParams.get("key");
    if (!id) return NextResponse.json({ error: "key required" }, { status: 400 });
    const mutation = await deleteLearnedRecords(petId, id);
    if (mutation.deleted === 0) {
      return NextResponse.json({ error: "Learned pattern not found" }, { status: 404 });
    }
    return NextResponse.json({
      ok: true,
      ...mutation,
      ...recallRedactionPayload(mutation),
    });
  }

  return NextResponse.json({ error: "Unknown entryType" }, { status: 400 });
}

export async function PATCH(req: NextRequest) {
  const rl = rateLimit(req, { key: "memory-edit", limit: 30, windowMs: 60_000 });
  if (!rl.ok) return rl.response;

  const { user, petId, pet } = await ownsPet(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!pet) return NextResponse.json({ error: "Pet not found" }, { status: 404 });

  const entryType = req.nextUrl.searchParams.get("entryType");
  const body = await req.json().catch(() => ({}));
  const { key, content, importance, category } = body;
  if (!key) return NextResponse.json({ error: "key required" }, { status: 400 });

  if (entryType === "memory") {
    const mutation = await updateModifierArray(petId, "persistent_memories", (current) => {
      const idx = current.findIndex((item: any) => item.key === key);
      if (idx === -1) return { next: current, result: null, applied: false };
      const next = [...current];
      next[idx] = { ...next[idx] };
      if (typeof content === "string") next[idx].content = content.slice(0, 400);
      if (typeof importance === "number") next[idx].importance = Math.max(1, Math.min(5, importance));
      if (typeof category === "string") next[idx].category = category;
      next[idx].updatedAt = new Date().toISOString();
      next[idx].source = "user_edit";
      return { next, result: next[idx] };
    }, { invalidateDerivedRecall: true });
    const entry = mutation.result;
    if (!entry) return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    return NextResponse.json({ ok: true, entry, ...recallRedactionPayload(mutation) });
  }

  if (entryType === "profile") {
    const mutation = await updateModifierArray(petId, "user_profile", (current) => {
      const idx = current.findIndex((item: any) => item.key === key);
      if (idx === -1) return { next: current, result: null, applied: false };
      const next = [...current];
      next[idx] = { ...next[idx] };
      if (typeof content === "string") next[idx].content = content.slice(0, 400);
      if (typeof category === "string") next[idx].category = category;
      next[idx].updatedAt = new Date().toISOString();
      next[idx].source = "user_edit";
      return { next, result: next[idx] };
    }, { invalidateDerivedRecall: true });
    const entry = mutation.result;
    if (!entry) return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    return NextResponse.json({ ok: true, entry, ...recallRedactionPayload(mutation) });
  }

  return NextResponse.json({ error: "Unknown entryType" }, { status: 400 });
}
