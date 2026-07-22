import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");

const schema = read("prisma/schema.prisma");
for (const column of ["session_id", "platform", "speaker_id", "role"]) {
  assert.match(schema, new RegExp(`\\b${column}\\s+String\\?`), `${column} must remain nullable for legacy rows`);
}

const migration = read("prisma/migrations/20260722010000_normalize_pet_memory_sessions/migration.sql");
for (const column of ["session_id", "platform", "speaker_id", "role"]) {
  assert.match(migration, new RegExp(`ADD COLUMN "${column}"`), `migration must add ${column}`);
}
assert.match(migration, /Expand-only production migration/);
assert.doesNotMatch(migration, /^\s*UPDATE\s+"pet_memories"/mi, "release migration must not backfill the live table");
assert.doesNotMatch(migration, /^\s*CREATE\s+(?:UNIQUE\s+)?INDEX\b/mi, "release migration must not build an index inline");
assert.doesNotMatch(
  schema,
  /@@index\(\[pet_id,\s*platform,\s*session_id,/,
  "compound session index must remain deferred until the measured concurrent-index rollout",
);
const epochMigration = read("prisma/migrations/20260722020000_memory_deletion_epoch/migration.sql");
assert.match(schema, /\bmemory_epoch\s+Int\s+@default\(0\)/);
assert.match(epochMigration, /ADD COLUMN "memory_epoch"/);

const memory = read("src/lib/petclaw/memory/persistent-memory.ts");
const invalidation = read("src/lib/petclaw/memory/invalidation.ts");
assert.match(memory, /userProfile\.push\(\{\s*\.\.\.namespacedEntry,/s, "new profile entries must persist the speaker namespace");
assert.match(memory, /session_id: normalizedSessionId/);
assert.match(memory, /platform: normalizedPlatform/);
assert.match(memory, /speaker_id: normalizedSpeakerId/);
assert.match(memory, /if \(normalizedSessionId\) filters\.push\(\{ session_id: normalizedSessionId \}\)/);
assert.match(memory, /pet\.memory_epoch !== startEpoch/, "in-flight retention must fail closed after deletion");
assert.match(memory, /expectedEpoch \?\? await readPetMemoryEpoch/, "callers must be able to pass a request-start fence");
assert.match(memory, /consolidateMemory\(this\.petId, false, startEpoch\)/, "async consolidation must inherit the request fence");
assert.match(memory, /memory_epoch: \{ increment: 1 \}/, "clearMemory must advance the deletion epoch");
assert.match(memory, /redactUnprovenancedRecallStores\(tx, this\.petId/,
  "clearMemory must purge recall stores through the shared invalidation primitive");
assert.match(memory, /selectRetainedContext\(memories, userProfile, userMessage\)/);
assert.match(memory, /const recentMessages = requestedSession\s*\?/);
assert.match(memory, /RECENT_CONTEXT_LIMIT = 6/);
assert.match(memory, /message\.platform === requestedPlatform/);
assert.match(memory, /message\.sessionId === requestedSession/);
assert.match(memory, /&& isProviderSafeRetainedText\(message\.content\)/);
assert.doesNotMatch(
  memory,
  /formatMemoryMd\(englishMemories\)|formatUserMd\(englishUserProfile\)/,
  "provider context must not format the complete retained ledgers",
);
assert.doesNotMatch(
  memory,
  /prompt \+= context\.relevantMemories\.map/,
  "buildSystemPrompt must not append selected memories twice",
);
for (const model of ["petMemory", "petAgentMessage", "petConversation", "petPersona"]) {
  assert.match(invalidation, new RegExp(`tx\\.${model}\\.deleteMany`), `memory invalidation must clear ${model}`);
}
for (const state of ["persistent_memories", "user_profile", "learned_patterns", "bond_reflections"]) {
  assert.match(invalidation, new RegExp(`${state}: \\[\\]`), `memory invalidation must reset ${state}`);
}

assert.match(invalidation, /tx\.petMemory\.deleteMany\(\{\s*where:\s*\{\s*pet_id:\s*petId,/s,
  "targeted correction must purge every unprovenanced PetMemory type");
for (const model of ["petAgentMessage", "petConversation", "petPersona"]) {
  assert.match(
    invalidation,
    new RegExp(`tx\\.${model}\\.deleteMany`),
    `targeted correction must purge ${model}`,
  );
}
for (const cache of ["thought_of_day", "weekly_diary", "proactive"]) {
  assert.match(invalidation, new RegExp(`delete modifiers\\.${cache}`), `${cache} must be invalidated`);
}
assert.match(invalidation, /isLearned === true/, "only auto-learned skills may be removed with memory");
assert.match(invalidation, /tx\.petInsight\.updateMany\(/,
  "targeted invalidation must tombstone derived insights without dropping their privacy links");
assert.match(invalidation, /source_kind: "memory_daydream"/,
  "targeted invalidation must fail active daydream generations");
assert.match(memory, /invalidateDerivedMemoryModifiers\(mods\)/,
  "clearMemory must use the same cache/derived-state invalidation contract as targeted edits");

const modifierStore = read("src/lib/petclaw/modifier-store.ts");
assert.match(modifierStore, /pg_advisory_xact_lock\(\$\{PET_MODIFIER_LOCK_NAMESPACE\}, \$\{petId\}\)/);

const longRunningWriters = [
  ["consolidation", read("src/lib/petclaw/memory/consolidate.ts")],
  ["bond reflection", read("src/lib/petclaw/memory/bond-loop.ts")],
  ["self learning", read("src/lib/petclaw/memory/self-learning.ts")],
];
for (const [name, source] of longRunningWriters) {
  assert.match(source, /withLockedPetModifiers\(/, `${name} must use the shared modifier lock`);
  assert.match(source, /memory_epoch !== startEpoch/, `${name} must discard pre-mutation work`);
  assert.match(source, /personality_modifiers:\s*\{\s*\.\.\.modifiers,/s, `${name} must merge into current modifiers`);
  assert.doesNotMatch(source, /await prisma\.pet\.update\(/, `${name} must not write a stale whole modifier document`);
}
assert.match(longRunningWriters[0][1], /sourceLedgerSnapshot/, "consolidation must reject a concurrently changed ledger");
assert.match(longRunningWriters[0][1], /expectedEpoch \?\? pet\.memory_epoch/);
assert.match(longRunningWriters[1][1], /expectedEpoch \?\? pet\.memory_epoch/);
assert.match(longRunningWriters[2][1], /expectedEpoch \?\? initialPet\.memory_epoch/);

const memoryRoute = read("src/app/api/petclaw/memory/route.ts");
assert.match(memoryRoute, /async function deleteSessionRows/);
assert.match(memoryRoute, /withLockedPetModifiers\(petId/);
assert.doesNotMatch(memoryRoute, /await prisma\.pet\.update\(/, "partial mutations must use the shared modifier lock");
assert.ok(
  (memoryRoute.match(/memory_epoch:\s*\{\s*increment:\s*1\s*\}/g) || []).length >= 2,
  "partial array and session mutations must both advance the memory epoch",
);
assert.match(memoryRoute, /redactUnprovenancedRecallStores\(tx, petId\)/);
assert.match(memoryRoute, /invalidateDerivedMemoryModifiers\(modifiers, \{ \[field\]: next \}\)/);
assert.match(memoryRoute, /preserveNormalizedSessions: true/,
  "session deletion must preserve other normalized raw sessions while purging derived stores");
assert.match(memoryRoute, /sourceRowsRedacted/);
assert.match(memoryRoute, /clearedDerivedStores/);
assert.match(memoryRoute, /preservedOtherNormalizedSessions/);

const sovereigntyDashboard = read("src/components/SovereigntyDashboard.tsx");
for (const disclosure of [
  "every unprovenanced memory row, agent message, conversation and persona record",
  "clears retained/profile/learned/bond plus thought, diary and proactive caches",
  "removes auto-learned skills",
  "revokes derived insights or in-flight daydream work",
  "Other normalized sessions were preserved",
]) {
  assert.match(
    sovereigntyDashboard,
    new RegExp(disclosure.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    `destructive memory reset UI must disclose: ${disclosure}`,
  );
}

const chatRoute = read("src/app/api/pets/[petId]/chat/route.ts");
assert.match(chatRoute, /const requestMemoryEpoch = pet\.memory_epoch/);
assert.match(chatRoute, /const interactionCommitted = await withLockedPetModifiers/);
assert.match(chatRoute, /lockedPet\.memory_epoch !== requestMemoryEpoch/);
assert.match(chatRoute, /errorCode: "memory_state_changed"/);
for (const writerCall of [
  /retainFromConversation\([\s\S]*?requestMemoryEpoch,\s*\)/,
  /observeConversation\([\s\S]*?requestMemoryEpoch\)/,
  /maybeReflectOnBond\([\s\S]*?requestMemoryEpoch\)/,
  /logTurnOnly\([\s\S]*?requestMemoryEpoch\)/,
]) {
  assert.match(chatRoute, writerCall, "every post-inference memory writer must inherit the request epoch");
}
assert.doesNotMatch(
  chatRoute,
  /memory_type:\s*["']conversation["']/,
  "chat must not bypass the fenced session ledger with a duplicate conversation row",
);

const auth = read("src/lib/auth.ts");
const extensionScope = auth.match(/function extensionTokenCanAccess[\s\S]*?\n}\n/)?.[0] || "";
assert.ok(extensionScope, "extension token scope function must exist");
assert.doesNotMatch(extensionScope, /\/api\/petclaw\/(?:export|import)/, "extension tokens must not access SOUL transfer routes");

const recallConnector = read("src/lib/petclaw/connectors/memory-enhanced.ts");
assert.match(recallConnector, /buildMemorySearchPayload\(context, query, limit\)/);
assert.match(recallConnector, /context\.relevantMemories\.slice/);
assert.match(recallConnector, /context\.relevantUserProfile\.slice/);
assert.doesNotMatch(
  recallConnector,
  /recentMessages:\s*context|memoryMd:\s*context|userMd:\s*context/,
  "recall search must return selected rows, not formatted ledgers or raw turns",
);

console.log("PetClaw memory/session integrity contract passed");
