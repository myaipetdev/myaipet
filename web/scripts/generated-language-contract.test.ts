import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  containsHangul,
  generatedEnglishOrFallback,
  generatedEnglishOrNull,
} from "../src/lib/generatedLanguage";

assert.equal(containsHangul("English only"), false);
assert.equal(containsHangul("hello \uC548\uB155"), true);
assert.equal(containsHangul("\u3131"), true);
assert.equal(containsHangul({ nested: ["safe", { reply: "\uBC18\uAC00\uC6CC" }] }), true);
assert.equal(generatedEnglishOrNull("  Welcome back!  "), "Welcome back!");
assert.equal(generatedEnglishOrNull("\uB2E4\uC2DC \uB9CC\uB098\uC11C \uBC18\uAC00\uC6CC"), null);
assert.equal(generatedEnglishOrFallback("\uC548\uB155", "Welcome back!"), "Welcome back!");
assert.throws(() => generatedEnglishOrFallback("", "\uC548\uB155"));

const webRoot = path.resolve(import.meta.dirname, "..");
const requiredBoundaries: Array<[string, string[]]> = [
  ["src/app/api/pets/[petId]/chat/route.ts", ["generatedEnglishOrFallback", "role === \"user\""]],
  ["src/app/api/pets/[petId]/greeting/route.ts", ["generatedEnglishOrFallback", "generatedEnglishOrNull"]],
  ["src/app/api/pets/[petId]/diary/route.ts", ["generatedEnglishOrFallback", "generatedEnglishOrNull"]],
  ["src/app/api/pets/[petId]/thought/route.ts", ["generatedEnglishOrFallback", "generatedEnglishOrNull"]],
  ["src/app/api/pets/[petId]/daydream/route.ts", ["containsHangul"]],
  ["src/app/api/pets/adopt-chat/route.ts", ["generatedEnglishOrFallback"]],
  ["src/app/api/pet-date/route.ts", ["runReservedPetDate"]],
  ["src/lib/petDateContract.ts", ["containsHangul(value)"]],
  ["src/app/api/petclaw/memory/route.ts", ["generatedEnglishOrFallback", "containsHangul"]],
  ["src/app/api/petclaw/mission-control/route.ts", ["containsHangul"]],
  ["src/app/api/pets/[petId]/agent/messages/route.ts", ["generatedEnglishOrFallback"]],
  ["src/app/api/pets/[petId]/memories/route.ts", ["generatedEnglishOrFallback", "ownerAuthored"]],
  ["src/app/api/pets/[petId]/memories/list/route.ts", ["containsHangul", "visibleRawItems"]],
  ["src/app/api/pets/[petId]/route.ts", ["containsHangul"]],
  ["src/app/api/agent/cron/activity/route.ts", ["generatedEnglishOrFallback"]],
  ["src/app/api/cron/daydream-to-video/route.ts", ["generatedEnglishOrFallback"]],
  ["src/app/api/studio/prompt-director/route.ts", ["containsHangul(cleaned)"]],
  ["src/lib/petclaw/memory/daydream.ts", ["generatedEnglishOrNull", "isProviderSafeRetainedText"]],
  ["src/lib/petclaw/memory/persistent-memory.ts", ["containsHangul(parsed)"]],
  ["src/lib/petclaw/memory/bond-loop.ts", ["generatedEnglishOrNull", "isProviderSafeRetainedText"]],
  ["src/lib/petclaw/memory/consolidate.ts", ["containsHangul(parsed)"]],
  ["src/lib/petclaw/pethub.ts", ["generatedEnglishOrFallback"]],
  ["src/lib/petclaw/agent/plan-execute.ts", ["generatedEnglishOrFallback", "generatedEnglishOrNull"]],
  ["src/lib/petclaw/agent/tool-agent.ts", ["AGENT_REPLY_FALLBACK", "generatedEnglishOrNull", "answerDelivered: false"]],
  ["src/lib/services/pet-agent.ts", ["generatedEnglishOrFallback", "generatedEnglishOrNull"]],
  ["src/lib/services/persona.ts", ["normalizeChatAnalysis", "normalizePersonaObservation", "safeAnalysis"]],
  ["src/lib/personaGeneratedLanguage.ts", ["generatedEnglishOrFallback", "rawSampleMessages", "sanitizeStoredPersonaGeneratedFields"]],
  ["src/lib/catch/vision.ts", ["generatedEnglishOrFallback", "generatedEnglishOrNull"]],
  ["src/lib/services/video.ts", ["generatedEnglishOrNull"]],
];

for (const [relative, markers] of requiredBoundaries) {
  const source = fs.readFileSync(path.join(webRoot, relative), "utf8");
  for (const marker of markers) {
    assert.ok(source.includes(marker), `${relative} is missing generated-language boundary: ${marker}`);
  }
}

console.log("Generated-language contract passed");
