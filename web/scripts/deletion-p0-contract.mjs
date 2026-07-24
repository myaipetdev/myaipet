import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFile(resolve(root, path), "utf8");
const [
  schema, migration, fairQueueMigration, sovereignty, lora, mediaRoute, battleRoute,
  generationMediaCore, petGenerateRoute, petPatchRoute, battleSpriteRoute, mockupRoute,
  runLedger, fullDeleteRoute,
] = await Promise.all([
  read("prisma/schema.prisma"),
  read("prisma/migrations/20260717163000_lora_archive_battle_redaction/migration.sql"),
  read("prisma/migrations/20260717166000_media_deletion_fair_queue/migration.sql"),
  read("src/lib/petclaw/data-sovereignty.ts"),
  read("src/lib/services/lora.ts"),
  read("src/app/api/media/[...key]/route.ts"),
  read("src/app/api/battle/[battleId]/route.ts"),
  read("src/lib/services/generation-media-core.ts"),
  read("src/app/api/pets/[petId]/generate/route.ts"),
  read("src/app/api/pets/[petId]/route.ts"),
  read("src/app/api/battle-sprite/route.ts"),
  read("src/app/api/rewards/mockup/route.ts"),
  read("src/lib/petclaw/agent/run-ledger.ts"),
  read("src/app/api/petclaw/delete/route.ts"),
]);

assert.match(schema, /training_archive_ref\s+String\?/);
assert.match(migration, /redact_battle_snapshots_before_pet_delete/);
assert.match(migration, /battle_history_opponent_pet_id_fkey/);
assert.match(sovereignty, /training_archive_ref:\s*true/);
assert.match(sovereignty, /listStoredFileReferencesByPrefix/);
assert.match(sovereignty, /daily_training_logs[\s\S]*FOR UPDATE[\s\S]*FROM "pets"[\s\S]*FOR UPDATE[\s\S]*FROM "generations"[\s\S]*FOR UPDATE/);
assert.match(sovereignty, /prisma\.\$transaction\(async \(tx\)/);
assert.match(sovereignty, /moodPortraitContainsReference/);
assert.doesNotMatch(sovereignty, /jsonContainsAnyReference\(row\.personality_modifiers/);
assert.match(sovereignty, /orderBy:\s*\[\{ updated_at: "asc" \}, \{ id: "asc" \}\]/);
assert.match(sovereignty, /Retained while a live row references this object/);
assert.match(schema, /@@index\(\[updated_at, id\]\)/);
assert.match(fairQueueMigration, /media_deletion_tasks_updated_at_id_idx/);
assert.match(sovereignty, /const deletedAt = new Date\(\)\.toISOString\(\)[\s\S]*deletedAt,[\s\S]*exported_at: new Date\(deletedAt\)/);
assert.match(sovereignty, /opponent_name:\s*"Deleted Pet"[\s\S]*opponent_avatar:\s*null[\s\S]*battle_log:\s*null/);
assert.doesNotMatch(sovereignty, /referral\.(?:delete|deleteMany)/i);
assert.doesNotMatch(sovereignty, /paidAction\.deleteMany/);
assert.match(sovereignty, /paidAction\.updateMany\(\{ where: \{ pet_id: petId \}, data: \{ pet_id: null \} \}\)/);
assert.match(lora, /training_archive_ref:\s*trainingArchiveRef/);
assert.match(lora, /await deleteStoredFile\(trainingArchiveRef\)/);
assert.match(mediaRoute, /training_archive_ref:\s*true/);
assert.doesNotMatch(mediaRoute, /key\.startsWith\(`lora-train\/pet-/);
assert.doesNotMatch(mediaRoute, /personality_modifiers:\s*true/);
assert.match(battleRoute, /opponentRedacted[\s\S]*log:\s*opponentRedacted \? \[\]/);
assert.match(generationMediaCore, /enqueueMediaDeletion[\s\S]*if \(completed\)[\s\S]*enqueueMediaDeletion/);
assert.match(petGenerateRoute, /newlyPersistedRefs\.push\(imageUrl\)/);
assert.match(petGenerateRoute, /cleanupUncommittedGeneratedMedia/);
assert.match(petGenerateRoute, /FROM "pets"[\s\S]*FOR UPDATE[\s\S]*tx\.generation\.create/);
assert.match(petPatchRoute, /FROM "pets"[\s\S]*FOR UPDATE[\s\S]*tx\.pet\.update/);
assert.match(battleSpriteRoute, /saveRemoteFile[\s\S]*prisma\.generation\.create/);
assert.match(mockupRoute, /saveRemoteFile[\s\S]*tx\.generation\.create/);
assert.doesNotMatch(mediaRoute, /battle-sprites\/[\s\S]*startsWith|reward-mockups\/[\s\S]*startsWith/);
assert.match(runLedger, /ORDER BY "id"[\s\S]*FOR UPDATE/);
assert.match(runLedger, /throw new PetAgentRunActiveError\(petId, active\.run_id, active\.state\)/);
assert.doesNotMatch(runLedger, /refundAndDeletePetAgentRunsWithDb/);
assert.match(runLedger, /pet_name:\s*"Deleted Pet"[\s\S]*goal:\s*"\[deleted\]"[\s\S]*answer:\s*""[\s\S]*steps:\s*\[\]/);
assert.match(runLedger, /private_content_scrubbed:\s*true/);
assert.match(schema, /private_content_scrubbed\s+Boolean\s+@default\(false\)/);
assert.match(fullDeleteRoute, /e instanceof PetAgentRunActiveError[\s\S]*code:\s*e\.code[\s\S]*statusUrl[\s\S]*status:\s*409/);

console.log("deletion_p0_contract=PASS");
