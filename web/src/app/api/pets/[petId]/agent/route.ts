/**
 * POST /api/pets/[petId]/agent  — run the native tool-calling agent loop
 *
 * Body: { runId: UUID, goal: string, maxSteps?: number, confirmCostCredits: 5 }
 * Returns (JSON, default): { runId, ok, completed, goal, answer, steps: [{thought, skill, input, output, ok}], stoppedReason, billing, creditsRemaining }
 * Returns (SSE, when Accept: text/event-stream OR ?stream=1): a stream of
 *   `data: {type:"tool_call"|"tool_result"|"thought"|"error"|"final", ...}` events,
 *   ending with `data: {type:"done", ok, answer, steps, stoppedReason, creditsRemaining}`.
 *
 * Owner-auth + step-budget + credit guard (identical in both modes):
 *   - requirePetOwner (authz.ts) — only the pet's owner may run a loop (it burns
 *     paid LLM calls on a reasoning model and can invoke real skills).
 *   - maxSteps is clamped server-side (1..MAX_STEPS) regardless of client input.
 *   - the owner must explicitly confirm the exact flat cost before reservation.
 *   - A flat credit cost is reserved up-front (ONCE, not per event), then charged
 *     only for a completed direct model answer or completed successful read-only
 *     tool run. Paid-loop skills cannot retain memory or commit side effects.
 *
 * Grounding: runToolAgent lives in web/src/lib/petclaw/agent/tool-agent.ts and
 * calls executeSkill from pethub.ts over the runnable BUILTIN_SKILLS. It returns
 * one of: completed, max_steps, timeout, planner_error.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePetOwner } from "@/lib/authz";
import { rateLimit } from "@/lib/rateLimit";
import { sanitizeText } from "@/lib/sanitize";
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

// Server-enforced ceilings (client cannot exceed these).
const MAX_STEPS = 6;
const DEFAULT_STEPS = 4;
// Flat cost for a loop run (each run can include several reasoning + skill LLM
// calls). Mirrors the credit-debit pattern in /api/pet-date.
const COST_CREDITS = 5;

type AgentBilling = AgentRunBillingReceipt & {
  reason:
    | "completed_with_successful_tool"
    | "completed_with_direct_answer"
    | "run_not_completed"
    | "no_successful_tool"
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
      "Cache-Control": "no-cache, no-transform",
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
  if (auth.error) return auth.error;
  const { user, pet } = auth;

  if (!pet.is_active) {
    return NextResponse.json({ error: "Pet is inactive" }, { status: 404 });
  }

  // Parse only after owner authorization, and cap the bytes actually streamed
  // rather than trusting an optional Content-Length header.
  const parsedBody = await readBoundedJsonBody(req, 4 * 1024);
  if (parsedBody.ok === false) {
    return NextResponse.json(
      { error: parsedBody.reason === "too_large" ? "Request body too large" : "Invalid JSON body" },
      { status: parsedBody.reason === "too_large" ? 413 : 400 },
    );
  }
  if (!parsedBody.value || typeof parsedBody.value !== "object" || Array.isArray(parsedBody.value)) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const body = parsedBody.value as Record<string, unknown>;
  const rawRunId = body.runId;
  const rawGoal = body.goal;
  const rawMaxSteps = body.maxSteps;
  const rawConfirmCostCredits = body.confirmCostCredits;
  if (typeof rawRunId !== "string" || !PET_AGENT_RUN_ID_PATTERN.test(rawRunId)) {
    return NextResponse.json(
      { error: "A client-generated UUID 'runId' is required for paid-run idempotency" },
      { status: 400 },
    );
  }
  if (typeof rawGoal !== "string") {
    return NextResponse.json({ error: "A string 'goal' is required" }, { status: 400 });
  }
  if (rawMaxSteps !== undefined && (typeof rawMaxSteps !== "number" || !Number.isFinite(rawMaxSteps))) {
    return NextResponse.json({ error: "maxSteps must be a finite number" }, { status: 400 });
  }
  if (rawConfirmCostCredits !== COST_CREDITS) {
    return NextResponse.json(
      {
        error: `Explicit confirmation of the ${COST_CREDITS}-credit agent run cost is required`,
        needed: { confirmCostCredits: COST_CREDITS },
      },
      { status: 400 },
    );
  }
  const goal = sanitizeText(rawGoal, 600);
  if (!goal || goal.trim().length < 3) {
    return NextResponse.json({ error: "A 'goal' (>=3 chars) is required" }, { status: 400 });
  }

  // Step budget — clamp regardless of what the client sends.
  const requested = typeof rawMaxSteps === "number" ? Math.floor(rawMaxSteps) : DEFAULT_STEPS;
  const maxSteps = Math.max(1, Math.min(MAX_STEPS, requested));

  const cleanGoal = goal.trim();
  const runId = rawRunId.toLowerCase();
  const wantsStream =
    (req.headers.get("accept") || "").includes("text/event-stream") ||
    new URL(req.url).searchParams.get("stream") === "1";

  // A committed idempotency key is always replayable, even after a lost
  // response pushes the caller over the new-run rate limit.
  const priorRun = await getPetAgentRun(user.id, pet.id, runId);
  if (priorRun) {
    if (priorRun.goal !== cleanGoal || priorRun.maxSteps !== maxSteps) {
      return NextResponse.json(
        { error: "runId is already bound to a different goal or step budget", runId },
        { status: 409 },
      );
    }
    if (wantsStream) return replaySse(priorRun);
    return NextResponse.json(
      { ...priorRun, statusUrl: runStatusUrl(pet.id, runId), replayed: true },
      { status: priorRun.state === "terminal" ? 200 : 202 },
    );
  }

  // Only brand-new paid runs consume the expensive-operation rate limit.
  const rl = rateLimit(req, { key: "agent-loop", limit: 10, windowMs: 60_000 });
  if (!rl.ok) return rl.response;

  // The run ledger's unique owner/pet/runId key, wallet debit, and reservation
  // are one transaction. A duplicate request can only replay or report status.
  const reservationResult = await reservePetAgentRun({
    runId,
    userId: user.id,
    petId: pet.id,
    petName: pet.name,
    goal: cleanGoal,
    maxSteps,
    amount: COST_CREDITS,
  });
  if (reservationResult.kind === "insufficient") {
    return NextResponse.json({ error: "Not enough credits", needed: COST_CREDITS }, { status: 402 });
  }
  if (reservationResult.kind === "unavailable") {
    return NextResponse.json(
      { error: "Pet not found or inactive", code: "pet_unavailable" },
      { status: 404 },
    );
  }
  if (reservationResult.kind === "blocked") {
    return NextResponse.json(
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
      return NextResponse.json(
        { error: "runId is already bound to a different goal or step budget", runId },
        { status: 409 },
      );
    }
    if (wantsStream) return replaySse(reservationResult.run);
    return NextResponse.json(
      {
        ...reservationResult.run,
        statusUrl: runStatusUrl(pet.id, runId),
        replayed: true,
      },
      { status: reservationResult.run.state === "terminal" ? 200 : 202 },
    );
  }
  try {
    await markPetAgentRunRunning(user.id, pet.id, runId);
  } catch (error: any) {
    console.error("[agent-loop] could not mark run as running:", error?.message);
    return NextResponse.json(
      { error: "Agent run pending reconciliation", runId, statusUrl: runStatusUrl(pet.id, runId) },
      { status: 503 },
    );
  }

  // Shared: settle credits + write the audit log once the run completes. A
  // trace entry means only "attempted"; it is never evidence of successful work.
  const settle = async (
    trace: AgentStep[],
    answer: string,
    stoppedReason: AgentStoppedReason,
    completed: boolean,
    modelCalls: number,
    orchestratorModelCalls: number,
    skillModelCalls: number,
  ): Promise<{ creditsRemaining: number; billing: AgentBilling; run: PublicPetAgentRun }> => {
    const successfulToolCalls = trace.filter((step) => step.ok).length;
    const failedToolCalls = trace.length - successfulToolCalls;
    const committedSideEffects = trace.filter((step) => step.sideEffectCommitted).length;
    const completedDirectAnswer = completed && trace.length === 0 && modelCalls > 0;
    const chargeable = completedDirectAnswer
      || (completed && successfulToolCalls > 0);
    const billingReason: AgentBilling["reason"] = completedDirectAnswer
      ? "completed_with_direct_answer"
      : completed && successfulToolCalls > 0
        ? "completed_with_successful_tool"
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
      stoppedReason: "planner_error",
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
          const result = await runToolAgent(pet.id, cleanGoal, {
            maxSteps,
            onEvent: (e: AgentEvent) => send(e),
            signal: req.signal,
          });
          const settlement = await settle(
            result.trace,
            result.answer,
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
            send({ type: "error", runId, ok: false, error: "Agent loop failed", detail: e?.message });
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
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  }

  // ── Non-streaming JSON path (back-compat with existing clients) ──
  let result;
  try {
    result = await runToolAgent(pet.id, cleanGoal, { maxSteps, signal: req.signal });
  } catch (e: any) {
    console.error("[agent-loop] runToolAgent threw:", e?.message);
    try {
      const receipt = await settleThrownRun();
      return NextResponse.json(
        {
          error: "Agent loop failed",
          detail: e?.message,
          runId,
          statusUrl: runStatusUrl(pet.id, runId),
          receipt,
        },
        { status: 502 },
      );
    } catch (settlementError: any) {
      console.error("[agent-loop] failed-run settlement failed:", settlementError?.message);
      return NextResponse.json(
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
      result.stoppedReason,
      result.completed,
      result.usage.modelCalls,
      result.usage.orchestratorModelCalls,
      result.usage.skillModelCalls,
    );
  } catch (e: any) {
    console.error("[agent-loop] credit settlement failed:", e?.message);
    return NextResponse.json(
      { error: "Agent run outcome pending reconciliation", runId, statusUrl: runStatusUrl(pet.id, runId) },
      { status: 503 },
    );
  }

  return NextResponse.json({
    runId,
    state: "terminal",
    ok: result.completed,
    completed: result.completed,
    goal: cleanGoal,
    answer: result.answer,
    steps: result.trace,
    stoppedReason: result.stoppedReason,
    billing: settlement.billing,
    creditsRemaining: settlement.creditsRemaining,
    createdAt: settlement.run.createdAt,
    startedAt: settlement.run.startedAt,
    terminalAt: settlement.run.terminalAt,
    updatedAt: settlement.run.updatedAt,
  });
}
