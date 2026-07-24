"use client";

/**
 * ShortsStudio — a semi-automatic short-form video PLANNER.
 *
 * Honest scope: this PLANS a shorts sequence (timecoded scenes with captions,
 * shot types, and a BGM mood). It does NOT assemble or render the final video.
 * The base plan is a pure client-side heuristic (see lib/studio/shortsPlan.ts) —
 * ZERO server cost. The only optionally-paid step is handing one scene's visual
 * direction to the existing Studio Director, which is metered elsewhere.
 *
 * Flow:
 *   1. Script/idea + length target (15 / 30 / 60s) + vibe.
 *   2. Deterministic scene breakdown: HOOK (0–2s) → 2–4 BODY → PAYOFF/CTA,
 *      each with a start–end timecode, one-line visual direction, on-screen
 *      caption, and suggested shot type.
 *   3. Timeline strip + a vertical 9:16 preview of the current scene's caption,
 *      plus a caption-timing table.
 *   4. Per scene: "→ Send to Video Prompt" (onSendToDirector, else clipboard)
 *      and "Copy caption".
 *   5. "Copy shorts plan" — the full timecoded production sheet. No fabricated
 *      view / engagement numbers, ever.
 *
 * Collectible Editorial chrome (--ed-* tokens, hard offset shadows, no neon).
 * Min font 13px · 44px tap targets.
 */

import { useEffect, useMemo, useState } from "react";
import {
  buildShortsPlan,
  planToText,
  sceneToDirectorText,
  formatTimecode,
  SHORTS_LAYOUT,
  type ShortsPlan,
  type ShortsScene,
  type Vibe,
  type LengthTarget,
} from "@/lib/studio/shortsPlan";
import { getAuthHeaders } from "@/lib/api";

// ── Editorial tokens (mirrors the studio chrome) ─────────────────────────────
const T = {
  paper: "#FBF6EC", inset: "#F5EFE2", field: "#ECE4D4",
  ink: "#211A12", ink70: "#3A3024", muted: "#7A6E5A", muted2: "#5C5140", mono: "#9A7B4E",
  hair: "rgba(33,26,18,.13)",
  terra: "#BE4F28", terraSub: "#9A4E1E", creamOn: "#FCE9CF",
  cta1: "#F49B2A", cta2: "#E27D0C",
  gold: "#C8932F", thrive: "#5C8A4E",
  disp: "var(--ed-disp)", body: "var(--ed-body)", m: "var(--ed-m)",
  // dark 9:16 stage — makes captions pop, per the brief
  stage: "#211A12", stage2: "#100C07", stageInk: "#FBF3E3", stageMuted: "rgba(251,243,227,.55)",
};

const LENGTHS: LengthTarget[] = [15, 30, 60];
const VIBE_OPTS: { key: Vibe; label: string }[] = [
  { key: "cozy", label: "Cozy" },
  { key: "energetic", label: "Energetic" },
  { key: "funny", label: "Funny" },
  { key: "cinematic", label: "Cinematic" },
];

function roleColor(role: ShortsScene["role"]): string {
  return role === "hook" ? T.terra : role === "payoff" ? T.thrive : T.gold;
}
function roleLabel(scene: ShortsScene): string {
  if (scene.role === "hook") return "HOOK";
  if (scene.role === "payoff") return "PAYOFF";
  return `BODY ${scene.roleIndex}`;
}

type GuideBeat = "hook" | "body" | "payoff";

const GUIDE_BEATS: {
  role: GuideBeat;
  title: string;
  cue: string;
  caption: string;
}[] = [
  { role: "hook", title: "Stop the scroll", cue: "Open on motion or a question.", caption: "WAIT" },
  { role: "body", title: "Build the moment", cue: "Give each shot one clear action.", caption: "ACTION" },
  { role: "payoff", title: "Land the reward", cue: "Hold the reveal, reaction or CTA.", caption: "REVEAL" },
];

function guideTime(role: GuideBeat, target: LengthTarget): string {
  const layout = SHORTS_LAYOUT[target];
  if (role === "hook") return `0–${layout.hook}s`;
  const payoffStart = target - layout.payoff;
  if (role === "body") return `${layout.hook}–${payoffStart}s`;
  return `${payoffStart}–${target}s`;
}

/**
 * Diagrammatic framing guide — deliberately not a fabricated generated clip.
 * It teaches composition and caption placement before a user has a plan.
 */
function GuideFrame({ role, caption }: { role: GuideBeat; caption: string }) {
  return (
    <div className={`shorts-guide-frame shorts-guide-frame--${role}`} aria-hidden="true">
      <svg viewBox="0 0 90 150" focusable="false">
        {role === "hook" && (
          <>
            <path d="M18 42v-9h9M72 42v-9h-9M18 94v9h9M72 94v9h-9" className="guide-focus" />
            <path d="M28 57 33 39l12 11 12-11 5 18" className="guide-pet-fill" />
            <circle cx="45" cy="70" r="24" className="guide-pet-fill" />
            <circle cx="37" cy="68" r="2.4" className="guide-eye" />
            <circle cx="53" cy="68" r="2.4" className="guide-eye" />
            <path d="M41 77q4 4 8 0" className="guide-face" />
            <path d="M10 57h9M8 68h8M11 79h7" className="guide-motion" />
          </>
        )}
        {role === "body" && (
          <>
            <rect x="10" y="27" width="20" height="70" rx="6" className="guide-panel" />
            <rect x="35" y="27" width="20" height="70" rx="6" className="guide-panel guide-panel--mid" />
            <rect x="60" y="27" width="20" height="70" rx="6" className="guide-panel" />
            <circle cx="20" cy="54" r="7" className="guide-subject" />
            <circle cx="45" cy="67" r="7" className="guide-subject" />
            <circle cx="70" cy="47" r="7" className="guide-subject" />
            <path d="M24 63q12 17 17 7M49 59q10-16 17-10" className="guide-motion" />
          </>
        )}
        {role === "payoff" && (
          <>
            <path d="M45 19v13M20 29l9 10M70 29l-9 10M11 54h14M79 54H65" className="guide-rays" />
            <circle cx="45" cy="62" r="28" className="guide-payoff-ring" />
            <path d="M29 58 34 41l11 10 11-10 5 17" className="guide-pet-fill" />
            <circle cx="45" cy="70" r="22" className="guide-pet-fill" />
            <circle cx="38" cy="68" r="2.3" className="guide-eye" />
            <circle cx="52" cy="68" r="2.3" className="guide-eye" />
            <path d="M39 76q6 6 12 0" className="guide-face" />
            <path d="m67 31 2 5 5 2-5 2-2 5-2-5-5-2 5-2Z" className="guide-spark" />
          </>
        )}
      </svg>
      <span className="shorts-guide-caption">{caption}</span>
    </div>
  );
}

export interface ShortsStudioProps {
  /**
   * Hands a scene's visual direction to the Studio Director. The suite shell
   * wires this. When absent, the scene text is copied to the clipboard instead.
   */
  onSendToDirector?: (sceneText: string) => void;
  /** Optional pet name to anchor the copy + seed the example placeholder. */
  petName?: string;
}

export default function ShortsStudio({ onSendToDirector, petName }: ShortsStudioProps) {
  const subjectSeed = (petName || "").trim();
  const exampleName = subjectSeed || "Dordor";

  const [script, setScript] = useState("");
  const [target, setTarget] = useState<LengthTarget>(30);
  const [vibe, setVibe] = useState<Vibe>("cozy");
  const [hasPlanned, setHasPlanned] = useState(false);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [copied, setCopied] = useState<string | null>(null);

  // Optional AI caption polish (signed-in, metered like the Director). Holds
  // per-scene rewritten captions keyed by scene id; the base plan stays free.
  const [polish, setPolish] = useState<Record<string, string>>({});
  const [polishBusy, setPolishBusy] = useState(false);
  const [polishMsg, setPolishMsg] = useState<string | null>(null);

  // Live plan: once the user has planned once, the plan tracks script/target/vibe
  // so tweaking the vibe or length re-plans instantly (all client-side, no cost).
  const plan: ShortsPlan | null = useMemo(() => {
    if (!hasPlanned || script.trim().length === 0) return null;
    const base = buildShortsPlan({ script, target, vibe, subject: subjectSeed || undefined });
    if (!Object.keys(polish).length) return base;
    // Overlay AI-polished captions without touching timing / shots / structure.
    return { ...base, scenes: base.scenes.map((s) => (polish[s.id] ? { ...s, caption: polish[s.id] } : s)) };
  }, [hasPlanned, script, target, vibe, subjectSeed, polish]);

  // Any change to the base plan inputs invalidates stale polished captions.
  useEffect(() => { setPolish({}); setPolishMsg(null); }, [script, target, vibe]);

  // Keep the selected scene in range as the plan changes.
  useEffect(() => {
    if (!plan) return;
    if (currentIdx > plan.scenes.length - 1) setCurrentIdx(0);
  }, [plan, currentIdx]);

  // Clear the "Copied ✓" flash.
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(null), 1600);
    return () => clearTimeout(t);
  }, [copied]);

  const copyText = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
    } catch {
      // Clipboard blocked (older webview / permission) — surface a soft hint.
      setCopied(`err:${key}`);
    }
  };

  const sendToDirector = (scene: ShortsScene) => {
    if (!plan) return;
    const text = sceneToDirectorText(scene, plan);
    if (onSendToDirector) {
      onSendToDirector(text);
      setCopied(`dir:${scene.id}`);
    } else {
      void copyText(text, `dir:${scene.id}`);
    }
  };

  const doPlan = () => {
    if (script.trim().length === 0) return;
    setHasPlanned(true);
    setCurrentIdx(0);
  };

  const useExample = () => {
    setScript(`${exampleName} hears the treat jar, races into frame, tries three dramatic tricks, then earns the snack and gives the camera a proud high-five.`);
    setTarget(30);
    setVibe("energetic");
    setHasPlanned(true);
    setCurrentIdx(0);
  };

  // AI polish: rewrite each scene's on-screen caption. Timing/shots/structure
  // stay exactly as the free planner produced them.
  const doPolish = async () => {
    if (!plan || polishBusy) return;
    setPolishBusy(true);
    setPolishMsg(null);
    try {
      const res = await fetch("/api/studio/shorts-polish", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({
          scenes: plan.scenes.map((s) => ({ id: s.id, role: s.role, caption: s.caption, direction: s.direction })),
          vibe: plan.vibe,
          subject: plan.subject,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) { setPolishMsg("Sign in on the Video Prompt tab to use AI polish."); return; }
      if (!res.ok) { setPolishMsg(data?.error || "AI polish is unavailable right now."); return; }
      const map: Record<string, string> = {};
      for (const c of data?.captions ?? []) if (c?.id && c?.caption) map[c.id] = String(c.caption);
      if (Object.keys(map).length) { setPolish(map); setPolishMsg("Captions polished ✓"); }
      else setPolishMsg("No captions came back — the free plan is still perfect.");
    } catch {
      setPolishMsg("Network error — try again.");
    } finally {
      setPolishBusy(false);
    }
  };

  const current = plan ? plan.scenes[Math.min(currentIdx, plan.scenes.length - 1)] : null;

  // ── shared styles ──
  const cardStyle: React.CSSProperties = {
    background: T.paper,
    border: `1px solid ${T.hair}`,
    borderRadius: 16,
    boxShadow: "var(--ed-shadow-card)",
    padding: 18,
  };
  const eyebrow: React.CSSProperties = {
    fontFamily: T.m, fontWeight: 700, fontSize: 13, letterSpacing: "0.16em",
    textTransform: "uppercase", color: T.terraSub,
  };
  const labelStyle: React.CSSProperties = {
    fontFamily: T.m, fontWeight: 700, fontSize: 13, letterSpacing: "0.1em",
    textTransform: "uppercase", color: T.mono, marginBottom: 8, display: "block",
  };

  const segBtn = (active: boolean): React.CSSProperties => ({
    minHeight: 44, padding: "11px 16px", borderRadius: 10,
    border: `1px solid ${active ? T.terra : T.hair}`,
    background: active ? T.terra : T.paper,
    color: active ? T.creamOn : T.muted2,
    fontFamily: T.m, fontWeight: 700, fontSize: 13, letterSpacing: "0.08em",
    textTransform: "uppercase", cursor: "pointer", whiteSpace: "nowrap",
    boxShadow: active ? "2px 2px 0 rgba(154,78,30,.28)" : "none",
    transition: "background .12s ease, color .12s ease",
  });

  const actionBtn: React.CSSProperties = {
    minHeight: 40, padding: "9px 14px", borderRadius: 9,
    border: `1px solid ${T.hair}`, background: T.paper, color: T.ink70,
    fontFamily: T.m, fontWeight: 700, fontSize: 13, letterSpacing: "0.06em",
    textTransform: "uppercase", cursor: "pointer", whiteSpace: "nowrap",
    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
  };

  return (
    <div style={{ fontFamily: T.body, color: T.ink, maxWidth: 960, margin: "0 auto", padding: "4px 0" }}>
      <style>{`
        .shorts-story-map {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 10px;
        }
        .shorts-beat-card {
          position: relative;
          min-width: 0;
          display: grid;
          grid-template-columns: 72px minmax(0, 1fr);
          gap: 12px;
          align-items: center;
          padding: 12px;
          border: 1px solid ${T.hair};
          border-radius: 14px;
          background: rgba(251, 246, 236, .82);
        }
        .shorts-beat-card:not(:last-child)::after {
          content: "→";
          position: absolute;
          z-index: 2;
          right: -10px;
          top: 50%;
          width: 18px;
          height: 18px;
          transform: translateY(-50%);
          display: grid;
          place-items: center;
          border: 1px solid ${T.hair};
          border-radius: 999px;
          background: ${T.paper};
          color: ${T.terraSub};
          font: 800 13px ${T.m};
        }
        .shorts-guide-frame {
          position: relative;
          width: 72px;
          aspect-ratio: 9 / 16;
          overflow: hidden;
          border: 1px solid rgba(33, 26, 18, .18);
          border-radius: 10px;
          background: ${T.stage2};
          box-shadow: 2px 3px 0 rgba(33, 26, 18, .14);
        }
        .shorts-guide-frame svg { display: block; width: 100%; height: 100%; }
        .shorts-guide-frame--hook { background: linear-gradient(155deg, #7B2E20 0%, #21120D 74%); }
        .shorts-guide-frame--body { background: linear-gradient(155deg, #C8932F 0%, #4B2B15 78%); }
        .shorts-guide-frame--payoff { background: linear-gradient(155deg, #5C8A4E 0%, #142316 78%); }
        .guide-focus, .guide-face, .guide-motion, .guide-rays {
          fill: none;
          stroke: rgba(251, 243, 227, .86);
          stroke-width: 2;
          stroke-linecap: round;
          stroke-linejoin: round;
        }
        .guide-motion { stroke: rgba(251, 243, 227, .48); }
        .guide-pet-fill { fill: rgba(251, 243, 227, .88); }
        .guide-eye { fill: #211A12; }
        .guide-panel { fill: rgba(251, 243, 227, .16); stroke: rgba(251, 243, 227, .36); }
        .guide-panel--mid { fill: rgba(251, 243, 227, .26); }
        .guide-subject { fill: rgba(251, 243, 227, .9); }
        .guide-rays { stroke: rgba(252, 233, 207, .65); }
        .guide-payoff-ring { fill: rgba(251, 243, 227, .12); stroke: rgba(251, 243, 227, .38); }
        .guide-spark { fill: #F5C75E; }
        .shorts-guide-caption {
          position: absolute;
          left: 5px;
          right: 5px;
          bottom: 7px;
          padding: 4px 2px;
          border-radius: 4px;
          background: rgba(16, 12, 7, .76);
          color: ${T.stageInk};
          text-align: center;
          font: 800 13px/1 ${T.disp};
          letter-spacing: .01em;
        }
        .shorts-workflow-rail {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 9px;
          flex-wrap: wrap;
          margin-top: 11px;
          color: ${T.muted};
          font: 700 13px/1.3 ${T.m};
          letter-spacing: .035em;
        }
        .shorts-workflow-node {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          min-height: 28px;
          padding: 4px 9px;
          border: 1px solid ${T.hair};
          border-radius: 999px;
          background: ${T.paper};
        }
        .shorts-workflow-node b { color: ${T.ink70}; }
        .shorts-empty-guide {
          display: grid;
          grid-template-columns: minmax(0, 1.15fr) minmax(250px, .85fr);
          gap: 18px;
          align-items: center;
          text-align: left;
        }
        .shorts-example-beats {
          display: grid;
          gap: 7px;
        }
        .shorts-example-beat {
          display: grid;
          grid-template-columns: 56px 58px minmax(0, 1fr);
          gap: 8px;
          align-items: center;
          min-height: 38px;
          padding: 7px 9px;
          border: 1px solid ${T.hair};
          border-left: 3px solid var(--beat-color);
          border-radius: 9px;
          background: rgba(251, 246, 236, .72);
          color: ${T.muted2};
          font: 700 13px/1.25 ${T.m};
        }
        .shorts-example-beat span:first-child { color: ${T.ink70}; }
        .shorts-example-beat time { color: ${T.muted}; font-weight: 500; }
        @media (max-width: 760px) {
          .shorts-story-map { grid-template-columns: 1fr; }
          .shorts-beat-card:not(:last-child)::after {
            content: "↓";
            right: 18px;
            top: auto;
            bottom: -10px;
            transform: none;
          }
          .shorts-guide-frame { width: 64px; }
          .shorts-beat-card { grid-template-columns: 64px minmax(0, 1fr); }
          .shorts-empty-guide { grid-template-columns: 1fr; }
        }
        @media (prefers-reduced-motion: reduce) {
          .shorts-example-button { transition: none !important; }
          .shorts-example-button:hover { transform: none !important; }
        }
      `}</style>
      {/* ── Header ── */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span aria-hidden style={{ width: 9, height: 9, borderRadius: 999, background: T.terra, boxShadow: `0 0 0 3px ${T.creamOn}` }} />
          <span style={eyebrow}>Shorts Planner</span>
        </div>
        <h2 style={{
          fontFamily: T.disp, fontWeight: 800, fontSize: 26, letterSpacing: "-0.02em",
          margin: "8px 0 4px", lineHeight: 1.1, color: T.ink,
        }}>
          Plan a short, beat by beat.
        </h2>
        <p style={{ fontFamily: T.body, fontSize: 14, color: T.muted, margin: 0, maxWidth: 620 }}>
          Turn an idea into a timecoded shot list — hook, body, payoff — with captions and shot types.
          It <strong style={{ color: T.muted2 }}>plans the sequence</strong>; it doesn&rsquo;t assemble the final video.
        </p>

        {/* A visual story map teaches both pacing and the product boundary:
            this tab structures the edit; generated footage comes later. */}
        <section
          aria-labelledby="shorts-story-map-title"
          style={{
            marginTop: 16, padding: 12, borderRadius: 16,
            border: `1px solid ${T.hair}`, background: T.inset,
          }}
        >
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
            <h3 id="shorts-story-map-title" style={{ ...eyebrow, margin: 0 }}>A {target}-second story map</h3>
            <span style={{ fontFamily: T.m, fontSize: 13, color: T.muted, letterSpacing: ".04em" }}>
              Every plan follows this rhythm
            </span>
          </div>
          <div className="shorts-story-map">
            {GUIDE_BEATS.map((beat) => (
              <article className="shorts-beat-card" key={beat.role}>
                <GuideFrame role={beat.role} caption={beat.caption} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", marginBottom: 5 }}>
                    <span style={{
                      fontFamily: T.m, fontSize: 13, fontWeight: 800, letterSpacing: ".08em",
                      color: T.ink70, textTransform: "uppercase",
                    }}>
                      {beat.role}
                    </span>
                    <span style={{ fontFamily: T.m, fontSize: 13, color: T.muted }}>{guideTime(beat.role, target)}</span>
                  </div>
                  <div style={{ fontFamily: T.disp, fontSize: 15, fontWeight: 800, color: T.ink, lineHeight: 1.15 }}>
                    {beat.title}
                  </div>
                  <div style={{ fontFamily: T.body, fontSize: 13, color: T.muted, lineHeight: 1.4, marginTop: 4 }}>
                    {beat.cue}
                  </div>
                </div>
              </article>
            ))}
          </div>
          <div className="shorts-workflow-rail" role="group" aria-label="Shorts production workflow">
            <span className="shorts-workflow-node"><span aria-hidden>①</span><b>Plan</b> here · free</span>
            <span aria-hidden>→</span>
            <span className="shorts-workflow-node"><span aria-hidden>②</span><b>Generate scenes</b> · Video Prompt</span>
            <span aria-hidden>→</span>
            <span className="shorts-workflow-node"><span aria-hidden>③</span><b>Assemble</b> · your editor</span>
          </div>
        </section>
      </div>

      {/* ── Controls ── */}
      <div style={{ ...cardStyle, marginBottom: 16 }}>
        <label htmlFor="shorts-script" style={labelStyle}>Script or idea</label>
        <textarea
          id="shorts-script"
          value={script}
          onChange={(e) => setScript(e.target.value)}
          placeholder={`e.g. "My pom ${exampleName}'s morning routine — he stretches, demands breakfast, then naps in a sunbeam."`}
          rows={3}
          style={{
            width: "100%", boxSizing: "border-box", resize: "vertical",
            padding: "12px 14px", borderRadius: 12, border: `1px solid ${T.hair}`,
            background: T.inset, color: T.ink, fontFamily: T.body, fontSize: 15, lineHeight: 1.5,
          }}
        />

        <div style={{ display: "flex", flexWrap: "wrap", gap: 20, marginTop: 16 }}>
          <div style={{ flex: "1 1 200px", minWidth: 0 }}>
            <span style={labelStyle}>Length target</span>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }} role="group" aria-label="Length target">
              {LENGTHS.map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-pressed={target === n}
                  onClick={() => setTarget(n)}
                  style={segBtn(target === n)}
                >
                  {n}s
                </button>
              ))}
            </div>
          </div>
          <div style={{ flex: "2 1 280px", minWidth: 0 }}>
            <span style={labelStyle}>Vibe</span>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }} role="group" aria-label="Vibe">
              {VIBE_OPTS.map((v) => (
                <button
                  key={v.key}
                  type="button"
                  aria-pressed={vibe === v.key}
                  onClick={() => setVibe(v.key)}
                  style={segBtn(vibe === v.key)}
                >
                  {v.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={doPlan}
          disabled={script.trim().length === 0}
          style={{
            marginTop: 18, width: "100%", minHeight: 50, padding: "14px 22px", borderRadius: 12,
            border: "none",
            background: script.trim().length === 0 ? T.field : "linear-gradient(180deg,#F49B2A,#E27D0C)",
            color: script.trim().length === 0 ? T.muted : T.ink,
            fontFamily: T.disp, fontWeight: 800, fontSize: 16, letterSpacing: "0.01em",
            cursor: script.trim().length === 0 ? "default" : "pointer",
            boxShadow: script.trim().length === 0 ? "none" : "3px 3px 0 rgba(154,78,30,.32)",
          }}
        >
          {hasPlanned ? "Re-plan the sequence →" : "Plan the sequence →"}
        </button>
      </div>

      {/* ── Empty hint ── */}
      {!plan && (
        <div style={{
          ...cardStyle, background: T.inset,
          padding: "20px", color: T.muted,
        }}>
          <div className="shorts-empty-guide">
            <div>
              <div style={{ ...eyebrow, marginBottom: 7 }}>One-tap walkthrough</div>
              <div style={{ fontFamily: T.disp, fontWeight: 800, fontSize: 20, color: T.ink, lineHeight: 1.15 }}>
                See a real plan before writing yours.
              </div>
              <p style={{ fontFamily: T.body, fontSize: 14, margin: "7px 0 14px", maxWidth: 500, lineHeight: 1.5 }}>
                Load a generic 30-second treat story starring sample pet {exampleName}. The same
                free planner will build actual timecodes, shots and captions — no pre-generated footage.
              </p>
              <button
                type="button"
                className="shorts-example-button"
                onClick={useExample}
                style={{
                  minHeight: 46, padding: "11px 16px", borderRadius: 10,
                  border: `1px solid ${T.terra}`, background: T.paper, color: T.terraSub,
                  fontFamily: T.disp, fontWeight: 800, fontSize: 14, cursor: "pointer",
                  boxShadow: "2px 2px 0 rgba(154,78,30,.22)",
                  transition: "transform .15s ease, box-shadow .15s ease",
                }}
                aria-label={`Load and plan a generic 30-second example starring sample pet ${exampleName}`}
              >
                Load sample story →
              </button>
            </div>
            <div className="shorts-example-beats" role="list" aria-label="Example sequence outline">
              <div className="shorts-example-beat" role="listitem" style={{ "--beat-color": T.terra } as React.CSSProperties}>
                <span>HOOK</span><time>0–2s</time><span>Treat jar opens</span>
              </div>
              <div className="shorts-example-beat" role="listitem" style={{ "--beat-color": T.gold } as React.CSSProperties}>
                <span>BODY</span><time>2–25s</time><span>Three quick tricks</span>
              </div>
              <div className="shorts-example-beat" role="listitem" style={{ "--beat-color": T.thrive } as React.CSSProperties}>
                <span>PAYOFF</span><time>25–30s</time><span>Snack + high-five</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Plan output ── */}
      {plan && current && (
        <>
          {/* Timeline strip — proportional to each scene's duration */}
          <div style={{ ...cardStyle, marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
              <span style={eyebrow}>Timeline · {plan.scenes.length} scenes</span>
              <span style={{ fontFamily: T.m, fontSize: 13, color: T.muted, letterSpacing: "0.06em" }}>
                {formatTimecode(0)}–{formatTimecode(plan.totalSec)} · {plan.targetSec}s target
              </span>
            </div>
            <div style={{ display: "flex", gap: 4, alignItems: "stretch" }}>
              {plan.scenes.map((s, i) => {
                const active = i === currentIdx;
                const c = roleColor(s.role);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setCurrentIdx(i)}
                    aria-pressed={active}
                    aria-label={`${roleLabel(s)}, ${formatTimecode(s.startSec)} to ${formatTimecode(s.endSec)}`}
                    title={`${roleLabel(s)} · ${formatTimecode(s.startSec)}–${formatTimecode(s.endSec)}`}
                    style={{
                      flex: `${s.endSec - s.startSec} 1 0`, minWidth: 40, minHeight: 52,
                      borderRadius: 8, cursor: "pointer", overflow: "hidden",
                      border: active ? `2px solid ${T.ink}` : `1px solid ${T.hair}`,
                      background: active ? T.paper : T.inset,
                      boxShadow: active ? "2px 2px 0 rgba(33,26,18,.18)" : "none",
                      padding: "6px 6px", textAlign: "left",
                      display: "flex", flexDirection: "column", justifyContent: "space-between",
                    }}
                  >
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                      <span aria-hidden style={{ width: 7, height: 7, borderRadius: 999, background: c, flexShrink: 0 }} />
                      <span style={{ fontFamily: T.m, fontWeight: 700, fontSize: 13, letterSpacing: "0.04em", color: T.ink70, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {s.role === "body" ? `B${s.roleIndex}` : s.role === "hook" ? "HK" : "PAY"}
                      </span>
                    </span>
                    <span style={{ fontFamily: T.m, fontSize: 13, color: T.muted, whiteSpace: "nowrap" }}>
                      {s.endSec - s.startSec}s
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Preview stage + caption table */}
          <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginBottom: 16 }}>
            {/* 9:16 preview */}
            <div style={{ flex: "1 1 220px", minWidth: 200, maxWidth: 300 }}>
              <div style={{
                position: "relative", aspectRatio: "9 / 16", borderRadius: 16, overflow: "hidden",
                background: `radial-gradient(120% 90% at 50% 0%, ${T.stage}, ${T.stage2})`,
                border: `1px solid ${T.hair}`, boxShadow: "var(--ed-shadow-card)",
                display: "flex", flexDirection: "column", padding: 14,
              }}>
                {/* top meta */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{
                    fontFamily: T.m, fontWeight: 700, fontSize: 13, letterSpacing: "0.1em",
                    color: T.stageInk, padding: "3px 8px", borderRadius: 999,
                    background: "rgba(0,0,0,.28)", border: `1px solid ${roleColor(current.role)}`,
                  }}>
                    {roleLabel(current)}
                  </span>
                  <span style={{ fontFamily: T.m, fontSize: 13, color: T.stageMuted }}>
                    {formatTimecode(current.startSec)}–{formatTimecode(current.endSec)}
                  </span>
                </div>

                {/* placeholder watermark */}
                <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{
                    fontFamily: T.disp, fontWeight: 800, fontSize: 13, letterSpacing: "0.18em",
                    color: "rgba(251,243,227,.14)", textTransform: "uppercase",
                  }}>
                    Scene {current.index} / {plan.scenes.length}
                  </span>
                </div>

                {/* caption — the thing that pops on the dark stage */}
                <div style={{ paddingBottom: 4 }}>
                  <div style={{
                    fontFamily: T.disp, fontWeight: 800, fontSize: 21, lineHeight: 1.12,
                    letterSpacing: "-0.01em", color: T.stageInk,
                    textShadow: "0 2px 12px rgba(0,0,0,.55)",
                  }}>
                    {current.caption}
                  </div>
                  <div style={{ marginTop: 8, fontFamily: T.m, fontSize: 13, letterSpacing: "0.06em", color: T.stageMuted }}>
                    {current.shot}
                  </div>
                </div>
              </div>

              {/* prev / next + dots */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 10, gap: 8 }}>
                <button
                  type="button"
                  aria-label="Previous scene"
                  onClick={() => setCurrentIdx((i) => Math.max(0, i - 1))}
                  disabled={currentIdx === 0}
                  style={{ ...actionBtn, minWidth: 44, opacity: currentIdx === 0 ? 0.45 : 1, cursor: currentIdx === 0 ? "default" : "pointer" }}
                >
                  ‹
                </button>
                <div style={{ display: "flex", gap: 6 }} aria-hidden>
                  {plan.scenes.map((s, i) => (
                    <span key={s.id} style={{
                      width: 7, height: 7, borderRadius: 999,
                      background: i === currentIdx ? T.terra : T.hair,
                    }} />
                  ))}
                </div>
                <button
                  type="button"
                  aria-label="Next scene"
                  onClick={() => setCurrentIdx((i) => Math.min(plan.scenes.length - 1, i + 1))}
                  disabled={currentIdx === plan.scenes.length - 1}
                  style={{ ...actionBtn, minWidth: 44, opacity: currentIdx === plan.scenes.length - 1 ? 0.45 : 1, cursor: currentIdx === plan.scenes.length - 1 ? "default" : "pointer" }}
                >
                  ›
                </button>
              </div>

              {/* current-scene actions */}
              <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                <button type="button" onClick={() => sendToDirector(current)} style={{ ...actionBtn, flex: "1 1 auto", background: T.inset }}>
                  {copied === `dir:${current.id}` ? "Sent ✓" : onSendToDirector ? "→ Video Prompt" : "→ Copy for Director"}
                </button>
                <button type="button" onClick={() => copyText(current.caption, `cap:${current.id}`)} style={{ ...actionBtn, flex: "1 1 auto" }}>
                  {copied === `cap:${current.id}` ? "Copied ✓" : "Copy caption"}
                </button>
              </div>
            </div>

            {/* Caption timing table */}
            <div style={{ flex: "3 1 320px", minWidth: 260 }}>
              <div style={{ ...cardStyle, padding: 14 }}>
                <div style={{ ...eyebrow, marginBottom: 10 }}>Caption timing</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {plan.scenes.map((s, i) => {
                    const active = i === currentIdx;
                    const c = roleColor(s.role);
                    return (
                      <div
                        key={s.id}
                        style={{
                          border: `1px solid ${active ? c : T.hair}`,
                          borderLeft: `3px solid ${c}`,
                          borderRadius: 10, background: active ? T.paper : T.inset,
                          padding: 10,
                        }}
                      >
                        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-start" }}>
                          <button
                            type="button"
                            onClick={() => setCurrentIdx(i)}
                            aria-label={`Select ${roleLabel(s)}`}
                            style={{
                              flex: "1 1 200px", minWidth: 0, textAlign: "left",
                              background: "none", border: "none", padding: 0, cursor: "pointer",
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                              <span style={{
                                fontFamily: T.m, fontWeight: 700, fontSize: 13, letterSpacing: "0.06em",
                                color: "#fff", background: c, padding: "2px 7px", borderRadius: 999,
                              }}>
                                {roleLabel(s)}
                              </span>
                              <span style={{ fontFamily: T.m, fontSize: 13, color: T.muted, letterSpacing: "0.04em" }}>
                                {formatTimecode(s.startSec)}–{formatTimecode(s.endSec)} · {s.endSec - s.startSec}s
                              </span>
                            </div>
                            <div style={{ fontFamily: T.disp, fontWeight: 800, fontSize: 15, color: T.ink, marginTop: 6, lineHeight: 1.25 }}>
                              {s.caption}
                            </div>
                            <div style={{ fontFamily: T.body, fontSize: 13, color: T.muted, marginTop: 4, lineHeight: 1.4 }}>
                              {s.direction}
                            </div>
                            <div style={{ fontFamily: T.m, fontSize: 13, color: T.mono, marginTop: 4, letterSpacing: "0.04em" }}>
                              Shot · {s.shot}
                            </div>
                          </button>
                          <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
                            <button type="button" onClick={() => sendToDirector(s)} style={actionBtn} title="Hand this scene's direction to the Studio Director">
                              {copied === `dir:${s.id}` ? "Sent ✓" : onSendToDirector ? "→ Video Prompt" : "→ Copy for Director"}
                            </button>
                            <button type="button" onClick={() => copyText(s.caption, `cap:${s.id}`)} style={actionBtn}>
                              {copied === `cap:${s.id}` ? "Copied ✓" : "Copy caption"}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Export bar */}
          <div style={{ ...cardStyle, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 14, justifyContent: "space-between" }}>
            <div style={{ flex: "1 1 260px", minWidth: 0 }}>
              <div style={{ ...eyebrow, marginBottom: 4 }}>BGM mood</div>
              <div style={{ fontFamily: T.body, fontSize: 14, color: T.ink70 }}>{plan.bgmMood}</div>
              <div style={{ fontFamily: T.m, fontSize: 13, color: T.muted, marginTop: 6, letterSpacing: "0.02em" }}>
                Sequence plan only — no rendering, no fabricated view counts.
              </div>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
              <button
                type="button"
                onClick={doPolish}
                disabled={polishBusy}
                title="Rewrite each on-screen caption with AI — timing and shots stay the same"
                style={{
                  minHeight: 48, padding: "13px 18px", borderRadius: 12,
                  border: `1px solid ${T.terra}`, background: T.paper, color: T.terraSub,
                  fontFamily: T.m, fontWeight: 700, fontSize: 13, letterSpacing: "0.06em",
                  textTransform: "uppercase", cursor: polishBusy ? "default" : "pointer",
                  opacity: polishBusy ? 0.65 : 1, whiteSpace: "nowrap",
                  display: "inline-flex", alignItems: "center", gap: 8,
                }}
              >
                <span aria-hidden style={{ fontSize: 14 }}>✨</span>
                {polishBusy ? "Polishing…" : Object.keys(polish).length ? "Re-polish captions" : "AI polish captions · beta"}
              </button>
              <button
                type="button"
                onClick={() => copyText(planToText(plan), "plan")}
                style={{
                  minHeight: 48, padding: "13px 22px", borderRadius: 12, border: "none",
                  background: "linear-gradient(180deg,#F49B2A,#E27D0C)", color: T.ink,
                  fontFamily: T.disp, fontWeight: 800, fontSize: 15, letterSpacing: "0.01em",
                  cursor: "pointer", boxShadow: "3px 3px 0 rgba(154,78,30,.32)", whiteSpace: "nowrap",
                }}
              >
                {copied === "plan" ? "Plan copied ✓" : "Copy shorts plan"}
              </button>
            </div>
          </div>

          {/* AI polish status + honest note */}
          <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            {polishMsg && (
              <span style={{ fontFamily: T.body, fontSize: 13, color: /✓/.test(polishMsg) ? T.thrive : T.terra }}>
                {polishMsg}
              </span>
            )}
            <span style={{ fontFamily: T.m, fontSize: 13, color: T.mono, letterSpacing: "0.02em" }}>
              AI polish rewrites only the captions (timing &amp; shots stay); signed-in, free in beta.
            </span>
          </div>

          {/* Clipboard-blocked soft hint */}
          {copied && copied.startsWith("err:") && (
            <div style={{ marginTop: 10, fontFamily: T.body, fontSize: 13, color: T.terra }}>
              Couldn&rsquo;t reach the clipboard here. Select the text manually to copy.
            </div>
          )}
        </>
      )}
    </div>
  );
}
