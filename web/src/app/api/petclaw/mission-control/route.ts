/**
 * GET /api/petclaw/mission-control?petId=N — Agent Office aggregate.
 *
 * The productized port of the Hermes "Mission Control" native dashboard. It reads
 * ONLY real PetClaw state (no fabrication; honest zeros/empties) and shapes it into
 * the five surfaces the Office UI renders:
 *   - pillars   : the 5 Hermes pillars (Soul / Memory / User / Skills / Crons)
 *   - kanban    : Pending / Working / Blocked / Done-today, sourced from
 *                 PetAutonomousAction rows (the real agent-activity log) + today's
 *                 completed generations.
 *   - roster    : BUILTIN_SKILLS + learned patterns as "staff", with run counts
 *                 derived from PetAutonomousAction.result.skills frequency, plus the
 *                 VIGIL memory capabilities as an inspectable roster.
 *   - schedules : the 4 cron routines with a human cadence + best-effort last run.
 *
 * Owner-auth via requirePetOwner(?petId). Rate-limited, try/catch, cheap indexed reads
 * (persona findUnique + ≤60 today's actions + ≤10 today's generations).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePetOwner } from "@/lib/authz";
import { rateLimit } from "@/lib/rateLimit";
import { BUILTIN_SKILLS } from "@/lib/petclaw/pethub";
import { containsHangul } from "@/lib/generatedLanguage";

// A DB row is "recently working" if it landed inside this window. Autonomous
// actions are logged on completion, so this reads as "the pet was just active".
const WORKING_WINDOW_MS = 5 * 60 * 1000;
const MEMORY_CAP = 40;
const USER_CAP = 25;

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

function relLabel(from: Date | null | undefined): string {
  if (!from) return "never";
  const s = Math.max(0, Math.floor((Date.now() - new Date(from).getTime()) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function titleFromGoal(goal: string | null | undefined, fallback: string): string {
  const g = (goal || "").trim();
  if (!g) return fallback;
  return g.length > 80 ? g.slice(0, 80) + "…" : g;
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
    const now = Date.now();

    // ── Real activity + persona reads (cheap, indexed) ──
    const [persona, todaysActions, todaysGenerations, agentSchedule] = await Promise.all([
      prisma.petPersona.findUnique({ where: { pet_id: pet.id } }).catch(() => null),
      prisma.petAutonomousAction.findMany({
        where: { pet_id: pet.id, created_at: { gte: dayStart } },
        orderBy: { created_at: "desc" },
        take: 60,
      }),
      prisma.generation.findMany({
        where: { user_id: user.id, status: "completed", completed_at: { gte: dayStart } },
        orderBy: { completed_at: "desc" },
        take: 10,
        select: { id: true, prompt: true, completed_at: true, credits_charged: true },
      }).catch(() => [] as any[]),
      prisma.petAgentSchedule.findUnique({ where: { pet_id: pet.id } }).catch(() => null),
    ]);

    // ── Kanban ──
    const workingRows = todaysActions.filter(
      (a) => !isNoop(a) && now - new Date(a.created_at).getTime() < WORKING_WINDOW_MS,
    );
    const workingIds = new Set(workingRows.map((a) => a.id));
    const blockedRows = todaysActions.filter((a) => isNoop(a));
    const doneRows = todaysActions.filter((a) => !isNoop(a) && !workingIds.has(a.id));

    const working = workingRows.map((a) => {
      const r = (a.result as any) || {};
      const skills: string[] = Array.isArray(r.skills) ? r.skills : [];
      return {
        id: a.id,
        title: titleFromGoal(a.prompt_used, "Working…"),
        skill: skills.find((s) => s && s !== "finish") || a.urge_type,
        startedAt: a.created_at,
        detail: `${r.stepCount ?? skills.length} step${(r.stepCount ?? skills.length) === 1 ? "" : "s"} · ${relLabel(a.created_at)}`,
      };
    });

    const doneActions = doneRows.map((a) => {
      const r = (a.result as any) || {};
      const skills: string[] = Array.isArray(r.skills) ? r.skills : [];
      return {
        id: a.id,
        title: titleFromGoal(a.prompt_used, a.action_taken),
        skill: skills.find((s) => s && s !== "finish") || a.urge_type,
        at: a.created_at,
        credits: a.credits_used || 0,
      };
    });
    const doneGenerations = (todaysGenerations as any[]).map((g) => ({
      id: -g.id, // negative to avoid colliding with action ids in React keys
      title: titleFromGoal(g.prompt, "Generated a creation"),
      skill: "image-gen",
      at: g.completed_at,
      credits: g.credits_charged || 0,
    }));
    const done = [...doneActions, ...doneGenerations]
      .sort((x, y) => new Date(y.at as any).getTime() - new Date(x.at as any).getTime())
      .slice(0, 24);

    const blocked = blockedRows.map((a) => ({
      id: a.id,
      title: titleFromGoal(a.prompt_used, "Run finished with no action"),
      reason: "No skill executed — the loop reasoned but called no tool (refunded).",
      at: a.created_at,
    }));

    // Pending = routines due + a couple of honest high-value suggestions.
    const pending: { id: string; title: string; kind: string; detail: string }[] = [];
    if (memories.length >= Math.floor(MEMORY_CAP * 0.8)) {
      pending.push({
        id: "consolidate-memory",
        title: "Consolidate memory ledger",
        kind: "routine",
        detail: `${memories.length}/${MEMORY_CAP} entries — near cap, ready to compress.`,
      });
    }
    const dreamToday = pet.last_dream_at && new Date(pet.last_dream_at).getTime() >= dayStart.getTime();
    if (!dreamToday) {
      pending.push({
        id: "daydream",
        title: "Daydream",
        kind: "routine",
        detail: "No daydream logged today — idle-time reflection is available.",
      });
    }
    if (todaysActions.length === 0) {
      pending.push({
        id: "give-goal",
        title: "Awaiting a goal",
        kind: "dispatch",
        detail: "No agent runs yet today. Dispatch one from the bar below.",
      });
    }
    if (todaysGenerations.length === 0) {
      pending.push({
        id: "make-selfie",
        title: "Create today's selfie",
        kind: "creative",
        detail: "No creation today — a Pet Selfie run is available.",
      });
    }

    // ── Roster: skills-as-staff run counts from result.skills frequency ──
    const skillFreq: Record<string, number> = {};
    const skillLastAt: Record<string, string> = {};
    for (const a of todaysActions) {
      const r = (a.result as any) || {};
      const skills: string[] = Array.isArray(r.skills) ? r.skills : [];
      for (const s of skills) {
        if (!s || s === "finish") continue;
        skillFreq[s] = (skillFreq[s] || 0) + 1;
        if (!skillLastAt[s]) skillLastAt[s] = new Date(a.created_at).toISOString();
      }
    }
    const activeSkillSet = new Set<string>();
    for (const a of workingRows) {
      const r = (a.result as any) || {};
      for (const s of (Array.isArray(r.skills) ? r.skills : [])) if (s && s !== "finish") activeSkillSet.add(s);
    }
    const installedSet = new Set(installedSkills.map((s: any) => s.skillId));

    const skillStaff = BUILTIN_SKILLS.map((sk) => ({
      id: sk.id,
      name: sk.name,
      kind: "skill" as const,
      role: sk.category,
      installed: installedSet.has(sk.id),
      status: (activeSkillSet.has(sk.id) ? "active" : "idle") as "active" | "idle",
      runs: skillFreq[sk.id] || 0,
      lastAt: skillLastAt[sk.id] || null,
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
        status: "idle" as const,
        runs: memories.length + userProfile.length,
        lastAt: latestMemAt,
      },
      {
        id: "vigil:self-reflect",
        name: "Self-Reflect",
        kind: "vigil" as const,
        role: "bond-loop relationship notes",
        installed: true,
        status: "idle" as const,
        runs: bondReflections.length,
        lastAt: null,
      },
      {
        id: "vigil:feedback",
        name: "Feedback",
        kind: "vigil" as const,
        role: "best-effort signal from a later owner reaction",
        installed: true,
        status: "idle" as const,
        runs: 0,
        lastAt: null,
      },
      {
        id: "vigil:self-learn",
        name: "Pattern Retention",
        kind: "vigil" as const,
        role: "retains recurring-topic metadata; not executable code",
        installed: true,
        status: "idle" as const,
        runs: learnedPatterns.length,
        successRate: avgLearnedRate,
        lastAt: null,
      },
      {
        id: "vigil:chorus",
        name: "Chorus",
        kind: "vigil" as const,
        role: "optional best-of-N selection; disabled by default",
        installed: true,
        status: "idle" as const,
        runs: 0,
        lastAt: null,
      },
    ];

    const roster = [...skillStaff, ...vigilStaff];

    // ── Schedules: the 4 cron routines, human cadence + best-effort last run ──
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
    ];

    // ── Pillars ──
    const personaSet = !!persona || pet.soul_version > 1;
    const pillars = {
      soul: {
        set: personaSet,
        persona: pet.personality_type,
        checkpoints: pet.soul_version,
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
        routines: schedules.length,
        nextLabel: agentSchedule?.is_enabled ? "Autonomy on" : "Idle heartbeat",
      },
    };

    return NextResponse.json({
      pet: { id: pet.id, name: pet.name, level: pet.level },
      pillars,
      kanban: { pending, working, blocked, done },
      roster,
      schedules,
      generatedAt: new Date().toISOString(),
    });
  } catch (e: any) {
    console.error("[mission-control] failed:", e?.message);
    return NextResponse.json({ error: "Failed to build mission control" }, { status: 500 });
  }
}
