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
    chat: "gpt-5.6-luna",
    reason: "gpt-5.6-luna",
    judge: "gpt-5.6-luna",
    summarize: "gpt-5.6-luna",
    extract: "gpt-5.6-luna",
    persona: "gpt-5.6-luna",
  },
};

export const PLATFORM_ALLOWED_MODEL_IDS: Readonly<Record<PlatformProviderId, readonly string[]>> = {
  xai: ["grok-3-mini", "grok-3-mini-fast", "grok-4-1-fast-non-reasoning"],
  openai: ["gpt-5.6-luna"],
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

function parseProvider(value: string | undefined, envName: string, fallback: PlatformProviderId): PlatformProviderId {
  const normalized = (value || fallback).trim().toLowerCase();
  if (PLATFORM_PROVIDER_IDS.has(normalized as PlatformProviderId)) return normalized as PlatformProviderId;
  throw new LLMPlatformConfigError(`${envName} must be 'xai' or 'openai'`);
}

/** Default order is xAI first, OpenAI second. Set fallback to "none" to disable it. */
export function getPlatformProviderOrder(env: NodeJS.ProcessEnv = process.env): PlatformProviderId[] {
  const primary = parseProvider(env.LLM_PLATFORM_PROVIDER, "LLM_PLATFORM_PROVIDER", "xai");
  const fallbackRaw = (env.LLM_PLATFORM_FALLBACK_PROVIDER || "openai").trim().toLowerCase();
  if (fallbackRaw === "none") return [primary];
  const fallback = parseProvider(fallbackRaw, "LLM_PLATFORM_FALLBACK_PROVIDER", "openai");
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
): Promise<TResult> {
  if (targets.length === 0) throw new LLMPlatformConfigError("No platform LLM provider has an API key");
  for (let i = 0; i < targets.length; i++) {
    try {
      // This hook runs once per actual provider attempt. The router uses it to
      // atomically reserve persistent platform budget before touching a vendor.
      await beforeAttempt?.(targets[i]);
      return await execute(targets[i]);
    } catch (error) {
      const next = targets[i + 1];
      if (!(error instanceof LLMUpstreamError) || !error.retryable || !next) throw error;
      onFallback?.(targets[i], next, error);
    }
  }
  throw new LLMPlatformConfigError("No platform LLM provider could be attempted");
}
