import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(resolve(webRoot, path), "utf8");

const projection = read("src/app/api/dashboard/projection/route.ts");
const snapshot = read("src/lib/seasonSnapshot.ts");
const petDate = read("src/app/api/pet-date/route.ts");
const deletion = read("src/lib/petclaw/data-sovereignty.ts");
const mediaOwnership = read("src/lib/mediaOwnership.ts");
const mediaRoute = read("src/app/api/media/[...key]/route.ts");
const moodPortrait = read("src/app/api/pets/[petId]/mood-portrait/route.ts");
const publicTicker = read("src/app/api/dashboard/ticker/route.ts");
const socialFeed = read("src/app/api/social/feed/route.ts");
const networkInvoke = read("src/app/api/petclaw/network/invoke/route.ts");
const agents = read("src/lib/agents.ts");
const rateLimiter = read("src/lib/rateLimit.ts");
const editedVideoUpload = read("src/app/api/upload/video/route.ts");
const connectorRoute = read("src/app/api/petclaw/connectors/route.ts");
const webSearchConnector = read("src/lib/petclaw/connectors/web-search.ts");
const daydreamRoute = read("src/app/api/pets/[petId]/daydream/route.ts");
const migration = read("prisma/migrations/20260717161000_safe_media_deletion/migration.sql");
const privacyPolicy = read("src/app/privacy/page.tsx");
const paidAgentRoute = read("src/app/api/pets/[petId]/agent/route.ts");
const paidAgentReceiptRoute = read("src/app/api/pets/[petId]/agent/runs/[runId]/route.ts");
const soulExportRoute = read("src/app/api/petclaw/export/route.ts");
const soulImportRoute = read("src/app/api/petclaw/import/route.ts");

assert.match(projection, /pets:\s*\{\s*some:\s*publicPetWhere\(\)/);
assert.match(projection, /pets:\s*\{\s*where:\s*publicPetWhere\(\)/);
assert.match(snapshot, /pets:\s*\{\s*some:\s*publicPetWhere\(\)/);
assert.match(snapshot, /where:\s*publicPetWhere\(\)/);

assert.match(migration, /pet_dates_pet_a_id_fkey[\s\S]*ON DELETE SET NULL/);
assert.match(migration, /pet_dates_pet_b_id_fkey[\s\S]*ON DELETE SET NULL/);
assert.match(petDate, /original\.code === "P2003"/);

const referencedBranch = deletion.match(
  /if \(await mediaObjectIsStillReferenced\(task\.object_ref\)\) \{([\s\S]*?)\n\s*\}/,
);
assert.ok(referencedBranch, "shared-media retention branch is missing");
assert.doesNotMatch(referencedBranch[1], /mediaDeletionTask\.delete/);
assert.match(referencedBranch[1], /retained \+= 1/);

assert.match(mediaOwnership, /key\.length > 600/);
assert.match(mediaOwnership, /storedFileExists\(`\/uploads\/\$\{key\}`\)/);
assert.match(mediaOwnership, /userCanAssignApplicationMedia/);
assert.match(mediaRoute, /await userCanAssignApplicationMedia\(user\.id, relative\)/);
assert.ok(
  mediaRoute.indexOf("if (generation || caught)") < mediaRoute.indexOf("Fresh avatar/catch uploads"),
  "live references must be checked before the unassigned-upload preview fallback",
);
assert.match(moodPortrait, /userCanAssignApplicationMedia\(ctx\.user\.id, safe\)/);
assert.doesNotMatch(mediaRoute, /jsonContainsReference\(ownerPet\.personality_modifiers/);
assert.doesNotMatch(mediaRoute, /key\.startsWith\(`lora-train\/pet-\$\{ownerPet\.id\}-`\)/);
const portableModifierBlock = deletion.slice(
  deletion.indexOf("const PORTABLE_MODIFIER_KEYS"),
  deletion.indexOf("const LINKED_DATA_CATEGORIES"),
);
assert.doesNotMatch(portableModifierBlock, /mood_portraits/);
assert.doesNotMatch(publicTicker, /select:\s*\{[^}]*title:/);
assert.doesNotMatch(publicTicker, /n\.title/);
assert.doesNotMatch(socialFeed, /triggerAgentReactions/);
assert.match(networkInvoke, /status:\s*503/);
assert.doesNotMatch(networkInvoke, /invokePet|executeSkill|callLLM/);
assert.doesNotMatch(agents, /callLLM|GROK_API_KEY/);
assert.match(agents, /petAgentReaction\.create/);
assert.doesNotMatch(rateLimiter, /headers\.get\(["']authorization["']\)/);
assert.doesNotMatch(rateLimiter, /createHash/);
assert.match(editedVideoUpload, /status:\s*503/);
assert.doesNotMatch(editedVideoUpload, /formData|uploadFile|arrayBuffer/);
assert.match(connectorRoute, /Server-side page summarization is not available/);
assert.doesNotMatch(connectorRoute, /ws\.summarize\(params\.url\)/);
const summarizeMethod = webSearchConnector.slice(webSearchConnector.indexOf("async summarize"));
assert.doesNotMatch(summarizeMethod, /fetch\(/);

const daydreamGet = daydreamRoute.slice(
  daydreamRoute.indexOf("export async function GET"),
  daydreamRoute.indexOf("export async function POST"),
);
assert.match(daydreamGet, /requirePetOwner\(req, id\)/);
assert.ok(
  daydreamGet.indexOf("requirePetOwner(req, id)") < daydreamGet.indexOf("prisma.petInsight.findMany"),
  "daydream ownership must be proven before private insight reads",
);
assert.ok(
  daydreamGet.indexOf("requirePetOwner(req, id)") < daydreamGet.indexOf("prisma.petInsight.updateMany"),
  "daydream ownership must be proven before mutating the seen state",
);

for (const disclosure of [
  /Paid Agent Office Runs/,
  /selected task kind and server execution contract/,
  /execution-step trace \(including tool or skill inputs and\s+outputs\)/,
  /owner-authenticated, owner-scoped product surfaces/,
  /no external action\s+connector/,
  /fail-closed recovery\s+journal in local storage/,
  /goal, selected task kind, step limit/,
  /journal itself does not store the session token or any AI\s+provider key/,
  /does not apply a shorter automatic expiry to\s+terminal run records/,
]) {
  assert.match(privacyPolicy, disclosure, `privacy policy is missing paid Agent Office disclosure: ${disclosure}`);
}

assert.equal(
  (paidAgentRoute.match(/"Cache-Control": "private, no-store, no-cache, no-transform"/g) ?? []).length,
  2,
  "paid Agent Office replay and live streams must not be cached or transformed",
);
assert.match(paidAgentReceiptRoute, /"Cache-Control": "private, no-store"/);
for (const [label, route] of [
  ["SOUL export", soulExportRoute],
  ["SOUL import", soulImportRoute],
]) {
  assert.match(route, /headers\.set\("Cache-Control", "private, no-store"\)/, `${label} responses must be private and non-cacheable`);
  assert.match(route, /return privateJson\(/, `${label} must use its private response boundary`);
}
assert.doesNotMatch(
  paidAgentRoute,
  /(?:error|detail):\s*(?:e|error|settlementError)\?*\.message/,
  "client payloads must use bounded public errors instead of raw exception messages",
);

console.log("privacy_boundary_contract=PASS");
