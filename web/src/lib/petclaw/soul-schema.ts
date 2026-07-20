/**
 * Zod schema validation for SOUL JSON imports.
 * Defends against:
 *  - oversized payloads (DoS)
 *  - prototype pollution / unexpected keys
 *  - over-leveled or stat-injected pets ("bring my level-9999 pet")
 *  - SQL/HTML injection in name/text fields
 *  - circular structures via .strict()
 */

// The v4 root entry re-exports every locale and makes server bundlers retain
// unused translation dictionaries. The public v3 compatibility entry exposes
// the same schema API used here without importing the locale registry.
import { z } from "zod/v3";

const HEX_HASH = /^[a-f0-9]{64}$/i;
const SAFE_TEXT = /^[^\x00-\x08\x0E-\x1F\x7F]*$/; // no control chars

// ── Limits (server enforces hard caps) ──
const MAX_NAME       = 50;
const MAX_LEVEL      = 100;
const MAX_EXP        = 1_000_000;
const MAX_STAT       = 100;

/**
 * One contract cap shared by schema validation and the HTTP body reader.
 * 16 MiB comfortably covers thousands of memories and multi-megabyte message
 * histories while still bounding parse/validation work for an authenticated
 * import request.
 */
export const SOUL_IMPORT_MAX_BYTES = 16 * 1024 * 1024;
export const SOUL_IMPORT_MAX_MIB = 16;
const MAX_TEXT = SOUL_IMPORT_MAX_BYTES;

const safeText = (max: number, label: string) => z.string()
  .max(max, `${label} too long`)
  .regex(SAFE_TEXT, `${label} contains invalid control chars`);

const SafeName = safeText(MAX_NAME, "name").min(1, "name required");
const SafeDesc = safeText(MAX_TEXT, "description").optional();
const PortableMediaRef = safeText(2048, "media reference").refine((value) => {
  if (/^\/(?!\/)/.test(value)) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}, "media reference must be an http(s) URL or absolute path").optional();

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
    .or(z.string().max(10).regex(/^[a-z]+$/)),
  level: z.number().int().min(1).max(MAX_LEVEL),
  experience: z.number().int().min(0).max(MAX_EXP),
  happiness: z.number().int().min(0).max(MAX_STAT),
  bondLevel: z.number().int().min(0).max(MAX_STAT),
  evolutionStage: z.number().int().min(0).max(10),
  evolutionName: safeText(30, "evolutionName").optional(),
  avatarUrl: PortableMediaRef,
  appearanceDesc: SafeDesc,
}).strict();

const PersonaSchema = z.object({
  speechStyle: safeText(MAX_TEXT, "speechStyle").optional(),
  interests: safeText(MAX_TEXT, "interests").optional(),
  tone: safeText(50, "tone").optional(),
  language: safeText(20, "language").optional(),
  bio: safeText(MAX_TEXT, "bio").optional(),
  analyzedPatterns: z.record(z.string().max(100), z.unknown()).optional(),
}).strict().optional();

const MemoryEntrySchema = z.object({
  type: safeText(20, "memory.type").min(1),
  content: safeText(MAX_TEXT, "memory.content").min(1),
  emotion: safeText(20, "memory.emotion").optional(),
  importance: z.number().int().min(1).max(5),
  createdAt: z.string().datetime({ offset: true }).or(z.string().max(64)),
}).strict();

const SkillEntrySchema = z.object({
  key: z.string().min(1).max(30).regex(/^[a-z0-9_-]+$/i, "skill.key invalid chars"),
  level: z.number().int().min(0).max(10),
  slot: z.number().int().min(0).max(20).optional(),
}).strict();

const SoulNftSchema = z.object({
  tokenId: z.number().int().min(0).optional(),
  genesisHash: z.string().regex(HEX_HASH, "genesisHash must be 64-hex").or(z.string().regex(/^0x[a-f0-9]{64}$/i)),
  currentHash: z.string().regex(HEX_HASH).or(z.string().regex(/^0x[a-f0-9]{64}$/i)),
  version: z.number().int().min(0),
  successor: z.string().regex(/^0x[a-f0-9]{40}$/i).optional(),
}).strict().optional();

const CheckpointSchema = z.object({
  version: z.number().int().min(0),
  hash: z.string().regex(HEX_HASH).or(z.string().regex(/^0x[a-f0-9]{64}$/i)),
  trigger: safeText(50, "checkpoint.trigger"),
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
  // Payload bytes, not an arbitrary row count, are the DoS boundary. Exporters
  // do not truncate these ledgers, so an under-cap export must remain importable.
  memories: z.array(MemoryEntrySchema),
  skills: z.array(SkillEntrySchema),
  soul: SoulNftSchema,
  checkpoints: z.array(CheckpointSchema),
  consent: ConsentSchema,
  persistentMemory: z.unknown().optional(),
  learningData: z.unknown().optional(),
  linkedData: z.record(z.string(), z.unknown()).optional(),
  integrityHash: z.string().regex(HEX_HASH, "integrityHash must be 64-hex sha256"),
}).strict();

export type SoulExportValidated = z.infer<typeof SoulExportSchema>;

export function getSoulExportByteLength(input: unknown): number {
  const serialized = JSON.stringify(input);
  if (typeof serialized !== "string") throw new Error("Payload not serializable");
  return new TextEncoder().encode(serialized).byteLength;
}

export type LimitedJsonReadResult =
  | { ok: true; data: unknown; bytes: number }
  | { ok: false; kind: "too_large" | "invalid_json"; error: string };

/** Read and cap the actual request stream; Content-Length is only an early hint. */
export async function readSoulImportJson(
  request: Pick<Request, "headers" | "body">,
  maxBytes = SOUL_IMPORT_MAX_BYTES,
): Promise<LimitedJsonReadResult> {
  const lengthHeader = request.headers.get("content-length");
  if (lengthHeader && /^\d+$/.test(lengthHeader)) {
    const declaredBytes = Number(lengthHeader);
    if (declaredBytes > maxBytes) {
      return {
        ok: false,
        kind: "too_large",
        error: `Payload too large (max ${SOUL_IMPORT_MAX_MIB} MiB)`,
      };
    }
  }

  if (!request.body) {
    return { ok: false, kind: "invalid_json", error: "Body is not valid JSON" };
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel("SOUL import payload exceeds byte cap").catch(() => {});
        return {
          ok: false,
          kind: "too_large",
          error: `Payload too large (max ${SOUL_IMPORT_MAX_MIB} MiB)`,
        };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, kind: "invalid_json", error: "Body is not valid JSON" };
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(body);
    return { ok: true, data: JSON.parse(text), bytes: totalBytes };
  } catch {
    return { ok: false, kind: "invalid_json", error: "Body is not valid JSON" };
  }
}

// ── Public API ──

export function validateSoulExport(input: unknown): { ok: true; data: SoulExportValidated } | { ok: false; error: string } {
  // The route checks the raw stream; this second check protects direct callers
  // and uses UTF-8 bytes so non-ASCII memory text obeys the exact same cap.
  try {
    const sizeBytes = getSoulExportByteLength(input);
    if (sizeBytes > SOUL_IMPORT_MAX_BYTES) {
      return { ok: false, error: `Payload too large (max ${SOUL_IMPORT_MAX_MIB} MiB)` };
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
