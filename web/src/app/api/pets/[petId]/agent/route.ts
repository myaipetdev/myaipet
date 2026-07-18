/**
 * POST /api/pets/[petId]/agent  — run the native tool-calling agent loop
 *
 * Body: { goal: string, maxSteps?: number }
 * Returns (JSON, default): { ok, goal, answer, steps: [{thought, skill, input, output, ok}], stoppedReason, creditsRemaining }
 * Returns (SSE, when Accept: text/event-stream OR ?stream=1): a stream of
 *   `data: {type:"tool_call"|"tool_result"|"thought"|"error"|"final", ...}` events,
 *   ending with `data: {type:"done", ok, answer, steps, stoppedReason, creditsRemaining}`.
 *
 * Owner-auth + step-budget + credit guard (identical in both modes):
 *   - requirePetOwner (authz.ts) — only the pet's owner may run a loop (it burns
 *     paid LLM calls on a reasoning model and can invoke real skills).
 *   - maxSteps is clamped server-side (1..MAX_STEPS) regardless of client input.
 *   - A flat credit cost is charged up-front (ONCE, not per event) and refunded if
 *     the loop never executed a real skill call.
 *
 * Grounding: runToolAgent lives in web/src/lib/petclaw/agent/tool-agent.ts and
 * calls the REAL executeSkill from pethub.ts over the runnable BUILTIN_SKILLS.
 * The legacy runAgentLoop (plan-execute.ts) is retained as a fallback.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePetOwner } from "@/lib/authz";
import { rateLimit } from "@/lib/rateLimit";
import { sanitizeText } from "@/lib/sanitize";
import { runToolAgent, type AgentEvent, type AgentStep } from "@/lib/petclaw/agent/tool-agent";
import {
  commitAgentCredits,
  refundAgentCreditsOnce,
  reserveAgentCredits,
} from "@/lib/agentCreditReservation";

// Server-enforced ceilings (client cannot exceed these).
const MAX_STEPS = 6;
const DEFAULT_STEPS = 4;
// Flat cost for a loop run (each run can fan out to several reasoning + skill
// LLM calls). Mirrors the credit-debit pattern in /api/pet-date.
const COST_CREDITS = 5;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ petId: string }> },
) {
  // Looping is expensive — tight rate limit per caller.
  const rl = rateLimit(req, { key: "agent-loop", limit: 10, windowMs: 60_000 });
  if (!rl.ok) return rl.response;

  const { petId } = await params;
  const pid = Number(petId);

  // Owner auth — returns { user, pet } or a ready-to-return error response.
  const auth = await requirePetOwner(req, pid);
  if (auth.error) return auth.error;
  const { user, pet } = auth;

  if (!pet.is_active) {
    return NextResponse.json({ error: "Pet is inactive" }, { status: 404 });
  }

  // Parse + validate the goal.
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const goal = sanitizeText(body?.goal, 600);
  if (!goal || goal.trim().length < 3) {
    return NextResponse.json({ error: "A 'goal' (>=3 chars) is required" }, { status: 400 });
  }

  // Step budget — clamp regardless of what the client sends.
  const requested = Number.isFinite(body?.maxSteps) ? Math.floor(body.maxSteps) : DEFAULT_STEPS;
  const maxSteps = Math.max(1, Math.min(MAX_STEPS, requested));

  // Atomically reserve before any reasoning-model call. The guarded decrement
  // cannot take credits negative even when several loops start concurrently.
  const reservation = await reserveAgentCredits(user.id, pet.id, COST_CREDITS);
  if (!reservation) {
    return NextResponse.json({ error: "Not enough credits", needed: COST_CREDITS }, { status: 402 });
  }

  // Durable terminal transition: retries or overlapping error paths can call
  // this repeatedly, but only reserved → refunded increments the wallet.
  const refund = () => refundAgentCreditsOnce(reservation);

  // Shared: settle credits + write the audit log once the run completes.
  // `didRealWork` = at least one skill call was executed (trace non-empty).
  const settle = async (trace: AgentStep[], answer: string): Promise<number> => {
    const didRealWork = trace.length > 0;
    const creditsRemaining = didRealWork
      ? await commitAgentCredits(reservation)
      : await refund();
    await prisma.petAutonomousAction
      .create({
        data: {
          pet_id: pet.id,
          urge_type: "agent_loop",
          action_taken: `tool_agent:${didRealWork ? "worked" : "noop"}`,
          prompt_used: goal.trim().slice(0, 2000),
          credits_used: didRealWork ? COST_CREDITS : 0,
          result: {
            stepCount: trace.length,
            skills: trace.map((s) => s.skill),
            answer: answer.slice(0, 1000),
          } as any,
        },
      })
      .catch((e) => console.error("[agent-loop] action log failed:", e?.message));
    return creditsRemaining;
  };

  const cleanGoal = goal.trim();
  const wantsStream =
    (req.headers.get("accept") || "").includes("text/event-stream") ||
    new URL(req.url).searchParams.get("stream") === "1";

  // ── SSE streaming path ──
  if (wantsStream) {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let didRealWork = false;
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
          });
          didRealWork = result.trace.length > 0;
          const creditsRemaining = await settle(result.trace, result.answer);
          send({
            type: "done",
            ok: true,
            goal: cleanGoal,
            answer: result.answer,
            steps: result.trace,
            stoppedReason: "finished",
            creditsRemaining,
          });
        } catch (e: any) {
          // Total failure — refund and surface an error event (no partial charge).
          if (!didRealWork) {
            await refund().catch((refundError: unknown) =>
              console.error("[agent-loop] durable refund failed:", refundError),
            );
          }
          console.error("[agent-loop] runToolAgent (stream) threw:", e?.message);
          send({ type: "error", ok: false, error: "Agent loop failed", detail: e?.message });
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
    result = await runToolAgent(pet.id, cleanGoal, { maxSteps });
  } catch (e: any) {
    await refund().catch((refundError: unknown) =>
      console.error("[agent-loop] durable refund failed:", refundError),
    );
    console.error("[agent-loop] runToolAgent threw:", e?.message);
    return NextResponse.json({ error: "Agent loop failed", detail: e?.message }, { status: 502 });
  }

  let creditsRemaining: number;
  try {
    creditsRemaining = await settle(result.trace, result.answer);
  } catch (e: any) {
    // A no-op should still be refunded if its first settlement attempt hit a
    // transient DB error. The durable state transition keeps this retry exact-once.
    if (result.trace.length === 0) {
      await refund().catch((refundError: unknown) =>
        console.error("[agent-loop] durable refund retry failed:", refundError),
      );
    }
    console.error("[agent-loop] credit settlement failed:", e?.message);
    return NextResponse.json({ error: "Agent credit settlement failed" }, { status: 503 });
  }

  return NextResponse.json({
    ok: true,
    goal: cleanGoal,
    answer: result.answer,
    steps: result.trace,
    stoppedReason: "finished",
    creditsRemaining,
  });
}
