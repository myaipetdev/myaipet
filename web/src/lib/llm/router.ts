/**
 * Unified LLM caller + task routing (FEATURE 1: BYO multi-model).
 *
 * All platform-funded text inference routes through this module so persistent
 * attempt caps, owner BYOK isolation, request-shape validation, and bounded
 * task-selected OpenAI/xAI fallback applies consistently. Direct vendor chat fetches are kept
 * only in the separately metered catch-vision referee.
 *
 * Design contract:
 *   - The default is task-specific: chat is OpenAI-first with xAI fallback;
 *     other text tasks are xAI-first with OpenAI fallback. Platform calls can
 *     fail over once for transient/provider-spend failures;
 *     owner BYOK calls never spill into a platform key or another provider.
 *   - A pet owner may connect their OWN model (BYOK) via /api/petclaw/models.
 *     The key is stored ENCRYPTED at rest with the existing src/lib/crypto.ts
 *     (AES-256-GCM, AGENT_ENCRYPTION_KEY) — no new secret, no new crypto.
 *   - The harness/workflow routes by TASK: reasoning→strong, chat→fast,
 *     judge/summarize→cheap. Owners can scope a connected model to tasks.
 *
 * Provider auth reality (honest): OpenAI, Anthropic, OpenRouter, and xAI are all
 * API-KEY (BYOK) providers. None use OAuth for inference auth, so the live auth
 * path is the encrypted API key. (OAuth stays relevant only for non-LLM
 * connectors under src/lib/oauth/*.)
 */

import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import {
  LLMOwnerConfigError,
  LLMPlatformConfigError,
  LLMUpstreamError,
  classifyLLMHTTPFailure,
  getLLMRequestTimeoutMs,
  getPlatformApiKey,
  getPlatformModel,
  getPlatformProviderOrder,
  ownerTaskScopeMatches,
  runWithProviderFallback,
  throwIfLLMAborted,
  validateOwnerModelConfig,
  type ConnectableLLMTask,
  type PlatformProviderId,
} from "./platform-resilience";

export type LLMTask = "chat" | "reason" | "judge" | "summarize" | "extract" | "persona";
export type ProviderId = "xai" | "openai" | "anthropic" | "openrouter" | "google" | "nous";

interface ProviderConfig {
  id: ProviderId;
  baseUrl: string;
  /** "openai" → /chat/completions; "anthropic" → /messages; "google" → :generateContent. */
  flavor: "openai" | "anthropic" | "google";
}

const PROVIDERS: Record<ProviderId, ProviderConfig> = {
  xai: { id: "xai", baseUrl: "https://api.x.ai/v1", flavor: "openai" },
  openai: { id: "openai", baseUrl: "https://api.openai.com/v1", flavor: "openai" },
  anthropic: { id: "anthropic", baseUrl: "https://api.anthropic.com/v1", flavor: "anthropic" },
  openrouter: { id: "openrouter", baseUrl: "https://openrouter.ai/api/v1", flavor: "openai" },
  google: { id: "google", baseUrl: "https://generativelanguage.googleapis.com/v1beta", flavor: "google" },
  // Nous Research Portal — OpenAI-compatible inference endpoint (Bearer Portal
  // API key from portal.nousresearch.com). Verified base URL + Hermes-4 model
  // ids; routes through the identical /chat/completions openai flavor.
  nous: { id: "nous", baseUrl: "https://inference-api.nousresearch.com/v1", flavor: "openai" },
};

/**
 * Platform default per task — mirrors platform-resilience.ts. Chat runs on the
 * cheap OpenAI mini (founder cost call, 2026-07-21) with Grok as fallback;
 * every other task stays Grok-first.
 */
export const TASK_MODEL_MAP: Record<LLMTask, { provider: ProviderId; model: string }> = {
  chat: { provider: "openai", model: "gpt-4o-mini" },
  reason: { provider: "xai", model: "grok-4-1-fast-non-reasoning" },
  judge: { provider: "xai", model: "grok-3-mini-fast" },
  summarize: { provider: "xai", model: "grok-3-mini-fast" },
  extract: { provider: "xai", model: "grok-3-mini-fast" },
  persona: { provider: "xai", model: "grok-3-mini-fast" },
};

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface CallLLMArgs {
  task: LLMTask;
  messages: LLMMessage[];
  /** If set, prefer this pet-owner's connected model for the task. */
  petId?: number;
  /** Required for authenticated platform-funded calls that have no pet. */
  budgetUserId?: number;
  temperature?: number;
  max_tokens?: number;
  /** Structured JSON request. The adapters currently support json_object. */
  response_format?: { type: string };
  /**
   * Called immediately before each vendor network request, including a
   * platform fallback attempt. This is request-local accounting only: it never
   * receives prompts, keys, or response content.
   */
  onProviderAttempt?: (attempt: LLMProviderAttempt) => void;
  /** Cooperative caller cancellation; the provider HTTP request consumes it. */
  signal?: AbortSignal;
}

export interface LLMProviderAttempt {
  provider: ProviderId;
  model: string;
  source: "owner" | "platform";
}

const MAX_LLM_MESSAGES = 64;
const MAX_LLM_INPUT_BYTES = 64 * 1024;
const MAX_LLM_OUTPUT_TOKENS = 2_000;

export class LLMInputError extends Error {
  readonly status = 400;
  readonly code = "llm_input_too_large";
  constructor(message = "The AI request is too large.") {
    super(message);
    this.name = "LLMInputError";
  }
}

function validateTextMessages(messages: LLMMessage[]): void {
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_LLM_MESSAGES) {
    throw new LLMInputError(`AI requests require 1-${MAX_LLM_MESSAGES} messages.`);
  }
  let bytes = 0;
  for (const message of messages) {
    if (!message || !["system", "user", "assistant"].includes(message.role) || typeof message.content !== "string") {
      throw new LLMInputError("AI messages must contain a valid role and text content.");
    }
    bytes += Buffer.byteLength(message.content, "utf8");
    if (bytes > MAX_LLM_INPUT_BYTES) throw new LLMInputError();
  }
}

function boundedOutputTokens(value: number): number {
  if (!Number.isFinite(value) || value < 1 || value > MAX_LLM_OUTPUT_TOKENS) {
    throw new LLMInputError(`AI output must be between 1 and ${MAX_LLM_OUTPUT_TOKENS} tokens.`);
  }
  return Math.floor(value);
}

export interface LLMResult {
  text: string;
  model: string;
  provider: ProviderId;
  source: "owner" | "platform";
  raw: any;
}

interface ResolvedTarget {
  provider: ProviderConfig;
  model: string;
  apiKey: string;
  source: "owner" | "platform";
  /** Platform-only owner id for the persistent per-user attempt cap. */
  budgetUserId?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// DAILY LLM SPEND GUARD — persistent PostgreSQL counters. Every platform
// provider attempt reserves budget in a transaction before its network request,
// so fallback calls, restarts, and multiple app instances cannot bypass caps.
//
// Counts PLATFORM-funded calls only (owner/BYOK calls burn the owner's own key,
// not our Grok bill). Two caps, both env-tunable:
//   LLM_DAILY_CALL_CAP  — total platform calls per UTC day (default 2000)
//   LLM_USER_DAILY_CAP  — per-caller platform calls per UTC day (default 60);
//                         keyed by owner user id when a pet is known.
// On breach we throw LLMBudgetError (status 429, friendly message). Every
// existing call site already wraps callLLM in try/catch with a graceful
// fallback, so a breach degrades politely instead of crashing routes.
// ─────────────────────────────────────────────────────────────────────────────

export class LLMBudgetError extends Error {
  readonly status = 429;
  readonly code = "llm_daily_budget_exceeded";
  constructor() {
    super("The studio is busy today — please try again tomorrow.");
    this.name = "LLMBudgetError";
  }
}

export function isLLMBudgetError(err: unknown): err is LLMBudgetError {
  return err instanceof LLMBudgetError;
}

export class LLMBudgetStoreError extends Error {
  readonly status = 503;
  readonly code = "llm_budget_store_unavailable";
  constructor() {
    super("AI service is temporarily unavailable because its spend guard could not be verified.");
    this.name = "LLMBudgetStoreError";
  }
}

export function isLLMBudgetStoreError(err: unknown): err is LLMBudgetStoreError {
  return err instanceof LLMBudgetStoreError;
}

export function getLLMBudgetFailureStatus(err: unknown): 429 | 503 | null {
  if (isLLMBudgetError(err)) return 429;
  if (isLLMBudgetStoreError(err)) return 503;
  return null;
}

function envCap(name: string, def: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : def;
}

async function incrementCappedUsage(
  tx: any,
  usageDate: string,
  scopeKey: string,
  cap: number,
): Promise<boolean> {
  const rows = await tx.$queryRaw<Array<{ attempts: number }>>`
    INSERT INTO "llm_platform_usage" ("usage_date", "scope_key", "attempts", "updated_at")
    VALUES (CAST(${usageDate} AS date), ${scopeKey}, 1, CURRENT_TIMESTAMP)
    ON CONFLICT ("usage_date", "scope_key") DO UPDATE
      SET "attempts" = "llm_platform_usage"."attempts" + 1,
          "updated_at" = CURRENT_TIMESTAMP
      WHERE "llm_platform_usage"."attempts" < ${cap}
    RETURNING "attempts"
  `;
  return rows.length === 1;
}

async function incrementUncappedUsage(tx: any, usageDate: string, scopeKey: string): Promise<void> {
  await tx.$executeRaw`
    INSERT INTO "llm_platform_usage" ("usage_date", "scope_key", "attempts", "updated_at")
    VALUES (CAST(${usageDate} AS date), ${scopeKey}, 1, CURRENT_TIMESTAMP)
    ON CONFLICT ("usage_date", "scope_key") DO UPDATE
      SET "attempts" = "llm_platform_usage"."attempts" + 1,
          "updated_at" = CURRENT_TIMESTAMP
  `;
}

/** Atomically reserve one platform-funded provider attempt. Fails closed on DB errors. */
async function consumeLLMBudget(target: ResolvedTarget, signal?: AbortSignal): Promise<void> {
  if (target.source !== "platform") return;
  throwIfLLMAborted(signal);
  const today = new Date().toISOString().slice(0, 10);
  try {
    await prisma.$transaction(async (tx: any) => {
      throwIfLLMAborted(signal);
      if (!await incrementCappedUsage(tx, today, "global", envCap("LLM_DAILY_CALL_CAP", 2000))) {
        throw new LLMBudgetError();
      }
      throwIfLLMAborted(signal);
      if (target.budgetUserId && !await incrementCappedUsage(
        tx,
        today,
        `user:${target.budgetUserId}`,
        envCap("LLM_USER_DAILY_CAP", 60),
      )) {
        throw new LLMBudgetError();
      }
      throwIfLLMAborted(signal);
      await incrementUncappedUsage(tx, today, `provider:${target.provider.id}`);
      // An abort while a non-cancellable SQL statement was running rolls the
      // whole reservation transaction back before any vendor request starts.
      throwIfLLMAborted(signal);
    }, { maxWait: 5_000, timeout: 10_000 });
  } catch (error) {
    throwIfLLMAborted(signal);
    if (error instanceof LLMBudgetError) throw error;
    console.error(`[llm] persistent spend guard unavailable (${error instanceof Error ? error.name : "unknown"})`);
    throw new LLMBudgetStoreError();
  }
  throwIfLLMAborted(signal);
}

// ── Grok-vision global budget (POINTS-ECONOMY §2.4/§2.5, knobs #2/#11) ──
// A dedicated persistent daily cap shared by catch verification, avatar
// validation, upload validation, and appearance-description attempts. It is
// separate from the text LLM_DAILY_CALL_CAP.
// VISION_DAILY_CAP default 300 plus VISION_USER_DAILY_CAP default 30. Both are
// reserved in one transaction for authenticated requests, so one caller cannot
// exhaust the launch-wide provider budget. Throws the same LLMBudgetError (429)
// used by the other platform-funded guards.

export async function reserveVisionBudgetInTransaction(
  tx: any,
  usageDate: string,
  authenticatedUserId: number | undefined,
  globalCap: number,
  userCap: number,
): Promise<void> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(usageDate)
    || !Number.isSafeInteger(globalCap) || globalCap <= 0
    || !Number.isSafeInteger(userCap) || userCap <= 0
    || (authenticatedUserId !== undefined
      && (!Number.isSafeInteger(authenticatedUserId) || authenticatedUserId <= 0))) {
    throw new Error("Invalid vision budget reservation");
  }
  if (!await incrementCappedUsage(tx, usageDate, "vision:global", globalCap)) {
    throw new LLMBudgetError();
  }
  if (authenticatedUserId !== undefined && !await incrementCappedUsage(
    tx,
    usageDate,
    `vision:user:${authenticatedUserId}`,
    userCap,
  )) {
    throw new LLMBudgetError();
  }
}

/** Atomically reserve one platform-funded vision attempt. Fails closed on DB errors. */
export async function consumeVisionBudget(authenticatedUserId?: number): Promise<void> {
  if (authenticatedUserId !== undefined
    && (!Number.isSafeInteger(authenticatedUserId) || authenticatedUserId <= 0)) {
    console.error("[llm] vision spend guard called with an invalid authenticated user id");
    throw new LLMBudgetStoreError();
  }
  const today = new Date().toISOString().slice(0, 10);
  try {
    await prisma.$transaction(async (tx: any) => {
      await reserveVisionBudgetInTransaction(
        tx,
        today,
        authenticatedUserId,
        envCap("VISION_DAILY_CAP", 300),
        envCap("VISION_USER_DAILY_CAP", 30),
      );
    }, { maxWait: 5_000, timeout: 10_000 });
  } catch (error) {
    if (error instanceof LLMBudgetError) throw error;
    console.error(`[llm] persistent vision spend guard unavailable (${error instanceof Error ? error.name : "unknown"})`);
    throw new LLMBudgetStoreError();
  }
}

/** Read-only snapshot of today's global vision budget (admin/ops surfaces). */
export async function getVisionDailyCounters(): Promise<{ date: string; visionCalls: number; cap: number }> {
  const today = new Date().toISOString().slice(0, 10);
  const rows = await prisma.$queryRaw<Array<{ attempts: number }>>`
    SELECT "attempts"
    FROM "llm_platform_usage"
    WHERE "usage_date" = CAST(${today} AS date)
      AND "scope_key" = 'vision:global'
  `;
  return { date: today, visionCalls: Number(rows[0]?.attempts ?? 0), cap: envCap("VISION_DAILY_CAP", 300) };
}

// ── Platform image-generation budget ──
// Image generation is substantially more expensive than text/vision analysis.
// Reserve both a cluster-wide and an authenticated-user slot immediately before
// every real provider submission. The same PostgreSQL transaction rolls the
// global increment back when the user cap is already exhausted.
export type ImageGenerationProvider = "xai" | "fal";

/** Atomically reserve one platform-funded image-generation provider attempt. */
export async function consumeImageBudget(
  userId: number,
  provider: ImageGenerationProvider,
): Promise<void> {
  if (!Number.isSafeInteger(userId) || userId <= 0) {
    console.error("[llm] image spend guard called without a valid authenticated user id");
    throw new LLMBudgetStoreError();
  }

  const today = new Date().toISOString().slice(0, 10);
  try {
    await prisma.$transaction(async (tx: any) => {
      if (!await incrementCappedUsage(tx, today, "image:global", envCap("IMAGE_DAILY_CAP", 800))) {
        throw new LLMBudgetError();
      }
      if (!await incrementCappedUsage(
        tx,
        today,
        `image:user:${userId}`,
        envCap("IMAGE_USER_DAILY_CAP", 20),
      )) {
        throw new LLMBudgetError();
      }
      await incrementUncappedUsage(tx, today, `image:provider:${provider}`);
    }, { maxWait: 5_000, timeout: 10_000 });
  } catch (error) {
    if (error instanceof LLMBudgetError) throw error;
    console.error(`[llm] persistent image spend guard unavailable (${error instanceof Error ? error.name : "unknown"})`);
    throw new LLMBudgetStoreError();
  }
}

/** Read-only snapshot of today's persistent image-generation attempt budget. */
export async function getImageDailyCounters(): Promise<{
  date: string;
  imageCalls: number;
  distinctCallers: number;
  cap: number;
  perUserCap: number;
  providers: Record<string, number>;
}> {
  const today = new Date().toISOString().slice(0, 10);
  const rows = await prisma.$queryRaw<Array<{ scope_key: string; attempts: number }>>`
    SELECT "scope_key", "attempts"
    FROM "llm_platform_usage"
    WHERE "usage_date" = CAST(${today} AS date)
      AND "scope_key" LIKE 'image:%'
  `;
  const byScope = new Map<string, number>(
    rows.map((row) => [row.scope_key, Number(row.attempts)] as const),
  );
  return {
    date: today,
    imageCalls: byScope.get("image:global") ?? 0,
    distinctCallers: rows.filter((row) => row.scope_key.startsWith("image:user:") && Number(row.attempts) > 0).length,
    cap: envCap("IMAGE_DAILY_CAP", 800),
    perUserCap: envCap("IMAGE_USER_DAILY_CAP", 20),
    providers: Object.fromEntries(
      rows
        .filter((row) => row.scope_key.startsWith("image:provider:"))
        .map((row) => [row.scope_key.slice("image:provider:".length), Number(row.attempts)]),
    ),
  };
}

/** Cluster-wide snapshot of today's persistent platform-attempt budget. */
export async function getLLMDailyCounters(): Promise<{
  date: string;
  platformCalls: number;
  distinctCallers: number;
  callCap: number;
  perUserCap: number;
  providers: Record<string, number>;
}> {
  const today = new Date().toISOString().slice(0, 10);
  const rows = await prisma.$queryRaw<Array<{ scope_key: string; attempts: number }>>`
    SELECT "scope_key", "attempts"
    FROM "llm_platform_usage"
    WHERE "usage_date" = CAST(${today} AS date)
  `;
  const byScope = new Map<string, number>(
    rows.map((row: { scope_key: string; attempts: number }) => [row.scope_key, Number(row.attempts)] as const),
  );
  return {
    date: today,
    platformCalls: byScope.get("global") ?? 0,
    distinctCallers: rows.filter((row) => row.scope_key.startsWith("user:") && Number(row.attempts) > 0).length,
    callCap: envCap("LLM_DAILY_CALL_CAP", 2000),
    perUserCap: envCap("LLM_USER_DAILY_CAP", 60),
    providers: Object.fromEntries(
      rows
        .filter((row) => row.scope_key.startsWith("provider:"))
        .map((row) => [row.scope_key.slice("provider:".length), Number(row.attempts)]),
    ),
  };
}

/**
 * Build the platform route from the explicit env-selected provider order. A
 * provider without a configured key is skipped before any request; model env
 * overrides are accepted only when they match the explicit provider allowlist.
 */
function resolvePlatformTargets(task: LLMTask, budgetUserId?: number): ResolvedTarget[] {
  const targets = getPlatformProviderOrder(task)
    .map((id: PlatformProviderId): ResolvedTarget => ({
      provider: PROVIDERS[id],
      model: getPlatformModel(id, task),
      apiKey: getPlatformApiKey(id),
      source: "platform",
      budgetUserId,
    }))
    .filter((target) => Boolean(target.apiKey));
  if (targets.length === 0) {
    throw new LLMPlatformConfigError("No platform text provider is configured (set GROK_API_KEY and/or OPENAI_API_KEY)");
  }
  return targets;
}

/**
 * Resolve provider+model+key. Preference: the pet-owner's active ModelConnection
 * whose task_scopes include this task (most-recently-updated wins), else the
 * platform provider chain. An empty legacy scope means the three documented
 * connectable tasks only (chat/reason/judge), never hidden secondary tasks.
 * Owner calls return exactly one target, so an owner key failure can never leak
 * their prompt to a platform fallback.
 */
async function resolveTargets(task: LLMTask, petId?: number, budgetUserId?: number): Promise<ResolvedTarget[]> {
  if (petId == null) {
    if (!Number.isSafeInteger(budgetUserId) || Number(budgetUserId) <= 0) {
      throw new LLMPlatformConfigError("Platform-funded calls without a pet require an authenticated budget user id");
    }
    return resolvePlatformTargets(task, budgetUserId);
  }

  let pet: { user_id: number } | null;
  try {
    pet = await prisma.pet.findUnique({ where: { id: petId }, select: { user_id: true } });
  } catch {
    throw new LLMOwnerConfigError();
  }
  if (!pet?.user_id) {
    throw new LLMOwnerConfigError("Pet ownership could not be resolved. Platform fallback was blocked to protect your data.");
  }
  if (budgetUserId !== undefined && budgetUserId !== pet.user_id) {
    throw new LLMOwnerConfigError("Pet owner and budget identity do not match.");
  }

  let conns: Array<{
    id: number;
    provider: string;
    model: string;
    encrypted_key: string;
    task_scopes: unknown;
  }>;
  try {
    conns = await prisma.modelConnection.findMany({
      where: { owner_user_id: pet.user_id, is_active: true },
      orderBy: { updated_at: "desc" },
    });
  } catch {
    throw new LLMOwnerConfigError();
  }

  const match = conns.find((conn) => ownerTaskScopeMatches(task, conn.task_scopes));
  // This is the sole condition that authorizes platform inference for a
  // pet-scoped call: the owner has no active connection matching this task.
  if (!match) return resolvePlatformTargets(task, pet.user_id);

  const scopes = (Array.isArray(match.task_scopes) ? match.task_scopes : []) as string[];
  let validated;
  try {
    validated = validateOwnerModelConfig(match.provider, match.model, scopes);
  } catch {
    throw new LLMOwnerConfigError();
  }
  if (!match.encrypted_key) throw new LLMOwnerConfigError();

  let apiKey: string;
  try {
    apiKey = decrypt(match.encrypted_key);
  } catch {
    throw new LLMOwnerConfigError();
  }
  if (!apiKey.trim()) throw new LLMOwnerConfigError();
  return [{ provider: PROVIDERS[validated.provider], model: validated.model, apiKey, source: "owner" }];
}

async function requestProviderJSON(
  target: ResolvedTarget,
  url: string,
  init: RequestInit,
  callerSignal?: AbortSignal,
): Promise<any> {
  throwIfLLMAborted(callerSignal);
  const timeoutMs = getLLMRequestTimeoutMs();
  const controller = new AbortController();
  let requestTimedOut = false;
  const abortFromCaller = () => {
    if (!controller.signal.aborted) controller.abort(callerSignal?.reason);
  };
  callerSignal?.addEventListener("abort", abortFromCaller, { once: true });
  const timer = setTimeout(() => {
    requestTimedOut = true;
    if (!controller.signal.aborted) controller.abort();
  }, timeoutMs);
  let res: Response;
  let body: string;
  try {
    res = await fetch(url, { ...init, signal: controller.signal });
    body = await res.text();
    throwIfLLMAborted(callerSignal);
  } catch (error: any) {
    // A caller deadline/cancel is terminal. Do not turn it into a retryable
    // upstream timeout, otherwise the router could start a paid fallback.
    throwIfLLMAborted(callerSignal);
    const timedOut = requestTimedOut || error?.name === "AbortError";
    throw new LLMUpstreamError(
      target.provider.id,
      `${target.provider.id} ${timedOut ? `timed out after ${timeoutMs}ms` : "network failure"}`,
      true,
      undefined,
      timedOut ? "timeout" : "network",
    );
  } finally {
    clearTimeout(timer);
    callerSignal?.removeEventListener("abort", abortFromCaller);
  }

  if (!res.ok) {
    const policy = classifyLLMHTTPFailure(res.status, body);
    throw new LLMUpstreamError(
      target.provider.id,
      `${target.provider.id} ${res.status} (${policy.reason})`,
      policy.retryable,
      res.status,
      policy.reason,
    );
  }
  throwIfLLMAborted(callerSignal);
  try {
    return JSON.parse(body);
  } catch {
    throw new LLMUpstreamError(target.provider.id, `${target.provider.id} returned malformed JSON`, true, res.status, "response");
  }
}

function logProviderFallback(from: ResolvedTarget, to: ResolvedTarget, error: LLMUpstreamError): void {
  console.warn(
    `[llm] ${from.provider.id}/${from.model} failed (${error.reason}${error.status ? ` ${error.status}` : ""}); ` +
    `falling back once to ${to.provider.id}/${to.model}`,
  );
}

function openAIShapeGenerationOptions(target: ResolvedTarget, maxTokens: number): Record<string, unknown> {
  if (target.provider.id === "openai") {
    return {
      max_completion_tokens: maxTokens,
      // GPT-5.6 supports non-reasoning effort; using it keeps the router's
      // temperature and latency contract valid for platform and BYOK alike.
      ...(target.model.startsWith("gpt-5.6") ? { reasoning_effort: "none" } : {}),
    };
  }
  return { max_tokens: maxTokens };
}

async function callTextTarget(
  target: ResolvedTarget,
  args: Omit<CallLLMArgs, "task" | "petId"> & Required<Pick<CallLLMArgs, "temperature" | "max_tokens">>,
): Promise<LLMResult> {
  const { messages, temperature, max_tokens, response_format, signal } = args;
  throwIfLLMAborted(signal);
  if (response_format && response_format.type !== "json_object") {
    throw new LLMPlatformConfigError(`Unsupported response_format '${response_format.type}'`);
  }
  if (target.provider.flavor === "anthropic") {
    // Anthropic: /messages, x-api-key + anthropic-version, system is top-level.
    const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
    const turns = messages.filter((m) => m.role !== "system").map((m) => ({ role: m.role, content: m.content }));
    const jsonTool = {
      name: "petclaw_return_json",
      description: "Return the requested answer as one JSON object.",
      input_schema: { type: "object", additionalProperties: true },
    };
    const raw = await requestProviderJSON(target, `${target.provider.baseUrl}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": target.apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: target.model,
        max_tokens,
        temperature,
        system: system || undefined,
        messages: turns,
        ...(response_format ? { tools: [jsonTool], tool_choice: { type: "tool", name: jsonTool.name } } : {}),
      }),
    }, signal);
    const blocks: any[] = Array.isArray(raw?.content) ? raw.content : [];
    const jsonBlock = response_format
      ? blocks.find((block) => block?.type === "tool_use" && block?.name === jsonTool.name)
      : undefined;
    const text = response_format
      ? (jsonBlock?.input ? JSON.stringify(jsonBlock.input) : "")
      : blocks.filter((block) => block?.type === "text").map((block) => block.text).join("").trim();
    if (!text) throw new LLMUpstreamError(target.provider.id, `${target.provider.id} returned an empty text response`, true, 200, "response");
    return { text, model: raw?.model || target.model, provider: target.provider.id, source: target.source, raw };
  }

  if (target.provider.flavor === "google") {
    // Gemini: :generateContent, key in x-goog-api-key header (never in the URL).
    // Roles map system→systemInstruction, assistant→model, user→user.
    const systemText = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
    const contents = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
    const raw = await requestProviderJSON(target, `${target.provider.baseUrl}/models/${target.model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": target.apiKey },
      body: JSON.stringify({
        ...(systemText ? { systemInstruction: { parts: [{ text: systemText }] } } : {}),
        contents,
        generationConfig: {
          temperature,
          maxOutputTokens: max_tokens,
          ...(response_format ? { responseMimeType: "application/json" } : {}),
        },
      }),
    }, signal);
    const text = (raw?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join("") || "").trim();
    if (!text) throw new LLMUpstreamError(target.provider.id, "google returned an empty text response", true, 200, "response");
    return { text, model: target.model, provider: target.provider.id, source: target.source, raw };
  }

  // OpenAI-shaped (xai / openai / openrouter) — identical body to today's Grok fetch.
  const raw = await requestProviderJSON(target, `${target.provider.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${target.apiKey}` },
    body: JSON.stringify({
      model: target.model,
      messages,
      ...openAIShapeGenerationOptions(target, max_tokens),
      temperature,
      ...(response_format ? { response_format } : {}),
    }),
  }, signal);
  const text = (raw?.choices?.[0]?.message?.content || "").trim();
  if (!text) throw new LLMUpstreamError(target.provider.id, `${target.provider.id} returned an empty text response`, true, 200, "response");
  return { text, model: raw?.model || target.model, provider: target.provider.id, source: target.source, raw };
}

/**
 * Call an LLM, routed by task and (optionally) the pet-owner's connected model.
 * Platform calls may fall back once; owner BYOK calls always have one target.
 * Returns normalized { text, model, provider, source, raw }.
 */
export async function callLLM(args: CallLLMArgs): Promise<LLMResult> {
  const {
    task,
    messages,
    petId,
    budgetUserId,
    temperature = 0.7,
    max_tokens = 300,
    response_format,
    onProviderAttempt,
    signal,
  } = args;
  throwIfLLMAborted(signal);
  validateTextMessages(messages);
  const safeMaxTokens = boundedOutputTokens(max_tokens);
  if (!Number.isFinite(temperature) || temperature < 0 || temperature > 2) {
    throw new LLMInputError("AI temperature must be between 0 and 2.");
  }
  const targets = await resolveTargets(task, petId, budgetUserId);
  // Target resolution may perform local Prisma reads. They are deliberately
  // awaited (never raced), then fenced before any budget/vendor attempt.
  throwIfLLMAborted(signal);
  return runWithProviderFallback(
    targets,
    (target) => {
      throwIfLLMAborted(signal);
      onProviderAttempt?.({ provider: target.provider.id, model: target.model, source: target.source });
      return callTextTarget(target, { messages, temperature, max_tokens: safeMaxTokens, response_format, signal });
    },
    logProviderFallback,
    (target) => consumeLLMBudget(target, signal),
    signal,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// NATIVE FUNCTION-CALLING (tools) — used by the tool-calling agent loop.
//
// callLLMWithTools() mirrors callLLM()'s provider chain + key decrypt
// (reuses resolveTargets) but sends NATIVE tool definitions in each provider's
// shape and returns a NORMALIZED tool-call result.
// ─────────────────────────────────────────────────────────────────────────────

/** A native tool/function the model may call. `parameters` is a JSON Schema. */
export interface ToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/** A single tool call the model emitted, normalized across providers. */
export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

/**
 * Provider-neutral message that can carry tool calls (assistant) or a tool
 * RESULT (role:"tool"). Translated to the correct wire shape at send time:
 *   - OpenAI/xAI/OpenRouter/Nous: role:"tool" + tool_call_id; assistant.tool_calls[]
 *   - Anthropic: assistant tool_use blocks; a user turn of tool_result blocks
 */
export interface ToolMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  /** assistant only — the calls it requested (normalized). */
  tool_calls?: ToolCall[];
  /** role:"tool" only — the call this result answers. */
  tool_call_id?: string;
  /** role:"tool" only — the tool/skill name (OpenAI includes it; helpful for logs). */
  name?: string;
}

/** "auto" | "none" | "required", or force a specific function by name. */
export type ToolChoice = "auto" | "none" | "required" | { name: string };

export interface CallLLMWithToolsArgs {
  task: LLMTask;
  messages: ToolMessage[];
  tools: ToolDef[];
  toolChoice?: ToolChoice;
  petId?: number;
  budgetUserId?: number;
  temperature?: number;
  maxTokens?: number;
  /** See CallLLMArgs.onProviderAttempt. */
  onProviderAttempt?: (attempt: LLMProviderAttempt) => void;
  /** See CallLLMArgs.signal. */
  signal?: AbortSignal;
}

export interface ToolCallResult {
  content: string | null;
  toolCalls: ToolCall[];
  finishReason: string | null;
  usage: any;
  model: string;
  provider: ProviderId;
  source: "owner" | "platform";
}

/** JSON string → object, with a safe {} fallback (models sometimes emit junk). */
function safeParseArgs(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object") return value as Record<string, unknown>;
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

// ── OpenAI-shape (xai / openai / openrouter / nous) translation ──

function toOpenAIToolMessages(messages: ToolMessage[]): any[] {
  return messages.map((m) => {
    if (m.role === "assistant" && m.tool_calls && m.tool_calls.length) {
      return {
        role: "assistant",
        content: m.content ?? "",
        tool_calls: m.tool_calls.map((tc) => ({
          id: tc.id,
          type: "function",
          function: { name: tc.name, arguments: JSON.stringify(tc.arguments ?? {}) },
        })),
      };
    }
    if (m.role === "tool") {
      return { role: "tool", tool_call_id: m.tool_call_id, content: m.content ?? "" };
    }
    return { role: m.role, content: m.content ?? "" };
  });
}

function toOpenAIToolChoice(tc?: ToolChoice): any {
  if (!tc) return undefined;
  if (tc === "auto" || tc === "none" || tc === "required") return tc;
  return { type: "function", function: { name: tc.name } };
}

// ── Anthropic-shape translation (system hoisted; tool_result blocks grouped) ──

function toAnthropicToolConversation(messages: ToolMessage[]): { system: string; turns: any[] } {
  const system = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content || "")
    .join("\n\n");
  const turns: any[] = [];
  for (const m of messages) {
    if (m.role === "system") continue;
    if (m.role === "tool") {
      // Consecutive tool results must collapse into ONE user turn of tool_result blocks.
      const block = { type: "tool_result", tool_use_id: m.tool_call_id, content: m.content ?? "" };
      const last = turns[turns.length - 1];
      if (last && last._toolResults) {
        last.content.push(block);
      } else {
        turns.push({ role: "user", content: [block], _toolResults: true });
      }
      continue;
    }
    if (m.role === "assistant" && m.tool_calls && m.tool_calls.length) {
      const content: any[] = [];
      if (m.content) content.push({ type: "text", text: m.content });
      for (const tc of m.tool_calls) {
        content.push({ type: "tool_use", id: tc.id, name: tc.name, input: tc.arguments ?? {} });
      }
      turns.push({ role: "assistant", content });
      continue;
    }
    turns.push({ role: m.role, content: m.content ?? "" });
  }
  // Strip the internal grouping marker before sending.
  return { system, turns: turns.map(({ _toolResults, ...rest }) => rest) };
}

function toAnthropicToolChoice(tc?: ToolChoice): any {
  if (!tc || tc === "auto") return { type: "auto" };
  if (tc === "required") return { type: "any" };
  if (tc === "none") return undefined; // let the model answer without forcing a tool
  return { type: "tool", name: tc.name };
}

async function callToolTarget(
  target: ResolvedTarget,
  args: Omit<CallLLMWithToolsArgs, "task" | "petId"> & Required<Pick<CallLLMWithToolsArgs, "temperature" | "maxTokens">>,
): Promise<ToolCallResult> {
  const { messages, tools, toolChoice, temperature, maxTokens, signal } = args;
  throwIfLLMAborted(signal);
  if (target.provider.flavor === "google") {
    throw new Error(
      "tool-calling not supported for provider 'google' — connect an OpenAI-compatible (xAI/OpenAI/OpenRouter/Nous) or Anthropic model at /api/petclaw/models",
    );
  }

  if (target.provider.flavor === "anthropic") {
    const { system, turns } = toAnthropicToolConversation(messages);
    const raw = await requestProviderJSON(target, `${target.provider.baseUrl}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": target.apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: target.model,
        max_tokens: maxTokens,
        temperature,
        system: system || undefined,
        messages: turns,
        tools: tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters })),
        ...(toAnthropicToolChoice(toolChoice) ? { tool_choice: toAnthropicToolChoice(toolChoice) } : {}),
      }),
    }, signal);
    const blocks: any[] = Array.isArray(raw?.content) ? raw.content : [];
    const content = blocks.filter((b) => b?.type === "text").map((b) => b.text).join("") || null;
    const toolCalls: ToolCall[] = blocks
      .filter((b) => b?.type === "tool_use")
      .map((b) => ({ id: String(b.id), name: String(b.name), arguments: safeParseArgs(b.input) }));
    return {
      content,
      toolCalls,
      finishReason: raw?.stop_reason ?? null,
      usage: raw?.usage ?? null,
      model: raw?.model || target.model,
      provider: target.provider.id,
      source: target.source,
    };
  }

  // OpenAI-shaped transport (xai / openai / openrouter / nous). Which provider
  // is primary is task/config dependent.
  const raw = await requestProviderJSON(target, `${target.provider.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${target.apiKey}` },
    body: JSON.stringify({
      model: target.model,
      messages: toOpenAIToolMessages(messages),
      ...openAIShapeGenerationOptions(target, maxTokens),
      temperature,
      tools: tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.parameters } })),
      ...(toOpenAIToolChoice(toolChoice) ? { tool_choice: toOpenAIToolChoice(toolChoice) } : {}),
    }),
  }, signal);
  const msg = raw?.choices?.[0]?.message;
  const content = (msg?.content ?? null) as string | null;
  const toolCalls: ToolCall[] = (Array.isArray(msg?.tool_calls) ? msg.tool_calls : [])
    .filter((tc: any) => tc?.function?.name)
    .map((tc: any) => ({ id: String(tc.id ?? tc.function.name), name: String(tc.function.name), arguments: safeParseArgs(tc.function.arguments) }));
  return {
    content,
    toolCalls,
    finishReason: raw?.choices?.[0]?.finish_reason ?? null,
    usage: raw?.usage ?? null,
    model: raw?.model || target.model,
    provider: target.provider.id,
    source: target.source,
  };
}

export interface ValidateOwnerModelConnectionArgs {
  provider: ProviderId;
  model: string;
  apiKey: string;
  taskScopes: ConnectableLLMTask[];
}

/**
 * Prove the supplied key/model against the exact runtime wire adapters before
 * persisting it. The probe is owner-funded and never participates in platform
 * routing or platform budget counters.
 */
export async function validateOwnerModelConnection(
  args: ValidateOwnerModelConnectionArgs,
): Promise<{ checked: Array<"text" | "json" | "tools"> }> {
  const config = validateOwnerModelConfig(args.provider, args.model, args.taskScopes);
  if (!args.apiKey.trim()) throw new LLMOwnerConfigError("apiKey is required.");
  const target: ResolvedTarget = {
    provider: PROVIDERS[config.provider],
    model: config.model,
    apiKey: args.apiKey,
    source: "owner",
  };
  const checked: Array<"text" | "json" | "tools"> = [];
  const probeMessages: LLMMessage[] = [
    { role: "system", content: "PetClaw connection check. Follow the requested response shape exactly." },
    { role: "user", content: "Return an acknowledgement for this connection check." },
  ];

  if (config.effectiveTasks.includes("judge")) {
    const result = await callTextTarget(target, {
      messages: [
        probeMessages[0],
        { role: "user", content: "Return one JSON object with the single property ok set to true." },
      ],
      temperature: 0,
      max_tokens: 32,
      response_format: { type: "json_object" },
    });
    let parsed: unknown;
    try { parsed = JSON.parse(result.text); } catch { /* handled below */ }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new LLMOwnerConfigError("The selected model did not produce structured JSON with PetClaw's request shape.");
    }
    checked.push("json");
  }

  if (config.effectiveTasks.includes("reason")) {
    const toolName = "petclaw_connection_check";
    const result = await callToolTarget(target, {
      messages: probeMessages,
      tools: [{
        name: toolName,
        description: "Acknowledge the PetClaw connection capability check.",
        parameters: {
          type: "object",
          properties: { ok: { type: "boolean" } },
          required: ["ok"],
          additionalProperties: false,
        },
      }],
      toolChoice: { name: toolName },
      temperature: 0,
      maxTokens: 32,
    });
    if (!result.toolCalls.some((call) => call.name === toolName)) {
      throw new LLMOwnerConfigError("The selected model did not execute PetClaw's required tool-call request shape.");
    }
    checked.push("tools");
  }

  if (checked.length === 0) {
    await callTextTarget(target, {
      messages: probeMessages,
      temperature: 0,
      max_tokens: 16,
    });
    checked.push("text");
  }

  return { checked };
}

/**
 * Call an LLM with NATIVE tool/function definitions. Same routing/fallback
 * policy as callLLM. Owner BYOK stays single-provider; platform xAI may fail
 * over once to OpenAI on transient/spend failures. Google owner connections are
 * rejected because this adapter does not implement Gemini tool calls.
 */
export async function callLLMWithTools(args: CallLLMWithToolsArgs): Promise<ToolCallResult> {
  const {
    task,
    messages,
    tools,
    toolChoice,
    petId,
    budgetUserId,
    temperature = 0.4,
    maxTokens = 800,
    onProviderAttempt,
    signal,
  } = args;
  throwIfLLMAborted(signal);
  validateTextMessages(messages.map((message) => ({
    role: message.role === "tool" ? "user" : message.role,
    content: message.content ?? "",
  })));
  const safeMaxTokens = boundedOutputTokens(maxTokens);
  if (!Array.isArray(tools) || tools.length > 64 || Buffer.byteLength(JSON.stringify(tools), "utf8") > MAX_LLM_INPUT_BYTES) {
    throw new LLMInputError("AI tool definitions are too large.");
  }
  if (!Number.isFinite(temperature) || temperature < 0 || temperature > 2) {
    throw new LLMInputError("AI temperature must be between 0 and 2.");
  }
  const targets = await resolveTargets(task, petId, budgetUserId);
  throwIfLLMAborted(signal);
  return runWithProviderFallback(
    targets,
    (target) => {
      throwIfLLMAborted(signal);
      onProviderAttempt?.({ provider: target.provider.id, model: target.model, source: target.source });
      return callToolTarget(target, { messages, tools, toolChoice, temperature, maxTokens: safeMaxTokens, signal });
    },
    logProviderFallback,
    (target) => consumeLLMBudget(target, signal),
    signal,
  );
}

/**
 * Append the assistant's tool-call turn to a running messages array, in the
 * neutral shape (translated to provider wire form at the next send).
 */
export function appendAssistantToolCalls(messages: ToolMessage[], result: ToolCallResult): void {
  messages.push({ role: "assistant", content: result.content, tool_calls: result.toolCalls });
}

/**
 * Append tool RESULTS to a running messages array. Neutral role:"tool" entries
 * (the OpenAI shape) — callLLMWithTools translates them to Anthropic tool_result
 * blocks automatically when an Anthropic model is resolved.
 */
export function appendToolResults(
  messages: ToolMessage[],
  results: Array<{ tool_call_id: string; name?: string; content: string }>,
): void {
  for (const r of results) {
    messages.push({ role: "tool", tool_call_id: r.tool_call_id, name: r.name, content: r.content });
  }
}

const EMBEDDING_MODELS: Partial<Record<ProviderId, string>> = {
  openai: "text-embedding-3-small",
  google: "text-embedding-004",
};

/**
 * Embed texts using the pet-owner's connected OpenAI/Google model, if any.
 * Returns null when no embedding-capable provider is connected — Grok has NO
 * embeddings endpoint, so there is no platform default; callers fall back to
 * lexical retrieval. This is the wire-point for GBrain-style vector recall:
 * once an owner connects an OpenAI/Google key AND pgvector is enabled on the DB,
 * the memory ranker (retrieval.ts) can add a 4th vector RRF input. Until both
 * exist, retrieval stays lexical (RRF over TF-IDF + recency + source-tier).
 */
export async function callEmbedding(texts: string[], petId?: number): Promise<number[][] | null> {
  if (!petId || texts.length === 0) return null;
  try {
    const pet = await prisma.pet.findUnique({ where: { id: petId }, select: { user_id: true } });
    if (!pet?.user_id) return null;
    const conns = await prisma.modelConnection.findMany({
      where: { owner_user_id: pet.user_id, is_active: true, provider: { in: ["openai", "google"] } },
      orderBy: { updated_at: "desc" },
    });
    const conn = conns[0];
    if (!conn) return null;
    const apiKey = decrypt(conn.encrypted_key);
    if (!apiKey) return null;
    const provider = conn.provider as ProviderId;
    const model = EMBEDDING_MODELS[provider];
    if (!model) return null;

    if (provider === "openai") {
      const res = await fetch(`${PROVIDERS.openai.baseUrl}/embeddings`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model, input: texts }),
      });
      if (!res.ok) return null;
      const raw = await res.json();
      return (raw?.data || []).map((d: any) => d.embedding as number[]);
    }
    // google — one call per text (embedContent is single-input)
    const out: number[][] = [];
    for (const text of texts) {
      const res = await fetch(`${PROVIDERS.google.baseUrl}/models/${model}:embedContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({ content: { parts: [{ text }] } }),
      });
      if (!res.ok) return null;
      const raw = await res.json();
      out.push((raw?.embedding?.values || []) as number[]);
    }
    return out;
  } catch {
    return null;
  }
}

/** Providers a user may connect (for the /api/petclaw/models UI + validation). */
export function supportedProviders(): { id: ProviderId; label: string; keyFormat: string }[] {
  return [
    { id: "xai", label: "xAI (Grok)", keyFormat: "xai-..." },
    { id: "openai", label: "OpenAI", keyFormat: "sk-..." },
    { id: "anthropic", label: "Anthropic (Claude)", keyFormat: "sk-ant-..." },
    { id: "google", label: "Google (Gemini)", keyFormat: "AIza..." },
    { id: "openrouter", label: "OpenRouter (any model)", keyFormat: "sk-or-..." },
    { id: "nous", label: "Nous Research (Hermes)", keyFormat: "Portal API key" },
  ];
}

export const LLM_TASKS: LLMTask[] = ["chat", "reason", "judge", "summarize", "extract", "persona"];

// Tasks where a CONNECTED owner model is actually honored end-to-end today (the
// call sites route through callLLM). The UI only offers these so the scope picker
// can't promise routing the backend doesn't perform — the rest still run on the
// platform Grok default. Keep this in sync as more call sites migrate to callLLM:
//   chat   → chat route + executeLLMSkill (all LLM-backed skills)
//   reason → plan-execute agent loop
//   judge  → best-of-N selection
export const CONNECTABLE_TASKS: LLMTask[] = ["chat", "reason", "judge"];
