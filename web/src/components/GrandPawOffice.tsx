"use client";

/**
 * GrandPawOffice — "The Grand Paw" pet-hotel Agent Office.
 *
 * A faithful port of the founder-approved Grand Paw reference: a grand-hotel
 * lobby diorama (GrandPaw3D) wrapped in a concierge dashboard — greeting hero,
 * dispatch bar, Who's-where rail, Queue, routines — ALL fed from the same real
 * mission-control payload AgentOffice already polls. No fabricated data:
 * counts, tasks, times and names are live; the two staff pets beyond the
 * owner's roster are hotel fiction (named staff characters, no fake work claims
 * about the owner's data).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * VOICE SPEC (single source of truth — every string/style in this file
 * MUST match one of these five registers; audit against it before editing):
 *
 * 1. LABELS (eyebrows, chips, tags, room/cadence badges, mono metadata):
 *    var(--ed-m) mono · UPPERCASE · 12–13px · letterSpacing .12–.14em ·
 *    color LABEL #9A7B4E. No other mono color, size, or tracking exists.
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

import { useEffect, useMemo, useState } from "react";
import type { MC, LiveRun, KItem } from "./AgentOffice";
import GrandPaw3D, { GrandPawLive } from "./GrandPaw3D";

// ── hotel palette (voice-spec tokens) ──
const BG = "#FAF6ED";
const INK = "#211A12";           // headings + primary text (spec ink)
const BODY_C = "#5C5140";        // register 3: all body/helper text
const LABEL = "#9A7B4E";         // register 1: all mono labels/chips
const HAIR = "#E7DDC6";
const CHIP_BG = "#FFFDF6";
const CHIP_BR = "#E5DABC";
const GOLD = "#A8802B";          // graphics only (meter fill) — never text
const GREEN = "#4E7A44";         // graphics only (status dots) — never text
const TERRA = "#B4552D";         // graphics only (accents/meter) — never text
const DIM = "rgba(33,26,18,0.22)"; // graphics only (inactive dots)
const SERIF = "'Marcellus', 'Bricolage Grotesque', serif"; // greeting ONLY
const DISP = "var(--ed-disp, 'Bricolage Grotesque', system-ui, sans-serif)";
const MONO = "var(--ed-m, 'Space Mono', ui-monospace, monospace)";
const SANS = "var(--ed-body, 'Hanken Grotesk', -apple-system, sans-serif)";

// register-1 label style — the ONE way mono text renders in this file
function labelStyle(size: 12 | 12.5 | 13 = 12.5, spacing: ".12em" | ".14em" = ".12em"): React.CSSProperties {
  return { fontFamily: MONO, fontSize: size, letterSpacing: spacing, textTransform: "uppercase", color: LABEL };
}

type Tab = "overview" | "runs" | "routines" | "memory" | "staff";
type Status = "IDLE" | "WORKING" | "QUEUED" | "DONE" | "LIVE"; // register 5

// In local dev the api layer serves the office from its dev-mock fixture
// (Sparky/Aqua) — label that cast DEMO instead of claiming it's the user's pet.
const IS_DEMO = process.env.NODE_ENV === "development";

type CastMember = { name: string; kind: "yours" | "staff"; role: string; room: string; status: Status; line: string };

// DONE always beats WORKING (audit P1): after a live run finishes, the ~7s
// mission-control poll can still list the same item under `working` (sometimes
// while it already sits in `done`), which flickered finished work back to
// WORKING. Drop anything the payload marks done — or that matches the finished
// live run — from the working set before ANY surface renders it.
function workingSansDone(kanban: MC["kanban"], liveRun: LiveRun | null): KItem[] {
  const doneIds = new Set(kanban.done.map((it) => String(it.id)));
  const doneTitles = new Set(kanban.done.map((it) => it.title));
  if (liveRun?.done) doneTitles.add(liveRun.title);
  return kanban.working.filter((it) => !doneIds.has(String(it.id)) && !doneTitles.has(it.title));
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

export default function GrandPawOffice({ mc, liveRun, running, isWorking, petName, pets, goal, setGoal, onDispatch, cost }: {
  mc: MC; liveRun: LiveRun | null; running: boolean; isWorking: boolean; petName: string;
  pets: any[]; goal: string; setGoal: (s: string) => void; onDispatch: () => void; cost: number;
}) {
  const [tab, setTab] = useState<Tab>("overview");
  const [pane, setPane] = useState<"lobby" | "board">("lobby");
  const [now, setNow] = useState(() => new Date());

  // Mobile: the fixed "1fr + 330px rail" grid and the 620px diorama shot past
  // a phone viewport. Under 880px the rail stacks below the diorama, the 3D
  // canvas (width is already fluid) drops to a phone-friendly height, and the
  // keyboard-shortcut chrome (⌘K) hides.
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

  // ⌘K focuses dispatch · ⌘1/⌘2 switch lobby/board (as in the reference)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        (document.getElementById("gp-dispatch") as HTMLInputElement | null)?.focus();
      } else if ((e.metaKey || e.ctrlKey) && e.key === "1") { e.preventDefault(); setTab("overview"); setPane("lobby"); }
      else if ((e.metaKey || e.ctrlKey) && e.key === "2") { e.preventDefault(); setTab("overview"); setPane("board"); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const nextSchedule = useMemo(() => {
    const withNext = mc.schedules.filter((s) => s.nextRun).sort((a, b) => +new Date(a.nextRun!) - +new Date(b.nextRun!));
    return withNext[0] || mc.schedules[0] || null;
  }, [mc.schedules]);

  // Working items with anything already DONE filtered out (see workingSansDone).
  const workingItems = useMemo(() => workingSansDone(mc.kanban, liveRun), [mc.kanban, liveRun]);
  const workingTitle = liveRun && !liveRun.done ? liveRun.title : workingItems[0]?.title;
  const runningCount = workingItems.length + (liveRun && !liveRun.done ? 1 : 0);
  const doneToday = mc.kanban.done.length;
  // Recomputed locally (not the isWorking prop) so the header chip can never
  // say WORKING off a stale payload row that is actually DONE.
  const busyNow = runningCount > 0 || running;

  // hotel cast: the owner's real pets first (real names, real status), remaining
  // slots are the hotel's own staff characters — labeled NPC everywhere so
  // provenance is never ambiguous. In local dev the office runs on the
  // dev-mock fixture, so the star is honestly labeled DEMO instead of YOUR PET.
  // Register 4: staff `line`s are the only NPC speech in the app, always
  // role — “Line!”; register 3: every `line` for real pets is a full sentence.
  const cast = useMemo(() => {
    const real: CastMember[] = pets.slice(0, 3).map((p: any, i: number) => ({
      name: ((p.name || `Pet #${p.id}`) as string).slice(0, 12),
      kind: "yours" as const,
      role: IS_DEMO ? "DEMO PET" : "YOUR PET",
      room: i === 0 ? "FRONT DESK" : i === 1 ? "WORKSHOP" : "LOBBY",
      status: (i === 0 && workingTitle ? "WORKING" : "IDLE") as Status,
      line: i === 0
        ? (workingTitle ? `Working on “${workingTitle}”.` : "Idle until you dispatch a goal.")
        : "Off duty until the next shift.",
    }));
    if (real.length === 0) {
      real.push({
        name: (petName || "Your pet").slice(0, 12), kind: "yours", role: IS_DEMO ? "DEMO PET" : "YOUR PET",
        room: "FRONT DESK", status: workingTitle ? "WORKING" : "IDLE",
        line: workingTitle ? `Working on “${workingTitle}”.` : "Idle until you dispatch a goal.",
      });
    }
    const staff: CastMember[] = [
      { name: "Mimi", kind: "staff", role: "COURIER · NPC", room: "WORKSHOP", status: "IDLE", line: "courier — “Skills delivery!”" },
      { name: "Toto", kind: "staff", role: "HOUSEKEEPER · NPC", room: "LOBBY", status: "IDLE", line: "housekeeper — “Tidy, tidy!”" },
    ];
    return [...real, ...staff].slice(0, 3);
  }, [pets, petName, workingTitle]);

  const yoursCount = cast.filter((c) => c.kind === "yours").length;
  const staffCount = cast.filter((c) => c.kind === "staff").length;

  const live3d: GrandPawLive = useMemo(() => ({
    // nameplates carry provenance into the diorama itself: the star wears the
    // owner's real pet name (DEMO-suffixed on the dev fixture), staff NPCs are
    // suffixed STAFF. Register 5: the diorama bubbles speak the same status
    // vocabulary as every chip — NPC speech never leaves the Who's-where rail.
    pets: cast.map((c) => ({
      name: c.kind === "staff" ? `${c.name} · STAFF` : IS_DEMO ? `${c.name} · DEMO` : c.name,
      task: c.status === "WORKING" && workingTitle ? `WORKING — ${workingTitle}` : c.status,
    })),
    memory: { count: mc.pillars.memory.count, cap: mc.pillars.memory.cap },
    skills: mc.pillars.skills.total,
    soulLv: mc.pet.level || 1,
    goals: mc.kanban.pending.length,
    next: nextSchedule?.nextRun ? clockOf(nextSchedule.nextRun) : "—",
  }), [cast, mc, nextSchedule, workingTitle]);

  const hour = now.getHours();
  const greet = hour < 5 ? "Evening" : hour < 12 ? "Morning" : hour < 18 ? "Afternoon" : "Evening";
  const eyebrow = `${now.toLocaleDateString("en-US", { weekday: "long" })}, ${now.toLocaleDateString("en-US", { month: "short", day: "2-digit" })} · ${String(hour).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")} · Agent Office`;

  return (
    <div style={{ background: BG, borderRadius: 22, border: `1px solid ${HAIR}`, padding: narrow ? "18px 14px 20px" : "22px 24px 26px", margin: "0 -4px" }}>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Marcellus&display=swap" />
      <style>{`@keyframes gpPulse{0%,100%{opacity:1}50%{opacity:.45}}`}</style>

      {/* ── tabs (register 1; active state goes ink) ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", paddingBottom: 14, borderBottom: `1px solid ${HAIR}`, marginBottom: 18 }}>
        {(["overview", "runs", "routines", "memory", "staff"] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            style={{ ...labelStyle(12.5), background: "none", border: "none", padding: "4px 1px", cursor: "pointer",
              fontWeight: tab === t ? 700 : 400, color: tab === t ? INK : LABEL,
              boxShadow: tab === t ? `inset 0 -2px 0 ${INK}` : "none" }}>
            {t}
          </button>
        ))}
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ ...labelStyle(12.5), display: "inline-flex", alignItems: "center", gap: 7, padding: "5px 12px", borderRadius: 999, background: CHIP_BG, border: `1px solid ${CHIP_BR}` }}>
            <span style={{ width: 7, height: 7, borderRadius: 99, background: busyNow ? GREEN : DIM, animation: busyNow ? "gpPulse 1.6s infinite" : undefined }} />
            {IS_DEMO ? "DEMO PET" : "YOUR PET"}
            {petName && petName !== "your pet" ? ` · ${petName.toUpperCase().slice(0, 14)}` : ""} · {busyNow ? "WORKING" : "IDLE"}
          </span>
          {tab === "overview" && (
            <span style={{ display: "inline-flex", background: CHIP_BG, border: `1px solid ${CHIP_BR}`, borderRadius: 999, padding: 3 }}>
              {(["lobby", "board"] as const).map((p) => (
                <button key={p} onClick={() => setPane(p)}
                  style={{ ...labelStyle(12), fontWeight: pane === p ? 700 : 400, padding: "4px 13px", borderRadius: 999, border: "none", cursor: "pointer",
                    background: pane === p ? "#F1E7CC" : "transparent", color: pane === p ? INK : LABEL }}>
                  {p}{!narrow && <> ⌘{p === "lobby" ? 1 : 2}</>}
                </button>
              ))}
            </span>
          )}
        </div>
      </div>

      {/* ── hero ── */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ ...labelStyle(13, ".14em"), marginBottom: 8 }}>{eyebrow}</div>
        <h1 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: "clamp(28px,4.4vw,44px)", color: INK, margin: 0, lineHeight: 1.08, letterSpacing: "0.005em" }}>
          {greet}. Welcome to The Grand Paw.
        </h1>
        <div style={{ ...labelStyle(13), marginTop: 9 }}>
          {runningCount} WORKING · {doneToday} DONE TODAY · NEXT ROUTINE {nextSchedule?.nextRun ? clockOf(nextSchedule.nextRun) : "NOT SCHEDULED"}
        </div>
      </div>

      {/* ── dispatch bar ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 0, background: CHIP_BG, border: `1px solid ${CHIP_BR}`, borderRadius: 16, padding: 8, marginBottom: 18, boxShadow: "0 14px 30px -24px rgba(80,55,20,.45)" }}>
        <input id="gp-dispatch" aria-label={`Goal for ${petName}`} value={goal} onChange={(e) => setGoal(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") onDispatch(); }}
          placeholder={`Ask the hotel for anything — ${petName} will take it.`}
          maxLength={600}
          style={{ flex: 1, minWidth: 160, border: "none", outline: "none", background: "transparent", fontFamily: SANS, fontSize: 14, color: INK, padding: "8px 12px" }} />
        {!narrow && <span style={{ ...labelStyle(12), border: `1px solid ${CHIP_BR}`, borderRadius: 7, padding: "3px 7px", marginRight: 8 }}>⌘K</span>}
        <button onClick={onDispatch} disabled={goal.trim().length < 3 || running}
          style={{ fontFamily: SANS, fontSize: 14.5, fontWeight: 700, color: "#FFF9EC", padding: "11px 22px", borderRadius: 12, border: "none",
            cursor: goal.trim().length >= 3 && !running ? "pointer" : "not-allowed",
            background: goal.trim().length >= 3 && !running ? INK : "rgba(33,26,18,0.25)" }}>
          {running ? "Working…" : "Dispatch"}
        </button>
      </div>

      {tab === "overview" && (
        <div style={{ display: "grid", gridTemplateColumns: narrow ? "minmax(0,1fr)" : "minmax(0,1fr) 330px", gap: 18, alignItems: "start" }}>
          {/* main pane: lobby diorama or board */}
          <div style={{ minWidth: 0 }}>
            {pane === "lobby" ? (
              <div style={{ position: "relative" }}>
                <GrandPaw3D live={live3d} height={narrow ? 400 : 620} />
                <div style={chipFloat({ left: 14, bottom: 14 })}>
                  ● {IS_DEMO ? "DEMO PET" : yoursCount > 1 ? `YOUR ${yoursCount} PETS` : "YOUR PET"}
                  {staffCount > 0 ? ` + ${staffCount} HOTEL STAFF` : ""} · {runningCount} WORKING
                </div>
                {!narrow && <div style={chipFloat({ right: 14, bottom: 14 })}>DRAG TO ORBIT · SCROLL TO ZOOM</div>}
              </div>
            ) : (
              <Board mc={mc} liveRun={liveRun} />
            )}
          </div>

          {/* right rail */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <RailCard title="Who's where" tag="LIVE">
              {(["yours", "staff"] as const).map((kind) => {
                const rows = cast.filter((c) => c.kind === kind);
                if (rows.length === 0) return null;
                return (
                  <div key={kind}>
                    <div style={{ ...labelStyle(12), margin: "10px 0 4px" }}>
                      {kind === "yours" ? (IS_DEMO ? "DEMO PET" : rows.length > 1 ? "YOUR PETS" : "YOUR PET") : "HOTEL STAFF · NPC"}
                    </div>
                    {rows.map((c) => (
                      <div key={c.name} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 0", borderTop: `1px solid ${HAIR}` }}>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontFamily: SANS, fontSize: 14, color: INK }}>
                            <b>{c.name}</b> <span style={labelStyle(12)}>{c.role}</span>
                          </div>
                          {/* register 3 for real pets (full sentences); register 4 for NPC speech */}
                          <div style={{ fontFamily: SANS, fontSize: 13, color: BODY_C, fontStyle: c.kind === "staff" ? "italic" : undefined, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {c.status === "WORKING" && <span style={{ color: GREEN, animation: "gpPulse 1.6s infinite" }}>● </span>}
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
              {runningCount === 0 && mc.kanban.pending.length === 0 && doneToday === 0 && (
                <div style={{ fontFamily: SANS, fontSize: 13, color: BODY_C, padding: "10px 0" }}>Quiet at the desk — dispatch a goal above.</div>
              )}
              {liveRun && !liveRun.done && <QueueRow state="run" title={liveRun.title} right="LIVE" />}
              {workingItems.map((it) => <QueueRow key={String(it.id)} state="run" title={it.title} right="WORKING" />)}
              {mc.kanban.pending.slice(0, 3).map((it) => <QueueRow key={String(it.id)} state="queued" title={it.title} right="QUEUED" />)}
              {mc.kanban.done.slice(0, 4).map((it) => <QueueRow key={String(it.id)} state="done" title={it.title} right={`DONE ${clockOf(it.at)}`} />)}
            </RailCard>

            <RailCard title="Next routine" right={nextSchedule?.nextRun ? clockOf(nextSchedule.nextRun) : "—"}>
              {nextSchedule ? (
                <div style={{ padding: "8px 0" }}>
                  <div style={{ fontFamily: SANS, fontSize: 14, fontWeight: 700, color: INK }}>{nextSchedule.name}</div>
                  <div style={{ fontFamily: SANS, fontSize: 13, color: BODY_C, marginTop: 3 }}>{nextSchedule.desc}</div>
                  <div style={{ ...labelStyle(12), marginTop: 6 }}>{nextSchedule.cadence} · LAST {relTime(nextSchedule.lastRun)}</div>
                </div>
              ) : (
                <div style={{ fontFamily: SANS, fontSize: 13, color: BODY_C, padding: "8px 0" }}>No routines are scheduled yet.</div>
              )}
            </RailCard>
          </div>
        </div>
      )}

      {tab === "runs" && <Board mc={mc} liveRun={liveRun} full />}

      {tab === "routines" && (
        <LedgerCard>
          {mc.schedules.length === 0 && <Empty text="No routines are on the books yet." />}
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
            sub={mc.pillars.soul.set ? `The persona is locked at version ${mc.pillars.soul.checkpoints}.` : "Onboarding is open — no persona is set yet."} />
          <MemCard label="MEMORY" value={`${mc.pillars.memory.count} / ${mc.pillars.memory.cap}`}
            sub={mc.pillars.memory.lastFact ? `The latest entry is “${mc.pillars.memory.lastFact.slice(0, 52)}${mc.pillars.memory.lastFact.length > 52 ? "…" : ""}”.` : "The ledger is empty."}
            fill={mc.pillars.memory.count / mc.pillars.memory.cap} />
          <MemCard label="USER" value={`${mc.pillars.user.count} / ${mc.pillars.user.cap}`} sub="Facts your pet keeps about its owner." fill={mc.pillars.user.count / mc.pillars.user.cap} />
          <MemCard label="SKILLS" value={`${mc.pillars.skills.total}`} sub={`${mc.pillars.skills.installed} installed and ${mc.pillars.skills.learned} learned.`} />
          <MemCard label="CRONS" value={`${mc.pillars.crons.routines}`} sub={mc.pillars.crons.nextLabel} />
        </div>
      )}

      {tab === "staff" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 12 }}>
          {mc.roster.map((s) => (
            <div key={s.id} style={{ background: CHIP_BG, border: `1px solid ${CHIP_BR}`, borderRadius: 14, padding: "12px 14px", opacity: s.installed ? 1 : 0.6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 7, height: 7, borderRadius: 99, background: s.status === "active" ? GREEN : DIM }} />
                <span style={{ fontFamily: SANS, fontSize: 14, fontWeight: 700, color: INK, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</span>
                <span style={{ ...labelStyle(12), marginLeft: "auto" }}>{s.kind}</span>
              </div>
              <div style={{ fontFamily: SANS, fontSize: 13, color: BODY_C, marginTop: 5, minHeight: 32, lineHeight: 1.4 }}>{s.role}</div>
              <div style={{ ...labelStyle(12), marginTop: 6 }}>
                {s.runs} RUNS{typeof s.successRate === "number" ? ` · ${s.successRate}%` : ""}{s.lastAt ? ` · ${relTime(s.lastAt)}` : ""}
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ fontFamily: SANS, fontSize: 13, color: BODY_C, marginTop: 18, textAlign: "center" }}>
        Each dispatch costs {cost} credits and is refunded if no real skill runs. Live from PetClaw, refreshed every 7 seconds.
      </div>
    </div>
  );
}

// ── pieces ──

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

function QueueRow({ state, title, right }: { state: "run" | "queued" | "done"; title: string; right?: string }) {
  const mark = state === "run" ? <span style={{ color: GREEN, animation: "gpPulse 1.6s infinite" }}>●</span>
    : state === "queued" ? <span style={{ color: LABEL }}>○</span>
    : <span style={{ color: LABEL }}>✓</span>;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 0", borderTop: `1px solid ${HAIR}` }}>
      <span style={{ flexShrink: 0, fontSize: 12 }}>{mark}</span>
      <span style={{ flex: 1, minWidth: 0, fontFamily: SANS, fontSize: 13.5, color: state === "done" ? BODY_C : INK, fontWeight: state === "run" ? 700 : 500,
        textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</span>
      {right && <span style={{ ...labelStyle(12), flexShrink: 0 }}>{right}</span>}
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
  const cols: { title: string; items: KItem[]; accent: string; live?: boolean; empty: string }[] = [
    { title: "Queued", items: mc.kanban.pending, accent: LABEL, empty: "Nothing is queued." },
    // workingSansDone: a finished item must never sit in Working and Done at once.
    { title: "Working", items: workingSansDone(mc.kanban, liveRun), accent: GREEN, live: true, empty: "Nothing is running — dispatch a goal." },
    { title: "Blocked", items: mc.kanban.blocked, accent: TERRA, empty: "Nothing is blocked." },
    { title: "Done today", items: mc.kanban.done, accent: GOLD, empty: "Nothing has finished yet today." },
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: full ? "repeat(auto-fit,minmax(220px,1fr))" : "repeat(2,minmax(0,1fr))", gap: 12 }}>
      {cols.map((c) => {
        const extra = c.live && liveRun && !liveRun.done ? 1 : 0;
        return (
          <div key={c.title} style={{ background: "#F3EBD6", borderRadius: 14, border: `1px solid ${HAIR}`, padding: 11, minHeight: 120 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 9, padding: "0 3px" }}>
              <span style={{ fontFamily: DISP, fontSize: 14.5, fontWeight: 700, color: INK }}>{c.title}</span>
              <span style={{ ...labelStyle(12), background: CHIP_BG, border: `1px solid ${CHIP_BR}`, borderRadius: 99, padding: "0 8px" }}>{c.items.length + extra}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {c.live && liveRun && !liveRun.done && (
                <BoardCard accent={GREEN} title={liveRun.title} detail={liveRun.steps.map((s) => s.skill).join(" → ") || "Planning the run…"} tag="LIVE" pulse />
              )}
              {c.items.length + extra === 0 ? (
                <div style={{ fontFamily: SANS, fontSize: 13, color: BODY_C, textAlign: "center", padding: "14px 8px", border: `1px dashed ${CHIP_BR}`, borderRadius: 10 }}>{c.empty}</div>
              ) : c.items.slice(0, full ? 40 : 5).map((it) => (
                <BoardCard key={String(it.id)} accent={c.accent} title={it.title}
                  detail={it.detail || it.reason || it.skill}
                  tag={it.kind || it.skill} sub={it.at ? relTime(it.at) : undefined} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function BoardCard({ title, detail, tag, sub, accent, pulse }: { title: string; detail?: string; tag?: string; sub?: string; accent: string; pulse?: boolean }) {
  return (
    <div style={{ background: CHIP_BG, borderRadius: 11, border: `1px solid ${CHIP_BR}`, borderLeft: `3px solid ${accent}`, padding: "10px 11px", animation: pulse ? "gpPulse 2s infinite" : undefined }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <span style={{ fontFamily: SANS, fontSize: 13.5, fontWeight: 700, color: INK, lineHeight: 1.35, minWidth: 0 }}>{title}</span>
        {tag && <span style={{ ...labelStyle(12), flexShrink: 0, background: "#F5EDD8", borderRadius: 6, padding: "1px 7px", height: "fit-content" }}>{tag}</span>}
      </div>
      {detail && <div style={{ fontFamily: SANS, fontSize: 13, color: BODY_C, marginTop: 4, lineHeight: 1.4, wordBreak: "break-word" }}>{detail}</div>}
      {sub && <div style={{ ...labelStyle(12), marginTop: 4 }}>{sub}</div>}
    </div>
  );
}
