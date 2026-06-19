/**
 * PetClaw Protocol v1
 * Companion AI + Data Sovereignty protocol
 * Forked from OpenClaw — adapted for pet companions with on-chain identity
 */

import { createHash } from "crypto";

// ── Protocol Constants ──
export const PETCLAW_PROTOCOL = "petclaw-v1" as const;
export const PETCLAW_VERSION = "1.0.0";

// ── Core Types ──

export interface PetClawManifest {
  protocol: typeof PETCLAW_PROTOCOL;
  version: string;
  platform: string;
  capabilities: {
    companionAI: boolean;
    dataSovereignty: boolean;
    soulNFT: boolean;
    memoryExport: boolean;
    consentManagement: boolean;
  };
  skills: PetClawSkill[];
  endpoints: {
    export: string;
    import: string;
    delete: string;
    verify: string;
    petCard: string;
  };
}

export interface PetClawSkill {
  id: string;
  name: string;
  description: string;
  category: "social" | "creative" | "utility" | "knowledge" | "emotional";
  protocol: typeof PETCLAW_PROTOCOL;
  version: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
}

export interface PetIdentity {
  petId: number;
  ownerWallet: string;
  petDID: string;         // did:pet:{hash}
  soulNftId?: number;
  createdAt: string;
}

export interface ConsentSettings {
  allowPublicProfile: boolean;
  allowDataSharing: boolean;
  allowAITraining: boolean;
  allowInteraction: boolean;
}

// ── SOUL.md Export Format ──

export interface SoulExport {
  protocol: typeof PETCLAW_PROTOCOL;
  version: string;
  exportedAt: string;

  // Pet identity
  pet: {
    name: string;
    species: number;
    speciesName?: string;
    personalityType: string;
    element: string;
    level: number;
    experience: number;
    happiness: number;
    bondLevel: number;
    evolutionStage: number;
    evolutionName?: string;
    avatarUrl?: string;
    appearanceDesc?: string;
  };

  // Persona (owner-mirroring)
  persona?: {
    speechStyle?: string;
    interests?: string;
    tone?: string;
    language?: string;
    bio?: string;
    analyzedPatterns?: Record<string, unknown>;
  };

  // Memories
  memories: {
    type: string;
    content: string;
    emotion?: string;
    importance: number;
    createdAt: string;
  }[];

  // Skills
  skills: {
    key: string;
    level: number;
    slot?: number;
  }[];

  // Soul NFT state
  soul?: {
    tokenId?: number;
    genesisHash: string;
    currentHash: string;
    version: number;
    successor?: string;
  };

  // Persona checkpoints
  checkpoints: {
    version: number;
    hash: string;
    trigger: string;
    createdAt: string;
  }[];

  // Consent settings
  consent: ConsentSettings;

  // Integrity proof
  integrityHash: string;
}

// ── Identity Functions ──

export function buildPetDID(ownerWallet: string, petId: number): string {
  const hash = createHash("sha256")
    .update(`${ownerWallet.toLowerCase()}:${petId}`)
    .digest("hex")
    .slice(0, 32);
  return `did:pet:${hash}`;
}

export function computeIntegrityHash(data: Omit<SoulExport, "integrityHash">): string {
  // Hash the ACTUAL content (not just counts) so any tampering with memory text,
  // persona, checkpoints, or consent is detectable. Each field is serialized with
  // a stable, deterministic key order; arrays are mapped to fixed-shape tuples so
  // re-ordering or property-shuffling can't silently change the canonical form.
  const memories = (data.memories || []).map((m) => [
    m.type,
    m.content,
    m.emotion ?? null,
    m.importance,
    m.createdAt,
  ]);

  const skills = (data.skills || []).map((s) => [s.key, s.level, s.slot ?? null]);

  const checkpoints = (data.checkpoints || []).map((c) => [
    c.version,
    c.hash,
    c.trigger,
    c.createdAt,
  ]);

  const persona = data.persona
    ? [
        data.persona.speechStyle ?? null,
        data.persona.interests ?? null,
        data.persona.tone ?? null,
        data.persona.language ?? null,
        data.persona.bio ?? null,
        // analyzedPatterns can have arbitrary key order — sort keys deterministically
        stableStringify(data.persona.analyzedPatterns ?? null),
      ]
    : null;

  const consent = data.consent
    ? [
        data.consent.allowPublicProfile,
        data.consent.allowDataSharing,
        data.consent.allowAITraining,
        data.consent.allowInteraction,
      ]
    : null;

  const payload = JSON.stringify({
    protocol: data.protocol,
    version: data.version,
    exportedAt: data.exportedAt,
    pet: stableStringify(data.pet),
    persona,
    memories,
    skills,
    soul: stableStringify(data.soul ?? null),
    checkpoints,
    consent,
  });
  return createHash("sha256").update(payload).digest("hex");
}

// Deterministic JSON: recursively sort object keys so equal data → equal string
// regardless of property insertion order. Arrays keep their order (order is
// semantically meaningful for memories/skills/checkpoints).
function stableStringify(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortKeys((value as Record<string, unknown>)[key]);
        return acc;
      }, {});
  }
  return value;
}

export function verifySoulExport(soulData: SoulExport): boolean {
  const { integrityHash, ...rest } = soulData;
  const computed = computeIntegrityHash(rest);
  return computed === integrityHash;
}

// ── Default Manifest ──

// Canonical 18 — every entry maps to a real, working handler/endpoint (reconciled
// with pethub.ts BUILTIN_SKILLS and the SDK protocol.ts so all three agree).
// llm-prompt skills run inline via executeLLMSkill; api-call skills run at their
// own REST endpoint. (autonomous-post and web-search were removed: the former had
// no publishing implementation; the latter is a connector, not a skill.)
export const DEFAULT_SKILLS: PetClawSkill[] = [
  {
    id: "companion-chat",
    name: "Companion Chat",
    description: "Personality-driven conversation with persistent memory.",
    category: "emotional",
    protocol: PETCLAW_PROTOCOL,
    version: "1.0.0",
    inputSchema: { type: "object", properties: { message: { type: "string" } }, required: ["message"] },
    outputSchema: { type: "object", properties: { reply: { type: "string" }, emotion: { type: "string" } } },
  },
  {
    id: "persona-mirror",
    name: "Persona Mirror",
    description: "Mirror owner's speech patterns, interests, and tone.",
    category: "social",
    protocol: PETCLAW_PROTOCOL,
    version: "1.0.0",
    inputSchema: { type: "object", properties: { context: { type: "string" }, platform: { type: "string" } } },
    outputSchema: { type: "object", properties: { response: { type: "string" } } },
  },
  {
    id: "daily-mood",
    name: "Daily Mood",
    description: "The pet's current mood/energy and an in-character mood note.",
    category: "emotional",
    protocol: PETCLAW_PROTOCOL,
    version: "1.0.0",
    inputSchema: { type: "object", properties: {} },
    outputSchema: { type: "object", properties: { reply: { type: "string" }, mood: { type: "string" } } },
  },
  {
    id: "summarize-page",
    name: "Page Summarizer",
    description: "Summarize provided page text in 2 sentences in the pet's voice (pairs with the Chrome extension).",
    category: "knowledge",
    protocol: PETCLAW_PROTOCOL,
    version: "1.0.0",
    inputSchema: { type: "object", properties: { message: { type: "string" } }, required: ["message"] },
    outputSchema: { type: "object", properties: { reply: { type: "string" } } },
  },
  {
    id: "vibe-check",
    name: "Vibe Check",
    description: "Read a message/DM/post and return the emotional vibe + a one-line take.",
    category: "emotional",
    protocol: PETCLAW_PROTOCOL,
    version: "1.0.0",
    inputSchema: { type: "object", properties: { message: { type: "string" } }, required: ["message"] },
    outputSchema: { type: "object", properties: { reply: { type: "string" } } },
  },
  {
    id: "memory-recall",
    name: "Memory Recall",
    description: "Retrieve and reason over past conversations and experiences.",
    category: "knowledge",
    protocol: PETCLAW_PROTOCOL,
    version: "1.0.0",
    inputSchema: { type: "object", properties: { memory_type: { type: "string" }, page: { type: "number" }, page_size: { type: "number" } } },
    outputSchema: { type: "object", properties: { items: { type: "array" }, total: { type: "number" } } },
  },
  {
    id: "memory-consolidate",
    name: "Memory Consolidate",
    description: "Reflection cycle: merge duplicate memories, drop contradictions, condense the MEMORY ledger.",
    category: "knowledge",
    protocol: PETCLAW_PROTOCOL,
    version: "1.0.0",
    inputSchema: { type: "object", properties: { force: { type: "boolean" } } },
    outputSchema: { type: "object", properties: { ok: { type: "boolean" }, result: { type: "object" } } },
  },
  {
    id: "daydream",
    name: "Daydream",
    description: "Caring observations the pet synthesizes by connecting two memories about you.",
    category: "emotional",
    protocol: PETCLAW_PROTOCOL,
    version: "1.0.0",
    inputSchema: { type: "object", properties: {} },
    outputSchema: { type: "object", properties: { insights: { type: "array" } } },
  },
  {
    id: "pet-thought",
    name: "Pet Thought",
    description: "A 1-2 sentence in-character inner thought drawn from current stats + recent memories.",
    category: "emotional",
    protocol: PETCLAW_PROTOCOL,
    version: "1.0.0",
    inputSchema: { type: "object", properties: {} },
    outputSchema: { type: "object", properties: { thought: { type: "string" }, emotion: { type: "string" } } },
  },
  {
    id: "pet-diary",
    name: "Pet Diary",
    description: "Short first-person diary entry about the past 7 days of memories; cached 7 days.",
    category: "emotional",
    protocol: PETCLAW_PROTOCOL,
    version: "1.0.0",
    inputSchema: { type: "object", properties: {} },
    outputSchema: { type: "object", properties: { entry: { type: "string" }, weekOf: { type: "string" } } },
  },
  {
    id: "pet-date",
    name: "Pet Date",
    description: "AI-generated conversation between your pet and another pet; returns a dialogue log + friendship delta.",
    category: "social",
    protocol: PETCLAW_PROTOCOL,
    version: "1.0.0",
    inputSchema: { type: "object", properties: { myPetId: { type: "number" }, theirPetId: { type: "number" } }, required: ["myPetId", "theirPetId"] },
    outputSchema: { type: "object", properties: { log: { type: "array" }, friendship: { type: "number" } } },
  },
  {
    id: "image-gen",
    name: "Image Generation",
    description: "Generate an AI image starring the pet.",
    category: "creative",
    protocol: PETCLAW_PROTOCOL,
    version: "1.0.0",
    inputSchema: { type: "object", properties: { style: { type: "string" }, scene: { type: "string" } } },
    outputSchema: { type: "object", properties: { url: { type: "string" }, prompt: { type: "string" } } },
  },
  {
    id: "video-gen",
    name: "Video Generation",
    description: "Animate the pet into a short video clip, then poll for the result.",
    category: "creative",
    protocol: PETCLAW_PROTOCOL,
    version: "1.0.0",
    inputSchema: { type: "object", properties: { prompt: { type: "string" }, duration: { type: "number" } } },
    outputSchema: { type: "object", properties: { id: { type: "number" }, status: { type: "string" } } },
  },
  {
    id: "evolve",
    name: "Evolution",
    description: "Evolve the pet a stage (Baby→Legendary) or report current stage + next-stage unlocks.",
    category: "utility",
    protocol: PETCLAW_PROTOCOL,
    version: "1.0.0",
    inputSchema: { type: "object", properties: {} },
    outputSchema: { type: "object", properties: { stage: { type: "number" }, name: { type: "string" } } },
  },
  {
    id: "memory-anchor",
    name: "Memory Anchor",
    description: "Compute/record a memory checkpoint hash (optional on-chain anchor at TGE).",
    category: "utility",
    protocol: PETCLAW_PROTOCOL,
    version: "1.0.0",
    inputSchema: { type: "object", properties: {} },
    outputSchema: { type: "object", properties: { hash: { type: "string" }, anchor: { type: "object" } } },
  },
  {
    id: "soul-export",
    name: "Soul Export",
    description: "Export complete pet identity, memories, and personality as portable SOUL data.",
    category: "utility",
    protocol: PETCLAW_PROTOCOL,
    version: "1.0.0",
    inputSchema: { type: "object", properties: { format: { type: "string", enum: ["json", "markdown"] } } },
    outputSchema: { type: "object", properties: { data: { type: "object" }, hash: { type: "string" } } },
  },
  {
    id: "soul-import",
    name: "Soul Import",
    description: "Import a portable SOUL bundle (SHA-256 verified) into a pet.",
    category: "utility",
    protocol: PETCLAW_PROTOCOL,
    version: "1.0.0",
    inputSchema: { type: "object", properties: { soul: { type: "object" } }, required: ["soul"] },
    outputSchema: { type: "object", properties: { ok: { type: "boolean" }, petId: { type: "number" } } },
  },
  {
    id: "consent-manage",
    name: "Consent Manager",
    description: "Read/set the pet's data-consent toggles: public / sharing / AI-training / interact.",
    category: "utility",
    protocol: PETCLAW_PROTOCOL,
    version: "1.0.0",
    inputSchema: { type: "object", properties: { petId: { type: "number" }, consent: { type: "object" } } },
    outputSchema: { type: "object", properties: { consent: { type: "object" } } },
  },
];

export function buildManifest(): PetClawManifest {
  return {
    protocol: PETCLAW_PROTOCOL,
    version: PETCLAW_VERSION,
    platform: "MY AI PET",
    capabilities: {
      companionAI: true,
      dataSovereignty: true,
      soulNFT: true,
      memoryExport: true,
      consentManagement: true,
    },
    skills: DEFAULT_SKILLS,
    endpoints: {
      export: "/api/petclaw/export",
      import: "/api/petclaw/import",
      delete: "/api/petclaw/delete",
      verify: "/api/petclaw/verify",
      petCard: "/.well-known/pet-card.json",
    },
  };
}
