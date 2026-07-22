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

export interface SoulImportSkipDetail {
  count: number;
  reasons: string[];
}

export interface SoulImportReport {
  /** Exact hash of the source export, retained as import provenance. */
  sourceIntegrityHash: string;
  /** Rows/state fragments actually recreated under the importing owner. */
  restored: Record<string, number>;
  /** Rows intentionally not recreated, with an explicit safety/compatibility reason. */
  skipped: Record<string, SoulImportSkipDetail>;
  warnings: string[];
}

export interface SoulImportResult {
  petId: number;
  sourceIntegrityHash: string;
  report: SoulImportReport;
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

  // Optional PetClaw extensions. They are included in the integrity hash. Import
  // safely reconstructs supported categories and reports anything intentionally
  // not materialized into the destination schema.
  persistentMemory?: unknown;
  learningData?: unknown;
  linkedData?: Record<string, unknown>;

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

// Deterministic JSON: recursively sort object keys so equal data → equal string
// regardless of property insertion order. Arrays keep their order (order is
// semantically meaningful for memories/skills/checkpoints).
function stableStringify(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    const result = Object.create(null) as Record<string, unknown>;
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortKeys((value as Record<string, unknown>)[key]);
        return acc;
      }, result);
  }
  return value;
}

export function verifySoulExport(soulData: SoulExport): boolean {
  const { integrityHash, ...rest } = soulData;
  const computed = computeIntegrityHash(rest);
  return computed === integrityHash;
}

// Skill schemas live only in pethub.ts. Discovery and pet cards receive that
// canonical runtime registry as an argument instead of maintaining a stale copy.

export function buildManifest(skills: PetClawSkill[]): PetClawManifest {
  return {
    protocol: PETCLAW_PROTOCOL,
    version: PETCLAW_VERSION,
    platform: "MY AI PET",
    capabilities: {
      companionAI: true,
      dataSovereignty: true,
      // The schema can preserve legacy Soul NFT state, but production on-chain
      // integration is disabled. Capability discovery must describe availability,
      // not merely the existence of dormant implementation code.
      soulNFT: false,
      memoryExport: true,
      consentManagement: true,
    },
    skills,
    endpoints: {
      export: "/api/petclaw/export",
      import: "/api/petclaw/import",
      delete: "/api/petclaw/delete",
      verify: "/api/petclaw/verify",
      petCard: "/.well-known/pet-card.json",
    },
  };
}
