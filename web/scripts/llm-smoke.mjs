#!/usr/bin/env node
/**
 * LLM provider adapter smoke test — verifies each provider adapter in
 * web/src/lib/llm/router.ts actually returns text, end-to-end, with a real key.
 *
 * The request shapes here MIRROR router.ts exactly (openai / anthropic / google
 * flavors). Run per provider with that provider's key in env:
 *
 *   xai:        GROK_API_KEY=...       node scripts/llm-smoke.mjs --provider xai
 *   openai:     OPENAI_API_KEY=...     node scripts/llm-smoke.mjs --provider openai
 *   anthropic:  ANTHROPIC_API_KEY=...  node scripts/llm-smoke.mjs --provider anthropic
 *   google:     GOOGLE_API_KEY=...     node scripts/llm-smoke.mjs --provider google
 *   openrouter: OPENROUTER_API_KEY=... node scripts/llm-smoke.mjs --provider openrouter
 *
 * xai/openai/openrouter share the OpenAI flavor, so verifying ONE of them
 * (e.g. xai with the platform Grok key) verifies that adapter shape for all three.
 */

const PROVIDERS = {
  xai: { baseUrl: "https://api.x.ai/v1", flavor: "openai", env: "GROK_API_KEY", model: "grok-3-mini" },
  openai: { baseUrl: "https://api.openai.com/v1", flavor: "openai", env: "OPENAI_API_KEY", model: "gpt-4.1-mini" },
  anthropic: { baseUrl: "https://api.anthropic.com/v1", flavor: "anthropic", env: "ANTHROPIC_API_KEY", model: "claude-sonnet-4-6" },
  google: { baseUrl: "https://generativelanguage.googleapis.com/v1beta", flavor: "google", env: "GOOGLE_API_KEY", model: "gemini-2.5-flash" },
  openrouter: { baseUrl: "https://openrouter.ai/api/v1", flavor: "openai", env: "OPENROUTER_API_KEY", model: "openai/gpt-4.1-mini" },
};

const pid = (process.argv.find((a) => a.startsWith("--provider=")) || "").split("=")[1]
  || (process.argv.includes("--provider") ? process.argv[process.argv.indexOf("--provider") + 1] : "xai");
const p = PROVIDERS[pid];
if (!p) { console.error(`unknown provider '${pid}'. one of: ${Object.keys(PROVIDERS).join(", ")}`); process.exit(1); }
const key = process.env[p.env];
if (!key) { console.error(`${p.env} not set — provide ${pid}'s key to test it.`); process.exit(1); }

const messages = [
  { role: "system", content: "You are a terse test bot. Reply with EXACTLY: PONG" },
  { role: "user", content: "ping" },
];

async function run() {
  const t0 = Date.now();
  let text, model;
  if (p.flavor === "anthropic") {
    const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
    const turns = messages.filter((m) => m.role !== "system").map((m) => ({ role: m.role, content: m.content }));
    const res = await fetch(`${p.baseUrl}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: p.model, max_tokens: 20, temperature: 0, system, messages: turns }),
    });
    if (!res.ok) throw new Error(`${res.status}: ${(await res.text()).slice(0, 300)}`);
    const raw = await res.json();
    text = (raw?.content?.[0]?.text || "").trim(); model = raw?.model;
  } else if (p.flavor === "google") {
    const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
    const contents = messages.filter((m) => m.role !== "system").map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
    const res = await fetch(`${p.baseUrl}/models/${p.model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents, generationConfig: { temperature: 0, maxOutputTokens: 20 } }),
    });
    if (!res.ok) throw new Error(`${res.status}: ${(await res.text()).slice(0, 300)}`);
    const raw = await res.json();
    text = (raw?.candidates?.[0]?.content?.parts?.map((x) => x.text).join("") || "").trim(); model = p.model;
  } else {
    const res = await fetch(`${p.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: p.model, messages, max_tokens: 20, temperature: 0 }),
    });
    if (!res.ok) throw new Error(`${res.status}: ${(await res.text()).slice(0, 300)}`);
    const raw = await res.json();
    text = (raw?.choices?.[0]?.message?.content || "").trim(); model = raw?.model;
  }
  console.log(`✓ ${pid} (${p.flavor} flavor) OK — model=${model} · ${Date.now() - t0}ms · reply="${text}"`);
}

run().catch((e) => { console.error(`✗ ${pid} FAILED — ${e.message}`); process.exit(1); });
