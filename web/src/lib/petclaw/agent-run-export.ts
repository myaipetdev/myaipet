import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "crypto";
import { prisma } from "@/lib/prisma";
import { agentOfficeTaskKindFromExecutionContract } from "@/lib/petclaw/agent/office-task-contract";

export const AGENT_RUN_EXPORT_SCHEMA = "myaipet-owner-agent-run-history/v3" as const;
export const AGENT_RUN_EXPORT_DEFAULT_LIMIT = 100;
export const AGENT_RUN_EXPORT_MAX_LIMIT = 100;
export const AGENT_RUN_EXPORT_CURSOR_MAX_LENGTH = 2_048;
export const AGENT_RUN_EXPORT_MAX_RECORD_BYTES = 64 * 1024;
export const AGENT_RUN_EXPORT_MAX_PAGE_BYTES = 1024 * 1024;

const AGENT_RUN_EXPORT_MAX_JSON_DEPTH = 24;
const AGENT_RUN_EXPORT_MAX_JSON_NODES = 2_048;
const AGENT_RUN_EXPORT_MAX_ARRAY_ITEMS = 128;
const AGENT_RUN_EXPORT_MAX_OBJECT_KEYS = 128;
const AGENT_RUN_EXPORT_MAX_JSON_STRING_LENGTH = 8_192;
const AGENT_RUN_EXPORT_MAX_GOAL_LENGTH = 8_192;
const AGENT_RUN_EXPORT_MAX_ANSWER_LENGTH = 32_768;
const AGENT_RUN_EXPORT_CREDENTIAL_SCAN_OVERFLOW = 8_192;

const CURSOR_PREFIX = "arc2.";
const CURSOR_VERSION = 2;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type JsonRecord = Record<string, unknown>;

const PET_AGENT_RUN_EXPORT_SELECT = {
  pet_id: true,
  run_id: true,
  pet_name: true,
  goal: true,
  max_steps: true,
  execution_contract: true,
  private_content_scrubbed: true,
  state: true,
  completed: true,
  answer: true,
  steps: true,
  stopped_reason: true,
  billing: true,
  credits_remaining: true,
  created_at: true,
  started_at: true,
  terminal_at: true,
  updated_at: true,
} as const;

interface PetAgentRunExportRow {
  pet_id: number;
  run_id: string;
  pet_name: string;
  goal: string;
  max_steps: number;
  execution_contract: string;
  private_content_scrubbed: boolean;
  state: string;
  completed: boolean | null;
  answer: string | null;
  steps: unknown;
  stopped_reason: string | null;
  billing: unknown;
  credits_remaining: number | null;
  created_at: Date;
  started_at: Date | null;
  terminal_at: Date | null;
  updated_at: Date;
}

interface AgentRunExportDatabase {
  pet: {
    findFirst(args: unknown): Promise<{ name: string } | null>;
  };
  petAgentRun: {
    findMany(args: unknown): Promise<PetAgentRunExportRow[]>;
  };
}

interface AgentRunExportCursor {
  version: typeof CURSOR_VERSION;
  ownerId: number;
  petId: number | null;
  createdAt: string;
  runId: string;
  rowPetId: number;
}

export interface OwnerAgentRunExportRecord {
  /** Caller-generated idempotency key used to reconcile this owner-only run. */
  reconciliationId: string;
  receiptReference: string;
  petName: string | null;
  contentRemoved: boolean;
  task: {
    kind: string | null;
    executionContract: string;
    goal: string | null;
    maxSteps: number;
  };
  outcome: {
    state: string;
    completed: boolean | null;
    answer: string | null;
    steps: unknown;
    stoppedReason: string | null;
  };
  billing: unknown;
  creditsRemainingAfterRun: number | null;
  timestamps: {
    createdAt: string;
    startedAt: string | null;
    terminalAt: string | null;
    updatedAt: string;
  };
  exportTreatment: {
    redactedPrivateFields: number;
    redactedCredentialValues: number;
    truncated: boolean;
    truncationReasons: string[];
  };
}

export interface OwnerAgentRunExportPage {
  schema: typeof AGENT_RUN_EXPORT_SCHEMA;
  exportedAt: string;
  scope: {
    kind: "account" | "pet";
    petName?: string;
  };
  page: {
    limit: number;
    count: number;
    hasMore: boolean;
    nextCursor: string | null;
    order: "createdAt:desc,reconciliationId:desc,privateTieBreaker:desc";
    byteBudget: number;
    truncatedRecords: number;
    redactedPrivateFields: number;
    redactedCredentialValues: number;
  };
  records: OwnerAgentRunExportRecord[];
  integrity: {
    algorithm: "SHA-256";
    canonicalization: "lexicographic-json-v2";
    covers: "schema,exportedAt,scope,page,records";
    sha256: string;
  };
}

export class AgentRunExportError extends Error {
  constructor(
    public readonly code: "invalid_cursor" | "pet_not_owned" | "cursor_secret_unavailable",
    message: string,
  ) {
    super(message);
    this.name = "AgentRunExportError";
  }
}

function asRecord(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

const EMBEDDED_CREDENTIAL_KEY_PATTERN =
  /\b(?:npm_[A-Za-z0-9-]{20,}|pck_[A-Za-z0-9_-]{20,}|pex_[A-Za-z0-9_-]{20,}|xai-[A-Za-z0-9._-]{16,}|sk-[A-Za-z0-9_-]{16,}|sk_(?:live|test)_[A-Za-z0-9_-]{12,}|(?:AKIA|ASIA)[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{30,}|gh[pousr]_[0-9A-Za-z]{20,}|github_pat_[0-9A-Za-z_]{20,}|glpat-[0-9A-Za-z_-]{20,}|hf_[0-9A-Za-z_-]{20,}|xox[baprs]-[0-9A-Za-z-]{20,}|ya29\.[0-9A-Za-z_-]{20,})\b/i;

/**
 * Paid-run steps and billing are JSON columns. Treat their keys as hostile:
 * old rows or provider payloads must not smuggle credentials or internal
 * identifiers into an owner export merely because a new nested field appeared.
 */
function isPrivateAgentRunKey(key: string): boolean {
  if (EMBEDDED_CREDENTIAL_KEY_PATTERN.test(key)) return true;
  if (
    /(?:^|[_-])(?:id|uuid)$/i.test(key)
    || /(?:Id|ID|Uuid|UUID)$/.test(key)
  ) {
    return true;
  }
  const normalized = key.replace(/[^a-z0-9]/gi, "").toLowerCase();
  return [
    "proto",
    "prototype",
    "constructor",
    "id",
    "runid",
    "userid",
    "ownerid",
    "petid",
    "reservationid",
    "creditreservationid",
    "accountid",
    "tenantid",
    "sessionid",
    "generationid",
    "chatid",
    "messageid",
    "msgid",
    "tokenid",
    "nftid",
  ].includes(normalized)
    || normalized === "reservation"
    || normalized.endsWith("reservation")
    || normalized.endsWith("primarykey")
    || normalized.includes("password")
    || normalized.includes("passphrase")
    || normalized.includes("secret")
    || normalized.includes("credential")
    || normalized.includes("apikey")
    || normalized.includes("privatekey")
    || normalized.includes("accesstoken")
    || normalized.includes("refreshtoken")
    || normalized.endsWith("token")
    || normalized.includes("tokenhash")
    || normalized.includes("webhooksecret")
    || normalized.includes("authorization")
    || normalized.includes("cookie")
    || normalized === "wallet"
    || normalized.endsWith("wallet")
    || normalized.endsWith("walletaddress")
    || normalized.endsWith("txhash")
    || normalized.endsWith("transactionhash");
}

interface AgentRunExportTreatmentStats {
  redactedPrivateFields: number;
  redactedCredentialValues: number;
  truncationReasons: Set<string>;
  nodesVisited: number;
  seen: WeakSet<object>;
}

function createTreatmentStats(): AgentRunExportTreatmentStats {
  return {
    redactedPrivateFields: 0,
    redactedCredentialValues: 0,
    truncationReasons: new Set<string>(),
    nodesVisited: 0,
    seen: new WeakSet<object>(),
  };
}

function replaceCredentialMatches(
  value: string,
  pattern: RegExp,
  replacement: (match: string, groups: string[]) => string,
  stats: AgentRunExportTreatmentStats,
): string {
  pattern.lastIndex = 0;
  return value.replace(pattern, (match, ...args: unknown[]) => {
    stats.redactedCredentialValues += 1;
    const groups = args.slice(0, -2).map((entry) => String(entry ?? ""));
    return replacement(match, groups);
  });
}

/**
 * JSON keys are not the only place a provider can echo a credential. Redact
 * concrete credential values and signed-URL query values while preserving
 * surrounding diagnostic text.
 */
function redactCredentialValues(
  value: string,
  stats: AgentRunExportTreatmentStats,
): string {
  let redacted = value;
  redacted = replaceCredentialMatches(
    redacted,
    /(\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\/)[^\/:\s"'<>]+:[^\/@\s"'<>]+(?:@|$)/gi,
    (match, groups) => `${groups[0]}[REDACTED]${match.endsWith("@") ? "@" : ""}`,
    stats,
  );
  redacted = replaceCredentialMatches(
    redacted,
    /([?&](?:x-amz-signature|x-amz-credential|x-amz-security-token|x-goog-signature|x-goog-credential|signature|sig|access_token|refresh_token|api[_-]?key|token)=)[^&#\s"'<>]+/gi,
    (_match, groups) => `${groups[0]}[REDACTED]`,
    stats,
  );
  redacted = replaceCredentialMatches(
    redacted,
    /(\b(?:Bearer|Basic)\s+)[A-Za-z0-9._~+/=-]{4,}/gi,
    (_match, groups) => `${groups[0]}[REDACTED]`,
    stats,
  );
  redacted = replaceCredentialMatches(
    redacted,
    /(\b(?:Set-Cookie|Cookie)\s*:\s*)[^\r\n]+/gi,
    (_match, groups) => `${groups[0]}[REDACTED]`,
    stats,
  );
  redacted = replaceCredentialMatches(
    redacted,
    /-----BEGIN (?:(?:RSA|EC|DSA|OPENSSH|ENCRYPTED|PGP) )?PRIVATE KEY(?: BLOCK)?-----[\s\S]*/gi,
    () => "[REDACTED_PRIVATE_KEY]",
    stats,
  );
  redacted = replaceCredentialMatches(
    redacted,
    /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
    () => "[REDACTED_JWT]",
    stats,
  );
  redacted = replaceCredentialMatches(
    redacted,
    /\b(?:npm_[A-Za-z0-9-]{20,}|pck_[A-Za-z0-9_-]{20,}|pex_[A-Za-z0-9_-]{20,}|xai-[A-Za-z0-9._-]{16,}|sk-[A-Za-z0-9_-]{16,}|sk_(?:live|test)_[A-Za-z0-9_-]{12,}|(?:AKIA|ASIA)[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{30,}|gh[pousr]_[0-9A-Za-z]{20,}|github_pat_[0-9A-Za-z_]{20,}|glpat-[0-9A-Za-z_-]{20,}|hf_[0-9A-Za-z_-]{20,}|xox[baprs]-[0-9A-Za-z-]{20,}|ya29\.[0-9A-Za-z_-]{20,})\b/gi,
    () => "[REDACTED_TOKEN]",
    stats,
  );
  redacted = replaceCredentialMatches(
    redacted,
    /(\b(?:seed[_ -]?phrase|mnemonic)\b\s*["']?\s*(?::|=|\bis\b)\s*["']?)((?:[A-Za-z]+\s+){11,23}[A-Za-z]+)/gi,
    (_match, groups) => `${groups[0]}[REDACTED]`,
    stats,
  );
  redacted = replaceCredentialMatches(
    redacted,
    /(\b(?:otp|totp|mfa[_ -]?code|one[_ -]?time[_ -]?(?:password|code))\b(?:\s*(?::|=|\bis\b))?\s*["']?)\d{6,8}\b/gi,
    (_match, groups) => `${groups[0]}[REDACTED]`,
    stats,
  );
  redacted = replaceCredentialMatches(
    redacted,
    /(\b(?:(?:recovery|backup|security|2fa)[_ -]?code|passcode)\b(?:\s*(?::|=|\bis\b))?\s*["']?)\d{6,8}\b/gi,
    (_match, groups) => `${groups[0]}[REDACTED]`,
    stats,
  );
  redacted = replaceCredentialMatches(
    redacted,
    /((?:\uC778\uC99D\uCF54\uB4DC|\uC77C\uD68C\uC6A9\s*\uCF54\uB4DC)\s*["']?)\d{6,8}\b/gu,
    (_match, groups) => `${groups[0]}[REDACTED]`,
    stats,
  );
  redacted = replaceCredentialMatches(
    redacted,
    /((?:\uBCF5\uAD6C\s*\uCF54\uB4DC|\uBC31\uC5C5\s*\uCF54\uB4DC|\uBCF4\uC548\s*\uCF54\uB4DC)\s*["']?)\d{6,8}\b/gu,
    (_match, groups) => `${groups[0]}[REDACTED]`,
    stats,
  );
  redacted = replaceCredentialMatches(
    redacted,
    /(\b(?:api[_ -]?key|access[_ -]?token|refresh[_ -]?token|token|authorization|password|passphrase|client[_ -]?secret|webhook[_ -]?secret|secret[_ -]?key|stripe[_ -]?secret[_ -]?key|aws[_ -]?(?:secret[_ -]?access[_ -]?key|session[_ -]?token)|database[_ -]?url|recovery[_ -]?code|session[_ -]?(?:cookie|secret|token)|seed[_ -]?phrase|mnemonic|otp|totp|mfa[_ -]?code|cookie)\b\s*["']?\s*(?::|=|\bis\b)\s*["']?)([^\s"'<>;,]{4,})/gi,
    (_match, groups) => `${groups[0]}[REDACTED]`,
    stats,
  );
  return redacted;
}

function sanitizeExportText(
  value: string,
  maxLength: number,
  reason: string,
  stats: AgentRunExportTreatmentStats,
): string {
  // Redact before truncating so a credential crossing the byte/character
  // boundary cannot leak a scanner-short prefix into the exported record.
  const inspectionWindow = value.slice(
    0,
    maxLength + AGENT_RUN_EXPORT_CREDENTIAL_SCAN_OVERFLOW,
  );
  let bounded = redactCredentialValues(inspectionWindow, stats);
  if (value.length > maxLength || bounded.length > maxLength) {
    bounded = bounded.slice(0, maxLength);
    stats.truncationReasons.add(reason);
  }
  return bounded;
}

function sanitizeAgentRunExportJsonInternal(
  value: unknown,
  depth: number,
  stats: AgentRunExportTreatmentStats,
): unknown {
  stats.nodesVisited += 1;
  if (
    depth > AGENT_RUN_EXPORT_MAX_JSON_DEPTH
    || stats.nodesVisited > AGENT_RUN_EXPORT_MAX_JSON_NODES
    || value === undefined
    || typeof value === "function"
    || typeof value === "symbol"
  ) {
    if (depth > AGENT_RUN_EXPORT_MAX_JSON_DEPTH) {
      stats.truncationReasons.add("json_max_depth");
    }
    if (stats.nodesVisited > AGENT_RUN_EXPORT_MAX_JSON_NODES) {
      stats.truncationReasons.add("json_node_budget");
    }
    return undefined;
  }
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "string") {
    return sanitizeExportText(
      value,
      AGENT_RUN_EXPORT_MAX_JSON_STRING_LENGTH,
      "json_string_length",
      stats,
    );
  }
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    if (stats.seen.has(value)) {
      stats.truncationReasons.add("json_cycle");
      return undefined;
    }
    stats.seen.add(value);
    const itemCount = Math.min(value.length, AGENT_RUN_EXPORT_MAX_ARRAY_ITEMS);
    if (value.length > itemCount) stats.truncationReasons.add("json_array_items");
    const clean: unknown[] = [];
    for (let index = 0; index < itemCount; index += 1) {
      const sanitized = sanitizeAgentRunExportJsonInternal(value[index], depth + 1, stats);
      if (sanitized !== undefined) clean.push(sanitized);
      if (stats.nodesVisited > AGENT_RUN_EXPORT_MAX_JSON_NODES) break;
    }
    return clean;
  }
  const record = asRecord(value);
  if (!record) return undefined;
  if (stats.seen.has(record)) {
    stats.truncationReasons.add("json_cycle");
    return undefined;
  }
  stats.seen.add(record);
  const clean: JsonRecord = Object.create(null);
  let ownKeysVisited = 0;
  for (const key in record) {
    if (!Object.hasOwn(record, key)) continue;
    if (ownKeysVisited >= AGENT_RUN_EXPORT_MAX_OBJECT_KEYS) {
      stats.truncationReasons.add("json_object_keys");
      break;
    }
    ownKeysVisited += 1;
    if (isPrivateAgentRunKey(key)) {
      stats.redactedPrivateFields += 1;
      continue;
    }
    const sanitized = sanitizeAgentRunExportJsonInternal(record[key], depth + 1, stats);
    if (sanitized !== undefined) clean[key] = sanitized;
    if (stats.nodesVisited > AGENT_RUN_EXPORT_MAX_JSON_NODES) break;
  }
  return clean;
}

function sanitizeAgentRunExportJsonWithStats(
  value: unknown,
  stats: AgentRunExportTreatmentStats,
): unknown {
  return sanitizeAgentRunExportJsonInternal(value, 0, stats);
}

export function sanitizeAgentRunExportJson(value: unknown, depth = 0): unknown {
  return sanitizeAgentRunExportJsonInternal(value, depth, createTreatmentStats());
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Canonical JSON cannot encode non-finite numbers");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }
  const record = asRecord(value);
  if (!record) throw new TypeError("Canonical JSON contains an unsupported value");
  return `{${Object.keys(record)
    .sort((left, right) => left.localeCompare(right))
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}

function cursorEncryptionKey(): Buffer {
  const secret = process.env.AGENT_RUN_EXPORT_CURSOR_SECRET || process.env.JWT_SECRET;
  if (!secret || secret.length < 16) {
    throw new AgentRunExportError(
      "cursor_secret_unavailable",
      "Agent-run export cursor encryption is unavailable",
    );
  }
  return createHash("sha256")
    .update("myaipet-agent-run-export-cursor-v2\0")
    .update(secret)
    .digest();
}

function encodeCursor(cursor: AgentRunExportCursor): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", cursorEncryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(cursor), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return CURSOR_PREFIX + Buffer.concat([iv, tag, ciphertext]).toString("base64url");
}

function decodeCursor(
  encoded: string,
  ownerId: number,
  petId: number | null,
): AgentRunExportCursor {
  try {
    if (
      encoded.length > AGENT_RUN_EXPORT_CURSOR_MAX_LENGTH
      || !encoded.startsWith(CURSOR_PREFIX)
    ) {
      throw new Error("invalid cursor envelope");
    }
    const packed = Buffer.from(encoded.slice(CURSOR_PREFIX.length), "base64url");
    const encodedPayload = encoded.slice(CURSOR_PREFIX.length);
    if (
      !/^[A-Za-z0-9_-]+$/.test(encodedPayload)
      || packed.toString("base64url") !== encodedPayload
    ) {
      throw new Error("non-canonical cursor encoding");
    }
    if (packed.length < 29) throw new Error("invalid cursor length");
    const iv = packed.subarray(0, 12);
    const tag = packed.subarray(12, 28);
    const ciphertext = packed.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", cursorEncryptionKey(), iv);
    decipher.setAuthTag(tag);
    const parsed = JSON.parse(
      Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8"),
    ) as Partial<AgentRunExportCursor>;
    const createdAt = typeof parsed.createdAt === "string"
      ? new Date(parsed.createdAt)
      : new Date(Number.NaN);
    if (
      parsed.version !== CURSOR_VERSION
      || parsed.ownerId !== ownerId
      || parsed.petId !== petId
      || !Number.isSafeInteger(parsed.ownerId)
      || Number.isNaN(createdAt.getTime())
      || createdAt.toISOString() !== parsed.createdAt
      || typeof parsed.runId !== "string"
      || !UUID_PATTERN.test(parsed.runId)
      || !Number.isSafeInteger(parsed.rowPetId)
      || (parsed.rowPetId ?? 0) <= 0
    ) {
      throw new Error("invalid cursor payload");
    }
    return parsed as AgentRunExportCursor;
  } catch (error) {
    if (error instanceof AgentRunExportError && error.code === "cursor_secret_unavailable") {
      throw error;
    }
    throw new AgentRunExportError(
      "invalid_cursor",
      "The agent-run export cursor is invalid for this owner or pet",
    );
  }
}

function receiptReference(ownerId: number, petId: number, runId: string): string {
  return createHash("sha256")
    .update("myaipet-owner-agent-run-receipt-v2\0")
    .update(`${ownerId}\0${petId}\0${runId}`)
    .digest("hex");
}

function serializedUtf8Bytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

function projectRun(ownerId: number, row: PetAgentRunExportRow): OwnerAgentRunExportRecord {
  // The migration backfills genuinely orphaned legacy receipts. Display strings
  // are never privacy authority because an owner can legitimately choose them.
  const contentRemoved = row.private_content_scrubbed;
  const treatment = createTreatmentStats();
  let petName = contentRemoved
    ? null
    : sanitizeExportText(row.pet_name, 256, "pet_name_length", treatment);
  let goal = contentRemoved
    ? null
    : sanitizeExportText(row.goal, AGENT_RUN_EXPORT_MAX_GOAL_LENGTH, "goal_length", treatment);
  let answer = contentRemoved || row.answer === null
    ? null
    : sanitizeExportText(row.answer, AGENT_RUN_EXPORT_MAX_ANSWER_LENGTH, "answer_length", treatment);
  let steps = contentRemoved
    ? null
    : (sanitizeAgentRunExportJsonWithStats(row.steps, treatment) ?? null);
  let billing = sanitizeAgentRunExportJsonWithStats(row.billing, treatment) ?? null;
  const executionContract = sanitizeExportText(
    row.execution_contract,
    120,
    "execution_contract_length",
    treatment,
  );
  const state = sanitizeExportText(row.state, 20, "state_length", treatment);
  const stoppedReason = row.stopped_reason === null
    ? null
    : sanitizeExportText(row.stopped_reason, 40, "stopped_reason_length", treatment);

  const buildRecord = (): OwnerAgentRunExportRecord => ({
    reconciliationId: row.run_id,
    receiptReference: receiptReference(ownerId, row.pet_id, row.run_id),
    petName,
    contentRemoved,
    task: {
      kind: agentOfficeTaskKindFromExecutionContract(executionContract),
      executionContract,
      goal,
      maxSteps: row.max_steps,
    },
    outcome: {
      state,
      completed: row.completed,
      answer,
      steps,
      stoppedReason,
    },
    billing,
    creditsRemainingAfterRun: row.credits_remaining,
    timestamps: {
      createdAt: row.created_at.toISOString(),
      startedAt: row.started_at?.toISOString() ?? null,
      terminalAt: row.terminal_at?.toISOString() ?? null,
      updatedAt: row.updated_at.toISOString(),
    },
    exportTreatment: {
      redactedPrivateFields: treatment.redactedPrivateFields,
      redactedCredentialValues: treatment.redactedCredentialValues,
      truncated: treatment.truncationReasons.size > 0,
      truncationReasons: [...treatment.truncationReasons].sort(),
    },
  });

  let record = buildRecord();
  if (serializedUtf8Bytes(record) > AGENT_RUN_EXPORT_MAX_RECORD_BYTES) {
    steps = null;
    treatment.truncationReasons.add("record_byte_budget_steps");
    record = buildRecord();
  }
  if (serializedUtf8Bytes(record) > AGENT_RUN_EXPORT_MAX_RECORD_BYTES) {
    goal = goal?.slice(0, 2_048) ?? null;
    answer = answer?.slice(0, 4_096) ?? null;
    treatment.truncationReasons.add("record_byte_budget_text");
    record = buildRecord();
  }
  if (serializedUtf8Bytes(record) > AGENT_RUN_EXPORT_MAX_RECORD_BYTES) {
    billing = null;
    treatment.truncationReasons.add("record_byte_budget_billing");
    record = buildRecord();
  }
  if (serializedUtf8Bytes(record) > AGENT_RUN_EXPORT_MAX_RECORD_BYTES) {
    petName = petName?.slice(0, 128) ?? null;
    goal = null;
    answer = null;
    treatment.truncationReasons.add("record_byte_budget_minimal");
    record = buildRecord();
  }
  return record;
}

export function computeAgentRunExportPageChecksum(
  page: Omit<OwnerAgentRunExportPage, "integrity">,
): string {
  return createHash("sha256").update(stableStringify(page)).digest("hex");
}

function pageWithIntegrity(
  page: Omit<OwnerAgentRunExportPage, "integrity">,
  checksum = computeAgentRunExportPageChecksum(page),
): OwnerAgentRunExportPage {
  return {
    ...page,
    integrity: {
      algorithm: "SHA-256",
      canonicalization: "lexicographic-json-v2",
      covers: "schema,exportedAt,scope,page,records",
      sha256: checksum,
    },
  };
}

function buildPageWithoutIntegrity(input: {
  exportedAt: string;
  scope: OwnerAgentRunExportPage["scope"];
  scopeRedactedCredentialValues: number;
  limit: number;
  records: OwnerAgentRunExportRecord[];
  hasMore: boolean;
  nextCursor: string | null;
}): Omit<OwnerAgentRunExportPage, "integrity"> {
  return {
    schema: AGENT_RUN_EXPORT_SCHEMA,
    exportedAt: input.exportedAt,
    scope: input.scope,
    page: {
      limit: input.limit,
      count: input.records.length,
      hasMore: input.hasMore,
      nextCursor: input.nextCursor,
      order: "createdAt:desc,reconciliationId:desc,privateTieBreaker:desc",
      byteBudget: AGENT_RUN_EXPORT_MAX_PAGE_BYTES,
      truncatedRecords: input.records.filter((record) => record.exportTreatment.truncated).length,
      redactedPrivateFields: input.records.reduce(
        (sum, record) => sum + record.exportTreatment.redactedPrivateFields,
        0,
      ),
      redactedCredentialValues: input.scopeRedactedCredentialValues + input.records.reduce(
        (sum, record) => sum + record.exportTreatment.redactedCredentialValues,
        0,
      ),
    },
    records: input.records,
  };
}

function encodedCursorForBoundary(
  ownerId: number,
  petId: number | null,
  row: PetAgentRunExportRow,
): string {
  return encodeCursor({
    version: CURSOR_VERSION,
    ownerId,
    petId,
    createdAt: row.created_at.toISOString(),
    runId: row.run_id,
    rowPetId: row.pet_id,
  });
}

/**
 * Bounded owner DSAR for paid agent runs. A pet filter is optional so a user can
 * still retrieve privacy-scrubbed financial receipts after deleting a pet. When
 * supplied, petId is independently proven to belong to the authenticated owner.
 *
 * The encrypted cursor contains the exact
 * (created_at, run_id, private pet-id tie-breaker) boundary and is bound to
 * owner + pet scope. It is not a replay token and cannot authorize a run,
 * reservation, credit mutation, or SOUL import.
 */
export async function exportOwnerAgentRunPageWithDb(
  database: AgentRunExportDatabase,
  ownerId: number,
  options: {
    petId?: number;
    cursor?: string;
    limit?: number;
    exportedAt?: Date;
  } = {},
): Promise<OwnerAgentRunExportPage> {
  const petId = options.petId ?? null;
  const requestedLimit = options.limit ?? AGENT_RUN_EXPORT_DEFAULT_LIMIT;
  const limit = Math.min(
    AGENT_RUN_EXPORT_MAX_LIMIT,
    Math.max(1, Math.trunc(requestedLimit)),
  );

  let petName: string | undefined;
  let scopeCredentialRedactions = 0;
  if (petId !== null) {
    const ownedPet = await database.pet.findFirst({
      where: { id: petId, user_id: ownerId, is_active: true },
      select: { name: true },
    });
    if (!ownedPet) {
      throw new AgentRunExportError(
        "pet_not_owned",
        "The requested pet is unavailable for this owner",
      );
    }
    const scopeTreatment = createTreatmentStats();
    petName = sanitizeExportText(ownedPet.name, 256, "scope_pet_name_length", scopeTreatment);
    scopeCredentialRedactions = scopeTreatment.redactedCredentialValues;
  }

  const cursor = options.cursor
    ? decodeCursor(options.cursor, ownerId, petId)
    : null;
  const cursorDate = cursor ? new Date(cursor.createdAt) : null;
  const rows = await database.petAgentRun.findMany({
    where: {
      user_id: ownerId,
      ...(petId !== null ? { pet_id: petId } : {}),
      ...(cursor && cursorDate ? {
        OR: [
          { created_at: { lt: cursorDate } },
          { created_at: cursorDate, run_id: { lt: cursor.runId } },
          {
            created_at: cursorDate,
            run_id: cursor.runId,
            pet_id: { lt: cursor.rowPetId },
          },
        ],
      } : {}),
    },
    select: PET_AGENT_RUN_EXPORT_SELECT,
    orderBy: [{ created_at: "desc" }, { run_id: "desc" }, { pet_id: "desc" }],
    take: limit + 1,
  });

  const exportedAt = (options.exportedAt ?? new Date()).toISOString();
  const scope: OwnerAgentRunExportPage["scope"] = petId === null
    ? { kind: "account" }
    : { kind: "pet", ...(petName ? { petName } : {}) };
  const records: OwnerAgentRunExportRecord[] = [];
  let pageWithoutIntegrity = buildPageWithoutIntegrity({
    exportedAt,
    scope,
    scopeRedactedCredentialValues: scopeCredentialRedactions,
    limit,
    records,
    hasMore: false,
    nextCursor: null,
  });

  // Row count and response bytes are independent limits. When the byte budget
  // fills first, bind the cursor to the last row actually emitted—not the last
  // row fetched—so the next bounded page cannot skip an unseen receipt.
  for (let index = 0; index < Math.min(limit, rows.length); index += 1) {
    const candidateRecords = [...records, projectRun(ownerId, rows[index])];
    const candidateHasMore = rows.length > candidateRecords.length;
    const candidateCursor = candidateHasMore
      ? encodedCursorForBoundary(ownerId, petId, rows[index])
      : null;
    const candidatePage = buildPageWithoutIntegrity({
      exportedAt,
      scope,
      scopeRedactedCredentialValues: scopeCredentialRedactions,
      limit,
      records: candidateRecords,
      hasMore: candidateHasMore,
      nextCursor: candidateCursor,
    });
    const candidateBytes = serializedUtf8Bytes(
      pageWithIntegrity(candidatePage, "0".repeat(64)),
    );
    if (candidateBytes > AGENT_RUN_EXPORT_MAX_PAGE_BYTES && records.length > 0) {
      break;
    }
    records.push(candidateRecords.at(-1)!);
    pageWithoutIntegrity = candidatePage;
  }

  return pageWithIntegrity(pageWithoutIntegrity);
}

export function exportOwnerAgentRunPage(
  ownerId: number,
  options: {
    petId?: number;
    cursor?: string;
    limit?: number;
  } = {},
): Promise<OwnerAgentRunExportPage> {
  // The generated client is refreshed from schema before every production
  // release. Keep the small injectable interface above so focused contract
  // tests never need a live database or a generated-client rewrite.
  return exportOwnerAgentRunPageWithDb(
    prisma as unknown as AgentRunExportDatabase,
    ownerId,
    options,
  );
}
