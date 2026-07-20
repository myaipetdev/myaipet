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
 */

import { useEffect, useMemo, useState } from "react";
import type { MC, LiveRun, KItem } from "./AgentOffice";
import GrandPaw3D, { GrandPawLive } from "./GrandPaw3D";

// ── hotel palette (from the reference) ──
const BG = "#FAF6ED";
const INK = "#221D12";
const MUT = "#6B6250";
const MUT2 = "#8A8070";
const HAIR = "#E7DDC6";
const CHIP_BG = "#FFFDF6";
const CHIP_BR = "#E5DABC";
const GOLD = "#A8802B";
const GREEN = "#4E7A44";
const TERRA = "#B4552D";
const SERIF = "'Marcellus', 'Bricolage Grotesque', serif";
const MONO = "'IBM Plex Mono', var(--ed-m, ui-monospace), monospace";
const SANS = "var(--ed-body, -apple-system, sans-serif)";

type Tab = "overview" | "runs" | "routines" | "memory" | "staff";

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

  const workingTitle = liveRun && !liveRun.done ? liveRun.title : mc.kanban.working[0]?.title;
  const runningCount = mc.kanban.working.length + (liveRun && !liveRun.done ? 1 : 0);
  const doneToday = mc.kanban.done.length;

  // hotel cast: owner's real pets first (real names, real status), remaining
  // slots are the hotel's own staff characters (fiction, clearly not user data)
  const cast = useMemo(() => {
    const real = pets.slice(0, 3).map((p: any, i: number) => ({
      name: (p.name || `Pet #${p.id}`) as string,
      real: true,
      role: i === 0 ? "the owner's pet" : "the owner's pet",
      room: i === 0 ? "FRONT DESK" : i === 1 ? "WORKSHOP" : "LOBBY",
      task: i === 0
        ? (workingTitle ? `working: ${workingTitle}` : "idle — awaiting a goal")
        : "off duty",
    }));
    const staff = [
      { name: "Mimi", real: false, role: "hotel courier", room: "WORKSHOP", task: "skills delivery!" },
      { name: "Toto", real: false, role: "hotel housekeeper", room: "LOBBY", task: "tidy tidy~" },
    ];
    return [...real, ...staff].slice(0, 3);
  }, [pets, workingTitle]);

  const live3d: GrandPawLive = useMemo(() => ({
    pets: cast.map((c) => ({ name: c.name, task: c.task.replace(/^working: /, "") })),
    memory: { count: mc.pillars.memory.count, cap: mc.pillars.memory.cap },
    skills: mc.pillars.skills.total,
    soulLv: mc.pet.level || 1,
    goals: mc.kanban.pending.length,
    next: nextSchedule?.nextRun ? clockOf(nextSchedule.nextRun) : "—",
  }), [cast, mc, nextSchedule]);

  const hour = now.getHours();
  const greet = hour < 5 ? "Evening" : hour < 12 ? "Morning" : hour < 18 ? "Afternoon" : "Evening";
  const eyebrow = `${now.toLocaleDateString("en-US", { weekday: "long" }).toUpperCase()}, ${now.toLocaleDateString("en-US", { month: "short", day: "2-digit" }).toUpperCase()} · ${String(hour).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")} · AGENT OFFICE`;

  return (
    <div style={{ background: BG, borderRadius: 22, border: `1px solid ${HAIR}`, padding: narrow ? "18px 14px 20px" : "22px 24px 26px", margin: "0 -4px" }}>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Marcellus&family=IBM+Plex+Mono:wght@400;500;600&display=swap" />
      <style>{`@keyframes gpPulse{0%,100%{opacity:1}50%{opacity:.45}}`}</style>

      {/* ── tabs ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap", paddingBottom: 14, borderBottom: `1px solid ${HAIR}`, marginBottom: 18 }}>
        {(["overview", "runs", "routines", "memory", "staff"] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            style={{ background: "none", border: "none", padding: "4px 1px", cursor: "pointer", fontFamily: SANS, fontSize: 13.5, textTransform: "capitalize",
              fontWeight: tab === t ? 700 : 500, color: tab === t ? INK : MUT2,
              boxShadow: tab === t ? `inset 0 -2px 0 ${INK}` : "none" }}>
            {t}
          </button>
        ))}
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontFamily: MONO, fontSize: 12, padding: "5px 12px", borderRadius: 999, background: CHIP_BG, border: `1px solid ${CHIP_BR}`, color: MUT }}>
            <span style={{ width: 7, height: 7, borderRadius: 99, background: isWorking ? GREEN : "rgba(34,29,18,0.25)", animation: isWorking ? "gpPulse 1.6s infinite" : undefined }} />
            {petName} · {isWorking ? "working" : "idle"}
          </span>
          {tab === "overview" && (
            <span style={{ display: "inline-flex", background: CHIP_BG, border: `1px solid ${CHIP_BR}`, borderRadius: 999, padding: 3 }}>
              {(["lobby", "board"] as const).map((p) => (
                <button key={p} onClick={() => setPane(p)}
                  style={{ fontFamily: SANS, fontSize: 12.5, fontWeight: pane === p ? 700 : 500, textTransform: "capitalize", padding: "4px 13px", borderRadius: 999, border: "none", cursor: "pointer",
                    background: pane === p ? "#F1E7CC" : "transparent", color: pane === p ? INK : MUT2 }}>
                  {p}{!narrow && <> <span style={{ fontFamily: MONO, fontSize: 10, color: MUT2 }}>⌘{p === "lobby" ? 1 : 2}</span></>}
                </button>
              ))}
            </span>
          )}
        </div>
      </div>

      {/* ── hero ── */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontFamily: MONO, fontSize: 11.5, letterSpacing: "0.22em", color: MUT2, marginBottom: 8 }}>{eyebrow}</div>
        <h1 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: "clamp(28px,4.4vw,44px)", color: INK, margin: 0, lineHeight: 1.08, letterSpacing: "0.005em" }}>
          {greet}. Welcome to The Grand Paw.
        </h1>
        <div style={{ fontFamily: SANS, fontSize: 14, color: MUT, marginTop: 8 }}>
          {runningCount} running · {doneToday} done today · next routine {nextSchedule?.nextRun ? `at ${clockOf(nextSchedule.nextRun)}` : "not scheduled"}
        </div>
      </div>

      {/* ── dispatch bar ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 0, background: CHIP_BG, border: `1px solid ${CHIP_BR}`, borderRadius: 16, padding: 8, marginBottom: 18, boxShadow: "0 14px 30px -24px rgba(80,55,20,.45)" }}>
        <input id="gp-dispatch" aria-label={`Goal for ${petName}`} value={goal} onChange={(e) => setGoal(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") onDispatch(); }}
          placeholder={`Ask the hotel to do anything — ${petName} takes it`}
          maxLength={600}
          style={{ flex: 1, minWidth: 160, border: "none", outline: "none", background: "transparent", fontFamily: SANS, fontSize: 15, color: INK, padding: "8px 12px" }} />
        {!narrow && <span style={{ fontFamily: MONO, fontSize: 11, color: MUT2, border: `1px solid ${CHIP_BR}`, borderRadius: 7, padding: "3px 7px", marginRight: 8 }}>⌘K</span>}
        <button onClick={onDispatch} disabled={goal.trim().length < 3 || running}
          style={{ fontFamily: SANS, fontSize: 14.5, fontWeight: 700, color: "#FFF9EC", padding: "11px 22px", borderRadius: 12, border: "none",
            cursor: goal.trim().length >= 3 && !running ? "pointer" : "not-allowed",
            background: goal.trim().length >= 3 && !running ? INK : "rgba(34,29,18,0.25)" }}>
          {running ? "● Working…" : "Dispatch"}
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
                  ● PETS {Math.min(pets.length, 3) || 1} · {runningCount} WORKING
                </div>
                <div style={chipFloat({ right: 14, bottom: 14 })}>DRAG TO ORBIT · SCROLL TO ZOOM</div>
              </div>
            ) : (
              <Board mc={mc} liveRun={liveRun} />
            )}
          </div>

          {/* right rail */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <RailCard title="Who's where" tag="LIVE">
              {cast.map((c) => (
                <div key={c.name} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 0", borderTop: `1px solid ${HAIR}` }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontFamily: SANS, fontSize: 14, color: INK }}>
                      <b>{c.name}</b> <span style={{ fontFamily: MONO, fontSize: 11, color: MUT2 }}>{c.role}</span>
                    </div>
                    <div style={{ fontFamily: SANS, fontSize: 12.5, color: c.task.startsWith("working") ? GREEN : MUT, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {c.task.startsWith("working") && <span style={{ animation: "gpPulse 1.6s infinite" }}>● </span>}
                      {c.task}
                    </div>
                  </div>
                  <span style={{ flexShrink: 0, fontFamily: MONO, fontSize: 10, letterSpacing: "0.06em", color: c.real ? GOLD : MUT2, background: "#F5EDD8", borderRadius: 6, padding: "3px 8px" }}>{c.room}</span>
                </div>
              ))}
            </RailCard>

            <RailCard title="Queue">
              {runningCount === 0 && mc.kanban.pending.length === 0 && doneToday === 0 && (
                <div style={{ fontFamily: SANS, fontSize: 13, color: MUT, padding: "10px 0" }}>Quiet at the desk — dispatch a goal above.</div>
              )}
              {liveRun && !liveRun.done && <QueueRow state="run" title={liveRun.title} right={`${liveRun.steps.length} steps`} />}
              {mc.kanban.working.map((it) => <QueueRow key={String(it.id)} state="run" title={it.title} right="live" />)}
              {mc.kanban.pending.slice(0, 3).map((it) => <QueueRow key={String(it.id)} state="queued" title={it.title} right="queued" />)}
              {mc.kanban.done.slice(0, 4).map((it) => <QueueRow key={String(it.id)} state="done" title={it.title} right={clockOf(it.at)} />)}
            </RailCard>

            <RailCard title="Next routine" right={nextSchedule?.nextRun ? clockOf(nextSchedule.nextRun) : "—"}>
              {nextSchedule ? (
                <div style={{ padding: "8px 0" }}>
                  <div style={{ fontFamily: SANS, fontSize: 14.5, fontWeight: 700, color: INK }}>{nextSchedule.name}</div>
                  <div style={{ fontFamily: SANS, fontSize: 12.5, color: MUT, marginTop: 3 }}>{nextSchedule.desc}</div>
                  <div style={{ fontFamily: MONO, fontSize: 11.5, color: MUT2, marginTop: 6 }}>{nextSchedule.cadence} · last {relTime(nextSchedule.lastRun)}</div>
                </div>
              ) : (
                <div style={{ fontFamily: SANS, fontSize: 13, color: MUT, padding: "8px 0" }}>No routines yet.</div>
              )}
            </RailCard>
          </div>
        </div>
      )}

      {tab === "runs" && <Board mc={mc} liveRun={liveRun} full />}

      {tab === "routines" && (
        <LedgerCard>
          {mc.schedules.length === 0 && <Empty text="No routines on the books yet." />}
          {mc.schedules.map((s, i) => (
            <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 16px", borderTop: i ? `1px solid ${HAIR}` : "none", flexWrap: "wrap" }}>
              <span style={{ width: 8, height: 8, borderRadius: 99, background: s.lastRun ? GREEN : "rgba(34,29,18,0.2)" }} />
              <span style={{ fontFamily: SANS, fontSize: 14.5, fontWeight: 700, color: INK, minWidth: 130 }}>{s.name}</span>
              <span style={{ fontFamily: MONO, fontSize: 12, color: GOLD, background: "#F5EDD8", borderRadius: 6, padding: "2px 8px" }}>{s.cadence}</span>
              <span style={{ fontFamily: SANS, fontSize: 13, color: MUT, flex: 1, minWidth: 160 }}>{s.desc}</span>
              <span style={{ fontFamily: MONO, fontSize: 12, color: MUT2 }}>next {s.nextRun ? clockOf(s.nextRun) : "—"} · last {relTime(s.lastRun)}</span>
            </div>
          ))}
        </LedgerCard>
      )}

      {tab === "memory" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12 }}>
          <MemCard label="SOUL" value={mc.pillars.soul.set ? mc.pillars.soul.persona : "not set"} sub={`v${mc.pillars.soul.checkpoints} · ${mc.pillars.soul.set ? "persona frozen" : "onboarding open"}`} />
          <MemCard label="MEMORY" value={`${mc.pillars.memory.count} / ${mc.pillars.memory.cap}`} sub={mc.pillars.memory.lastFact ? `“${mc.pillars.memory.lastFact.slice(0, 60)}”` : "empty ledger"} fill={mc.pillars.memory.count / mc.pillars.memory.cap} />
          <MemCard label="USER" value={`${mc.pillars.user.count} / ${mc.pillars.user.cap}`} sub="owner profile facts" fill={mc.pillars.user.count / mc.pillars.user.cap} />
          <MemCard label="SKILLS" value={`${mc.pillars.skills.total}`} sub={`${mc.pillars.skills.installed} installed · ${mc.pillars.skills.learned} learned`} />
          <MemCard label="CRONS" value={`${mc.pillars.crons.routines}`} sub={mc.pillars.crons.nextLabel} />
        </div>
      )}

      {tab === "staff" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 12 }}>
          {mc.roster.map((s) => (
            <div key={s.id} style={{ background: CHIP_BG, border: `1px solid ${CHIP_BR}`, borderRadius: 14, padding: "12px 14px", opacity: s.installed ? 1 : 0.6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 7, height: 7, borderRadius: 99, background: s.status === "active" ? GREEN : "rgba(34,29,18,0.2)" }} />
                <span style={{ fontFamily: SANS, fontSize: 14, fontWeight: 700, color: INK, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</span>
                <span style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 10, color: s.kind === "vigil" ? TERRA : GOLD, letterSpacing: "0.06em" }}>{s.kind.toUpperCase()}</span>
              </div>
              <div style={{ fontFamily: SANS, fontSize: 12.5, color: MUT, marginTop: 5, minHeight: 32, lineHeight: 1.4 }}>{s.role}</div>
              <div style={{ fontFamily: MONO, fontSize: 11.5, color: MUT2, marginTop: 6 }}>
                {s.runs} runs{typeof s.successRate === "number" ? ` · ${s.successRate}%` : ""}{s.lastAt ? ` · ${relTime(s.lastAt)}` : ""}
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ fontFamily: MONO, fontSize: 11.5, color: "rgba(34,29,18,0.4)", marginTop: 18, textAlign: "center" }}>
        Costs {cost} credits per dispatch · refunded if no real skill runs · live from PetClaw, refreshed every 7s
      </div>
    </div>
  );
}

// ── pieces ──

function chipFloat(pos: React.CSSProperties): React.CSSProperties {
  return { position: "absolute", ...pos, fontFamily: MONO, fontSize: 10.5, letterSpacing: "0.08em", color: "#5E5340",
    background: "rgba(252,248,238,0.92)", border: "1px solid #D9C9A8", borderRadius: 999, padding: "6px 12px", pointerEvents: "none" };
}

function RailCard({ title, tag, right, children }: { title: string; tag?: string; right?: string; children: React.ReactNode }) {
  return (
    <div style={{ background: CHIP_BG, border: `1px solid ${CHIP_BR}`, borderRadius: 16, padding: "14px 16px", boxShadow: "0 14px 30px -26px rgba(80,55,20,.4)" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 4 }}>
        <div style={{ fontFamily: SERIF, fontSize: 17, color: INK }}>{title}</div>
        {tag && <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.14em", color: MUT2 }}>{tag}</span>}
        {right && <span style={{ fontFamily: MONO, fontSize: 12, color: GOLD, fontWeight: 600 }}>{right}</span>}
      </div>
      {children}
    </div>
  );
}

function QueueRow({ state, title, right }: { state: "run" | "queued" | "done"; title: string; right?: string }) {
  const mark = state === "run" ? <span style={{ color: GREEN, animation: "gpPulse 1.6s infinite" }}>●</span>
    : state === "queued" ? <span style={{ color: MUT2 }}>○</span>
    : <span style={{ color: MUT2 }}>✓</span>;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 0", borderTop: `1px solid ${HAIR}` }}>
      <span style={{ flexShrink: 0, fontSize: 11 }}>{mark}</span>
      <span style={{ flex: 1, minWidth: 0, fontFamily: SANS, fontSize: 13.5, color: state === "done" ? MUT : INK, fontWeight: state === "run" ? 700 : 500,
        textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</span>
      {right && <span style={{ flexShrink: 0, fontFamily: MONO, fontSize: 11, color: state === "run" ? GREEN : MUT2 }}>{right}</span>}
    </div>
  );
}

function LedgerCard({ children }: { children: React.ReactNode }) {
  return <div style={{ background: CHIP_BG, border: `1px solid ${CHIP_BR}`, borderRadius: 16, overflow: "hidden" }}>{children}</div>;
}

function Empty({ text }: { text: string }) {
  return <div style={{ fontFamily: SANS, fontSize: 13.5, color: MUT, padding: "22px 16px", textAlign: "center" }}>{text}</div>;
}

function MemCard({ label, value, sub, fill }: { label: string; value: string; sub: string; fill?: number }) {
  return (
    <div style={{ background: CHIP_BG, border: `1px solid ${CHIP_BR}`, borderRadius: 14, padding: "14px 15px" }}>
      <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.16em", color: GOLD }}>{label}</div>
      <div style={{ fontFamily: SERIF, fontSize: 21, color: INK, margin: "6px 0 3px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value}</div>
      <div style={{ fontFamily: SANS, fontSize: 12.5, color: MUT, lineHeight: 1.4 }}>{sub}</div>
      {typeof fill === "number" && (
        <div style={{ marginTop: 9, height: 5, borderRadius: 99, background: "rgba(34,29,18,0.08)", overflow: "hidden" }}>
          <div style={{ width: `${Math.min(100, Math.max(0, fill * 100))}%`, height: "100%", background: fill >= 0.8 ? TERRA : GOLD }} />
        </div>
      )}
    </div>
  );
}

// hotel-styled kanban board (Board pane / Runs tab)
function Board({ mc, liveRun, full }: { mc: MC; liveRun: LiveRun | null; full?: boolean }) {
  const cols: { title: string; items: KItem[]; accent: string; live?: boolean; empty: string }[] = [
    { title: "Pending", items: mc.kanban.pending, accent: MUT2, empty: "Nothing queued." },
    { title: "Working", items: mc.kanban.working, accent: GREEN, live: true, empty: "Idle — dispatch a goal." },
    { title: "Blocked", items: mc.kanban.blocked, accent: TERRA, empty: "No blocks today." },
    { title: "Done today", items: mc.kanban.done, accent: GOLD, empty: "Nothing finished yet." },
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: full ? "repeat(auto-fit,minmax(220px,1fr))" : "repeat(2,minmax(0,1fr))", gap: 12 }}>
      {cols.map((c) => {
        const extra = c.live && liveRun && !liveRun.done ? 1 : 0;
        return (
          <div key={c.title} style={{ background: "#F3EBD6", borderRadius: 14, border: `1px solid ${HAIR}`, padding: 11, minHeight: 120 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 9, padding: "0 3px" }}>
              <span style={{ fontFamily: SERIF, fontSize: 15, color: INK }}>{c.title}</span>
              <span style={{ fontFamily: MONO, fontSize: 11.5, color: MUT, background: CHIP_BG, border: `1px solid ${CHIP_BR}`, borderRadius: 99, padding: "0 8px" }}>{c.items.length + extra}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {c.live && liveRun && !liveRun.done && (
                <BoardCard accent={GREEN} title={liveRun.title} detail={liveRun.steps.map((s) => s.skill).join(" → ") || "planning…"} tag="live" pulse />
              )}
              {c.items.length + extra === 0 ? (
                <div style={{ fontFamily: SANS, fontSize: 12.5, color: MUT, textAlign: "center", padding: "14px 8px", border: `1px dashed ${CHIP_BR}`, borderRadius: 10 }}>{c.empty}</div>
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
        {tag && <span style={{ flexShrink: 0, fontFamily: MONO, fontSize: 10.5, color: accent, background: "#F5EDD8", borderRadius: 6, padding: "1px 7px", height: "fit-content" }}>{tag}</span>}
      </div>
      {detail && <div style={{ fontFamily: SANS, fontSize: 12.5, color: MUT, marginTop: 4, lineHeight: 1.4, wordBreak: "break-word" }}>{detail}</div>}
      {sub && <div style={{ fontFamily: MONO, fontSize: 11, color: MUT2, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}
