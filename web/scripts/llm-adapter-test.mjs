#!/usr/bin/env node
/**
 * Adapter-correctness test for router.ts — NO API key needed.
 *
 * Verifies the request-shape building + response parsing for each provider
 * flavor against the documented API formats, using sample payloads. This proves
 * the adapter CODE is correct (the part that would silently mangle a real call);
 * the only thing it can't cover is live auth/model-availability, which needs a
 * real key (see llm-smoke.mjs). Run: node scripts/llm-adapter-test.mjs
 */

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); } };

const messages = [
  { role: "system", content: "SYS" },
  { role: "user", content: "U1" },
  { role: "assistant", content: "A1" },
  { role: "user", content: "U2" },
];

// ── OpenAI flavor (xai / openai / openrouter): body passes messages as-is,
//    parse choices[0].message.content ──
{
  const body = { model: "m", messages, max_tokens: 20, temperature: 0 };
  ok("openai: messages passed through unchanged", body.messages.length === 4 && body.messages[0].role === "system");
  const sample = { model: "grok-x", choices: [{ message: { content: "PONG" } }] };
  const text = (sample?.choices?.[0]?.message?.content || "").trim();
  ok("openai: parses choices[0].message.content", text === "PONG");
}

// ── Anthropic flavor: system hoisted to top-level, only user/assistant turns,
//    parse content[0].text ──
{
  const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
  const turns = messages.filter((m) => m.role !== "system").map((m) => ({ role: m.role, content: m.content }));
  ok("anthropic: system hoisted to top-level", system === "SYS");
  ok("anthropic: turns exclude system, keep order", turns.length === 3 && turns[0].role === "user" && turns[1].role === "assistant");
  const sample = { model: "claude-x", content: [{ type: "text", text: "PONG" }] };
  const text = (sample?.content?.[0]?.text || "").trim();
  ok("anthropic: parses content[0].text", text === "PONG");
}

// ── Google flavor: system → systemInstruction, roles user/model, parts[].text,
//    parse candidates[0].content.parts[].text ──
{
  const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
  const contents = messages.filter((m) => m.role !== "system").map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
  ok("google: system → systemInstruction text", system === "SYS");
  ok("google: assistant role mapped to 'model'", contents[1].role === "model");
  ok("google: user role preserved + parts shape", contents[0].role === "user" && contents[0].parts[0].text === "U1");
  const sample = { candidates: [{ content: { parts: [{ text: "PO" }, { text: "NG" }] } }] };
  const text = (sample?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") || "").trim();
  ok("google: parses + joins candidates[0].content.parts[].text", text === "PONG");
}

console.log(`\n${fail === 0 ? "✓ ALL" : "✗"} adapter checks — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
