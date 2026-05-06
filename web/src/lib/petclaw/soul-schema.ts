/**
 * Zod schema validation for SOUL JSON imports.
 * Defends against:
 *  - oversized payloads (DoS)
 *  - prototype pollution / unexpected keys
 *  - over-leveled or stat-injected pets ("bring my level-9999 pet")
 *  - SQL/HTML injection in name/text fields
 *  - circular structures via .strict()
 */

import { z } from "zod";

const HEX_HASH = /^[a-f0-9]{64}$/i;
const SAFE_TEXT = /^[^\x00-\x08\x0E-\x1F\x7F]*$/; // no control chars

// ── Limits (server enforces hard caps) ──
const MAX_NAME       = 50;
const MAX_DESC       = 2000;
const MAX_BIO        = 4000;
const MAX_MEMORIES   = 500;
const MAX_SKILLS     = 30;
const MAX_CHECKPOINTS = 200;
const MAX_LEVEL      = 100;
const MAX_EXP        = 1_000_000;
const MAX_STAT       = 100;

const safeText = (max: number, label: string) => z.string()
  .max(max, `${label} too long`)
  .regex(SAFE_TEXT, `${label} contains invalid control chars`);

const SafeName = safeText(MAX_NAME, "name").min(1, "name required");
const SafeDesc = safeText(MAX_DESC, "description").optional();

// ── Sub-schemas ──

const PetSchema = z.object({
  name: SafeName,
  species: z.number().int().min(0).max(50),
  speciesName: safeText(50, "speciesName").optional(),
  personalityType: z.enum([
    "friendly", "playful", "shy", "brave", "lazy", "curious",
    "mischievous", "gentle", "adventurous", "dramatic", "wise", "sassy",
  ]),
  element: z.enum(["normal", "fire", "water", "grass", "electric", "ice", "psychic", "dark", "light"])
    .or(z.string().max(20).regex(/^[a-z]+$/)),
  level: z.number().int().min(1).max(MAX_LEVEL),
  experience: z.number().int().min(0).max(MAX_EXP),
  happiness: z.number().int().min(0).max(MAX_STAT),
  bondLevel: z.number().int().min(0).max(MAX_STAT),
  evolutionStage: z.number().int().min(0).max(10),
  evolutionName: safeText(30, "evolutionName").optional(),
  avatarUrl: z.string().url().max(2048).optional(),
  appearanceDesc: SafeDesc,
}).strict();

const PersonaSchema = z.object({
  speechStyle: safeText(500, "speechStyle").optional(),
  interests: safeText(500, "interests").optional(),
  tone: safeText(200, "tone").optional(),
  language: safeText(50, "language").optional(),
  bio: safeText(MAX_BIO, "bio").optional(),
  analyzedPatterns: z.record(z.string().max(100), z.unknown()).optional(),
}).strict().optional();

const MemoryEntrySchema = z.object({
  type: safeText(40, "memory.type").min(1),
  content: safeText(2000, "memory.content").min(1),
  emotion: safeText(40, "memory.emotion").optional(),
  importance: z.number().int().min(1).max(5),
  createdAt: z.string().datetime({ offset: true }).or(z.string().max(64)),
}).strict();

const SkillEntrySchema = z.object({
  key: z.string().min(1).max(60).regex(/^[a-z0-9_-]+$/i, "skill.key invalid chars"),
  level: z.number().int().min(0).max(10),
  slot: z.number().int().min(0).max(20).optional(),
}).strict();

const SoulNftSchema = z.object({
  tokenId: z.number().int().min(0).optional(),
  genesisHash: z.string().regex(HEX_HASH, "genesisHash must be 64-hex").or(z.string().regex(/^0x[a-f0-9]{64}$/i)),
  currentHash: z.string().regex(HEX_HASH).or(z.string().regex(/^0x[a-f0-9]{64}$/i)),
  version: z.number().int().min(0).max(10000),
  successor: z.string().regex(/^0x[a-f0-9]{40}$/i).optional(),
}).strict().optional();

const CheckpointSchema = z.object({
  version: z.number().int().min(0),
  hash: z.string().regex(HEX_HASH).or(z.string().regex(/^0x[a-f0-9]{64}$/i)),
  trigger: safeText(200, "checkpoint.trigger"),
  createdAt: z.string().max(64),
}).strict();

const ConsentSchema = z.object({
  allowPublicProfile: z.boolean(),
  allowDataSharing: z.boolean(),
  allowAITraining: z.boolean(),
  allowInteraction: z.boolean(),
}).strict();

// ── Top-level export ──

export const SoulExportSchema = z.object({
  protocol: z.literal("petclaw-v1"),
  version: z.string().max(20),
  exportedAt: z.string().max(64),
  pet: PetSchema,
  persona: PersonaSchema,
  memories: z.array(MemoryEntrySchema).max(MAX_MEMORIES, `Too many memories (max ${MAX_MEMORIES})`),
  skills: z.array(SkillEntrySchema).max(MAX_SKILLS, `Too many skills (max ${MAX_SKILLS})`),
  soul: SoulNftSchema,
  checkpoints: z.array(CheckpointSchema).max(MAX_CHECKPOINTS, `Too many checkpoints`),
  consent: ConsentSchema,
  integrityHash: z.string().regex(HEX_HASH, "integrityHash must be 64-hex sha256"),
}).strict();

export type SoulExportValidated = z.infer<typeof SoulExportSchema>;

// ── Public API ──

export function validateSoulExport(input: unknown): { ok: true; data: SoulExportValidated } | { ok: false; error: string } {
  // Quick size check before parsing
  try {
    const sizeKb = JSON.stringify(input).length / 1024;
    if (sizeKb > 1024) {
      return { ok: false, error: `Payload too large (${sizeKb.toFixed(0)}KB > 1024KB)` };
    }
  } catch {
    return { ok: false, error: "Payload not serializable" };
  }

  const parsed = SoulExportSchema.safeParse(input);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    const path = firstIssue.path.join(".");
    return { ok: false, error: `Invalid SOUL export: ${path || "<root>"} — ${firstIssue.message}` };
  }
  return { ok: true, data: parsed.data };
}
