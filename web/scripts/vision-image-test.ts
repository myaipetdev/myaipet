import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const jpeg = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46,
  0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
]);
const png = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d,
]);

async function main() {
  const uploadRoot = await mkdtemp(path.join(tmpdir(), "petclaw-vision-image-"));
  process.env.STORAGE_PROVIDER = "local";
  process.env.LOCAL_UPLOAD_DIR = uploadRoot;
  process.env.LOCAL_UPLOAD_URL = "/uploads";

  const { prepareVisionImageInput, VISION_IMAGE_MAX_BYTES } = await import("../src/lib/services/vision-image");
  const { callVisionTextWithFallback } = await import("../src/lib/llm/vision-fallback");
  let passed = 0;

  async function succeeds(name: string, run: () => Promise<void>) {
    await run();
    passed += 1;
    console.log(`✓ ${name}`);
  }

  async function rejects(name: string, run: () => Promise<unknown>) {
    await assert.rejects(run);
    passed += 1;
    console.log(`✓ ${name}`);
  }

  try {
    await writeFile(path.join(uploadRoot, "pet.jpg"), jpeg);
    await writeFile(path.join(uploadRoot, "too-large.jpg"), Buffer.alloc(VISION_IMAGE_MAX_BYTES + 1, 0xff));

    await succeeds("stored /uploads image becomes a verified data URL", async () => {
      const result = await prepareVisionImageInput("/uploads/pet.jpg");
      assert.equal(result, `data:image/jpeg;base64,${jpeg.toString("base64")}`);
    });

    await succeeds("valid inline image is normalized from magic bytes", async () => {
      const result = await prepareVisionImageInput(`data:image/png;base64,${png.toString("base64")}`);
      assert.equal(result, `data:image/png;base64,${png.toString("base64")}`);
    });

    await rejects("inline MIME spoofing is rejected", () =>
      prepareVisionImageInput(`data:image/png;base64,${jpeg.toString("base64")}`));
    await rejects("SVG data URLs are rejected", () =>
      prepareVisionImageInput("data:image/svg+xml;base64,PHN2Zz48L3N2Zz4="));
    await rejects("stored path traversal is rejected", () =>
      prepareVisionImageInput("/uploads/../secret.jpg"));
    await rejects("localhost URLs are rejected", () =>
      prepareVisionImageInput("http://localhost/pet.jpg"));
    await rejects("cloud metadata URLs are rejected", () =>
      prepareVisionImageInput("http://169.254.169.254/latest/meta-data"));
    await rejects("stored images over 8MB are rejected", () =>
      prepareVisionImageInput("/uploads/too-large.jpg"));

    await succeeds("xAI spend failure falls back to OpenAI and reserves both attempts", async () => {
      const calls: string[] = [];
      const reservations: string[] = [];
      const bodies: any[] = [];
      const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
        const provider = String(url).includes("api.x.ai") ? "xai" : "openai";
        calls.push(provider);
        bodies.push(JSON.parse(String(init?.body)));
        if (provider === "xai") {
          return new Response('{"error":"team spending limit reached"}', { status: 403 });
        }
        return new Response('{"choices":[{"message":{"content":"YES"}}]}', { status: 200 });
      }) as typeof fetch;
      const result = await callVisionTextWithFallback(
        { imageUrl: `data:image/jpeg;base64,${jpeg.toString("base64")}`, prompt: "pet?", maxTokens: 5 },
        {
          env: { NODE_ENV: "test", GROK_API_KEY: "xai-test", OPENAI_API_KEY: "openai-test" },
          fetchImpl,
          logFallback: false,
          reserveAttempt: async (provider) => { reservations.push(provider); },
        },
      );
      assert.equal(result, "YES");
      assert.deepEqual(calls, ["xai", "openai"]);
      assert.deepEqual(reservations, ["xai", "openai"]);
      assert.equal(bodies[0].max_tokens, 5);
      assert.equal(bodies[0].max_completion_tokens, undefined);
      assert.equal(bodies[1].model, "gpt-5.6-luna");
      assert.equal(bodies[1].max_completion_tokens, 5);
      assert.equal(bodies[1].reasoning_effort, "none");
      assert.equal(bodies[1].max_tokens, undefined);
    });

    await succeeds("xAI auth/permission failure never crosses providers", async () => {
      const calls: string[] = [];
      let reservations = 0;
      const result = await callVisionTextWithFallback(
        { imageUrl: `data:image/jpeg;base64,${jpeg.toString("base64")}`, prompt: "pet?", maxTokens: 5 },
        {
          env: { NODE_ENV: "test", GROK_API_KEY: "xai-test", OPENAI_API_KEY: "openai-test" },
          logFallback: false,
          reserveAttempt: async () => { reservations += 1; },
          fetchImpl: (async (url: string | URL | Request) => {
            calls.push(String(url));
            return new Response('{"error":"forbidden model permission"}', { status: 403 });
          }) as typeof fetch,
        },
      );
      assert.equal(result, null);
      assert.equal(calls.length, 1);
      assert.equal(reservations, 1);
    });

    await succeeds("fallback budget denial blocks the OpenAI request", async () => {
      const calls: string[] = [];
      const reservations: string[] = [];
      await assert.rejects(
        callVisionTextWithFallback(
          { imageUrl: `data:image/jpeg;base64,${jpeg.toString("base64")}`, prompt: "pet?", maxTokens: 5 },
          {
            env: { NODE_ENV: "test", GROK_API_KEY: "xai-test", OPENAI_API_KEY: "openai-test" },
            logFallback: false,
            reserveAttempt: async (provider) => {
              reservations.push(provider);
              if (provider === "openai") throw new Error("synthetic budget denial");
            },
            fetchImpl: (async (url: string | URL | Request) => {
              calls.push(String(url));
              return new Response('{"error":"team spending limit reached"}', { status: 403 });
            }) as typeof fetch,
          },
        ),
        /synthetic budget denial/,
      );
      assert.deepEqual(reservations, ["xai", "openai"]);
      assert.equal(calls.length, 1);
      assert.match(calls[0], /api\.x\.ai/);
    });

    await succeeds("xAI network failure falls back to OpenAI", async () => {
      const calls: string[] = [];
      let reservations = 0;
      const result = await callVisionTextWithFallback(
        { imageUrl: `data:image/jpeg;base64,${jpeg.toString("base64")}`, prompt: "pet?", maxTokens: 5 },
        {
          env: { NODE_ENV: "test", GROK_API_KEY: "xai-test", OPENAI_API_KEY: "openai-test" },
          logFallback: false,
          reserveAttempt: async () => { reservations += 1; },
          fetchImpl: (async (url: string | URL | Request) => {
            const provider = String(url).includes("api.x.ai") ? "xai" : "openai";
            calls.push(provider);
            if (provider === "xai") throw new TypeError("synthetic network failure");
            return new Response('{"choices":[{"message":{"content":"OK"}}]}', { status: 200 });
          }) as typeof fetch,
        },
      );
      assert.equal(result, "OK");
      assert.deepEqual(calls, ["xai", "openai"]);
      assert.equal(reservations, 2);
    });

    await succeeds("OpenAI is used directly when xAI is not configured", async () => {
      const calls: string[] = [];
      let reservations = 0;
      const result = await callVisionTextWithFallback(
        { imageUrl: `data:image/jpeg;base64,${jpeg.toString("base64")}`, prompt: "pet?", maxTokens: 5 },
        {
          env: { NODE_ENV: "test", OPENAI_API_KEY: "openai-test" },
          logFallback: false,
          reserveAttempt: async () => { reservations += 1; },
          fetchImpl: (async (url: string | URL | Request) => {
            calls.push(String(url));
            return new Response('{"choices":[{"message":{"content":"OK"}}]}', { status: 200 });
          }) as typeof fetch,
        },
      );
      assert.equal(result, "OK");
      assert.equal(calls.length, 1);
      assert.match(calls[0], /api\.openai\.com/);
      assert.equal(reservations, 1);
    });

    console.log(`\n${passed}/13 vision boundary and fallback tests passed`);
  } finally {
    await rm(uploadRoot, { recursive: true, force: true });
  }
}

void main();
