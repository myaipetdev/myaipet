import { prisma } from "@/lib/prisma";
import { saveRemoteFile } from "@/lib/storage";
import { enqueueMediaDeletionReference } from "@/lib/mediaDeletion";
import {
  persistGenerationMediaWithLease,
  PERSISTENCE_LEASE_MS,
  type GenerationMediaLeaseStore,
  type PersistGenerationMediaArgs,
  type PersistGenerationMediaResult,
} from "./generation-media-core";

export type {
  GenerationMediaKind,
  PersistGenerationMediaArgs,
  PersistGenerationMediaResult,
} from "./generation-media-core";

const store: GenerationMediaLeaseStore = {
  async tryClaim(args, claimStartedAt, staleBefore) {
    const claim = await prisma.generation.updateMany({
      where: {
        id: args.generationId,
        OR: [
          { status: { in: args.claimableStatuses } },
          { status: "persisting", completed_at: { lt: staleBefore } },
        ],
      },
      data: {
        status: "persisting",
        completed_at: claimStartedAt,
        error_message: null,
      },
    });
    return claim.count === 1;
  },

  async get(generationId) {
    const row = await prisma.generation.findUnique({
      where: { id: generationId },
      select: { status: true, photo_path: true, video_path: true, user_id: true, pet_id: true },
    });
    return row ? {
      status: row.status,
      photoPath: row.photo_path,
      videoPath: row.video_path,
      ownerUserId: row.user_id,
      sourcePetId: row.pet_id,
    } : null;
  },

  async release(generationId, claimStartedAt, retryStatus) {
    await prisma.generation.updateMany({
      where: { id: generationId, status: "persisting", completed_at: claimStartedAt },
      data: {
        status: retryStatus,
        completed_at: null,
        error_message: "media persistence failed",
      },
    });
  },

  async complete(generationId, claimStartedAt, completedAt, kind, persistedUrl) {
    const mediaData = kind === "video"
      ? { video_path: persistedUrl }
      : { photo_path: persistedUrl };
    const completed = await prisma.generation.updateMany({
      where: { id: generationId, status: "persisting", completed_at: claimStartedAt },
      data: {
        ...mediaData,
        status: "completed",
        completed_at: completedAt,
        error_message: null,
      },
    });
    return completed.count === 1;
  },
};

/**
 * Claim and persist a completed provider result exactly once per Generation.
 *
 * `status = persisting` is a short DB-backed lease. Concurrent pollers cannot
 * both download/write the provider URL. A worker that crashes after storage but
 * before the final DB update is recoverable after the lease; the deterministic
 * object name makes that retry overwrite the same logical object. Raw provider
 * URLs are never written to the Generation row.
 */
export async function persistGenerationMediaExactlyOnce(
  args: PersistGenerationMediaArgs,
): Promise<PersistGenerationMediaResult> {
  return persistGenerationMediaWithLease(args, {
    store,
    saveRemoteFile,
    enqueueMediaDeletion: async (persistedUrl, ownership) => {
      await enqueueMediaDeletionReference(persistedUrl, {
        ...ownership,
        reason: "Generation media DB finalize did not retain the stored object",
        // A stale lease can lose its CAS to a second writer using the same
        // deterministic key. Delay cleanup until that writer has had a full
        // lease window to complete; the worker then retains a live reference or
        // deletes an actually orphaned object.
        notBefore: new Date(Date.now() + PERSISTENCE_LEASE_MS),
      });
    },
    now: () => new Date(),
  });
}
