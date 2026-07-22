/**
 * GET /api/petclaw/mission-control?petId=N — Agent Office aggregate.
 *
 * The productized port of the Hermes "Mission Control" native dashboard. It reads
 * ONLY real PetClaw state (no fabrication; honest zeros/empties) and shapes it into
 * the five surfaces the Office UI renders:
 *   - pillars   : the 5 Hermes pillars (Soul / Memory / User / Skills / Crons)
 *   - kanban    : honest current-state buckets. PetAutonomousAction rows are
 *                 completion-only history, so they belong in Done; only the
 *                 client-held live SSE run may render LIVE/WORKING today.
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
    // PetAutonomousAction is written only after settle/completion. Recency can
    // never turn a completed row back into WORKING. No persisted executable
    // queue exists yet, and product suggestions are not queued work, so all
    // current-state buckets stay empty; the client adds its real in-flight SSE
    // run locally as LIVE/WORKING.
    const pending: never[] = [];
    const working: never[] = [];
    const blocked: never[] = [];

    const doneActions = todaysActions.map((a) => {
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
    const done = [...doneActions, ...doneGenerations]
      .sort((x, y) => new Date(y.at as any).getTime() - new Date(x.at as any).getTime())
      .slice(0, 24);

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
    // There is no server-side in-flight row to justify an active staff dot.
    const activeSkillSet = new Set<string>();
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
