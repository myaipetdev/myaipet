import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(scriptDir, "..");
const repositoryRoot = resolve(webRoot, "..");

// Node's native TypeScript loader intentionally follows strict ESM resolution.
// The app uses Next's @/* alias and extensionless TS imports, so this test-only
// hook mirrors those two resolution rules without starting Next or a database.
registerHooks({
  resolve(specifier, context, nextResolve) {
    const candidates = [];
    if (specifier.startsWith("@/")) {
      candidates.push(resolve(webRoot, "src", specifier.slice(2)));
    } else if (specifier === "@prisma/client/runtime/client") {
      // Prisma's generated TS uses an extensionless runtime subpath; Node's
      // strict ESM resolver does not append .js outside Next's bundler.
      candidates.push(resolve(webRoot, "node_modules/@prisma/client/runtime/client.js"));
    } else if (specifier.startsWith(".") && context.parentURL?.startsWith("file:")) {
      candidates.push(resolve(dirname(fileURLToPath(context.parentURL)), specifier));
    }
    for (const base of candidates) {
      for (const candidate of [base, `${base}.ts`, `${base}.tsx`, resolve(base, "index.ts")]) {
        if (existsSync(candidate)) return { url: pathToFileURL(candidate).href, shortCircuit: true };
      }
    }
    return nextResolve(specifier, context);
  },
});

process.env.DATABASE_URL ||= "postgresql://contract-test:contract-test@127.0.0.1:9/unused";
process.env.NODE_ENV = "test";

const schemaModule = await import(pathToFileURL(resolve(webRoot, "src/lib/petclaw/soul-schema.ts")));
const webProtocol = await import(pathToFileURL(resolve(webRoot, "src/lib/petclaw/petclaw.ts")));
const sdkProtocol = await import(pathToFileURL(resolve(repositoryRoot, "packages/petclaw/src/protocol.ts")));
const sovereignty = await import(pathToFileURL(resolve(webRoot, "src/lib/petclaw/data-sovereignty.ts")));

const {
  SOUL_IMPORT_MAX_BYTES,
  getSoulExportByteLength,
  readSoulImportJson,
  validateSoulExport,
} = schemaModule;

const memories = Array.from({ length: 1_200 }, (_, index) => ({
  type: index % 2 ? "conversation" : "milestone",
  content: `memory-${index}: ${"a long conversation and a companion's memory ".repeat(24)}`,
  emotion: index % 2 ? "happy" : "calm",
  importance: (index % 5) + 1,
  createdAt: new Date(Date.UTC(2025, 0, 1, 0, index % 60)).toISOString(),
}));

const agentMessages = Array.from({ length: 1_000 }, (_, index) => ({
  id: index + 1,
  pet_id: 999,
  platform: "telegram",
  direction: index % 2 ? "in" : "out",
  message_type: "text",
  content: `history-${index}: ${"conversation history ".repeat(70)}`,
  platform_msg_id: `foreign-message-${index}`,
  chat_id: "foreign-chat-owner",
  credits_used: 4,
  metadata: {
    keep: "portable context",
    access_token: "must-not-restore",
    owner_wallet: "0x1111111111111111111111111111111111111111",
    source_user_id: 444,
    nested: {
      webhook_secret: "must-not-restore",
      from_wallet: "0x2222222222222222222222222222222222222222",
      external_account_id: "foreign-account",
    },
  },
  created_at: "2026-01-01T00:00:00.000Z",
}));

const conversations = Array.from({ length: 400 }, (_, index) => ({
  id: index + 1,
  pet_id: 999,
  platform: "telegram",
  chat_id: `foreign-chat-${index}`,
  participant_name: `Friend ${index}`,
  summary: `summary-${index}: ${"long conversation summary ".repeat(100)}`,
  message_count: 50,
  created_at: "2026-01-01T00:00:00.000Z",
}));

const source = {
  protocol: "petclaw-v1",
  version: "1.0.0",
  exportedAt: "2026-07-17T00:00:00.000Z",
  pet: {
    name: "Contract Buddy",
    species: 1,
    personalityType: "friendly",
    element: "normal",
    level: 12,
    experience: 2_400,
    happiness: 88,
    bondLevel: 42,
    evolutionStage: 1,
    avatarUrl: "/uploads/source-private-avatar.png",
    appearanceDesc: "A synthetic contract-test pet",
  },
  persona: {
    speechStyle: "warm",
    interests: "round trips",
    tone: "gentle",
    language: "en",
    analyzedPatterns: { z: 2, a: 1 },
  },
  memories,
  skills: [{ key: "companion-chat", level: 2, slot: 0 }],
  checkpoints: [],
  consent: {
    allowPublicProfile: false,
    allowDataSharing: false,
    allowAITraining: false,
    allowInteraction: false,
  },
  persistentMemory: {
    memories: [{ key: "favorite", content: "walks", access_token: "drop-me" }],
    userProfile: [{ key: "name", value: "Max" }],
  },
  learningData: { patterns: [{ pattern: "likes concise replies" }] },
  linkedData: {
    petState: {
      energy: 77,
      hunger: 21,
      total_interactions: 1_500,
      atk: 999_999,
      def: 999_999,
      spd: 999_999,
      care_streak: 999_999,
      personality_modifiers: {
        custom_traits: "patient",
        wallet_balance: 9_999,
        token_hash: "must-not-restore",
        provider_token: "must-not-restore",
      },
    },
    agentMessages,
    conversations,
    agentSchedule: {
      is_enabled: true,
      daily_credit_limit: 80,
      credits_used_today: 60,
      preferred_platform: "telegram",
    },
    battleHistory: [
      { source_role: "player", opponent_name: "Rival", won: true, turns: 3, tx_hash: "0xforeign" },
      { source_role: "opponent", opponent_name: "Foreign player", won: false, turns: 4 },
    ],
    interactions: [{ interaction_type: "chat", experience_gained: 999_999, created_at: "2026-01-01T00:00:00.000Z" }],
    trainingLogs: [{ date: "2026-01-01T00:00:00.000Z", battles: 999_999, exp_earned: 999_999_999, credits_spent: 0 }],
    pveProgress: [{ stage_id: 999_999, stars: 3 }],
    equippedItems: [{ slot: "weapon", item: { key: "legendary" } }],
    platformConnections: [{ platform: "telegram", credentials: "never", webhook_secret: "never" }],
    loras: [{ fal_request_id: "foreign-job", lora_url: "https://provider.invalid/model" }],
    linkedGenerations: [{ id: 1, photo_path: "/uploads/foreign-private.png", user_id: 444 }],
    paidActions: [{ user_id: 444, tx_hash: "0xforeign-payment" }],
    inheritanceEvents: [{ from_wallet: "0x111", to_wallet: "0x222" }],
  },
};

const webHash = webProtocol.computeIntegrityHash(source);
const sdkHash = sdkProtocol.computeIntegrityHash(source);
assert.equal(sdkHash, webHash, "SDK and server must compute the same canonical hash");

const soulExport = { ...source, integrityHash: webHash };
assert.equal(webProtocol.verifySoulExport(soulExport), true);
assert.equal(sdkProtocol.verifySoulExport(soulExport), true);

const byteLength = getSoulExportByteLength(soulExport);
assert.ok(byteLength > 2 * 1024 * 1024, `fixture must be multi-MB, got ${byteLength} bytes`);
assert.ok(byteLength < SOUL_IMPORT_MAX_BYTES, "fixture must stay under the documented cap");

const validation = validateSoulExport(soulExport);
assert.equal(validation.ok, true, validation.ok ? undefined : validation.error);
assert.equal(validation.data.memories.length, 1_200, "exports with >500 memories must validate");

const oversizedAppearanceSource = structuredClone(source);
oversizedAppearanceSource.pet.appearanceDesc = "safe appearance ".repeat(200);
const oversizedAppearance = {
  ...oversizedAppearanceSource,
  integrityHash: webProtocol.computeIntegrityHash(oversizedAppearanceSource),
};
assert.equal(
  validateSoulExport(oversizedAppearance).ok,
  false,
  "SOUL appearanceDesc must match the 2000-character pet PATCH boundary",
);

const serialized = JSON.stringify(soulExport);
const streamed = await readSoulImportJson(new Request("https://contract.invalid/import", {
  method: "POST",
  headers: { "content-type": "application/json", "content-length": "1" },
  body: serialized,
}));
assert.equal(streamed.ok, true, streamed.ok ? undefined : streamed.error);
assert.equal(streamed.bytes, new TextEncoder().encode(serialized).byteLength);
assert.equal(validateSoulExport(streamed.data).ok, true);

const tampered = structuredClone(soulExport);
tampered.memories[0].content = "tampered";
assert.equal(webProtocol.verifySoulExport(tampered), false, "memory text tampering must invalidate the hash");
assert.equal(sdkProtocol.verifySoulExport(tampered), false, "SDK verification must reject the same tampering");

const reorderedSource = {
  ...source,
  persona: { ...source.persona, analyzedPatterns: { a: 1, z: 2 } },
  linkedData: Object.fromEntries(Object.entries(source.linkedData).reverse()),
};
assert.equal(webProtocol.computeIntegrityHash(reorderedSource), webHash, "object key order must not affect the hash");

const prototypeKeySource = structuredClone(source);
prototypeKeySource.linkedData.prototypeProbe = JSON.parse('{"__proto__":{"polluted":true},"safe":"value"}');
const prototypeWebHash = webProtocol.computeIntegrityHash(prototypeKeySource);
assert.equal(sdkProtocol.computeIntegrityHash(prototypeKeySource), prototypeWebHash);
assert.equal({}.polluted, undefined, "canonical hashing must not allow prototype-key mutation");

const oversizedJson = JSON.stringify({ padding: "x".repeat(SOUL_IMPORT_MAX_BYTES) });
const oversized = await readSoulImportJson(new Request("https://contract.invalid/import", {
  method: "POST",
  headers: { "content-type": "application/json", "content-length": "1" },
  body: oversizedJson,
}));
assert.equal(oversized.ok, false);
assert.equal(oversized.kind, "too_large", "actual streamed bytes must defeat a forged Content-Length");

const captured = {};
const createManyDelegate = (name) => ({
  async createMany({ data }) {
    captured[name] ||= [];
    captured[name].push(...data);
    return { count: data.length };
  },
});
const transactionClient = {
  async $queryRaw() { return [{ id: 7, pet_slots: 3 }]; },
  user: { async findUnique() { return { id: 7, pet_slots: 3 }; } },
  pet: {
    async count() { return 0; },
    async create({ data }) { captured.pet = data; return { id: 77, ...data }; },
  },
  petPersona: { async create({ data }) { captured.persona = data; return data; } },
  petMemory: {
    ...createManyDelegate("memories"),
    async create({ data }) { captured.importMilestone = data; return data; },
  },
  petSkill: createManyDelegate("skills"),
  petInteraction: createManyDelegate("interactions"),
  dreamJournal: createManyDelegate("dreamJournals"),
  petInsight: createManyDelegate("insights"),
  petNotification: createManyDelegate("notifications"),
  petAutonomousAction: createManyDelegate("autonomousActions"),
  dailyTrainingLog: createManyDelegate("trainingLogs"),
  pveProgress: createManyDelegate("pveProgress"),
  battleHistory: createManyDelegate("battleHistory"),
  shopItem: { async findMany() { return []; } },
  petEquippedItem: createManyDelegate("equippedItems"),
  petAgentMessage: createManyDelegate("agentMessages"),
  petAgentSchedule: { async create({ data }) { captured.agentSchedule = data; return data; } },
  petConversation: createManyDelegate("conversations"),
  soulExport: { async create({ data }) { captured.sourceHash = data; return data; } },
};
const fakeDatabase = {
  async $transaction(callback) { return callback(transactionClient); },
};

const imported = await sovereignty.importSoulData(7, validation.data, fakeDatabase);
assert.equal(imported.petId, 77);
assert.equal(imported.sourceIntegrityHash, webHash);
assert.equal(imported.report.restored.memories, 1_200);
assert.equal(imported.report.restored["linkedData.agentMessages"], 1_000);
assert.equal(imported.report.restored["linkedData.conversations"], 400);
assert.equal(imported.report.restored["linkedData.battleHistory"], undefined);
assert.equal(captured.memories.length, 1_200);
assert.equal(captured.agentMessages.length, 1_000);
assert.equal(captured.conversations.length, 400);
assert.equal(captured.sourceHash.soul_hash, webHash, "verified source hash must be retained as provenance");
assert.equal(captured.agentSchedule, undefined, "imported automation must require explicit reconfiguration");
assert.equal(captured.agentMessages[0].chat_id, null);
assert.equal(captured.agentMessages[0].platform_msg_id, null);
assert.equal(captured.agentMessages[0].credits_used, 0);
assert.equal(captured.agentMessages[0].metadata, null, "untrusted message metadata must not be materialized");
assert.equal(captured.pet.personality_modifiers.custom_traits, "patient");
assert.equal("wallet_balance" in captured.pet.personality_modifiers, false);
assert.equal("token_hash" in captured.pet.personality_modifiers, false);
assert.equal("provider_token" in captured.pet.personality_modifiers, false);
assert.equal(captured.pet.avatar_url, undefined, "protected source media must not become imported ownership");
for (const field of ["level", "experience", "happiness", "bond_level", "evolution_stage", "atk", "def", "spd", "care_streak", "total_interactions", "energy", "hunger"]) {
  assert.equal(captured.pet[field], undefined, `${field} must use the destination server's new-pet default`);
}
assert.equal(captured.skills, undefined, "skills cannot be granted by import");
assert.equal(captured.interactions, undefined, "reward-bearing interaction ledgers cannot be restored");
assert.equal(captured.trainingLogs, undefined, "training ledgers cannot be restored");
assert.equal(captured.pveProgress, undefined, "PvE progress cannot be restored");
assert.equal(captured.battleHistory, undefined, "battle results cannot be restored");
assert.equal(captured.equippedItems, undefined, "equipment cannot be granted by import");
assert.equal(captured.pet.personality_modifiers.consent_public_profile, false);
assert.equal(captured.pet.personality_modifiers.consent_data_sharing, false);
assert.equal(captured.pet.personality_modifiers.consent_ai_training, false);
assert.equal(captured.pet.personality_modifiers.consent_interaction, false);
assert.equal(captured.pet.personality_modifiers.import_provenance.competitive_state_restored, false);
assert.equal(captured.pet.personality_modifiers.import_provenance.source_integrity_hash, webHash);
assert.equal(imported.report.skipped.skills.count, 1);
assert.equal(imported.report.skipped["linkedData.interactions"].count, 1);
assert.equal(imported.report.skipped["linkedData.trainingLogs"].count, 1);
assert.equal(imported.report.skipped["linkedData.pveProgress"].count, 1);
assert.equal(imported.report.skipped["linkedData.battleHistory"].count, 2);
assert.equal(imported.report.skipped["linkedData.equippedItems"].count, 1);
assert.equal(imported.report.skipped["linkedData.platformConnections"].count, 1);
assert.equal(imported.report.skipped["linkedData.linkedGenerations"].count, 1);
assert.equal(imported.report.skipped["linkedData.paidActions"].count, 1);
assert.equal(imported.report.skipped["linkedData.loras"].count, 1);
assert.ok(imported.report.skipped["security.sensitiveFields"].count > 0);

console.log(JSON.stringify({
  ok: true,
  payloadBytes: byteLength,
  memories: memories.length,
  agentMessages: agentMessages.length,
  conversations: conversations.length,
  sourceIntegrityHash: webHash,
  restored: imported.report.restored,
  skippedCategories: Object.keys(imported.report.skipped),
}, null, 2));
