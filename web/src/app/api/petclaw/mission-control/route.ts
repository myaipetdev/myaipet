/**
 * GET /api/petclaw/mission-control?petId=N — Agent Office aggregate.
 *
 * The productized port of the Hermes "Mission Control" native dashboard. It reads
 * ONLY real PetClaw state (no fabrication; honest zeros/empties) and shapes it into
 * the five surfaces the Office UI renders:
 *   - pillars   : the 5 Hermes pillars (Soul / Memory / User / Skills / Crons)
 *   - kanban    : authoritative PetAgentRun reserved/running rows plus bounded
 *                 terminal receipts. PetAutonomousAction remains legacy
 *                 completion-only history and never invents live work.
 *   - roster    : the four exact typed Office capabilities with run counts
 *                 from authoritative receipts/legacy action history, plus
 *                 non-executable VIGIL metadata capabilities.
 *   - schedules : a read-only routine catalog, promoted to "observed" only when
 *                 a real last/next timestamp exists.
 *
 * Owner-auth via requirePetOwner(?petId). Rate-limited, try/catch, cheap indexed reads
 * (persona findUnique + bounded indexed activity/run-ledger reads).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePetOwner } from "@/lib/authz";
import { rateLimit } from "@/lib/rateLimit";
import { BUILTIN_SKILLS } from "@/lib/petclaw/pethub";
import { containsHangul } from "@/lib/generatedLanguage";
import { isValidTerminalPaidAgentRunBilling } from "@/lib/petclaw/agent-run-billing";
import {
  agentOfficeTaskKindFromExecutionContract,
  containsStrongAgentOfficeSecret,
} from "@/lib/petclaw/agent/office-task-contract";

const MEMORY_CAP = 40;
const USER_CAP = 25;
const ACTIVE_RUN_CAP = 4;
const TERMINAL_RUN_CAP = 12;
const DONE_CAP = 24;
const RUN_ANSWER_CAP = 8_000;
const RUN_STEP_CAP = 8;

const AGENT_RUN_SELECT = {
  run_id: true,
  goal: true,
  max_steps: true,
  execution_contract: true,
  state: true,
  completed: true,
  answer: true,
  steps: true,
  stopped_reason: true,
  billing: true,
  credits_remaining: true,
  created_at: true,
  started_at: true,
  terminal_at: true,
  updated_at: true,
} as const;

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

// A run that executed no real skill call (settle() logs ":noop" + stepCount 0).
function isNoop(action: { action_taken: string; result: any }): boolean {
  if (typeof action.action_taken === "string" && action.action_taken.endsWith(":noop")) return true;
  const r = action.result || {};
  return r && typeof r === "object" && r.stepCount === 0;
}

function titleFromGoal(goal: string | null | undefined, fallback: string): string {
  const g = (goal || "").trim();
  if (!g) return fallback;
  return g.length > 80 ? g.slice(0, 80) + "…" : g;
}

function boundedText(value: unknown, cap: number): string {
  if (typeof value !== "string") return "";
  return value.length > cap ? `${value.slice(0, cap)}…` : value;
}

function publicRecallEvidence(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const output = value as Record<string, unknown>;
  const rawCount = typeof output.count === "number" && Number.isFinite(output.count)
    ? Math.max(0, Math.floor(output.count))
    : 0;
  const rows = [
    ...(Array.isArray(output.relevant) ? output.relevant : []),
    ...(Array.isArray(output.profile) ? output.profile : []),
  ];
  const matches = rows.slice(0, 8).flatMap((row) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) return [];
    const record = row as Record<string, unknown>;
    const rawKey = boundedText(record.key, 80) || "retained record";
    const rawContent = boundedText(record.content, 240);
    const rawCategory = boundedText(record.category, 40);
    const rawSource = boundedText(record.source, 40);
    const rawTimestamp = boundedText(record.createdAt ?? record.updatedAt, 40);
    return [{
      key: containsStrongAgentOfficeSecret(rawKey) ? "retained record" : rawKey,
      category: rawCategory && !containsStrongAgentOfficeSecret(rawCategory)
        ? rawCategory
        : "retained context",
      source: rawSource && !containsStrongAgentOfficeSecret(rawSource)
        ? rawSource
        : "private memory",
      timestamp: rawTimestamp && !containsStrongAgentOfficeSecret(rawTimestamp)
        ? rawTimestamp
        : null,
      excerpt: rawContent && !containsStrongAgentOfficeSecret(rawContent)
        ? rawContent
        : null,
    }];
  });
  return { count: Math.max(rawCount, matches.length), matches };
}

function publicStepSummaries(value: unknown): Array<{
  skill: string;
  ok: boolean;
  evidence?: ReturnType<typeof publicRecallEvidence>;
}> {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, RUN_STEP_CAP)
    .flatMap((step) => {
      if (!step || typeof step !== "object" || Array.isArray(step)) return [];
      const record = step as Record<string, unknown>;
      const skill = boundedText(record.skill, 80);
      return skill ? [{
        skill,
        ok: record.ok === true,
        evidence: skill === "recall_memory" && record.ok === true
          ? publicRecallEvidence(record.output)
          : undefined,
      }] : [];
    });
}

function publicBilling(value: unknown) {
  if (!isValidTerminalPaidAgentRunBilling(value)) return null;
  const billing = value;
  const finiteInt = (field: string): number | null => {
    const n = billing[field];
    return typeof n === "number" && Number.isFinite(n)
      ? Math.max(0, Math.floor(n))
      : null;
  };
  return {
    outcome: billing.outcome,
    creditsCharged: finiteInt("creditsCharged") ?? 0,
    reason: boundedText(billing.reason, 80) || "unknown",
    successfulToolCalls: finiteInt("successfulToolCalls") ?? 0,
    failedToolCalls: finiteInt("failedToolCalls") ?? 0,
    committedSideEffects: finiteInt("committedSideEffects") ?? 0,
    usageKnown: billing.usageKnown === true,
    modelCalls: finiteInt("modelCalls"),
    orchestratorModelCalls: finiteInt("orchestratorModelCalls"),
    skillModelCalls: finiteInt("skillModelCalls"),
  };
}

function publicTerminalRun(run: any, fullReceipt = false) {
  const billing = publicBilling(run.billing);
  const completed = run.completed === true;
  const stoppedReason = boundedText(run.stopped_reason, 40) || "planner_error";
  const readableStop = stoppedReason.replaceAll("_", " ");
  const detail = completed && billing?.outcome === "charged"
    ? `Completed · ${billing.creditsCharged} credits charged.`
    : completed && billing?.outcome === "refunded"
      ? "Completed without a chargeable deliverable · credits refunded."
      : !completed && billing?.outcome === "refunded"
        ? `Stopped · ${readableStop} · credits refunded.`
        : !completed
          ? `Stopped · ${readableStop} · settlement unavailable.`
          : "Completed · settlement unavailable.";
  return {
    id: `run:${run.run_id}`,
    runId: run.run_id,
    kind: "agent-run" as const,
    state: "terminal" as const,
    title: titleFromGoal(run.goal, "PetClaw agent run"),
    goal: boundedText(run.goal, fullReceipt ? 2_000 : 500),
    executionContract: boundedText(run.execution_contract, 120),
    taskKind:
      agentOfficeTaskKindFromExecutionContract(run.execution_contract || "")
      || undefined,
    skill: "PetClaw agent",
    detail: detail,
    completed: completed,
    answer: fullReceipt ? boundedText(run.answer, RUN_ANSWER_CAP) : "",
    steps: fullReceipt ? publicStepSummaries(run.steps) : [],
    stoppedReason: stoppedReason,
    billing,
    credits: billing?.creditsCharged ?? 0,
    creditsRemaining:
      typeof run.credits_remaining === "number" ? run.credits_remaining : null,
    at: run.terminal_at || run.updated_at,
    createdAt: run.created_at,
    startedAt: run.started_at,
    terminalAt: run.terminal_at,
  };
}

function publicActiveRun(run: any) {
  const queued = run.state === "reserved";
  return {
    id: `run:${run.run_id}`,
    runId: run.run_id,
    kind: "agent-run" as const,
    state: queued ? "reserved" as const : "running" as const,
    title: titleFromGoal(run.goal, "PetClaw agent run"),
    goal: boundedText(run.goal, 500),
    executionContract: boundedText(run.execution_contract, 120),
    taskKind:
      agentOfficeTaskKindFromExecutionContract(run.execution_contract || "")
      || undefined,
    skill: "PetClaw agent",
    detail: queued
      ? "Credit reservation recorded; waiting for the agent loop to start."
      : "The persisted agent ledger reports this run as active.",
    maxSteps: Math.max(1, Math.min(8, Number(run.max_steps) || 1)),
    at: run.updated_at,
    createdAt: run.created_at,
    startedAt: run.started_at,
  };
}

export async function GET(req: NextRequest) {
  const rl = rateLimit(req, { key: "mission-control", limit: 60, windowMs: 60_000 });
  if (!rl.ok) return rl.response;

  const petId = Number(req.nextUrl.searchParams.get("petId"));
  const auth = await requirePetOwner(req, petId);
  if (auth.error) return auth.error;
  const { pet, user } = auth;

  try {
    const mods = (pet.personality_modifiers as Record<string, any>) || {};
    const memories: any[] = (Array.isArray(mods.persistent_memories) ? mods.persistent_memories : [])
      .filter((memory: any) => !containsHangul(memory?.content));
    const userProfile: any[] = Array.isArray(mods.user_profile) ? mods.user_profile : [];
    const learnedPatterns: any[] = Array.isArray(mods.learned_patterns) ? mods.learned_patterns : [];
    const installedSkills: any[] = Array.isArray(mods.installed_skills) ? mods.installed_skills : [];
    const bondReflections: any[] = Array.isArray(mods.bond_reflections) ? mods.bond_reflections : [];

    const dayStart = startOfToday();

    // ── Real activity + persona reads (cheap, indexed) ──
    const [
      persona,
      todaysActions,
      todaysGenerations,
      activeAgentRuns,
      terminalAgentRuns,
    ] = await Promise.all([
      prisma.petPersona.findUnique({ where: { pet_id: pet.id } }).catch(() => null),
      prisma.petAutonomousAction.findMany({
        where: { pet_id: pet.id, created_at: { gte: dayStart } },
        orderBy: { created_at: "desc" },
        take: 60,
      }),
      prisma.generation.findMany({
        where: {
          user_id: user.id,
          pet_id: pet.id,
          status: "completed",
          completed_at: { gte: dayStart },
        },
        orderBy: { completed_at: "desc" },
        take: 10,
        select: { id: true, prompt: true, completed_at: true, credits_charged: true },
      }).catch(() => [] as any[]),
      prisma.petAgentRun.findMany({
        where: {
          user_id: user.id,
          pet_id: pet.id,
          state: { in: ["reserved", "running"] },
        },
        orderBy: { updated_at: "desc" },
        take: ACTIVE_RUN_CAP,
        select: AGENT_RUN_SELECT,
      }),
      prisma.petAgentRun.findMany({
        where: { user_id: user.id, pet_id: pet.id, state: "terminal" },
        orderBy: { updated_at: "desc" },
        take: TERMINAL_RUN_CAP,
        select: AGENT_RUN_SELECT,
      }),
    ]);

    // ── Kanban ──
    // Only the owner-scoped paid-run ledger can place work in current-state
    // buckets. This makes refreshes and other tabs agree with the server rather
    // than relying on one tab's best-effort SSE state.
    const pending = activeAgentRuns
      .filter((run) => run.state === "reserved")
      .map(publicActiveRun);
    const working = activeAgentRuns
      .filter((run) => run.state === "running")
      .map(publicActiveRun);
    const blocked: never[] = [];

    // A PetAgentRun receipt is the authority for paid agent output, settlement,
    // stop reason, and trace. Suppress its duplicate PetAutonomousAction audit
    // row when ledger receipts exist.
    // The seven-second aggregate stays summary-only. A user explicitly opening
    // a DONE row fetches that one full owner-scoped receipt through the existing
    // status GET; it never replays the task or creates a reservation.
    const terminalDone = terminalAgentRuns.map((run) => publicTerminalRun(run));
    const doneActions = todaysActions
      .filter((action) =>
        terminalAgentRuns.length === 0 || !action.action_taken.startsWith("tool_agent:"))
      .map((a) => {
      const r = (a.result as any) || {};
      const skills: string[] = Array.isArray(r.skills) ? r.skills : [];
      const noop = isNoop(a);
      return {
        id: a.id,
        title: titleFromGoal(a.prompt_used, a.action_taken),
        skill: noop ? "no skill" : skills.find((s) => s && s !== "finish") || a.urge_type,
        detail: noop ? "No skill executed — credits refunded." : undefined,
        at: a.created_at,
        credits: noop ? 0 : a.credits_used || 0,
      };
      });
    const doneGenerations = (todaysGenerations as any[]).map((g) => ({
      id: -g.id, // negative to avoid colliding with action ids in React keys
      title: titleFromGoal(g.prompt, "Generated a creation"),
      skill: "image-gen",
      at: g.completed_at,
      credits: g.credits_charged || 0,
    }));
    const done = [...terminalDone, ...doneActions, ...doneGenerations]
      .sort((x, y) => new Date(y.at as any).getTime() - new Date(x.at as any).getTime())
      .slice(0, DONE_CAP);
    const latestAgentRun = terminalAgentRuns[0]
      ? publicTerminalRun(terminalAgentRuns[0], true)
      : null;

    // ── Roster: skills-as-staff run counts from result.skills frequency ──
    const skillFreq: Record<string, number> = {};
    const skillLastAt: Record<string, string> = {};
    for (const a of todaysActions) {
      if (a.action_taken.startsWith("tool_agent:")) continue;
      const r = (a.result as any) || {};
      const skills: string[] = Array.isArray(r.skills) ? r.skills : [];
      for (const s of skills) {
        if (!s || s === "finish") continue;
        skillFreq[s] = (skillFreq[s] || 0) + 1;
        if (!skillLastAt[s]) skillLastAt[s] = new Date(a.created_at).toISOString();
      }
    }
    for (const run of terminalAgentRuns) {
      if (!run.terminal_at || run.terminal_at < dayStart) continue;
      const steps = Array.isArray(run.steps) ? run.steps : [];
      for (const rawStep of steps.slice(0, RUN_STEP_CAP)) {
        const skill =
          rawStep && typeof rawStep === "object" && typeof (rawStep as any).skill === "string"
            ? (rawStep as any).skill
            : "";
        if (!skill || skill === "finish") continue;
        skillFreq[skill] = (skillFreq[skill] || 0) + 1;
        if (!skillLastAt[skill]) {
          skillLastAt[skill] = new Date(run.terminal_at).toISOString();
        }
      }
    }
    // Typed v1 does not let a model choose from the public skill catalog. These
    // are the only four capabilities the Office composer can dispatch.
    const officeCapabilities = [
      { id: "recall_memory", name: "Owner Memory Recall", role: "Recall · owner-private retained context" },
      { id: "office-summarize", name: "Decision Brief", role: "Summarize · memory-isolated supplied text" },
      { id: "office-review", name: "Copy Review", role: "Review · memory-isolated supplied text" },
      { id: "office-draft", name: "Text Draft", role: "Draft · memory-isolated supplied brief" },
    ];
    const skillStaff = officeCapabilities.map((capability) => ({
      ...capability,
      kind: "skill" as const,
      installed: true,
      core: true,
      eligible: pet.is_active,
      availableInOffice: pet.is_active,
      mode: pet.is_active ? "core-in-process" as const : "locked" as const,
      blockedReason: pet.is_active ? null : "This pet is inactive.",
      endpoint: null,
      status: "idle" as const,
      runs: skillFreq[capability.id] || 0,
      metricLabel: "RUNS",
      lastAt: skillLastAt[capability.id] || null,
    }));

    // VIGIL capabilities. Learned patterns remain retained metadata; they are
    // deliberately not inserted into the executable skill roster.
    const latestMemAt = memories
      .map((m: any) => m.updatedAt || m.createdAt)
      .filter(Boolean)
      .sort()
      .pop() || null;
    const avgLearnedRate =
      learnedPatterns.length > 0
        ? Math.round(
            (learnedPatterns.reduce((s: number, p: any) => s + (p.successRate || 0), 0) /
              learnedPatterns.length) *
              100,
          )
        : undefined;
    const vigilStaff = [
      {
        id: "vigil:memory-ledger",
        name: "Memory Ledger",
        kind: "vigil" as const,
        role: "curates MEMORY.md / USER.md",
        installed: true,
        core: false,
        eligible: true,
        availableInOffice: false,
        mode: "read-only",
        blockedReason: "Inspectable retained state, not an Agent Office dispatch skill.",
        status: "idle" as const,
        runs: memories.length + userProfile.length,
        metricLabel: "RETAINED RECORDS",
        lastAt: latestMemAt,
      },
      {
        id: "vigil:self-reflect",
        name: "Self-Reflect",
        kind: "vigil" as const,
        role: "bond-loop relationship notes",
        installed: true,
        core: false,
        eligible: true,
        availableInOffice: false,
        mode: "read-only",
        blockedReason: "Inspectable retained state, not an Agent Office dispatch skill.",
        status: "idle" as const,
        runs: bondReflections.length,
        metricLabel: "REFLECTIONS",
        lastAt: null,
      },
      {
        id: "vigil:feedback",
        name: "Feedback",
        kind: "vigil" as const,
        role: "best-effort signal from a later owner reaction",
        installed: true,
        core: false,
        eligible: true,
        availableInOffice: false,
        mode: "read-only",
        blockedReason: "Inspectable retained state, not an Agent Office dispatch skill.",
        status: "idle" as const,
        runs: 0,
        metricLabel: "REACTION SIGNALS",
        lastAt: null,
      },
      {
        id: "vigil:self-learn",
        name: "Pattern Retention",
        kind: "vigil" as const,
        role: "retains recurring-topic metadata; not executable code",
        installed: true,
        core: false,
        eligible: true,
        availableInOffice: false,
        mode: "read-only",
        blockedReason: "Retained metadata is not executable code.",
        status: "idle" as const,
        runs: learnedPatterns.length,
        metricLabel: "RETAINED PATTERNS",
        successRate: avgLearnedRate,
        lastAt: null,
      },
      {
        id: "vigil:chorus",
        name: "Chorus",
        kind: "vigil" as const,
        role: "optional best-of-N selection; disabled by default",
        installed: true,
        core: false,
        eligible: false,
        availableInOffice: false,
        mode: "disabled",
        blockedReason: "Disabled by default and not available as an Office dispatch skill.",
        status: "idle" as const,
        runs: 0,
        metricLabel: "SELECTIONS",
        lastAt: null,
      },
    ];

    const roster = [...skillStaff, ...vigilStaff];

    // ── Schedules: read-only catalog + an observed timestamp when one exists ──
    const embeddedCount = memories.filter((m: any) => m.embedding).length;
    const schedules = [
      {
        id: "daydream",
        name: "Daydream",
        cadence: "Idle heartbeat",
        lastRun: pet.last_dream_at || null,
        nextRun: null,
        desc: "Reflects during idle time and writes a dream-journal entry.",
      },
      {
        id: "daydream-to-video",
        name: "Dream → Video",
        cadence: "After a daydream",
        lastRun: null,
        nextRun: null,
        desc: "Turns a fresh daydream into a short generated clip.",
      },
      {
        id: "embed-memories",
        name: "Embed Memories",
        cadence: "Hourly",
        lastRun: null,
        nextRun: null,
        desc:
          embeddedCount > 0
            ? `${embeddedCount} memories embedded for semantic recall.`
            : "Backfills embeddings for semantic memory recall (owner key needed).",
      },
      {
        id: "season-close",
        name: "Season Close",
        cadence: "End of season",
        lastRun: null,
        nextRun: null,
        desc: "Settles season points and rolls the leaderboard at season end.",
      },
    ].map((routine) => {
      const observed = !!routine.lastRun || !!routine.nextRun;
      return {
        ...routine,
        source: observed ? "observed" as const : "catalog" as const,
        mode: observed ? "observed-read-only" as const : "catalog-read-only" as const,
        readOnly: true,
        blockedReason: observed
          ? "Agent Office reports recorded timing; routine controls live elsewhere."
          : "Catalog description only; no persisted next or last execution exists.",
      };
    });
    const observedRoutineCount = schedules.filter(
      (routine) => routine.mode === "observed-read-only",
    ).length;

    // ── Pillars ──
    const personaSet = !!persona;
    const pillars = {
      soul: {
        set: personaSet,
        persona: pet.personality_type,
        personaVersion: persona?.persona_version ?? null,
        configuredAt: persona?.created_at ?? null,
        updatedAt: persona?.updated_at ?? null,
      },
      memory: {
        count: memories.length,
        cap: MEMORY_CAP,
        lastFact: memories.length ? String(memories[memories.length - 1]?.content || "") : null,
        updatedAt: latestMemAt,
      },
      user: {
        count: userProfile.length,
        cap: USER_CAP,
      },
      skills: {
        installed: installedSkills.length,
        // Learned-pattern rows are retained metadata, not executable skills.
        learned: 0,
        total: BUILTIN_SKILLS.length,
      },
      crons: {
        catalogCount: schedules.length,
        observedCount: observedRoutineCount,
        nextLabel: observedRoutineCount > 0
          ? `${observedRoutineCount} with recorded timing`
          : "catalog only · no recorded timing",
      },
    };

    return NextResponse.json(
      {
        pet: { id: pet.id, name: pet.name, level: pet.level },
        pillars,
        kanban: { pending, working, blocked, done },
        latestAgentRun,
        roster,
        schedules,
        generatedAt: new Date().toISOString(),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e: any) {
    console.error("[mission-control] failed:", e?.message);
    return NextResponse.json(
      { error: "Failed to build mission control" },
      { status: 500, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
