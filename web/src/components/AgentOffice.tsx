"use client";

/**
 * AgentOffice — the flagship "Agent Office" dashboard: a productized port of the
 * Hermes / Mission-Control native surface, rendered over REAL PetClaw state.
 *
 * Reads GET /api/petclaw/mission-control?petId=N every ~7s (paused when the tab is
 * hidden) and lays out:
 *   - a 5-Pillar strip (Soul / Memory / User / Skills / Crons) with capped fill bars,
 *   - a 3-state Kanban (QUEUED / WORKING / DONE),
 *   - the Office roster (skills + VIGIL crew as "staff"),
 *   - the cron Schedules,
 *   - a Dispatch bar that POSTs a goal to /api/pets/[petId]/agent?stream=1 (the real
 *     native tool-agent SSE) and shows the run appear live in the Working column.
 *
 * Everything is real or an honest empty state — no fabrication. Studio-purple is the
 * sanctioned agent-surface accent. Editorial idioms mirror AgentWorkbench.tsx.
 */

import { useState, useEffect, useCallback, useId } from "react";
import { api, getAuthHeaders } from "@/lib/api";
import GrandPawOffice from "./GrandPawOffice";
import {
  createAgentRunId,
  forgetPendingAgentRun,
  latestPendingAgentRun,
  recheckAgentRunReceiptOnNotFound,
  rememberPendingAgentRun,
} from "@/lib/petclaw/agent-run-client";

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

// ── types (mirror the route's response) — exported for GrandPawOffice ──
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
export interface LiveRunStep { skill: string; ok: boolean; complete: boolean; }
type OfficeStatus = "IDLE" | "WORKING" | "QUEUED" | "DONE" | "LIVE";
type ClassicColumnStatus = Extract<OfficeStatus, "QUEUED" | "WORKING" | "DONE">;
export interface AgentBilling {
  outcome: "charged" | "refunded";
  creditsCharged: number;
  usageKnown: boolean;
  modelCalls: number | null;
  orchestratorModelCalls?: number | null;
  skillModelCalls?: number | null;
}
export interface LiveRun {
  runId: string;
  title: string;
  steps: LiveRunStep[];
  done: boolean;
  answer?: string;
  completed?: boolean;
  stoppedReason?: string;
  billing?: AgentBilling;
  creditsRemaining?: number;
}

function relTime(ts?: string | null): string {
  if (!ts) return "never";
  const s = Math.max(0, Math.floor((Date.now() - new Date(ts).getTime()) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/**
 * Only persisted executable waiting work may enter QUEUED. The current route
 * has no such queue and returns pending empty; keep this adapter narrow so
 * suggestions can never masquerade as work that will actually run.
 */
function queuedForDisplay(kanban: Kanban): KItem[] {
  return [...kanban.pending];
}

/** Legacy no-op/refunded rows are terminal history, never resumable QUEUED work. */
function doneForDisplay(kanban: Kanban): KItem[] {
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

/** A completed item must never remain visible under WORKING. */
function workingForDisplay(kanban: Kanban, liveRun: LiveRun | null): KItem[] {
  const terminal = doneForDisplay(kanban);
  const doneIds = new Set(terminal.map((item) => String(item.id)));
  const doneTitles = new Set(terminal.map((item) => item.title));
  if (liveRun?.done) doneTitles.add(liveRun.title);
  return kanban.working.filter(
    (item) => !doneIds.has(String(item.id)) && !doneTitles.has(item.title),
  );
}

export default function AgentOffice() {
  const dispatchGoalId = useId();
  const [pets, setPets] = useState<any[]>([]);
  const [petId, setPetId] = useState<number | null>(null);
  const [loadingPets, setLoadingPets] = useState(true);
  const [mc, setMc] = useState<MC | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [goal, setGoal] = useState("");
  const [running, setRunning] = useState(false);
  const [receiptMissing, setReceiptMissing] = useState(false);
  const [liveRun, setLiveRun] = useState<LiveRun | null>(null);
  const [view, setView] = useState<"hotel" | "classic">("hotel");

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

  useEffect(() => {
    try {
      const pending = latestPendingAgentRun();
      if (!pending || typeof pending.goal !== "string") return;
      setReceiptMissing(true);
      setGoal(pending.goal);
      setLiveRun({ runId: pending.runId, title: pending.goal, steps: [], done: true, stoppedReason: "receipt_missing" });
      setErr("The previous paid run ended without a settlement receipt. Check Account credits and usage before dispatching again.");
    } catch { /* ignore corrupt local state */ }
  }, []);

  // ── poll mission-control (pause when hidden) ──
  const fetchMc = useCallback(async (pid: number) => {
    try {
      // routed through api.request so the dev-mock layer serves the office
      // locally (the shared auth-header/error handling comes with it)
      const data = (await api.missionControl(pid)) as MC;
      setMc(data);
      setErr(null);
    } catch (e: any) {
      setErr(e?.message || "Couldn't load the office.");
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
    if (petId == null || goal.trim().length < 3 || running || receiptMissing) return;
    const runId = createAgentRunId();
    setRunning(true);
    setErr(null);
    const steps: LiveRunStep[] = [];
    const byId: Record<string, number> = {};
    setLiveRun({ runId, title: goal.trim(), steps: [], done: false });
    try {
      rememberPendingAgentRun({ runId, petId, petName, goal: goal.trim(), surface: "office", at: Date.now() });
    } catch { /* storage unavailable; server-side confirmation still applies */ }
    let receivedSettlementReceipt = false;
    try {
      const res = await fetch(`/api/pets/${petId}/agent?stream=1`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/event-stream", ...getAuthHeaders() },
        body: JSON.stringify({ runId, goal: goal.trim(), maxSteps: 4, confirmCostCredits: COST }),
      });
      if (!res.ok || !res.body) {
        const d = await res.json().catch(() => ({} as any));
        setErr(d?.error === "Not enough credits" ? `Not enough credits — a run costs ${COST}.` : d?.error || "The run failed.");
        setLiveRun(null);
        if (res.status < 500) {
          try { forgetPendingAgentRun(runId); } catch { /* ignore */ }
        } else {
          setReceiptMissing(true);
        }
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
            steps.push({ skill: evt.skill, ok: true, complete: false });
            flush();
          } else if (evt.type === "tool_result") {
            const idx = byId[evt.id];
            if (idx != null) { steps[idx] = { ...steps[idx], ok: !!evt.ok, complete: true }; flush(); }
          } else if (evt.type === "done") {
            const billing = evt.billing as AgentBilling | undefined;
            if (
              !billing
              || (billing.outcome !== "charged" && billing.outcome !== "refunded")
              || typeof billing.creditsCharged !== "number"
              || !(billing.usageKnown === false ? billing.modelCalls == null : typeof billing.modelCalls === "number")
              || evt.runId !== runId
            ) {
              continue;
            }
            receivedSettlementReceipt = true;
            setLiveRun((r) => (r ? {
              ...r,
              done: true,
              answer: evt.answer || "",
              completed: evt.completed === true,
              stoppedReason: evt.stoppedReason || "completed",
              billing,
              creditsRemaining: evt.creditsRemaining,
            } : r));
            try { forgetPendingAgentRun(runId); } catch { /* ignore */ }
          } else if (evt.type === "error") {
            setErr(evt.error || "The run failed.");
          }
        }
      }
      if (!receivedSettlementReceipt) {
        setReceiptMissing(true);
        setErr("The stream ended before the settlement receipt arrived. Do not retry yet; check Account credits and usage first.");
        setLiveRun((r) => (r ? { ...r, done: true, stoppedReason: "receipt_missing" } : r));
      } else {
        setGoal("");
        // Refresh so the completion-only history lands in DONE from the DB.
        if (petId != null) fetchMc(petId);
      }
    } catch {
      if (!receivedSettlementReceipt) {
        setReceiptMissing(true);
        setErr("The connection ended without a settlement receipt. The run may have reached the server; check Account before retrying.");
        setLiveRun((r) => (r ? { ...r, done: true, stoppedReason: "receipt_missing" } : r));
      }
    } finally {
      setRunning(false);
    }
  }, [petId, petName, goal, running, receiptMissing, fetchMc]);

  const reconcilePendingRun = async () => {
    const pending = latestPendingAgentRun();
    if (!pending) {
      setReceiptMissing(false);
      setLiveRun(null);
      setErr(null);
      return;
    }
    try {
      const receipt = await recheckAgentRunReceiptOnNotFound(
        () => api.pets.agentRunStatus(pending.petId, pending.runId),
      );
      if (receipt.state !== "terminal" || !receipt.billing) {
        setErr(`Run ${pending.runId.slice(0, 8)}… is still ${receipt.state}. Dispatch remains locked.`);
        return;
      }
      forgetPendingAgentRun(pending.runId);
      setReceiptMissing(false);
      setLiveRun({
        runId: pending.runId,
        title: receipt.goal || pending.goal,
        steps: receipt.steps || [],
        done: true,
        answer: receipt.answer || "",
        completed: receipt.completed === true,
        stoppedReason: receipt.stoppedReason,
        billing: receipt.billing,
        creditsRemaining: receipt.creditsRemaining,
      });
      setErr(null);
    } catch (e: any) {
      if (e?.status === 404) {
        forgetPendingAgentRun(pending.runId);
        setReceiptMissing(false);
        setLiveRun(null);
        setErr("No durable run receipt was found after two checks. The local marker was cleared; the server's per-pet guard prevents an overlapping paid run. Check Account credits before dispatching again.");
        return;
      }
      setErr(`Receipt lookup failed: ${e?.message || "try again shortly"}. Do not dispatch another paid run yet.`);
    }
  };

  const classicQueued = mc ? queuedForDisplay(mc.kanban) : [];
  const classicWorking = mc ? workingForDisplay(mc.kanban, liveRun) : [];
  const classicDone = mc ? doneForDisplay(mc.kanban) : [];
  const isWorking = classicWorking.length > 0 || running || !!(liveRun && !liveRun.done);
  const liveDoneNotPersisted = !!(
    mc
    && liveRun?.done
    && !classicDone.some((item) => item.title === liveRun.title)
  );

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
        <div role="alert" style={{ marginBottom: 16, padding: "10px 14px", borderRadius: 10, background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.22)", color: "#b91c1c", fontFamily: SANS, fontSize: 13.5 }}>
          {err}
        </div>
      )}

      {receiptMissing && (
        <div style={{ marginBottom: 16, padding: "12px 14px", borderRadius: 10, background: "rgba(190,79,40,0.09)", border: "1px solid rgba(190,79,40,0.28)", color: TERRA, fontFamily: SANS, fontSize: 13.5, lineHeight: 1.5 }}>
          <b>Paid-run safety lock:</b> <a href="/account" style={{ color: TERRA, fontWeight: 800 }}>Open Account</a> and verify credits/usage before unlocking another dispatch.
          <div><button type="button" onClick={reconcilePendingRun} style={{ marginTop: 8, border: `1px solid ${HAIR}`, borderRadius: 8, padding: "7px 10px", background: PAPER, color: INK, fontFamily: SANS, fontWeight: 700 }}>Check saved run receipt</button></div>
        </div>
      )}

      {liveRun?.billing && (
        <div role="status" style={{ marginBottom: 16, padding: "10px 14px", borderRadius: 10, background: liveRun.billing.outcome === "charged" ? "rgba(190,79,40,0.07)" : "rgba(92,138,78,0.08)", border: `1px solid ${HAIR}`, color: INK, fontFamily: MONO, fontSize: 13 }}>
          {liveRun.completed ? "COMPLETED" : (liveRun.stoppedReason || "STOPPED").toUpperCase()} · {liveRun.billing.outcome === "charged" ? `${liveRun.billing.creditsCharged} CREDITS CHARGED` : "CREDITS REFUNDED"} · {liveRun.billing.usageKnown === false ? "USAGE UNKNOWN (RECOVERED)" : `${liveRun.billing.modelCalls} MODEL ATTEMPT${liveRun.billing.modelCalls === 1 ? "" : "S"}`}{typeof liveRun.creditsRemaining === "number" ? ` · ${liveRun.creditsRemaining} LEFT` : ""}
        </div>
      )}

      {/* ══ HOTEL VIEW — "The Grand Paw" lobby diorama over the same real data ══ */}
      {view === "hotel" && (
        mc ? (
          <GrandPawOffice mc={mc} liveRun={liveRun} running={running} receiptMissing={receiptMissing} petName={petName}
            pets={pets} goal={goal} setGoal={setGoal} onDispatch={dispatch} cost={COST} />
        ) : (
          <div role="status" aria-live="polite" style={{ ...card, textAlign: "center", color: MUTED, fontFamily: SANS }}>Opening the hotel…</div>
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
          <Column mono="QUEUED" count={classicQueued.length} empty="The queue is clear.">
            {classicQueued.map((it, index) => (
              <KanbanCard key={`queued-${index}-${String(it.id)}`} accent={MUTED} title={it.title} detail={it.detail} tag="QUEUED" />
            ))}
          </Column>
          <Column mono="WORKING" count={classicWorking.length + (liveRun && !liveRun.done ? 1 : 0)} empty="Dispatch a goal below to put the office to work.">
            {liveRun && !liveRun.done && (
              <KanbanCard pulse accent={PURPLE} title={liveRun.title}
                detail={`${liveRun.steps.length} step${liveRun.steps.length === 1 ? "" : "s"} · ${liveRun.steps.map((s) => s.skill).join(" → ") || "planning…"}`}
                tag="LIVE" />
            )}
            {classicWorking.map((it) => (
              <KanbanCard key={String(it.id)} pulse accent={PURPLE} title={it.title}
                detail={[it.skill, it.detail].filter(Boolean).join(" · ")} tag="WORKING" />
            ))}
          </Column>
          <Column mono="DONE" count={classicDone.length + (liveDoneNotPersisted ? 1 : 0)} empty="Nothing has finished yet.">
            {liveDoneNotPersisted && liveRun && (
              <KanbanCard accent={SAGE} title={liveRun.title} detail={liveRun.answer} tag="DONE" />
            )}
            {classicDone.map((it, index) => (
              <KanbanCard key={`done-${index}-${String(it.id)}`} accent={SAGE} title={it.title}
                detail={it.detail || `${it.skill}${it.credits ? ` · ${it.credits} cr` : ""}`} sub={relTime(it.at)} tag="DONE" />
            ))}
          </Column>
        </div>
      ) : (
        <div role="status" aria-live="polite" style={{ ...card, textAlign: "center", color: MUTED, fontFamily: SANS }}>Loading the office…</div>
      )}
      </>
      )}

      {/* ── Dispatch bar (classic only — the hotel has its own front desk) ── */}
      {view === "classic" && (
      <div style={{ ...card, marginTop: 20, padding: "16px 18px" }}>
        <label htmlFor={dispatchGoalId} style={{ display: "block", fontFamily: MONO, fontSize: 13, letterSpacing: "0.14em", color: PURPLE, fontWeight: 700, marginBottom: 10 }}>
          DISPATCH — GIVE {petName.toUpperCase()} A GOAL
        </label>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <input
            id={dispatchGoalId}
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) dispatch(); }}
            placeholder="e.g. Recall what I told you about my week and suggest one thing to do"
            maxLength={600}
            style={{ flex: 1, minWidth: 220, boxSizing: "border-box", fontFamily: SANS, fontSize: 15, color: INK, padding: "12px 14px", borderRadius: 12, border: `1px solid ${HAIR}`, outline: "none", background: PAPER }}
          />
          <button
            type="button"
            onClick={dispatch}
            disabled={goal.trim().length < 3 || running || receiptMissing || petId == null}
            aria-busy={running}
            style={{
              padding: "12px 22px", borderRadius: 12, border: "none",
              fontFamily: SANS, fontSize: 15, fontWeight: 800,
              cursor: goal.trim().length >= 3 && !running && !receiptMissing ? "pointer" : "not-allowed",
              color: "#FFF8EE",
              background: goal.trim().length >= 3 && !running && !receiptMissing ? "linear-gradient(180deg,#7C5FB8,#5B4090)" : "rgba(33,26,18,0.18)",
            }}
          >
            {running ? "WORKING" : receiptMissing ? "Check Account first" : `Authorize ${COST} credits & dispatch`}
          </button>
        </div>
        <div style={{ fontFamily: MONO, fontSize: 13, color: MUTED, marginTop: 8 }}>
          Costs {COST} credits · refunded if the loop runs no real skill · appears as LIVE in WORKING ↑
        </div>
      </div>
      )}

      {/* ── Office roster + schedules (classic only; the village shows its own) ── */}
      {view === "classic" && mc && <Roster roster={mc.roster} liveRun={liveRun} />}

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
          Synced from PetClaw · refreshed {relTime(mc.generatedAt)} · every 7s
        </div>
      )}
    </div>
  );
}

// ── Header ──
function Header({ petName, pets, petId, setPetId, isWorking, view, setView }: { petName: string; pets: any[]; petId: number | null; setPetId: (n: number) => void; isWorking: boolean; view?: "hotel" | "classic"; setView?: (v: "hotel" | "classic") => void }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 8 }}>
        <div style={{ fontFamily: MONO, fontSize: 13, letterSpacing: "0.2em", color: PURPLE, fontWeight: 700, textTransform: "uppercase" }}>
          Agent Office · powered by PetClaw
        </div>
        {view && setView && (
          <div role="group" aria-label="Agent Office view" style={{ display: "inline-flex", background: FIELD, borderRadius: 99, padding: 3, border: `1px solid ${HAIR}` }}>
            {(["hotel", "classic"] as const).map((v) => (
              <button type="button" key={v} onClick={() => setView(v)} aria-pressed={view === v}
                style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", padding: "5px 13px", borderRadius: 99, border: "none", cursor: "pointer",
                  background: view === v ? PAPER : "transparent",
                  color: view === v ? PURPLE : MUTED,
                  boxShadow: view === v ? SHADOW_CARD : "none" }}>
                {v === "hotel" ? "🏨 Hotel" : "☰ Classic"}
              </button>
            ))}
          </div>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
        <h1 style={{ fontFamily: DISP, fontSize: "clamp(26px,4vw,38px)", fontWeight: 800, color: INK, letterSpacing: "-0.025em", margin: 0, lineHeight: 1.1 }}>
          {petName}&rsquo;s Agent Office
        </h1>
        <span role="status" aria-live="polite" style={{ display: "inline-flex", alignItems: "center", gap: 7, fontFamily: MONO, fontSize: 13, fontWeight: 700, padding: "4px 11px", borderRadius: 99, color: isWorking ? PURPLE : MUTED, background: isWorking ? "rgba(107,79,160,0.1)" : "rgba(33,26,18,0.05)", border: `1px solid ${isWorking ? "rgba(107,79,160,0.28)" : HAIR}` }}>
          <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 99, background: isWorking ? PURPLE : "rgba(33,26,18,0.3)" }} />
          {isWorking ? "WORKING" : "IDLE"}
        </span>
      </div>
      <p style={{ fontFamily: SANS, fontSize: 15.5, color: "rgba(33,26,18,0.6)", maxWidth: 640, margin: "10px 0 0", lineHeight: 1.6 }}>
        The five pillars, the kanban, the staff, and the routines — the whole office your pet runs, live and real.
      </p>
      {pets.length > 1 && (
        <div role="group" aria-label="Choose a pet" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
          {pets.map((p) => (
            <button type="button" key={p.id} onClick={() => setPetId(p.id)} aria-pressed={petId === p.id}
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
        <div role="progressbar" aria-label={`${label} capacity`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(Math.min(1, Math.max(0, fill)) * 100)} style={{ marginTop: 9, height: 6, borderRadius: 99, background: "rgba(33,26,18,0.08)", overflow: "hidden" }}>
          <div style={{ width: `${Math.min(100, Math.max(0, fill * 100))}%`, height: "100%", borderRadius: 99, background: fill >= 0.8 ? "#BE4F28" : accent }} />
        </div>
      )}
    </div>
  );
}

// ── Kanban column ──
function Column({ mono, count, empty, children }: { mono: ClassicColumnStatus; count: number; empty: string; children: React.ReactNode }) {
  return (
    <section aria-label={mono} style={{ background: FIELD, borderRadius: 16, border: `1px solid ${HAIR}`, padding: 12, minWidth: 0 }}>
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
    </section>
  );
}

// ── Kanban card ──
function KanbanCard({ title, detail, sub, tag, accent, pulse }: { title: string; detail?: string; sub?: string; tag: OfficeStatus; accent: string; pulse?: boolean }) {
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
function currentLiveSkill(liveRun: LiveRun | null): string | null {
  if (!liveRun || liveRun.done) return null;
  return [...liveRun.steps].reverse().find((step) => !step.complete)?.skill || null;
}

function Roster({ roster, liveRun }: { roster: Staff[]; liveRun: LiveRun | null }) {
  const skills = roster.filter((r) => r.kind === "skill");
  const vigil = roster.filter((r) => r.kind === "vigil");
  const liveSkill = currentLiveSkill(liveRun);
  return (
    <div style={{ marginTop: 26 }}>
      <SectionTitle mono="OFFICE ROSTER" title="The staff your pet runs" />
      <div style={{ marginBottom: 8, fontFamily: MONO, fontSize: 13, letterSpacing: "0.1em", color: SAGE, fontWeight: 700 }}>SKILLS</div>
      <div style={staffGrid}>
        {skills.map((s) => <StaffCard key={s.id} s={s} accent={SAGE} live={s.id === liveSkill} />)}
      </div>
      <div style={{ margin: "18px 0 8px", fontFamily: MONO, fontSize: 13, letterSpacing: "0.1em", color: PURPLE, fontWeight: 700 }}>VIGIL CREW · bounded memory capabilities</div>
      <div style={staffGrid}>
        {vigil.map((s) => <StaffCard key={s.id} s={s} accent={PURPLE} live={false} />)}
      </div>
    </div>
  );
}

function StaffCard({ s, accent, live }: { s: Staff; accent: string; live: boolean }) {
  const active = live || s.status === "active";
  return (
    <div style={{ ...card, padding: "12px 13px", opacity: s.installed ? 1 : 0.62 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 99, background: active ? accent : "rgba(33,26,18,0.22)", flexShrink: 0 }} />
        <span style={{ fontFamily: SANS, fontSize: 14, fontWeight: 800, color: INK, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</span>
        <span style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 13, color: active ? accent : MUTED, fontWeight: 700 }}>{active ? "WORKING" : "IDLE"}</span>
      </div>
      <div style={{ fontFamily: SANS, fontSize: 13, color: MUTED, lineHeight: 1.4, minHeight: 34 }}>{s.role}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 7, flexWrap: "wrap" }}>
        <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: INK }}>{s.runs} run{s.runs === 1 ? "" : "s"}</span>
        {typeof s.successRate === "number" && <span style={{ fontFamily: MONO, fontSize: 13, color: SAGE, fontWeight: 700 }}>{s.successRate}%</span>}
        {s.lastAt && <span style={{ fontFamily: MONO, fontSize: 13, color: "rgba(33,26,18,0.4)" }}>{relTime(s.lastAt)}</span>}
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
