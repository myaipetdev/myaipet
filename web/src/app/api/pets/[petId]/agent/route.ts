/**
 * POST /api/pets/[petId]/agent  — run the plan-and-execute agent loop (FEATURE 2)
 *
 * Body: { goal: string, maxSteps?: number }
 * Returns: { ok, answer, steps: [{thought, skill, input, output, ok}], stoppedReason, creditsRemaining }
 *
 * Owner-auth + step-budget + credit guard:
 *   - requirePetOwner (authz.ts) — only the pet's owner may run a loop (it burns
 *     paid LLM calls on a reasoning model and can invoke real skills).
 *   - maxSteps is clamped server-side (1..MAX_STEPS) regardless of client input.
 *   - A flat credit cost is charged up-front and refunded if the loop never made
 *     a real skill/LLM call (planner died before step 1).
 *
 * Grounding: runAgentLoop lives in web/src/lib/petclaw/agent/plan-execute.ts and
 * calls the REAL executeSkill from pethub.ts over the 18 BUILTIN_SKILLS.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePetOwner } from "@/lib/authz";
import { rateLimit } from "@/lib/rateLimit";
import { sanitizeText } from "@/lib/sanitize";
import { runAgentLoop } from "@/lib/petclaw/agent/plan-execute";

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

  // Credit guard — must have credits before we burn reasoning-model calls.
  const u = await prisma.user.findUnique({ where: { id: user.id }, select: { credits: true } });
  if (!u || u.credits < COST_CREDITS) {
    return NextResponse.json({ error: "Not enough credits", needed: COST_CREDITS }, { status: 402 });
  }

  // Debit up-front (refunded below if the loop did literally no work).
  await prisma.user.update({
    where: { id: user.id },
    data: { credits: { decrement: COST_CREDITS } },
  });

  let result;
  try {
    result = await runAgentLoop({ petId: pet.id, goal: goal.trim(), maxSteps });
  } catch (e: any) {
    // Loop transport blew up entirely — refund and report.
    await prisma.user.update({
      where: { id: user.id },
      data: { credits: { increment: COST_CREDITS } },
    }).catch(() => {});
    console.error("[agent-loop] runAgentLoop threw:", e?.message);
    return NextResponse.json({ error: "Agent loop failed", detail: e?.message }, { status: 502 });
  }

  // Refund if the planner died before any real skill/LLM step executed.
  const didRealWork = result.steps.some((s) => s.skill !== "finish");
  let creditsRemaining = u.credits - COST_CREDITS;
  if (!didRealWork && result.stoppedReason === "planner_error") {
    await prisma.user.update({
      where: { id: user.id },
      data: { credits: { increment: COST_CREDITS } },
    }).catch(() => {});
    creditsRemaining = u.credits;
  }

  // Audit log — reuse the PetAutonomousAction ledger (has a result Json? column).
  await prisma.petAutonomousAction.create({
    data: {
      pet_id: pet.id,
      urge_type: "agent_loop",
      action_taken: `plan_execute:${result.stoppedReason}`,
      prompt_used: goal.trim().slice(0, 2000),
      credits_used: didRealWork ? COST_CREDITS : 0,
      result: {
        stoppedReason: result.stoppedReason,
        stepCount: result.steps.length,
        skills: result.steps.map((s) => s.skill),
        answer: result.answer.slice(0, 1000),
      } as any,
    },
  }).catch((e) => console.error("[agent-loop] action log failed:", e?.message));

  return NextResponse.json({
    ok: true,
    goal: result.goal,
    answer: result.answer,
    steps: result.steps,
    stoppedReason: result.stoppedReason,
    creditsRemaining,
  });
}
