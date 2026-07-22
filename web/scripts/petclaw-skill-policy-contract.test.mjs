import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFile(resolve(root, path), "utf8");

const [hub, route, agent, boundedBody, generateRoute, petDateRoute, protocol, discoveryRoute, registry, serverCard] = await Promise.all([
  read("src/lib/petclaw/pethub.ts"),
  read("src/app/api/petclaw/skills/route.ts"),
  read("src/lib/petclaw/agent/tool-agent.ts"),
  read("src/lib/petclaw/bounded-json-body.ts"),
  read("src/app/api/pets/[petId]/generate/route.ts"),
  read("src/app/api/pet-date/route.ts"),
  read("src/lib/petclaw/petclaw.ts"),
  read("src/app/api/petclaw/route.ts"),
  read("src/lib/petclaw/pet-registry.ts"),
  read("src/app/.well-known/pet-card.json/route.ts"),
]);

// Built-in registry membership is not an authorization bypass. Only the two
// first-party runtime capabilities are explicitly core.
assert.match(hub, /CORE_RUNTIME_SKILL_IDS\s*=\s*new Set\(\[\s*["']companion-chat["'],\s*["']summarize-page["']/s);
assert.doesNotMatch(hub, /isBuiltIn\s*=.*price\s*===\s*0/);
assert.match(hub, /!CORE_RUNTIME_SKILL_IDS\.has\(skillId\)\s*&&\s*!install/);
assert.match(hub, /skill\.requires\?\.minLevel/);
assert.match(hub, /skill\.requires\?\.personality/);
assert.match(hub, /skillRequirementError\(skill, pet, ["']install["']\)/);
assert.match(hub, /skillRequirementError\(skill, pet, ["']execute["']\)/);
assert.match(agent, /getExecutableSkillsForPet\(petId\)/);

// Public discovery and pet cards project the same authoritative registry used
// by execution; no second copied DEFAULT_SKILLS schema may drift.
assert.doesNotMatch(protocol, /DEFAULT_SKILLS/);
assert.match(protocol, /buildManifest\(skills:\s*PetClawSkill\[\]\)/);
assert.match(discoveryRoute, /buildManifest\(BUILTIN_SKILLS\)/);
assert.match(registry, /skills:\s*getExecutableSkillsForPetSnapshot\(pet\)/);
assert.match(registry, /capabilities:\s*pet\.skills\.map\(\(skill\)\s*=>\s*skill\.id\)/);
assert.match(serverCard, /skills:\s*BUILTIN_SKILLS\.map/);
assert.match(serverCard, /availability:\s*"registry"/);
assert.match(serverCard, /petclaw-personal-access-token/);
assert.doesNotMatch(serverCard, /Export complete pet identity/);

// Manifest input validation and execute policy both happen before quota/model
// work. Blank message defaults must never turn malformed input into a paid run.
const inputValidationAt = route.indexOf("validateSkillInput(skillDef, safeInput)");
const preflightAt = route.indexOf("await assertSkillExecutableForPet");
const quotaAt = route.indexOf("await consumeDailyQuota", preflightAt);
assert.ok(
  inputValidationAt > 0 && preflightAt > inputValidationAt && quotaAt > preflightAt,
  "manifest validation and policy preflight must happen before daily quota consumption",
);
assert.doesNotMatch(hub, /rawUserMessage\s*\|\|\s*["']Hello!/);
assert.match(hub, /skill\.id !== "summarize-page"[\s\S]*replace\(\/<\/g, "‹"\)[\s\S]*<page_content>/);
assert.match(route, /owner\s*&&\s*result\.success\s*&&\s*result\.sideEffectCommitted[\s\S]*awardPointsCapped/);

// Protected body parsing is auth-first and stream-bounded; Content-Length is
// only an optimization, never the enforcement boundary.
const authAt = route.indexOf("await getAuthContext(req)");
const bodyReadAt = route.indexOf("await readBoundedJsonBody(req", authAt);
assert.ok(authAt > 0 && bodyReadAt > authAt, "skills POST must authenticate before reading JSON bytes");
assert.doesNotMatch(route, /req\.json\(\)/);
assert.match(boundedBody, /while \(true\)[\s\S]*bytesRead \+= value\.byteLength[\s\S]*bytesRead > maxBytes/);
assert.match(route, /runtimeStatus:\s*CORE_RUNTIME_SKILL_IDS\.has\(manifest\.id\)[\s\S]*?"core"/);
assert.match(route, /core runtime capability remains available/);

// LLM manifests expose the real shared envelope. API descriptors distinguish a
// list price from zero credits charged by the resolver itself.
assert.equal((hub.match(/outputSchema:\s*LLM_SKILL_OUTPUT_SCHEMA/g) || []).length, 5);
assert.match(hub, /execution:\s*"not_run"/);
assert.match(hub, /declaredPrice:\s*\{ amount: skill\.price, currency: skill\.currency \}/);
assert.match(hub, /creditsCharged:\s*0/);

// Every paid descriptor points at a canonical endpoint whose implementation
// owns the real debit and reports/retains actual charged credits.
assert.match(hub, /id:\s*"image-gen"[\s\S]*?apiUrl:\s*"\/api\/pets\/\{petId\}\/generate"[\s\S]*?credits_charged/s);
assert.match(hub, /id:\s*"video-gen"[\s\S]*?apiUrl:\s*"\/api\/pets\/\{petId\}\/generate"[\s\S]*?credits_charged/s);
assert.equal(
  (generateRoute.match(/creditReservation\s*=\s*await reserveAgentCredits\(user\.id, pet\.id, creditCost, "pet_generation"\)/g) || []).length,
  1,
  "generation may reserve credits exactly once",
);
assert.equal(
  (generateRoute.match(/commitAgentCreditsWithDb\(tx, creditReservation\)/g) || []).length,
  2,
  "image and video must commit the durable reservation with their Generation row",
);
assert.match(generateRoute, /refundAgentCreditsOnce\(creditReservation\)/);
assert.doesNotMatch(generateRoute, /credits:\s*\{\s*(?:decrement|increment):\s*(?:creditCost|reserved)\s*\}/);
assert.match(generateRoute, /credits_charged:\s*actualCost/);
assert.match(generateRoute, /credits_charged:\s*creditCost/);
assert.match(generateRoute, /readBoundedJsonBody\(req, 8 \* 1024\)/);
assert.doesNotMatch(generateRoute, /await req\.json\(\)/);
assert.match(generateRoute, /style must be an integer from 0 to 6/);
assert.match(generateRoute, /\[3, 5, 10\]\.includes/);
assert.match(generateRoute, /style === 0 && !pet\.avatar_url/);
assert.match(hub, /id:\s*"image-gen"[\s\S]*required:\s*\["type", "style"\]/);
assert.match(hub, /id:\s*"video-gen"[\s\S]*required:\s*\["type", "style", "duration"\]/);
assert.match(petDateRoute, /const COST_CREDITS = 20/);
assert.match(petDateRoute, /reserveAgentCredits\(user\.id, mine\.id, COST_CREDITS, "pet_date"\)/);
assert.match(petDateRoute, /commitAgentCreditsWithDb\(tx, reservation\)/);
assert.match(petDateRoute, /refund:\s*refundAgentCreditsOnce/);
assert.doesNotMatch(petDateRoute, /credits:\s*\{\s*(?:decrement|increment):\s*COST_CREDITS\s*\}/);

// Plaintext config is an allowlisted flat preference schema. Credential header,
// cookie/session, webhook, Slack token and JWT-shaped bypasses are rejected;
// legacy rows lose their whole config when any field is unsafe.
for (const marker of [
  "SKILL_CONFIG_SCHEMAS",
  "authorization",
  "bearer",
  "cookie",
  "webhook",
  "jwt",
  "session",
  "xox[baprs]",
  "hooks\\.slack\\.com",
]) {
  assert.ok(hub.toLowerCase().includes(marker.toLowerCase()), `missing credential defense: ${marker}`);
}
assert.match(hub, /if \(!schema\)[\s\S]*ok:\s*false/);
assert.match(hub, /Fail closed for legacy rows:[\s\S]*delete next\.config/);
assert.match(route, /validateSkillConfig\(String\(skillId\), config\)/);

// Generic companion calls preserve a bounded surface/session lineage and carry
// the request-start memory epoch through both retention writers.
assert.match(hub, /MEMORY_SKILL_SURFACES\s*=\s*new Set/);
assert.match(hub, /normalizeMemorySessionId\(input\.sessionId, surface\)/);
assert.match(hub, /return `\$\{surface\}-\$\{randomUUID\(\)\}`/);
assert.match(hub, /const requestMemoryEpoch = pet\.memory_epoch/);
assert.match(hub, /retainFromConversation\([\s\S]*?requestMemoryEpoch,[\s\S]*?\)/);
assert.match(
  hub,
  /observeConversation\(\s*userMessage,\s*reply,\s*0\.5,\s*requestMemoryEpoch,\s*onProviderAttempt,\s*signal,\s*\)/,
);
assert.match(hub, /lineage:\s*\{[\s\S]*surface,[\s\S]*sessionId,[\s\S]*memoryRetained,[\s\S]*memoryFenced/);
assert.match(hub, /inference:\s*\{ provider: out\.provider, model: out\.model, source: out\.source \}/);
assert.match(hub, /sideEffectCommitted:[\s\S]*lineage\?\.memoryRetained[\s\S]*lineage\?\.learningUpdated/);
assert.match(hub, /isProviderSafeRetainedText\(`pet_name \$\{pet\.name\}`\)[\s\S]*?"your pet"/);
const degradedDeclarationAt = hub.indexOf("const degraded = generatedReply === null");
const guardedRetentionAt = hub.indexOf("&& !degraded", degradedDeclarationAt);
const retentionCallAt = hub.indexOf(".retainFromConversation(", guardedRetentionAt);
assert.ok(
  degradedDeclarationAt > 0
    && guardedRetentionAt > degradedDeclarationAt
    && retentionCallAt > guardedRetentionAt,
  "degraded output must be classified before and excluded from retention/self-learning",
);
assert.match(
  hub.slice(degradedDeclarationAt, retentionCallAt),
  /!executionPolicy\.readOnly[\s\S]*!executionPolicy\.noRetention/,
  "paid read-only execution must reach no retention writer",
);

console.log("petclaw_skill_policy_contract=PASS");
