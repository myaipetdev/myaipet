import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

type Runtime = import("../src/lib/storage").RemoteMediaDownloadRuntime;

function png(seed = 0): Buffer {
  return Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    seed, 0, 0, 0, 0, 0, 0, 0,
  ]);
}

function mp4(seed = 0): Buffer {
  const value = Buffer.alloc(32, seed);
  value.writeUInt32BE(24, 0);
  value.write("ftyp", 4, "ascii");
  value.write("isom", 8, "ascii");
  value.writeUInt32BE(0, 12);
  value.write("isom", 16, "ascii");
  value.write("mp42", 20, "ascii");
  return value;
}

function mediaResponse(
  bytes: Buffer,
  contentType: string,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "content-type": contentType,
      "content-length": String(bytes.length),
      ...extraHeaders,
    },
  });
}

function runtime(
  fetchImpl: Runtime["fetchImpl"],
  overrides: Partial<Runtime> = {},
): Runtime {
  return {
    fetchImpl,
    urlGuard: async () => true,
    timeoutMs: 500,
    maxBytes: 1024,
    maxRedirects: 3,
    ...overrides,
  };
}

async function rejects(action: Promise<unknown>, pattern: RegExp): Promise<void> {
  await assert.rejects(action, pattern);
}

async function main(): Promise<void> {
  const uploadRoot = await mkdtemp(join(tmpdir(), "petclaw-remote-media-"));
  process.env.STORAGE_PROVIDER = "local";
  process.env.LOCAL_UPLOAD_DIR = uploadRoot;
  process.env.LOCAL_UPLOAD_URL = "/uploads";
  const {
    downloadRemoteMediaForStorage,
    saveRemoteFile,
    uploadFile,
  } = await import("../src/lib/storage");
  const { isPrivateIp } = await import("../src/lib/sanitize");

  try {
  // Every redirect is fetched manually and must pass the URL guard first.
  {
    const guarded: string[] = [];
    const fetched: string[] = [];
    const result = await downloadRemoteMediaForStorage(
      "https://provider.example/result",
      "image",
      runtime(async (url, init) => {
        fetched.push(url);
        assert.equal(init.redirect, "manual");
        if (url === "https://provider.example/result") {
          return new Response(null, {
            status: 302,
            headers: { location: "https://cdn.example/final.png" },
          });
        }
        return mediaResponse(png(), "image/png");
      }, {
        urlGuard: async (url) => {
          guarded.push(url);
          return true;
        },
      }),
    );
    assert.equal(result.contentType, "image/png");
    assert.deepEqual(guarded, [
      "https://provider.example/result",
      "https://cdn.example/final.png",
    ]);
    assert.equal(fetched.length, 2);
  }

  // A redirect to metadata/private space is rejected before the second fetch.
  {
    const guarded: string[] = [];
    let fetches = 0;
    await rejects(downloadRemoteMediaForStorage(
      "https://provider.example/result",
      "image",
      runtime(async () => {
        fetches++;
        return new Response(null, {
          status: 302,
          headers: { location: "https://169.254.169.254/latest/meta-data" },
        });
      }, {
        urlGuard: async (url) => {
          guarded.push(url);
          return !url.includes("169.254.169.254");
        },
      }),
    ), /not allowed/);
    assert.equal(fetches, 1);
    assert.equal(guarded.length, 2);
  }

  // The production DNS/IP guard rejects literal metadata without touching fetch.
  await rejects(
    downloadRemoteMediaForStorage("https://169.254.169.254/latest/meta-data", "image"),
    /not allowed/,
  );
  for (const unsafe of [
    "127.0.0.1",
    "169.254.169.254",
    "::ffff:7f00:1",
    "::ffff:127.0.0.1",
    "::ffff:0:127.0.0.1",
    "fe90::1",
    "fec0::1",
    "64:ff9b::7f00:1",
  ]) {
    assert.equal(isPrivateIp(unsafe), true, `${unsafe} must be non-fetchable`);
  }
  assert.equal(isPrivateIp("2606:4700:4700::1111"), false);
  await rejects(
    downloadRemoteMediaForStorage("https://[::ffff:7f00:1]/private", "image"),
    /not allowed/,
  );
  await rejects(
    downloadRemoteMediaForStorage("https://[fe90::1]/private", "image"),
    /not allowed/,
  );

  // Timeout covers URL/DNS validation as well as fetch/body reads.
  {
    let fetched = false;
    await rejects(downloadRemoteMediaForStorage(
      "https://provider.example/result",
      "image",
      runtime(async () => {
        fetched = true;
        return mediaResponse(png(), "image/png");
      }, {
        timeoutMs: 20,
        urlGuard: async () => new Promise<boolean>(() => undefined),
      }),
    ), /timed out/);
    assert.equal(fetched, false);
  }

  // Content-Length is parsed strictly and checked before reading the stream.
  await rejects(downloadRemoteMediaForStorage(
    "https://provider.example/large",
    "image",
    runtime(async () => mediaResponse(png(), "image/png", { "content-length": "9" }), {
      maxBytes: 8,
    }),
  ), /size limit/);
  await rejects(downloadRemoteMediaForStorage(
    "https://provider.example/bad-length",
    "image",
    runtime(async () => mediaResponse(png(), "image/png", { "content-length": "12x" })),
  ), /Content-Length is invalid/);
  await rejects(downloadRemoteMediaForStorage(
    "https://provider.example/truncated",
    "image",
    runtime(async () => mediaResponse(png(), "image/png", { "content-length": String(png().length + 1) })),
  ), /does not match Content-Length/);

  // Chunked bodies are stopped at the streaming ceiling even without a length.
  {
    let cancelled = false;
    let pulls = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls++;
        controller.enqueue(new Uint8Array(6));
      },
      cancel() {
        cancelled = true;
      },
    });
    await rejects(downloadRemoteMediaForStorage(
      "https://provider.example/chunked",
      "image",
      runtime(async () => new Response(body, {
        status: 200,
        headers: { "content-type": "image/png" },
      }), { maxBytes: 8 }),
    ), /size limit/);
    assert.ok(pulls >= 2);
    assert.equal(cancelled, true);
  }

  // Both declared MIME and magic bytes must agree with the caller's media kind.
  await rejects(downloadRemoteMediaForStorage(
    "https://provider.example/spoof",
    "image",
    runtime(async () => mediaResponse(png(), "image/jpeg")),
  ), /MIME does not match/);
  await rejects(downloadRemoteMediaForStorage(
    "https://provider.example/html",
    "image",
    runtime(async () => mediaResponse(Buffer.from("<html>not media</html>"), "text/html")),
  ), /Content-Type is not supported/);
  await rejects(downloadRemoteMediaForStorage(
    "https://provider.example/wrong-kind",
    "video",
    runtime(async () => mediaResponse(png(), "image/png")),
  ), /expected video/);
  const video = await downloadRemoteMediaForStorage(
    "https://provider.example/video",
    "video",
    runtime(async () => mediaResponse(mp4(1), "video/mp4")),
  );
  assert.equal(video.contentType, "video/mp4");
  assert.equal(video.extension, "mp4");

  // Stable names are exact-once at the filesystem boundary: a validated retry
  // atomically replaces the same path and leaves no visible partial file.
  const stableUrl = await saveRemoteFile(
    "https://provider.example/video",
    "videos",
    "generation-42",
    "video",
    runtime(async () => mediaResponse(mp4(1), "video/mp4")),
  );
  assert.equal(stableUrl, "/uploads/videos/generation-42.mp4");
  const stablePath = join(uploadRoot, "videos", "generation-42.mp4");
  assert.deepEqual(await readFile(stablePath), mp4(1));

  await saveRemoteFile(
    "https://provider.example/video-retry",
    "videos",
    "generation-42",
    "video",
    runtime(async () => mediaResponse(mp4(2), "video/mp4")),
  );
  assert.deepEqual(await readFile(stablePath), mp4(2));
  assert.deepEqual((await readdir(join(uploadRoot, "videos"))).sort(), ["generation-42.mp4"]);

  // A failed validation cannot replace the previously committed stable object.
  await rejects(saveRemoteFile(
    "https://provider.example/invalid-retry",
    "videos",
    "generation-42",
    "video",
    runtime(async () => mediaResponse(Buffer.from("not an mp4"), "video/mp4")),
  ), /not a supported image or video/);
  assert.deepEqual(await readFile(stablePath), mp4(2));

  // A local rename failure cleans its private temporary file and cannot expose
  // partial bytes at the authoritative name.
  const blockedTarget = join(uploadRoot, "videos", "blocked.mp4");
  await mkdir(blockedTarget);
  await rejects(
    uploadFile("videos/blocked.mp4", mp4(3), "video/mp4"),
    /EISDIR|ENOTEMPTY|directory/i,
  );
  assert.equal(
    (await readdir(join(uploadRoot, "videos"))).some((name) => name.includes(".partial-")),
    false,
  );

  await rejects(
    uploadFile("../outside.jpg", png(), "image/png"),
    /Invalid storage filename/,
  );

    console.log("remote_media_download_tests=PASS");
  } finally {
    await rm(uploadRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
