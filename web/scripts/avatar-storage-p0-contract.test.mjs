import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const [
  uploadRoute,
  avatarRoute,
  avatarMedia,
  quota,
  storage,
  ownership,
  petsRoute,
  petPatchRoute,
  deletionWorker,
  catchRoute,
  migration,
  llmRouter,
  petAvatarGuard,
  videoService,
  petGenerateRoute,
  catchVision,
  envChecklist,
  releaseSmoke,
  cronExample,
] = await Promise.all([
  read("../src/app/api/upload/route.ts"),
  read("../src/app/api/pets/avatar/route.ts"),
  read("../src/lib/avatarMedia.ts"),
  read("../src/lib/avatarUploadQuota.ts"),
  read("../src/lib/storage.ts"),
  read("../src/lib/mediaOwnership.ts"),
  read("../src/app/api/pets/route.ts"),
  read("../src/app/api/pets/[petId]/route.ts"),
  read("../src/lib/petclaw/data-sovereignty.ts"),
  read("../src/app/api/catch/route.ts"),
  read("../prisma/migrations/20260718000000_avatar_media_lifecycle/migration.sql"),
  read("../src/lib/llm/router.ts"),
  read("../src/lib/services/petAvatarGuard.ts"),
  read("../src/lib/services/video.ts"),
  read("../src/app/api/pets/[petId]/generate/route.ts"),
  read("../src/lib/catch/vision.ts"),
  read("../../deploy/ENV-CHECKLIST.md"),
  read("../../deploy/release-smoke.sh"),
  read("../../deploy/crontab.example"),
]);

assert.match(uploadRoute, /await consumeAvatarUploadQuota\(user\.id\)/);
assert.ok(
  uploadRoute.indexOf("await consumeAvatarUploadQuota(user.id)")
    < uploadRoute.indexOf("check = await isPetPhoto"),
  "durable upload quota must be reserved before paid vision validation",
);
assert.match(uploadRoute, /newAvatarFilename\(user\.id, ext\)/);
assert.match(uploadRoute, /await persistPendingAvatarMedia/);
assert.match(uploadRoute, /consumeVisionBudget\(authenticatedUserId\)/);
assert.doesNotMatch(uploadRoute, /avatars\/\$\{user\.id\}\/\$\{Date\.now\(\)\}/);

assert.match(quota, /ON CONFLICT \("usage_date", "scope_key"\) DO UPDATE/);
assert.match(quota, /avatar-upload:global/);
assert.match(quota, /avatar-upload:user:\$\{userId\}/);
assert.match(quota, /throw new AvatarUploadQuotaStoreError\(\)/);

assert.match(avatarMedia, /INSERT INTO "avatar_media_objects"/);
assert.ok(
  avatarMedia.indexOf('INSERT INTO "avatar_media_objects"')
    < avatarMedia.indexOf("await uploadFile(filename, data, contentType)"),
  "ownership row must commit before the authoritative storage write",
);
assert.match(avatarMedia, /FOR UPDATE/);
assert.match(avatarMedia, /FOR UPDATE SKIP LOCKED/);
assert.match(avatarMedia, /INSERT INTO "media_deletion_tasks"/);
assert.match(avatarMedia, /await enqueueFailedPendingAvatarMedia\(id, objectRef, ownerUserId\)/);
assert.doesNotMatch(
  avatarMedia,
  /catch \(error\) \{[\s\S]{0,800}DELETE FROM "avatar_media_objects"[\s\S]{0,300}throw error/,
  "ambiguous storage failures must not discard ownership without an outbox tombstone",
);
assert.match(avatarRoute, /persistRemoteAvatarPreview\(providerUrl, user\.id\)/);

assert.match(ownership, /claimRegisteredAvatarMedia\(tx, userId, petId, value\)/);
assert.match(petsRoute, /claimOrVerifyApplicationMediaForPet\(tx, user\.id, created\.id, avatar_url\)/);
assert.match(petPatchRoute, /claimOrVerifyApplicationMediaForPet\(tx, user\.id, pet\.id, value\)/);
assert.match(petPatchRoute, /releaseClaimedAvatarMedia\(tx, user\.id, pet\.id, oldValue\)/);
assert.match(deletionWorker, /enqueueExpiredAvatarMediaObjects\(options\.limit \|\| 100\)/);

assert.match(storage, /statfs\(parent, \{ bigint: true \}\)/);
assert.match(storage, /availableBytes - BigInt\(incomingBytes\) >= BigInt\(floorBytes\)/);
assert.doesNotMatch(storage, /\b\d+n\b/, "pre-ES2020 TypeScript target must not contain bigint literals");

assert.match(catchRoute, /randomUUID\(\)/);
assert.match(catchRoute, /await enqueueMediaDeletionReference\(photoPath/);
assert.match(catchRoute, /await deleteStoredFile\(photoPath\)/);
assert.match(catchRoute, /consumeVisionBudget\(user\.id\)/);

assert.match(llmRouter, /vision:user:\$\{authenticatedUserId\}/);
assert.match(llmRouter, /envCap\("VISION_DAILY_CAP", 300\)/);
assert.match(llmRouter, /envCap\("VISION_USER_DAILY_CAP", 30\)/);
assert.match(petAvatarGuard, /consumeVisionBudget\(authenticatedUserId\)/);
assert.match(petAvatarGuard, /avatar human-check failed, failing closed:/);
assert.match(petAvatarGuard, /return true;/);
assert.doesNotMatch(petAvatarGuard, /failing open|return false; \/\/ fail open/);
assert.match(videoService, /consumeVisionBudget\(authenticatedUserId\)/);
assert.match(petsRoute, /isHumanAvatar\(avatar_url, user\.id\)/);
assert.match(petsRoute, /describePetAvatar\(avatar_url, user\.id\)/);
assert.match(petPatchRoute, /isHumanAvatar\(safeAvatar, user\.id\)/);
assert.match(petGenerateRoute, /describePetAvatar\(pet\.avatar_url, user\.id\)/);
assert.ok(
  catchVision.indexOf("await reserveAttempt()") < catchVision.indexOf('await fetch("https://api.x.ai'),
  "each catch model fallback must reserve its own durable vision budget",
);

assert.match(migration, /CREATE TABLE "avatar_media_objects"/);
assert.match(migration, /CREATE UNIQUE INDEX "avatar_media_objects_object_ref_key"/);
assert.match(migration, /avatar_media_objects_claim_state_check/);
assert.match(migration, /avatar_media_objects_owner_path_check/);
assert.match(migration, /FOREIGN KEY \("owner_user_id"\) REFERENCES "users"/);
assert.match(migration, /FOREIGN KEY \("pet_id"\) REFERENCES "pets"/);
assert.match(migration, /CREATE TRIGGER "avatar_media_pet_owner_guard"/);

for (const [name, value] of [
  ["AVATAR_UPLOAD_USER_DAILY_CAP", "20"],
  ["AVATAR_UPLOAD_GLOBAL_DAILY_CAP", "1000"],
  ["AVATAR_PREVIEW_TTL_HOURS", "24"],
  ["LOCAL_STORAGE_MIN_FREE_BYTES", "2147483648"],
  ["VISION_DAILY_CAP", "300"],
  ["VISION_USER_DAILY_CAP", "30"],
]) {
  assert.ok(envChecklist.includes(`${name}=${value}`), `${name} launch value missing from checklist`);
  assert.ok(releaseSmoke.includes(`expect_env_exact ${name} ${value}`), `${name} missing from release smoke`);
  assert.ok(cronExample.includes(`${name}`), `${name} missing from cron drift check`);
}

console.log("PASS avatar storage P0 source/migration contract");
