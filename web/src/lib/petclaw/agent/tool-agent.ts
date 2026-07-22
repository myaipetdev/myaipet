/**
 * Native function-calling agent loop.
 *
 * The pet's runnable skills are handed to the configured reasoning model as
 * function tools. The model can request more than one tool in a response; those
 * calls are executed sequentially, with structured observations fed into the
 * next reasoning round. A separate chat call then writes the final answer in the
 * pet's voice. Events can be streamed via onEvent.
 *
 * Grounding (verified against the codebase):
 *   - Transport: callLLMWithTools/callLLM in @/lib/llm/router (the active
 *     provider route is configuration-dependent).
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
  getExecutableSkillsForPet,
  getSkill,
  isSkillPolicyError,
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
import { MemoryConnector } from "../connectors/memory-enhanced";
import {
  generatedEnglishOrFallback,
  generatedEnglishOrNull,
} from "@/lib/generatedLanguage";
import { isProviderSafeRetainedText } from "../memory/persistent-memory";
import {
  awaitAgentWork,
  createAgentDeadlineScope,
  isAgentAbort,
  throwIfAgentAborted,
} from "./deadline";

// ── Config ──

const DEFAULT_MAX_STEPS = 6;
const MIN_STEPS = 1;
const HARD_MAX_STEPS = 8;
const WALLCLOCK_MS = 60_000; // hard wall-clock guard, including final synthesis
const RESULT_CLIP = 4000; // chars of skill output fed back to the model
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
  sideEffectCommitted: boolean; // confirmed durable mutation, never inferred from an attempt
  /** Exact vendor attempts made inside this skill; connectors report 0. */
  modelCalls: number;
}

export type ToolKind = "skill" | "connector";

export type AgentStoppedReason =
  | "completed"
  | "max_steps"
  | "timeout"
  | "planner_error";

export type AgentEvent =
  | { type: "thought"; text: string }
  | { type: "tool_call"; id: string; skill: string; input: Record<string, unknown>; kind: ToolKind }
  | { type: "tool_result"; id: string; skill: string; ok: boolean; output: unknown; sideEffectCommitted: boolean; kind: ToolKind }
  | { type: "error"; skill?: string; message: string }
  | { type: "final"; answer: string; completed: boolean; stoppedReason: AgentStoppedReason };

export interface RunToolAgentResult {
  answer: string;
  trace: AgentStep[];
  completed: boolean;
  stoppedReason: AgentStoppedReason;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    reasoningCalls: number;
    /** Exact vendor network attempts, including fallback + LLM-skill fan-out. */
    modelCalls: number;
    /** Planner/final-synthesis vendor attempts. */
    orchestratorModelCalls: number;
    /** Vendor attempts made inside executed LLM skills. */
    skillModelCalls: number;
    steps: number;
  };
}

export interface RunToolAgentOpts {
  maxSteps?: number;
  onEvent?: (e: AgentEvent) => void;
  /** Optional parent cancellation (for example an HTTP request disconnect). */
  signal?: AbortSignal;
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

async function buildTools(petId: number): Promise<ToolDef[]> {
  const eligible = await getExecutableSkillsForPet(petId);
  return eligible.filter(isRunnable).map((s) => ({
    name: s.id,
    description: s.description,
    parameters: toParameters(s.inputSchema),
  }));
}

// ── Connector tools: owner-private, READ-ONLY recall ──
//
// These are NOT pet skills. Only owner-private recall is exposed here. External
// search/connectors MUST NOT be combined with private memory until the agent has
// an explicit owner approval + data-taint policy; otherwise a planner could put
// recalled private text into an outbound query. Public look-ups remain available
// on their dedicated, non-memory surfaces.

type StringRecord = Record<string, unknown>;

interface ConnectorTool {
  def: ToolDef;
  run: (petId: number, args: StringRecord) => Promise<ConnectorResult>;
}

function asStr(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

const CONNECTOR_TOOLS: ConnectorTool[] = [
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
 * Execute a connector tool once. Ordinary failures become structured output;
 * the shared agent cancellation remains terminal and is rethrown.
 */
async function executeConnector(
  petId: number,
  name: string,
  args: StringRecord,
  signal: AbortSignal,
): Promise<{ ok: boolean; output: unknown }> {
  const tool = CONNECTOR_TOOL_MAP.get(name);
  if (!tool) {
    return { ok: false, output: { error: `Unknown connector '${name}'. Choose an offered tool.` } };
  }
  throwIfAgentAborted(signal);
  try {
    // This connector is a local Prisma read. Prisma does not accept an
    // AbortSignal, so await it to terminal state and fence the result afterward
    // instead of racing it and leaking a dangling query.
    const result = await tool.run(petId, args);
    throwIfAgentAborted(signal);
    if (result.success) return { ok: true, output: result.data };
    return { ok: false, output: { error: result.error || "connector call failed", platform: result.platform } };
  } catch (e: any) {
    if (isAgentAbort(e, signal)) throw e;
    return { ok: false, output: { error: e?.message || "connector call threw" } };
  }
}

// ── Helpers ──

function clip(value: unknown, max: number): string {
  const str = typeof value === "string" ? value : JSON.stringify(value);
  return (str ?? "").slice(0, max);
}

/**
 * Execute one skill exactly once and await its terminal result.
 *
 * The shared AbortSignal reaches every nested provider call. Local Prisma work
 * remains single-attempt and awaited, so settlement cannot overtake a late
 * write or observe a half-finished skill.
 */
async function executeSkillOnce(
  petId: number,
  skillId: string,
  input: Record<string, unknown>,
  signal: AbortSignal,
): Promise<{ ok: boolean; output: unknown; sideEffectCommitted: boolean; modelCalls: number }> {
  const manifest = getSkill(skillId);
  if (!manifest) {
    return { ok: false, output: { error: `Unknown skill '${skillId}'. Choose an offered tool.` }, sideEffectCommitted: false, modelCalls: 0 };
  }
  throwIfAgentAborted(signal);
  try {
    const result = await executeSkill(petId, skillId, input, {
      countProviderAttempts: true,
      readOnly: true,
      noRetention: true,
      signal,
    });
    return {
      ok: result.success,
      output: result.output,
      sideEffectCommitted: result.sideEffectCommitted === true,
      modelCalls: result.modelCalls ?? 0,
    };
  } catch (e: any) {
    if (isAgentAbort(e, signal)) throw e;
    if (isSkillPolicyError(e)) {
      return { ok: false, output: { error: e.message, code: e.code }, sideEffectCommitted: false, modelCalls: 0 };
    }
    return { ok: false, output: { error: e?.message || "skill execution threw" }, sideEffectCommitted: false, modelCalls: 0 };
  }
}

// ── Synthesizer: final answer in the pet's voice (reuses the chat task) ──

async function synthesize(
  petId: number,
  goal: string,
  trace: AgentStep[],
  terminalContent: string | null,
  signal: AbortSignal,
  onProviderAttempt: () => void,
): Promise<{ answer: string; timedOut: boolean; modelCalled: boolean; usage?: unknown }> {
  let timedOut = signal.aborted;
  // A valid no-tool terminal answer is already the planner's final answer. Do
  // not fan the owner's goal out to a second provider call just to rephrase it.
  if (trace.length === 0) {
    const directAnswer = generatedEnglishOrNull(terminalContent);
    if (directAnswer) return { answer: directAnswer, timedOut, modelCalled: false };
  }
  let pet: { name: string | null; personality_type: string | null } | null = null;
  if (!timedOut) {
    try {
      // Prisma work is not abortable. Await it, then fence synthesis before any
      // provider request rather than abandoning a query behind a timeout race.
      pet = await prisma.pet.findUnique({
        where: { id: petId },
        select: { name: true, personality_type: true },
      });
      throwIfAgentAborted(signal);
    } catch (error) {
      timedOut = isAgentAbort(error, signal);
    }
  }
  const name = pet?.name && isProviderSafeRetainedText(`pet_name ${pet.name}`)
    ? pet.name
    : "your pet";
  const personality = pet?.personality_type
    && isProviderSafeRetainedText(`pet_personality ${pet.personality_type}`)
    ? pet.personality_type
    : "friendly";

  const safeGoal = isProviderSafeRetainedText(`agent_goal ${goal}`)
    ? goal
    : "Complete the owner's private goal using only the non-sensitive observations below.";
  const safeTerminalContent = terminalContent
    && isProviderSafeRetainedText(`agent_terminal ${terminalContent}`)
    ? terminalContent
    : null;

  const safeObservation = (step: AgentStep, index: number): string => {
    const clipped = step.ok ? clip(step.output, 500) : `(failed: ${clip(step.output, 150)})`;
    return isProviderSafeRetainedText(`agent_observation ${clipped}`)
      ? `${index + 1}. ${step.skill}: ${clipped}`
      : `${index + 1}. ${step.skill}: [sensitive observation omitted before synthesis]`;
  };

  const observations = trace.length
    ? trace.map(safeObservation).join("\n")
    : safeTerminalContent
      ? `Reasoning: ${safeTerminalContent}`
      : "(no tool results)";

  const system = `You are ${name}, a ${personality} AI pet, writing the FINAL answer to your owner's goal. Always answer in English and never output Hangul, even if the goal or observations use another language. Use the observations you gathered from your tools. Be in-character, warm, and concise (2-4 sentences). Do NOT mention "skills", "tools", "JSON", or that you are an AI.`;
  const user = `GOAL: ${safeGoal}

WHAT YOU GATHERED:
${observations}
${safeTerminalContent ? `\nYOUR DRAFT THOUGHT: ${safeTerminalContent}` : ""}

Write the final answer:`;

  let modelCalled = false;
  if (!timedOut) {
    try {
      modelCalled = true;
      const out = await callLLM({
        task: "chat",
        petId,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        max_tokens: 220,
        temperature: 0.8,
        onProviderAttempt,
        signal,
      });
      const safe = generatedEnglishOrNull(out.text);
      if (safe) return { answer: safe, timedOut: false, modelCalled, usage: out.raw?.usage };
    } catch (error) {
      timedOut = isAgentAbort(error, signal);
      // Fall through to a deterministic answer so gathered work is not lost.
    }
  }
  const safeTerminal = generatedEnglishOrNull(terminalContent);
  if (safeTerminal) return { answer: safeTerminal, timedOut, modelCalled };
  const lastOk = [...trace].reverse().find((s) => s.ok);
  if (lastOk) {
    const out = lastOk.output as any;
    if (out?.reply) {
      return {
        answer: generatedEnglishOrFallback(out.reply, AGENT_REPLY_FALLBACK),
        timedOut,
        modelCalled,
      };
    }
    return {
      answer: generatedEnglishOrFallback(
        `Here's what I found: ${clip(lastOk.output, 300)}`,
        AGENT_REPLY_FALLBACK,
      ),
      timedOut,
      modelCalled,
    };
  }
  return { answer: AGENT_REPLY_FALLBACK, timedOut, modelCalled };
}

// ── The Loop ──

const AGENT_SYSTEM = `You are an AI pet's autonomous agent, working toward your owner's GOAL.

You have TOOLS (your pet skills). To make progress, CALL the tools that help. You may request more than one tool in a round; they run sequentially. Read each result, then decide whether to call more or to STOP.

Rules:
- Write all assistant text in English and never output Hangul, even if the goal uses another language.
- Prefer calling a tool over guessing when a tool can get you real information.
- Do NOT repeat the same tool with the same arguments.
- Most goals need 1-3 tool calls. When you have enough to answer, reply with a short plain-text answer and NO tool calls — that ends the loop.
- Only call the tools you were given. Never invent tool names or arguments.
- recall_memory searches only retained context belonging to this pet's owner. Use it when the goal depends on prior context. No outbound web connector is available in this private-memory run.`;

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
  const deadlineScope = createAgentDeadlineScope(WALLCLOCK_MS, opts?.signal);
  const { signal, deadline } = deadlineScope;
  try {
  // Skill tools + private read-only recall. Connector names are checked first
  // at execution time, so they always win a collision.
  throwIfAgentAborted(signal);
  const tools = [...await buildTools(petId), ...CONNECTOR_TOOLS.map((t) => t.def)];
  throwIfAgentAborted(signal);

  const messages: ToolMessage[] = [
    { role: "system", content: AGENT_SYSTEM },
    { role: "user", content: goal },
  ];
  const trace: AgentStep[] = [];
  const usage = {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    reasoningCalls: 0,
    modelCalls: 0,
    orchestratorModelCalls: 0,
    skillModelCalls: 0,
    steps: 0,
  };
  let terminalContent: string | null = null;
  let stoppedReason: AgentStoppedReason = "max_steps";

  const addUsage = (u: any) => {
    usage.reasoningCalls += 1;
    if (!u) return;
    const pt = u.prompt_tokens ?? u.input_tokens ?? 0;
    const ct = u.completion_tokens ?? u.output_tokens ?? 0;
    usage.promptTokens += pt;
    usage.completionTokens += ct;
    usage.totalTokens += u.total_tokens ?? pt + ct;
  };
  const recordOrchestratorAttempt = () => {
    usage.modelCalls += 1;
    usage.orchestratorModelCalls += 1;
  };

  reasoningLoop: for (let step = 0; step < maxSteps; step++) {
    if (signal.aborted || Date.now() >= deadline) {
      stoppedReason = "timeout";
      break;
    }

    let res;
    try {
      res = await awaitAgentWork(signal, (runSignal) => callLLMWithTools({
          task: "reason",
          messages,
          tools,
          toolChoice: "auto",
          petId,
          temperature: 0.3,
          maxTokens: 700,
          onProviderAttempt: recordOrchestratorAttempt,
          signal: runSignal,
        }));
    } catch (e: any) {
      stoppedReason = isAgentAbort(e, signal) ? "timeout" : "planner_error";
      onEvent({ type: "error", message: e?.message || "reasoning call failed" });
      break;
    }
    addUsage(res.usage);

    // No tool calls → the model's content IS the terminal reasoning answer.
    if (!res.toolCalls || res.toolCalls.length === 0) {
      terminalContent = generatedEnglishOrNull(res.content);
      if (terminalContent) onEvent({ type: "thought", text: terminalContent });
      stoppedReason = "completed";
      break;
    }

    // The model requested tool calls — record the assistant turn, then execute.
    appendAssistantToolCalls(messages, res);
    const safeThought = generatedEnglishOrNull(res.content);
    if (safeThought) onEvent({ type: "thought", text: safeThought });

    const results: Array<{ tool_call_id: string; name: string; content: string }> = [];
    for (const call of res.toolCalls) {
      if (signal.aborted || Date.now() >= deadline) {
        stoppedReason = "timeout";
        break reasoningLoop;
      }
      const isConnector = CONNECTOR_TOOL_MAP.has(call.name);
      const kind: ToolKind = isConnector ? "connector" : "skill";
      onEvent({ type: "tool_call", id: call.id, skill: call.name, input: call.arguments, kind });
      let exec;
      try {
        exec = isConnector
          ? await executeConnector(petId, call.name, call.arguments, signal)
          : await executeSkillOnce(petId, call.name, call.arguments, signal);
      } catch (error) {
        if (isAgentAbort(error, signal)) {
          stoppedReason = "timeout";
          break reasoningLoop;
        }
        throw error;
      }
      const rawSkillModelCalls: unknown = "modelCalls" in exec
        ? exec.modelCalls
        : undefined;
      const skillModelCalls = typeof rawSkillModelCalls === "number"
        ? rawSkillModelCalls
        : 0;
      trace.push({
        thought: safeThought ?? undefined,
        skill: call.name,
        input: call.arguments,
        output: exec.output,
        ok: exec.ok,
        sideEffectCommitted: "sideEffectCommitted" in exec && exec.sideEffectCommitted === true,
        modelCalls: skillModelCalls,
      });
      usage.skillModelCalls += skillModelCalls;
      usage.modelCalls += skillModelCalls;
      onEvent({
        type: "tool_result",
        id: call.id,
        skill: call.name,
        ok: exec.ok,
        output: exec.output,
        sideEffectCommitted: "sideEffectCommitted" in exec && exec.sideEffectCommitted === true,
        kind,
      });
      if (!exec.ok) {
        onEvent({ type: "error", skill: call.name, message: clip((exec.output as any)?.error ?? exec.output, 200) });
      }
      results.push({ tool_call_id: call.id, name: call.name, content: clip(exec.output, RESULT_CLIP) });
      if (signal.aborted || Date.now() >= deadline) {
        stoppedReason = "timeout";
        break reasoningLoop;
      }
    }
    appendToolResults(messages, results);
  }

  usage.steps = trace.length;
  const synthesis = await synthesize(
    petId,
    goal,
    trace,
    terminalContent,
    signal,
    recordOrchestratorAttempt,
  );
  if (synthesis.modelCalled) addUsage(synthesis.usage);
  if (synthesis.timedOut && stoppedReason !== "planner_error") stoppedReason = "timeout";
  // A terminal planner answer is not task success when every attempted tool
  // failed. Direct-answer runs (no tools) may still complete successfully.
  const completed =
    stoppedReason === "completed" &&
    (trace.length === 0 || trace.some((step) => step.ok));
  onEvent({ type: "final", answer: synthesis.answer, completed, stoppedReason });
  return { answer: synthesis.answer, trace, completed, stoppedReason, usage };
  } finally {
    // Clearing the timer happens before the returned promise settles. Because
    // every child task above is awaited, there is no provider/skill promise left
    // able to mutate accounting after the route starts credit settlement.
    deadlineScope.close();
  }
}

/** Exposed for the route + tests: which skills are offered as executable tools. */
export function runnableToolIds(): string[] {
  // Registry-level candidate ids. A concrete run additionally filters these by
  // the pet's core/install/level/personality policy in buildTools(petId).
  return BUILTIN_SKILLS.filter(isRunnable).map((s) => s.id);
}

/** Exposed for the route + tests: private read-only connector tools. */
export function connectorToolIds(): string[] {
  return CONNECTOR_TOOLS.map((t) => t.def.name);
}
