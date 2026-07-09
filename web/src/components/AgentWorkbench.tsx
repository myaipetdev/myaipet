"use client";

/**
 * AgentWorkbench — a Trinity-style orchestration surface over the REAL
 * native function-calling loop (POST /api/pets/[petId]/agent → runToolAgent),
 * streamed live over SSE so each tool call + result appears as it happens.
 *
 * It exposes the four orchestration affordances Trinity popularized, each mapped
 * to something the loop already produces (no fabrication):
 *   - Work packages  = the `steps[]` the planner produces (plan → act → observe)
 *   - Preflight gate  = client-side validation before we burn credits
 *   - Review + retry/recover = surface failed packages, re-run or recover (+budget)
 *   - Persistent session = last run is saved to localStorage and restored on load
 *
 * Self-contained: fetches the owner's pets via api.pets.list() and calls the
 * agent endpoint directly with getAuthHeaders(). Does NOT touch AgentDashboard.
 */

import { useState, useEffect, useCallback } from "react";
import { api, getAuthHeaders } from "@/lib/api";
import Icon from "@/components/Icon";

interface AgentStep { thought: string; skill: string; input?: any; output?: any; ok: boolean; }
interface RunResult {
  goal: string;
  answer: string;
  steps: AgentStep[];
  stoppedReason: string;
  creditsRemaining?: number;
  at: number; // client timestamp for the persistent session
  petId: number;
  petName: string;
}

const LS_KEY = "petclaw_workbench_session_v1";
const COST = 5;
const MAX_STEPS = 6;

const STOP: Record<string, { label: string; tone: "ok" | "warn" | "err" }> = {
  running: { label: "Running…", tone: "warn" },
  finished: { label: "Completed", tone: "ok" },
  budget_exhausted: { label: "Reached step budget", tone: "warn" },
  planner_error: { label: "Planner failed", tone: "err" },
};

const INK = "#211A12";
const PURPLE = "#6B4FA0";
const SANS = "var(--ed-body, sans-serif)";
const MONO = "var(--ed-m, ui-monospace, monospace)";

const TONE = {
  ok: { fg: "#5C8A4E", bg: "rgba(92,138,78,0.10)", bd: "rgba(92,138,78,0.25)" },
  warn: { fg: "#9A4E1E", bg: "rgba(190,79,40,0.10)", bd: "rgba(190,79,40,0.3)" },
  err: { fg: "#dc2626", bg: "rgba(220,38,38,0.1)", bd: "rgba(220,38,38,0.25)" },
} as const;

const EXAMPLES = [
  "Check my mood from our recent chats and suggest one thing for today",
  "Recall what I told you about my work, then write me a short pep talk",
  "Look back at this week and write a diary entry in your own voice",
];

function relTime(ts: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function pretty(v: any): string {
  if (v == null) return "—";
  if (typeof v === "string") return v;
  try {
    const s = JSON.stringify(v, null, 2);
    return s.length > 1400 ? s.slice(0, 1400) + "\n… (truncated)" : s;
  } catch {
    return String(v);
  }
}

export default function AgentWorkbench() {
  const [pets, setPets] = useState<any[]>([]);
  const [petId, setPetId] = useState<number | null>(null);
  const [loadingPets, setLoadingPets] = useState(true);

  const [goal, setGoal] = useState("");
  const [maxSteps, setMaxSteps] = useState(4);

  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);
  const [restored, setRestored] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Record<number, boolean>>({});

  // ── Load pets + restore the persisted session ──
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
        /* unauthenticated / no pets — the gate above handles the empty state */
      } finally {
        if (alive) setLoadingPets(false);
      }
    })();
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as RunResult;
        if (saved?.steps) {
          setResult(saved);
          setGoal(saved.goal || "");
          setRestored(true);
        }
      }
    } catch { /* ignore corrupt session */ }
    return () => { alive = false; };
  }, []);

  const petName = pets.find((p) => p.id === petId)?.name || "your pet";
  const goalOk = goal.trim().length >= 3;
  const ready = goalOk && petId != null && !running;

  const run = useCallback(
    async (goalText: string, steps: number) => {
      if (petId == null || goalText.trim().length < 3) return;
      setRunning(true);
      setError(null);
      setRestored(false);
      setOpen({});

      // Live streaming (SSE): tool calls + results appear as the loop works,
      // instead of a blocking wait. Falls back to a clear error if the stream
      // can't be opened. The final `done` event carries the settled totals.
      const liveSteps: AgentStep[] = [];
      const byId: Record<string, number> = {}; // tool_call id → step index
      let liveThought = "";
      setResult({
        goal: goalText.trim(), answer: "", steps: [], stoppedReason: "running",
        creditsRemaining: undefined, at: Date.now(), petId, petName,
      });

      try {
        const res = await fetch(`/api/pets/${petId}/agent?stream=1`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "text/event-stream", ...getAuthHeaders() },
          body: JSON.stringify({ goal: goalText.trim(), maxSteps: steps }),
        });
        if (!res.ok || !res.body) {
          const data = await res.json().catch(() => ({} as any));
          setError(
            data?.error === "Not enough credits"
              ? `Not enough credits — a run costs ${COST}.`
              : data?.error || "The run failed. Try again.",
          );
          setResult(null);
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        const flush = () => setResult((r) => (r ? { ...r, steps: [...liveSteps] } : r));

        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const chunks = buf.split("\n\n");
          buf = chunks.pop() || "";
          for (const chunk of chunks) {
            const dataLine = chunk.split("\n").find((l) => l.startsWith("data:"));
            if (!dataLine) continue;
            let evt: any;
            try { evt = JSON.parse(dataLine.slice(5).trim()); } catch { continue; }
            if (evt.type === "thought") {
              liveThought = evt.text || liveThought;
            } else if (evt.type === "tool_call") {
              byId[evt.id] = liveSteps.length;
              liveSteps.push({ thought: liveThought, skill: evt.skill, input: evt.input, output: { status: "running…" }, ok: true });
              liveThought = "";
              flush();
            } else if (evt.type === "tool_result") {
              const idx = byId[evt.id];
              if (idx != null) { liveSteps[idx] = { ...liveSteps[idx], output: evt.output, ok: !!evt.ok }; flush(); }
            } else if (evt.type === "final") {
              setResult((r) => (r ? { ...r, answer: evt.answer || "" } : r));
            } else if (evt.type === "error" && evt.ok === false) {
              setError(evt.error || "The run failed. Try again.");
            } else if (evt.type === "done") {
              const rr: RunResult = {
                goal: evt.goal || goalText.trim(),
                answer: evt.answer || "",
                steps: evt.steps || liveSteps,
                stoppedReason: evt.stoppedReason || "finished",
                creditsRemaining: evt.creditsRemaining,
                at: Date.now(), petId, petName,
              };
              setResult(rr);
              try { localStorage.setItem(LS_KEY, JSON.stringify(rr)); } catch { /* quota */ }
            }
          }
        }
      } catch {
        setError("Network error — the loop didn't run. Try again.");
      } finally {
        setRunning(false);
      }
    },
    [petId, petName],
  );

  const clearSession = () => {
    try { localStorage.removeItem(LS_KEY); } catch { /* ignore */ }
    setResult(null);
    setRestored(false);
    setError(null);
  };

  const stop = result ? (STOP[result.stoppedReason] || { label: result.stoppedReason, tone: "warn" as const }) : null;
  const workPackages = result ? result.steps.filter((s) => s.skill !== "finish") : [];
  const hasFailure = !!result && (result.stoppedReason === "planner_error" || result.steps.some((s) => !s.ok && s.skill !== "finish"));

  return (
    <div style={{ maxWidth: 920, margin: "0 auto", padding: "96px 20px 80px" }}>
      {/* ── Header ── */}
      <div style={{ marginBottom: 26 }}>
        <div style={{ fontFamily: MONO, fontSize: 13, letterSpacing: "0.2em", color: PURPLE, fontWeight: 700, textTransform: "uppercase", marginBottom: 10 }}>
          Agent Workbench · powered by PetClaw
        </div>
        <h1 style={{ fontFamily: "var(--ed-disp, sans-serif)", fontSize: "clamp(26px,4vw,38px)", fontWeight: 800, color: INK, letterSpacing: "-0.025em", margin: "0 0 10px", lineHeight: 1.12 }}>
          Give your pet a goal. Watch it work.
        </h1>
        <p style={{ fontFamily: SANS, fontSize: 16, color: "rgba(33,26,18,0.6)", maxWidth: 620, margin: 0, lineHeight: 1.6 }}>
          Not a single prompt — a real loop. Your pet <b>plans</b> each step, runs a real
          <b> skill</b>, <b>recalls</b> what it knows, <b>observes</b> the result, and reports back.
        </p>

        {/* Honest scope note: what the loop runs vs. what it can only point to. */}
        <div style={{ marginTop: 14, padding: "10px 13px", borderRadius: 10, background: "rgba(33,26,18,0.035)", border: "1px solid rgba(0,0,0,0.07)", fontFamily: SANS, fontSize: 13, color: "rgba(33,26,18,0.6)", lineHeight: 1.55, maxWidth: 620 }}>
          <span style={{ fontFamily: MONO, fontSize: 13, letterSpacing: "0.1em", color: "rgba(33,26,18,0.45)", fontWeight: 700 }}>HOW IT CHAINS</span>
          <div style={{ marginTop: 4 }}>
            Your pet calls its <b>in-loop skills</b> plus real keyless <b>look-up tools</b>
            (web search, Wikipedia, crypto prices, its own memory) as native function tools and
            reasons over each result — live, one call at a time, retrying on failure. Skills that
            run on their own REST endpoints aren&apos;t offered here; invoke those via the SDK or MCP.
          </div>
        </div>
      </div>

      {/* ── Persistent-session strip ── */}
      {restored && result && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "10px 14px", borderRadius: 12, background: "rgba(107,79,160,0.05)", border: "1px solid rgba(107,79,160,0.18)", marginBottom: 18, flexWrap: "wrap" }}>
          <span style={{ fontFamily: MONO, fontSize: 13, color: "rgba(33,26,18,0.65)" }}>
            ⏎ Resumed your last run · {relTime(result.at)}
          </span>
          <button onClick={clearSession} style={ghostBtn}>Clear session</button>
        </div>
      )}

      {/* ── Composer ── */}
      <div style={card}>
        {/* Pet picker */}
        {!loadingPets && pets.length > 1 && (
          <div style={{ marginBottom: 14 }}>
            <label style={fieldLabel}>Pet</label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {pets.map((p) => (
                <button key={p.id} onClick={() => setPetId(p.id)}
                  style={{ ...chip, ...(petId === p.id ? chipActive : {}) }}>
                  {p.name || `Pet #${p.id}`}
                </button>
              ))}
            </div>
          </div>
        )}

        <label style={fieldLabel}>Goal for {petName}</label>
        <textarea
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          placeholder="e.g. Check my mood from our recent chats and suggest one thing for today"
          rows={3}
          maxLength={600}
          style={{ width: "100%", boxSizing: "border-box", fontFamily: SANS, fontSize: 15, lineHeight: 1.5, color: INK, padding: "12px 14px", borderRadius: 12, border: "1px solid rgba(33,26,18,0.13)", outline: "none", resize: "vertical", background: "#FBF6EC" }}
        />

        {/* Example seeds */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
          {EXAMPLES.map((ex) => (
            <button key={ex} onClick={() => setGoal(ex)} style={seedChip} title={ex}>
              {ex.length > 42 ? ex.slice(0, 42) + "…" : ex}
            </button>
          ))}
        </div>

        {/* Step budget */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 16, flexWrap: "wrap" }}>
          <label style={{ ...fieldLabel, margin: 0 }}>Step budget</label>
          <input type="range" min={1} max={MAX_STEPS} value={maxSteps}
            onChange={(e) => setMaxSteps(Number(e.target.value))}
            style={{ accentColor: PURPLE, flex: 1, minWidth: 120, maxWidth: 240 }} />
          <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: INK }}>{maxSteps}</span>
          <span style={{ fontFamily: MONO, fontSize: 13, color: "rgba(33,26,18,0.45)" }}>max packages</span>
        </div>

        {/* Preflight gate */}
        <div style={{ marginTop: 16, padding: "12px 14px", borderRadius: 12, background: "rgba(0,0,0,0.025)", border: "1px solid rgba(0,0,0,0.06)" }}>
          <div style={{ fontFamily: MONO, fontSize: 13, letterSpacing: "0.12em", color: "rgba(33,26,18,0.4)", fontWeight: 700, marginBottom: 8 }}>PREFLIGHT</div>
          <Check ok={goalOk} label="Goal is at least 3 characters" />
          <Check ok={petId != null} label="A pet is selected to run it" />
          <Check ok neutral label={`Costs ${COST} credits · refunded if no real work runs`} />
        </div>

        {error && (
          <div style={{ marginTop: 14, padding: "10px 14px", borderRadius: 10, background: TONE.err.bg, border: `1px solid ${TONE.err.bd}`, color: TONE.err.fg, fontFamily: SANS, fontSize: 13.5 }}>
            {error}
          </div>
        )}

        <button
          onClick={() => run(goal, maxSteps)}
          disabled={!ready}
          style={{
            marginTop: 16, width: "100%", padding: "13px 16px", borderRadius: 12, border: "none",
            fontFamily: SANS, fontSize: 15, fontWeight: 800, letterSpacing: "-0.01em",
            cursor: ready ? "pointer" : "not-allowed",
            color: "#FFF8EE",
            background: ready ? "linear-gradient(180deg,#F49B2A,#E27D0C)" : "rgba(33,26,18,0.18)",
            transition: "background 180ms ease, transform 120ms ease",
          }}
        >
          {running ? "● Planning & running…" : result ? "▶ Run again" : "▶ Run the agent loop"}
        </button>
      </div>

      {/* ── Result: work packages ── */}
      {running && !result && (
        <div style={{ ...card, marginTop: 18, textAlign: "center", color: "rgba(33,26,18,0.55)", fontFamily: SANS }}>
          <div style={{ marginBottom: 8 }}><Icon name="compass" size={30} /></div>
          {petName} is planning the first step…
        </div>
      )}

      {result && (
        <div style={{ marginTop: 22 }}>
          {/* Review gate */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span style={{ fontFamily: SANS, fontSize: 18, fontWeight: 800, color: INK }}>
                {workPackages.length} work package{workPackages.length === 1 ? "" : "s"}
              </span>
              {stop && (
                <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, padding: "3px 9px", borderRadius: 7, color: TONE[stop.tone].fg, background: TONE[stop.tone].bg, border: `1px solid ${TONE[stop.tone].bd}` }}>
                  {stop.label}
                </span>
              )}
              {typeof result.creditsRemaining === "number" && (
                <span style={{ fontFamily: MONO, fontSize: 13, color: "rgba(33,26,18,0.45)" }}>
                  {result.creditsRemaining} credits left
                </span>
              )}
            </div>
            {hasFailure && (
              <button onClick={() => run(result.goal, Math.min(MAX_STEPS, maxSteps + 2))} disabled={running} style={recoverBtn}>
                ↻ Recover (+2 steps)
              </button>
            )}
          </div>

          {/* Goal echo */}
          <div style={{ ...card, padding: "12px 16px", marginBottom: 12, background: "rgba(107,79,160,0.04)", border: "1px solid rgba(107,79,160,0.16)" }}>
            <span style={{ fontFamily: MONO, fontSize: 13, letterSpacing: "0.12em", color: PURPLE, fontWeight: 700 }}>GOAL</span>
            <div style={{ fontFamily: SANS, fontSize: 14.5, color: INK, marginTop: 4 }}>{result.goal}</div>
          </div>

          {/* Packages */}
          {workPackages.length === 0 && (
            <div style={{ ...card, color: "rgba(33,26,18,0.55)", fontFamily: SANS, fontSize: 14 }}>
              The planner finished without running a skill — try a more action-oriented goal.
            </div>
          )}
          {workPackages.map((s, i) => {
            const isOpen = !!open[i];
            const tone = s.ok ? TONE.ok : TONE.err;
            // Endpoint-only steps don't execute in-loop: executeSkill returns an
            // invoke_via_endpoint descriptor (a pointer), not a real result.
            const endpointOnly = (s.output as any)?.status === "invoke_via_endpoint";
            return (
              <div key={i} style={{ ...card, padding: 0, marginBottom: 10, overflow: "hidden" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "14px 16px" }}>
                  <div style={{ flexShrink: 0, width: 26, height: 26, borderRadius: 8, background: "rgba(107,79,160,0.1)", color: PURPLE, fontFamily: MONO, fontSize: 13, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {i + 1}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 5 }}>
                      <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, padding: "2px 8px", borderRadius: 6, background: "rgba(0,0,0,0.05)", color: INK }}>
                        {s.skill}
                      </span>
                      <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, padding: "2px 8px", borderRadius: 6, color: tone.fg, background: tone.bg, border: `1px solid ${tone.bd}` }}>
                        {s.ok ? (endpointOnly ? "→ located" : "✓ ran in-loop") : "✕ failed"}
                      </span>
                      {endpointOnly && (
                        <span title="This skill runs on its own REST endpoint. The loop located it and returned a pointer — it did not execute it or chain its result." style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, padding: "2px 8px", borderRadius: 6, color: "rgba(33,26,18,0.55)", background: "rgba(0,0,0,0.05)", border: "1px solid rgba(0,0,0,0.1)" }}>
                        endpoint-only · pointer
                        </span>
                      )}
                    </div>
                    <div style={{ fontFamily: SANS, fontSize: 14, color: "rgba(33,26,18,0.78)", lineHeight: 1.5 }}>
                      {s.thought || "(no plan recorded)"}
                    </div>
                    <button onClick={() => setOpen((o) => ({ ...o, [i]: !o[i] }))} style={{ ...ghostBtn, marginTop: 8 }}>
                      {isOpen ? "Hide observation" : "Show observation"}
                    </button>
                    {isOpen && (
                      <pre style={{ marginTop: 8, padding: "10px 12px", borderRadius: 10, background: "#1E1710", color: "#E8C77E", fontFamily: MONO, fontSize: 13, lineHeight: 1.5, overflow: "auto", maxHeight: 280, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                        {pretty(s.output)}
                      </pre>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {/* Synthesis */}
          {result.answer && (
            <div style={{ ...card, marginTop: 14, background: "linear-gradient(135deg,rgba(190,79,40,0.06),rgba(107,79,160,0.05))", border: "1px solid rgba(190,79,40,0.22)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: MONO, fontSize: 13, letterSpacing: "0.12em", color: "#9A4E1E", fontWeight: 700, marginBottom: 8 }}>
                <Icon name="scroll" size={14} /> {petName.toUpperCase()} REPORTS BACK
              </div>
              <div style={{ fontFamily: SANS, fontSize: 15.5, color: INK, lineHeight: 1.62, whiteSpace: "pre-wrap" }}>
                {result.answer}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Empty / no-pet state */}
      {!loadingPets && pets.length === 0 && (
        <div style={{ ...card, marginTop: 18, textAlign: "center", color: "rgba(33,26,18,0.6)", fontFamily: SANS }}>
          Adopt a pet first — then come back and give it a goal.
        </div>
      )}
    </div>
  );
}

// ── Preflight check row ──
function Check({ ok, label, neutral }: { ok: boolean; label: string; neutral?: boolean }) {
  const color = neutral ? "rgba(33,26,18,0.5)" : ok ? "#5C8A4E" : "rgba(33,26,18,0.35)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: SANS, fontSize: 13, color: "rgba(33,26,18,0.7)", lineHeight: 1.7 }}>
      <span style={{ color, fontWeight: 800, width: 14, textAlign: "center" }}>{neutral ? "•" : ok ? "✓" : "○"}</span>
      {label}
    </div>
  );
}

// ── shared styles ──
const card: React.CSSProperties = { background: "#FBF6EC", borderRadius: 16, padding: "20px", border: "1px solid rgba(33,26,18,0.13)", boxShadow: "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))" };
const fieldLabel: React.CSSProperties = { display: "block", fontFamily: MONO, fontSize: 13, letterSpacing: "0.08em", color: "rgba(33,26,18,0.5)", fontWeight: 700, marginBottom: 8, textTransform: "uppercase" };
const ghostBtn: React.CSSProperties = { background: "transparent", border: "none", color: PURPLE, fontFamily: MONO, fontSize: 13, fontWeight: 700, cursor: "pointer", padding: 0 };
const chip: React.CSSProperties = { fontFamily: SANS, fontSize: 13, fontWeight: 600, padding: "6px 12px", borderRadius: 9, border: "1px solid rgba(33,26,18,0.13)", background: "#FBF6EC", color: "rgba(33,26,18,0.6)", cursor: "pointer" };
const chipActive: React.CSSProperties = { background: "rgba(107,79,160,0.1)", border: "1px solid rgba(107,79,160,0.3)", color: PURPLE, fontWeight: 800 };
const seedChip: React.CSSProperties = { fontFamily: SANS, fontSize: 13, padding: "5px 10px", borderRadius: 8, border: "1px solid rgba(0,0,0,0.08)", background: "rgba(0,0,0,0.02)", color: "rgba(33,26,18,0.55)", cursor: "pointer" };
const recoverBtn: React.CSSProperties = { fontFamily: SANS, fontSize: 13, fontWeight: 700, padding: "8px 14px", borderRadius: 10, border: "1px solid rgba(190,79,40,0.35)", background: "rgba(190,79,40,0.10)", color: "#9A4E1E", cursor: "pointer" };
