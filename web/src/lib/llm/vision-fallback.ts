/**
 * Shared xAI → OpenAI vision transport. Provider errors are classified by the
 * same policy as text inference, while the required reservation callback runs
 * immediately before every actual vendor request (including fallback).
 */

import {
  LLMUpstreamError,
  classifyLLMHTTPFailure,
  getLLMRequestTimeoutMs,
  runWithProviderFallback,
} from "./platform-resilience";

type VisionProviderId = "xai" | "openai";

interface VisionTarget {
  id: VisionProviderId;
  key: string;
  baseUrl: string;
  model: string;
}

export interface VisionTextArgs {
  imageUrl: string;
  prompt: string;
  xaiModel?: string;
  maxTokens: number;
  temperature?: number;
}

export interface VisionFallbackDependencies {
  reserveAttempt: (provider: VisionProviderId) => Promise<void>;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  logFallback?: boolean;
}

function targetsForVision(env: NodeJS.ProcessEnv, xaiModel: string): VisionTarget[] {
  const targets: VisionTarget[] = [];
  const xaiKey = env.GROK_API_KEY || env.XAI_API_KEY || "";
  if (xaiKey) {
    targets.push({ id: "xai", key: xaiKey, baseUrl: "https://api.x.ai/v1", model: xaiModel });
  }
  if (env.OPENAI_API_KEY) {
    targets.push({
      id: "openai",
      key: env.OPENAI_API_KEY,
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-5.6-luna",
    });
  }
  return targets;
}

async function requestVisionText(
  target: VisionTarget,
  args: VisionTextArgs,
  fetchImpl: typeof fetch,
  timeoutMs: number,
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  let body: string;
  try {
    response = await fetchImpl(`${target.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${target.key}` },
      body: JSON.stringify({
        model: target.model,
        messages: [{
          role: "user",
          content: [
            { type: "image_url", image_url: { url: args.imageUrl } },
            { type: "text", text: args.prompt },
          ],
        }],
        ...(target.id === "openai"
          ? { max_completion_tokens: args.maxTokens, reasoning_effort: "none" }
          : { max_tokens: args.maxTokens }),
        ...(args.temperature == null ? {} : { temperature: args.temperature }),
      }),
      signal: controller.signal,
    });
    body = await response.text();
  } catch (error: any) {
    const timedOut = controller.signal.aborted || error?.name === "AbortError";
    throw new LLMUpstreamError(
      target.id,
      `${target.id} vision ${timedOut ? "timeout" : "network failure"}`,
      true,
      undefined,
      timedOut ? "timeout" : "network",
    );
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const policy = classifyLLMHTTPFailure(response.status, body);
    throw new LLMUpstreamError(
      target.id,
      `${target.id} vision HTTP ${response.status} (${policy.reason})`,
      policy.retryable,
      response.status,
      policy.reason,
    );
  }

  let raw: any;
  try {
    raw = JSON.parse(body);
  } catch {
    throw new LLMUpstreamError(target.id, `${target.id} vision returned malformed JSON`, true, 200, "response");
  }
  const text = String(raw?.choices?.[0]?.message?.content || "").trim();
  if (!text) throw new LLMUpstreamError(target.id, `${target.id} vision returned an empty response`, true, 200, "response");
  return text;
}

/**
 * Returns null on an exhausted/terminal provider failure so each feature can
 * retain its existing graceful local behavior. Reservation/store failures are
 * deliberately rethrown and therefore can never run an unmetered request.
 */
export async function callVisionTextWithFallback(
  args: VisionTextArgs,
  dependencies: VisionFallbackDependencies,
): Promise<string | null> {
  const env = dependencies.env || process.env;
  const targets = targetsForVision(env, args.xaiModel || "grok-4-1-fast-non-reasoning");
  if (targets.length === 0) return null;

  try {
    return await runWithProviderFallback(
      targets,
      (target) => requestVisionText(
        target,
        args,
        dependencies.fetchImpl || fetch,
        getLLMRequestTimeoutMs(env),
      ),
      (from, to, error) => {
        if (dependencies.logFallback !== false) {
          console.warn(
            `[vision] ${from.id} failed (${error.reason}${error.status ? ` ${error.status}` : ""}); trying ${to.id}`,
          );
        }
      },
      (target) => dependencies.reserveAttempt(target.id),
    );
  } catch (error) {
    if (error instanceof LLMUpstreamError) return null;
    throw error;
  }
}
