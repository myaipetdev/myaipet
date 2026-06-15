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
export type ProviderId = "xai" | "openai" | "anthropic" | "openrouter";

interface ProviderConfig {
  id: ProviderId;
  baseUrl: string;
  /** "openai" → /chat/completions shape; "anthropic" → /messages shape. */
  flavor: "openai" | "anthropic";
}

const PROVIDERS: Record<ProviderId, ProviderConfig> = {
  xai: { id: "xai", baseUrl: "https://api.x.ai/v1", flavor: "openai" },
  openai: { id: "openai", baseUrl: "https://api.openai.com/v1", flavor: "openai" },
  anthropic: { id: "anthropic", baseUrl: "https://api.anthropic.com/v1", flavor: "anthropic" },
  openrouter: { id: "openrouter", baseUrl: "https://openrouter.ai/api/v1", flavor: "openai" },
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

/** Providers a user may connect (for the /api/petclaw/models UI + validation). */
export function supportedProviders(): { id: ProviderId; label: string; keyFormat: string }[] {
  return [
    { id: "xai", label: "xAI (Grok)", keyFormat: "xai-..." },
    { id: "openai", label: "OpenAI", keyFormat: "sk-..." },
    { id: "anthropic", label: "Anthropic (Claude)", keyFormat: "sk-ant-..." },
    { id: "openrouter", label: "OpenRouter (any model)", keyFormat: "sk-or-..." },
  ];
}

export const LLM_TASKS: LLMTask[] = ["chat", "reason", "judge", "summarize", "extract", "persona"];
