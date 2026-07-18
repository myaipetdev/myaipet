#!/usr/bin/env node
/**
 * Live LLM adapter smoke test. The synthetic probes mirror router.ts request
 * shapes for text, structured JSON, native tool calls, and vision. Keys are read only
 * from environment variables and are never printed, persisted, or placed in a
 * URL. Provider error bodies are deliberately not logged.
 *
 * Examples:
 * With the relevant key already present in the process environment:
 *   node scripts/llm-smoke.mjs --provider xai --mode all
 *   node scripts/llm-smoke.mjs --provider openai --mode all
 *   node scripts/llm-smoke.mjs --provider google --mode all
 *   node scripts/llm-smoke.mjs --provider openrouter --model nousresearch/hermes-4-405b --mode all
 */

const PROVIDERS = {
  xai: { baseUrl: "https://api.x.ai/v1", flavor: "openai", env: "GROK_API_KEY", model: "grok-3-mini", tools: true, visionModel: "grok-4-1-fast-non-reasoning" },
  openai: { baseUrl: "https://api.openai.com/v1", flavor: "openai", env: "OPENAI_API_KEY", model: "gpt-5.6-luna", tools: true, visionModel: "gpt-5.6-luna" },
  anthropic: { baseUrl: "https://api.anthropic.com/v1", flavor: "anthropic", env: "ANTHROPIC_API_KEY", model: "claude-sonnet-4-6", tools: true },
  google: { baseUrl: "https://generativelanguage.googleapis.com/v1beta", flavor: "google", env: "GOOGLE_API_KEY", model: "gemini-2.5-flash", tools: false },
  openrouter: { baseUrl: "https://openrouter.ai/api/v1", flavor: "openai", env: "OPENROUTER_API_KEY", model: "openai/gpt-4.1-mini", tools: true },
  nous: { baseUrl: "https://inference-api.nousresearch.com/v1", flavor: "openai", env: "NOUS_API_KEY", model: "Hermes-4-405B", tools: true },
};

function arg(name, fallback) {
  const exact = process.argv.indexOf(`--${name}`);
  const inline = process.argv.find((value) => value.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  return exact >= 0 ? process.argv[exact + 1] : fallback;
}

const providerId = arg("provider", "xai");
const mode = arg("mode", "text");
const provider = PROVIDERS[providerId];
if (!provider) {
  console.error(`unknown provider '${providerId}'. one of: ${Object.keys(PROVIDERS).join(", ")}`);
  process.exit(1);
}
if (!["text", "json", "tools", "vision", "all"].includes(mode)) {
  console.error("--mode must be text, json, tools, vision, or all");
  process.exit(1);
}
const model = arg("model", provider.model);
const key = process.env[provider.env];
if (!key) {
  console.error(`${provider.env} is not set. Supply it through the process environment; it will not be printed.`);
  process.exit(1);
}
if ((mode === "tools" || mode === "all") && !provider.tools && mode === "tools") {
  console.error(`${providerId} tool mode is unsupported by the current PetClaw adapter.`);
  process.exit(1);
}
if (mode === "vision" && !provider.visionModel) {
  console.error(`${providerId} vision mode is unsupported by the current PetClaw smoke adapter.`);
  process.exit(1);
}

const messages = [
  { role: "system", content: "PetClaw synthetic connection check. When JSON is requested, return one JSON object. Follow the response shape exactly." },
  { role: "user", content: "Acknowledge this synthetic connection check." },
];
const toolName = "petclaw_connection_check";
const toolSchema = {
  type: "object",
  properties: { ok: { type: "boolean" } },
  required: ["ok"],
  additionalProperties: false,
};

function openAIGenerationOptions(maxTokens) {
  if (providerId === "openai") {
    return {
      max_completion_tokens: maxTokens,
      ...(model.startsWith("gpt-5.6") ? { reasoning_effort: "none" } : {}),
    };
  }
  return { max_tokens: maxTokens };
}

async function requestJSON(url, init) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(30_000) });
  const body = await res.text();
  if (!res.ok) {
    const requestId = res.headers.get("x-request-id") || res.headers.get("request-id");
    const lower = body.toLowerCase();
    const reason = /spend|billing|insufficient.*(?:credit|quota|fund)|monthly.*limit/.test(lower)
      ? "spend"
      : /incorrect api key|invalid api key|authentication/.test(lower) || res.status === 401
        ? "auth"
        : res.status === 429
          ? "rate_limit"
          : res.status >= 500
            ? "server"
            : "input";
    throw new Error(`HTTP ${res.status} (${reason})${requestId ? ` request=${requestId}` : ""}`);
  }
  try { return JSON.parse(body); }
  catch { throw new Error("provider returned malformed JSON"); }
}

async function openAIRequest(extra) {
  return requestJSON(`${provider.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, messages, ...openAIGenerationOptions(32), temperature: 0, ...extra }),
  });
}

async function anthropicRequest(extra) {
  const system = messages.filter((message) => message.role === "system").map((message) => message.content).join("\n\n");
  const turns = messages.filter((message) => message.role !== "system");
  return requestJSON(`${provider.baseUrl}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model, max_tokens: 32, temperature: 0, system, messages: turns, ...extra }),
  });
}

async function googleRequest(extraGenerationConfig = {}) {
  const systemText = messages.filter((message) => message.role === "system").map((message) => message.content).join("\n\n");
  const contents = messages
    .filter((message) => message.role !== "system")
    .map((message) => ({ role: message.role === "assistant" ? "model" : "user", parts: [{ text: message.content }] }));
  return requestJSON(`${provider.baseUrl}/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemText }] },
      contents,
      generationConfig: { temperature: 0, maxOutputTokens: 32, ...extraGenerationConfig },
    }),
  });
}

async function probeText() {
  let text;
  if (provider.flavor === "anthropic") {
    const raw = await anthropicRequest({});
    text = (raw?.content || []).filter((block) => block?.type === "text").map((block) => block.text).join("");
  } else if (provider.flavor === "google") {
    const raw = await googleRequest();
    text = (raw?.candidates?.[0]?.content?.parts || []).map((part) => part.text).join("");
  } else {
    const raw = await openAIRequest({});
    text = raw?.choices?.[0]?.message?.content;
  }
  if (!String(text || "").trim()) throw new Error("empty text response");
}

async function probeJSON() {
  let value;
  if (provider.flavor === "anthropic") {
    const jsonTool = {
      name: "petclaw_return_json",
      description: "Return the requested answer as one JSON object.",
      input_schema: { type: "object", additionalProperties: true },
    };
    const raw = await anthropicRequest({ tools: [jsonTool], tool_choice: { type: "tool", name: jsonTool.name } });
    value = (raw?.content || []).find((block) => block?.type === "tool_use" && block?.name === jsonTool.name)?.input;
  } else if (provider.flavor === "google") {
    const raw = await googleRequest({ responseMimeType: "application/json" });
    const text = (raw?.candidates?.[0]?.content?.parts || []).map((part) => part.text).join("");
    value = JSON.parse(text);
  } else {
    const raw = await openAIRequest({ response_format: { type: "json_object" } });
    value = JSON.parse(raw?.choices?.[0]?.message?.content || "");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("structured JSON response was not an object");
}

async function probeTools() {
  let calls;
  if (provider.flavor === "anthropic") {
    const raw = await anthropicRequest({
      tools: [{ name: toolName, description: "Acknowledge the synthetic check.", input_schema: toolSchema }],
      tool_choice: { type: "tool", name: toolName },
    });
    calls = (raw?.content || []).filter((block) => block?.type === "tool_use").map((block) => block.name);
  } else {
    const raw = await openAIRequest({
      tools: [{ type: "function", function: { name: toolName, description: "Acknowledge the synthetic check.", parameters: toolSchema } }],
      tool_choice: { type: "function", function: { name: toolName } },
    });
    calls = (raw?.choices?.[0]?.message?.tool_calls || []).map((call) => call?.function?.name);
  }
  if (!calls.includes(toolName)) throw new Error("forced tool call was not returned");
}

async function probeVision() {
  const syntheticPng = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z8i8AAAAASUVORK5CYII=";
  const raw = await requestJSON(`${provider.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: provider.visionModel,
      messages: [{
        role: "user",
        content: [
          { type: "image_url", image_url: { url: syntheticPng } },
          { type: "text", text: "Reply with the single word IMAGE if you can inspect this synthetic PNG." },
        ],
      }],
      ...(providerId === "openai"
        ? { max_completion_tokens: 12, reasoning_effort: "none" }
        : { max_tokens: 12 }),
      temperature: 0,
    }),
  });
  const text = raw?.choices?.[0]?.message?.content;
  if (!String(text || "").trim()) throw new Error("empty vision response");
}

async function runProbe(name, fn) {
  const started = Date.now();
  await fn();
  console.log(`✓ ${providerId}/${model} ${name} shape · ${Date.now() - started}ms`);
}

async function run() {
  const modes = mode === "all"
    ? ["text", "json", ...(provider.tools ? ["tools"] : []), ...(provider.visionModel ? ["vision"] : [])]
    : [mode];
  for (const selected of modes) {
    if (selected === "text") await runProbe("text", probeText);
    if (selected === "json") await runProbe("json", probeJSON);
    if (selected === "tools") await runProbe("tools", probeTools);
    if (selected === "vision") await runProbe("vision", probeVision);
  }
  if (mode === "all" && !provider.tools) console.log(`- ${providerId} tools skipped: unsupported by the current adapter`);
  if (mode === "all" && !provider.visionModel) console.log(`- ${providerId} vision skipped: unsupported by the current smoke adapter`);
}

run().catch((error) => {
  const reason = error?.name === "TimeoutError" ? "timed out" : error?.message || "request failed";
  console.error(`✗ ${providerId}/${model} ${mode} FAILED — ${reason}`);
  process.exit(1);
});
