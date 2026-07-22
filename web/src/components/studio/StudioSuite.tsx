"use client";

/**
 * StudioSuite — the Studio home as a three-tool creator suite:
 *   · Video Prompt  → PetStudioPro (Director prompt board + real image/video generation)
 *   · Thumbnail     → ThumbnailStudio (100% on-device canvas maker — free, no credits)
 *   · Shorts        → ShortsStudio (semi-auto shorts sequence planner — free, on-device)
 *
 * The tab bar is the only thing this shell owns; each tool is self-contained.
 * Video Prompt is the one paid surface (it generates); the other two are free
 * creator utilities, which the tabs label honestly.
 *
 * Shorts → Video Prompt handoff: a scene's visual direction is stashed and the
 * suite flips to the Video Prompt tab. PetStudioPro reads an optional seed via
 * the `directorSeed` prop; the shell also keeps the clipboard copy as a
 * belt-and-suspenders fallback so the handoff never silently no-ops.
 */

import { lazy, Suspense, useState } from "react";

const PetStudioPro = lazy(() => import("@/components/PetStudioPro"));
const ThumbnailStudio = lazy(() => import("@/components/studio/ThumbnailStudio"));
const ShortsStudio = lazy(() => import("@/components/studio/ShortsStudio"));

type Tab = "video" | "thumbnail" | "shorts";

const T = {
  paper: "#FBF6EC", inset: "#F5EFE2", ink: "#211A12", muted: "#7A6E5A",
  mono2: "#9A7B4E", terra: "#BE4F28", terraSub: "#9A4E1E", gold: "#C8932F",
  hair: "rgba(33,26,18,.13)", field: "#ECE4D4",
  disp: "var(--ed-disp)", body: "var(--ed-body)", m: "var(--ed-m)",
  shadow: "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))",
};

// Inline editorial glyphs — the shared Icon component loads /icons/<name>.png
// and there is no film/image/shorts PNG, so it rendered broken images. These
// stroke SVGs are crisp, dependency-free, and inherit currentColor.
function TabGlyph({ name }: { name: Tab }) {
  const common = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.9, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (name === "video") return (
    <svg {...common}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 9h18M7 5v4M12 5v4M17 5v4" /><path d="M10.5 12.2v3.6l3-1.8z" fill="currentColor" stroke="none" /></svg>
  );
  if (name === "thumbnail") return (
    <svg {...common}><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9" r="1.6" /><path d="M4 17l4.5-4.5 3 3L16 10l4 4" /></svg>
  );
  return ( // shorts — vertical 9:16 with a play mark
    <svg {...common}><rect x="7" y="3" width="10" height="18" rx="2" /><path d="M10.5 9.5v5l4-2.5z" fill="currentColor" stroke="none" /></svg>
  );
}

const TABS: { key: Tab; label: string; sub: string; free: boolean }[] = [
  { key: "video", label: "Video Prompt", sub: "Direct + generate", free: false },
  { key: "thumbnail", label: "Thumbnail", sub: "On-device · free", free: true },
  { key: "shorts", label: "Shorts", sub: "Plan a sequence · free", free: true },
];

function SuiteFallback() {
  return (
    <div style={{ padding: "80px 24px", textAlign: "center", fontFamily: T.m, fontSize: 13, letterSpacing: ".14em", textTransform: "uppercase", color: T.mono2 }}>
      Loading studio…
    </div>
  );
}

export default function StudioSuite({ onCreditsChange }: { onCreditsChange?: (c: number | null) => void } = {}) {
  const [tab, setTab] = useState<Tab>("video");
  // Scene direction handed over from the Shorts planner → Video Prompt tab.
  const [directorSeed, setDirectorSeed] = useState<string | null>(null);

  const sendToDirector = (sceneText: string) => {
    setDirectorSeed(sceneText);
    setTab("video");
    // Fallback so the handoff is never lost if PetStudioPro hasn't wired the seed.
    try { navigator.clipboard?.writeText(sceneText); } catch { /* ignore */ }
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "auto" });
  };

  return (
    <div style={{ fontFamily: T.body, color: T.ink }}>
      <style>{`
        .studiosuite-tabbar { display:flex; gap:8px; flex-wrap:wrap; }
        .studiosuite-tab {
          display:flex; align-items:center; gap:10px; padding:11px 16px; min-height:48px;
          border-radius:12px; border:1px solid ${T.hair}; background:${T.paper};
          cursor:pointer; transition:transform .16s ease, box-shadow .16s ease, border-color .16s ease;
          text-align:left;
        }
        .studiosuite-tab:hover { transform:translateY(-2px); box-shadow:${T.shadow}; }
        .studiosuite-tab.active { border-color:rgba(190,79,40,.4); box-shadow:${T.shadow}; background:${T.inset}; }
        .studiosuite-tab:focus-visible { outline:2px solid ${T.terra}; outline-offset:2px; }
        @media (prefers-reduced-motion: reduce){ .studiosuite-tab{ transition:none } .studiosuite-tab:hover{ transform:none } }
      `}</style>

      {/* Suite header + tab bar. paddingTop clears the fixed global Nav (~72px)
          so the tab bar is never hidden under it. */}
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "104px 24px 0" }}>
        <div style={{ fontFamily: T.m, fontSize: 13, fontWeight: 700, letterSpacing: ".2em", color: T.terraSub, textTransform: "uppercase", marginBottom: 12 }}>
          Studio · Creator Suite
        </div>
        <div className="studiosuite-tabbar" role="tablist" aria-label="Studio tools">
          {TABS.map((t) => {
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                role="tab"
                aria-selected={active}
                className={`studiosuite-tab${active ? " active" : ""}`}
                onClick={() => setTab(t.key)}
              >
                <span style={{
                  width: 34, height: 34, borderRadius: 9, flexShrink: 0,
                  background: active ? T.terra : T.field, color: active ? "#FCE9CF" : T.terraSub,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <TabGlyph name={t.key} />
                </span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: "block", fontFamily: T.disp, fontWeight: 800, fontSize: 15, color: T.ink, letterSpacing: "-.01em" }}>
                    {t.label}
                  </span>
                  <span style={{ display: "block", fontFamily: T.m, fontSize: 13, letterSpacing: ".06em", color: t.free ? "#1A7E68" : T.mono2, textTransform: "uppercase", marginTop: 1 }}>
                    {t.sub}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
        <div style={{ height: 1, background: T.hair, margin: "18px 0 0" }} />
      </div>

      {/* Active tool */}
      <div style={{ marginTop: 6 }}>
        <Suspense fallback={<SuiteFallback />}>
          {tab === "video" && (
            <PetStudioPro embedded onCreditsChange={onCreditsChange} directorSeed={directorSeed} onDirectorSeedConsumed={() => setDirectorSeed(null)} />
          )}
          {tab === "thumbnail" && (
            <div style={{ maxWidth: 1180, margin: "0 auto", padding: "8px 24px 40px" }}>
              <ThumbnailStudio />
            </div>
          )}
          {tab === "shorts" && (
            <div style={{ maxWidth: 1180, margin: "0 auto", padding: "8px 24px 40px" }}>
              <ShortsStudio onSendToDirector={sendToDirector} petName="Dordor" />
            </div>
          )}
        </Suspense>
      </div>
    </div>
  );
}
