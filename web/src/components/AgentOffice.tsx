"use client";

/**
 * AgentOffice — the flagship "Agent Office" dashboard: a productized port of the
 * Hermes / Mission-Control native surface, rendered over REAL PetClaw state.
 *
 * Reads GET /api/petclaw/mission-control?petId=N every ~7s (paused when the tab is
 * hidden) and lays out:
 *   - a 5-Pillar strip (Soul / Memory / User / Skills / Crons) with capped fill bars,
 *   - a 4-column Kanban (Pending / Working / Blocked / Done Today),
 *   - the Office roster (skills + VIGIL crew as "staff"),
 *   - the cron Schedules,
 *   - a Dispatch bar that POSTs a goal to /api/pets/[petId]/agent?stream=1 (the real
 *     native tool-agent SSE) and shows the run appear live in the Working column.
 *
 * Everything is real or an honest empty state — no fabrication. Studio-purple is the
 * sanctioned agent-surface accent. Editorial idioms mirror AgentWorkbench.tsx.
 */

import { useState, useEffect, useCallback } from "react";
import { api, getAuthHeaders } from "@/lib/api";
import PetVillage from "./PetVillage";

// ── tokens (Collectible Editorial) ──
const INK = "#211A12";
const MUTED = "#7A6E5A";
const PURPLE = "#6B4FA0";
const TERRA = "#9A4E1E";
const SAGE = "#5C8A4E";
const PAPER = "#FBF6EC";
const FIELD = "#ECE4D4";
const DISP = "var(--ed-disp, sans-serif)";
const SANS = "var(--ed-body, sans-serif)";
const MONO = "var(--ed-m, ui-monospace, monospace)";
const HAIR = "rgba(33,26,18,0.13)";
const SHADOW_CARD = "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))";

const POLL_MS = 7000;
const COST = 5;

// ── types (mirror the route's response) — exported for PetVillage ──
export interface Pillars {
  soul: { set: boolean; persona: string; checkpoints: number };
  memory: { count: number; cap: number; lastFact: string | null; updatedAt: string | null };
  user: { count: number; cap: number };
  skills: { installed: number; learned: number; total: number };
  crons: { routines: number; nextLabel: string };
}
export interface KItem { id: number | string; title: string; kind?: string; skill?: string; detail?: string; reason?: string; at?: string; startedAt?: string; credits?: number; }
export interface Kanban { pending: KItem[]; working: KItem[]; blocked: KItem[]; done: KItem[]; }
export interface Staff { id: string; name: string; kind: "skill" | "vigil"; role: string; installed: boolean; status: "active" | "idle"; runs: number; successRate?: number; lastAt?: string | null; }
export interface Schedule { id: string; name: string; cadence: string; lastRun: string | null; nextRun: string | null; desc: string; }
export interface MC { pet: { id: number; name: string; level: number }; pillars: Pillars; kanban: Kanban; roster: Staff[]; schedules: Schedule[]; generatedAt: string; }
export interface LiveRun { title: string; steps: { skill: string; ok: boolean }[]; done: boolean; answer?: string; }

function relTime(ts?: string | null): string {
  if (!ts) return "never";
  const s = Math.max(0, Math.floor((Date.now() - new Date(ts).getTime()) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function AgentOffice() {
  const [pets, setPets] = useState<any[]>([]);
  const [petId, setPetId] = useState<number | null>(null);
  const [loadingPets, setLoadingPets] = useState(true);
  const [mc, setMc] = useState<MC | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [goal, setGoal] = useState("");
  const [running, setRunning] = useState(false);
  const [liveRun, setLiveRun] = useState<LiveRun | null>(null);
  const [view, setView] = useState<"village" | "classic">("village");

  // ── load pets ──
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await api.pets.list();
        const list = data.pets || data || [];
        if (!alive) return;
        setPets(list);
        if (list.length) setPetId(list[0].id);
      } catch {
        /* unauth / no pets — empty state below handles it */
      } finally {
        if (alive) setLoadingPets(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  // ── poll mission-control (pause when hidden) ──
  const fetchMc = useCallback(async (pid: number) => {
    try {
      const res = await fetch(`/api/petclaw/mission-control?petId=${pid}`, { headers: { ...getAuthHeaders() } });
      if (!res.ok) {
        const d = await res.json().catch(() => ({} as any));
        setErr(d?.error || "Couldn't load the office.");
        return;
      }
      const data = (await res.json()) as MC;
      setMc(data);
      setErr(null);
    } catch {
      setErr("Network error loading the office.");
    }
  }, []);

  useEffect(() => {
    if (petId == null) return;
    setMc(null);
    fetchMc(petId);
    let timer: any = null;
    const tick = () => { if (!document.hidden) fetchMc(petId); };
    timer = setInterval(tick, POLL_MS);
    const onVis = () => { if (!document.hidden) fetchMc(petId); };
    document.addEventListener("visibilitychange", onVis);
    return () => { if (timer) clearInterval(timer); document.removeEventListener("visibilitychange", onVis); };
  }, [petId, fetchMc]);

  const petName = pets.find((p) => p.id === petId)?.name || mc?.pet?.name || "your pet";

  // ── dispatch a goal to the real tool-agent SSE ──
  const dispatch = useCallback(async () => {
    if (petId == null || goal.trim().length < 3 || running) return;
    setRunning(true);
    setErr(null);
    const steps: { skill: string; ok: boolean }[] = [];
    const byId: Record<string, number> = {};
    setLiveRun({ title: goal.trim(), steps: [], done: false });
    try {
      const res = await fetch(`/api/pets/${petId}/agent?stream=1`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/event-stream", ...getAuthHeaders() },
        body: JSON.stringify({ goal: goal.trim(), maxSteps: 4 }),
      });
      if (!res.ok || !res.body) {
        const d = await res.json().catch(() => ({} as any));
        setErr(d?.error === "Not enough credits" ? `Not enough credits — a run costs ${COST}.` : d?.error || "The run failed.");
        setLiveRun(null);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      const flush = () => setLiveRun((r) => (r ? { ...r, steps: [...steps] } : r));
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const chunks = buf.split("\n\n");
        buf = chunks.pop() || "";
        for (const chunk of chunks) {
          const line = chunk.split("\n").find((l) => l.startsWith("data:"));
          if (!line) continue;
          let evt: any;
          try { evt = JSON.parse(line.slice(5).trim()); } catch { continue; }
          if (evt.type === "tool_call") {
            byId[evt.id] = steps.length;
            steps.push({ skill: evt.skill, ok: true });
            flush();
          } else if (evt.type === "tool_result") {
            const idx = byId[evt.id];
            if (idx != null) { steps[idx] = { ...steps[idx], ok: !!evt.ok }; flush(); }
          } else if (evt.type === "done") {
            setLiveRun((r) => (r ? { ...r, done: true, answer: evt.answer || "" } : r));
          } else if (evt.type === "error") {
            setErr(evt.error || "The run failed.");
          }
        }
      }
      setGoal("");
      // refresh the board so the finished run lands in Working/Done from the DB
      if (petId != null) fetchMc(petId);
    } catch {
      setErr("Network error — the run didn't start.");
    } finally {
      setRunning(false);
      // clear the ephemeral live card shortly after; the DB board takes over
      setTimeout(() => setLiveRun(null), 4000);
    }
  }, [petId, goal, running, fetchMc]);

  const isWorking = (mc?.kanban.working.length ?? 0) > 0 || running;

  // ── empty / no-pet gate ──
  if (!loadingPets && pets.length === 0) {
    return (
      <div style={wrap}>
        <Header petName="your pet" pets={[]} petId={null} setPetId={() => {}} isWorking={false} />
        <div style={{ ...card, textAlign: "center", color: MUTED, fontFamily: SANS }}>
          Adopt a pet first — then its Agent Office opens here.
        </div>
      </div>
    );
  }

  return (
    <div style={wrap}>
      <style>{`@keyframes officePulse{0%,100%{box-shadow:0 0 0 0 rgba(107,79,160,0.0),${SHADOW_CARD}}50%{box-shadow:0 0 0 3px rgba(107,79,160,0.18),${SHADOW_CARD}}}`}</style>

      <Header petName={petName} pets={pets} petId={petId} setPetId={setPetId} isWorking={isWorking} view={view} setView={setView} />

      {err && (
        <div style={{ marginBottom: 16, padding: "10px 14px", borderRadius: 10, background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.22)", color: "#b91c1c", fontFamily: SANS, fontSize: 13.5 }}>
          {err}
        </div>
      )}

      {/* ══ VILLAGE VIEW — the flagship illustrated town over the same real data ══ */}
      {view === "village" && (
        mc ? (
          <PetVillage mc={mc} liveRun={liveRun} running={running} isWorking={isWorking} petName={petName} />
        ) : (
          <div style={{ ...card, textAlign: "center", color: MUTED, fontFamily: SANS }}>Waking the village…</div>
        )
      )}

      {/* ══ CLASSIC VIEW — the plain admin board (fallback) ══ */}
      {view === "classic" && (
      <>
      {/* ── 5-Pillar strip ── */}
      {mc && (
        <div style={pillarGrid}>
          <Pillar label="Soul" mono="SOUL" accent={PURPLE}
            value={mc.pillars.soul.set ? mc.pillars.soul.persona : "not set"}
            sub={`v${mc.pillars.soul.checkpoints} · ${mc.pillars.soul.set ? "persona frozen" : "onboarding open"}`} />
          <Pillar label="Memory" mono="MEMORY" accent={TERRA}
            value={`${mc.pillars.memory.count} / ${mc.pillars.memory.cap}`}
            sub={mc.pillars.memory.updatedAt ? `updated ${relTime(mc.pillars.memory.updatedAt)}` : "empty ledger"}
            fill={mc.pillars.memory.count / mc.pillars.memory.cap} />
          <Pillar label="User" mono="USER" accent={TERRA}
            value={`${mc.pillars.user.count} / ${mc.pillars.user.cap}`}
            sub="owner profile facts"
            fill={mc.pillars.user.count / mc.pillars.user.cap} />
          <Pillar label="Skills" mono="SKILLS" accent={SAGE}
            value={`${mc.pillars.skills.total}`}
            sub={`${mc.pillars.skills.installed} installed · ${mc.pillars.skills.learned} learned`} />
          <Pillar label="Crons" mono="CRONS" accent={PURPLE}
            value={`${mc.pillars.crons.routines}`}
            sub={mc.pillars.crons.nextLabel} />
        </div>
      )}

      {/* ── Kanban ── */}
      {mc ? (
        <div style={kanbanGrid}>
          <Column mono="📋 PENDING" count={mc.kanban.pending.length} empty="Nothing queued — the board is clear.">
            {mc.kanban.pending.map((it) => (
              <KanbanCard key={String(it.id)} accent={MUTED} title={it.title} detail={it.detail} tag={it.kind} />
            ))}
          </Column>
          <Column mono="⚙️ WORKING" count={mc.kanban.working.length + (liveRun && !liveRun.done ? 1 : 0)} empty="Idle — dispatch a goal below to put the office to work.">
            {liveRun && (
              <KanbanCard pulse accent={PURPLE} title={liveRun.title}
                detail={liveRun.done ? "finishing…" : `${liveRun.steps.length} step${liveRun.steps.length === 1 ? "" : "s"} · ${liveRun.steps.map((s) => s.skill).join(" → ") || "planning…"}`}
                tag={liveRun.done ? "done" : "live"} />
            )}
            {mc.kanban.working.map((it) => (
              <KanbanCard key={String(it.id)} pulse accent={PURPLE} title={it.title} detail={it.detail} tag={it.skill} />
            ))}
          </Column>
          <Column mono="⚠️ BLOCKED" count={mc.kanban.blocked.length} empty="No blocks today.">
            {mc.kanban.blocked.map((it) => (
              <KanbanCard key={String(it.id)} accent="#b45309" title={it.title} detail={it.reason} sub={relTime(it.at)} tag="no-op" />
            ))}
          </Column>
          <Column mono="✅ DONE TODAY" count={mc.kanban.done.length} empty="Nothing finished yet today.">
            {mc.kanban.done.map((it) => (
              <KanbanCard key={String(it.id)} accent={SAGE} title={it.title}
                detail={`${it.skill}${it.credits ? ` · ${it.credits} cr` : ""}`} sub={relTime(it.at)} tag="done" />
            ))}
          </Column>
        </div>
      ) : (
        <div style={{ ...card, textAlign: "center", color: MUTED, fontFamily: SANS }}>Loading the office…</div>
      )}
      </>
      )}

      {/* ── Dispatch bar (shared by both views) ── */}
      <div style={{ ...card, marginTop: 20, padding: "16px 18px" }}>
        <div style={{ fontFamily: MONO, fontSize: 13, letterSpacing: "0.14em", color: PURPLE, fontWeight: 700, marginBottom: 10 }}>
          DISPATCH — GIVE {petName.toUpperCase()} A GOAL
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <input
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") dispatch(); }}
            placeholder="e.g. Recall what I told you about my week and suggest one thing to do"
            maxLength={600}
            style={{ flex: 1, minWidth: 220, boxSizing: "border-box", fontFamily: SANS, fontSize: 15, color: INK, padding: "12px 14px", borderRadius: 12, border: `1px solid ${HAIR}`, outline: "none", background: PAPER }}
          />
          <button
            onClick={dispatch}
            disabled={goal.trim().length < 3 || running || petId == null}
            style={{
              padding: "12px 22px", borderRadius: 12, border: "none",
              fontFamily: SANS, fontSize: 15, fontWeight: 800,
              cursor: goal.trim().length >= 3 && !running ? "pointer" : "not-allowed",
              color: "#FFF8EE",
              background: goal.trim().length >= 3 && !running ? "linear-gradient(180deg,#7C5FB8,#5B4090)" : "rgba(33,26,18,0.18)",
            }}
          >
            {running ? "● Working…" : "▶ Dispatch"}
          </button>
        </div>
        <div style={{ fontFamily: MONO, fontSize: 13, color: MUTED, marginTop: 8 }}>
          Costs {COST} credits · refunded if the loop runs no real skill · appears live in Working ↑
        </div>
      </div>

      {/* ── Office roster + schedules (classic only; the village shows its own) ── */}
      {view === "classic" && mc && <Roster roster={mc.roster} />}

      {view === "classic" && mc && (
        <div style={{ marginTop: 26 }}>
          <SectionTitle mono="SCHEDULES" title="Cron routines" />
          <div style={{ ...card, padding: 0, overflow: "hidden" }}>
            {mc.schedules.map((s, i) => (
              <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 16px", borderTop: i ? `1px solid ${HAIR}` : "none", flexWrap: "wrap" }}>
                <span style={{ width: 8, height: 8, borderRadius: 99, background: s.lastRun ? SAGE : "rgba(33,26,18,0.2)", flexShrink: 0 }} />
                <span style={{ fontFamily: SANS, fontSize: 14.5, fontWeight: 700, color: INK, minWidth: 130 }}>{s.name}</span>
                <span style={{ fontFamily: MONO, fontSize: 13, color: PURPLE, fontWeight: 700, padding: "2px 8px", borderRadius: 6, background: "rgba(107,79,160,0.08)" }}>{s.cadence}</span>
                <span style={{ fontFamily: SANS, fontSize: 13, color: MUTED, flex: 1, minWidth: 160 }}>{s.desc}</span>
                <span style={{ fontFamily: MONO, fontSize: 13, color: MUTED }}>last: {relTime(s.lastRun)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {mc && (
        <div style={{ fontFamily: MONO, fontSize: 13, color: "rgba(33,26,18,0.35)", marginTop: 16, textAlign: "center" }}>
          Live from PetClaw · refreshed {relTime(mc.generatedAt)} · every 7s
        </div>
      )}
    </div>
  );
}

// ── Header ──
function Header({ petName, pets, petId, setPetId, isWorking, view, setView }: { petName: string; pets: any[]; petId: number | null; setPetId: (n: number) => void; isWorking: boolean; view?: "village" | "classic"; setView?: (v: "village" | "classic") => void }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 8 }}>
        <div style={{ fontFamily: MONO, fontSize: 13, letterSpacing: "0.2em", color: PURPLE, fontWeight: 700, textTransform: "uppercase" }}>
          Agent Office · powered by PetClaw
        </div>
        {view && setView && (
          <div style={{ display: "inline-flex", background: FIELD, borderRadius: 99, padding: 3, border: `1px solid ${HAIR}` }}>
            {(["village", "classic"] as const).map((v) => (
              <button key={v} onClick={() => setView(v)}
                style={{ fontFamily: MONO, fontSize: 12.5, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", padding: "5px 13px", borderRadius: 99, border: "none", cursor: "pointer",
                  background: view === v ? PAPER : "transparent",
                  color: view === v ? PURPLE : MUTED,
                  boxShadow: view === v ? SHADOW_CARD : "none" }}>
                {v === "village" ? "🏘 Village" : "☰ Classic"}
              </button>
            ))}
          </div>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
        <h1 style={{ fontFamily: DISP, fontSize: "clamp(26px,4vw,38px)", fontWeight: 800, color: INK, letterSpacing: "-0.025em", margin: 0, lineHeight: 1.1 }}>
          {petName}&rsquo;s Agent Office
        </h1>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontFamily: MONO, fontSize: 13, fontWeight: 700, padding: "4px 11px", borderRadius: 99, color: isWorking ? PURPLE : MUTED, background: isWorking ? "rgba(107,79,160,0.1)" : "rgba(33,26,18,0.05)", border: `1px solid ${isWorking ? "rgba(107,79,160,0.28)" : HAIR}` }}>
          <span style={{ width: 8, height: 8, borderRadius: 99, background: isWorking ? PURPLE : "rgba(33,26,18,0.3)" }} />
          {isWorking ? "working" : "idle"}
        </span>
      </div>
      <p style={{ fontFamily: SANS, fontSize: 15.5, color: "rgba(33,26,18,0.6)", maxWidth: 640, margin: "10px 0 0", lineHeight: 1.6 }}>
        The five pillars, the kanban, the staff, and the routines — the whole office your pet runs, live and real.
      </p>
      {pets.length > 1 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
          {pets.map((p) => (
            <button key={p.id} onClick={() => setPetId(p.id)}
              style={{ fontFamily: SANS, fontSize: 13, fontWeight: petId === p.id ? 800 : 600, padding: "6px 12px", borderRadius: 9, cursor: "pointer",
                border: `1px solid ${petId === p.id ? "rgba(107,79,160,0.3)" : HAIR}`,
                background: petId === p.id ? "rgba(107,79,160,0.1)" : PAPER,
                color: petId === p.id ? PURPLE : MUTED }}>
              {p.name || `Pet #${p.id}`}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Pillar card ──
function Pillar({ label, mono, accent, value, sub, fill }: { label: string; mono: string; accent: string; value: string; sub: string; fill?: number }) {
  return (
    <div style={{ ...card, padding: "14px 15px" }}>
      <div style={{ fontFamily: MONO, fontSize: 13, letterSpacing: "0.12em", color: accent, fontWeight: 700 }}>{mono}</div>
      <div style={{ fontFamily: DISP, fontSize: 20, fontWeight: 800, color: INK, margin: "6px 0 3px", letterSpacing: "-0.01em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value}</div>
      <div style={{ fontFamily: SANS, fontSize: 13, color: MUTED, lineHeight: 1.4 }}>{sub}</div>
      {typeof fill === "number" && (
        <div style={{ marginTop: 9, height: 6, borderRadius: 99, background: "rgba(33,26,18,0.08)", overflow: "hidden" }}>
          <div style={{ width: `${Math.min(100, Math.max(0, fill * 100))}%`, height: "100%", borderRadius: 99, background: fill >= 0.8 ? "#BE4F28" : accent }} />
        </div>
      )}
    </div>
  );
}

// ── Kanban column ──
function Column({ mono, count, empty, children }: { mono: string; count: number; empty: string; children: React.ReactNode }) {
  return (
    <div style={{ background: FIELD, borderRadius: 16, border: `1px solid ${HAIR}`, padding: 12, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, padding: "2px 4px" }}>
        <span style={{ fontFamily: MONO, fontSize: 13, letterSpacing: "0.08em", color: "rgba(33,26,18,0.6)", fontWeight: 700 }}>{mono}</span>
        <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: INK, background: PAPER, borderRadius: 99, minWidth: 22, textAlign: "center", padding: "1px 7px", border: `1px solid ${HAIR}` }}>{count}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
        {count > 0 ? children : (
          <div style={{ fontFamily: SANS, fontSize: 13, color: MUTED, lineHeight: 1.5, padding: "14px 10px", textAlign: "center", border: `1px dashed ${HAIR}`, borderRadius: 12 }}>
            {empty}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Kanban card ──
function KanbanCard({ title, detail, sub, tag, accent, pulse }: { title: string; detail?: string; sub?: string; tag?: string; accent: string; pulse?: boolean }) {
  return (
    <div style={{ background: PAPER, borderRadius: 12, border: `1px solid ${HAIR}`, borderLeft: `3px solid ${accent}`, padding: "11px 12px", boxShadow: SHADOW_CARD, animation: pulse ? "officePulse 1.8s ease-in-out infinite" : undefined }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <div style={{ fontFamily: SANS, fontSize: 14, fontWeight: 700, color: INK, lineHeight: 1.35, minWidth: 0 }}>{title}</div>
        {tag && <span style={{ flexShrink: 0, fontFamily: MONO, fontSize: 13, fontWeight: 700, color: accent, background: "rgba(33,26,18,0.04)", borderRadius: 6, padding: "1px 7px" }}>{tag}</span>}
      </div>
      {detail && <div style={{ fontFamily: SANS, fontSize: 13, color: MUTED, marginTop: 5, lineHeight: 1.45, wordBreak: "break-word" }}>{detail}</div>}
      {sub && <div style={{ fontFamily: MONO, fontSize: 13, color: "rgba(33,26,18,0.4)", marginTop: 5 }}>{sub}</div>}
    </div>
  );
}

// ── Office roster ──
function Roster({ roster }: { roster: Staff[] }) {
  const skills = roster.filter((r) => r.kind === "skill");
  const vigil = roster.filter((r) => r.kind === "vigil");
  return (
    <div style={{ marginTop: 26 }}>
      <SectionTitle mono="OFFICE ROSTER" title="The staff your pet runs" />
      <div style={{ marginBottom: 8, fontFamily: MONO, fontSize: 13, letterSpacing: "0.1em", color: SAGE, fontWeight: 700 }}>SKILLS</div>
      <div style={staffGrid}>
        {skills.map((s) => <StaffCard key={s.id} s={s} accent={SAGE} />)}
      </div>
      <div style={{ margin: "18px 0 8px", fontFamily: MONO, fontSize: 13, letterSpacing: "0.1em", color: PURPLE, fontWeight: 700 }}>VIGIL CREW · always-on memory pipeline</div>
      <div style={staffGrid}>
        {vigil.map((s) => <StaffCard key={s.id} s={s} accent={PURPLE} />)}
      </div>
    </div>
  );
}

function StaffCard({ s, accent }: { s: Staff; accent: string }) {
  const active = s.status === "active";
  return (
    <div style={{ ...card, padding: "12px 13px", opacity: s.installed ? 1 : 0.62 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <span style={{ width: 8, height: 8, borderRadius: 99, background: active ? accent : "rgba(33,26,18,0.22)", flexShrink: 0 }} />
        <span style={{ fontFamily: SANS, fontSize: 14, fontWeight: 800, color: INK, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</span>
      </div>
      <div style={{ fontFamily: SANS, fontSize: 13, color: MUTED, lineHeight: 1.4, minHeight: 34 }}>{s.role}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 7, flexWrap: "wrap" }}>
        <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: INK }}>{s.runs} run{s.runs === 1 ? "" : "s"}</span>
        {typeof s.successRate === "number" && <span style={{ fontFamily: MONO, fontSize: 13, color: SAGE, fontWeight: 700 }}>{s.successRate}%</span>}
        {s.lastAt && <span style={{ fontFamily: MONO, fontSize: 13, color: "rgba(33,26,18,0.4)" }}>{relTime(s.lastAt)}</span>}
        {!s.installed && <span style={{ fontFamily: MONO, fontSize: 13, color: "rgba(33,26,18,0.35)" }}>available</span>}
      </div>
    </div>
  );
}

function SectionTitle({ mono, title }: { mono: string; title: string }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontFamily: MONO, fontSize: 13, letterSpacing: "0.16em", color: PURPLE, fontWeight: 700 }}>{mono}</div>
      <h2 style={{ fontFamily: DISP, fontSize: 22, fontWeight: 800, color: INK, letterSpacing: "-0.02em", margin: "3px 0 0" }}>{title}</h2>
    </div>
  );
}

// ── shared styles ──
const wrap: React.CSSProperties = { maxWidth: 1180, margin: "0 auto", padding: "96px 20px 80px" };
const card: React.CSSProperties = { background: PAPER, borderRadius: 16, padding: 20, border: `1px solid ${HAIR}`, boxShadow: SHADOW_CARD };
const pillarGrid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 22 };
const kanbanGrid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 };
const staffGrid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 12 };
