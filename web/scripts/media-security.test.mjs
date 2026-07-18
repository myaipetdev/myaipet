import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
registerHooks({
  resolve(specifier, context, nextResolve) {
    const candidates = [];
    if (specifier.startsWith("@/")) candidates.push(resolve(webRoot, "src", specifier.slice(2)));
    else if (specifier === "@prisma/client/runtime/client") {
      candidates.push(resolve(webRoot, "node_modules/@prisma/client/runtime/client.js"));
    } else if (specifier.startsWith(".") && context.parentURL?.startsWith("file:")) {
      candidates.push(resolve(dirname(fileURLToPath(context.parentURL)), specifier));
    }
    for (const base of candidates) {
      for (const candidate of [base, `${base}.ts`, resolve(base, "index.ts")]) {
        if (existsSync(candidate)) return { url: pathToFileURL(candidate).href, shortCircuit: true };
      }
    }
    return nextResolve(specifier, context);
  },
});

process.env.DATABASE_URL ||= "postgresql://contract-test:contract-test@127.0.0.1:9/unused";

const { storageKey } = await import(pathToFileURL(resolve(webRoot, "src/lib/storage.ts")));
const { applicationMediaKey, isFreshOwnerUploadKey } = await import(pathToFileURL(resolve(webRoot, "src/lib/mediaOwnership.ts")));

const acceptedStorage = new Map([
  ["/uploads/avatars/7/pet.jpg", "avatars/7/pet.jpg"],
  ["uploads/videos/7/clip.mp4", "videos/7/clip.mp4"],
  ["generations/image.png", "generations/image.png"],
  ["https://app.myaipet.ai/uploads/generations/image.png", "generations/image.png"],
  ["http://app.myaipet.ai/uploads/legacy/image.png", "legacy/image.png"],
]);
for (const [input, expected] of acceptedStorage) assert.equal(storageKey(input), expected, input);

const rejected = [
  "https://evil.example/uploads/generations/victim.jpg",
  "https://app.myaipet.ai:444/uploads/generations/victim.jpg",
  "https://user@app.myaipet.ai/uploads/generations/victim.jpg",
  "https://app.myaipet.ai/not-uploads/victim.jpg",
  "https://app.myaipet.ai/uploads/a/../victim.jpg",
  "/uploads/a/../victim.jpg",
  "/uploads/a/%2e%2e/victim.jpg",
  "/uploads/victim.jpg?download=1",
  "/uploads/victim.jpg#fragment",
  "/uploads//victim.jpg",
  `/uploads/avatars/7/${"a".repeat(601)}.jpg`,
];
for (const input of rejected) {
  assert.equal(storageKey(input), null, `storageKey accepted ${input}`);
  assert.equal(applicationMediaKey(input), null, `applicationMediaKey accepted ${input}`);
}

assert.equal(applicationMediaKey("/uploads/avatars/7/pet.jpg"), "avatars/7/pet.jpg");
assert.equal(
  applicationMediaKey("https://app.myaipet.ai/uploads/generations/image.png"),
  "generations/image.png",
);
assert.equal(applicationMediaKey("http://app.myaipet.ai/uploads/legacy/image.png"), null);
const freshTimestamp = Date.now();
assert.equal(isFreshOwnerUploadKey(7, `avatars/7/${freshTimestamp}.jpg`), true);
assert.equal(isFreshOwnerUploadKey(7, `avatars/7/${freshTimestamp}-a1b2c3d4e5f6.png`), true);
assert.equal(isFreshOwnerUploadKey(7, `avatars/7/${freshTimestamp}-too-wide.png`), false);
assert.equal(isFreshOwnerUploadKey(7, `avatars/8/${freshTimestamp}-a1b2c3d4e5f6.png`), false);
assert.equal(isFreshOwnerUploadKey(7, `avatars/7/${freshTimestamp - 25 * 60 * 60_000}.jpg`), false);

console.log(JSON.stringify({ ok: true, accepted: acceptedStorage.size, rejected: rejected.length }));
