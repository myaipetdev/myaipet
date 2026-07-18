"use client";

/**
 * FocusSession — a calm "study with your pet" pomodoro timer.
 *
 *   ┌──────────────────────────────────────────────────────┐
 *   │  FOCUS SESSION                          🔥 3-session  │
 *   │  ───────────────────────────────────────────────      │
 *   │   [ 25 ]  [ 50 ]  [ Custom ]        Break: [ 5 ] [10]  │
 *   │                                                        │
 *   │            ╭──────────────╮                            │
 *   │            │   🐾 avatar   │   23:41                   │
 *   │            │  (breathing)  │   focusing…                │
 *   │            ╰──────────────╯                            │
 *   │                                                        │
 *   │            [ Start ]  [ Pause ]  [ Reset ]              │
 *   │  ───────────────────────────────────────────────      │
 *   │  Today: 48 min focused · streak 3 sessions              │
 *   └──────────────────────────────────────────────────────┘
 *
 * Self-contained: fetches the active pet itself (api.pets.list), does not
 * touch App.tsx/Nav.tsx. On completing a focus block it fires a gentle
 * celebration and, if a pet is loaded, best-effort logs the minutes to the
 * existing /api/playtime heartbeat (api.playtime.heartbeat) so it counts
 * toward the pet's play time — failure there is swallowed and the local
 * streak/today-minutes counter (localStorage) still advances.
 *
 * Editorial styling only (--ed-* tokens), hard shadows, no neon. Respects
 * prefers-reduced-motion (breathing/pulse animations are frozen, celebration
 * becomes a static badge instead of a burst).
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { api } from "@/lib/api";

const STORAGE_KEY = "petagen_focus_stats";

type FocusPreset = { label: string; minutes: number };
const FOCUS_PRESETS: FocusPreset[] = [
  { label: "25", minutes: 25 },
  { label: "50", minutes: 50 },
];
const BREAK_PRESETS: FocusPreset[] = [
  { label: "5", minutes: 5 },
  { label: "10", minutes: 10 },
];

type Phase = "focus" | "break";
type RunState = "idle" | "running" | "paused";

interface FocusStats {
  date: string; // yyyy-mm-dd, local
  minutesToday: number;
  sessionsToday: number;
  streakDays: number;
  lastSessionDate: string | null; // yyyy-mm-dd of the most recent completed focus block
}

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function daysBetween(a: string, b: string): number {
  const da = new Date(a + "T00:00:00");
  const db = new Date(b + "T00:00:00");
  return Math.round((db.getTime() - da.getTime()) / 86400000);
}

function loadStats(): FocusStats {
  const today = todayKey();
  const fallback: FocusStats = { date: today, minutesToday: 0, sessionsToday: 0, streakDays: 0, lastSessionDate: null };
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as FocusStats;
    if (parsed.date !== today) {
      // New day — roll minutes/sessions, keep streak (streak is recomputed on completion).
      return { ...parsed, date: today, minutesToday: 0, sessionsToday: 0 };
    }
    return parsed;
  } catch {
    return fallback;
  }
}

function saveStats(stats: FocusStats) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
  } catch {
    // best-effort only
  }
}

function formatClock(totalSeconds: number): string {
  const m = Math.floor(Math.max(0, totalSeconds) / 60);
  const s = Math.max(0, totalSeconds) % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function FocusSession() {
  const [stats, setStats] = useState<FocusStats>(() => loadStats());
  const [focusMinutes, setFocusMinutes] = useState(25);
  const [breakMinutes, setBreakMinutes] = useState(5);
  const [customOpen, setCustomOpen] = useState(false);
  const [customValue, setCustomValue] = useState("25");

  const [phase, setPhase] = useState<Phase>("focus");
  const [runState, setRunState] = useState<RunState>("idle");
  const [secondsLeft, setSecondsLeft] = useState(focusMinutes * 60);
  const [celebrate, setCelebrate] = useState(false);

  const [pet, setPet] = useState<any>(null);
  const petIdRef = useRef<number | undefined>(undefined);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reducedMotionRef = useRef(false);

  useEffect(() => {
    reducedMotionRef.current =
      typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  // Best-effort: load the active pet for the avatar + playtime heartbeat.
  useEffect(() => {
    let cancelled = false;
    api.pets
      .list()
      .then((res: any) => {
        if (cancelled) return;
        const list = res?.pets || res || [];
        const active = Array.isArray(list) ? list.find((p: any) => p?.is_active) || list[0] : null;
        if (active) {
          setPet(active);
          petIdRef.current = active.id;
        }
      })
      .catch(() => {
        // No pet, no auth, dev mode without backend — the timer still works standalone.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Reset the clock whenever the idle timer's target duration changes.
  useEffect(() => {
    if (runState === "idle") {
      setSecondsLeft((phase === "focus" ? focusMinutes : breakMinutes) * 60);
    }
  }, [focusMinutes, breakMinutes, phase, runState]);

  const completeBlock = useCallback(
    (completedPhase: Phase) => {
      if (completedPhase === "focus") {
        const today = todayKey();
        setStats((prev) => {
          let streakDays = prev.streakDays;
          if (prev.lastSessionDate === today) {
            // already counted today
          } else if (prev.lastSessionDate && daysBetween(prev.lastSessionDate, today) === 1) {
            streakDays = prev.streakDays + 1;
          } else {
            streakDays = 1;
          }
          const next: FocusStats = {
            date: today,
            minutesToday: prev.minutesToday + focusMinutes,
            sessionsToday: prev.sessionsToday + 1,
            streakDays,
            lastSessionDate: today,
          };
          saveStats(next);
          return next;
        });

        // The server caps this to wall-clock time elapsed since the zero-minute
        // start marker and rejects rapid/replayed increments.
        const minutesToLog = focusMinutes;
        if (minutesToLog > 0) {
          api.playtime.heartbeat(minutesToLog, petIdRef.current).catch(() => {
            // Local streak already recorded; server credit is a bonus, not required.
          });
        }

        setCelebrate(true);
        window.setTimeout(() => setCelebrate(false), 2600);
      }

      // Auto-advance: focus → break → focus, paused at the boundary so the
      // user consciously starts the next block (keeps it calm, not naggy).
      const nextPhase: Phase = completedPhase === "focus" ? "break" : "focus";
      setPhase(nextPhase);
      setSecondsLeft((nextPhase === "focus" ? focusMinutes : breakMinutes) * 60);
      setRunState("idle");
    },
    [focusMinutes, breakMinutes]
  );

  useEffect(() => {
    if (runState !== "running") {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }
    intervalRef.current = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          window.setTimeout(() => completeBlock(phase), 0);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runState, phase, completeBlock]);

  const start = () => {
    if (phase === "focus" && runState === "idle") {
      // Establish a server timestamp without granting any minutes. Completion
      // can then claim only time that truly elapsed after this point.
      api.playtime.heartbeat(0, petIdRef.current).catch(() => {});
    }
    setRunState("running");
  };
  const pause = () => setRunState("paused");
  const reset = () => {
    setRunState("idle");
    setSecondsLeft((phase === "focus" ? focusMinutes : breakMinutes) * 60);
  };

  const applyCustom = () => {
    const n = Math.max(1, Math.min(180, Math.floor(Number(customValue) || 25)));
    setFocusMinutes(n);
    setCustomOpen(false);
  };

  const avatarSrc = pet?.avatar_url || "/mascot.jpg";
  const petName = pet?.name || "your pet";
  const isFocus = phase === "focus";
  const targetSeconds = (isFocus ? focusMinutes : breakMinutes) * 60;
  const progress = targetSeconds > 0 ? 1 - secondsLeft / targetSeconds : 0;

  return (
    <div className="focus-session">
      <style jsx>{`
        .focus-session {
          background: var(--ed-paper, #fbf6ec);
          border: 1px solid var(--ed-hair, rgba(33, 26, 18, 0.13));
          border-radius: 20px;
          box-shadow: var(--ed-shadow-card, 0 20px 40px -26px rgba(80, 55, 20, 0.5));
          padding: 1.5rem;
          max-width: 480px;
          font-family: var(--ed-body, "Hanken Grotesk", sans-serif);
          color: var(--ed-ink, #211a12);
        }
        .fs-header {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          margin-bottom: 0.75rem;
        }
        .fs-title {
          font-family: var(--ed-disp, "Bricolage Grotesque", sans-serif);
          font-size: 1.05rem;
          font-weight: 700;
          letter-spacing: 0.02em;
          text-transform: uppercase;
        }
        .fs-streak {
          font-family: var(--ed-m, "Space Mono", monospace);
          font-size: 0.8rem;
          color: var(--ed-terra, #be4f28);
        }
        .fs-hair {
          border: none;
          border-top: 1px solid var(--ed-hair, rgba(33, 26, 18, 0.13));
          margin: 0.6rem 0 1rem;
        }
        .fs-row {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
          align-items: center;
          margin-bottom: 0.5rem;
        }
        .fs-group-label {
          font-family: var(--ed-m, "Space Mono", monospace);
          font-size: 0.7rem;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: var(--ed-muted, #7a6e5a);
          margin-right: 0.25rem;
        }
        .fs-chip {
          font-family: var(--ed-m, "Space Mono", monospace);
          font-size: 0.8rem;
          padding: 0.35rem 0.7rem;
          border-radius: 999px;
          border: 1px solid var(--ed-hair, rgba(33, 26, 18, 0.13));
          background: var(--ed-inset, #f5efe2);
          color: var(--ed-ink, #211a12);
          cursor: pointer;
          transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
        }
        .fs-chip[disabled] {
          cursor: not-allowed;
          opacity: 0.5;
        }
        .fs-chip.active {
          background: var(--ed-terra, #be4f28);
          border-color: var(--ed-terra, #be4f28);
          color: var(--ed-cream-on, #fce9cf);
        }
        .fs-custom-input {
          width: 4.5rem;
          font-family: var(--ed-m, "Space Mono", monospace);
          font-size: 0.85rem;
          padding: 0.3rem 0.5rem;
          border-radius: 8px;
          border: 1px solid var(--ed-hair, rgba(33, 26, 18, 0.13));
          background: var(--ed-paper, #fbf6ec);
          color: var(--ed-ink, #211a12);
        }
        .fs-stage {
          display: flex;
          align-items: center;
          gap: 1.25rem;
          margin: 1.25rem 0;
          padding: 1rem;
          border-radius: 16px;
          background: var(--ed-field, #ece4d4);
          border: 1px solid var(--ed-hair, rgba(33, 26, 18, 0.13));
        }
        .fs-avatar-wrap {
          position: relative;
          width: 84px;
          height: 84px;
          flex: none;
        }
        .fs-avatar-ring {
          position: absolute;
          inset: -6px;
          border-radius: 50%;
          background: conic-gradient(
            var(--ed-terra, #be4f28) calc(var(--fs-progress, 0) * 360deg),
            var(--ed-hair, rgba(33, 26, 18, 0.13)) 0
          );
          transition: background 0.4s linear;
        }
        .fs-avatar-inner {
          position: absolute;
          inset: 0;
          border-radius: 50%;
          overflow: hidden;
          border: 3px solid var(--ed-paper, #fbf6ec);
          background: var(--ed-paper, #fbf6ec);
        }
        .fs-avatar-inner img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }
        .fs-avatar-inner.breathing {
          animation: fsBreathe 4.2s ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .fs-avatar-inner.breathing {
            animation: none;
          }
        }
        @keyframes fsBreathe {
          0%,
          100% {
            transform: scale(1);
          }
          50% {
            transform: scale(1.035);
          }
        }
        .fs-clock-col {
          display: flex;
          flex-direction: column;
          gap: 0.15rem;
        }
        .fs-clock {
          font-family: var(--ed-disp, "Bricolage Grotesque", sans-serif);
          font-size: 2.1rem;
          font-weight: 700;
          line-height: 1;
          font-variant-numeric: tabular-nums;
        }
        .fs-phase-label {
          font-family: var(--ed-m, "Space Mono", monospace);
          font-size: 0.78rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--ed-muted, #7a6e5a);
        }
        .fs-phase-label.focus {
          color: var(--ed-terra, #be4f28);
        }
        .fs-phase-label.break {
          color: var(--ed-thrive, #5c8a4e);
        }
        .fs-controls {
          display: flex;
          gap: 0.6rem;
          margin-bottom: 1rem;
        }
        .fs-btn {
          font-family: var(--ed-body, sans-serif);
          font-weight: 600;
          font-size: 0.85rem;
          padding: 0.55rem 1.1rem;
          border-radius: 10px;
          border: 1px solid var(--ed-ink, #211a12);
          background: var(--ed-paper, #fbf6ec);
          color: var(--ed-ink, #211a12);
          cursor: pointer;
          box-shadow: 2px 2px 0 var(--ed-ink, #211a12);
          transition: transform 0.12s ease, box-shadow 0.12s ease;
        }
        .fs-btn:active {
          transform: translate(2px, 2px);
          box-shadow: none;
        }
        .fs-btn.primary {
          background: var(--ed-terra, #be4f28);
          border-color: var(--ed-terra, #be4f28);
          color: var(--ed-cream-on, #fce9cf);
          box-shadow: 2px 2px 0 var(--ed-terra-sub, #9a4e1e);
        }
        .fs-footer {
          font-family: var(--ed-m, "Space Mono", monospace);
          font-size: 0.78rem;
          color: var(--ed-muted, #7a6e5a);
        }
        .fs-celebrate {
          margin-top: 0.75rem;
          padding: 0.6rem 0.8rem;
          border-radius: 12px;
          background: var(--ed-cream-on, #fce9cf);
          border: 1px solid var(--ed-terra, #be4f28);
          color: var(--ed-terra-sub, #9a4e1e);
          font-size: 0.85rem;
          font-weight: 600;
        }
        @media (prefers-reduced-motion: no-preference) {
          .fs-celebrate {
            animation: fsPop 0.3s var(--ed-ease, ease-out);
          }
        }
        @keyframes fsPop {
          0% {
            opacity: 0;
            transform: translateY(4px) scale(0.98);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
      `}</style>

      <div className="fs-header">
        <span className="fs-title">Focus Session</span>
        {stats.streakDays > 0 && <span className="fs-streak">🔥 {stats.streakDays}-day streak</span>}
      </div>
      <hr className="fs-hair" />

      <div className="fs-row">
        <span className="fs-group-label">Focus</span>
        {FOCUS_PRESETS.map((p) => (
          <button
            key={p.minutes}
            type="button"
            className={`fs-chip${focusMinutes === p.minutes && !customOpen ? " active" : ""}`}
            disabled={runState !== "idle"}
            onClick={() => {
              setFocusMinutes(p.minutes);
              setCustomOpen(false);
            }}
          >
            {p.label}m
          </button>
        ))}
        <button
          type="button"
          className={`fs-chip${customOpen || !FOCUS_PRESETS.some((p) => p.minutes === focusMinutes) ? " active" : ""}`}
          disabled={runState !== "idle"}
          onClick={() => setCustomOpen((v) => !v)}
        >
          Custom
        </button>
        {customOpen && (
          <>
            <input
              className="fs-custom-input"
              type="number"
              aria-label="Custom focus minutes"
              min={1}
              max={180}
              value={customValue}
              onChange={(e) => setCustomValue(e.target.value)}
            />
            <button type="button" className="fs-chip" onClick={applyCustom}>
              Set
            </button>
          </>
        )}
      </div>

      <div className="fs-row">
        <span className="fs-group-label">Break</span>
        {BREAK_PRESETS.map((p) => (
          <button
            key={p.minutes}
            type="button"
            className={`fs-chip${breakMinutes === p.minutes ? " active" : ""}`}
            disabled={runState !== "idle"}
            onClick={() => setBreakMinutes(p.minutes)}
          >
            {p.label}m
          </button>
        ))}
      </div>

      <div className="fs-stage">
        <div className="fs-avatar-wrap" style={{ ["--fs-progress" as any]: progress }}>
          <div className="fs-avatar-ring" />
          <div className={`fs-avatar-inner${runState === "running" ? " breathing" : ""}`}>
            <img src={avatarSrc} alt={petName} />
          </div>
        </div>
        <div className="fs-clock-col">
          <span className="fs-clock">{formatClock(secondsLeft)}</span>
          <span className={`fs-phase-label ${phase}`}>
            {isFocus
              ? runState === "running"
                ? `focusing with ${petName}…`
                : "focus block"
              : runState === "running"
              ? "break — stretch a little"
              : "break block"}
          </span>
        </div>
      </div>

      <div className="fs-controls">
        {runState !== "running" ? (
          <button type="button" className="fs-btn primary" onClick={start}>
            {runState === "paused" ? "Resume" : "Start"}
          </button>
        ) : (
          <button type="button" className="fs-btn" onClick={pause}>
            Pause
          </button>
        )}
        <button type="button" className="fs-btn" onClick={reset}>
          Reset
        </button>
      </div>

      {celebrate && (
        <div className="fs-celebrate" role="status">
          🎉 Nice focus block — {petName} enjoyed the company. +{Math.min(focusMinutes, 10)}m logged.
        </div>
      )}

      <hr className="fs-hair" />
      <div className="fs-footer">
        Today: {stats.minutesToday} min focused · {stats.sessionsToday} session{stats.sessionsToday === 1 ? "" : "s"}
      </div>
    </div>
  );
}
