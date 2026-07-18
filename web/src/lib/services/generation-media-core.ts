export const PERSISTENCE_LEASE_MS = 2 * 60_000;

export type GenerationMediaKind = "image" | "video";

export interface PersistGenerationMediaArgs {
  generationId: number;
  upstreamUrl: string;
  kind: GenerationMediaKind;
  claimableStatuses: string[];
  retryStatus: string;
  prefix?: string;
}

export interface PersistGenerationMediaResult {
  status: "completed" | "busy";
  url?: string;
  newlyCompleted: boolean;
}

export interface GenerationMediaRow {
  status: string;
  photoPath: string;
  videoPath: string | null;
  ownerUserId?: number | null;
  sourcePetId?: number | null;
}

export interface GenerationMediaLeaseStore {
  tryClaim(args: PersistGenerationMediaArgs, claimStartedAt: Date, staleBefore: Date): Promise<boolean>;
  get(generationId: number): Promise<GenerationMediaRow | null>;
  release(generationId: number, claimStartedAt: Date, retryStatus: string): Promise<void>;
  complete(
    generationId: number,
    claimStartedAt: Date,
    completedAt: Date,
    kind: GenerationMediaKind,
    persistedUrl: string,
  ): Promise<boolean>;
}

export interface GenerationMediaPersistenceDependencies {
  store: GenerationMediaLeaseStore;
  saveRemoteFile(
    remoteUrl: string,
    prefix: string,
    stableBasename: string,
    expectedKind: GenerationMediaKind,
  ): Promise<string>;
  enqueueMediaDeletion(
    persistedUrl: string,
    ownership: { ownerUserId?: number | null; sourcePetId?: number | null },
  ): Promise<void>;
  now(): Date;
}

function completedResult(
  row: GenerationMediaRow | null,
  kind: GenerationMediaKind,
): PersistGenerationMediaResult | null {
  if (row?.status !== "completed") return null;
  return {
    status: "completed",
    url: kind === "video" ? row.videoPath || undefined : row.photoPath,
    newlyCompleted: false,
  };
}

/** Dependency-injected exact-once coordinator; production binds it to Prisma/S3. */
export async function persistGenerationMediaWithLease(
  args: PersistGenerationMediaArgs,
  dependencies: GenerationMediaPersistenceDependencies,
): Promise<PersistGenerationMediaResult> {
  const claimStartedAt = dependencies.now();
  const staleBefore = new Date(claimStartedAt.getTime() - PERSISTENCE_LEASE_MS);
  const claimed = await dependencies.store.tryClaim(args, claimStartedAt, staleBefore);

  if (!claimed) {
    return completedResult(await dependencies.store.get(args.generationId), args.kind)
      || { status: "busy", newlyCompleted: false };
  }

  // Capture ownership before the storage write. Pet deletion may remove the
  // Generation while the provider object is being downloaded, but the outbox
  // still needs enough attribution to be drained immediately or by cron.
  let claimedRow: GenerationMediaRow | null;
  try {
    claimedRow = await dependencies.store.get(args.generationId);
  } catch (error) {
    await dependencies.store.release(args.generationId, claimStartedAt, args.retryStatus).catch(() => {});
    throw error;
  }

  let persistedUrl: string;
  try {
    persistedUrl = await dependencies.saveRemoteFile(
      args.upstreamUrl,
      args.prefix || (args.kind === "video" ? "videos" : "generations"),
      `generation-${args.generationId}`,
      args.kind,
    );
  } catch (error) {
    await dependencies.store.release(
      args.generationId,
      claimStartedAt,
      args.retryStatus,
    ).catch(() => {});
    throw error;
  }

  let completed: boolean;
  try {
    completed = await dependencies.store.complete(
      args.generationId,
      claimStartedAt,
      dependencies.now(),
      args.kind,
      persistedUrl,
    );
  } catch (error) {
    await dependencies.enqueueMediaDeletion(persistedUrl, {
      ownerUserId: claimedRow?.ownerUserId,
      sourcePetId: claimedRow?.sourcePetId,
    });
    throw error;
  }
  if (completed) {
    return { status: "completed", url: persistedUrl, newlyCompleted: true };
  }

  // A false compare-and-set means the lease was lost or the row was deleted.
  // Never leave the already-written object untracked. Enqueue even when a
  // competing completion now references the same deterministic path; the
  // reference-aware worker will retain it rather than deleting shared bytes.
  await dependencies.enqueueMediaDeletion(persistedUrl, {
    ownerUserId: claimedRow?.ownerUserId,
    sourcePetId: claimedRow?.sourcePetId,
  });

  return completedResult(await dependencies.store.get(args.generationId), args.kind)
    || { status: "busy", newlyCompleted: false };
}
