"use client";

/**
 * GrandPawOffice — "The Grand Paw" pet-hotel Agent Office.
 *
 * A faithful port of the founder-approved Grand Paw reference: a grand-hotel
 * lobby diorama (GrandPaw3D) wrapped in a concierge dashboard — greeting hero,
 * dispatch bar, Who's-where rail, Queue, routines — ALL fed from the same real
 * mission-control payload AgentOffice already polls. No fabricated data:
 * counts, tasks, times and the selected pet name are live; the two hotel staff
 * are visual-only fiction (named characters with no fake work claims about the
 * owner's data).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * VOICE SPEC (single source of truth — every string/style in this file
 * MUST match one of these five registers; audit against it before editing):
 *
 * 1. LABELS (eyebrows, chips, tags, room/cadence badges, mono metadata):
 *    var(--ed-m) mono · UPPERCASE · 12–13px · letterSpacing .12–.14em ·
 *    color LABEL #6D522E. No other mono color, size, or tracking exists.
 *    Selected/active nav state may switch to INK; everything at rest is LABEL.
 * 2. HEADINGS (card titles, board columns, memory values):
 *    var(--ed-disp) · ink #211A12. The serif greeting ("Afternoon. Welcome
 *    to The Grand Paw.") is the ONLY serif moment in the file.
 * 3. BODY / HELPER LINES: var(--ed-body) · 13–14px · #5C5140 · full
 *    sentences ending with punctuation — never fragments mixed in.
 * 4. NPC SPEECH: only inside the Who's-where rail, italic + quoted, always
 *    the same shape: role — “Line!”. NPC speech appears nowhere else
 *    (the 3D diorama bubbles receive status vocabulary instead).
 * 5. STATUS VOCABULARY (the only allowed set, in chips, queue rows, and the
 *    3D data-live labels alike): IDLE · WORKING · QUEUED · DONE · LIVE.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import {
  AGENT_OFFICE_TASK_MAX_INPUT,
  agentOfficeTaskDisplayTitle,
  agentOfficeTaskKindFromExecutionContract,
  containsStrongAgentOfficeSecret,
  getAgentOfficeTaskInputError,
  type AgentOfficeTaskKind,
} from "@/lib/petclaw/agent/office-task-contract";
import { api } from "@/lib/api";
import { isTerminalPaidAgentRunReceipt } from "@/lib/petclaw/agent-run-client";
import type { MC, LiveRun, KItem, RecallEvidence, Staff } from "./AgentOffice";
import GrandPaw3D, { GrandPawLive } from "./GrandPaw3D";

// ── hotel palette (voice-spec tokens) ──
const BG = "#FAF6ED";
const INK = "#211A12";           // headings + primary text (spec ink)
const BODY_C = "#5C5140";        // register 3: all body/helper text
const LABEL = "#6D522E";         // WCAG-AA labels on both hotel paper backgrounds
const HAIR = "#E7DDC6";
const CHIP_BG = "#FFFDF6";
const CHIP_BR = "#E5DABC";
const GOLD = "#A8802B";          // graphics only (meter fill) — never text
const GREEN = "#4E7A44";         // graphics only (status dots) — never text
const TERRA = "#B4552D";         // graphics only (accents/meter) — never text
const DIM = "rgba(33,26,18,0.22)"; // graphics only (inactive dots)
const SERIF = "Georgia, 'Times New Roman', serif"; // greeting ONLY; local, no third-party font request
const DISP = "var(--ed-disp, 'Bricolage Grotesque', system-ui, sans-serif)";
const MONO = "var(--ed-m, 'Space Mono', ui-monospace, monospace)";
const SANS = "var(--ed-body, 'Hanken Grotesk', -apple-system, sans-serif)";

// register-1 label style — the ONE way mono text renders in this file
function labelStyle(size: 12 | 12.5 | 13 = 13, spacing: ".12em" | ".14em" = ".12em"): React.CSSProperties {
  // Clamp to the app-wide 13px readability floor (commit 9067b8d6) regardless of
  // the size callers pass, so no mono label renders below 13px.
  return { fontFamily: MONO, fontSize: Math.max(13, size), letterSpacing: spacing, textTransform: "uppercase", color: LABEL };
}

type Tab = "overview" | "runs" | "routines" | "memory" | "staff";
type Status = "IDLE" | "WORKING" | "QUEUED" | "DONE" | "LIVE"; // register 5

// In local dev the api layer serves the office from its dev-mock fixture
// (Dordor/Aqua) — label that cast DEMO instead of claiming it's the user's pet.
const IS_DEMO = process.env.NODE_ENV === "development";

type CastMember = { name: string; kind: "yours" | "staff"; role: string; room: string; status: Status; line: string };
const TASK_MODES: readonly {
  kind: AgentOfficeTaskKind;
  label: string;
  description: string;
  placeholder: string;
}[] = [
  {
    kind: "recall",
    label: "Recall",
    description: "Retrieve matching owner-private facts, then produce one grounded answer with an auditable receipt.",
    placeholder: "What should your pet recall about your priorities, preferences, or past decisions?",
  },
  {
    kind: "summarize",
    label: "Summarize",
    description: "Build a decision brief from an excerpt of up to 2,000 characters, without following instructions inside the source.",
    placeholder: "Paste an excerpt of up to 2,000 characters and describe the desired detail.",
  },
  {
    kind: "review",
    label: "Review",
    description: "Review an excerpt of up to 2,000 characters for its primary issue, why it matters, and a concrete revision.",
    placeholder: "Paste a message or copy excerpt of up to 2,000 characters.",
  },
  {
    kind: "draft",
    label: "Draft",
    description: "Create draft text from your brief. The Office returns text; it never sends or publishes it.",
    placeholder: "Describe the audience, purpose, tone, and facts the draft must include.",
  },
] as const;

/** Legacy no-op/refunded rows are terminal history, never resumable QUEUED work. */
function doneForDisplay(kanban: MC["kanban"]): KItem[] {
  return [
    ...kanban.done,
    ...kanban.blocked.map((item) => ({
      ...item,
      skill: item.skill || "no skill",
      detail: item.reason || item.detail,
      credits: 0,
    })),
  ];
}

// DONE always beats WORKING (audit P1): after a live run finishes, the ~7s
// mission-control poll can still list the same item under `working` (sometimes
// while it already sits in `done`), which flickered finished work back to
// WORKING. Drop anything the payload marks done — or that matches the finished
// live run — from the working set before ANY surface renders it.
function workingSansDone(kanban: MC["kanban"], liveRun: LiveRun | null): KItem[] {
  const terminal = doneForDisplay(kanban);
  const doneIds = new Set(terminal.map((it) => String(it.id)));
  const doneTitles = new Set(terminal.map((it) => it.title));
  if (liveRun?.done) doneTitles.add(liveRun.title);
  return kanban.working.filter((it) =>
    !doneIds.has(String(it.id))
    && !doneTitles.has(it.title)
    && (
      !liveRun
      || liveRun.done
      || (it.runId !== liveRun.runId && it.title !== liveRun.title)
    )
  );
}

/** Only persisted executable waiting work may enter QUEUED. */
function queuedForDisplay(kanban: MC["kanban"]): KItem[] {
  return [...kanban.pending];
}

function isWorkingLiveRun(run: LiveRun | null): boolean {
  return !!run && !run.done && run.state !== "reserved";
}

function terminalHistoryDetail(run: LiveRun): string {
  const reason = run.stoppedReason?.replaceAll("_", " ") || "unknown reason";
  if (run.completed === false) {
    return `Stopped · ${reason} · ${run.billing?.outcome === "refunded" ? "credits refunded" : "settlement unavailable"}.`;
  }
  if (run.billing?.outcome === "refunded") {
    return "Completed without a chargeable deliverable · credits refunded.";
  }
  if (run.billing?.outcome === "charged") {
    return `Completed · ${run.billing.creditsCharged} credits charged.`;
  }
  return "Completed · settlement unavailable.";
}

function relTime(ts?: string | null): string {
  if (!ts) return "never";
  const s = Math.max(0, Math.floor((Date.now() - new Date(ts).getTime()) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
function clockOf(ts?: string | null): string {
  if (!ts) return "—";
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function recallEvidenceFromOutput(value: unknown): RecallEvidence | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const output = value as Record<string, unknown>;
  const clean = (candidate: unknown, cap: number): string => {
    if (typeof candidate !== "string") return "";
    const normalized = candidate.replace(/\s+/g, " ").trim();
    return normalized.length > cap
      ? `${normalized.slice(0, cap).trimEnd()}…`
      : normalized;
  };
  const rawCount = typeof output.count === "number" && Number.isFinite(output.count)
    ? Math.max(0, Math.floor(output.count))
    : 0;
  const rows = [
    ...(Array.isArray(output.relevant) ? output.relevant : []),
    ...(Array.isArray(output.profile) ? output.profile : []),
  ];
  const matches = rows.slice(0, 8).flatMap((row): RecallEvidence["matches"] => {
    if (!row || typeof row !== "object" || Array.isArray(row)) return [];
    const record = row as Record<string, unknown>;
    const safe = (candidate: unknown, cap: number, fallback: string): string => {
      const normalized = clean(candidate, cap);
      return normalized && !containsStrongAgentOfficeSecret(normalized)
        ? normalized
        : fallback;
    };
    const excerpt = clean(record.content, 240);
    const timestamp = clean(record.createdAt ?? record.updatedAt, 40);
    return [{
      key: safe(record.key, 80, "retained record"),
      category: safe(record.category, 40, "retained context"),
      source: safe(record.source, 40, "private memory"),
      timestamp: timestamp && !containsStrongAgentOfficeSecret(timestamp) ? timestamp : null,
      excerpt: excerpt && !containsStrongAgentOfficeSecret(excerpt) ? excerpt : null,
    }];
  });
  return { count: Math.max(rawCount, matches.length), matches };
}

export default function GrandPawOffice({ mc, liveRun, running, receiptMissing, composerLocked, petName, pets, goal, setGoal, taskKind, setTaskKind, onDispatch, cost }: {
  mc: MC; liveRun: LiveRun | null; running: boolean; receiptMissing: boolean; composerLocked: boolean; petName: string;
  pets: any[]; goal: string; setGoal: (s: string) => void;
  taskKind: AgentOfficeTaskKind; setTaskKind: (kind: AgentOfficeTaskKind) => void;
  onDispatch: (goalOverride?: string, taskKindOverride?: AgentOfficeTaskKind) => void; cost: number;
}) {
  const [tab, setTab] = useState<Tab>("overview");
  const [pane, setPane] = useState<"lobby" | "board">("lobby");
  const taskModeRefs = useRef<Record<AgentOfficeTaskKind, HTMLButtonElement | null>>({
    recall: null,
    summarize: null,
    review: null,
    draft: null,
  });
  const liveSkill = useMemo(() => {
    if (!liveRun || liveRun.done) return null;
    return [...liveRun.steps].reverse().find((step) => !step.complete)?.skill || null;
  }, [liveRun]);
  const [now, setNow] = useState(() => new Date());

  // Mobile: the fixed "1fr + 330px rail" grid and the 620px diorama shot past
  // a phone viewport. Under 880px the rail stacks below the diorama, the 3D
  // canvas (width is already fluid) drops to a phone-friendly height, and the
  // secondary controls stack.
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 880px)");
    const apply = () => setNarrow(mq.matches);
    apply();
    mq.addEventListener?.("change", apply);
    return () => mq.removeEventListener?.("change", apply);
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  const nextSchedule = useMemo(() => {
    const withNext = mc.schedules.filter((s) => s.nextRun).sort((a, b) => +new Date(a.nextRun!) - +new Date(b.nextRun!));
    return withNext[0] || mc.schedules[0] || null;
  }, [mc.schedules]);

  // Working items with anything already DONE filtered out (see workingSansDone).
  const workingItems = useMemo(() => workingSansDone(mc.kanban, liveRun), [mc.kanban, liveRun]);
  const queuedItems = useMemo(() => queuedForDisplay(mc.kanban), [mc.kanban]);
  const doneItems = useMemo(() => doneForDisplay(mc.kanban), [mc.kanban]);
  const liveRunWorking = isWorkingLiveRun(liveRun);
  const liveRunQueued = !!liveRun && !liveRun.done && liveRun.state === "reserved";
  const liveRunQueuedNotPersisted = !!(
    liveRunQueued
    && liveRun
    && !queuedItems.some((item) => item.runId === liveRun.runId || item.title === liveRun.title)
  );
  const workingTitle = liveRunWorking && liveRun
    ? agentOfficeTaskDisplayTitle(liveRun.taskKind, liveRun.title)
    : workingItems[0]?.title;
  const runningCount = workingItems.length + (liveRunWorking ? 1 : 0);
  const queuedCount = queuedItems.length + (liveRunQueuedNotPersisted ? 1 : 0);
  const doneToday = doneItems.length;
  const liveDoneNotPersisted = !!(
    liveRun?.done
    && !doneItems.some((item) => item.title === liveRun.title)
  );
  // Recomputed locally (not the isWorking prop) so the header chip can never
  // say WORKING off a stale payload row that is actually DONE.
  const busyNow = runningCount > 0 || running;
  const officeStatus: Status = busyNow ? "WORKING" : queuedCount > 0 ? "QUEUED" : "IDLE";
  const selectedTaskMode = TASK_MODES.find((mode) => mode.kind === taskKind) || TASK_MODES[0];
  const taskInputError = getAgentOfficeTaskInputError(taskKind, goal);
  const taskReady = taskInputError === null;
  const showTaskInputError = goal.length > 0 && taskInputError !== null;

  const moveTaskMode = (
    event: KeyboardEvent<HTMLButtonElement>,
    current: AgentOfficeTaskKind,
  ) => {
    if (composerLocked) return;
    const keys = TASK_MODES.map((mode) => mode.kind);
    const index = keys.indexOf(current);
    let nextIndex = index;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") nextIndex = (index + 1) % keys.length;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") nextIndex = (index - 1 + keys.length) % keys.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = keys.length - 1;
    else return;
    event.preventDefault();
    const next = keys[nextIndex];
    setTaskKind(next);
    taskModeRefs.current[next]?.focus();
  };

  // The mission-control payload is scoped to one selected pet. Only that pet
  // may appear as LIVE telemetry; other owned pets stay in the picker until
  // selected. Remaining slots are visual-only hotel staff, labeled everywhere
  // so provenance is never ambiguous. In local dev the office runs on the
  // dev-mock fixture, so the star is honestly labeled DEMO instead of YOUR PET.
  // Register 4: staff `line`s are the only NPC speech in the app, always
  // role — “Line!”; register 3: every `line` for real pets is a full sentence.
  const cast = useMemo(() => {
    const selectedPetId = Number(mc.pet.id);
    const selectedPet = pets.find((candidate: any) => Number(candidate.id) === selectedPetId);
    const real: CastMember[] = selectedPet
      ? [{
        name: ((selectedPet.name || `Pet #${selectedPet.id}`) as string).slice(0, 12),
        kind: "yours" as const,
        role: IS_DEMO ? "DEMO PET" : "SELECTED PET",
        room: "VISUAL SET",
        status: (workingTitle ? "WORKING" : liveRunQueued ? "QUEUED" : "IDLE") as Status,
        line: workingTitle ? `Current goal — “${workingTitle}”.` : liveRunQueued ? "A paid task is reserved and waiting to start." : "Ready for your next goal.",
      }]
      : [];
    if (real.length === 0) {
      real.push({
        name: (petName || "Your pet").slice(0, 12), kind: "yours", role: IS_DEMO ? "DEMO PET" : "YOUR PET",
        room: "VISUAL SET", status: workingTitle ? "WORKING" : liveRunQueued ? "QUEUED" : "IDLE",
        line: workingTitle ? `Current goal — “${workingTitle}”.` : liveRunQueued ? "A paid task is reserved and waiting to start." : "Ready for your next goal.",
      });
    }
    const staff: CastMember[] = [
      { name: "Mimi", kind: "staff", role: "VISUAL-ONLY NPC", room: "WORKSHOP", status: "IDLE", line: "visual host — “No task execution.”" },
      { name: "Toto", kind: "staff", role: "VISUAL-ONLY NPC", room: "LOBBY", status: "IDLE", line: "visual host — “No task execution.”" },
    ];
    return [...real, ...staff].slice(0, 3);
  }, [mc.pet.id, pets, petName, workingTitle, liveRunQueued]);

  const yoursCount = cast.filter((c) => c.kind === "yours").length;
  const staffCount = cast.filter((c) => c.kind === "staff").length;

  const live3d: GrandPawLive = useMemo(() => ({
    // nameplates carry provenance into the diorama itself: the star wears the
    // owner's real pet name (DEMO-suffixed on the dev fixture), staff NPCs are
    // suffixed STAFF. Register 5: the diorama bubbles speak the same status
    // vocabulary as every chip — NPC speech never leaves the Who's-where rail.
    pets: cast.map((c) => ({
      name: c.kind === "staff" ? `${c.name} · VISUAL ONLY` : IS_DEMO ? `${c.name} · DEMO` : c.name,
      task: c.status,
    })),
    memory: { count: mc.pillars.memory.count, cap: mc.pillars.memory.cap },
    skills: TASK_MODES.length,
    soulLv: mc.pet.level || 1,
    goals: mc.kanban.pending.length,
    next: nextSchedule?.nextRun ? clockOf(nextSchedule.nextRun) : "—",
  }), [cast, mc, nextSchedule]);

  const hour = now.getHours();
  const greet = hour < 5 ? "Evening" : hour < 12 ? "Morning" : hour < 18 ? "Afternoon" : "Evening";
  const eyebrow = `${now.toLocaleDateString("en-US", { weekday: "long" })}, ${now.toLocaleDateString("en-US", { month: "short", day: "2-digit" })} · ${String(hour).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")} · Agent Office`;

  return (
    <div style={{ background: BG, borderRadius: 22, border: `1px solid ${HAIR}`, padding: narrow ? "18px 14px 20px" : "22px 24px 26px", margin: narrow ? 0 : "0 -4px", maxWidth: "100%", overflow: "hidden" }}>
      <style>{`
        @keyframes gpPulse{0%,100%{opacity:1}50%{opacity:.45}}
        @media (prefers-reduced-motion: reduce) {
          .gp-live-pulse { animation: none !important; }
        }
      `}</style>

      {/* ── tabs (register 1; active state goes ink) ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", paddingBottom: 14, borderBottom: `1px solid ${HAIR}`, marginBottom: 18 }}>
        {(["overview", "runs", "routines", "memory", "staff"] as Tab[]).map((t) => (
          <button type="button" key={t} onClick={() => setTab(t)} aria-pressed={tab === t}
            style={{ ...labelStyle(12.5), background: "none", border: "none", padding: "4px 1px", cursor: "pointer",
              fontWeight: tab === t ? 700 : 400, color: tab === t ? INK : LABEL,
              boxShadow: tab === t ? `inset 0 -2px 0 ${INK}` : "none" }}>
            {t === "routines" ? "routine catalog" : t === "staff" ? "capabilities" : t}
          </button>
        ))}
        <div style={{ marginLeft: narrow ? 0 : "auto", width: narrow ? "100%" : undefined, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ ...labelStyle(12.5), display: "inline-flex", alignItems: "center", gap: 7, padding: "5px 12px", borderRadius: 999, background: CHIP_BG, border: `1px solid ${CHIP_BR}` }}>
            <span className="gp-live-pulse" style={{ width: 7, height: 7, borderRadius: 99, background: officeStatus === "WORKING" ? GREEN : officeStatus === "QUEUED" ? GOLD : DIM, animation: officeStatus === "WORKING" ? "gpPulse 1.6s infinite" : undefined }} />
            {IS_DEMO ? "DEMO PET" : "YOUR PET"}
            {petName && petName !== "your pet" ? ` · ${petName.toUpperCase().slice(0, 14)}` : ""} · {officeStatus}
          </span>
          {tab === "overview" && (
            <span style={{ display: "inline-flex", background: CHIP_BG, border: `1px solid ${CHIP_BR}`, borderRadius: 999, padding: 3 }}>
              {(["lobby", "board"] as const).map((p) => (
                <button type="button" key={p} onClick={() => setPane(p)} aria-pressed={pane === p}
                  style={{ ...labelStyle(12), fontWeight: pane === p ? 700 : 400, padding: "4px 13px", borderRadius: 999, border: "none", cursor: "pointer",
                    background: pane === p ? "#F1E7CC" : "transparent", color: pane === p ? INK : LABEL }}>
                  {p}
                </button>
              ))}
            </span>
          )}
        </div>
      </div>

      {/* ── hero ── */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ ...labelStyle(13, ".14em"), marginBottom: 8 }}>{eyebrow}</div>
        <h2 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: "clamp(28px,4.4vw,44px)", color: INK, margin: 0, lineHeight: 1.08, letterSpacing: "0.005em" }}>
          {greet}. Welcome to The Grand Paw.
        </h2>
        <div style={{ ...labelStyle(13), marginTop: 9 }}>
          {runningCount} WORKING · {queuedCount} QUEUED · {doneToday + (liveDoneNotPersisted ? 1 : 0)} DONE · ROUTINE CATALOG NEXT {nextSchedule?.nextRun ? clockOf(nextSchedule.nextRun) : "—"}
        </div>
      </div>

      {/* ── real read-only task composer ── */}
      <section aria-labelledby="gp-task-title" style={{ background: CHIP_BG, border: `1px solid ${CHIP_BR}`, borderRadius: 16, padding: narrow ? 12 : 14, marginBottom: 12, boxShadow: "0 14px 30px -24px rgba(80,55,20,.45)" }}>
        <div id="gp-task-title" style={{ ...labelStyle(13, ".14em"), fontWeight: 700 }}>READ-ONLY TASK · BETA</div>
        <div style={{ fontFamily: SANS, fontSize: 13, color: BODY_C, lineHeight: 1.5, marginTop: 5 }}>
          This is the functional part of the Office. The hotel scene is a visual status view; Mimi and Toto do not execute work.
        </div>
        <div id="gp-task-scope" style={{ display: "grid", gridTemplateColumns: narrow ? "minmax(0,1fr)" : "repeat(2,minmax(0,1fr))", gap: 9, marginTop: 10 }}>
          <div style={{ border: `1px solid ${CHIP_BR}`, background: "rgba(78,122,68,0.06)", borderRadius: 10, padding: "9px 11px", fontFamily: SANS, fontSize: 13, color: INK, lineHeight: 1.5 }}>
            <b>Supported now:</b> owner-memory recall; summaries, reviews, and drafts from text you provide.
          </div>
          <div style={{ border: `1px solid ${CHIP_BR}`, background: "rgba(180,85,45,0.05)", borderRadius: 10, padding: "9px 11px", fontFamily: SANS, fontSize: 13, color: BODY_C, lineHeight: 1.5 }}>
            <b style={{ color: INK }}>Not supported here:</b> browsing URLs or the live web; opening files, inboxes, or apps; sending messages; editing data or settings; purchases; media generation; running routines.
          </div>
        </div>
        <div role="radiogroup" aria-label="Read-only task type" style={{ display: "grid", gridTemplateColumns: narrow ? "repeat(2,minmax(0,1fr))" : "repeat(4,minmax(0,1fr))", gap: 7, marginTop: 12 }}>
          {TASK_MODES.map((mode) => {
            const selected = taskKind === mode.kind;
            return (
              <button
                key={mode.kind}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-describedby="gp-task-mode-description"
                tabIndex={selected ? 0 : -1}
                ref={(node) => { taskModeRefs.current[mode.kind] = node; }}
                disabled={composerLocked}
                onClick={() => setTaskKind(mode.kind)}
                onKeyDown={(event) => moveTaskMode(event, mode.kind)}
                style={{
                  ...labelStyle(13),
                  minWidth: 0,
                  minHeight: 42,
                  border: `1px solid ${selected ? INK : CHIP_BR}`,
                  borderRadius: 10,
                  background: selected ? INK : "#FFFDF8",
                  color: selected ? "#FFF9EC" : LABEL,
                  fontWeight: selected ? 700 : 600,
                  cursor: composerLocked ? "not-allowed" : "pointer",
                  opacity: composerLocked && !selected ? 0.55 : 1,
                }}
              >
                {mode.label}
              </button>
            );
          })}
        </div>
        <div id="gp-task-mode-description" style={{ fontFamily: SANS, fontSize: 13, color: BODY_C, lineHeight: 1.5, marginTop: 7 }}>
          <b style={{ color: INK }}>{selectedTaskMode.label}:</b> {selectedTaskMode.description}
        </div>
        <div style={{ display: "flex", flexDirection: narrow ? "column" : "row", alignItems: "stretch", gap: 8, marginTop: 10 }}>
          <textarea id="gp-dispatch" aria-label={`${selectedTaskMode.label} task for ${petName}`} aria-describedby="gp-task-scope gp-task-mode-description gp-task-validation gp-task-count gp-task-billing"
            aria-invalid={showTaskInputError}
            aria-errormessage={showTaskInputError ? "gp-task-validation" : undefined}
            value={goal} onChange={(e) => setGoal(e.target.value)}
            disabled={composerLocked}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing) return;
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                onDispatch(undefined, taskKind);
              }
            }}
            placeholder={selectedTaskMode.placeholder}
            rows={narrow ? 3 : 2}
            style={{ flex: 1, minWidth: 0, width: "100%", boxSizing: "border-box", border: `1px solid ${showTaskInputError ? "#991B1B" : CHIP_BR}`, borderRadius: 11, background: "#FFFDF8", fontFamily: SANS, fontSize: 14, lineHeight: 1.5, color: INK, padding: "10px 12px", resize: "vertical" }} />
          {!narrow && <span aria-hidden="true" style={{ ...labelStyle(12), alignSelf: "center", border: `1px solid ${CHIP_BR}`, borderRadius: 7, padding: "3px 7px" }}>⌘↵</span>}
          <button type="button" onClick={() => onDispatch(undefined, taskKind)} disabled={!taskReady || composerLocked} aria-busy={running}
            style={{ fontFamily: SANS, fontSize: 14, fontWeight: 700, color: "#FFF9EC", padding: "11px 18px", borderRadius: 11, border: "none",
              cursor: taskReady && !composerLocked ? "pointer" : "not-allowed",
              background: taskReady && !composerLocked ? INK : "rgba(33,26,18,0.25)" }}>
            {running
              ? "WORKING"
              : receiptMissing
                ? "Check Account first"
                : composerLocked
                  ? "Waiting for active task"
                  : `Run ${selectedTaskMode.label} · reserve ${cost} credits`}
          </button>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 9, flexWrap: "wrap", fontFamily: SANS, fontSize: 13, color: showTaskInputError ? "#991B1B" : BODY_C, lineHeight: 1.4, marginTop: 7 }}>
          <span id="gp-task-validation" role={showTaskInputError ? "alert" : undefined} aria-live={showTaskInputError ? "assertive" : undefined}>
            {showTaskInputError ? taskInputError : `${selectedTaskMode.label} input is ready when its requirement is met.`}
          </span>
          <span id="gp-task-count">{goal.length} / {AGENT_OFFICE_TASK_MAX_INPUT}</span>
        </div>
        <div id="gp-task-billing" style={{ fontFamily: SANS, fontSize: 13, color: BODY_C, lineHeight: 1.5, marginTop: 8 }}>
          The selected {selectedTaskMode.label.toLowerCase()} task reserves {cost} credits for a task-specific, auditable deliverable. It is charged only when its required internal read-only tool produces that deliverable; otherwise refunded. Do not paste secrets: input and output are sent to the configured AI provider when needed and stored in your private run history under the <a href="/privacy" style={{ color: LABEL, fontWeight: 700 }}>Privacy policy</a>. No pet-memory or self-learning write occurs. Use the button or Command/Ctrl + Enter.
        </div>
      </section>

      {liveRun && (
        <HotelResultPanel
          run={liveRun}
          cost={cost}
        />
      )}

      <div style={{ marginBottom: 18 }} />

      {tab === "overview" && (
        <div style={{ display: "grid", gridTemplateColumns: narrow ? "minmax(0,1fr)" : "minmax(0,1fr) 330px", gap: 18, alignItems: "start" }}>
          {/* main pane: lobby diorama or board */}
          <div style={{ minWidth: 0 }}>
            {pane === "lobby" ? (
              <div style={{ position: "relative" }}>
                <GrandPaw3D live={live3d} height={narrow ? 400 : 620} />
                <div style={chipFloat({ left: 14, bottom: 14, maxWidth: "calc(100% - 28px)", whiteSpace: "normal", overflowWrap: "anywhere" })}>
                  ● {IS_DEMO ? "DEMO PET" : yoursCount > 1 ? `YOUR ${yoursCount} PETS` : "YOUR PET"}
                  {staffCount > 0 ? ` + ${staffCount} VISUAL-ONLY NPCS` : ""} · DECORATIVE POSITIONS · {runningCount} WORKING · {queuedCount} QUEUED
                </div>
                {!narrow && <div style={chipFloat({ right: 14, bottom: 14 })}>DRAG TO ORBIT · SCROLL TO ZOOM</div>}
              </div>
            ) : (
              <Board mc={mc} liveRun={liveRun} />
            )}
          </div>

          {/* right rail */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <RailCard title="Execution + visual cast" tag="LIVE STATUS · VISUAL LOCATION">
              {(["yours", "staff"] as const).map((kind) => {
                const rows = cast.filter((c) => c.kind === kind);
                if (rows.length === 0) return null;
                return (
                    <div key={kind}>
                      <div style={{ ...labelStyle(12), margin: "10px 0 4px" }}>
                      {kind === "yours" ? (IS_DEMO ? "DEMO PET" : rows.length > 1 ? "YOUR PETS" : "YOUR PET") : "VISUAL-ONLY HOTEL NPCS"}
                    </div>
                    {rows.map((c) => (
                      <div key={c.name} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 0", borderTop: `1px solid ${HAIR}` }}>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontFamily: SANS, fontSize: 14, color: INK }}>
                            <b>{c.name}</b> <span style={labelStyle(12)}>{c.role}</span>
                          </div>
                          {/* register 3 for real pets (full sentences); register 4 for NPC speech */}
                          <div style={{ fontFamily: SANS, fontSize: 13, color: BODY_C, fontStyle: c.kind === "staff" ? "italic" : undefined, marginTop: 2, overflowWrap: "anywhere" }}>
                            {c.status === "WORKING" && <span className="gp-live-pulse" style={{ color: GREEN, animation: "gpPulse 1.6s infinite" }}>● </span>}
                            {c.line}
                          </div>
                        </div>
                        <span style={{ ...labelStyle(12), flexShrink: 0, background: "#F5EDD8", borderRadius: 6, padding: "3px 8px" }}>{c.room}</span>
                      </div>
                    ))}
                  </div>
                );
              })}
            </RailCard>

            <RailCard title="Queue">
              {runningCount === 0 && queuedCount === 0 && doneToday === 0 && !liveDoneNotPersisted && (
                <div style={{ fontFamily: SANS, fontSize: 13, color: BODY_C, padding: "10px 0" }}>No task is running. Start a supported read-only task above.</div>
              )}
              {isWorkingLiveRun(liveRun) && liveRun && <QueueRow status="LIVE" title={agentOfficeTaskDisplayTitle(liveRun.taskKind, liveRun.title)} />}
              {workingItems.map((it) => <QueueRow key={String(it.id)} status="WORKING" title={it.title} />)}
              {liveRunQueuedNotPersisted && liveRun && <QueueRow status="QUEUED" title={agentOfficeTaskDisplayTitle(liveRun.taskKind, liveRun.title)} />}
              {queuedItems.slice(0, 3).map((it, index) => <QueueRow key={`queued-${index}-${String(it.id)}`} status="QUEUED" title={it.title} />)}
              {liveDoneNotPersisted && liveRun && <QueueRow status="DONE" title={agentOfficeTaskDisplayTitle(liveRun.taskKind, liveRun.title)} detail={terminalHistoryDetail(liveRun)} />}
              {doneItems.slice(0, 4).map((it) => <QueueRow key={String(it.id)} status="DONE" title={it.title} detail={it.detail} meta={clockOf(it.at)} />)}
            </RailCard>

            <RailCard title="Routine catalog" right={nextSchedule?.nextRun ? clockOf(nextSchedule.nextRun) : "—"}>
              {nextSchedule ? (
                <div style={{ padding: "8px 0" }}>
                  <div style={{ fontFamily: SANS, fontSize: 14, fontWeight: 700, color: INK }}>{nextSchedule.name}</div>
                  <div style={{ fontFamily: SANS, fontSize: 13, color: BODY_C, marginTop: 3 }}>{nextSchedule.desc}</div>
                  <div style={{ ...labelStyle(12), marginTop: 6 }}>{nextSchedule.cadence} · LAST {relTime(nextSchedule.lastRun)}</div>
                  <div style={{ fontFamily: SANS, fontSize: 13, color: BODY_C, lineHeight: 1.45, marginTop: 7 }}>
                    Schedule metadata only. This page cannot start, pause, or edit it.
                  </div>
                </div>
              ) : (
                <div style={{ fontFamily: SANS, fontSize: 13, color: BODY_C, padding: "8px 0" }}>No routine metadata is available.</div>
              )}
            </RailCard>
          </div>
        </div>
      )}

      {tab === "runs" && <Board mc={mc} liveRun={liveRun} full />}

      {tab === "routines" && (
        <LedgerCard>
          <div style={{ padding: "13px 16px", background: "#F5EDD8", borderBottom: mc.schedules.length ? `1px solid ${HAIR}` : "none" }}>
            <div style={{ ...labelStyle(13), fontWeight: 700 }}>READ-ONLY ROUTINE CATALOG</div>
            <div style={{ fontFamily: SANS, fontSize: 13, color: BODY_C, lineHeight: 1.5, marginTop: 4 }}>
              Schedule metadata only. This Office cannot create, edit, pause, or manually run routines.
            </div>
          </div>
          {mc.schedules.length === 0 && <Empty text="No routine metadata is available." />}
          {mc.schedules.map((s, i) => (
            <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 16px", borderTop: i ? `1px solid ${HAIR}` : "none", flexWrap: "wrap" }}>
              <span style={{ width: 8, height: 8, borderRadius: 99, background: s.lastRun ? GREEN : DIM }} />
              <span style={{ fontFamily: SANS, fontSize: 14, fontWeight: 700, color: INK, minWidth: 130 }}>{s.name}</span>
              <span style={{ ...labelStyle(12), background: "#F5EDD8", borderRadius: 6, padding: "2px 8px" }}>{s.cadence}</span>
              <span style={{ fontFamily: SANS, fontSize: 13, color: BODY_C, flex: 1, minWidth: 160 }}>{s.desc}</span>
              <span style={labelStyle(12)}>NEXT {s.nextRun ? clockOf(s.nextRun) : "—"} · LAST {relTime(s.lastRun)}</span>
            </div>
          ))}
        </LedgerCard>
      )}

      {tab === "memory" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12 }}>
          <MemCard label="SOUL" value={mc.pillars.soul.set ? mc.pillars.soul.persona : "Not set"}
            sub={mc.pillars.soul.set
              ? `Persona v${mc.pillars.soul.personaVersion ?? "unknown"} · updated ${relTime(mc.pillars.soul.updatedAt)}.`
              : "Onboarding is open — no persona is configured yet."} />
          <MemCard label="MEMORY" value={`${mc.pillars.memory.count} / ${mc.pillars.memory.cap}`}
            sub={mc.pillars.memory.lastFact ? `The latest entry is “${mc.pillars.memory.lastFact.slice(0, 52)}${mc.pillars.memory.lastFact.length > 52 ? "…" : ""}”.` : "The ledger is empty."}
            fill={mc.pillars.memory.count / mc.pillars.memory.cap} />
          <MemCard label="USER" value={`${mc.pillars.user.count} / ${mc.pillars.user.cap}`} sub="Facts your pet keeps about its owner." fill={mc.pillars.user.count / mc.pillars.user.cap} />
          <MemCard label="SKILL MANIFESTS" value={`${mc.pillars.skills.total} built-in`} sub={`4 Office task tools and ${mc.pillars.skills.installed} user-installed manifests.`} />
          <MemCard label="ROUTINE CATALOG" value={`${mc.pillars.crons.catalogCount} listed`} sub={mc.pillars.crons.nextLabel} />
        </div>
      )}

      {tab === "staff" && (
        <div>
          <div style={{ fontFamily: SANS, fontSize: 13, color: BODY_C, lineHeight: 1.5, marginBottom: 10 }}>
            Status-only inventory. READY means one of the four exact capabilities selectable in the task composer; these cards are not controls.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 12 }}>
            {mc.roster.map((s) => {
              const active = s.availableInOffice !== false && (s.status === "active" || (s.kind === "skill" && s.id === liveSkill));
              const state = capabilityState(s, active);
              return (
                <div key={s.id} style={{ background: CHIP_BG, border: `1px solid ${CHIP_BR}`, borderRadius: 14, padding: "12px 14px", opacity: state.dim ? 0.72 : 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: 99, background: active ? GREEN : state.dim ? DIM : LABEL }} />
                    <span style={{ fontFamily: SANS, fontSize: 14, fontWeight: 700, color: INK, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</span>
                    <span style={{ ...labelStyle(12), marginLeft: "auto" }}>{state.label}</span>
                  </div>
                  <div style={{ fontFamily: SANS, fontSize: 13, color: BODY_C, marginTop: 5, minHeight: 32, lineHeight: 1.4 }}>{s.role}</div>
                  {(s.blockedReason || state.note) && (
                    <div style={{ fontFamily: SANS, fontSize: 13, color: BODY_C, marginTop: 5, lineHeight: 1.4 }}>{s.blockedReason || state.note}</div>
                  )}
                  <div style={{ ...labelStyle(12), marginTop: 6 }}>
                    {s.runs} {s.metricLabel || (s.kind === "skill" ? "RUNS" : "RECORDS")}{typeof s.successRate === "number" ? ` · ${s.successRate}%` : ""}{s.lastAt ? ` · ${relTime(s.lastAt)}` : ""}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div style={{ fontFamily: SANS, fontSize: 13, color: BODY_C, marginTop: 18, textAlign: "center" }}>
        A selected typed task reserves {cost} credits. It is charged only when its required approved read-only tool produces a contract-valid deliverable; otherwise it is refunded. Do not paste secrets: provider-assisted input and output are stored in owner-private run history, but are not written to pet memory or self-learning. Status data refreshes from PetClaw every 7 seconds.
      </div>
    </div>
  );
}

// ── pieces ──

function capabilityState(skill: Staff, active: boolean): { label: string; note?: string; dim: boolean } {
  if (active) return { label: "RUNNING", dim: false };
  if (skill.mode === "endpoint-only") {
    const studio = (skill.endpoint || "").includes("generate");
    return {
      label: studio ? "USE IN STUDIO" : "NOT AVAILABLE",
      note: studio
        ? "This capability runs from Studio, not Agent Office."
        : `This capability runs only from ${skill.endpoint || "its dedicated surface"}.`,
      dim: true,
    };
  }
  if (skill.availableInOffice === false) {
    return { label: "NOT AVAILABLE", note: "This capability cannot run from Agent Office.", dim: true };
  }
  if (
    skill.availableInOffice === true
    || skill.mode === "core-in-process"
    || skill.mode === "installed-in-process"
    || (skill.mode == null && skill.installed)
  ) {
    return { label: "READY", dim: false };
  }
  return { label: "NOT AVAILABLE", note: "This capability cannot run from Agent Office.", dim: true };
}

function HotelResultPanel({ run, cost }: {
  run: LiveRun;
  cost: number;
}) {
  const [copyResultReceipt, setCopyResultReceipt] = useState<{ runId: string; state: "copied" | "failed" } | null>(null);
  const [copyRunReceipt, setCopyRunReceipt] = useState<{ runId: string; state: "copied" | "failed" } | null>(null);
  const copyState = copyResultReceipt?.runId === run.runId ? copyResultReceipt.state : "idle";
  const copyRunState = copyRunReceipt?.runId === run.runId ? copyRunReceipt.state : "idle";

  const copyResult = async () => {
    if (!run.answer) return;
    try {
      await navigator.clipboard.writeText(run.answer);
      setCopyResultReceipt({ runId: run.runId, state: "copied" });
    } catch {
      setCopyResultReceipt({ runId: run.runId, state: "failed" });
    }
  };
  const copyRunId = async () => {
    try {
      await navigator.clipboard.writeText(run.runId);
      setCopyRunReceipt({ runId: run.runId, state: "copied" });
    } catch {
      setCopyRunReceipt({ runId: run.runId, state: "failed" });
    }
  };
  const billingText = run.billing
    ? run.billing.outcome === "charged"
      ? `${run.billing.creditsCharged} credits charged`
      : "Credits refunded"
    : run.state === "reserved"
      ? `${cost}-credit reservation recorded; settlement waits for an approved tool`
    : run.done
      ? "Charge/refund not confirmed"
      : `${cost}-credit reservation held until settlement`;
  const statusText = run.state === "reserved"
    ? "QUEUED"
    : !run.done
      ? "LIVE"
      : "DONE";
  const outcomeText = run.done && run.completed === false
    ? `Task did not complete${run.stoppedReason ? ` · ${run.stoppedReason.replaceAll("_", " ")}` : ""}${run.billing?.outcome === "refunded" ? " · credits refunded" : " · settlement not confirmed"}`
    : run.done && run.billing?.outcome === "refunded"
      ? "Task completed without a chargeable deliverable · credits refunded"
      : null;

  return (
    <section aria-label="Task result" style={{ background: CHIP_BG, border: `1px solid ${CHIP_BR}`, borderLeft: `4px solid ${run.done ? (run.billing?.outcome === "refunded" ? TERRA : GREEN) : LABEL}`, borderRadius: 16, padding: "14px 16px", marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ ...labelStyle(13, ".14em"), fontWeight: 700 }}>TASK RESULT</div>
        <span role="status" aria-live="polite" aria-atomic="true" style={{ ...labelStyle(13), fontWeight: 700, color: INK, background: "#F5EDD8", border: `1px solid ${CHIP_BR}`, borderRadius: 999, padding: "3px 9px" }}>{statusText}</span>
      </div>
      <div style={{ fontFamily: SANS, fontSize: 14, fontWeight: 700, color: INK, lineHeight: 1.45, marginTop: 8, overflowWrap: "anywhere" }}>
        {agentOfficeTaskDisplayTitle(run.taskKind, run.title)}
      </div>
      <details style={{ marginTop: 7 }}>
        <summary style={{ fontFamily: SANS, fontSize: 13, color: LABEL, fontWeight: 700, cursor: "pointer" }}>View original input</summary>
        <pre style={{ margin: "7px 0 0", whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontFamily: SANS, fontSize: 13, color: BODY_C, lineHeight: 1.5 }}>{run.title}</pre>
      </details>
      {outcomeText && (
        <div role="status" style={{ fontFamily: SANS, fontSize: 13, color: BODY_C, lineHeight: 1.5, marginTop: 7 }}>
          {outcomeText}
        </div>
      )}
      <div style={{ marginTop: 10, padding: "11px 12px", border: `1px solid ${CHIP_BR}`, background: "#FFFDF8", borderRadius: 10 }}>
        <div style={{ ...labelStyle(13), fontWeight: 700, marginBottom: 4 }}>ANSWER</div>
        <div style={{ fontFamily: SANS, fontSize: 14, color: INK, lineHeight: 1.6, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
          {run.done ? (run.answer || "No answer was returned.") : run.state === "reserved" ? "Waiting for the agent loop to start…" : "Working on a read-only answer…"}
        </div>
      </div>
      <div style={{ marginTop: 10 }}>
        <div style={{ ...labelStyle(13), fontWeight: 700, marginBottom: 5 }}>STEPS / TOOLS</div>
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
          {run.steps.length > 0 ? run.steps.map((step, index) => (
            <div key={`${step.skill}-${index}`} style={{ minWidth: 0 }}>
              <span style={{ display: "inline-flex", fontFamily: MONO, fontSize: 13, color: step.complete && !step.ok ? BODY_C : INK, border: `1px solid ${CHIP_BR}`, background: "#F5EDD8", borderRadius: 8, padding: "5px 8px" }}>
                {index + 1}. {step.skill.replaceAll("-", " ")} · {step.complete ? (step.ok ? "DONE" : "FAILED") : "WORKING"}
              </span>
              {step.evidence && (
                <details style={{ marginTop: 6, maxWidth: 620 }}>
                  <summary style={{ fontFamily: SANS, fontSize: 13, color: LABEL, fontWeight: 700, cursor: "pointer" }}>
                    Recall evidence · {step.evidence.count} matched
                  </summary>
                  <div style={{ marginTop: 6, display: "grid", gap: 6 }}>
                    {step.evidence.matches.length > 0 ? step.evidence.matches.map((match, matchIndex) => (
                      <div key={`${match.key}-${matchIndex}`} style={{ border: `1px solid ${CHIP_BR}`, borderRadius: 8, background: "#FFFDF8", padding: "8px 9px", fontFamily: SANS, fontSize: 13, color: BODY_C, lineHeight: 1.45, overflowWrap: "anywhere" }}>
                        <b style={{ color: INK }}>{match.category}</b> · {match.source}{match.timestamp ? ` · ${relTime(match.timestamp)}` : ""}
                        <div style={{ marginTop: 2 }}><code style={{ fontFamily: MONO }}>Record: {match.key}</code></div>
                        {match.excerpt ? <div style={{ marginTop: 3, color: INK }}>{match.excerpt}</div> : <div style={{ marginTop: 3 }}>Sensitive excerpt hidden.</div>}
                      </div>
                    )) : <span style={{ fontFamily: SANS, fontSize: 13, color: BODY_C }}>No retained rows were returned.</span>}
                  </div>
                </details>
              )}
            </div>
          )) : (
            <span style={{ fontFamily: SANS, fontSize: 13, color: BODY_C }}>
              {run.done ? "No required tool receipt was recorded; this run is not chargeable." : "Waiting for the required tool receipt…"}
            </span>
          )}
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 11, paddingTop: 10, borderTop: `1px solid ${HAIR}` }}>
        <span style={{ fontFamily: MONO, fontSize: 13, color: INK, fontWeight: 700 }}>{billingText}</span>
        <span style={{ fontFamily: MONO, fontSize: 13, color: BODY_C }}>
          Credits left: {typeof run.creditsRemaining === "number" ? run.creditsRemaining : "not reported"}
        </span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 7, flexWrap: "wrap" }}>
          <code style={{ maxWidth: "100%", overflowWrap: "anywhere", fontFamily: MONO, fontSize: 13, color: BODY_C }}>{run.runId}</code>
          <button type="button" onClick={copyRunId}
            style={{ border: `1px solid ${CHIP_BR}`, borderRadius: 9, background: "#FFFDF8", color: INK, padding: "7px 10px", fontFamily: SANS, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            {copyRunState === "copied" ? "Run ID copied" : copyRunState === "failed" ? "Copy failed" : "Copy run ID"}
          </button>
          <button type="button" onClick={copyResult} disabled={!run.answer}
            style={{ border: `1px solid ${CHIP_BR}`, borderRadius: 9, background: "#FFFDF8", color: INK, padding: "7px 10px", fontFamily: SANS, fontSize: 13, fontWeight: 700, cursor: run.answer ? "pointer" : "not-allowed", opacity: run.answer ? 1 : 0.55 }}>
            {copyState === "copied" ? "Copied" : copyState === "failed" ? "Copy failed" : "Copy result"}
          </button>
        </div>
      </div>
    </section>
  );
}

function chipFloat(pos: React.CSSProperties): React.CSSProperties {
  return { position: "absolute", ...pos, ...labelStyle(12.5),
    background: "rgba(252,248,238,0.92)", border: "1px solid #D9C9A8", borderRadius: 999, padding: "6px 12px", pointerEvents: "none" };
}

function RailCard({ title, tag, right, children }: { title: string; tag?: string; right?: string; children: React.ReactNode }) {
  return (
    <div style={{ background: CHIP_BG, border: `1px solid ${CHIP_BR}`, borderRadius: 16, padding: "14px 16px", boxShadow: "0 14px 30px -26px rgba(80,55,20,.4)" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 4 }}>
        <div style={{ fontFamily: DISP, fontSize: 16, fontWeight: 700, color: INK, letterSpacing: "-0.01em" }}>{title}</div>
        {tag && <span style={labelStyle(12)}>{tag}</span>}
        {right && <span style={{ ...labelStyle(12), fontWeight: 700 }}>{right}</span>}
      </div>
      {children}
    </div>
  );
}

function QueueRow({ status, title, detail, meta }: { status: Status; title: string; detail?: string; meta?: string }) {
  const mark = status === "LIVE" || status === "WORKING"
    ? <span className="gp-live-pulse" style={{ color: GREEN, animation: "gpPulse 1.6s infinite" }}>●</span>
    : status === "QUEUED" ? <span style={{ color: LABEL }}>○</span>
    : <span style={{ color: LABEL }}>✓</span>;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 0", borderTop: `1px solid ${HAIR}` }}>
      <span style={{ flexShrink: 0, fontSize: 13 }}>{mark}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontFamily: SANS, fontSize: 13.5, color: status === "DONE" ? BODY_C : INK, fontWeight: status === "LIVE" || status === "WORKING" ? 700 : 500,
          textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</span>
        {detail && <span style={{ display: "block", fontFamily: SANS, fontSize: 13, color: BODY_C, lineHeight: 1.35, marginTop: 2 }}>{detail}</span>}
      </span>
      {meta && <span style={{ ...labelStyle(12), flexShrink: 0 }}>{meta}</span>}
      <span style={{ ...labelStyle(12), flexShrink: 0 }}>{status}</span>
    </div>
  );
}

function LedgerCard({ children }: { children: React.ReactNode }) {
  return <div style={{ background: CHIP_BG, border: `1px solid ${CHIP_BR}`, borderRadius: 16, overflow: "hidden" }}>{children}</div>;
}

function Empty({ text }: { text: string }) {
  return <div style={{ fontFamily: SANS, fontSize: 13.5, color: BODY_C, padding: "22px 16px", textAlign: "center" }}>{text}</div>;
}

function MemCard({ label, value, sub, fill }: { label: string; value: string; sub: string; fill?: number }) {
  return (
    <div style={{ background: CHIP_BG, border: `1px solid ${CHIP_BR}`, borderRadius: 14, padding: "14px 15px" }}>
      <div style={labelStyle(12.5, ".14em")}>{label}</div>
      <div style={{ fontFamily: DISP, fontSize: 20, fontWeight: 700, color: INK, margin: "6px 0 3px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value}</div>
      <div style={{ fontFamily: SANS, fontSize: 13, color: BODY_C, lineHeight: 1.4 }}>{sub}</div>
      {typeof fill === "number" && (
        <div style={{ marginTop: 9, height: 5, borderRadius: 99, background: "rgba(33,26,18,0.08)", overflow: "hidden" }}>
          <div style={{ width: `${Math.min(100, Math.max(0, fill * 100))}%`, height: "100%", background: fill >= 0.8 ? TERRA : GOLD }} />
        </div>
      )}
    </div>
  );
}

// hotel-styled kanban board (Board pane / Runs tab)
function Board({ mc, liveRun, full }: { mc: MC; liveRun: LiveRun | null; full?: boolean }) {
  const doneItems = doneForDisplay(mc.kanban);
  const liveDoneNotPersisted = !!(
    liveRun?.done
    && !doneItems.some((item) => item.title === liveRun.title)
  );
  const cols: { title: Status; items: KItem[]; accent: string; live?: boolean; empty: string }[] = [
    { title: "QUEUED", items: queuedForDisplay(mc.kanban), accent: LABEL, empty: "The queue is clear." },
    // workingSansDone: a finished item must never sit in Working and Done at once.
    { title: "WORKING", items: workingSansDone(mc.kanban, liveRun), accent: GREEN, live: true, empty: "Dispatch a goal to start a run." },
    { title: "DONE", items: doneItems, accent: GOLD, empty: "Nothing has finished yet." },
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: full ? "repeat(auto-fit,minmax(220px,1fr))" : "repeat(auto-fit,minmax(180px,1fr))", gap: 12 }}>
      {cols.map((c) => {
        const extra = c.live && isWorkingLiveRun(liveRun) && liveRun
          ? 1
          : c.title === "DONE" && liveDoneNotPersisted ? 1 : 0;
        return (
          <div key={c.title} style={{ background: "#F3EBD6", borderRadius: 14, border: `1px solid ${HAIR}`, padding: 11, minHeight: 120 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 9, padding: "0 3px" }}>
              <span style={{ fontFamily: DISP, fontSize: 14.5, fontWeight: 700, color: INK }}>{c.title}</span>
              <span style={{ ...labelStyle(12), background: CHIP_BG, border: `1px solid ${CHIP_BR}`, borderRadius: 99, padding: "0 8px" }}>{c.items.length + extra}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {c.live && isWorkingLiveRun(liveRun) && liveRun && (
                <BoardCard accent={GREEN} title={agentOfficeTaskDisplayTitle(liveRun.taskKind, liveRun.title)} detail={liveRun.steps.map((s) => s.skill).join(" → ") || "Waiting for the required tool…"} status="LIVE" pulse />
              )}
              {c.title === "DONE" && liveDoneNotPersisted && liveRun && (
                <BoardCard accent={liveRun.billing?.outcome === "refunded" ? TERRA : GOLD} title={agentOfficeTaskDisplayTitle(liveRun.taskKind, liveRun.title)} detail={terminalHistoryDetail(liveRun)} status="DONE" />
              )}
              {c.items.length + extra === 0 ? (
                <div style={{ fontFamily: SANS, fontSize: 13, color: BODY_C, textAlign: "center", padding: "14px 8px", border: `1px dashed ${CHIP_BR}`, borderRadius: 10 }}>{c.empty}</div>
              ) : c.items.slice(0, full ? 40 : 5).map((it, index) => (
                <BoardCard key={`${c.title}-${index}-${String(it.id)}`} accent={c.accent} title={it.title}
                  detail={it.detail || it.reason || it.skill}
                  status={c.title} meta={it.kind || it.skill} sub={it.at ? relTime(it.at) : undefined}
                  historyItem={c.title === "DONE" ? it : undefined} historyPetId={mc.pet.id} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function BoardCard({ title, detail, status, meta, sub, accent, pulse, historyItem, historyPetId }: {
  title: string;
  detail?: string;
  status: Status;
  meta?: string;
  sub?: string;
  accent: string;
  pulse?: boolean;
  historyItem?: KItem;
  historyPetId?: number;
}) {
  return (
    <div className={pulse ? "gp-live-pulse" : undefined} style={{ background: CHIP_BG, borderRadius: 11, border: `1px solid ${CHIP_BR}`, borderLeft: `3px solid ${accent}`, padding: "10px 11px", animation: pulse ? "gpPulse 2s infinite" : undefined }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <span style={{ fontFamily: SANS, fontSize: 13.5, fontWeight: 700, color: INK, lineHeight: 1.35, minWidth: 0 }}>{title}</span>
        <span style={{ ...labelStyle(12), flexShrink: 0, background: "#F5EDD8", borderRadius: 6, padding: "1px 7px", height: "fit-content" }}>{status}</span>
      </div>
      {detail && <div style={{ fontFamily: SANS, fontSize: 13, color: BODY_C, marginTop: 4, lineHeight: 1.4, wordBreak: "break-word" }}>{detail}</div>}
      {meta && <div style={{ ...labelStyle(12), marginTop: 4 }}>{meta}</div>}
      {sub && <div style={{ ...labelStyle(12), marginTop: 4 }}>{sub}</div>}
      {historyItem?.runId && historyItem.state === "terminal" && historyPetId && (
        <RunHistoryDetails item={historyItem} petId={historyPetId} />
      )}
    </div>
  );
}

function RunHistoryDetails({ item, petId }: { item: KItem; petId: number }) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [runIdCopyState, setRunIdCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [receipt, setReceipt] = useState<LiveRun | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const answer = receipt?.answer || "";
  const loadReceipt = async () => {
    if (receipt || loading || !item.runId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const result = await api.pets.agentRunStatus(petId, item.runId);
      if (!isTerminalPaidAgentRunReceipt(
        result,
        item.runId,
        { executionContract: item.executionContract },
      )) {
        throw new Error("The saved run has no matching typed-task terminal receipt.");
      }
      setReceipt({
        runId: result.runId,
        title: result.goal || item.title,
        taskKind: item.taskKind
          || agentOfficeTaskKindFromExecutionContract(result.executionContract || "")
          || undefined,
        steps: Array.isArray(result.steps)
          ? result.steps.map((step: any) => ({
            skill: String(step?.skill || "unknown"),
            ok: step?.ok === true,
            complete: true,
            evidence: step?.skill === "recall_memory" && step?.ok === true
              ? recallEvidenceFromOutput(step.output)
              : undefined,
          }))
          : [],
        done: true,
        state: "terminal",
        answer: result.answer || "",
        completed: result.completed === true,
        stoppedReason: result.stoppedReason,
        billing: result.billing,
        creditsRemaining: result.creditsRemaining,
      });
    } catch (error: unknown) {
      setLoadError(error instanceof Error ? error.message : "The saved receipt could not be loaded.");
    } finally {
      setLoading(false);
    }
  };
  const copy = async () => {
    if (!answer) return;
    try {
      await navigator.clipboard.writeText(answer);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  };
  const copyRunId = async () => {
    if (!item.runId) return;
    try {
      await navigator.clipboard.writeText(item.runId);
      setRunIdCopyState("copied");
    } catch {
      setRunIdCopyState("failed");
    }
  };
  return (
    <details
      onToggle={(event) => { if (event.currentTarget.open) void loadReceipt(); }}
      style={{ marginTop: 8, borderTop: `1px solid ${HAIR}`, paddingTop: 7 }}
    >
      <summary style={{ fontFamily: SANS, fontSize: 13, color: LABEL, fontWeight: 700, cursor: "pointer" }}>
        Open saved result
      </summary>
      <div role={loadError ? "alert" : "status"} aria-live={loadError ? "assertive" : "polite"} style={{ fontFamily: SANS, fontSize: 13, color: loadError ? "#991B1B" : BODY_C, lineHeight: 1.5, marginTop: 7 }}>
        {loading
          ? "Loading the owner-scoped receipt…"
          : loadError
            ? loadError
            : receipt
              ? "Owner-scoped receipt loaded."
              : "Open this row to load its private receipt."}
      </div>
      {receipt && (
        <div style={{ fontFamily: SANS, fontSize: 13, color: INK, whiteSpace: "pre-wrap", overflowWrap: "anywhere", lineHeight: 1.5, marginTop: 7 }}>
          {answer || "No answer was returned for this terminal run."}
        </div>
      )}
      {receipt?.steps.some((step) => step.evidence) && (
        <details style={{ marginTop: 7 }}>
          <summary style={{ fontFamily: SANS, fontSize: 13, color: LABEL, fontWeight: 700, cursor: "pointer" }}>Recall evidence</summary>
          {receipt.steps.flatMap((step) => step.evidence?.matches || []).map((match, index) => (
            <div key={`${match.key}-${index}`} style={{ marginTop: 6, border: `1px solid ${CHIP_BR}`, borderRadius: 8, padding: "7px 8px", fontFamily: SANS, fontSize: 13, color: BODY_C, overflowWrap: "anywhere" }}>
              <b style={{ color: INK }}>{match.category}</b> · {match.source}{match.timestamp ? ` · ${relTime(match.timestamp)}` : ""}
              <div><code style={{ fontFamily: MONO }}>Record: {match.key}</code></div>
              <div style={{ color: INK }}>{match.excerpt || "Sensitive excerpt hidden."}</div>
            </div>
          ))}
        </details>
      )}
      <code style={{ display: "block", marginTop: 7, fontFamily: MONO, fontSize: 13, color: BODY_C, overflowWrap: "anywhere" }}>{item.runId}</code>
      <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginTop: 7 }}>
        <button type="button" onClick={copy} disabled={!answer || loading}
          style={{ border: `1px solid ${CHIP_BR}`, borderRadius: 8, background: "#FFFDF8", color: INK, padding: "6px 9px", fontFamily: SANS, fontSize: 13, fontWeight: 700, cursor: answer ? "pointer" : "not-allowed" }}>
          {copyState === "copied" ? "Copied" : copyState === "failed" ? "Copy failed" : "Copy result"}
        </button>
        <button type="button" onClick={copyRunId}
          style={{ border: `1px solid ${CHIP_BR}`, borderRadius: 8, background: "#FFFDF8", color: INK, padding: "6px 9px", fontFamily: SANS, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          {runIdCopyState === "copied" ? "Run ID copied" : runIdCopyState === "failed" ? "Copy failed" : "Copy run ID"}
        </button>
      </div>
      <div style={{ ...labelStyle(12), marginTop: 6 }}>READ-ONLY RECEIPT · NO REPLAY · NO NEW CHARGE</div>
    </details>
  );
}
