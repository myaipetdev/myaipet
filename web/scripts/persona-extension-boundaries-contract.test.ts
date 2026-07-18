import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { containsHangul } from "../src/lib/generatedLanguage";
import {
  normalizeChatAnalysis,
  normalizePersonaObservation,
  sanitizeStoredPersonaGeneratedFields,
} from "../src/lib/personaGeneratedLanguage";
import {
  toExtensionPetDetailView,
  toExtensionPetListView,
} from "../src/lib/extensionPetView";

const ownerSample = "안녕! 오늘 게임할래?";
const analysis = normalizeChatAnalysis({
  patterns: {
    formality: "반말",
    sentence_length: "짧음",
    emoji_usage: "많음",
    punctuation_style: "느낌표를 자주 쓸",
  },
  sampleMessages: [ownerSample],
  vocabularyStyle: "신조어를 자주 쓸",
  detectedTone: "활발함",
  detectedLanguage: "한국어",
  interests: ["게임", "music"],
});

// Owner-authored excerpts remain byte-for-byte unchanged.
assert.deepEqual(analysis.sampleMessages, [ownerSample]);
const generatedAnalysis = { ...analysis, sampleMessages: [] };
assert.equal(containsHangul(generatedAnalysis), false);
assert.deepEqual(analysis.interests, ["music"]);

const observations = normalizePersonaObservation({
  topics: ["반려동물", "gaming"],
  style: {
    avg_message_length: "짧음",
    common_phrases: "진짜, 대박",
    tone: "활발함",
  },
});
assert.equal(containsHangul(observations), false);
assert.deepEqual(observations.topics, ["gaming"]);

const stored = sanitizeStoredPersonaGeneratedFields({
  owner_bio: "사용자가 직접 쓴 소개",
  sample_messages: [ownerSample],
  vocabulary_style: "신조어를 자주 쓸",
  analyzed_patterns: { punctuation_style: "느낌표 자주 사용" },
  observed_topics: ["애완동물"],
  observed_style: { common_phrases: "대박" },
});
assert.equal(stored.owner_bio, "사용자가 직접 쓴 소개");
assert.deepEqual(stored.sample_messages, [ownerSample]);
assert.equal(containsHangul({
  vocabulary_style: stored.vocabulary_style,
  analyzed_patterns: stored.analyzed_patterns,
  observed_topics: stored.observed_topics,
  observed_style: stored.observed_style,
}), false);

const privatePetRecord = {
  id: 7,
  name: "Mochi",
  species: 1,
  personality_type: "playful",
  level: 4,
  avatar_url: "/api/media/private-avatar",
  happiness: 80,
  energy: 70,
  hunger: 20,
  bond_level: 44,
  last_interaction_at: new Date("2026-07-18T00:00:00.000Z"),
  updated_at: new Date("2026-07-18T00:00:00.000Z"),
  personality_modifiers: {
    persistent_memories: [{ content: "private memory" }],
    user_profile: [{ content: "private owner profile" }],
  },
  memories: [{ content: "private timeline" }],
  appearance_desc: "private vision description",
};

assert.deepEqual(Object.keys(toExtensionPetListView(privatePetRecord)).sort(), [
  "avatar_url", "id", "level", "name", "personality_type", "species",
]);
assert.deepEqual(Object.keys(toExtensionPetDetailView(privatePetRecord)).sort(), [
  "avatar_url", "bond_level", "energy", "happiness", "hunger", "id", "level",
  "name", "personality_type", "species",
]);
assert.equal("personality_modifiers" in toExtensionPetDetailView(privatePetRecord), false);
assert.equal("memories" in toExtensionPetDetailView(privatePetRecord), false);

const webRoot = path.resolve(import.meta.dirname, "..");
const sourceContracts: Array<[string, string[]]> = [
  ["src/lib/auth.ts", ["getAuthContext", 'credential: isExtensionToken(token) ? "extension" : "cli"']],
  ["src/app/api/pets/route.ts", ['auth.credential === "extension"', "EXTENSION_PET_LIST_SELECT", "toExtensionPetListView"]],
  ["src/app/api/pets/[petId]/route.ts", ['auth.credential === "extension"', "EXTENSION_PET_DETAIL_SELECT", "toExtensionPetDetailView"]],
  ["src/lib/services/persona.ts", ["normalizeChatAnalysis", "normalizePersonaObservation", "safeAnalysis"]],
];
for (const [relative, markers] of sourceContracts) {
  const source = fs.readFileSync(path.join(webRoot, relative), "utf8");
  for (const marker of markers) {
    assert.ok(source.includes(marker), `${relative} is missing boundary marker: ${marker}`);
  }
}

console.log("Persona and extension privacy boundaries passed");
