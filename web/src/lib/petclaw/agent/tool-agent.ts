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

// ── Config ──

const DEFAULT_MAX_STEPS = 6;
const MIN_STEPS = 1;
const HARD_MAX_STEPS = 8;
const WALLCLOCK_MS = 60_000; // hard wall-clock guard for the whole loop
const PER_CALL_TIMEOUT_MS = 20_000; // per skill execution
const SKILL_RETRIES = 2; // => up to 3 attempts total
const RESULT_CLIP = 4000; // chars of skill output fed back to the model

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

export type AgentEvent =
  | { type: "thought"; text: string }
  | { type: "tool_call"; id: string; skill: string; input: Record<string, unknown> }
  | { type: "tool_result"; id: string; skill: string; ok: boolean; output: unknown }
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

  const system = `You are ${name}, a ${personality} AI pet, writing the FINAL answer to your owner's goal. Use the observations you gathered from your tools. Be in-character, warm, and concise (2-4 sentences). Do NOT mention "skills", "tools", "JSON", or that you are an AI.`;
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
    if (out.text) return out.text;
  } catch {
    // fall through to a non-LLM fallback so the gathered work is never lost
  }
  if (terminalContent) return terminalContent;
  const lastOk = [...trace].reverse().find((s) => s.ok);
  if (lastOk) {
    const out = lastOk.output as any;
    if (out?.reply) return String(out.reply);
    return `Here's what I found: ${clip(lastOk.output, 300)}`;
  }
  return "I tried, but I couldn't pull together an answer this time.";
}

// ── The Loop ──

const AGENT_SYSTEM = `You are an AI pet's autonomous agent, working toward your owner's GOAL.

You have TOOLS (your pet skills). To make progress, CALL the tools that help — you may call several. Read each tool's result, then decide whether to call more or to STOP.

Rules:
- Prefer calling a tool over guessing when a tool can get you real information.
- Do NOT repeat the same tool with the same arguments.
- Most goals need 1-3 tool calls. When you have enough to answer, reply with a short plain-text answer and NO tool calls — that ends the loop.
- Only call the tools you were given. Never invent tool names or arguments.`;

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
  const tools = buildTools();

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
      terminalContent = res.content;
      if (res.content) onEvent({ type: "thought", text: res.content });
      break;
    }

    // The model requested tool calls — record the assistant turn, then execute.
    appendAssistantToolCalls(messages, res);
    if (res.content) onEvent({ type: "thought", text: res.content });

    const results: Array<{ tool_call_id: string; name: string; content: string }> = [];
    for (const call of res.toolCalls) {
      onEvent({ type: "tool_call", id: call.id, skill: call.name, input: call.arguments });
      const exec = await executeWithRetry(petId, call.name, call.arguments, deadline);
      trace.push({
        thought: res.content ?? undefined,
        skill: call.name,
        input: call.arguments,
        output: exec.output,
        ok: exec.ok,
      });
      onEvent({ type: "tool_result", id: call.id, skill: call.name, ok: exec.ok, output: exec.output });
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
