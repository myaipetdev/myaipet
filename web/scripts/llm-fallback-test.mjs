#!/usr/bin/env node
/** Offline policy test: no Prisma, network, or API keys required. */

import assert from "node:assert/strict";
import {
  LLMOwnerConfigError,
  LLMPlatformConfigError,
  LLMUpstreamError,
  classifyLLMHTTPFailure,
  getLLMRequestTimeoutMs,
  getPlatformModel,
  getPlatformProviderOrder,
  runWithProviderFallback,
  validateOwnerModelConfig,
} from "../src/lib/llm/platform-resilience.ts";

let checks = 0;
const check = (name, fn) => {
  fn();
  checks++;
  console.log(`  ✓ ${name}`);
};

check("chat defaults to OpenAI then xAI", () => {
  assert.deepEqual(getPlatformProviderOrder("chat", {}), ["openai", "xai"]);
});
check("non-chat tasks default to xAI then OpenAI", () => {
  assert.deepEqual(getPlatformProviderOrder("reason", {}), ["xai", "openai"]);
});
check("env can choose OpenAI and disable fallback", () => {
  assert.deepEqual(
    getPlatformProviderOrder("reason", { LLM_PLATFORM_PROVIDER: "openai", LLM_PLATFORM_FALLBACK_PROVIDER: "none" }),
    ["openai"],
  );
});
check("task-specific env overrides the global provider", () => {
  assert.deepEqual(
    getPlatformProviderOrder("chat", { LLM_PLATFORM_PROVIDER: "openai", LLM_CHAT_PLATFORM_PROVIDER: "xai" }),
    ["xai", "openai"],
  );
});
check("duplicate providers are attempted once", () => {
  assert.deepEqual(
    getPlatformProviderOrder("reason", { LLM_PLATFORM_PROVIDER: "xai", LLM_PLATFORM_FALLBACK_PROVIDER: "xai" }),
    ["xai"],
  );
});
check("unknown providers fail closed", () => {
  assert.throws(
    () => getPlatformProviderOrder("chat", { LLM_PLATFORM_PROVIDER: "arbitrary" }),
    LLMPlatformConfigError,
  );
});
check("platform models are explicit, task-specific allowlist entries", () => {
  assert.equal(getPlatformModel("xai", "chat"), "grok-3-mini");
  assert.equal(getPlatformModel("openai", "chat"), "gpt-4o-mini");
  assert.equal(getPlatformModel("openai", "reason"), "gpt-5.6-luna");
  assert.equal(getPlatformModel("openai", "chat", { LLM_OPENAI_MODEL: "gpt-5.6-luna" }), "gpt-5.6-luna");
  assert.throws(() => getPlatformModel("openai", "chat", { LLM_OPENAI_MODEL: "arbitrary" }), LLMPlatformConfigError);
});
check("timeout accepts only the bounded range", () => {
  assert.equal(getLLMRequestTimeoutMs({ LLM_REQUEST_TIMEOUT_MS: "35000" }), 35_000);
  assert.equal(getLLMRequestTimeoutMs({ LLM_REQUEST_TIMEOUT_MS: "999999" }), 20_000);
  assert.equal(getLLMRequestTimeoutMs({ LLM_REQUEST_TIMEOUT_MS: "bad" }), 20_000);
});
check("owner provider/model/task contracts fail closed", () => {
  assert.throws(() => validateOwnerModelConfig("arbitrary", "model", []), LLMOwnerConfigError);
  assert.throws(() => validateOwnerModelConfig("openai", "../secret", ["chat"]), LLMOwnerConfigError);
  assert.throws(() => validateOwnerModelConfig("openai", "gpt-4.1-mini", ["unknown"]), LLMOwnerConfigError);
  assert.throws(() => validateOwnerModelConfig("google", "gemini-2.5-flash", []), /reason/);
  assert.deepEqual(
    validateOwnerModelConfig("google", "gemini-2.5-flash", ["chat", "judge"]).effectiveTasks,
    ["chat", "judge"],
  );
  assert.deepEqual(
    validateOwnerModelConfig("openai", "gpt-4.1-mini", []).effectiveTasks,
    ["chat", "reason", "judge"],
  );
});
check("spend, rate-limit, and server errors are retryable", () => {
  assert.equal(classifyLLMHTTPFailure(403, '{"error":"team spending limit reached"}').retryable, true);
  assert.equal(classifyLLMHTTPFailure(403, '{"error":"team does not have any credits"}').retryable, true);
  assert.equal(classifyLLMHTTPFailure(408, "request timeout").retryable, true);
  assert.equal(classifyLLMHTTPFailure(429, "rate limited").retryable, true);
  assert.equal(classifyLLMHTTPFailure(503, "unavailable").retryable, true);
});
check("auth, permission, and input errors are not retryable", () => {
  assert.equal(classifyLLMHTTPFailure(401, "invalid api key").retryable, false);
  assert.equal(classifyLLMHTTPFailure(403, "forbidden model permission").retryable, false);
  assert.equal(classifyLLMHTTPFailure(400, "invalid messages").retryable, false);
});

let calls = [];
let attempts = [];
const fallbackResult = await runWithProviderFallback(
  ["xai", "openai"],
  async (provider) => {
    calls.push(provider);
    if (provider === "xai") throw new LLMUpstreamError("xai", "spend", true, 403, "spend");
    return "ok";
  },
  undefined,
  async (provider) => { attempts.push(provider); },
);
check("retryable provider failure advances exactly once", () => {
  assert.equal(fallbackResult, "ok");
  assert.deepEqual(calls, ["xai", "openai"]);
  assert.deepEqual(attempts, ["xai", "openai"]);
});

calls = [];
await assert.rejects(
  runWithProviderFallback(["xai", "openai"], async (provider) => {
    calls.push(provider);
    throw new LLMUpstreamError("xai", "bad key", false, 401, "auth");
  }),
  /bad key/,
);
check("non-retryable failure never reaches fallback", () => {
  assert.deepEqual(calls, ["xai"]);
});

calls = [];
attempts = [];
await assert.rejects(
  runWithProviderFallback(
    ["xai", "openai"],
    async (provider) => {
      calls.push(provider);
      throw new LLMUpstreamError(provider, "transient", true, 503, "server");
    },
    undefined,
    async (provider) => {
      attempts.push(provider);
      if (provider === "openai") throw new Error("budget denied");
    },
  ),
  /budget denied/,
);
check("a failed per-attempt budget reservation blocks the fallback vendor request", () => {
  assert.deepEqual(attempts, ["xai", "openai"]);
  assert.deepEqual(calls, ["xai"]);
});

console.log(`\n✓ ALL fallback policy checks — ${checks} passed`);
