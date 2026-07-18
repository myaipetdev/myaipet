/**
 * Plan-and-Execute Agent Loop (FEATURE 2)
 *
 * A real multi-step agentic loop: given a GOAL, a reasoning model PLANS the next
 * step, that step INVOKES one of the 18 canonical PetClaw skills (via the real
 * `executeSkill` from pethub.ts), the loop OBSERVES the skill output, then
 * ITERATES — re-planning with the accumulated observations — until the planner
 * emits a `finish` action or the step budget (`maxSteps`) is hit. Finally a chat
 * model SYNTHESIZES a single in-character answer from the trace.
 *
 * This is the reasoning-autonomy layer that the existing engine lacks:
 *   - pet-agent.ts `decideAction()` is a probabilistic random-roll (one shot, no
 *     observation, no iteration).
 *   - This loop reasons over results and chains skills toward a goal.
 *
 * Grounding (verified against the codebase):
 *   - Skills + executor: web/src/lib/petclaw/pethub.ts
 *       BUILTIN_SKILLS (18 ids), executeSkill(petId, skillId, input), getSkill().
 *   - LLM transport: owner-safe unified router (platform xAI → OpenAI fallback)
 *       (same endpoint every call site uses today).
 *
 * Model routing:
 *   This module consumes a `routeModel({ task })` router. FEATURE 1 (a real
 *   provider/model abstraction) is NOT landed yet — there is no model-router file
 *   in the repo (grep confirmed). So we ship a thin LOCAL shim here that maps the
 *   router's task names onto the strongest Grok models already in production use:
 *       task:'reason' -> grok-4-1-fast-non-reasoning  (planning; strongest model
 *                        in the repo today — see app/api/upload, services/video.ts)
 *       task:'chat'   -> grok-3-mini                   (synthesis; the model the
 *                        chat route + pet-agent already use)
 *   When FEATURE 1 lands, replace `routeModel` below with an import from the real
 *   router; the loop logic does not change.
 */

import { BUILTIN_SKILLS, executeSkill, getSkill } from "../pethub";
import { callLLM, type LLMMessage, type LLMTask } from "@/lib/llm/router";
import {
  generatedEnglishOrFallback,
  generatedEnglishOrNull,
} from "@/lib/generatedLanguage";

// FEATURE 1 landed: the loop now routes through the model router, so planning
// uses the 'reason' task (the pet-owner's connected reasoning model if they've
// connected one, else the platform Grok default) and synthesis uses 'chat'.
// This is task→model assignment via the harness, exactly as intended.
export type AgentTask = Extract<LLMTask, "reason" | "chat">;

const TASK_TEMPERATURE: Record<AgentTask, number> = { reason: 0.3, chat: 0.8 };
const AGENT_REPLY_FALLBACK = "I tried, but I couldn't pull together an English answer this time.";

// ── Types ──

export interface AgentStep {
  thought: string;                      // planner's reasoning for this step
  skill: string;                        // BUILTIN_SKILLS id chosen (or "finish")
  input: Record<string, unknown>;       // input passed to executeSkill
  output: unknown;                      // result returned (skill output or error)
  ok: boolean;                          // whether the skill call succeeded
}

export interface AgentRunResult {
  goal: string;
  steps: AgentStep[];
  answer: string;
  stoppedReason: "finished" | "budget_exhausted" | "planner_error";
}

interface PlannerDecision {
  thought: string;
  // Either invoke a skill, or finish.
  action: "invoke" | "finish";
  skill?: string;
  input?: Record<string, unknown>;
  // When action === "finish", planner may hand a draft answer to the synthesizer.
  answer_draft?: string;
}

// ── Skill catalog the planner is allowed to choose from ──
//
// We expose ALL 18 canonical BUILTIN_SKILLS ids to the planner, but annotate
// which actually RUN in-process vs which only return an invoke-via-endpoint
// descriptor (see executeAPISkill in pethub.ts). The planner is told to prefer
// in-process skills because their observations are real content it can reason
// over; api-call skills give it a "go call this endpoint" pointer, not a result.

// A skill is RUNNABLE-IN-LOOP iff its handler runs in-process (`llm-prompt`):
// executeSkill produces real text the planner can observe and chain. Every other
// handler (`api-call`, and any future non-in-process handler) is ENDPOINT-ONLY:
// executeSkill returns an `invoke_via_endpoint` DESCRIPTOR (see executeAPISkill in
// pethub.ts), i.e. a pointer the loop can LOCATE but cannot itself execute/chain.
// We key off the in-process handler allowlist (not a !== "api-call" denylist) so a
// new endpoint handler added later is treated as endpoint-only by default — fail
// closed, so the planner is never told an unrunnable skill is chainable.
const IN_PROCESS_HANDLERS = new Set(["llm-prompt"]);

/** True when executeSkill actually runs this skill in-loop (real, chainable output). */
function isRunnableInLoop(handler: string | undefined): boolean {
  return IN_PROCESS_HANDLERS.has(handler ?? "");
}

const IN_PROCESS_SKILLS = new Set(
  BUILTIN_SKILLS.filter((s) => isRunnableInLoop(s.handler)).map((s) => s.id),
); // companion-chat, persona-mirror, daily-mood, summarize-page, vibe-check

function buildSkillCatalog(): string {
  return BUILTIN_SKILLS.map((s) => {
    // Explicit, robust per-skill annotation: RUNNABLE-IN-LOOP vs ENDPOINT-ONLY.
    const runnable = isRunnableInLoop(s.handler);
    const kind = runnable
      ? "RUNNABLE-IN-LOOP — executeSkill runs it here and returns real text you can observe and chain"
      : "ENDPOINT-ONLY — NOT executed here; returns a pointer to its REST endpoint (you can locate/trigger it, but you will NOT get a result to reason over)";
    const inputKeys = Object.keys((s.inputSchema as any)?.properties || {});
    const args = inputKeys.length ? inputKeys.join(", ") : "(no args)";
    return `- ${s.id}: ${s.description} [${kind}] args: ${args}`;
  }).join("\n");
}

// ── Grok call helper (mirrors every existing call site) ──

async function callModel(
  task: AgentTask,
  messages: LLMMessage[],
  maxTokens: number,
  petId: number,
): Promise<string> {
  // Route through the unified caller: resolves the pet-owner's connected model
  // for this task (BYOK) or falls back to the platform Grok default.
  const result = await callLLM({ task, messages, petId, max_tokens: maxTokens, temperature: TASK_TEMPERATURE[task] });
  if (!result.text) throw new Error(`Empty ${task} response (${result.provider}/${result.model})`);
  return result.text;
}

/** Extract the first balanced JSON object from a model reply (Grok loves prose). */
function parseFirstJson<T>(raw: string): T | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as T;
  } catch {
    return null;
  }
}

// ── The Planner: decides the next step given the goal + trace so far ──

const PLANNER_SYSTEM = `You are the PLANNER for an AI-pet agent. You decompose a GOAL into ONE next step at a time.

You may invoke exactly one SKILL per step from the catalog below, observe its result, then you will be asked again for the next step. When the goal is satisfied (or no further skill will help), FINISH.

You MUST reply with ONLY a single JSON object, no prose, in this exact shape:
{
  "thought": "<one sentence: why this step>",
  "action": "invoke" | "finish",
  "skill": "<a skill id from the catalog, required when action is invoke>",
  "input": { ... },               // arguments for the skill; match its 'args'
  "answer_draft": "<optional: when action is finish, a short draft answer>"
}

RULES:
- Write every thought and answer draft in English. Never output Hangul, even if the goal or observations use another language.
- Prefer "RUNNABLE-IN-LOOP" skills — their results are real content you can reason over and chain into later steps. "ENDPOINT-ONLY" skills are NOT executed here; they only return a pointer to a REST endpoint, so they give you NOTHING to reason over. Only choose an ENDPOINT-ONLY skill if the goal is literally to locate or hand off that endpoint, and never expect a usable result back from one.
- Use the OBSERVATIONS from previous steps. Do not repeat an identical skill+input.
- Most goals need 1–3 steps. If you already have enough to answer, action MUST be "finish".
- "skill" must be an EXACT id from the catalog. Never invent skills or arguments.`;

async function planNextStep(
  goal: string,
  steps: AgentStep[],
  catalog: string,
  remaining: number,
  petId: number,
): Promise<PlannerDecision> {
  const trace = steps.length
    ? steps
        .map(
          (s, i) =>
            `Step ${i + 1}: thought=${s.thought}\n  invoked ${s.skill}(${JSON.stringify(s.input)}) -> ${
              s.ok ? JSON.stringify(s.output).slice(0, 400) : `ERROR: ${JSON.stringify(s.output).slice(0, 200)}`
            }`,
        )
        .join("\n")
    : "(no steps yet)";

  const userMsg = `GOAL: ${goal}

SKILL CATALOG:
${catalog}

OBSERVATIONS SO FAR:
${trace}

Steps remaining in budget: ${remaining}. Decide the next step (JSON only).`;

  const raw = await callModel("reason", [
    { role: "system", content: PLANNER_SYSTEM },
    { role: "user", content: userMsg },
  ], 400, petId);

  const decision = parseFirstJson<PlannerDecision>(raw);
  if (!decision || (decision.action !== "invoke" && decision.action !== "finish")) {
    // Treat an unparseable plan as "finish" so the loop degrades gracefully
    // instead of hanging; the synthesizer still produces an answer from the trace.
    return { thought: "planner produced no valid step; finishing with what we have", action: "finish" };
  }
  return {
    ...decision,
    thought: generatedEnglishOrFallback(decision.thought, "Continuing with the next step."),
    answer_draft: generatedEnglishOrNull(decision.answer_draft) || undefined,
  };
}

// ── The Synthesizer: writes the final in-character answer from the trace ──

async function synthesize(
  goal: string,
  steps: AgentStep[],
  draft: string | undefined,
  petId: number,
): Promise<string> {
  const observations = steps.length
    ? steps
        .map(
          (s, i) =>
            `${i + 1}. ${s.skill}: ${s.ok ? JSON.stringify(s.output).slice(0, 500) : `(failed: ${JSON.stringify(s.output).slice(0, 150)})`}`,
        )
        .join("\n")
    : "(no skill results)";

  const system = `You are the pet itself, writing the FINAL answer to your owner's goal. Always answer in English and never output Hangul, even if the goal or observations use another language. Use the observations gathered by your tools. Be in-character, warm, and concise (2-4 sentences). Do not mention "skills", "tools", "JSON", or that you are an AI. If a draft is provided, refine it.`;
  const user = `GOAL: ${goal}

GATHERED OBSERVATIONS:
${observations}
${draft ? `\nDRAFT ANSWER: ${draft}` : ""}

Write the final answer:`;

  try {
    const answer = await callModel("chat", [
      { role: "system", content: system },
      { role: "user", content: user },
    ], 220, petId);
    return generatedEnglishOrFallback(answer, AGENT_REPLY_FALLBACK);
  } catch {
    // Synthesis failure must not lose the work — fall back to the draft or the
    // last successful observation rendered plainly.
    const safeDraft = generatedEnglishOrNull(draft);
    if (safeDraft) return safeDraft;
    const lastOk = [...steps].reverse().find((s) => s.ok);
    if (lastOk) {
      const out = lastOk.output as any;
      if (out?.reply) return generatedEnglishOrFallback(out.reply, AGENT_REPLY_FALLBACK);
      return generatedEnglishOrFallback(
        `Here's what I found: ${JSON.stringify(lastOk.output).slice(0, 300)}`,
        AGENT_REPLY_FALLBACK,
      );
    }
    return AGENT_REPLY_FALLBACK;
  }
}

// ── The Loop ──

export interface RunAgentLoopArgs {
  petId: number;
  goal: string;
  /** Hard cap on planner/skill iterations. Bounded by design (see realityNote). */
  maxSteps?: number;
}

/**
 * Run the plan-execute loop. Reasoning model PLANS each step, a real skill is
 * INVOKED via executeSkill (pethub.ts), the result is OBSERVED, and the loop
 * ITERATES until `finish` or `maxSteps`, then a chat model SYNTHESIZES the answer.
 */
export async function runAgentLoop({
  petId,
  goal,
  maxSteps = 5,
}: RunAgentLoopArgs): Promise<AgentRunResult> {
  const budget = Math.max(1, Math.min(8, Math.floor(maxSteps)));
  const catalog = buildSkillCatalog();
  const steps: AgentStep[] = [];
  let stoppedReason: AgentRunResult["stoppedReason"] = "budget_exhausted";
  let answerDraft: string | undefined;

  for (let i = 0; i < budget; i++) {
    let decision: PlannerDecision;
    try {
      decision = await planNextStep(goal, steps, catalog, budget - i, petId);
    } catch (e: any) {
      // Planner transport failure — stop cleanly and synthesize from what we have.
      stoppedReason = steps.length ? "planner_error" : "planner_error";
      // Record the failure as a (failed) step so the trace is honest.
      steps.push({
        thought: "planner call failed",
        skill: "finish",
        input: {},
        output: { error: e?.message || "planner error" },
        ok: false,
      });
      break;
    }

    if (decision.action === "finish") {
      answerDraft = decision.answer_draft;
      stoppedReason = "finished";
      // Record the planner's terminal reasoning as a zero-cost step for transparency.
      steps.push({
        thought: decision.thought || "goal satisfied",
        skill: "finish",
        input: {},
        output: { finished: true, draft: decision.answer_draft || null },
        ok: true,
      });
      break;
    }

    // action === "invoke" — validate the chosen skill against the REAL registry.
    const skillId = String(decision.skill || "");
    const manifest = getSkill(skillId);
    if (!manifest) {
      // Planner hallucinated a skill id — record an error step and let it re-plan.
      steps.push({
        thought: decision.thought || "(no thought)",
        skill: skillId || "(none)",
        input: decision.input || {},
        output: { error: `Unknown skill '${skillId}'. Choose from the catalog.` },
        ok: false,
      });
      continue;
    }

    const input = (decision.input && typeof decision.input === "object" ? decision.input : {}) as Record<
      string,
      unknown
    >;

    // INVOKE the real skill. executeSkill runs llm-prompt skills in-process and
    // returns an invoke_via_endpoint descriptor for api-call skills.
    let output: unknown;
    let ok = false;
    try {
      const result = await executeSkill(petId, skillId, input);
      output = result.output;
      ok = result.success;
    } catch (e: any) {
      output = { error: e?.message || "skill execution threw" };
      ok = false;
    }

    steps.push({
      thought: decision.thought || "(no thought)",
      skill: skillId,
      input,
      output,
      ok,
    });
  }

  // SYNTHESIZE the final answer from the trace (chat model).
  const answer = await synthesize(goal, steps, answerDraft, petId);

  return { goal, steps, answer, stoppedReason };
}

/** Exposed for the route + tests: which skills truly execute (chain) in-loop. */
export function inProcessSkillIds(): string[] {
  return [...IN_PROCESS_SKILLS];
}

/** Exposed for the route + tests: which skills are endpoint-only (located, not run). */
export function endpointOnlySkillIds(): string[] {
  return BUILTIN_SKILLS.filter((s) => !isRunnableInLoop(s.handler)).map((s) => s.id);
}
