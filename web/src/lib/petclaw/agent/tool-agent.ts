/**
 * Native Function-Calling Agent Loop (Hermes / oh-my-opencode / Claude-Code grade)
 *
 * Where plan-execute.ts asks a reasoning model to emit JSON-in-prose "plans",
 * THIS loop uses the model's NATIVE tool-calling: the pet's runnable skills are
 * handed to the model as function tools, the model DECIDES which to call (and may
 * call several in parallel), we EXECUTE each via the real executeSkill (pethub.ts)
 * with RETRY + per-call timeout, feed structured results back, and iterate until
 * the model answers with no further tool calls. A chat model then SYNTHESIZES the
 * final answer IN THE PET'S VOICE. Every step can STREAM via onEvent.
 *
 * plan-execute.ts is intentionally kept intact as a fallback — this is additive.
 *
 * Grounding (verified against the codebase):
 *   - Transport: callLLMWithTools/callLLM in @/lib/llm/router (native tools;
 *     owner-BYOK routing or platform Grok default; Grok supports tools).
 *   - Skills + executor: web/src/lib/petclaw/pethub.ts (BUILTIN_SKILLS,
 *     executeSkill(petId, skillId, input), getSkill()).
 *   - Only llm-prompt skills run IN-PROCESS and return real chainable text, so
 *     only those are exposed as EXECUTABLE tools (api-call skills would just hand
 *     back an "invoke-via-endpoint" pointer — nothing to reason over).
 */

import { prisma } from "@/lib/prisma";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import {
  BUILTIN_SKILLS,
  executeSkill,
  getSkill,
  type PetSkillManifest,
} from "../pethub";
import {
  callLLM,
  callLLMWithTools,
  appendAssistantToolCalls,
  appendToolResults,
  type ToolDef,
  type ToolMessage,
} from "@/lib/llm/router";
import type { ConnectorResult } from "../connectors";
import { WebSearchConnector } from "../connectors/web-search";
import { WikipediaConnector } from "../connectors/wikipedia";
import { CoinGeckoConnector } from "../connectors/coingecko";
import { MemoryConnector } from "../connectors/memory-enhanced";
import {
  generatedEnglishOrFallback,
  generatedEnglishOrNull,
} from "@/lib/generatedLanguage";

// ── Config ──

const DEFAULT_MAX_STEPS = 6;
const MIN_STEPS = 1;
const HARD_MAX_STEPS = 8;
const WALLCLOCK_MS = 60_000; // hard wall-clock guard for the whole loop
const PER_CALL_TIMEOUT_MS = 20_000; // per skill execution
const SKILL_RETRIES = 2; // => up to 3 attempts total
const RESULT_CLIP = 4000; // chars of skill output fed back to the model
const CONNECTOR_TIMEOUT_MS = 10_000; // per connector (external API) call — single attempt, no retry
const AGENT_REPLY_FALLBACK = "I tried, but I couldn't pull together an English answer this time.";

// Only these handlers run in-process (real, chainable output). Mirrors the
// allowlist in plan-execute.ts — fail closed so a new endpoint handler is never
// exposed as an executable tool by default.
const IN_PROCESS_HANDLERS = new Set(["llm-prompt"]);

// ── Types ──

export interface AgentStep {
  thought?: string; // the model's accompanying text for this call, if any
  skill: string; // skill id invoked
  input: Record<string, unknown>; // arguments the model supplied
  output: unknown; // executeSkill output (or a structured error)
  ok: boolean; // whether the skill call succeeded
}

export type ToolKind = "skill" | "connector";

export type AgentEvent =
  | { type: "thought"; text: string }
  | { type: "tool_call"; id: string; skill: string; input: Record<string, unknown>; kind: ToolKind }
  | { type: "tool_result"; id: string; skill: string; ok: boolean; output: unknown; kind: ToolKind }
  | { type: "error"; skill?: string; message: string }
  | { type: "final"; answer: string };

export interface RunToolAgentResult {
  answer: string;
  trace: AgentStep[];
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    reasoningCalls: number;
    steps: number;
  };
}

export interface RunToolAgentOpts {
  maxSteps?: number;
  onEvent?: (e: AgentEvent) => void;
}

// ── Tool catalog: the pet's runnable (in-process) skills as function tools ──

function isRunnable(skill: PetSkillManifest): boolean {
  return IN_PROCESS_HANDLERS.has(skill.handler ?? "");
}

/** Coerce a skill manifest inputSchema into a valid JSON-Schema `parameters`. */
function toParameters(inputSchema: Record<string, unknown>): Record<string, unknown> {
  const s = inputSchema && typeof inputSchema === "object" ? (inputSchema as any) : {};
  return {
    type: "object",
    properties: s.properties && typeof s.properties === "object" ? s.properties : {},
    ...(Array.isArray(s.required) && s.required.length ? { required: s.required } : {}),
  };
}

function buildTools(): ToolDef[] {
  return BUILTIN_SKILLS.filter(isRunnable).map((s) => ({
    name: s.id,
    description: s.description,
    parameters: toParameters(s.inputSchema),
  }));
}

// ── Connector tools: REAL, keyless, READ-ONLY external look-ups ──
//
// These are NOT pet skills — they are genuine read-only calls to public,
// no-key APIs (DuckDuckGo Instant Answer, Wikipedia REST, CoinGecko free v3)
// plus the pet's own persistent memory. Every tool below is backed by a real
// working fetch/DB call — no stubs, no fabricated results. They are exposed to
// the model ALONGSIDE the skill tools so the pet can actually look things up
// in-loop, then feed real observations back to the synthesizer.

type StringRecord = Record<string, unknown>;

interface ConnectorTool {
  def: ToolDef;
  run: (petId: number, args: StringRecord) => Promise<ConnectorResult>;
}

function asStr(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

// ── SSRF guard for web_read (model supplies the URL) ─────────────────────────
// web_read fetches an arbitrary model-chosen URL server-side, so a prompt
// injection could aim it at internal services / cloud metadata. Block non-
// http(s) schemes, localhost, and any host that is (or resolves to) a private /
// reserved / link-local IP. Residual: a redirect from a public host to a private
// one isn't re-checked here (the connector's fetch follows redirects), so this
// closes the direct-address vector, not redirect-based SSRF.
function ipv4IsPrivate(ip: string): boolean {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b, c] = p;
  if (a === 0 || a === 10 || a === 127) return true;        // this-net / private / loopback
  if (a === 169 && b === 254) return true;                  // link-local (+ 169.254.169.254 metadata)
  if (a === 172 && b >= 16 && b <= 31) return true;         // private
  if (a === 192 && b === 168) return true;                  // private
  if (a === 192 && b === 0 && c === 0) return true;         // IETF protocol assignments
  if (a === 100 && b >= 64 && b <= 127) return true;        // CGNAT
  if (a === 198 && (b === 18 || b === 19)) return true;     // benchmarking
  if (a >= 224) return true;                                // multicast + reserved
  return false;
}
function ipIsPrivate(ip: string): boolean {
  const fam = isIP(ip);
  if (fam === 4) return ipv4IsPrivate(ip);
  if (fam === 6) {
    const s = ip.toLowerCase();
    if (s === "::1" || s === "::") return true;
    if (/^fe[89ab]/.test(s)) return true;                   // fe80::/10 link-local
    if (/^f[cd]/.test(s)) return true;                      // fc00::/7 ULA
    const m = s.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);       // IPv4-mapped
    if (m) return ipv4IsPrivate(m[1]);
    return false;
  }
  return true; // not a valid IP post-resolution → block
}
async function assertPublicHttpUrl(raw: string): Promise<void> {
  let u: URL;
  try { u = new URL(raw); } catch { throw new Error("invalid URL"); }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("only http(s) URLs are allowed");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  const lower = host.toLowerCase();
  if (!host) throw new Error("no host");
  if (lower === "localhost" || lower.endsWith(".localhost") || lower === "metadata.google.internal") {
    throw new Error("blocked host");
  }
  if (isIP(host)) {
    if (ipIsPrivate(host)) throw new Error("blocked private/reserved address");
    return;
  }
  const addrs = await lookup(host, { all: true }).catch(() => null);
  if (!addrs || !addrs.length) throw new Error("dns resolution failed");
  for (const a of addrs) if (ipIsPrivate(a.address)) throw new Error("blocked private/reserved address");
}

const CONNECTOR_TOOLS: ConnectorTool[] = [
  {
    def: {
      name: "web_search",
      description:
        "Best-effort keyless web look-up via DuckDuckGo's Instant Answer API. Returns an abstract + related topics when one exists; can be empty for long-tail queries (it is an instant-answer box, not a full search index). Read-only.",
      parameters: {
        type: "object",
        properties: { query: { type: "string", description: "What to look up" } },
        required: ["query"],
      },
    },
    run: (_petId, args) => new WebSearchConnector().search(asStr(args.query), 5),
  },
  {
    def: {
      name: "web_read",
      description:
        "Fetch ONE public http(s) URL and return its stripped page text (first ~2000 chars). Read-only. Use to read a page you already have a URL for.",
      parameters: {
        type: "object",
        properties: { url: { type: "string", description: "The http(s) URL to read" } },
        required: ["url"],
      },
    },
    run: async (_petId, args) => {
      const url = asStr(args.url);
      await assertPublicHttpUrl(url); // SSRF guard — block internal/metadata targets
      return new WebSearchConnector().summarize(url);
    },
  },
  {
    def: {
      name: "wikipedia_lookup",
      description:
        "Look up a topic on Wikipedia (keyless). Finds the best-matching article and returns a short factual summary. Read-only.",
      parameters: {
        type: "object",
        properties: { topic: { type: "string", description: "Topic or article title to look up" } },
        required: ["topic"],
      },
    },
    run: async (_petId, args) => {
      const topic = asStr(args.topic);
      const wiki = new WikipediaConnector();
      const found = await wiki.search(topic, 3);
      const hits = Array.isArray(found.data) ? (found.data as any[]) : [];
      const title = hits[0]?.title || topic;
      const summary = await wiki.getSummary(title);
      if (summary.success) {
        return {
          success: true,
          platform: "wikipedia",
          data: {
            title,
            ...(summary.data as object),
            alternatives: hits.slice(1, 3).map((h) => h?.title).filter(Boolean),
          },
        };
      }
      // Summary endpoint failed — fall back to the raw search hits (still real).
      return found;
    },
  },
  {
    def: {
      name: "crypto_price",
      description:
        "Get the current USD price + 24h change + market cap for a cryptocurrency by name or symbol (e.g. 'bitcoin', 'eth', 'solana'). Keyless CoinGecko. Read-only.",
      parameters: {
        type: "object",
        properties: { coin: { type: "string", description: "Coin name or ticker symbol" } },
        required: ["coin"],
      },
    },
    run: async (_petId, args) => {
      const coin = asStr(args.coin);
      const cg = new CoinGeckoConnector();
      // Resolve a free-text coin to a canonical CoinGecko id first (handles
      // symbols like 'btc' that /simple/price won't accept directly).
      const found = await cg.search(coin);
      const coins = Array.isArray(found.data) ? (found.data as any[]) : [];
      const id = coins[0]?.id || coin.toLowerCase();
      const price = await cg.getPrice([id]);
      if (price.success) {
        const priceData = (price.data as any)?.[id] ?? null;
        return {
          success: true,
          platform: "coingecko",
          data: { id, name: coins[0]?.name || id, symbol: coins[0]?.symbol ?? null, usd: priceData },
        };
      }
      return price;
    },
  },
  {
    def: {
      name: "recall_memory",
      description:
        "Search THIS pet's own persistent memory of past conversations with its owner for anything relevant. Read-only.",
      parameters: {
        type: "object",
        properties: { query: { type: "string", description: "What to recall from memory" } },
        required: ["query"],
      },
    },
    run: (petId, args) => new MemoryConnector(petId).search(asStr(args.query), 8),
  },
];

const CONNECTOR_TOOL_MAP = new Map(CONNECTOR_TOOLS.map((t) => [t.def.name, t]));

/**
 * Execute a connector tool with a per-call timeout. SINGLE attempt (no retry —
 * these hit rate-limited public APIs, and retrying would only make throttling
 * worse). Never throws — returns a structured {ok, output} so the loop can feed
 * a recoverable error back to the model.
 */
async function executeConnector(
  petId: number,
  name: string,
  args: StringRecord,
  deadline: number,
): Promise<{ ok: boolean; output: unknown }> {
  const tool = CONNECTOR_TOOL_MAP.get(name);
  if (!tool) {
    return { ok: false, output: { error: `Unknown connector '${name}'. Choose an offered tool.` } };
  }
  if (Date.now() > deadline) {
    return { ok: false, output: { error: "time budget exhausted before execution" } };
  }
  try {
    const result = await withTimeout(tool.run(petId, args), CONNECTOR_TIMEOUT_MS);
    if (result.success) return { ok: true, output: result.data };
    return { ok: false, output: { error: result.error || "connector call failed", platform: result.platform } };
  } catch (e: any) {
    return { ok: false, output: { error: e?.message || "connector call threw" } };
  }
}

// ── Helpers ──

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function clip(value: unknown, max: number): string {
  const str = typeof value === "string" ? value : JSON.stringify(value);
  return (str ?? "").slice(0, max);
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`skill timeout after ${ms}ms`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

/**
 * Execute a skill with RETRY (exponential backoff ~250ms→1s) + per-call timeout.
 * Never throws — returns a structured {ok, output} so the loop can feed a
 * recoverable error back to the model.
 */
async function executeWithRetry(
  petId: number,
  skillId: string,
  input: Record<string, unknown>,
  deadline: number,
): Promise<{ ok: boolean; output: unknown }> {
  const manifest = getSkill(skillId);
  if (!manifest) {
    return { ok: false, output: { error: `Unknown skill '${skillId}'. Choose an offered tool.` } };
  }
  const attempts = SKILL_RETRIES + 1;
  let lastOutput: unknown = { error: "skill not executed" };
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (Date.now() > deadline) return { ok: false, output: { error: "time budget exhausted before execution" } };
    try {
      const result = await withTimeout(executeSkill(petId, skillId, input), PER_CALL_TIMEOUT_MS);
      if (result.success) return { ok: true, output: result.output };
      lastOutput = result.output; // executeSkill swallows errors into {success:false, output:{error}}
    } catch (e: any) {
      lastOutput = { error: e?.message || "skill execution threw" };
    }
    if (attempt < attempts - 1) await sleep(Math.min(1000, 250 * 2 ** attempt));
  }
  return { ok: false, output: lastOutput };
}

// ── Synthesizer: final answer in the pet's voice (reuses the chat task) ──

async function synthesize(
  petId: number,
  goal: string,
  trace: AgentStep[],
  terminalContent: string | null,
): Promise<string> {
  const pet = await prisma.pet
    .findUnique({ where: { id: petId }, select: { name: true, personality_type: true } })
    .catch(() => null);
  const name = pet?.name ?? "your pet";
  const personality = pet?.personality_type ?? "friendly";

  const observations = trace.length
    ? trace
        .map((s, i) => `${i + 1}. ${s.skill}: ${s.ok ? clip(s.output, 500) : `(failed: ${clip(s.output, 150)})`}`)
        .join("\n")
    : terminalContent
      ? `Reasoning: ${terminalContent}`
      : "(no tool results)";

  const system = `You are ${name}, a ${personality} AI pet, writing the FINAL answer to your owner's goal. Always answer in English and never output Hangul, even if the goal or observations use another language. Use the observations you gathered from your tools. Be in-character, warm, and concise (2-4 sentences). Do NOT mention "skills", "tools", "JSON", or that you are an AI.`;
  const user = `GOAL: ${goal}

WHAT YOU GATHERED:
${observations}
${terminalContent ? `\nYOUR DRAFT THOUGHT: ${terminalContent}` : ""}

Write the final answer:`;

  try {
    const out = await callLLM({
      task: "chat",
      petId,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      max_tokens: 220,
      temperature: 0.8,
    });
    const safe = generatedEnglishOrNull(out.text);
    if (safe) return safe;
  } catch {
    // fall through to a non-LLM fallback so the gathered work is never lost
  }
  const safeTerminal = generatedEnglishOrNull(terminalContent);
  if (safeTerminal) return safeTerminal;
  const lastOk = [...trace].reverse().find((s) => s.ok);
  if (lastOk) {
    const out = lastOk.output as any;
    if (out?.reply) return generatedEnglishOrFallback(out.reply, AGENT_REPLY_FALLBACK);
    return generatedEnglishOrFallback(`Here's what I found: ${clip(lastOk.output, 300)}`, AGENT_REPLY_FALLBACK);
  }
  return AGENT_REPLY_FALLBACK;
}

// ── The Loop ──

const AGENT_SYSTEM = `You are an AI pet's autonomous agent, working toward your owner's GOAL.

You have TOOLS (your pet skills). To make progress, CALL the tools that help — you may call several. Read each tool's result, then decide whether to call more or to STOP.

Rules:
- Write all assistant text in English and never output Hangul, even if the goal uses another language.
- Prefer calling a tool over guessing when a tool can get you real information.
- Do NOT repeat the same tool with the same arguments.
- Most goals need 1-3 tool calls. When you have enough to answer, reply with a short plain-text answer and NO tool calls — that ends the loop.
- Only call the tools you were given. Never invent tool names or arguments.
- Some tools are LOOK-UP tools (web_search, web_read, wikipedia_lookup, crypto_price, recall_memory) that fetch REAL external or remembered facts — prefer them over guessing whenever the goal needs a fact you don't already know. If a look-up comes back empty or errors, try a different tool or answer with what you have.`;

/**
 * Run the native tool-calling agent loop. Returns the final in-character answer,
 * the executed-step trace, and aggregated usage. Emits streaming events via
 * opts.onEvent (tool_call / tool_result / thought / error / final).
 */
export async function runToolAgent(
  petId: number,
  goal: string,
  opts?: RunToolAgentOpts,
): Promise<RunToolAgentResult> {
  const maxSteps = Math.max(MIN_STEPS, Math.min(HARD_MAX_STEPS, Math.floor(opts?.maxSteps ?? DEFAULT_MAX_STEPS)));
  const onEvent = opts?.onEvent ?? (() => {});
  const deadline = Date.now() + WALLCLOCK_MS;
  // Skill tools + real keyless read-only connector tools (additive). Connector
  // names are checked first at execution time, so they always win a collision.
  const tools = [...buildTools(), ...CONNECTOR_TOOLS.map((t) => t.def)];

  const messages: ToolMessage[] = [
    { role: "system", content: AGENT_SYSTEM },
    { role: "user", content: goal },
  ];
  const trace: AgentStep[] = [];
  const usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0, reasoningCalls: 0, steps: 0 };
  let terminalContent: string | null = null;

  const addUsage = (u: any) => {
    usage.reasoningCalls += 1;
    if (!u) return;
    const pt = u.prompt_tokens ?? u.input_tokens ?? 0;
    const ct = u.completion_tokens ?? u.output_tokens ?? 0;
    usage.promptTokens += pt;
    usage.completionTokens += ct;
    usage.totalTokens += u.total_tokens ?? pt + ct;
  };

  for (let step = 0; step < maxSteps; step++) {
    if (Date.now() > deadline) break;

    let res;
    try {
      res = await callLLMWithTools({
        task: "reason",
        messages,
        tools,
        toolChoice: "auto",
        petId,
        temperature: 0.3,
        maxTokens: 700,
      });
    } catch (e: any) {
      onEvent({ type: "error", message: e?.message || "reasoning call failed" });
      break;
    }
    addUsage(res.usage);

    // No tool calls → the model's content IS the terminal reasoning answer.
    if (!res.toolCalls || res.toolCalls.length === 0) {
      terminalContent = generatedEnglishOrNull(res.content);
      if (terminalContent) onEvent({ type: "thought", text: terminalContent });
      break;
    }

    // The model requested tool calls — record the assistant turn, then execute.
    appendAssistantToolCalls(messages, res);
    const safeThought = generatedEnglishOrNull(res.content);
    if (safeThought) onEvent({ type: "thought", text: safeThought });

    const results: Array<{ tool_call_id: string; name: string; content: string }> = [];
    for (const call of res.toolCalls) {
      const isConnector = CONNECTOR_TOOL_MAP.has(call.name);
      const kind: ToolKind = isConnector ? "connector" : "skill";
      onEvent({ type: "tool_call", id: call.id, skill: call.name, input: call.arguments, kind });
      const exec = isConnector
        ? await executeConnector(petId, call.name, call.arguments, deadline)
        : await executeWithRetry(petId, call.name, call.arguments, deadline);
      trace.push({
        thought: safeThought ?? undefined,
        skill: call.name,
        input: call.arguments,
        output: exec.output,
        ok: exec.ok,
      });
      onEvent({ type: "tool_result", id: call.id, skill: call.name, ok: exec.ok, output: exec.output, kind });
      if (!exec.ok) {
        onEvent({ type: "error", skill: call.name, message: clip((exec.output as any)?.error ?? exec.output, 200) });
      }
      results.push({ tool_call_id: call.id, name: call.name, content: clip(exec.output, RESULT_CLIP) });
    }
    appendToolResults(messages, results);
  }

  usage.steps = trace.length;
  const answer = await synthesize(petId, goal, trace, terminalContent);
  onEvent({ type: "final", answer });
  return { answer, trace, usage };
}

/** Exposed for the route + tests: which skills are offered as executable tools. */
export function runnableToolIds(): string[] {
  return BUILTIN_SKILLS.filter(isRunnable).map((s) => s.id);
}

/** Exposed for the route + tests: the real keyless read-only connector tools. */
export function connectorToolIds(): string[] {
  return CONNECTOR_TOOLS.map((t) => t.def.name);
}
