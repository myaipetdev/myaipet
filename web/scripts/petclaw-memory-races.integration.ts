/**
 * Real-Postgres integration coverage for the PetClaw memory deletion fence.
 *
 * Run against an isolated database only:
 *   DATABASE_URL=postgresql://... npm run test:petclaw-memory-races
 */

import assert from "node:assert/strict";
import { prisma } from "@/lib/prisma";
import { createMemoryManager } from "@/lib/petclaw/memory/persistent-memory";
import {
  invalidateDerivedMemoryModifiers,
  redactUnprovenancedRecallStores,
} from "@/lib/petclaw/memory/invalidation";
import { createSelfLearner } from "@/lib/petclaw/memory/self-learning";
import { maybeReflectOnBond } from "@/lib/petclaw/memory/bond-loop";
import { consolidateMemory } from "@/lib/petclaw/memory/consolidate";
import { getRelevantMemories } from "@/lib/petclaw/memory/retrieval";
import { saveChatAnalysis } from "@/lib/services/persona";
import { persistDaydreamInsights } from "@/lib/petclaw/memory/daydream";
import {
  readPetMemoryEpoch,
  withLockedPetModifiers,
} from "@/lib/petclaw/modifier-store";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must point to an isolated PetClaw test database");
}

const suffix = `${Date.now()}${Math.floor(Math.random() * 10_000)}`;
const wallet = `0x${suffix.padEnd(40, "0").slice(0, 40)}`;
let petId: number | null = null;
let userId: number | null = null;

async function main(): Promise<void> {
try {
  const user = await prisma.user.create({
    data: { wallet_address: wallet, nonce: suffix.slice(0, 32) },
  });
  userId = user.id;
  const pet = await prisma.pet.create({
    data: {
      user_id: user.id,
      name: "MemoryRacePet",
      species: 1,
      personality_modifiers: {
        persistent_memories: [{ key: "private_fact", content: "delete me" }],
        user_profile: [{ key: "owner_name", content: "delete me" }],
        learned_patterns: [{ id: "pattern_1", topic: "delete me" }],
        bond_reflections: [{ date: "2026-07-22", note: "delete me" }],
        thought_of_day: {
          text: "delete cached thought",
          generatedAt: "2026-07-22T00:00:00.000Z",
          memoryEpoch: 0,
        },
        weekly_diary: {
          text: "delete cached diary",
          generatedAt: "2026-07-22T00:00:00.000Z",
          memoryEpoch: 0,
        },
        proactive: {
          text: "delete cached greeting",
          at: 1,
          for: 0,
          memoryEpoch: 0,
        },
        consent_public_profile: true,
        custom_traits: "Owner-authored trait config",
        installed_skills: [
          { skillId: "companion-chat" },
          { skillId: "learned_testing", isLearned: true },
        ],
      },
    },
  });
  petId = pet.id;

  await Promise.all([
    prisma.petMemory.create({
      data: {
        pet_id: pet.id,
        memory_type: "session_web",
        session_id: `web-${user.id}`,
        platform: "web",
        speaker_id: String(user.id),
        role: "user",
        content: "[user] delete me",
      },
    }),
    prisma.petMemory.create({
      data: { pet_id: pet.id, memory_type: "milestone", content: "delete me" },
    }),
    prisma.petAgentMessage.create({
      data: {
        pet_id: pet.id,
        platform: "web",
        direction: "inbound",
        content: "delete me",
      },
    }),
    prisma.petConversation.create({
      data: { pet_id: pet.id, platform: "web", chat_id: `web-${user.id}` },
    }),
    prisma.petPersona.create({
      data: { pet_id: pet.id, owner_bio: "delete me" },
    }),
  ]);

  const linkedGeneration = await prisma.generation.create({
    data: {
      user_id: user.id,
      pet_id: pet.id,
      pet_type: pet.species,
      style: 1,
      prompt: "private generated prompt",
      duration: 5,
      photo_path: "",
      status: "completed",
      visibility: "private",
      source_kind: "memory_daydream",
      credits_charged: 0,
    },
  });
  const [unlinkedInsight] = await Promise.all([
    prisma.petInsight.create({
      data: {
        pet_id: pet.id,
        insight: "unlinked private memory inference",
        rationale: "private source rationale",
        mood: "tender",
        source_keys: ["private_fact"],
      },
    }),
    prisma.petInsight.create({
      data: {
        pet_id: pet.id,
        insight: "linked private memory inference",
        rationale: "private linked rationale",
        mood: "hopeful",
        source_keys: ["private_fact"],
        video_generation_id: linkedGeneration.id,
      },
    }),
  ]);

  const beforeEpoch = await readPetMemoryEpoch(pet.id);
  const deleted = await createMemoryManager(pet.id).clearMemory();
  const cleared = await prisma.pet.findUniqueOrThrow({ where: { id: pet.id } });
  const clearedMods = (cleared.personality_modifiers as Record<string, unknown>) || {};

  assert.equal(cleared.memory_epoch, beforeEpoch + 1);
  assert.ok(deleted.memoryRows >= 2);
  assert.equal(deleted.agentMessages, 1);
  assert.equal(deleted.conversations, 1);
  assert.equal(deleted.personaRows, 1);
  assert.equal(deleted.insightsSanitized, 2);
  assert.equal(deleted.daydreamClaimsRevoked, 0);
  for (const field of ["persistent_memories", "user_profile", "learned_patterns", "bond_reflections"]) {
    assert.deepEqual(clearedMods[field], [], `${field} must be empty after owner clear`);
  }
  for (const cache of ["thought_of_day", "weekly_diary", "proactive"]) {
    assert.equal(
      Object.hasOwn(clearedMods, cache),
      false,
      `${cache} must be absent after owner clear so SOUL export cannot revive it`,
    );
  }
  assert.equal(clearedMods.consent_public_profile, true, "clear must preserve unrelated owner consent");
  assert.equal(clearedMods.custom_traits, "Owner-authored trait config", "clear must preserve owner config");
  assert.deepEqual(clearedMods.installed_skills, [{ skillId: "companion-chat" }]);
  assert.equal(deleted.learnedSkills, 1);
  assert.equal(await prisma.petMemory.count({ where: { pet_id: pet.id } }), 0);
  assert.equal(await prisma.petAgentMessage.count({ where: { pet_id: pet.id } }), 0);
  assert.equal(await prisma.petConversation.count({ where: { pet_id: pet.id } }), 0);
  assert.equal(await prisma.petPersona.count({ where: { pet_id: pet.id } }), 0);
  const unlinkedTombstone = await prisma.petInsight.findUniqueOrThrow({
    where: { id: unlinkedInsight.id },
  });
  assert.equal(unlinkedTombstone.insight, "Memory insight deleted by owner.");
  assert.equal(unlinkedTombstone.mood, "deleted");
  assert.equal(unlinkedTombstone.conversion_status, "revoked");
  assert.equal(unlinkedTombstone.video_generation_id, null);
  const linkedTombstone = await prisma.petInsight.findFirstOrThrow({
    where: { pet_id: pet.id, video_generation_id: linkedGeneration.id },
  });
  assert.equal(linkedTombstone.insight, "Memory insight deleted by owner.");
  assert.equal(linkedTombstone.rationale, null);
  assert.equal(linkedTombstone.mood, "deleted");
  assert.equal(linkedTombstone.score, 0);
  assert.deepEqual(linkedTombstone.source_keys, []);
  assert.equal(linkedTombstone.seen, true);
  assert.equal(linkedTombstone.reacted, false);
  assert.equal(linkedTombstone.conversion_status, "revoked");

  // Simulate persona analysis that began before the owner clear and completed
  // afterward. The stale provider result must not recreate PetPersona.
  const stalePersona = await saveChatAnalysis(pet.id, {
    patterns: {
      formality: "casual",
      sentence_length: "short",
      emoji_usage: "rare",
      punctuation_style: "standard",
    },
    sampleMessages: ["stale owner sample"],
    vocabularyStyle: "Concise conversational vocabulary",
    detectedTone: "casual",
    detectedLanguage: "en",
    interests: ["testing"],
  }, beforeEpoch);
  assert.equal(stalePersona, null, "pre-clear persona analysis must be discarded");
  assert.equal(
    await prisma.petPersona.count({ where: { pet_id: pet.id } }),
    0,
    "stale persona analysis must not recreate the cleared persona",
  );

  const staleDaydream = await persistDaydreamInsights(pet.id, beforeEpoch, [{
    insight: "stale daydream must never return",
    rationale: "derived from deleted retained memory",
    score: 10,
    sourceKeys: ["private_fact"],
    mood: "tender",
  }]);
  assert.deepEqual(
    staleDaydream,
    { created: 0, discarded: true },
    "pre-clear daydream inference must be discarded",
  );
  assert.equal(await prisma.petInsight.count({
    where: { pet_id: pet.id, insight: "stale daydream must never return" },
  }), 0);

  // Simulate an extraction that captured the old generation, then finished
  // only after a second owner clear. It must observe the epoch change and drop.
  await withLockedPetModifiers(pet.id, async ({ tx, modifiers }) => {
    await tx.pet.update({
      where: { id: pet.id },
      data: {
        personality_modifiers: {
          ...modifiers,
          persistent_memories: [{ key: "second_fact", content: "delete me too" }],
        },
      },
    });
  });
  const staleStartEpoch = await readPetMemoryEpoch(pet.id);
  let releaseStale!: () => void;
  const staleGate = new Promise<void>((resolve) => { releaseStale = resolve; });
  const staleWriter = (async () => {
    await staleGate;
    return withLockedPetModifiers(pet.id, async ({ tx, pet: lockedPet, modifiers }) => {
      if (lockedPet.memory_epoch !== staleStartEpoch) return false;
      await tx.pet.update({
        where: { id: pet.id },
        data: {
          personality_modifiers: {
            ...modifiers,
            persistent_memories: [{ key: "resurrected", content: "must never appear" }],
          },
        },
      });
      return true;
    });
  })();

  await createMemoryManager(pet.id).clearMemory();
  releaseStale();
  assert.equal(await staleWriter, false, "pre-clear work must be discarded");
  const afterFence = await prisma.pet.findUniqueOrThrow({ where: { id: pet.id } });
  const afterFenceMods = (afterFence.personality_modifiers as Record<string, unknown>) || {};
  assert.deepEqual(afterFenceMods.persistent_memories, []);

  // Independent modifier writers sharing the advisory lock must merge into the
  // latest document rather than lose one another's fields.
  await Promise.all([
    withLockedPetModifiers(pet.id, async ({ tx, modifiers }) => {
      await new Promise((resolve) => setTimeout(resolve, 75));
      await tx.pet.update({
        where: { id: pet.id },
        data: { personality_modifiers: { ...modifiers, consent_public_profile: true } },
      });
    }),
    withLockedPetModifiers(pet.id, async ({ tx, modifiers }) => {
      await tx.pet.update({
        where: { id: pet.id },
        data: { personality_modifiers: { ...modifiers, installed_skills: [{ skillId: "companion-chat" }] } },
      });
    }),
  ]);
  const merged = await prisma.pet.findUniqueOrThrow({ where: { id: pet.id } });
  const mergedMods = (merged.personality_modifiers as Record<string, unknown>) || {};
  assert.equal(mergedMods.consent_public_profile, true);
  assert.deepEqual(mergedMods.installed_skills, [{ skillId: "companion-chat" }]);

  // Targeted correction has no trustworthy per-fact provenance across raw and
  // derived stores. Seed every recall path with stale text, then apply the same
  // production invalidation primitive as the owner-facing route.
  await withLockedPetModifiers(pet.id, async ({ tx, modifiers }) => {
    await tx.pet.update({
      where: { id: pet.id },
      data: {
        personality_modifiers: {
          ...modifiers,
          persistent_memories: [{ key: "stale_fact", content: "stale original statement" }],
          user_profile: [{ key: "owner_fact", content: "stale original statement" }],
          learned_patterns: [{ id: "stale_pattern", topic: "stale original statement" }],
          bond_reflections: [{ note: "stale original statement" }],
          thought_of_day: { text: "stale original statement", memoryEpoch: 2 },
          weekly_diary: { text: "stale original statement", memoryEpoch: 2 },
          proactive: { text: "stale original statement", memoryEpoch: 2 },
          custom_traits: "Owner-authored trait config",
          installed_skills: [
            { skillId: "companion-chat" },
            { skillId: "learned_stale", isLearned: true },
          ],
        },
      },
    });
  });
  const targetedDaydreamGeneration = await prisma.generation.create({
    data: {
      user_id: user.id,
      pet_id: pet.id,
      pet_type: pet.species,
      style: 1,
      prompt: "stale original statement in active daydream prompt",
      duration: 5,
      photo_path: "",
      status: "processing",
      visibility: "public",
      source_kind: "memory_daydream",
      credits_charged: 0,
    },
  });
  const requestEpoch = await readPetMemoryEpoch(pet.id);
  await Promise.all([
    prisma.petMemory.create({
      data: {
        pet_id: pet.id,
        memory_type: "session_web",
        session_id: `web-${user.id}`,
        platform: "web",
        role: "user",
        content: "[user] stale original statement",
      },
    }),
    prisma.petMemory.create({
      data: {
        pet_id: pet.id,
        memory_type: "conversation",
        content: "Owner said stale original statement",
      },
    }),
    prisma.petMemory.create({
      data: {
        pet_id: pet.id,
        memory_type: "milestone",
        content: "stale original statement in derived milestone",
      },
    }),
    prisma.petAgentMessage.create({
      data: {
        pet_id: pet.id,
        platform: "web",
        direction: "inbound",
        content: "stale original statement in agent history",
      },
    }),
    prisma.petConversation.create({
      data: { pet_id: pet.id, platform: "web", chat_id: `correction-${user.id}` },
    }),
    prisma.petPersona.create({
      data: { pet_id: pet.id, owner_bio: "stale original statement in persona" },
    }),
    prisma.petInsight.create({
      data: {
        pet_id: pet.id,
        insight: "stale original statement in unlinked insight",
        rationale: "derived from corrected memory",
        mood: "hopeful",
        source_keys: ["stale_fact"],
      },
    }),
    prisma.petInsight.create({
      data: {
        pet_id: pet.id,
        insight: "stale original statement in claimed insight",
        rationale: "derived from corrected memory",
        mood: "hopeful",
        source_keys: ["stale_fact"],
        video_generation_id: targetedDaydreamGeneration.id,
        conversion_status: "claimed",
        conversion_memory_epoch: requestEpoch,
        conversion_claimed_at: new Date(),
      },
    }),
  ]);
  const correctionRedaction = await withLockedPetModifiers(
    pet.id,
    async ({ tx, modifiers }) => {
      const recallStores = await redactUnprovenancedRecallStores(tx, pet.id);
      const invalidated = invalidateDerivedMemoryModifiers(modifiers, {
        persistent_memories: [{ key: "corrected_fact", content: "Corrected owner statement" }],
      });
      await tx.pet.update({
        where: { id: pet.id },
        data: {
          personality_modifiers: invalidated.modifiers as any,
          memory_epoch: { increment: 1 },
        },
      });
      return { recallStores, learnedSkillsRemoved: invalidated.learnedSkillsRemoved };
    },
  );
  assert.equal(correctionRedaction.recallStores.memoryRows, 3);
  assert.equal(correctionRedaction.recallStores.agentMessages, 1);
  assert.equal(correctionRedaction.recallStores.conversations, 1);
  assert.equal(correctionRedaction.recallStores.personaRows, 1);
  assert.equal(correctionRedaction.recallStores.insightsSanitized, 4);
  assert.equal(correctionRedaction.recallStores.daydreamClaimsRevoked, 1);
  assert.equal(correctionRedaction.learnedSkillsRemoved, 1);
  assert.equal(await prisma.petMemory.count({ where: { pet_id: pet.id } }), 0);
  assert.equal(await prisma.petAgentMessage.count({ where: { pet_id: pet.id } }), 0);
  assert.equal(await prisma.petConversation.count({ where: { pet_id: pet.id } }), 0);
  assert.equal(await prisma.petPersona.count({ where: { pet_id: pet.id } }), 0);
  const revokedTargetGeneration = await prisma.generation.findUniqueOrThrow({
    where: { id: targetedDaydreamGeneration.id },
  });
  assert.equal(revokedTargetGeneration.status, "failed");
  assert.equal(revokedTargetGeneration.visibility, "private");
  assert.equal(revokedTargetGeneration.prompt, null, "revoked work must not retain a derived private prompt");
  const postCorrectionInsights = await prisma.petInsight.findMany({ where: { pet_id: pet.id } });
  assert.ok(postCorrectionInsights.every((insight) => (
    insight.insight === "Memory insight deleted by owner."
    && insight.rationale === null
    && insight.mood === "deleted"
    && insight.conversion_status === "revoked"
  )), "targeted correction must tombstone every derived insight");
  const corrected = await prisma.pet.findUniqueOrThrow({ where: { id: pet.id } });
  const correctedMods = (corrected.personality_modifiers as Record<string, unknown>) || {};
  assert.deepEqual(correctedMods.persistent_memories, [
    { key: "corrected_fact", content: "Corrected owner statement" },
  ]);
  for (const field of ["user_profile", "learned_patterns", "bond_reflections"]) {
    assert.deepEqual(correctedMods[field], [], `${field} must be invalidated by targeted correction`);
  }
  for (const cache of ["thought_of_day", "weekly_diary", "proactive"]) {
    assert.equal(Object.hasOwn(correctedMods, cache), false, `${cache} must not survive correction`);
  }
  assert.equal(correctedMods.consent_public_profile, true);
  assert.equal(correctedMods.custom_traits, "Owner-authored trait config");
  assert.deepEqual(correctedMods.installed_skills, [{ skillId: "companion-chat" }]);
  const recalledAfterCorrection = await getRelevantMemories(
    pet.id,
    "stale original statement",
    10,
  );
  assert.ok(
    recalledAfterCorrection.every((memory) => !memory.content.includes("stale original statement")),
    "no stale raw or derived source may return through full-corpus recall",
  );

  // A request that began before the correction is revoked end-to-end. These
  // calls intentionally use paths that would otherwise write session rows,
  // extracted ledger data, learned patterns/milestones, bond reflections, and
  // consolidated state. Every path must fail before calling an LLM or writing.
  const manager = createMemoryManager(pet.id);
  const retained = await manager.retainFromConversation(
    "hello stale request",
    "hello from pet",
    "web",
    `web-${user.id}`,
    user.id,
    requestEpoch,
  );
  assert.equal(retained.retained, false);
  assert.equal(retained.fenced, true);
  assert.equal(
    await manager.logTurnOnly("stale fallback", "web", `web-${user.id}`, user.id, requestEpoch),
    false,
  );
  assert.deepEqual(
    await createSelfLearner(pet.id).observeConversation(
      "hello",
      "a response that would otherwise become an example",
      1,
      requestEpoch,
    ),
    { patternDetected: false, skillCreated: false },
  );
  await maybeReflectOnBond(pet.id, "stale owner turn", "stale pet turn", requestEpoch);
  assert.equal(await consolidateMemory(pet.id, true, requestEpoch), null);

  const afterRequestFence = await prisma.pet.findUniqueOrThrow({ where: { id: pet.id } });
  const afterRequestFenceMods = (afterRequestFence.personality_modifiers as Record<string, unknown>) || {};
  assert.deepEqual(afterRequestFenceMods.persistent_memories, [
    { key: "corrected_fact", content: "Corrected owner statement" },
  ]);
  assert.deepEqual(afterRequestFenceMods.learned_patterns, []);
  assert.deepEqual(afterRequestFenceMods.bond_reflections, []);
  assert.equal(await prisma.petMemory.count({
    where: { pet_id: pet.id, memory_type: { startsWith: "session_" } },
  }), 0);
  assert.equal(await prisma.petMemory.count({
    where: { pet_id: pet.id, memory_type: "milestone" },
  }), 0, "stale request must not recreate a learned-skill milestone");

  // Session deletion has stronger provenance than a fact edit. Delete the
  // selected session and every unprovenanced derived projection, but preserve
  // a raw session carrying a distinct normalized session id.
  await withLockedPetModifiers(pet.id, async ({ tx, modifiers }) => {
    await tx.pet.update({
      where: { id: pet.id },
      data: {
        personality_modifiers: {
          ...modifiers,
          persistent_memories: [{ key: "session_fact", content: "derived target text" }],
          user_profile: [{ key: "session_profile", content: "derived target text" }],
          learned_patterns: [{ id: "session_pattern", topic: "derived target text" }],
          bond_reflections: [{ note: "derived target text" }],
          thought_of_day: { text: "derived target text", memoryEpoch: 3 },
          weekly_diary: { text: "derived target text", memoryEpoch: 3 },
          proactive: { text: "derived target text", memoryEpoch: 3 },
          installed_skills: [
            { skillId: "companion-chat" },
            { skillId: "learned_session", isLearned: true },
          ],
        },
      },
    });
  });
  await Promise.all([
    prisma.petMemory.create({
      data: {
        pet_id: pet.id,
        memory_type: "session_web",
        session_id: "target-session",
        platform: "web",
        role: "user",
        content: "[user] delete this normalized session",
      },
    }),
    prisma.petMemory.create({
      data: {
        pet_id: pet.id,
        memory_type: "session_web",
        session_id: "target-session",
        platform: "web",
        role: "pet",
        content: "[pet] reply derived from deleted session",
      },
    }),
    prisma.petMemory.create({
      data: {
        pet_id: pet.id,
        memory_type: "session_web",
        session_id: "unrelated-session",
        platform: "web",
        role: "user",
        content: "[user] provably separate raw session",
      },
    }),
    prisma.petMemory.create({
      data: {
        pet_id: pet.id,
        memory_type: "session_web",
        content: "legacy session without lineage",
      },
    }),
    prisma.petMemory.create({
      data: { pet_id: pet.id, memory_type: "milestone", content: "derived target text" },
    }),
    prisma.petAgentMessage.create({
      data: {
        pet_id: pet.id,
        platform: "web",
        direction: "inbound",
        content: "derived target text",
      },
    }),
    prisma.petConversation.create({
      data: { pet_id: pet.id, platform: "web", chat_id: "target-session" },
    }),
    prisma.petPersona.create({
      data: { pet_id: pet.id, owner_bio: "derived target text" },
    }),
  ]);
  const sessionDeleteEpoch = await readPetMemoryEpoch(pet.id);
  const sessionInvalidation = await withLockedPetModifiers(
    pet.id,
    async ({ tx, modifiers }) => {
      const target = await tx.petMemory.deleteMany({
        where: { pet_id: pet.id, session_id: "target-session", platform: "web" },
      });
      const recallStores = await redactUnprovenancedRecallStores(
        tx,
        pet.id,
        { preserveNormalizedSessions: true },
      );
      const invalidated = invalidateDerivedMemoryModifiers(modifiers);
      await tx.pet.update({
        where: { id: pet.id },
        data: {
          personality_modifiers: invalidated.modifiers as any,
          memory_epoch: { increment: 1 },
        },
      });
      return { target: target.count, recallStores, invalidated };
    },
  );
  assert.equal(sessionInvalidation.target, 2);
  assert.equal(sessionInvalidation.recallStores.memoryRows, 2,
    "legacy sessions and non-session derived rows must be purged");
  assert.equal(sessionInvalidation.recallStores.agentMessages, 1);
  assert.equal(sessionInvalidation.recallStores.conversations, 1);
  assert.equal(sessionInvalidation.recallStores.personaRows, 1);
  assert.equal(sessionInvalidation.invalidated.learnedSkillsRemoved, 1);
  assert.equal(await prisma.petMemory.count({
    where: { pet_id: pet.id, session_id: "target-session" },
  }), 0);
  const unrelatedSessions = await prisma.petMemory.findMany({
    where: { pet_id: pet.id },
    select: { session_id: true, content: true },
  });
  assert.deepEqual(unrelatedSessions, [{
    session_id: "unrelated-session",
    content: "[user] provably separate raw session",
  }]);
  const afterSessionDelete = await prisma.pet.findUniqueOrThrow({ where: { id: pet.id } });
  assert.equal(afterSessionDelete.memory_epoch, sessionDeleteEpoch + 1);
  const afterSessionMods = (afterSessionDelete.personality_modifiers as Record<string, unknown>) || {};
  for (const field of ["persistent_memories", "user_profile", "learned_patterns", "bond_reflections"]) {
    assert.deepEqual(afterSessionMods[field], [], `${field} must be invalidated by session deletion`);
  }
  for (const cache of ["thought_of_day", "weekly_diary", "proactive"]) {
    assert.equal(Object.hasOwn(afterSessionMods, cache), false, `${cache} must not survive session deletion`);
  }
  assert.equal(afterSessionMods.consent_public_profile, true);
  assert.equal(afterSessionMods.custom_traits, "Owner-authored trait config");
  assert.deepEqual(afterSessionMods.installed_skills, [{ skillId: "companion-chat" }]);

  console.log("petclaw_memory_races_integration=PASS");
} finally {
  if (petId) {
    await prisma.petMemory.deleteMany({ where: { pet_id: petId } }).catch(() => {});
    await prisma.petAgentMessage.deleteMany({ where: { pet_id: petId } }).catch(() => {});
    await prisma.petConversation.deleteMany({ where: { pet_id: petId } }).catch(() => {});
    await prisma.petPersona.deleteMany({ where: { pet_id: petId } }).catch(() => {});
    await prisma.petInsight.deleteMany({ where: { pet_id: petId } }).catch(() => {});
    await prisma.generation.deleteMany({ where: { pet_id: petId } }).catch(() => {});
    await prisma.pet.delete({ where: { id: petId } }).catch(() => {});
  }
  if (userId) await prisma.user.delete({ where: { id: userId } }).catch(() => {});
  await prisma.$disconnect();
}
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
