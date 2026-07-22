import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const webRoot = fileURLToPath(new URL("../", import.meta.url));
const read = (path) => readFileSync(`${webRoot}${path}`, "utf8");

const daydream = read("src/lib/petclaw/memory/daydream.ts");
const ownerRoute = read("src/app/api/pets/[petId]/daydream/route.ts");
const cronRoute = read("src/app/api/cron/daydream/route.ts");
const memory = read("src/lib/petclaw/memory/persistent-memory.ts");
const invalidation = read("src/lib/petclaw/memory/invalidation.ts");
const integration = read("scripts/petclaw-memory-races.integration.ts");

const daydreamStart = daydream.indexOf("export async function daydream(");
const persistStart = daydream.indexOf("export async function persistDaydreamInsights(");
assert.ok(daydreamStart >= 0 && persistStart > daydreamStart);
const inferenceBlock = daydream.slice(daydreamStart, persistStart);
const preProviderGuard = inferenceBlock.indexOf("pet.memory_epoch !== expectedMemoryEpoch");
const providerCall = inferenceBlock.indexOf("callPetText(petId");
assert.ok(preProviderGuard >= 0, "daydream must compare its captured memory epoch");
assert.ok(providerCall > preProviderGuard, "stale retained context must be rejected before provider inference");

const persistBlock = daydream.slice(persistStart);
assert.match(persistBlock, /withLockedPetModifiers\(petId/);
const persistGuard = persistBlock.indexOf("pet.memory_epoch !== expectedMemoryEpoch");
const insightWrite = persistBlock.indexOf("tx.petInsight.createMany");
assert.ok(persistGuard >= 0 && insightWrite > persistGuard,
  "the locked epoch guard must run before inserting any insight");
assert.match(persistBlock, /return \{ created: 0, discarded: true \}/);

assert.match(ownerRoute, /expectedMemoryEpoch = auth\.pet\.memory_epoch/);
assert.match(ownerRoute, /daydream\(id, expectedMemoryEpoch\)/);
assert.match(ownerRoute, /persistDaydreamInsights\([\s\S]*?expectedMemoryEpoch/);
assert.match(ownerRoute, /code: "daydream_stale"[\s\S]*?created: 0[\s\S]*?discarded: true[\s\S]*?status: 409/);
assert.match(ownerRoute, /mood: \{ not: "deleted" \}/);
assert.doesNotMatch(ownerRoute, /prisma\.petInsight\.createMany/,
  "the owner route must not bypass the shared persistence fence");

assert.match(cronRoute, /select: \{ id: true, memory_epoch: true \}/);
assert.match(cronRoute, /daydream\(p\.id, p\.memory_epoch\)/);
assert.match(cronRoute, /persistDaydreamInsights\([\s\S]*?p\.memory_epoch/);
assert.match(cronRoute, /persisted\.discarded/);
assert.doesNotMatch(cronRoute, /prisma\.petInsight\.createMany/,
  "cron must not bypass the shared persistence fence");

assert.doesNotMatch(invalidation, /tx\.petInsight\.deleteMany/,
  "clear must retain insight row identity for in-flight privacy linkage");
assert.match(invalidation, /const insightsSanitized = await tx\.petInsight\.updateMany\([\s\S]*?where: \{ pet_id: petId \}/);
for (const erasedField of [
  /insight: "Memory insight deleted by owner\."/,
  /rationale: null/,
  /mood: "deleted"/,
  /score: 0/,
  /source_keys: \[\]/,
  /conversion_status: "revoked"/,
]) {
  assert.match(invalidation, erasedField, "linked insight tombstones must not retain private inferred content");
}
assert.match(memory, /memory_epoch: \{ increment: 1 \}/);
assert.match(invalidation, /source_kind: "memory_daydream"[\s\S]*?status: \{ in: \["reserved", "pending", "processing", "persisting"\] \}/);
assert.match(invalidation, /visibility: "private",[\s\S]*?prompt: null/,
  "revoked active daydream work must not retain a provider prompt derived from deleted memory");

assert.match(integration, /persistDaydreamInsights\(pet\.id, beforeEpoch/);
assert.match(integration, /pre-clear daydream inference must be discarded/);
assert.match(integration, /linkedTombstone\.insight/);
assert.match(integration, /unlinkedTombstone\.conversion_status, "revoked"/);

console.log("daydream_deletion_fence_contract=PASS");
