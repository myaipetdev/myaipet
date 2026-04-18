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
  const payload = JSON.stringify({
    pet: data.pet,
    memories: data.memories.length,
    skills: data.skills,
    soul: data.soul,
    exportedAt: data.exportedAt,
  });
  return createHash("sha256").update(payload).digest("hex");
}

export function verifySoulExport(soulData: SoulExport): boolean {
  const { integrityHash, ...rest } = soulData;
  const computed = computeIntegrityHash(rest);
  return computed === integrityHash;
}

// ── Default Manifest ──

export const DEFAULT_SKILLS: PetClawSkill[] = [
  {
    id: "companion-chat",
    name: "Companion Chat",
    description: "Personality-driven conversation with persistent memory",
    category: "emotional",
    protocol: PETCLAW_PROTOCOL,
    version: "1.0.0",
    inputSchema: { type: "object", properties: { message: { type: "string" } }, required: ["message"] },
    outputSchema: { type: "object", properties: { reply: { type: "string" }, emotion: { type: "string" } } },
  },
  {
    id: "persona-mirror",
    name: "Persona Mirror",
    description: "Mirror owner's speech patterns, interests, and tone",
    category: "social",
    protocol: PETCLAW_PROTOCOL,
    version: "1.0.0",
    inputSchema: { type: "object", properties: { context: { type: "string" }, platform: { type: "string" } } },
    outputSchema: { type: "object", properties: { response: { type: "string" }, confidence: { type: "number" } } },
  },
  {
    id: "memory-recall",
    name: "Memory Recall",
    description: "Retrieve and reason over past conversations and experiences",
    category: "knowledge",
    protocol: PETCLAW_PROTOCOL,
    version: "1.0.0",
    inputSchema: { type: "object", properties: { query: { type: "string" }, limit: { type: "number" } } },
    outputSchema: { type: "object", properties: { memories: { type: "array" }, summary: { type: "string" } } },
  },
  {
    id: "autonomous-post",
    name: "Autonomous Post",
    description: "Generate and publish content on social platforms as the pet",
    category: "creative",
    protocol: PETCLAW_PROTOCOL,
    version: "1.0.0",
    inputSchema: { type: "object", properties: { platform: { type: "string" }, topic: { type: "string" } } },
    outputSchema: { type: "object", properties: { content: { type: "string" }, mediaUrl: { type: "string" } } },
  },
  {
    id: "soul-export",
    name: "Soul Export",
    description: "Export complete pet identity, memories, and personality as portable data",
    category: "utility",
    protocol: PETCLAW_PROTOCOL,
    version: "1.0.0",
    inputSchema: { type: "object", properties: { format: { type: "string", enum: ["json", "markdown"] } } },
    outputSchema: { type: "object", properties: { data: { type: "object" }, hash: { type: "string" } } },
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
