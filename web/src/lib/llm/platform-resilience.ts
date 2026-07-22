/**
 * Pure platform-LLM resilience policy.
 *
 * Kept separate from router.ts so the provider order and retry classification
 * can be tested without loading Prisma, crypto, or real API keys.
 */

export type PlatformLLMTask = "chat" | "reason" | "judge" | "summarize" | "extract" | "persona";
export type LLMProviderId = "xai" | "openai" | "anthropic" | "openrouter" | "google" | "nous";
export type PlatformProviderId = Extract<LLMProviderId, "xai" | "openai">;
export type ConnectableLLMTask = Extract<PlatformLLMTask, "chat" | "reason" | "judge">;

const PLATFORM_PROVIDER_IDS = new Set<PlatformProviderId>(["xai", "openai"]);

/**
 * Platform-funded inference may only use these audited text models. Env
 * overrides are validated against this code-owned allowlist so a typo or
 * injected model cannot silently select an expensive/unsupported model.
 */
const PLATFORM_DEFAULT_MODELS: Readonly<Record<PlatformProviderId, Readonly<Record<PlatformLLMTask, string>>>> = {
  xai: {
    chat: "grok-3-mini",
    reason: "grok-4-1-fast-non-reasoning",
    judge: "grok-3-mini-fast",
    summarize: "grok-3-mini-fast",
    extract: "grok-3-mini-fast",
    persona: "grok-3-mini-fast",
  },
  openai: {
    // Founder cost call (2026-07-21): companion chat runs on the cheap GPT
    // mini tier; Grok stays the fallback + the default for every other task.
    chat: "gpt-4o-mini",
    reason: "gpt-5.6-luna",
    judge: "gpt-5.6-luna",
    summarize: "gpt-5.6-luna",
    extract: "gpt-5.6-luna",
    persona: "gpt-5.6-luna",
  },
};

export const PLATFORM_ALLOWED_MODEL_IDS: Readonly<Record<PlatformProviderId, readonly string[]>> = {
  xai: ["grok-3-mini", "grok-3-mini-fast", "grok-4-1-fast-non-reasoning"],
  openai: ["gpt-5.6-luna", "gpt-4o-mini"],
};

/**
 * Per-task platform PRIMARY provider. Chat defaults to OpenAI (cheaper mini
 * model) with Grok as fallback; every other task stays Grok-first. Overridable
 * per task via LLM_<TASK>_PLATFORM_PROVIDER, globally via LLM_PLATFORM_PROVIDER.
 */
const PLATFORM_DEFAULT_TASK_PROVIDER: Readonly<Record<PlatformLLMTask, PlatformProviderId>> = {
  chat: "openai",
  reason: "xai",
  judge: "xai",
  summarize: "xai",
  extract: "xai",
  persona: "xai",
};

export class LLMPlatformConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LLMPlatformConfigError";
  }
}

/**
 * A matching owner BYOK connection exists but cannot safely serve the task.
 * Callers must surface this error; they must never reinterpret it as permission
 * to send the owner's prompt to a platform-funded provider.
 */
export class LLMOwnerConfigError extends Error {
  readonly status = 503;
  readonly code = "owner_model_unavailable";

  constructor(message = "Your connected model is unavailable. Platform fallback was blocked to protect your data.") {
    super(message);
    this.name = "LLMOwnerConfigError";
  }
}

const CONNECTABLE_TASKS = new Set<ConnectableLLMTask>(["chat", "reason", "judge"]);

/**
 * Empty is the legacy persisted spelling of "all UI-connectable tasks", not
 * every internal task. Explicit legacy scopes still match so validation can
 * fail closed instead of silently re-routing that prompt to a platform key.
 */
export function ownerTaskScopeMatches(
  task: PlatformLLMTask,
  storedScopes: unknown,
): boolean {
  const scopes = Array.isArray(storedScopes)
    ? storedScopes.filter((scope): scope is string => typeof scope === "string")
    : [];
  return scopes.length === 0
    ? CONNECTABLE_TASKS.has(task as ConnectableLLMTask)
    : scopes.includes(task);
}

/** Capabilities implemented by this router's adapters, not vendor-wide claims. */
const OWNER_PROVIDER_CAPABILITIES: Readonly<Record<LLMProviderId, ReadonlySet<"text" | "json" | "tools">>> = {
  xai: new Set(["text", "json", "tools"]),
  openai: new Set(["text", "json", "tools"]),
  anthropic: new Set(["text", "json", "tools"]),
  openrouter: new Set(["text", "json", "tools"]),
  google: new Set(["text", "json"]),
  nous: new Set(["text", "json", "tools"]),
};

export interface ValidatedOwnerModelConfig {
  provider: LLMProviderId;
  model: string;
  /** Empty remains the persisted representation for "all connectable tasks". */
  taskScopes: ConnectableLLMTask[];
  effectiveTasks: ConnectableLLMTask[];
}

/**
 * Validate the provider/model/task contract before encrypting a key and again
 * while resolving legacy rows. Model-specific support is subsequently proven
 * with a live, key-funded capability probe in the connection route.
 */
export function validateOwnerModelConfig(
  provider: string,
  modelValue: string,
  requestedScopes: readonly string[],
): ValidatedOwnerModelConfig {
  if (!Object.prototype.hasOwnProperty.call(OWNER_PROVIDER_CAPABILITIES, provider)) {
    throw new LLMOwnerConfigError(`Unsupported connected-model provider '${provider}'.`);
  }

  const model = modelValue.trim();
  const modelPattern = provider === "openrouter"
    ? /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,79}$/
    : /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/;
  if (!modelPattern.test(model) || model.includes("..")) {
    throw new LLMOwnerConfigError("The connected model id is empty or contains unsupported characters.");
  }

  const unknownScope = requestedScopes.find((scope) => !CONNECTABLE_TASKS.has(scope as ConnectableLLMTask));
  if (unknownScope) throw new LLMOwnerConfigError(`Unsupported model task scope '${unknownScope}'.`);

  const taskScopes = [...new Set(requestedScopes)] as ConnectableLLMTask[];
  const effectiveTasks = taskScopes.length > 0 ? taskScopes : [...CONNECTABLE_TASKS];
  const capabilities = OWNER_PROVIDER_CAPABILITIES[provider as LLMProviderId];
  if (effectiveTasks.includes("reason") && !capabilities.has("tools")) {
    throw new LLMOwnerConfigError(
      `Provider '${provider}' cannot be connected for reason: this PetClaw adapter does not support its tool-call request shape.`,
    );
  }
  if (effectiveTasks.includes("judge") && !capabilities.has("json")) {
    throw new LLMOwnerConfigError(
      `Provider '${provider}' cannot be connected for judge: this PetClaw adapter does not support structured JSON output.`,
    );
  }

  return { provider: provider as LLMProviderId, model, taskScopes, effectiveTasks };
}

export class LLMUpstreamError extends Error {
  readonly provider: LLMProviderId;
  readonly retryable: boolean;
  readonly status?: number;
  readonly reason: "timeout" | "network" | "spend" | "rate_limit" | "server" | "response" | "auth" | "input" | "other";

  constructor(
    provider: LLMProviderId,
    message: string,
    retryable: boolean,
    status?: number,
    reason: "timeout" | "network" | "spend" | "rate_limit" | "server" | "response" | "auth" | "input" | "other" = "other",
  ) {
    super(message);
    this.name = "LLMUpstreamError";
    this.provider = provider;
    this.retryable = retryable;
    this.status = status;
    this.reason = reason;
  }
}

/** Throw the caller's cancellation reason without converting it to fallback. */
export function throwIfLLMAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  if (signal.reason instanceof Error) throw signal.reason;
  const error = new Error("LLM request cancelled");
  error.name = "AbortError";
  throw error;
}

function parseProvider(value: string | undefined, envName: string, fallback: PlatformProviderId): PlatformProviderId {
  const normalized = (value || fallback).trim().toLowerCase();
  if (PLATFORM_PROVIDER_IDS.has(normalized as PlatformProviderId)) return normalized as PlatformProviderId;
  throw new LLMPlatformConfigError(`${envName} must be 'xai' or 'openai'`);
}

/**
 * Provider order, task-aware. Primary resolution: LLM_<TASK>_PLATFORM_PROVIDER
 * → LLM_PLATFORM_PROVIDER → per-task default (chat→openai, rest→xai). The
 * other platform provider is the fallback unless LLM_PLATFORM_FALLBACK_PROVIDER
 * pins it or "none" disables it.
 */
export function getPlatformProviderOrder(task?: PlatformLLMTask, env: NodeJS.ProcessEnv = process.env): PlatformProviderId[] {
  const taskDefault: PlatformProviderId = task ? PLATFORM_DEFAULT_TASK_PROVIDER[task] : "xai";
  const taskEnv = task ? env[`LLM_${task.toUpperCase()}_PLATFORM_PROVIDER`] : undefined;
  const primary = parseProvider(taskEnv || env.LLM_PLATFORM_PROVIDER, "LLM_PLATFORM_PROVIDER", taskDefault);
  const otherProvider: PlatformProviderId = primary === "xai" ? "openai" : "xai";
  const fallbackRaw = (env.LLM_PLATFORM_FALLBACK_PROVIDER || otherProvider).trim().toLowerCase();
  if (fallbackRaw === "none") return [primary];
  const fallback = parseProvider(fallbackRaw, "LLM_PLATFORM_FALLBACK_PROVIDER", otherProvider);
  return primary === fallback ? [primary] : [primary, fallback];
}

export function getPlatformModel(provider: PlatformProviderId, task: PlatformLLMTask, env: NodeJS.ProcessEnv = process.env): string {
  const prefix = provider.toUpperCase();
  const taskOverride = env[`LLM_${prefix}_${task.toUpperCase()}_MODEL`];
  const globalOverride = env[`LLM_${prefix}_MODEL`];
  const model = (taskOverride || globalOverride || PLATFORM_DEFAULT_MODELS[provider][task]).trim();
  if (!PLATFORM_ALLOWED_MODEL_IDS[provider].includes(model)) {
    throw new LLMPlatformConfigError(
      `Model '${model}' is not allowed for platform provider '${provider}' (allowed: ${PLATFORM_ALLOWED_MODEL_IDS[provider].join(", ")})`,
    );
  }
  return model;
}

export function getPlatformApiKey(provider: PlatformProviderId, env: NodeJS.ProcessEnv = process.env): string {
  return provider === "xai" ? (env.GROK_API_KEY || "") : (env.OPENAI_API_KEY || "");
}

/** 20s default; reject absurd values by falling back to the safe default. */
export function getLLMRequestTimeoutMs(env: NodeJS.ProcessEnv = process.env): number {
  const parsed = Number(env.LLM_REQUEST_TIMEOUT_MS);
  if (!Number.isFinite(parsed) || parsed < 1_000 || parsed > 120_000) return 20_000;
  return Math.floor(parsed);
}

const SPEND_FAILURE = /(?:spend(?:ing)?[ _-]?(?:limit|cap)|billing[ _-]?(?:limit|quota)|insufficient[ _-]?(?:credit|quota|fund)|credit[ _-]?(?:balance|exhaust)|quota[ _-]?exceed|payment[ _-]?required|monthly[ _-]?(?:budget|limit)|(?:no|not enough|doesn['’]?t have any|does not have any)[ _-]+(?:available[ _-]+)?credits?)/i;

/**
 * HTTP failures eligible for ONE provider fallback. Authentication/permission
 * and request/input errors intentionally return false, even if another key is
 * available: fallback must not mask a broken credential or malformed prompt.
 */
export function classifyLLMHTTPFailure(status: number, body: string): Pick<LLMUpstreamError, "retryable" | "reason"> {
  if (status === 408) return { retryable: true, reason: "timeout" };
  if (status === 429) return { retryable: true, reason: "rate_limit" };
  if (status >= 500 && status <= 599) return { retryable: true, reason: "server" };
  if (status !== 401 && SPEND_FAILURE.test(body)) return { retryable: true, reason: "spend" };
  if (status === 401 || status === 403) return { retryable: false, reason: "auth" };
  if (status >= 400 && status <= 499) return { retryable: false, reason: "input" };
  return { retryable: false, reason: "other" };
}

/**
 * Try targets in order, but advance only after an explicitly retryable
 * LLMUpstreamError. This is provider failover, not a general catch-all retry.
 */
export async function runWithProviderFallback<TTarget, TResult>(
  targets: readonly TTarget[],
  execute: (target: TTarget) => Promise<TResult>,
  onFallback?: (from: TTarget, to: TTarget, error: LLMUpstreamError) => void,
  beforeAttempt?: (target: TTarget) => Promise<void> | void,
  signal?: AbortSignal,
): Promise<TResult> {
  if (targets.length === 0) throw new LLMPlatformConfigError("No platform LLM provider has an API key");
  for (let i = 0; i < targets.length; i++) {
    try {
      throwIfLLMAborted(signal);
      // This hook runs once per actual provider attempt. The router uses it to
      // atomically reserve persistent platform budget before touching a vendor.
      await beforeAttempt?.(targets[i]);
      // Budget reservation is local DB work and cannot be abandoned safely.
      // Await it, then fence the vendor request if the run expired meanwhile.
      throwIfLLMAborted(signal);
      return await execute(targets[i]);
    } catch (error) {
      // Caller cancellation is terminal. It must never be reclassified as a
      // retryable provider timeout or launch a paid fallback attempt.
      throwIfLLMAborted(signal);
      const next = targets[i + 1];
      if (!(error instanceof LLMUpstreamError) || !error.retryable || !next) throw error;
      throwIfLLMAborted(signal);
      onFallback?.(targets[i], next, error);
    }
  }
  throw new LLMPlatformConfigError("No platform LLM provider could be attempted");
}
