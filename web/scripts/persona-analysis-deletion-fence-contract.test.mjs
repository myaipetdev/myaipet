import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const webRoot = fileURLToPath(new URL("../", import.meta.url));
const read = (path) => readFileSync(`${webRoot}${path}`, "utf8");

const route = read("src/app/api/pets/[petId]/persona/analyze/route.ts");
const service = read("src/lib/services/persona.ts");
const integration = read("scripts/petclaw-memory-races.integration.ts");

const epochCapture = route.indexOf("const analysisEpoch = pet.memory_epoch;");
const providerCall = route.indexOf("await analyzeChatHistory(pid, chatText)");
const guardedSave = route.indexOf("saveChatAnalysis(pid, analysis, analysisEpoch)");
const checkpoint = route.indexOf('recordCheckpoint(pid, "chat_analysis")');

assert.ok(epochCapture >= 0, "persona analysis must capture its starting memory epoch");
assert.ok(providerCall > epochCapture, "the epoch must be captured before provider analysis");
assert.ok(guardedSave > providerCall, "the provider result must save against the captured epoch");
assert.match(route, /if \(!persona\) \{[\s\S]*?code: "persona_analysis_stale"[\s\S]*?discarded: true[\s\S]*?status: 409/);
assert.ok(checkpoint > guardedSave, "a discarded analysis must return before checkpointing");

assert.match(
  service,
  /saveChatAnalysis\([\s\S]*?expectedEpoch: number,[\s\S]*?Promise<PersonaData \| null>/,
);
const staleGuard = service.indexOf("if (pet.memory_epoch !== expectedEpoch) return null;");
const upsert = service.indexOf("const saved = await tx.petPersona.upsert", staleGuard);
assert.ok(staleGuard >= 0, "saveChatAnalysis must reject a changed memory epoch under the pet lock");
assert.ok(upsert > staleGuard, "the epoch guard must run before the persona upsert");

assert.match(integration, /saveChatAnalysis\(pet\.id,[\s\S]*?beforeEpoch\)/);
assert.match(integration, /pre-clear persona analysis must be discarded/);
assert.match(integration, /stale persona analysis must not recreate the cleared persona/);

console.log("persona_analysis_deletion_fence_contract=PASS");
