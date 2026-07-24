/**
 * POST /api/pets/[petId]/agent — run one explicit typed Agent Office task
 *
 * Body: { runId: UUID, goal: string, taskKind: "recall"|"summarize"|"review"|"draft", maxSteps?: number, confirmCostCredits: 5 }
 * Returns (JSON, default): { runId, ok, completed, goal, answer, steps: [{thought, skill, input, output, ok}], stoppedReason, billing, creditsRemaining }
 * Returns (SSE, when Accept: text/event-stream OR ?stream=1): a stream of
 *   `data: {type:"reserved"|"tool_call"|"tool_result"|"thought"|"error"|"final", ...}` events.
 *   The initial `reserved` event carries the authoritative post-reservation
 *   balance before provider work begins; the stream ends with
 *   `data: {type:"done", ok, answer, steps, stoppedReason, creditsRemaining}`.
 *
 * Owner-auth + step-budget + credit guard (identical in both modes):
 *   - requirePetOwner (authz.ts) — only the pet's owner may authorize a run.
 *   - typed runs normalize maxSteps to one exact required-tool attempt.
 *   - the owner must explicitly confirm the exact flat cost before reservation.
 *   - A flat credit cost is reserved up-front (ONCE, not per event). New runs
 *     require a typed deliverable bound in the ledger to one exact read-only
 *     tool. It is charged only when that tool succeeds exactly once and a
 *     deliverable answer completes; otherwise it is refunded. Paid-loop skills
 *     cannot retain memory or commit side effects.
 *
 * Grounding: runToolAgent lives in web/src/lib/petclaw/agent/tool-agent.ts.
 * Typed tasks bypass the legacy planner and execute one server-selected
 * connector or memory-isolated Office text tool.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePetOwner } from "@/lib/authz";
import { rateLimit } from "@/lib/rateLimit";
import {
  runToolAgent,
  type AgentEvent,
  type AgentStep,
  type AgentStoppedReason,
} from "@/lib/petclaw/agent/tool-agent";
import { readBoundedJsonBody } from "@/lib/petclaw/bounded-json-body";
import {
  PET_AGENT_RUN_ID_PATTERN,
  getPetAgentRun,
  markPetAgentRunRunning,
  reservePetAgentRun,
  settlePetAgentRun,
  type AgentRunBillingReceipt,
  type PublicPetAgentRun,
} from "@/lib/petclaw/agent/run-ledger";
import {
  AGENT_FREEFORM_EXECUTION_CONTRACT,
  AGENT_OFFICE_TASK_MAX_INPUT,
  AGENT_OFFICE_TASK_REQUIRED_TOOL,
  AGENT_OFFICE_TYPED_MAX_STEPS,
  agentOfficeExecutionContract,
  buildAgentOfficeExecutionGoal,
  buildAgentOfficeRequiredToolInput,
  containsStrongAgentOfficeSecret,
  getAgentOfficeTaskInputError,
  isAgentOfficeTaskKind,
  normalizeAgentOfficeTaskInput,
  type AgentOfficeTaskKind,
} from "@/lib/petclaw/agent/office-task-contract";

// Server-enforced ceilings (client cannot exceed these).
const MAX_STEPS = 6;
const DEFAULT_STEPS = 4;
// Flat cost for a loop run (each run can include several reasoning + skill LLM
// calls). Mirrors the credit-debit pattern in /api/pet-date.
const COST_CREDITS = 5;
const PRIVATE_AGENT_JSON_HEADERS = {
  "Cache-Control": "private, no-store",
} as const;

function privateAgentJson(body: unknown, init: ResponseInit = {}): NextResponse {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", PRIVATE_AGENT_JSON_HEADERS["Cache-Control"]);
  return NextResponse.json(body, { ...init, headers });
}

function withPrivateAgentHeaders<T extends Response>(response: T): T {
  response.headers.set("Cache-Control", PRIVATE_AGENT_JSON_HEADERS["Cache-Control"]);
  return response;
}

type AgentBilling = AgentRunBillingReceipt & {
  reason:
    | "completed_with_successful_tool"
    | "completed_direct_answer_beta_refund"
    | "freeform_beta_refund"
    | "typed_task_no_matching_tool"
    | "typed_task_no_result"
    | "run_not_completed"
    | "no_successful_tool"
    | "no_deliverable_answer"
    | "outcome_unknown_timeout";
};

function runStatusUrl(petId: number, runId: string): string {
  return `/api/pets/${petId}/agent/runs/${runId}`;
}

function replaySse(run: PublicPetAgentRun): Response {
  const event = run.state === "terminal"
    ? { type: "done", ...run }
    : { type: "status", runId: run.runId, state: run.state, statusUrl: runStatusUrl(run.petId, run.runId) };
  return new Response(`data: ${JSON.stringify(event)}\n\n`, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "private, no-store, no-cache, no-transform",
      "X-PetClaw-Idempotent-Replay": "1",
    },
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ petId: string }> },
) {
  const { petId } = await params;
  const pid = Number(petId);

  // Owner auth — returns { user, pet } or a ready-to-return error response.
  const auth = await requirePetOwner(req, pid);
  if (auth.error) return withPrivateAgentHeaders(auth.error);
  const { user, pet } = auth;

  if (!pet.is_active) {
    return privateAgentJson({ error: "Pet is inactive" }, { status: 404 });
  }

  // Parse only after owner authorization, and cap the bytes actually streamed
  // rather than trusting an optional Content-Length header.
  const parsedBody = await readBoundedJsonBody(req, 16 * 1024);
  if (parsedBody.ok === false) {
    return privateAgentJson(
      { error: parsedBody.reason === "too_large" ? "Request body too large" : "Invalid JSON body" },
      { status: parsedBody.reason === "too_large" ? 413 : 400 },
    );
  }
  if (!parsedBody.value || typeof parsedBody.value !== "object" || Array.isArray(parsedBody.value)) {
    return privateAgentJson({ error: "Invalid JSON body" }, { status: 400 });
  }
  const body = parsedBody.value as Record<string, unknown>;
  const rawRunId = body.runId;
  const rawGoal = body.goal;
  const rawTaskKind = body.taskKind;
  const rawMaxSteps = body.maxSteps;
  const rawConfirmCostCredits = body.confirmCostCredits;
  if (typeof rawRunId !== "string" || !PET_AGENT_RUN_ID_PATTERN.test(rawRunId)) {
    return privateAgentJson(
      { error: "A client-generated UUID 'runId' is required for paid-run idempotency" },
      { status: 400 },
    );
  }
  if (typeof rawGoal !== "string") {
    return privateAgentJson({ error: "A string 'goal' is required" }, { status: 400 });
  }
  if (rawGoal.length > AGENT_OFFICE_TASK_MAX_INPUT) {
    return privateAgentJson(
      { error: `Task input must be ${AGENT_OFFICE_TASK_MAX_INPUT} characters or fewer` },
      { status: 400 },
    );
  }
  if (rawTaskKind !== undefined && !isAgentOfficeTaskKind(rawTaskKind)) {
    return privateAgentJson(
      { error: "taskKind must be one of: recall, summarize, review, draft" },
      { status: 400 },
    );
  }
  if (rawMaxSteps !== undefined && (typeof rawMaxSteps !== "number" || !Number.isFinite(rawMaxSteps))) {
    return privateAgentJson({ error: "maxSteps must be a finite number" }, { status: 400 });
  }
  if (rawConfirmCostCredits !== COST_CREDITS) {
    return privateAgentJson(
      {
        error:
          `Explicit confirmation of the ${COST_CREDITS}-credit reservation is required; `
          + "only a successful read-only tool-backed answer is charged",
        needed: { confirmCostCredits: COST_CREDITS },
      },
      { status: 400 },
    );
  }
  const goal = normalizeAgentOfficeTaskInput(rawGoal);
  if (!goal || goal.trim().length < 3) {
    return privateAgentJson({ error: "A 'goal' (>=3 chars) is required" }, { status: 400 });
  }

  // Step budget — clamp regardless of what the client sends.
  const requested = typeof rawMaxSteps === "number" ? Math.floor(rawMaxSteps) : DEFAULT_STEPS;
  const requestedMaxSteps = Math.max(1, Math.min(MAX_STEPS, requested));

  const cleanGoal = goal.trim();
  const taskKind: AgentOfficeTaskKind | null =
    isAgentOfficeTaskKind(rawTaskKind) ? rawTaskKind : null;
  // maxSteps remains accepted for historical/free-form receipt replay, but a
  // new typed v1 task always executes its one server-selected required tool.
  const maxSteps = taskKind ? AGENT_OFFICE_TYPED_MAX_STEPS : requestedMaxSteps;
  const requiredToolName = taskKind
    ? AGENT_OFFICE_TASK_REQUIRED_TOOL[taskKind]
    : null;
  const executionGoal = taskKind
    ? buildAgentOfficeExecutionGoal(taskKind, cleanGoal)
    : cleanGoal;
  const requiredToolInput = taskKind
    ? buildAgentOfficeRequiredToolInput(taskKind, cleanGoal)
    : null;
  const executionContract = taskKind
    ? agentOfficeExecutionContract(taskKind)
    : AGENT_FREEFORM_EXECUTION_CONTRACT;
  const runId = rawRunId.toLowerCase();
  const wantsStream =
    (req.headers.get("accept") || "").includes("text/event-stream") ||
    new URL(req.url).searchParams.get("stream") === "1";

  // A committed idempotency key is always replayable, even after a lost
  // response pushes the caller over the new-run rate limit.
  const priorRun = await getPetAgentRun(user.id, pet.id, runId);
  if (priorRun) {
    if (
      priorRun.goal !== cleanGoal
      || priorRun.maxSteps !== maxSteps
      || priorRun.executionContract !== executionContract
    ) {
      return privateAgentJson(
        { error: "runId is already bound to a different goal, step budget, or execution contract", runId },
        { status: 409 },
      );
    }
    if (wantsStream) return replaySse(priorRun);
    return privateAgentJson(
      { ...priorRun, statusUrl: runStatusUrl(pet.id, runId), replayed: true },
      {
        status: priorRun.state === "terminal" ? 200 : 202,
        headers: PRIVATE_AGENT_JSON_HEADERS,
      },
    );
  }

  // New runs require a typed, server-bound deliverable. Existing run IDs replay
  // above so legacy receipts remain recoverable, but free-form work can never
  // consume provider capacity behind an automatic refund.
  if (taskKind === null) {
    return privateAgentJson(
      {
        error: "Choose an explicit taskKind before starting a new agent run",
        code: "agent_task_kind_required",
        supportedTaskKinds: ["recall", "summarize", "review", "draft"],
        suggestedSurface: "Open Agent Office and choose Recall, Summarize, Review, or Draft.",
      },
      { status: 400 },
    );
  }
  if (containsStrongAgentOfficeSecret(cleanGoal)) {
    return privateAgentJson(
      {
        error: "Remove API keys, tokens, passwords, private keys, or recovery secrets before running this task",
        code: "agent_task_secret_rejected",
        taskKind,
      },
      { status: 400 },
    );
  }
  const taskInputError = getAgentOfficeTaskInputError(taskKind, cleanGoal);
  if (taskInputError) {
    return privateAgentJson(
      {
        error: taskInputError,
        code: "agent_task_input_invalid",
        taskKind,
      },
      { status: 400 },
    );
  }

  // Only brand-new paid runs consume the expensive-operation rate limit.
  const rl = rateLimit(req, { key: "agent-loop", limit: 10, windowMs: 60_000 });
  if (!rl.ok) return withPrivateAgentHeaders(rl.response);

  // The run ledger's unique owner/pet/runId key, wallet debit, and reservation
  // are one transaction. A duplicate request can only replay or report status.
  const reservationResult = await reservePetAgentRun({
    runId,
    userId: user.id,
    petId: pet.id,
    petName: pet.name,
    goal: cleanGoal,
    maxSteps,
    executionContract,
    amount: COST_CREDITS,
  });
  if (reservationResult.kind === "insufficient") {
    return privateAgentJson({ error: "Not enough credits", needed: COST_CREDITS }, { status: 402 });
  }
  if (reservationResult.kind === "unavailable") {
    return privateAgentJson(
      { error: "Pet not found or inactive", code: "pet_unavailable" },
      { status: 404 },
    );
  }
  if (reservationResult.kind === "blocked") {
    return privateAgentJson(
      {
        error: "Another paid agent run is already active for this pet",
        code: "agent_run_in_progress",
        runId,
        activeRunId: reservationResult.run.runId,
        statusUrl: runStatusUrl(pet.id, reservationResult.run.runId),
      },
      { status: 409 },
    );
  }
  if (reservationResult.kind === "existing") {
    if (!reservationResult.inputMatches) {
      return privateAgentJson(
        { error: "runId is already bound to a different goal, step budget, or execution contract", runId },
        { status: 409 },
      );
    }
    if (wantsStream) return replaySse(reservationResult.run);
    return privateAgentJson(
      {
        ...reservationResult.run,
        statusUrl: runStatusUrl(pet.id, runId),
        replayed: true,
      },
      {
        status: reservationResult.run.state === "terminal" ? 200 : 202,
        headers: PRIVATE_AGENT_JSON_HEADERS,
      },
    );
  }
  try {
    await markPetAgentRunRunning(user.id, pet.id, runId);
  } catch (error: any) {
    console.error("[agent-loop] could not mark run as running:", error?.message);
    return privateAgentJson(
      {
        error: "Agent run pending reconciliation",
        runId,
        state: "reserved",
        creditsReserved: COST_CREDITS,
        creditsRemaining: reservationResult.reservation.creditsRemaining,
        statusUrl: runStatusUrl(pet.id, runId),
      },
      { status: 503 },
    );
  }

  // Shared: settle credits + write the audit log once the run completes. A
  // trace entry means only "attempted"; it is never evidence of successful work.
  const settle = async (
    trace: AgentStep[],
    answer: string,
    answerDelivered: boolean,
    stoppedReason: AgentStoppedReason,
    completed: boolean,
    modelCalls: number,
    orchestratorModelCalls: number,
    skillModelCalls: number,
  ): Promise<{ creditsRemaining: number; billing: AgentBilling; run: PublicPetAgentRun }> => {
    const successfulToolCalls = trace.filter((step) => step.ok).length;
    const matchingSuccessfulToolCalls = requiredToolName
      ? trace.filter((step) => step.ok && step.skill === requiredToolName).length
      : 0;
    const failedToolCalls = trace.length - successfulToolCalls;
    const committedSideEffects = trace.filter((step) => step.sideEffectCommitted).length;
    const requiredStep = requiredToolName
      ? trace.find((step) => step.skill === requiredToolName)
      : undefined;
    const requiredOutput =
      requiredStep?.output
      && typeof requiredStep.output === "object"
      && !Array.isArray(requiredStep.output)
        ? requiredStep.output as Record<string, unknown>
        : null;
    const requiredInputMatches =
      requiredStep != null
      && requiredToolInput != null
      && JSON.stringify(requiredStep.input) === JSON.stringify(requiredToolInput);
    const typedToolProducedResult =
      taskKind !== "recall"
      || (
        typeof requiredOutput?.count === "number"
        && Number.isFinite(requiredOutput.count)
        && requiredOutput.count > 0
      );
    const typedToolWasNotDegraded = requiredOutput?.degraded !== true;
    const typedDeliverableWasValidated =
      taskKind === "recall"
      || requiredOutput?.deliverableValidated === true;
    const completedDirectAnswer =
      answerDelivered && completed && trace.length === 0 && modelCalls > 0;
    // Until the free-form beta is replaced with typed text-deliverable modes,
    // only a successful approved read-only tool/connector can consume credits.
    // A direct model answer (including a refusal that escaped preflight) is
    // always refunded, so model wording is never the financial authority.
    const exactTypedToolContract =
      taskKind !== null
      && matchingSuccessfulToolCalls === 1
      && successfulToolCalls === 1
      && trace.length === 1
      && committedSideEffects === 0
      && requiredInputMatches
      && typedToolProducedResult
      && typedToolWasNotDegraded
      && typedDeliverableWasValidated;
    const chargeable =
      exactTypedToolContract
      && answerDelivered
      && completed;
    const billingReason: AgentBilling["reason"] = !answerDelivered
      ? "no_deliverable_answer"
      : taskKind === null
        ? completedDirectAnswer
          ? "completed_direct_answer_beta_refund"
          : "freeform_beta_refund"
      : completed && exactTypedToolContract
        ? "completed_with_successful_tool"
        : completed
          && matchingSuccessfulToolCalls === 1
          && (
            !typedToolProducedResult
            || !typedToolWasNotDegraded
            || !typedDeliverableWasValidated
          )
          ? "typed_task_no_result"
        : completed && successfulToolCalls > 0
          ? "typed_task_no_matching_tool"
        : completed
          ? "no_successful_tool"
          : "run_not_completed";
    const billing: AgentBilling = {
      outcome: chargeable ? "charged" : "refunded",
      creditsCharged: chargeable ? COST_CREDITS : 0,
      reason: billingReason,
      successfulToolCalls,
      failedToolCalls,
      committedSideEffects,
      usageKnown: true,
      modelCalls,
      orchestratorModelCalls,
      skillModelCalls,
    };
    const settledRun = await settlePetAgentRun({
      userId: user.id,
      petId: pet.id,
      runId,
      outcome: chargeable ? "charged" : "refunded",
      completed,
      answer,
      steps: trace,
      stoppedReason,
      billing,
    });
    await prisma.petAutonomousAction
      .create({
        data: {
          pet_id: pet.id,
          urge_type: "agent_loop",
          action_taken: `tool_agent:${billing.outcome}`,
          prompt_used: goal.trim().slice(0, 2000),
          credits_used: billing.creditsCharged,
          result: {
            stepCount: trace.length,
            skills: trace.map((s) => s.skill),
            answer: answer.slice(0, 1000),
            completed,
            stoppedReason,
            billing,
          } as any,
        },
      })
      .catch((e) => console.error("[agent-loop] action log failed:", e?.message));
    return { creditsRemaining: settledRun.creditsRemaining ?? 0, billing, run: settledRun };
  };

  const settleThrownRun = () => {
    const billing: AgentBilling = {
      outcome: "refunded",
      creditsCharged: 0,
      reason: "outcome_unknown_timeout",
      successfulToolCalls: 0,
      failedToolCalls: 0,
      committedSideEffects: 0,
      usageKnown: false,
      modelCalls: null,
      orchestratorModelCalls: null,
      skillModelCalls: null,
    };
    return settlePetAgentRun({
      userId: user.id,
      petId: pet.id,
      runId,
      outcome: "refunded",
      completed: false,
      answer: "",
      steps: [],
      stoppedReason: "task_error",
      billing,
    });
  };

  // ── SSE streaming path ──
  if (wantsStream) {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (evt: unknown) => {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(evt)}\n\n`));
          } catch {
            /* controller already closed */
          }
        };
        try {
          send({
            type: "reserved",
            runId,
            state: "running",
            taskKind,
            executionContract,
            creditsReserved: COST_CREDITS,
            creditsRemaining: reservationResult.reservation.creditsRemaining,
          });
          const result = await runToolAgent(pet.id, executionGoal, {
            maxSteps,
            onEvent: (e: AgentEvent) => send(e),
            signal: req.signal,
            ...(requiredToolName && requiredToolInput
              ? { requiredToolName, requiredToolInput }
              : {}),
          });
          const settlement = await settle(
            result.trace,
            result.answer,
            result.answerDelivered,
            result.stoppedReason,
            result.completed,
            result.usage.modelCalls,
            result.usage.orchestratorModelCalls,
            result.usage.skillModelCalls,
          );
          send({
            type: "done",
            runId,
            state: "terminal",
            ok: result.completed,
            completed: result.completed,
            goal: cleanGoal,
            taskKind,
            executionContract,
            answer: result.answer,
            steps: result.trace,
            stoppedReason: result.stoppedReason,
            billing: settlement.billing,
            creditsRemaining: settlement.creditsRemaining,
          });
        } catch (e: any) {
          console.error("[agent-loop] runToolAgent (stream) threw:", e?.message);
          try {
            const failedRun = await settleThrownRun();
            send({ type: "error", runId, ok: false, error: "Agent task failed" });
            send({ type: "done", ...failedRun });
          } catch (settlementError: any) {
            console.error("[agent-loop] failed-run settlement failed:", settlementError?.message);
            send({
              type: "error",
              runId,
              ok: false,
              error: "Agent loop outcome pending reconciliation",
              statusUrl: runStatusUrl(pet.id, runId),
            });
          }
        } finally {
          controller.close();
        }
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "private, no-store, no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  }

  // ── Non-streaming JSON path (back-compat with existing clients) ──
  let result;
  try {
    result = await runToolAgent(pet.id, executionGoal, {
      maxSteps,
      signal: req.signal,
      ...(requiredToolName && requiredToolInput
        ? { requiredToolName, requiredToolInput }
        : {}),
    });
  } catch (e: any) {
    console.error("[agent-loop] runToolAgent threw:", e?.message);
    try {
      const receipt = await settleThrownRun();
      return privateAgentJson(
        {
          error: "Agent task failed",
          runId,
          statusUrl: runStatusUrl(pet.id, runId),
          receipt,
        },
        { status: 502, headers: PRIVATE_AGENT_JSON_HEADERS },
      );
    } catch (settlementError: any) {
      console.error("[agent-loop] failed-run settlement failed:", settlementError?.message);
      return privateAgentJson(
        { error: "Agent loop outcome pending reconciliation", runId, statusUrl: runStatusUrl(pet.id, runId) },
        { status: 503 },
      );
    }
  }

  let settlement: { creditsRemaining: number; billing: AgentBilling; run: PublicPetAgentRun };
  try {
    settlement = await settle(
      result.trace,
      result.answer,
      result.answerDelivered,
      result.stoppedReason,
      result.completed,
      result.usage.modelCalls,
      result.usage.orchestratorModelCalls,
      result.usage.skillModelCalls,
    );
  } catch (e: any) {
    console.error("[agent-loop] credit settlement failed:", e?.message);
    return privateAgentJson(
      { error: "Agent run outcome pending reconciliation", runId, statusUrl: runStatusUrl(pet.id, runId) },
      { status: 503 },
    );
  }

  return privateAgentJson(
    {
      runId,
      state: "terminal",
      ok: result.completed,
      completed: result.completed,
      goal: cleanGoal,
      taskKind,
      executionContract,
      answer: result.answer,
      steps: result.trace,
      stoppedReason: result.stoppedReason,
      billing: settlement.billing,
      creditsRemaining: settlement.creditsRemaining,
      createdAt: settlement.run.createdAt,
      startedAt: settlement.run.startedAt,
      terminalAt: settlement.run.terminalAt,
      updatedAt: settlement.run.updatedAt,
    },
    { headers: PRIVATE_AGENT_JSON_HEADERS },
  );
}
