/**
 * Unified LLM caller + task routing (FEATURE 1: BYO multi-model).
 *
 * GROUNDING — the real call sites today all hand-roll a fetch to xAI Grok:
 *   - app/api/pets/[petId]/chat/route.ts        model grok-3-mini
 *   - lib/petclaw/pethub.ts executeLLMSkill     model grok-3-mini-fast
 *   - lib/petclaw/memory/best-of-n.ts pickBestLLM grok-3-mini-fast
 *   - lib/services/pet-agent.ts + memory/*.ts   grok-3 / grok-4-1-fast
 * Every one is `fetch("https://api.x.ai/v1/chat/completions", { Authorization:
 * Bearer GROK_API_KEY, body { model, messages, max_tokens, temperature } })`.
 * There is NO provider abstraction. THIS module is it.
 *
 * Design contract:
 *   - The DEFAULT (no owner-connected model) path is byte-for-byte identical to
 *     the existing Grok fetch — same URL/headers/body keys — so migrating a call
 *     site to callLLM() cannot change its output or cost.
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
 * Platform default (Grok) per task — mirrors what the code uses TODAY so the
 * fallback path is a no-op change. (chat→grok-3-mini as in chat/route.ts;
 * judge/persona→grok-3-mini-fast as in pethub.ts/best-of-n.ts; reason→grok-3.)
 */
export const TASK_MODEL_MAP: Record<LLMTask, { provider: ProviderId; model: string }> = {
  chat: { provider: "xai", model: "grok-3-mini" },
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
  temperature?: number;
  max_tokens?: number;
  /** OpenAI-shaped providers only (e.g. { type: "json_object" }). */
  response_format?: { type: string };
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
}

// ─────────────────────────────────────────────────────────────────────────────
// DAILY LLM SPEND GUARD — in-memory, DB-free, per-process (matches the posture
// of src/lib/rateLimit.ts: good enough for a single standalone instance).
//
// Counts PLATFORM-funded calls only (owner/BYOK calls burn the owner's own key,
// not our Grok bill). Two caps, both env-tunable:
//   LLM_DAILY_CALL_CAP  — total platform calls per UTC day (default 2000)
//   LLM_USER_DAILY_CAP  — per-caller platform calls per UTC day (default 60);
//                         keyed by petId (each pet belongs to one user, and
//                         petId is what every call site already passes).
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

function envCap(name: string, def: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : def;
}

const budget = {
  date: "", // UTC YYYY-MM-DD the counters belong to
  total: 0,
  perUser: new Map<string, number>(),
};

/** Count one platform-funded call; throws LLMBudgetError when a cap is hit. */
function consumeLLMBudget(petId?: number): void {
  const today = new Date().toISOString().slice(0, 10);
  if (budget.date !== today) {
    budget.date = today;
    budget.total = 0;
    budget.perUser.clear();
  }
  if (budget.total >= envCap("LLM_DAILY_CALL_CAP", 2000)) throw new LLMBudgetError();
  if (petId) {
    const key = `pet:${petId}`;
    const used = budget.perUser.get(key) ?? 0;
    if (used >= envCap("LLM_USER_DAILY_CAP", 60)) throw new LLMBudgetError();
    budget.perUser.set(key, used + 1);
  }
  budget.total++;
}

/**
 * Read-only snapshot of today's in-memory platform-LLM budget counters, for the
 * admin ops dashboard (/api/admin/overview). Same per-process, resets-on-deploy
 * posture as the budget itself — HONEST but partial: it only sees calls handled
 * by THIS process since the last restart, and only platform-funded calls
 * (owner/BYOK calls never touch the budget). Zero means "none counted here",
 * not necessarily "none happened".
 */
export function getLLMDailyCounters(): {
  date: string;
  platformCalls: number;
  distinctCallers: number;
  callCap: number;
  perUserCap: number;
} {
  const today = new Date().toISOString().slice(0, 10);
  const fresh = budget.date !== today; // counters not yet rolled for today
  return {
    date: today,
    platformCalls: fresh ? 0 : budget.total,
    distinctCallers: fresh ? 0 : budget.perUser.size,
    callCap: envCap("LLM_DAILY_CALL_CAP", 2000),
    perUserCap: envCap("LLM_USER_DAILY_CAP", 60),
  };
}

/**
 * Resolve provider+model+key. Preference: the pet-owner's active ModelConnection
 * whose task_scopes include this task (most-recently-updated wins), else the
 * platform Grok default. Any owner-resolution failure (decrypt/missing/unknown)
 * silently falls through to the platform default — never throws here.
 */
async function resolveTarget(task: LLMTask, petId?: number): Promise<ResolvedTarget> {
  const fallback = (): ResolvedTarget => {
    const def = TASK_MODEL_MAP[task];
    return { provider: PROVIDERS[def.provider], model: def.model, apiKey: process.env.GROK_API_KEY || "", source: "platform" };
  };

  if (!petId) return fallback();
  try {
    const pet = await prisma.pet.findUnique({ where: { id: petId }, select: { user_id: true } });
    if (!pet?.user_id) return fallback();
    const conns = await prisma.modelConnection.findMany({
      where: { owner_user_id: pet.user_id, is_active: true },
      orderBy: { updated_at: "desc" },
    });
    const match = conns.find((c) => {
      const scopes = (Array.isArray(c.task_scopes) ? c.task_scopes : []) as string[];
      return scopes.length === 0 || scopes.includes(task);
    });
    if (!match) return fallback();
    const provider = PROVIDERS[match.provider as ProviderId];
    if (!provider || !match.encrypted_key) return fallback();
    const apiKey = decrypt(match.encrypted_key);
    if (!apiKey) return fallback();
    return { provider, model: match.model, apiKey, source: "owner" };
  } catch {
    return fallback();
  }
}

/**
 * Call an LLM, routed by task and (optionally) the pet-owner's connected model.
 * Returns normalized { text, model, provider, source, raw }.
 */
export async function callLLM(args: CallLLMArgs): Promise<LLMResult> {
  const { task, messages, petId, temperature = 0.7, max_tokens = 300, response_format } = args;
  const target = await resolveTarget(task, petId);
  if (!target.apiKey) throw new Error(`No API key available for task '${task}' (provider ${target.provider.id})`);
  if (target.source === "platform") consumeLLMBudget(petId);

  if (target.provider.flavor === "anthropic") {
    // Anthropic: /messages, x-api-key + anthropic-version, system is top-level.
    const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
    const turns = messages.filter((m) => m.role !== "system").map((m) => ({ role: m.role, content: m.content }));
    const res = await fetch(`${target.provider.baseUrl}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": target.apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: target.model, max_tokens, temperature, system: system || undefined, messages: turns }),
    });
    if (!res.ok) throw new Error(`${target.provider.id} ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
    const raw = await res.json();
    const text = (raw?.content?.[0]?.text || "").trim();
    return { text, model: raw?.model || target.model, provider: target.provider.id, source: target.source, raw };
  }

  if (target.provider.flavor === "google") {
    // Gemini: :generateContent, key in x-goog-api-key header (never in the URL).
    // Roles map system→systemInstruction, assistant→model, user→user.
    const systemText = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
    const contents = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
    const res = await fetch(`${target.provider.baseUrl}/models/${target.model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": target.apiKey },
      body: JSON.stringify({
        ...(systemText ? { systemInstruction: { parts: [{ text: systemText }] } } : {}),
        contents,
        generationConfig: { temperature, maxOutputTokens: max_tokens },
      }),
    });
    if (!res.ok) throw new Error(`google ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
    const raw = await res.json();
    const text = (raw?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join("") || "").trim();
    return { text, model: target.model, provider: target.provider.id, source: target.source, raw };
  }

  // OpenAI-shaped (xai / openai / openrouter) — identical body to today's Grok fetch.
  const res = await fetch(`${target.provider.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${target.apiKey}` },
    body: JSON.stringify({ model: target.model, messages, max_tokens, temperature, ...(response_format ? { response_format } : {}) }),
  });
  if (!res.ok) throw new Error(`${target.provider.id} ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
  const raw = await res.json();
  const text = (raw?.choices?.[0]?.message?.content || "").trim();
  return { text, model: raw?.model || target.model, provider: target.provider.id, source: target.source, raw };
}

// ─────────────────────────────────────────────────────────────────────────────
// NATIVE FUNCTION-CALLING (tools) — used by the tool-calling agent loop.
//
// callLLMWithTools() mirrors callLLM()'s provider resolution + key decrypt
// (reuses the SAME private resolveTarget helper) but sends NATIVE tool
// definitions in each provider's shape and returns a NORMALIZED tool-call
// result. callLLM() is untouched — its signature and behavior are identical.
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
  temperature?: number;
  maxTokens?: number;
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

/**
 * Call an LLM with NATIVE tool/function definitions. Same routing/key resolution
 * as callLLM (owner-connected model for the task, else platform Grok default).
 * OpenAI-shape is the primary path (Grok supports tools + tool_choice + parallel
 * calls). Google is rejected with a clear, actionable error.
 */
export async function callLLMWithTools(args: CallLLMWithToolsArgs): Promise<ToolCallResult> {
  const { task, messages, tools, toolChoice, petId, temperature = 0.4, maxTokens = 800 } = args;
  const target = await resolveTarget(task, petId);
  if (!target.apiKey) throw new Error(`No API key available for task '${task}' (provider ${target.provider.id})`);
  if (target.source === "platform") consumeLLMBudget(petId);

  if (target.provider.flavor === "google") {
    throw new Error(
      "tool-calling not supported for provider 'google' — connect an OpenAI-compatible (xAI/OpenAI/OpenRouter/Nous) or Anthropic model at /api/petclaw/models",
    );
  }

  if (target.provider.flavor === "anthropic") {
    const { system, turns } = toAnthropicToolConversation(messages);
    const res = await fetch(`${target.provider.baseUrl}/messages`, {
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
    });
    if (!res.ok) throw new Error(`${target.provider.id} ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
    const raw = await res.json();
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

  // OpenAI-shaped (xai / openai / openrouter / nous) — the primary path (Grok).
  const res = await fetch(`${target.provider.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${target.apiKey}` },
    body: JSON.stringify({
      model: target.model,
      messages: toOpenAIToolMessages(messages),
      max_tokens: maxTokens,
      temperature,
      tools: tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.parameters } })),
      ...(toOpenAIToolChoice(toolChoice) ? { tool_choice: toOpenAIToolChoice(toolChoice) } : {}),
    }),
  });
  if (!res.ok) throw new Error(`${target.provider.id} ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
  const raw = await res.json();
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
