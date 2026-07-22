import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  isProviderSafeRetainedText,
  type MemoryEntry,
  type UserProfile,
} from "../src/lib/petclaw/memory/persistent-memory";
import {
  rankProviderSafeRetrievalCandidates,
  type CandidateRow,
} from "../src/lib/petclaw/memory/retrieval";
import {
  buildPersonaContext,
  isPersonaAnalysisProviderSafe,
  selectProviderSafePersonaObservations,
  type PersonaData,
} from "../src/lib/services/persona";
import { buildConsolidationProviderContext } from "../src/lib/petclaw/memory/consolidate";
import { buildDaydreamProviderNotes } from "../src/lib/petclaw/memory/daydream";
import { formatProviderSafeBondNotes } from "../src/lib/petclaw/memory/bond-loop";
import {
  selectProviderConversationContext,
  selectProviderPetMemories,
} from "../src/lib/services/pet-agent";
import { buildPetSystemPrompt } from "../src/lib/personality";
import {
  buildDiaryProviderMemory,
  buildThoughtProviderMemory,
  providerSafeGreetingMemories,
} from "../src/lib/petclaw/memory/provider-context";
import { normalizedChatSession } from "../src/lib/petclaw/chat-session";
import { ownerTaskScopeMatches } from "../src/lib/llm/platform-resilience";
import { isProviderSafeBestOfNContext } from "../src/lib/petclaw/memory/best-of-n";
import { providerSafeStoredText } from "../src/lib/petclaw/provider-safe-text";

const now = "2026-07-22T00:00:00.000Z";
const date = new Date(now);
const SECRET_SK = "sk-project-super-secret-123456789";
const SECRET_PASSWORD = "deployment_password hunter-two-private";
const SECRET_JWT = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signature1234";
const HANGUL = "비공개 기억";
const SAFE_RELEVANT = "The owner prefers concise TypeScript extension reviews.";
const SAFE_IRRELEVANT = "The owner enjoys alpine train journeys.";
const forbidden = [SECRET_SK, "hunter-two-private", SECRET_JWT, HANGUL];

function assertProviderSafe(value: unknown, label: string) {
  const serialized = typeof value === "string" ? value : JSON.stringify(value);
  for (const secret of forbidden) {
    assert.equal(serialized.includes(secret), false, `${label} leaked ${secret}`);
  }
}

for (const unsafe of [SECRET_SK, SECRET_PASSWORD, SECRET_JWT, HANGUL, `token abcdef123456`]) {
  assert.equal(isProviderSafeRetainedText(unsafe), false, `unsafe fixture accepted: ${unsafe}`);
}
assert.equal(isProviderSafeRetainedText(SAFE_RELEVANT), true);
const cappedStoredText = providerSafeStoredText("safe ".repeat(1_000), "appearance", 200);
assert.ok(cappedStoredText && cappedStoredText.length <= 200 && cappedStoredText.length >= 190);
assert.equal(
  providerSafeStoredText(`${"safe ".repeat(1_000)} ${SECRET_SK}`, "appearance", 200),
  null,
  "a secret beyond the output cap must reject the complete stored value before slicing",
);
assert.equal(providerSafeStoredText(HANGUL, "appearance", 200), null);
assert.equal(isPersonaAnalysisProviderSafe(`A long safe transcript about ${SAFE_RELEVANT}`), true);
for (const unsafe of [SECRET_SK, SECRET_PASSWORD, SECRET_JWT, HANGUL]) {
  assert.equal(isPersonaAnalysisProviderSafe(`A transcript containing ${unsafe}`), false);
}
assert.deepEqual(
  selectProviderSafePersonaObservations([SAFE_RELEVANT, SECRET_SK, SECRET_PASSWORD, SECRET_JWT, HANGUL]),
  [SAFE_RELEVANT],
);

const explicitSession = normalizedChatSession("sdk-client-7", "sdk");
assert.equal(explicitSession, "sdk-client-7");
const omittedSessionA = normalizedChatSession(undefined, "sdk");
const omittedSessionB = normalizedChatSession(undefined, "sdk");
assert.notEqual(omittedSessionA, omittedSessionB);
assert.match(omittedSessionA, /^sdk-ephemeral-/);
assert.match(normalizedChatSession("invalid session id", "web"), /^web-ephemeral-/);
assert.equal(ownerTaskScopeMatches("chat", []), true);
assert.equal(ownerTaskScopeMatches("reason", []), true);
assert.equal(ownerTaskScopeMatches("judge", []), true);
assert.equal(ownerTaskScopeMatches("extract", []), false);
assert.equal(ownerTaskScopeMatches("summarize", []), false);
assert.equal(ownerTaskScopeMatches("persona", []), false);
assert.equal(ownerTaskScopeMatches("extract", ["chat"]), false);
assert.equal(ownerTaskScopeMatches("extract", ["extract"]), true, "legacy invalid scope must reach fail-closed validation");
assert.equal(isProviderSafeBestOfNContext(
  [{ text: "A safe answer", temperature: 0.8 }],
  { userMessage: SAFE_RELEVANT, systemPrompt: "Safe character context" },
), true);
assert.equal(isProviderSafeBestOfNContext(
  [{ text: "A safe answer", temperature: 0.8 }],
  { userMessage: SECRET_PASSWORD, systemPrompt: "Safe character context" },
), false);

// Full-corpus retrieval: unsafe rows are removed before ranking/embedding
// decisions, and safe-but-irrelevant rows cannot be ranked into this query.
const candidates: CandidateRow[] = [
  { id: 1, content: SAFE_RELEVANT, memory_type: "conversation", emotion: "calm", importance: 3, created_at: date },
  { id: 2, content: SAFE_IRRELEVANT, memory_type: "conversation", emotion: "calm", importance: 5, created_at: date },
  { id: 3, content: SECRET_SK, memory_type: "production_api_key", emotion: "calm", importance: 5, created_at: date },
  { id: 4, content: SECRET_PASSWORD, memory_type: "conversation", emotion: "calm", importance: 5, created_at: date },
  { id: 5, content: SECRET_JWT, memory_type: "conversation", emotion: "calm", importance: 5, created_at: date },
  { id: 6, content: HANGUL, memory_type: "conversation", emotion: "calm", importance: 5, created_at: date },
];
const ranked = rankProviderSafeRetrievalCandidates(candidates, "TypeScript extension review", 6);
assert.deepEqual(ranked.map((memory) => memory.id), [1]);
assertProviderSafe(ranked, "retrieval");

const persona: PersonaData = {
  id: 1,
  pet_id: 1,
  owner_speech_style: "concise",
  owner_interests: `${SAFE_RELEVANT} ${SAFE_IRRELEVANT}`,
  owner_expressions: SECRET_PASSWORD,
  owner_tone: "warm",
  owner_language: "en",
  owner_bio: SECRET_SK,
  analyzed_patterns: { formality: "casual", punctuation_style: SECRET_JWT },
  sample_messages: [SAFE_RELEVANT, SAFE_IRRELEVANT, SECRET_SK, SECRET_PASSWORD, SECRET_JWT, HANGUL],
  vocabulary_style: "direct technical vocabulary",
  observed_topics: ["TypeScript extension tooling", SAFE_IRRELEVANT, SECRET_SK],
  observed_style: { avg_message_length: "short", common_phrases: SECRET_PASSWORD },
  last_observed_at: date,
  persona_version: 1,
};
const personaContext = buildPersonaContext(persona, "TypeScript extension review");
assert.match(personaContext, /concise TypeScript extension reviews/);
assert.doesNotMatch(personaContext, /alpine train/i);
assertProviderSafe(personaContext, "persona");

const momentRows = [
  { id: 1, content: SAFE_RELEVANT, emotion: "happy", created_at: date },
  { id: 2, content: SECRET_SK, emotion: "calm", created_at: date },
  { id: 3, content: SECRET_PASSWORD, emotion: "calm", created_at: date },
  { id: 4, content: SECRET_JWT, emotion: "calm", created_at: date },
  { id: 5, content: HANGUL, emotion: "calm", created_at: date },
];
const thoughtContext = buildThoughtProviderMemory(momentRows);
const diaryContext = buildDiaryProviderMemory(momentRows.map(({ id, content, created_at }) => ({ id, content, created_at })));
const greetingContext = providerSafeGreetingMemories(momentRows.map(({ id, content, created_at }) => ({ id, content, created_at })));
for (const [label, value] of [
  ["thought", thoughtContext],
  ["diary", diaryContext],
  ["greeting", greetingContext],
] as const) {
  assert.match(JSON.stringify(value), /TypeScript extension reviews/);
  assertProviderSafe(value, label);
}

const memory = (key: string, content: string, category: MemoryEntry["category"] = "fact"): MemoryEntry => ({
  key, content, category, importance: 3, source: "chat", createdAt: now, updatedAt: now,
});
const profile = (key: string, content: string, category: UserProfile["category"] = "context"): UserProfile => ({
  key, content, category, source: "chat", updatedAt: now,
});
const storedMemories = [
  memory("typescript_extension", SAFE_RELEVANT),
  memory("production_api_key", SECRET_SK),
  memory("deployment_password", "hunter-two-private"),
  memory("auth_token", SECRET_JWT),
  memory("legacy_note", HANGUL),
];
const storedProfile = [
  profile("review_style", SAFE_RELEVANT, "communication"),
  profile("owner_name", "Alice", "identity"),
  profile("password", "hunter-two-private"),
];
const consolidation = buildConsolidationProviderContext(storedMemories, storedProfile, [
  { content: SAFE_RELEVANT, memory_type: "session_web", created_at: date },
  { content: SECRET_SK, memory_type: "session_web", created_at: date },
  { content: SECRET_JWT, memory_type: "session_web", created_at: date },
  { content: HANGUL, memory_type: "session_web", created_at: date },
]);
assert.match(`${consolidation.memoryText}\n${consolidation.profileText}\n${consolidation.turnsText}`, /TypeScript extension reviews/);
assert.equal(consolidation.protectedMemories.length, 4);
assert.equal(consolidation.protectedUserProfile.length, 2);
assertProviderSafe(
  `${consolidation.memoryText}\n${consolidation.profileText}\n${consolidation.turnsText}`,
  "consolidation",
);

const daydreamNotes = buildDaydreamProviderNotes(storedMemories, storedProfile);
assert.match(JSON.stringify(daydreamNotes), /TypeScript extension reviews/);
assertProviderSafe(daydreamNotes, "daydream");
assert.equal(daydreamNotes.some((note) => note.key === "user:owner_name"), false);

const bondContext = formatProviderSafeBondNotes([
  { date: now.slice(0, 10), note: SAFE_RELEVANT },
  { date: now.slice(0, 10), note: SECRET_SK },
  { date: now.slice(0, 10), note: SECRET_PASSWORD },
  { date: now.slice(0, 10), note: SECRET_JWT },
  { date: now.slice(0, 10), note: HANGUL },
]);
assert.match(bondContext, /TypeScript extension reviews/);
assertProviderSafe(bondContext, "bond");

const agentRows = [
  { direction: "incoming", content: SAFE_RELEVANT },
  { direction: "incoming", content: SAFE_IRRELEVANT },
  { direction: "incoming", content: SECRET_SK },
  { direction: "incoming", content: SECRET_PASSWORD },
  { direction: "outgoing", content: SECRET_JWT },
  { direction: "incoming", content: HANGUL },
];
const agentHistory = selectProviderConversationContext(agentRows, "TypeScript extension review", 8);
const agentMemories = selectProviderPetMemories(
  agentRows.map((row) => ({ content: row.content, emotion: "calm" })),
  "TypeScript extension review",
  5,
);
assert.deepEqual(agentHistory.map((message) => message.content), [SAFE_RELEVANT]);
assert.deepEqual(agentMemories.map((entry) => entry.content), [SAFE_RELEVANT]);
assertProviderSafe([agentHistory, agentMemories], "pet-agent");

const defensiveSystemPrompt = buildPetSystemPrompt({
  name: HANGUL,
  level: 4,
  personality_type: "friendly",
  happiness: 80,
  energy: 80,
  hunger: 20,
  bond_level: 20,
  total_interactions: 10,
  personality_modifiers: { custom_traits: SECRET_PASSWORD },
}, [
  { content: SAFE_RELEVANT, emotion: "happy" },
  { content: SECRET_SK, emotion: "calm" },
], { personaContext });
assert.match(defensiveSystemPrompt, /TypeScript extension reviews/);
assert.match(defensiveSystemPrompt, /You are your pet/);
assertProviderSafe(defensiveSystemPrompt, "shared pet system prompt");

// Static wiring checks keep every audited production path on the tested
// boundary rather than allowing a future inline raw interpolation to bypass it.
const wiring: Array<[string, RegExp]> = [
  ["src/app/api/pets/[petId]/chat/route.ts", /buildPersonaContext\(persona, message\.trim\(\)\)/],
  ["src/app/api/pets/[petId]/thought/route.ts", /buildThoughtProviderMemory\(recent\)/],
  ["src/app/api/pets/[petId]/diary/route.ts", /buildDiaryProviderMemory\(recent\)/],
  ["src/app/api/pets/[petId]/greeting/route.ts", /providerSafeGreetingMemories\(mems\)/],
  ["src/lib/petclaw/memory/consolidate.ts", /buildConsolidationProviderContext\(memories, userProfile, recentTurns\)/],
  ["src/lib/petclaw/memory/daydream.ts", /buildDaydreamProviderNotes\(memories, profile\)/],
  ["src/lib/petclaw/memory/bond-loop.ts", /providerSafeBondReflections\(existing\)/],
  ["src/lib/services/pet-agent.ts", /selectProviderConversationContext\(messages, query, limit\)/],
  ["src/app/api/cron/embed-memories/route.ts", /isProviderSafeRetainedText\(`embedding_memory/],
  ["src/app/api/pets/[petId]/persona/analyze/route.ts", /analyzeChatHistory\(pid, chatText\)/],
];
for (const [path, expected] of wiring) {
  assert.match(readFileSync(path, "utf8"), expected, `${path} bypassed provider-safe context wiring`);
}

console.log("provider_context_privacy_contract=PASS");
