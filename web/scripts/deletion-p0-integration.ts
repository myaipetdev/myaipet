import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function withTimeout<T>(promise: Promise<T>, label: string, ms = 8_000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`${label} timed out`)), ms)),
  ]);
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL || "";
  const databaseName = (() => {
    try { return new URL(databaseUrl).pathname.slice(1); } catch { return ""; }
  })();
  if (!databaseName.includes("deletion_p0_test")) {
    throw new Error("Refusing to run deletion integration test outside a deletion_p0_test database");
  }

  const uploadRoot = await mkdtemp(join(tmpdir(), "petclaw-deletion-p0-"));
  process.env.STORAGE_PROVIDER = "local";
  process.env.LOCAL_UPLOAD_DIR = uploadRoot;
  process.env.LOCAL_UPLOAD_URL = "/uploads";

  const { prisma } = await import("../src/lib/prisma");
  const { deletePetData, processMediaDeletionTasks } = await import("../src/lib/petclaw/data-sovereignty");
  const { enqueueMediaDeletionReference } = await import("../src/lib/mediaDeletion");
  const { userCanAssignApplicationMedia, userOwnsApplicationMedia } = await import("../src/lib/mediaOwnership");
  const { persistGenerationMediaWithLease } = await import("../src/lib/services/generation-media-core");
  const { PETCLAW_PROTOCOL } = await import("../src/lib/petclaw/petclaw");
  const { deleteStoredFile, storedFileExists, uploadFile } = await import("../src/lib/storage");

  let sharedArchiveRef = "";
  try {
    const owner = await prisma.user.create({
      data: { wallet_address: "0x1111111111111111111111111111111111111111", nonce: "owner-nonce" },
    });
    const survivor = await prisma.user.create({
      data: { wallet_address: "0x2222222222222222222222222222222222222222", nonce: "survivor-nonce" },
    });
    const deletedPet = await prisma.pet.create({
      data: { user_id: owner.id, name: "Private Rival", species: 0 },
    });
    const playerPet = await prisma.pet.create({
      data: { user_id: survivor.id, name: "Replay Owner", species: 1 },
    });

    const sharedArchive = await uploadFile(
      `lora-train/pet-${deletedPet.id}-1000.zip`,
      Buffer.from("known archive"),
      "application/zip",
    );
    const legacyArchive = await uploadFile(
      `lora-train/pet-${deletedPet.id}-2000.zip`,
      Buffer.from("legacy orphan archive"),
      "application/zip",
    );
    sharedArchiveRef = sharedArchive.url;

    await prisma.petLora.create({
      data: {
        pet_id: deletedPet.id,
        status: "training",
        trigger_word: "deletedpet",
        training_archive_ref: sharedArchive.url,
        images_used: [],
      },
    });
    // Defensive shared-reference case: outbox cleanup must retain the object
    // until the final live row releases it.
    await prisma.petLora.create({
      data: {
        pet_id: playerPet.id,
        status: "training",
        trigger_word: "survivorpet",
        training_archive_ref: sharedArchive.url,
        images_used: [],
      },
    });
    const battle = await prisma.battleHistory.create({
      data: {
        player_pet_id: playerPet.id,
        opponent_pet_id: deletedPet.id,
        opponent_name: deletedPet.name,
        opponent_avatar: "/uploads/avatars/private-rival.jpg",
        battle_log: [{ actor: deletedPet.name, text: "Private Rival attacks" }],
        seed: `${playerPet.id}-${deletedPet.id}-private-seed`,
        won: true,
        turns: 2,
        battle_type: "pvp",
      },
    });
    const paidReceipt = await prisma.paidAction.create({
      data: {
        user_id: owner.id,
        pet_id: deletedPet.id,
        action_key: "feed_extra",
        amount_usd: 0.1,
        tx_hash: `0x${"de".repeat(32)}`,
      },
    });

    const result = await deletePetData(deletedPet.id, owner.id);
    const expectedDeletionHash = createHash("sha256").update(JSON.stringify({
      petId: deletedPet.id,
      petName: deletedPet.name,
      userId: owner.id,
      deletedAt: result.deletedAt,
      protocol: PETCLAW_PROTOCOL,
    })).digest("hex");
    assert.equal(result.deletionHash, expectedDeletionHash, "response timestamp must reproduce the durable deletion hash");
    assert.equal(await prisma.pet.findUnique({ where: { id: deletedPet.id } }), null);
    assert.ok(await prisma.pet.findUnique({ where: { id: playerPet.id } }));

    const redacted = await prisma.battleHistory.findUnique({ where: { id: battle.id } });
    assert.ok(redacted, "other user's battle row must survive");
    assert.equal(redacted.opponent_pet_id, null);
    assert.equal(redacted.opponent_name, "Deleted Pet");
    assert.equal(redacted.opponent_avatar, null);
    assert.equal(redacted.battle_log, null);
    assert.equal(redacted.seed, null);

    const retainedReceipt = await prisma.paidAction.findUnique({ where: { id: paidReceipt.id } });
    assert.ok(retainedReceipt, "financial receipt must survive pet deletion");
    assert.equal(retainedReceipt.pet_id, null, "financial receipt must detach the deleted pet");
    assert.equal(retainedReceipt.tx_hash, paidReceipt.tx_hash, "receipt audit hash must remain intact");
    assert.equal(await storedFileExists(legacyArchive.url), false, "legacy archive must be physically cleaned");
    assert.equal(await storedFileExists(sharedArchive.url), true, "live shared reference must be retained");
    const retainedTask = await prisma.mediaDeletionTask.findUnique({
      where: { object_ref: sharedArchive.url },
    });
    assert.ok(retainedTask, "known training archive must be durably queued in the deletion outbox");
    assert.ok(result.mediaCleanup.processed >= 2 && result.mediaCleanup.retained >= 1);

    // The DB trigger closes create/delete races even when a caller deletes the
    // Pet row without going through deletePetData.
    const triggerVictim = await prisma.pet.create({
      data: { user_id: owner.id, name: "Trigger Private", species: 0 },
    });
    const triggerBattle = await prisma.battleHistory.create({
      data: {
        player_pet_id: playerPet.id,
        opponent_pet_id: triggerVictim.id,
        opponent_name: triggerVictim.name,
        opponent_avatar: "/uploads/avatars/trigger-private.jpg",
        battle_log: [{ actor: triggerVictim.name }],
        seed: "trigger-private-seed",
        won: true,
        turns: 1,
        battle_type: "pvp",
      },
    });
    await prisma.pet.delete({ where: { id: triggerVictim.id } });
    const triggerRedacted = await prisma.battleHistory.findUnique({ where: { id: triggerBattle.id } });
    assert.equal(triggerRedacted?.opponent_name, "Deleted Pet");
    assert.equal(triggerRedacted?.opponent_avatar, null);
    assert.equal(triggerRedacted?.battle_log, null);
    assert.equal(triggerRedacted?.seed, null);

    // PATCH-vs-delete: a committed avatar update must be observed by the locked
    // deletion snapshot and leave no storage orphan.
    const patchVictim = await prisma.pet.create({
      data: { user_id: owner.id, name: "Patch Race", species: 0 },
    });
    const patchAvatar = await uploadFile(
      `avatars/${owner.id}/${Date.now()}.jpg`,
      Buffer.from("patch race avatar"),
      "image/jpeg",
    );
    const patchLocked = deferred();
    const releasePatch = deferred();
    const patchTx = prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "pets" WHERE "id" = ${patchVictim.id} FOR UPDATE`;
      await tx.pet.update({ where: { id: patchVictim.id }, data: { avatar_url: patchAvatar.url } });
      patchLocked.resolve();
      await releasePatch.promise;
    }, { timeout: 20_000 });
    await patchLocked.promise;
    const patchDelete = deletePetData(patchVictim.id, owner.id);
    await delay(40);
    releasePatch.resolve();
    await patchTx;
    await withTimeout(patchDelete, "PATCH/delete serialization");
    assert.equal(await storedFileExists(patchAvatar.url), false, "committed concurrent avatar must be cleaned");

    const generatedAvatarPreview = await uploadFile(
      `avatars/${owner.id}/${Date.now()}-a1b2c3d4e5f6.png`,
      Buffer.from("generated avatar preview"),
      "image/png",
    );
    assert.equal(await userOwnsApplicationMedia(owner.id, generatedAvatarPreview.url), true,
      "generated <timestamp>-<12hex> avatar must be recognized as an exact fresh owner upload");
    assert.equal(await userCanAssignApplicationMedia(owner.id, generatedAvatarPreview.url), true,
      "generated avatar preview must remain assignable before a tombstone exists");
    await deleteStoredFile(generatedAvatarPreview.url);

    const moodDeleteVictim = await prisma.pet.create({
      data: { user_id: owner.id, name: "Mood Delete", species: 0 },
    });
    const freshMoodMedia = await uploadFile(
      `avatars/${owner.id}/${Date.now()}-0a1b2c3d4e5f.jpg`,
      Buffer.from("fresh mood-only media"),
      "image/jpeg",
    );
    await prisma.pet.update({
      where: { id: moodDeleteVictim.id },
      data: { personality_modifiers: { mood_portraits: { happy: freshMoodMedia.url } } },
    });
    await deletePetData(moodDeleteVictim.id, owner.id);
    assert.equal(await storedFileExists(freshMoodMedia.url), false,
      "allowed mood portrait refs in the locked Pet snapshot must be cleaned on deletion");

    // Finalize-vs-delete: completion holds the Generation row while deletion
    // holds Pet. Once completion commits, deletion must re-read the locked row's
    // current media path and enqueue those bytes before deleting the row.
    const finalizeVictim = await prisma.pet.create({
      data: { user_id: owner.id, name: "Finalize Race", species: 0 },
    });
    const finalizeGeneration = await prisma.generation.create({
      data: {
        user_id: owner.id,
        pet_id: finalizeVictim.id,
        pet_type: 0,
        style: 0,
        duration: 0,
        photo_path: "",
        status: "persisting",
        visibility: "private",
        credits_charged: 0,
      },
    });
    const finalizedMedia = await uploadFile(
      `generations/finalize-race-${finalizeGeneration.id}.jpg`,
      Buffer.from("finalized generation"),
      "image/jpeg",
    );
    const generationLocked = deferred();
    const releaseGeneration = deferred();
    const finalizeTx = prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "generations" WHERE "id" = ${finalizeGeneration.id} FOR UPDATE`;
      await tx.generation.update({
        where: { id: finalizeGeneration.id },
        data: { photo_path: finalizedMedia.url, status: "completed", completed_at: new Date() },
      });
      generationLocked.resolve();
      await releaseGeneration.promise;
    }, { timeout: 20_000 });
    await generationLocked.promise;
    const finalizeDelete = deletePetData(finalizeVictim.id, owner.id);
    await delay(40);
    releaseGeneration.resolve();
    await finalizeTx;
    await withTimeout(finalizeDelete, "Generation finalize/delete serialization");
    assert.equal(await storedFileExists(finalizedMedia.url), false, "finalize race must leave zero media orphan");

    // Create-vs-delete: the Generation FK's parent key-share lock either commits
    // before Pet deletion (and is included) or fails after deletion. This case
    // holds the create transaction open to prove the former branch.
    const createVictim = await prisma.pet.create({
      data: { user_id: owner.id, name: "Create Race", species: 0 },
    });
    const createdMedia = await uploadFile(
      `generations/create-race-${createVictim.id}.jpg`,
      Buffer.from("created generation"),
      "image/jpeg",
    );
    const creationReady = deferred();
    const releaseCreation = deferred();
    const createTx = prisma.$transaction(async (tx) => {
      await tx.generation.create({
        data: {
          user_id: owner.id,
          pet_id: createVictim.id,
          pet_type: 0,
          style: 0,
          duration: 0,
          photo_path: createdMedia.url,
          status: "completed",
          visibility: "private",
          credits_charged: 0,
          completed_at: new Date(),
        },
      });
      creationReady.resolve();
      await releaseCreation.promise;
    }, { timeout: 20_000 });
    await creationReady.promise;
    const createDelete = deletePetData(createVictim.id, owner.id);
    await delay(40);
    releaseCreation.resolve();
    await createTx;
    await withTimeout(createDelete, "Generation create/delete serialization");
    assert.equal(await storedFileExists(createdMedia.url), false, "create race must leave zero media orphan");

    // Arena and deletion both lock daily rows before Pet. Holding the daily row
    // demonstrates forward progress instead of the old pet<->daily deadlock.
    const arenaVictim = await prisma.pet.create({
      data: { user_id: owner.id, name: "Arena Lock Order", species: 0 },
    });
    const arenaDate = new Date("2026-07-17T00:00:00.000Z");
    await prisma.dailyTrainingLog.create({
      data: { user_id: owner.id, pet_id: arenaVictim.id, date: arenaDate },
    });
    const dailyLocked = deferred();
    const releaseDaily = deferred();
    const arenaTx = prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT "id" FROM "daily_training_logs"
        WHERE "user_id" = ${owner.id} AND "pet_id" = ${arenaVictim.id} AND "date" = ${arenaDate}
        FOR UPDATE
      `;
      dailyLocked.resolve();
      await releaseDaily.promise;
      await tx.$queryRaw`SELECT "id" FROM "pets" WHERE "id" = ${arenaVictim.id} FOR UPDATE`;
    }, { timeout: 20_000 });
    await dailyLocked.promise;
    const arenaDelete = deletePetData(arenaVictim.id, owner.id);
    await delay(40);
    releaseDaily.resolve();
    await arenaTx;
    await withTimeout(arenaDelete, "Arena/delete lock order");

    // Arbitrary personality JSON is not a media owner. Only a valid expression
    // key under mood_portraits may retain an object.
    const modifierPet = await prisma.pet.create({
      data: { user_id: owner.id, name: "Modifier Scope", species: 0 },
    });
    const arbitraryModifierMedia = await uploadFile(
      `generations/arbitrary-modifier-${modifierPet.id}.jpg`,
      Buffer.from("not actually media ownership"),
      "image/jpeg",
    );
    await prisma.pet.update({
      where: { id: modifierPet.id },
      data: { personality_modifiers: { unrelated_note: arbitraryModifierMedia.url } },
    });
    await enqueueMediaDeletionReference(arbitraryModifierMedia.url, { sourcePetId: 900001 });
    const arbitraryCleanup = await processMediaDeletionTasks({ sourcePetId: 900001, limit: 1 });
    assert.equal(arbitraryCleanup.deleted, 1, "unrelated personality strings must not retain media");
    assert.equal(await storedFileExists(arbitraryModifierMedia.url), false);

    const moodMedia = await uploadFile(
      `generations/mood-modifier-${modifierPet.id}.jpg`,
      Buffer.from("valid mood portrait"),
      "image/jpeg",
    );
    await prisma.pet.update({
      where: { id: modifierPet.id },
      data: { personality_modifiers: { mood_portraits: { happy: moodMedia.url, attacker_key: "/uploads/ignore.jpg" } } },
    });
    await enqueueMediaDeletionReference(moodMedia.url, { sourcePetId: 900002 });
    const moodCleanup = await processMediaDeletionTasks({ sourcePetId: 900002, limit: 1 });
    assert.equal(moodCleanup.retained, 1, "valid mood portrait subtree must retain its live object");
    assert.equal(await storedFileExists(moodMedia.url), true);

    const trackedOwnerAsset = await uploadFile(
      `battle-sprites/${owner.id}/tracked-owner.jpg`,
      Buffer.from("tracked owner asset"),
      "image/jpeg",
    );
    await prisma.generation.create({
      data: {
        user_id: owner.id,
        pet_id: null,
        pet_type: 0,
        style: 0,
        duration: 0,
        photo_path: trackedOwnerAsset.url,
        status: "completed",
        visibility: "private",
        credits_charged: 0,
        completed_at: new Date(),
      },
    });
    assert.equal(await userOwnsApplicationMedia(owner.id, trackedOwnerAsset.url), true,
      "Generation tracking must make sprite/mockup media owner-readable without prefix grants");
    await enqueueMediaDeletionReference(trackedOwnerAsset.url, { sourcePetId: 900005 });
    const trackedRetention = await processMediaDeletionTasks({ sourcePetId: 900005, limit: 1 });
    assert.equal(trackedRetention.retained, 1, "tracked owner asset must be retained while its Generation lives");

    // Fair reservation: retained head tasks move to updated_at=now, allowing a
    // later deletable object to reach the front on the next bounded drain.
    const fairA = "/uploads/generations/fair-retained-a.jpg";
    const fairB = "/uploads/generations/fair-retained-b.jpg";
    await prisma.generation.createMany({
      data: [fairA, fairB].map((photoPath) => ({
        user_id: owner.id,
        pet_id: modifierPet.id,
        pet_type: 0,
        style: 0,
        duration: 0,
        photo_path: photoPath,
        status: "completed",
        visibility: "private",
        credits_charged: 0,
        completed_at: new Date(),
      })),
    });
    await enqueueMediaDeletionReference(fairA, { sourcePetId: 900003 });
    await enqueueMediaDeletionReference(fairB, { sourcePetId: 900003 });
    await delay(15);
    const fairOrphan = await uploadFile(
      "generations/fair-orphan.jpg",
      Buffer.from("fair orphan"),
      "image/jpeg",
    );
    await enqueueMediaDeletionReference(fairOrphan.url, { sourcePetId: 900003 });
    const fairFirst = await processMediaDeletionTasks({ sourcePetId: 900003, limit: 2 });
    assert.equal(fairFirst.retained, 2);
    const fairSecond = await processMediaDeletionTasks({ sourcePetId: 900003, limit: 1 });
    assert.equal(fairSecond.deleted, 1, "rescheduled retained tasks must not starve the deletable tail");
    assert.equal(await storedFileExists(fairOrphan.url), false);

    // The generation-media coordinator's false final CAS (the row was deleted
    // after storage) must create a real durable task, not merely call a mock.
    const lostFinalizeMedia = await uploadFile(
      "videos/lost-finalize.mp4",
      Buffer.from("lost finalize media"),
      "video/mp4",
    );
    const lostFinalizeResult = await persistGenerationMediaWithLease({
      generationId: 424242,
      upstreamUrl: "https://provider.invalid/lost.mp4",
      kind: "video",
      claimableStatuses: ["processing"],
      retryStatus: "processing",
    }, {
      store: {
        tryClaim: async () => true,
        get: async () => ({
          status: "persisting",
          photoPath: "",
          videoPath: null,
          ownerUserId: owner.id,
          sourcePetId: 900004,
        }),
        release: async () => {},
        complete: async () => false,
      },
      saveRemoteFile: async () => lostFinalizeMedia.url,
      enqueueMediaDeletion: async (url, ownership) => {
        await enqueueMediaDeletionReference(url, {
          ownerUserId: ownership.ownerUserId,
          sourcePetId: ownership.sourcePetId,
          reason: "integration lost finalize",
        });
      },
      now: () => new Date(),
    });
    assert.equal(lostFinalizeResult.status, "busy");
    assert.ok(await prisma.mediaDeletionTask.findUnique({ where: { object_ref: lostFinalizeMedia.url } }));
    const lostFinalizeCleanup = await processMediaDeletionTasks({ sourcePetId: 900004, limit: 1 });
    assert.equal(lostFinalizeCleanup.deleted, 1);
    assert.equal(await storedFileExists(lostFinalizeMedia.url), false, "lost finalize must leave zero storage orphan");

    console.log(JSON.stringify({
      ok: true,
      battleRedacted: true,
      triggerRedacted: true,
      archiveOutbox: true,
      snapshotRaces: 3,
      arenaLockOrder: true,
      moodScope: true,
      fairOutbox: true,
      lostFinalizeOutbox: true,
    }));
  } finally {
    if (sharedArchiveRef) await deleteStoredFile(sharedArchiveRef).catch(() => {});
    await prisma.$disconnect();
    await rm(uploadRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "deletion P0 integration failed");
  process.exit(1);
});
