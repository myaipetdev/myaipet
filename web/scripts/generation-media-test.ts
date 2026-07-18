import {
  persistGenerationMediaWithLease,
  type GenerationMediaLeaseStore,
  type GenerationMediaRow,
  type PersistGenerationMediaArgs,
} from "../src/lib/services/generation-media-core";

const NOW = new Date("2026-07-17T12:00:00.000Z");
let passed = 0;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
  passed++;
}

interface MutableRow extends GenerationMediaRow {
  completedAt: Date | null;
  error: string | null;
}

function memoryStore(row: MutableRow): GenerationMediaLeaseStore {
  const leaseMatches = (claimStartedAt: Date) =>
    row.status === "persisting" && row.completedAt?.getTime() === claimStartedAt.getTime();

  return {
    async tryClaim(args, claimStartedAt, staleBefore) {
      const normal = args.claimableStatuses.includes(row.status);
      const stale = row.status === "persisting" && Boolean(row.completedAt && row.completedAt < staleBefore);
      if (!normal && !stale) return false;
      row.status = "persisting";
      row.completedAt = claimStartedAt;
      row.error = null;
      return true;
    },
    async get() {
      return { status: row.status, photoPath: row.photoPath, videoPath: row.videoPath };
    },
    async release(_id, claimStartedAt, retryStatus) {
      if (!leaseMatches(claimStartedAt)) return;
      row.status = retryStatus;
      row.completedAt = null;
      row.error = "media persistence failed";
    },
    async complete(_id, claimStartedAt, completedAt, kind, persistedUrl) {
      if (!leaseMatches(claimStartedAt)) return false;
      if (kind === "video") row.videoPath = persistedUrl;
      else row.photoPath = persistedUrl;
      row.status = "completed";
      row.completedAt = completedAt;
      row.error = null;
      return true;
    },
  };
}

async function main() {
const args: PersistGenerationMediaArgs = {
  generationId: 42,
  upstreamUrl: "https://provider.example/ephemeral-result.mp4",
  kind: "video",
  claimableStatuses: ["processing"],
  retryStatus: "processing",
  prefix: "videos",
};

// Two concurrent pollers: one claim, one write, one terminal transition.
{
  const row: MutableRow = {
    status: "processing",
    photoPath: "/uploads/generations/preimage.jpg",
    videoPath: null,
    completedAt: null,
    error: null,
  };
  let saves = 0;
  let receivedBasename = "";
  let receivedKind = "";
  const dependencies = {
    store: memoryStore(row),
    saveRemoteFile: async (_url: string, _prefix: string, stableBasename: string, expectedKind: string) => {
      saves++;
      receivedBasename = stableBasename;
      receivedKind = expectedKind;
      await new Promise((resolve) => setTimeout(resolve, 5));
      return "/uploads/videos/generation-42.mp4";
    },
    enqueueMediaDeletion: async () => {},
    now: () => new Date(NOW),
  };
  const [a, b] = await Promise.all([
    persistGenerationMediaWithLease(args, dependencies),
    persistGenerationMediaWithLease(args, dependencies),
  ]);
  assert(saves === 1, "concurrent pollers must perform one storage write");
  assert(receivedBasename === "generation-42", "storage key must be deterministic");
  assert(receivedKind === "video", "the downloader must enforce the generation media kind");
  assert([a, b].filter((r) => r.newlyCompleted).length === 1, "only the lease owner may complete");
  assert(row.status === "completed" && row.videoPath?.startsWith("/uploads/") === true,
    "the authoritative row must contain only the application media path");
  assert(row.videoPath !== args.upstreamUrl, "raw provider URL must not reach the database row");
}

// Storage failure releases the exact lease for a safe later retry.
{
  const row: MutableRow = {
    status: "processing", photoPath: "", videoPath: null, completedAt: null, error: null,
  };
  let threw = false;
  try {
    await persistGenerationMediaWithLease(args, {
      store: memoryStore(row),
      saveRemoteFile: async () => { throw new Error("synthetic storage failure"); },
      enqueueMediaDeletion: async () => {},
      now: () => new Date(NOW),
    });
  } catch {
    threw = true;
  }
  assert(threw, "storage failure must propagate");
  assert(row.status === "processing" && row.completedAt === null, "failed storage must release the lease");
  assert(row.videoPath === null, "failed storage must never retain the provider URL");
}

// A stale crashed lease is reclaimable and overwrites the same logical object.
{
  const row: MutableRow = {
    status: "persisting",
    photoPath: "",
    videoPath: null,
    completedAt: new Date(NOW.getTime() - 5 * 60_000),
    error: null,
  };
  const result = await persistGenerationMediaWithLease(args, {
    store: memoryStore(row),
    saveRemoteFile: async () => "/uploads/videos/generation-42.mp4",
    enqueueMediaDeletion: async () => {},
    now: () => new Date(NOW),
  });
  assert(result.newlyCompleted && row.status === "completed", "stale persistence lease must recover");
}

// Storage succeeded but the final compare-and-set lost/deleted the row: the
// exact persisted path must enter durable, reference-aware cleanup.
{
  const row: MutableRow = {
    status: "processing", photoPath: "", videoPath: null, completedAt: null, error: null,
  };
  const store = memoryStore(row);
  store.complete = async () => false;
  const queued: string[] = [];
  const result = await persistGenerationMediaWithLease(args, {
    store,
    saveRemoteFile: async () => "/uploads/videos/generation-42.mp4",
    enqueueMediaDeletion: async (url) => { queued.push(url); },
    now: () => new Date(NOW),
  });
  assert(result.status === "busy", "lost finalize lease must not claim completion");
  assert(queued.length === 1 && queued[0] === "/uploads/videos/generation-42.mp4",
    "lost finalize lease must enqueue the already-persisted object exactly once");
}

console.log(`generation_media_tests_passed=${passed}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "generation media test failed");
  process.exit(1);
});
