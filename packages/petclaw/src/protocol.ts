/**
 * PetClaw Protocol v1 — Types and Utilities
 * Standalone module — no server dependencies
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
    /** Live registry endpoint; older protocol manifests may omit this field. */
    skills?: string;
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
  requires?: {
    env?: string[];
    bins?: string[];
    minLevel?: number;
  };
  handler?: string;
  price: number;
  currency: string;
}

export interface PetIdentity {
  petId: number;
  ownerWallet: string;
  petDID: string;
  soulNftId?: number;
  createdAt: string;
}

export interface ConsentSettings {
  allowPublicProfile: boolean;
  allowDataSharing: boolean;
  allowAITraining: boolean;
  allowInteraction: boolean;
}

export interface SoulImportSkipDetail {
  count: number;
  reasons: string[];
}

export interface SoulImportReport {
  sourceIntegrityHash: string;
  restored: Record<string, number>;
  skipped: Record<string, SoulImportSkipDetail>;
  warnings: string[];
}

export interface SoulImportResult {
  petId: number;
  sourceIntegrityHash: string;
  report: SoulImportReport;
}

export interface SoulExport {
  protocol: typeof PETCLAW_PROTOCOL;
  version: string;
  exportedAt: string;
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
  persona?: {
    speechStyle?: string;
    interests?: string;
    tone?: string;
    language?: string;
    bio?: string;
    analyzedPatterns?: Record<string, unknown>;
  };
  memories: {
    type: string;
    content: string;
    emotion?: string;
    importance: number;
    createdAt: string;
  }[];
  skills: { key: string; level: number; slot?: number }[];
  soul?: {
    tokenId?: number;
    genesisHash: string;
    currentHash: string;
    version: number;
    successor?: string;
  };
  checkpoints: {
    version: number;
    hash: string;
    trigger: string;
    createdAt: string;
  }[];
  consent: ConsentSettings;
  // Extensions remain covered by the source hash. Destinations safely restore
  // supported categories and report anything they intentionally do not create.
  persistentMemory?: unknown;
  learningData?: unknown;
  linkedData?: Record<string, unknown>;
  integrityHash: string;
}

// ── Utility Functions ──

export function buildPetDID(ownerWallet: string, petId: number): string {
  const hash = createHash("sha256")
    .update(`${ownerWallet.toLowerCase()}:${petId}`)
    .digest("hex")
    .slice(0, 32);
  return `did:pet:${hash}`;
}

export function computeIntegrityHash(data: Omit<SoulExport, "integrityHash">): string {
  const memories = (data.memories || []).map((memory) => [
    memory.type,
    memory.content,
    memory.emotion ?? null,
    memory.importance,
    memory.createdAt,
  ]);
  const skills = (data.skills || []).map((skill) => [
    skill.key,
    skill.level,
    skill.slot ?? null,
  ]);
  const checkpoints = (data.checkpoints || []).map((checkpoint) => [
    checkpoint.version,
    checkpoint.hash,
    checkpoint.trigger,
    checkpoint.createdAt,
  ]);
  const persona = data.persona
    ? [
        data.persona.speechStyle ?? null,
        data.persona.interests ?? null,
        data.persona.tone ?? null,
        data.persona.language ?? null,
        data.persona.bio ?? null,
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

  const payloadObject: Record<string, unknown> = {
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
  };
  const extensionSource = data as Omit<SoulExport, "integrityHash"> & Record<string, unknown>;
  const extensionKeys = Object.keys(extensionSource)
    .filter((key) => ![
      "protocol", "version", "exportedAt", "pet", "persona", "memories",
      "skills", "soul", "checkpoints", "consent",
    ].includes(key))
    .sort();
  if (extensionKeys.length > 0) {
    payloadObject.extensions = stableStringify(Object.fromEntries(
      extensionKeys.map((key) => [key, extensionSource[key]])
    ));
  }
  const payload = JSON.stringify(payloadObject);
  return createHash("sha256").update(payload).digest("hex");
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    const result = Object.create(null) as Record<string, unknown>;
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((result, key) => {
        result[key] = sortKeys((value as Record<string, unknown>)[key]);
        return result;
      }, result);
  }
  return value;
}

export function verifySoulExport(soulData: SoulExport): boolean {
  const { integrityHash, ...rest } = soulData;
  const computed = computeIntegrityHash(rest);
  return computed === integrityHash;
}

// ── Live Skills ──
//
// The authoritative registry is server-owned and can change independently of
// an installed SDK. Shipping a copied list here caused clients to advertise
// stale prices, level gates and handlers. Keep the legacy export for source
// compatibility, but intentionally make it empty; fetch the live registry with
// `client.skills.list()` or pass a reviewed snapshot to `buildManifest`.
/** @deprecated Fetch `/api/petclaw/skills` instead. */
export const DEFAULT_SKILLS: PetClawSkill[] = [];

// ── Agentic Harness — "VIGIL" ──
// VIGIL names PetClaw's bounded retention and reflection capabilities. Stages
// run only on supported successful paths; some are periodic or opt-in, and none
// should be advertised as synchronous on every surface. These are not separately
// installable skills.
// Each stage is grounded in a real module under web/src/lib/petclaw/memory/.
// The CHORUS stage (best-of-N) generates N candidates at different temperatures
// and asks a separate judge call to select one, with a deterministic heuristic
// fallback when judging fails. It is sampling-level selection, not a panel of
// independent model identities.

export interface HarnessStage {
  id: string;
  name: string;
  description: string;
  module: string;
  enabledByDefault: boolean;
}

export const DEFAULT_HARNESS: HarnessStage[] = [
  {
    id: "persistent-memory", name: "Memory Ledger",
    description: "On eligible successful chat turns, selects useful facts for a capped owner-editable ledger used only when relevant to a later prompt.",
    module: "memory/persistent-memory.ts", enabledByDefault: true,
  },
  {
    id: "self-reflect", name: "Bond Loop",
    description: "Periodically after eligible exchanges, may write a one-line relationship note about how to respond better.",
    module: "memory/bond-loop.ts", enabledByDefault: true,
  },
  {
    id: "feedback", name: "Implicit Feedback",
    description: "On a later owner turn, estimates how the previous reply landed from timing, length, and lexical signals.",
    module: "memory/feedback.ts", enabledByDefault: true,
  },
  {
    id: "self-learn", name: "Self-Learning",
    description: "Recurring topics with sufficient feedback may become non-executable learned patterns that are included in supported SOUL exports.",
    module: "memory/self-learning.ts", enabledByDefault: true,
  },
  {
    id: "chorus", name: "Chorus (Best-of-N)",
    description: "Generates N candidate replies and uses a judge call, with heuristic fallback, to select one (opt-in, PETCLAW_BEST_OF_N).",
    module: "memory/best-of-n.ts", enabledByDefault: false,
  },
];

export function buildManifest(
  baseUrl?: string,
  skills: readonly PetClawSkill[] = DEFAULT_SKILLS,
): PetClawManifest {
  const base = baseUrl || "";
  return {
    protocol: PETCLAW_PROTOCOL,
    version: PETCLAW_VERSION,
    platform: "PetClaw",
    capabilities: {
      companionAI: true,
      dataSovereignty: true,
      // Production blockchain integration is disabled. Capability discovery
      // describes live availability, not dormant schema or legacy rows.
      soulNFT: false,
      memoryExport: true,
      consentManagement: true,
    },
    // A standalone SDK cannot infer a server's live registry. Callers that
    // build a manifest must inject the exact reviewed snapshot they serve.
    skills: [...skills],
    endpoints: {
      skills: `${base}/api/petclaw/skills`,
      export: `${base}/api/petclaw/export`,
      import: `${base}/api/petclaw/import`,
      delete: `${base}/api/petclaw/delete`,
      verify: `${base}/api/petclaw/verify`,
      petCard: `${base}/.well-known/pet-card.json`,
    },
  };
}
