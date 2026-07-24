"use client";

/**
 * GrandPaw3D — React mount for the <agent-cafe-3d> hotel-lobby diorama
 * (web/src/lib/grandpaw/agent-cafe-3d.js, client-only WebGL).
 *
 * The scene builds once on mount; `liveKey` (pet names) remounts it when the
 * cast changes, while number-only changes (memory counts etc.) wait for the
 * next natural remount — the right rail always shows the live numbers, so the
 * diorama is allowed to be a few polls behind rather than resetting the
 * camera every 7s.
 *
 * Loading: the three.js chunk download + the procedural scene build take real
 * seconds, so a hotel-plaque loading card ("Setting the lobby…") covers the
 * canvas until the scene dispatches `gp-ready` on its first rendered frame.
 * The element is appended one frame late so the plaque paints before the
 * main-thread-blocking build starts. If WebGL fails, the plaque says so
 * honestly instead of spinning forever.
 */
import { useEffect, useRef, useState } from "react";

export interface GrandPawLive {
  pets: { name: string; task: string }[];
  memory: { count: number; cap: number };
  skills: number;
  soulLv: number;
  goals: number;
  next: string;
}

const INK = "#221D12";
const MUT2 = "#655C4D";
const GOLD = "#A8802B";
const SERIF = "Georgia, 'Times New Roman', serif";
const MONO = "'IBM Plex Mono', var(--ed-m, ui-monospace), monospace";

export default function GrandPaw3D({ live, autoRotate = true, showLabels = true, height = 620 }:
  { live: GrandPawLive; autoRotate?: boolean; showLabels?: boolean; height?: number }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const elRef = useRef<HTMLElement | null>(null);
  const [interactive, setInteractive] = useState(false);
  const [requiresOptIn, setRequiresOptIn] = useState(true);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [motionPaused, setMotionPaused] = useState(false);
  const liveKey = live.pets.map((p) => p.name).join("|");
  const liveRef = useRef(live);
  liveRef.current = live;
  const effectiveAutoRotate = autoRotate && !prefersReducedMotion && !motionPaused;
  const optsRef = useRef({ autoRotate: effectiveAutoRotate, showLabels });
  optsRef.current = { autoRotate: effectiveAutoRotate, showLabels };

  const [phase, setPhase] = useState<"dormant" | "loading" | "ready" | "failed">("dormant");

  useEffect(() => {
    const optInQuery = window.matchMedia("(max-width: 640px), (pointer: coarse)");
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const applyPreferences = () => {
      const needsOptIn = optInQuery.matches;
      setRequiresOptIn(needsOptIn);
      setPrefersReducedMotion(motionQuery.matches);
      if (!needsOptIn) setInteractive(true);
    };
    applyPreferences();
    optInQuery.addEventListener?.("change", applyPreferences);
    motionQuery.addEventListener?.("change", applyPreferences);
    return () => {
      optInQuery.removeEventListener?.("change", applyPreferences);
      motionQuery.removeEventListener?.("change", applyPreferences);
    };
  }, []);

  useEffect(() => {
    if (!interactive) {
      setPhase("dormant");
      return;
    }
    let cancelled = false;
    setPhase("loading");
    const host = hostRef.current;
    const onReady = () => setPhase("ready");
    host?.addEventListener("gp-ready", onReady);
    import("@/lib/grandpaw/agent-cafe-3d")
      .then(() => {
        if (cancelled || !hostRef.current || elRef.current) return;
        // double-rAF: let the loading plaque paint before the synchronous
        // (main-thread-blocking) scene build kicks off in connectedCallback
        requestAnimationFrame(() => requestAnimationFrame(() => {
          if (cancelled || !hostRef.current || elRef.current) return;
          try {
            const el = document.createElement("agent-cafe-3d");
            el.setAttribute("data-live", JSON.stringify(liveRef.current));
            el.setAttribute("auto-rotate", optsRef.current.autoRotate ? "on" : "off");
            el.setAttribute("show-labels", optsRef.current.showLabels ? "on" : "off");
            el.style.width = "100%";
            el.style.height = "100%";
            hostRef.current.appendChild(el);
            elRef.current = el;
          } catch {
            setPhase("failed");
          }
        }));
      })
      .catch(() => { if (!cancelled) setPhase("failed"); });
    return () => {
      cancelled = true;
      host?.removeEventListener("gp-ready", onReady);
      if (elRef.current) { elRef.current.remove(); elRef.current = null; }
    };
  }, [interactive, liveKey]);

  useEffect(() => {
    if (elRef.current) {
      elRef.current.setAttribute("auto-rotate", effectiveAutoRotate ? "on" : "off");
      elRef.current.setAttribute("show-labels", showLabels ? "on" : "off");
    }
  }, [effectiveAutoRotate, showLabels]);

  return (
    <div style={{ position: "relative", width: "100%", maxWidth: "100%", height, borderRadius: 18, overflow: "hidden", background: "#EFE6CF", touchAction: "pan-y" }}>
      <div ref={hostRef} style={{ position: "absolute", inset: 0, touchAction: "pan-y" }} />
      {phase !== "ready" && (
        <div role="status" aria-live="polite"
          style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "#EFE6CF", zIndex: 2 }}>
          <style>{`
            @keyframes gp3dDot{0%,60%,100%{opacity:.15}30%{opacity:1}}
            @keyframes gp3dSweep{0%{transform:translateX(-46px)}100%{transform:translateX(132px)}}
            @media (prefers-reduced-motion: reduce) {
              .gp3d-motion { animation: none !important; }
            }
          `}</style>
          <div style={{ textAlign: "center", background: "#FFFDF6", border: "1px solid #D9C9A8", borderRadius: 14, padding: "22px 24px 24px", margin: 14, maxWidth: 360, boxShadow: "3px 3px 0 rgba(58,50,42,0.10)" }}>
            <div style={{ fontFamily: MONO, fontSize: 13, letterSpacing: "0.22em", color: MUT2, marginBottom: 8 }}>THE GRAND PAW · LOBBY</div>
            {phase === "dormant" ? (
              <>
                <div style={{ fontFamily: SERIF, fontSize: 20, color: INK }}>Decorative 3D lobby</div>
                <div style={{ fontFamily: MONO, fontSize: 13, color: MUT2, lineHeight: 1.5, marginTop: 8 }}>
                  LIVE EXECUTION DATA STAYS IN THE RAIL · 3D POSITIONS ARE VISUAL ONLY
                </div>
                <button
                  type="button"
                  onClick={() => setInteractive(true)}
                  style={{ marginTop: 14, border: "1px solid #B99C63", borderRadius: 9, background: "#FFF9EC", color: INK, padding: "9px 13px", fontFamily: MONO, fontSize: 13, fontWeight: 700, cursor: "pointer" }}
                >
                  Open interactive 3D
                </button>
                {requiresOptIn && (
                  <div style={{ fontFamily: MONO, fontSize: 13, color: MUT2, lineHeight: 1.45, marginTop: 9 }}>
                    MOBILE OPT-IN · PAGE SCROLL REMAINS AVAILABLE
                  </div>
                )}
              </>
            ) : phase === "failed" ? (
              <>
                <div style={{ fontFamily: SERIF, fontSize: 20, color: INK }}>The lobby couldn&rsquo;t open.</div>
                <div style={{ fontFamily: MONO, fontSize: 13, color: MUT2, marginTop: 8 }}>3D VIEW NEEDS WEBGL — LIVE DATA STAYS ON THE DASHBOARD</div>
              </>
            ) : (
              <>
                <div style={{ fontFamily: SERIF, fontSize: 20, color: INK }}>
                  Setting the lobby
                  {[0, 1, 2].map((i) => (
                    <span className="gp3d-motion" key={i} style={{ animation: `gp3dDot 1.2s ${i * 0.2}s infinite` }}>.</span>
                  ))}
                </div>
                <div style={{ margin: "14px auto 0", width: 132, height: 3, borderRadius: 99, background: "rgba(34,29,18,0.08)", overflow: "hidden" }}>
                  <div className="gp3d-motion" style={{ width: 46, height: "100%", borderRadius: 99, background: GOLD, animation: "gp3dSweep 1.4s linear infinite" }} />
                </div>
                <div style={{ fontFamily: MONO, fontSize: 13, color: MUT2, marginTop: 10 }}>3D SCENE · BUILDS ONCE PER VISIT</div>
              </>
            )}
          </div>
        </div>
      )}
      {phase === "ready" && (
        <button
          type="button"
          aria-pressed={motionPaused || prefersReducedMotion}
          onClick={() => setMotionPaused((paused) => !paused)}
          disabled={prefersReducedMotion}
          style={{ position: "absolute", top: 12, right: 12, zIndex: 3, border: "1px solid #D9C9A8", borderRadius: 999, background: "rgba(255,253,246,.94)", color: INK, padding: "7px 11px", fontFamily: MONO, fontSize: 13, fontWeight: 700, cursor: prefersReducedMotion ? "default" : "pointer" }}
        >
          {prefersReducedMotion ? "Motion reduced" : motionPaused ? "Resume rotation" : "Pause rotation"}
        </button>
      )}
    </div>
  );
}
