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

const ownerSample = "\uc548\ub155! \uc624\ub298 \uac8c\uc784\ud560\ub798?";
const analysis = normalizeChatAnalysis({
  patterns: {
    formality: "\ubc18\ub9d0",
    sentence_length: "\uc9e7\uc74c",
    emoji_usage: "\ub9ce\uc74c",
    punctuation_style: "\ub290\ub08c\ud45c\ub97c \uc790\uc8fc \uc4f8",
  },
  sampleMessages: [ownerSample],
  vocabularyStyle: "\uc2e0\uc870\uc5b4\ub97c \uc790\uc8fc \uc4f8",
  detectedTone: "\ud65c\ubc1c\ud568",
  detectedLanguage: "\ud55c\uad6d\uc5b4",
  interests: ["\uac8c\uc784", "music"],
});

// Owner-authored excerpts remain byte-for-byte unchanged.
assert.deepEqual(analysis.sampleMessages, [ownerSample]);
const generatedAnalysis = { ...analysis, sampleMessages: [] };
assert.equal(containsHangul(generatedAnalysis), false);
assert.deepEqual(analysis.interests, ["music"]);

const observations = normalizePersonaObservation({
  topics: ["\ubc18\ub824\ub3d9\ubb3c", "gaming"],
  style: {
    avg_message_length: "\uc9e7\uc74c",
    common_phrases: "\uc9c4\uc9dc, \ub300\ubc15",
    tone: "\ud65c\ubc1c\ud568",
  },
});
assert.equal(containsHangul(observations), false);
assert.deepEqual(observations.topics, ["gaming"]);

const stored = sanitizeStoredPersonaGeneratedFields({
  owner_bio: "\uc0ac\uc6a9\uc790\uac00 \uc9c1\uc811 \uc4f4 \uc18c\uac1c",
  sample_messages: [ownerSample],
  vocabulary_style: "\uc2e0\uc870\uc5b4\ub97c \uc790\uc8fc \uc4f8",
  analyzed_patterns: { punctuation_style: "\ub290\ub08c\ud45c \uc790\uc8fc \uc0ac\uc6a9" },
  observed_topics: ["\uc560\uc644\ub3d9\ubb3c"],
  observed_style: { common_phrases: "\ub300\ubc15" },
});
assert.equal(stored.owner_bio, "\uc0ac\uc6a9\uc790\uac00 \uc9c1\uc811 \uc4f4 \uc18c\uac1c");
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
