/**
 * PetClaw Client — typed access to a PetClaw-compatible server.
 *
 * Every request shares the same authentication, timeout, cancellation, and
 * error semantics. Owner-scoped surfaces require an auth token issued by the
 * PetClaw app.
 */

import type {
  ConsentSettings,
  PetClawManifest,
  PetClawSkill,
  SoulExport,
  SoulImportResult,
} from "./protocol";
import { randomUUID } from "crypto";

// The server's bounded agent loop can use up to 60 seconds. A shorter default
// can orphan a completed, credit-bearing run at the client boundary.
export const DEFAULT_PETCLAW_TIMEOUT_MS = 75_000;
const DEFAULT_RESPONSE_LIMIT_BYTES = 2 * 1024 * 1024;
// Matches the server's import/export portability boundary exactly. A server
// must reject a larger generated export before sending it.
const SOUL_RESPONSE_LIMIT_BYTES = 16 * 1024 * 1024;

export type PetClawFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export interface PetClawClientConfig {
  baseUrl: string;
  authToken?: string;
  /** Default request deadline. Set to 0 to disable it. */
  timeoutMs?: number;
  /** Inject a fetch implementation for alternate runtimes or tests. */
  fetch?: PetClawFetch;
  /** Headers sent with every request. Per-request headers take precedence. */
  headers?: HeadersInit;
}

export interface PetClawRequestOptions {
  /** Cancels only this request. */
  signal?: AbortSignal;
  /** Overrides the client deadline for this request. Set to 0 to disable it. */
  timeoutMs?: number;
  headers?: HeadersInit;
}

export interface PetClawErrorOptions {
  status?: number;
  code?: string;
  details?: unknown;
  retryable?: boolean;
  cause?: unknown;
}

/** A stable error shape for HTTP, transport, timeout, and response failures. */
export class PetClawError extends Error {
  readonly status?: number;
  readonly code: string;
  readonly details?: unknown;
  readonly retryable: boolean;
  readonly cause?: unknown;

  constructor(message: string, options: PetClawErrorOptions = {}) {
    super(message);
    this.name = "PetClawError";
    this.status = options.status;
    this.code = options.code ?? "petclaw_error";
    this.details = options.details;
    this.retryable = options.retryable ?? false;
    this.cause = options.cause;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export interface PetClawHealthResponse {
  status: "ok" | "degraded" | (string & {});
}

export interface PetClawPetSummary {
  id: number;
  name: string;
  level?: number;
  species?: number;
  avatar_url?: string | null;
}

export interface PetClawChatMessage {
  role: "user" | "pet";
  text: string;
}

export interface PetClawChatHistory {
  messages: PetClawChatMessage[];
}

export type PetClawChatSurface = "web" | "cli" | "sdk" | "mcp" | "chrome-ext";

export interface PetClawChatOptions extends PetClawRequestOptions {
  /** Client-asserted lineage label; the server allowlists this value. */
  surface?: PetClawChatSurface;
  /** Stable conversation boundary (128 chars max); defaults per client instance, pet, and surface. */
  sessionId?: string;
}

export interface PetClawChatEffects {
  happiness?: number;
  energy?: number;
  hunger?: number;
  experience?: number;
  bond?: number;
}

export interface PetClawChatResponse {
  reply: string;
  mood: string;
  effects: PetClawChatEffects;
  pointsAwarded?: number;
  degraded?: boolean;
  errorCode?: string;
  memoryRetained?: boolean;
  inference?: {
    provider: string;
    model: string;
    source: string;
  } | null;
  session?: {
    surface: string;
    sessionId: string;
  };
}

export interface PetClawAgentStep {
  thought?: string;
  skill: string;
  input: Record<string, unknown>;
  output: unknown;
  ok: boolean;
  /** True only when the server confirms this step committed durable state. */
  sideEffectCommitted?: boolean;
  /** Exact vendor attempts made inside this skill; connectors report 0. */
  modelCalls: number;
}

export interface PetClawAgentRunInput {
  /**
   * Caller-owned idempotency key. Generate it once with
   * `createPetClawAgentRunId()`, persist it, and reuse it while reconciling an
   * unknown transport outcome. The SDK never generates this value implicitly.
   */
  runId: string;
  goal: string;
  maxSteps?: number;
  /**
   * Explicit acknowledgement of the exact reservation for a new run.
   * This literal is required so paid work cannot be triggered by an omitted
   * default or an accidental string-overload call.
   */
  confirmCostCredits: 5;
}

export type PetClawAgentStoppedReason =
  | "completed"
  | "max_steps"
  | "timeout"
  | "planner_error";

export interface PetClawAgentRunResponse {
  runId: string;
  state: "terminal";
  /** Mirrors completion; incomplete terminal runs still return their trace. */
  ok: boolean;
  /** True only when stoppedReason is `completed`. */
  completed: boolean;
  goal: string;
  answer: string;
  steps: PetClawAgentStep[];
  stoppedReason: PetClawAgentStoppedReason;
  billing: {
    outcome: "charged" | "refunded";
    creditsCharged: number;
    reason:
      | "completed_with_successful_tool"
      | "completed_with_direct_answer"
      | "run_not_completed"
      | "no_successful_tool"
      | "outcome_unknown_timeout";
    successfulToolCalls: number;
    failedToolCalls: number;
    committedSideEffects: number;
    usageKnown: boolean;
    /** Exact vendor attempts, including fallback and LLM-skill fan-out. */
    modelCalls: number | null;
    /** Planner/final-synthesis subset of modelCalls. */
    orchestratorModelCalls: number | null;
    /** Executed LLM-skill subset of modelCalls. */
    skillModelCalls: number | null;
  };
  creditsRemaining: number;
}

export interface PetClawAgentRunStatus {
  runId: string;
  state: "reserved" | "running" | "terminal";
  petId: number;
  petName: string;
  goal: string;
  maxSteps: number;
  ok?: boolean;
  completed?: boolean;
  answer?: string;
  steps?: PetClawAgentStep[];
  stoppedReason?: PetClawAgentStoppedReason;
  billing?: PetClawAgentRunResponse["billing"];
  creditsRemaining?: number;
  statusUrl?: string;
}

export function createPetClawAgentRunId(): string {
  return randomUUID();
}

export type PetClawMemoryCategory =
  | "fact"
  | "preference"
  | "event"
  | "relationship"
  | "skill_learned";

export interface PetClawMemoryEntry {
  key: string;
  content: string;
  category: PetClawMemoryCategory | (string & {});
  importance: number;
  source: string;
  createdAt: string;
  updatedAt: string;
  /** True when legacy non-English content is masked on the inspector surface. */
  contentHidden?: boolean;
}

export type PetClawProfileCategory =
  | "identity"
  | "preference"
  | "communication"
  | "interest"
  | "context";

export interface PetClawUserProfileEntry {
  key: string;
  content: string;
  category: PetClawProfileCategory | (string & {});
  source: string;
  updatedAt: string;
  contentHidden?: boolean;
}

export interface PetClawLearnedPattern {
  id: string;
  /** Stable deletion key when the displayed legacy topic is masked. */
  deleteKey?: string;
  topic: string;
  description: string;
  frequency: number;
  successRate: number;
  examples: string[];
  createdAt: string;
  lastUsedAt: string;
  promotedToSkill: boolean;
  contentHidden?: boolean;
}

export interface PetClawMemorySession {
  id: number;
  platform: string;
  sessionId: string | null;
  role: "user" | "pet";
  speakerId: string | null;
  content: string;
  createdAt: string;
  contentHidden?: boolean;
}

export interface PetClawMemoryStats {
  memoryCount: number;
  profileCount: number;
  learnedPatternCount: number;
  learnedPatternThresholdCount: number;
  sessionCount: number;
  lastConsolidatedAt: string | null;
}

export interface PetClawMemoryOverview {
  petId: number;
  memories: PetClawMemoryEntry[];
  userProfile: PetClawUserProfileEntry[];
  learnedPatterns: PetClawLearnedPattern[];
  bondNotes: string[];
  sessions: PetClawMemorySession[];
  stats: PetClawMemoryStats;
}

export type PetClawEditableMemoryType = "memory" | "profile";

export interface PetClawMemoryEdit {
  key: string;
  content?: string;
  importance?: number;
  category?: string;
}

export interface PetClawRecallStoresRedacted {
  memoryRows: number;
  agentMessages: number;
  conversations: number;
  personaRows: number;
  insightsSanitized: number;
  daydreamClaimsRevoked: number;
}

export interface PetClawMemoryInvalidationReceipt {
  /** Compatibility alias for recallStoresRedacted.memoryRows. */
  sourceRowsRedacted?: number;
  recallStoresRedacted?: PetClawRecallStoresRedacted;
  learnedSkillsRemoved?: number;
}

export type PetClawMemoryEditResponse =
  (
    | { ok: true; entry: PetClawMemoryEntry }
    | { ok: true; entry: PetClawUserProfileEntry }
  )
  & PetClawMemoryInvalidationReceipt;

export type PetClawMemoryDeleteTarget =
  | { entryType: "session"; id: number; all?: never }
  | { entryType: "session"; all: true; id?: never }
  | { entryType: "memory" | "profile" | "learned"; key: string; all?: never }
  | { entryType: "memory" | "profile" | "learned"; all: true; key?: never }
  | { entryType: "all"; all: true };

export interface PetClawMemoryDeleteResponse extends PetClawMemoryInvalidationReceipt {
  ok: true;
  deleted?: number | {
    memoryRows: number;
    agentMessages: number;
    conversations: number;
    learnedSkills: number;
    personaRows: number;
    insightsSanitized: number;
    daydreamClaimsRevoked: number;
  };
}

export interface PetClawSkillExecutionResponse {
  skillId: string;
  success: boolean;
  /** `resolved` returns a typed endpoint descriptor; that endpoint did not run. */
  executionStatus: "executed" | "resolved" | "failed";
  output: unknown;
  /** True only when this generic invocation confirms durable state committed. */
  sideEffectCommitted: boolean;
  tokensUsed?: number;
  latencyMs: number;
  /** Deprecated compatibility alias; use creditsCharged. */
  cost: number;
  /** Registry price, not proof that a charge occurred. */
  declaredCost: number;
  /** Credits actually charged by this generic executor. */
  creditsCharged: number;
}

export interface PetClawConsentResponse {
  consent: ConsentSettings;
  saved_at?: string;
}

export type PetClawModelProvider =
  | "xai"
  | "openai"
  | "anthropic"
  | "openrouter"
  | "google"
  | "nous";

export type PetClawModelTask = "chat" | "reason" | "judge";

export interface PetClawModelConnection {
  id: number;
  provider: PetClawModelProvider;
  label: string;
  model: string;
  task_scopes: PetClawModelTask[];
  is_active: boolean;
  created_at: string;
  keyMask?: string;
}

export interface PetClawSupportedProvider {
  id: PetClawModelProvider;
  label: string;
  keyFormat: string;
}

export interface PetClawModelsResponse {
  connections: PetClawModelConnection[];
  supported: PetClawSupportedProvider[];
  tasks: PetClawModelTask[];
}

export interface PetClawModelConnectInput {
  provider: PetClawModelProvider;
  apiKey: string;
  label?: string;
  model?: string;
  taskScopes?: PetClawModelTask[];
}

export interface PetClawModelConnectResponse {
  ok: true;
  connection: PetClawModelConnection;
}

interface InternalRequestOptions {
  request?: PetClawRequestOptions;
  responseType?: "json" | "text";
  maxResponseBytes?: number;
}

interface ParsedBody {
  parsed: boolean;
  value?: unknown;
  raw: string;
}

function assertTimeout(timeoutMs: number): void {
  if (!Number.isFinite(timeoutMs) || timeoutMs < 0) {
    throw new TypeError("timeoutMs must be a finite number greater than or equal to 0");
  }
}

function parseBody(raw: string): ParsedBody {
  if (!raw) return { parsed: false, raw };
  try {
    return { parsed: true, value: JSON.parse(raw), raw };
  } catch {
    return { parsed: false, raw };
  }
}

function asErrorRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function clip(value: string, max = 2_000): string {
  return value.length <= max ? value : `${value.slice(0, max)}…`;
}

function normalizeBaseUrl(input: string): string {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new TypeError("baseUrl must be a valid absolute URL");
  }
  if (url.username || url.password) {
    throw new TypeError("baseUrl must not contain credentials");
  }
  if (url.search || url.hash || !/^\/*$/.test(url.pathname)) {
    throw new TypeError("baseUrl must be an origin without a path, query, or fragment");
  }
  const host = url.hostname.toLowerCase();
  const loopback = host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "::1";
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) {
    throw new TypeError("baseUrl must use HTTPS (HTTP is allowed only for loopback development)");
  }
  return url.origin;
}

function responseTooLarge(maxBytes: number): PetClawError {
  return new PetClawError(`PetClaw response exceeded ${maxBytes} bytes`, {
    code: "response_too_large",
    details: { maxBytes },
    retryable: false,
  });
}

async function readBoundedText(response: Response, maxBytes: number): Promise<string> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) throw responseTooLarge(maxBytes);

  const reader = response.body?.getReader();
  if (!reader) {
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > maxBytes) throw responseTooLarge(maxBytes);
    return text;
  }

  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > maxBytes) {
      await reader.cancel().catch(() => {});
      throw responseTooLarge(maxBytes);
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function httpError(response: Response, body: ParsedBody): PetClawError {
  const record = body.parsed ? asErrorRecord(body.value) : null;
  const apiMessage = [record?.error, record?.detail, record?.message]
    .find((value): value is string => typeof value === "string" && value.trim().length > 0);
  const message = apiMessage ?? (
    (!body.parsed && body.raw.trim() ? clip(body.raw.trim()) : "")
    || response.statusText
    || `HTTP ${response.status}`
  );
  const serverCode = record?.code;

  return new PetClawError(message, {
    status: response.status,
    code: typeof serverCode === "string" && serverCode.trim()
      ? serverCode
      : `http_${response.status}`,
    details: body.parsed
      ? body.value
      : body.raw
        ? { body: clip(body.raw) }
        : undefined,
    retryable: isRetryableStatus(response.status),
  });
}

function query(path: string, values: Record<string, string | number | boolean | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) params.set(key, String(value));
  }
  const encoded = params.toString();
  return encoded ? `${path}?${encoded}` : path;
}

function createClientSessionId(surface: PetClawChatSurface, petId: number): string {
  const random = typeof globalThis.crypto?.randomUUID === "function"
    ? globalThis.crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
  return `${surface}-${petId}-${random}`.slice(0, 128);
}

export class PetClawClient {
  private readonly baseUrl: string;
  private readonly authToken?: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: PetClawFetch;
  private readonly defaultHeaders: Headers;
  private readonly chatSessions = new Map<string, string>();

  constructor(config: PetClawClientConfig) {
    if (!config.baseUrl || !config.baseUrl.trim()) {
      throw new TypeError("baseUrl is required");
    }
    const timeoutMs = config.timeoutMs ?? DEFAULT_PETCLAW_TIMEOUT_MS;
    assertTimeout(timeoutMs);
    if (!config.fetch && typeof globalThis.fetch !== "function") {
      throw new TypeError("A fetch implementation is required in this runtime");
    }

    this.baseUrl = normalizeBaseUrl(config.baseUrl);
    this.authToken = config.authToken;
    this.timeoutMs = timeoutMs;
    this.fetchImpl = config.fetch ?? globalThis.fetch.bind(globalThis);
    this.defaultHeaders = new Headers(config.headers);
  }

  private chatSessionId(petId: number, surface: PetClawChatSurface, explicit?: string): string {
    if (explicit) return explicit;
    const key = `${surface}:${petId}`;
    let sessionId = this.chatSessions.get(key);
    if (!sessionId) {
      sessionId = createClientSessionId(surface, petId);
      this.chatSessions.set(key, sessionId);
    }
    return sessionId;
  }

  private async request<T>(
    path: string,
    init: RequestInit = {},
    internal: InternalRequestOptions = {},
  ): Promise<T> {
    const requestOptions = internal.request ?? {};
    const timeoutMs = requestOptions.timeoutMs ?? this.timeoutMs;
    assertTimeout(timeoutMs);

    const headers = new Headers(this.defaultHeaders);
    new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    new Headers(requestOptions.headers).forEach((value, key) => headers.set(key, value));
    if (!headers.has("accept")) {
      headers.set("Accept", internal.responseType === "text" ? "text/plain, text/markdown;q=0.9" : "application/json");
    }
    if (init.body != null && !headers.has("content-type")) {
      headers.set("Content-Type", "application/json");
    }
    if (this.authToken) headers.set("Authorization", `Bearer ${this.authToken}`);

    const callerSignal = requestOptions.signal ?? init.signal ?? undefined;
    const controller = new AbortController();
    let timedOut = false;
    const abortFromCaller = () => controller.abort(callerSignal?.reason);
    if (callerSignal?.aborted) abortFromCaller();
    else callerSignal?.addEventListener("abort", abortFromCaller, { once: true });

    let timeout: ReturnType<typeof setTimeout> | undefined;

    try {
      const operation = async () => {
        const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
          ...init,
          headers,
          signal: controller.signal,
        });
        const raw = await readBoundedText(
          response,
          internal.maxResponseBytes ?? DEFAULT_RESPONSE_LIMIT_BYTES,
        );
        return { response, body: parseBody(raw) };
      };
      const { response, body } = timeoutMs > 0
        ? await Promise.race([
            operation(),
            new Promise<never>((_resolve, reject) => {
              timeout = setTimeout(() => {
                timedOut = true;
                controller.abort();
                reject(new Error("PetClaw deadline elapsed"));
              }, timeoutMs);
            }),
          ])
        : await operation();

      if (!response.ok) throw httpError(response, body);
      if (internal.responseType === "text") return body.raw as T;
      if (!body.raw) return undefined as T;
      if (body.parsed) return body.value as T;

      throw new PetClawError("PetClaw returned a non-JSON response", {
        status: response.status,
        code: "invalid_response",
        details: {
          contentType: response.headers.get("content-type"),
          body: clip(body.raw),
        },
      });
    } catch (error) {
      if (error instanceof PetClawError) throw error;
      if (timedOut) {
        throw new PetClawError(`PetClaw request timed out after ${timeoutMs}ms`, {
          code: "request_timeout",
          details: { timeoutMs },
          retryable: true,
          cause: error,
        });
      }
      if (callerSignal?.aborted) {
        throw new PetClawError("PetClaw request was aborted", {
          code: "request_aborted",
          details: { reason: callerSignal.reason },
          cause: error,
        });
      }
      throw new PetClawError("Unable to reach the PetClaw server", {
        code: "network_error",
        retryable: true,
        cause: error,
      });
    } finally {
      if (timeout) clearTimeout(timeout);
      callerSignal?.removeEventListener("abort", abortFromCaller);
    }
  }

  // ── Health and discovery ──
  health = (options?: PetClawRequestOptions): Promise<PetClawHealthResponse> =>
    this.request("/api/health", {}, { request: options });

  manifest = (options?: PetClawRequestOptions): Promise<{ manifest: PetClawManifest; stats: unknown }> =>
    this.request("/api/petclaw", {}, { request: options });

  petCard = (options?: PetClawRequestOptions): Promise<Record<string, unknown>> =>
    this.request("/.well-known/pet-card.json", {}, { request: options });

  // ── Pets (owner-scoped) ──
  pets = {
    list: (options?: PetClawRequestOptions): Promise<{ pets: PetClawPetSummary[] }> =>
      this.request("/api/pets", {}, { request: options }),
  };

  // ── Persistent chat (owner-scoped) ──
  chat = {
    history: (petId: number, options: PetClawChatOptions = {}): Promise<PetClawChatHistory> => {
      const { surface = "sdk", sessionId: requestedSessionId, ...requestOptions } = options;
      const sessionId = this.chatSessionId(petId, surface, requestedSessionId);
      return this.request(query(`/api/pets/${petId}/chat`, { surface, sessionId }), {}, {
        request: requestOptions,
      });
    },

    send: (petId: number, message: string, options: PetClawChatOptions = {}): Promise<PetClawChatResponse> => {
      const { surface = "sdk", sessionId: requestedSessionId, ...requestOptions } = options;
      const sessionId = this.chatSessionId(petId, surface, requestedSessionId);
      return this.request(`/api/pets/${petId}/chat`, {
        method: "POST",
        body: JSON.stringify({ message, surface, sessionId }),
      }, { request: requestOptions });
    },
  };

  // ── Native JSON agent loop (owner-scoped, credit-bearing) ──
  agent = {
    run: (
      petId: number,
      input: PetClawAgentRunInput,
      options: PetClawRequestOptions = {},
    ): Promise<PetClawAgentRunResponse> => {
      if (!input || input.confirmCostCredits !== 5) {
        return Promise.reject(new PetClawError(
          "Paid agent runs require confirmCostCredits: 5",
          {
            code: "agent_cost_confirmation_required",
            details: { requiredCredits: 5 },
          },
        ));
      }
      const runId = input.runId;
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(runId)) {
        return Promise.reject(new PetClawError("runId must be a UUID", {
          code: "invalid_agent_run_id",
          details: { runId },
        }));
      }
      const statusUrl = `/api/pets/${petId}/agent/runs/${runId}`;
      return this.request<PetClawAgentRunResponse>(`/api/pets/${petId}/agent`, {
        method: "POST",
        body: JSON.stringify({
          runId,
          goal: input.goal,
          ...(input.maxSteps === undefined ? {} : { maxSteps: input.maxSteps }),
          confirmCostCredits: 5,
        }),
      }, { request: options }).catch((error: unknown) => {
        const petError = error instanceof PetClawError ? error : undefined;
        if (!petError || petError.status === undefined || petError.status >= 500 || petError.code === "request_timeout" || petError.code === "network_error") {
          throw new PetClawError(
            `Paid agent run ${runId} has an unknown transport outcome; look up its receipt before retrying`,
            {
              status: petError?.status,
              code: "agent_run_pending_reconciliation",
              details: { runId, petId, statusUrl, original: petError?.details },
              retryable: false,
              cause: error,
            },
          );
        }
        throw error;
      });
    },
    status: (petId: number, runId: string, options: PetClawRequestOptions = {}): Promise<PetClawAgentRunStatus> =>
      this.request(`/api/pets/${petId}/agent/runs/${encodeURIComponent(runId)}`, {}, { request: options }),
  };

  // ── Skills ──
  skills = {
    list: (
      search?: string,
      category?: string,
      options?: PetClawRequestOptions,
    ): Promise<{ total: number; skills: PetClawSkill[] }> =>
      this.request(query("/api/petclaw/skills", { q: search, category }), {}, { request: options }),

    get: (skillId: string, options?: PetClawRequestOptions): Promise<{ skill: PetClawSkill }> =>
      this.request(query("/api/petclaw/skills", { id: skillId }), {}, { request: options }),

    getSkillMd: (skillId: string, options?: PetClawRequestOptions): Promise<string> =>
      this.request(query("/api/petclaw/skills", { id: skillId, format: "md" }), {}, {
        request: options,
        responseType: "text",
      }),

    installed: (petId: number, options?: PetClawRequestOptions): Promise<{ installed: unknown[] }> =>
      this.request(query("/api/petclaw/skills", { petId }), {}, { request: options }),

    install: (
      petId: number,
      skillId: string,
      config?: Record<string, string>,
      options?: PetClawRequestOptions,
    ): Promise<unknown> =>
      this.request("/api/petclaw/skills", {
        method: "POST",
        body: JSON.stringify({ action: "install", petId, skillId, config }),
      }, { request: options }),

    uninstall: (petId: number, skillId: string, options?: PetClawRequestOptions): Promise<unknown> =>
      this.request("/api/petclaw/skills", {
        method: "POST",
        body: JSON.stringify({ action: "uninstall", petId, skillId }),
      }, { request: options }),

    execute: (
      petId: number,
      skillId: string,
      input?: Record<string, unknown>,
      options?: PetClawRequestOptions,
    ): Promise<PetClawSkillExecutionResponse> =>
      this.request("/api/petclaw/skills", {
        method: "POST",
        body: JSON.stringify({ action: "execute", petId, skillId, input }),
      }, { request: options }),
  };

  // ── Owner-visible memory and session ledger ──
  memory = {
    inspect: (petId: number, options?: PetClawRequestOptions): Promise<PetClawMemoryOverview> =>
      this.request(query("/api/petclaw/memory", { petId }), {}, { request: options }),

    edit: (
      petId: number,
      entryType: PetClawEditableMemoryType,
      edit: PetClawMemoryEdit,
      options?: PetClawRequestOptions,
    ): Promise<PetClawMemoryEditResponse> =>
      this.request(query("/api/petclaw/memory", { petId, entryType }), {
        method: "PATCH",
        body: JSON.stringify(edit),
      }, { request: options }),

    delete: (
      petId: number,
      target: PetClawMemoryDeleteTarget,
      options?: PetClawRequestOptions,
    ): Promise<PetClawMemoryDeleteResponse> =>
      this.request(query("/api/petclaw/memory", {
        petId,
        entryType: target.entryType,
        all: target.all ? 1 : undefined,
        key: "key" in target ? target.key : undefined,
        id: "id" in target ? target.id : undefined,
      }), { method: "DELETE" }, { request: options }),
  };

  // ── Per-pet sovereignty consent ──
  consent = {
    get: (petId: number, options?: PetClawRequestOptions): Promise<PetClawConsentResponse> =>
      this.request(query("/api/petclaw/consent", { petId }), {}, { request: options }),

    update: (
      petId: number,
      consent: ConsentSettings,
      options?: PetClawRequestOptions,
    ): Promise<PetClawConsentResponse> =>
      this.request("/api/petclaw/consent", {
        method: "POST",
        body: JSON.stringify({ petId, consent }),
      }, { request: options }),
  };

  // ── Owner model connections (keys are never returned) ──
  models = {
    list: (options?: PetClawRequestOptions): Promise<PetClawModelsResponse> =>
      this.request("/api/petclaw/models", {}, { request: options }),

    connect: (
      input: PetClawModelConnectInput,
      options?: PetClawRequestOptions,
    ): Promise<PetClawModelConnectResponse> =>
      this.request("/api/petclaw/models", {
        method: "POST",
        body: JSON.stringify(input),
      }, { request: options }),

    disconnect: (id: number, options?: PetClawRequestOptions): Promise<{ ok: true }> =>
      this.request(query("/api/petclaw/models", { id }), { method: "DELETE" }, { request: options }),
  };

  // ── Data sovereignty ──
  sovereignty = {
    export: (petId: number, options?: PetClawRequestOptions): Promise<SoulExport> =>
      this.request(query("/api/petclaw/export", { petId }), {}, {
        request: options,
        maxResponseBytes: SOUL_RESPONSE_LIMIT_BYTES,
      }),

    import: (soulData: SoulExport, options?: PetClawRequestOptions): Promise<SoulImportResult> =>
      this.request("/api/petclaw/import", {
        method: "POST",
        body: JSON.stringify(soulData),
      }, { request: options }),

    delete: (
      petId: number,
      options?: PetClawRequestOptions,
    ): Promise<{
      success: true;
      deletionHash: string;
      deletedAt: string;
      agentReceipts: { scrubbedReceipts: number };
      mediaCleanup: { processed: number; deleted: number; retained: number; failed: number };
      message: string;
    }> =>
      this.request(query("/api/petclaw/delete", { petId }), { method: "DELETE" }, { request: options }),

    verify: (
      petId: number,
      walletAddress: string,
      options?: PetClawRequestOptions,
    ): Promise<{ verified: boolean; petDID: string }> =>
      this.request("/api/petclaw/verify", {
        method: "POST",
        body: JSON.stringify({ petId, walletAddress }),
      }, { request: options }),
  };

  // ── Network (Pet-to-Pet) ──
  network = {
    discover: (
      filters?: Record<string, unknown>,
      options?: PetClawRequestOptions,
    ): Promise<{ nodes: unknown[]; network: unknown }> =>
      this.request(query("/api/petclaw/network/discover", Object.fromEntries(
        Object.entries(filters ?? {})
          .filter(([, value]) => value != null)
          .map(([key, value]) => [key, String(value)]),
      )), {}, { request: options }),

    invoke: (
      callerPetId: number,
      providerPetId: number,
      skillId: string,
      input?: Record<string, unknown>,
      options?: PetClawRequestOptions,
    ): Promise<unknown> =>
      this.request("/api/petclaw/network/invoke", {
        method: "POST",
        body: JSON.stringify({ callerPetId, providerPetId, skillId, input }),
      }, { request: options }),
  };
}
