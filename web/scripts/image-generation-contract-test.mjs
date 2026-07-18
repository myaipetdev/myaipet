import { readFile, readdir } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
let passed = 0;

function assert(condition, message) {
  if (!condition) throw new Error(message);
  passed++;
}

async function source(path) {
  return readFile(join(root, path), "utf8");
}

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(path));
    else if (/\.(?:ts|tsx)$/.test(entry.name)) out.push(path);
  }
  return out;
}

const video = await source("src/lib/services/video.ts");
const backend = await source("src/lib/studio/backend.ts");
const lora = await source("src/lib/services/lora.ts");
const media = await source("src/lib/services/generation-media.ts");
const mediaCore = await source("src/lib/services/generation-media-core.ts");
const avatar = await source("src/app/api/pets/avatar/route.ts");
const petGenerate = await source("src/app/api/pets/[petId]/generate/route.ts");
const battle = await source("src/app/api/battle-sprite/route.ts");
const rewards = await source("src/app/api/rewards/mockup/route.ts");
const legacyStatus = await source("src/app/api/generate/[id]/status/route.ts");
const cronStatus = await source("src/app/api/cron/daydream-to-video/route.ts");

// Direct xAI image transports stay in the two metered adapters only.
const directImageFiles = [];
for (const file of await walk(join(root, "src"))) {
  const text = await readFile(file, "utf8");
  if (/api\.x\.ai\/v1\/images\/(?:generations|edits)/.test(text)) {
    directImageFiles.push(relative(root, file));
  }
}
assert(
  JSON.stringify(directImageFiles.sort()) === JSON.stringify([
    "src/lib/services/video.ts",
    "src/lib/studio/backend.ts",
  ]),
  `unmetered direct image transport found: ${directImageFiles.join(", ")}`,
);

assert((video.match(/consumeImageBudget\(userId, "xai"\)/g) || []).length === 2,
  "both Grok image submissions must reserve an image attempt");
assert(backend.includes('model.kind === "image"') && backend.includes('consumeImageBudget(userId, "fal")'),
  "Studio FAL image submissions must reserve an image attempt");
assert(backend.includes('consumeImageBudget(userId, "xai")'),
  "Studio Grok image submissions must reserve an image attempt");
assert(lora.includes('consumeImageBudget(userId, "fal")'),
  "Pet-LoRA image submissions must reserve an image attempt");

const generateStart = video.indexOf("export async function generateGrokImage(");
const submitVideoStart = video.indexOf("export async function submitGrokVideo(");
const imageFunction = video.slice(generateStart, submitVideoStart);
assert(!/saveToBlob|saveRemoteFile|saveToStorage/.test(imageFunction),
  "generateGrokImage must return an upstream URL without persisting it");
assert(video.slice(submitVideoStart).includes("prepareVisionImageInput(imageUrl, { materializeExternal: true })"),
  "video preimages must be materialised before xAI submission");

const statusStart = video.indexOf("export async function checkGrokVideoStatus(");
assert(!/saveToBlob|saveRemoteFile|saveToStorage/.test(video.slice(statusStart)),
  "video status checks must be read-only");
assert(media.includes('status: "persisting"') && mediaCore.includes('`generation-${args.generationId}`'),
  "generation settlement must use a DB claim and deterministic object name");
assert(!/video_path:\s*args\.upstreamUrl|photo_path:\s*args\.upstreamUrl/.test(media),
  "raw provider URLs must never be written to Generation media columns");
assert(legacyStatus.includes("persistGenerationMediaExactlyOnce") && cronStatus.includes("persistGenerationMediaExactlyOnce"),
  "every checkGrokVideoStatus caller must use exact-once persistence");

assert(avatar.includes("generateGrokImage(prompt, user.id)"), "avatar generation must be user-budgeted");
assert(petGenerate.includes("generateGrokImage(personalizedPrompt, user.id)"), "pet generation must be user-budgeted");
assert(battle.includes("await getUser(req)") && battle.includes("generateGrokImage(prompt, user.id)"),
  "battle sprites must authenticate and use the persistent user budget");
assert(rewards.includes('generateGrokImage(prompt, user.id, "grok-2-image")') && rewards.includes("saveRemoteFile"),
  "reward mockups must be budgeted and persisted inside the app boundary");

console.log(`image_generation_contract_passed=${passed}`);
