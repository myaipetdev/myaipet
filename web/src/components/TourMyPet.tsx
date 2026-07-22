"use client";

/**
 * TourMyPet — the READ-ONLY, DEMO-badged "My Pet" preview shown in guest tour
 * mode (?tour=1, no wallet). A compact editorial poster holding the framed
 * collectible (CollectibleFrame) + the ambient PetPond, driven by the same demo
 * subject PetStudioPro uses (Dordor, /mascot.jpg, level 5). Every value here is a
 * fixed DEMO placeholder — clearly badged, never presented as the visitor's own
 * data. Care buttons never hit the server: they fire an honest "connect to do
 * this" toast (zero writes, zero credit spends).
 */

import { Suspense, lazy, useCallback, useRef, useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import CollectibleFrame, { Motes } from "@/components/editorial/CollectibleFrame";
import { SEASON_SCHEDULED, seasonPhase } from "@/lib/season";

const PetPond = lazy(() => import("@/components/PetPond"));

// Same demo subject as PetStudioPro's try-before-signup mode — on-brand mascot.
const DEMO = { name: "Dordor", avatar: "/mascot.jpg", level: 5, element: "light", happy: 80, energy: 66, fullness: 74, bond: 42 };

const T = {
  field: "#ECE4D4", paper: "#FBF6EC", ink: "#211A12", ink70: "#3A3024", muted: "#7A6E5A", muted2: "#5C5140",
  mono: "#9A7B4E", hair: "rgba(33,26,18,.13)", terra: "#BE4F28", creamOn: "#FCE9CF",
  happy: "#F0589E", energy: "#3E8FE0", bond: "#9E72E8", gold: "#C8932F",
  disp: "var(--ed-disp)", body: "var(--ed-body)", m: "var(--ed-m)",
};

function StatRow({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: T.muted2 }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: color }} />{label}
        </span>
        <span style={{ fontFamily: T.disp, fontWeight: 700, fontSize: 24 }}>{value}</span>
      </div>
      <div style={{ height: 3, borderRadius: 2, background: "rgba(33,26,18,.1)", marginTop: 7, overflow: "hidden" }}>
        <div style={{ height: "100%", borderRadius: 2, width: `${Math.max(0, Math.min(100, value))}%`, background: color }} />
      </div>
    </div>
  );
}

function CareTile({ label, sub, icon, onClick }: { label: string; sub?: string; icon: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      flex: 1, background: "#FCE9CF", border: "1px solid rgba(190,79,40,0.22)", borderRadius: 14,
      padding: "13px 6px", textAlign: "center", cursor: "pointer", fontFamily: T.body,
    }}>
      {icon}
      <span style={{ display: "block", fontSize: 13, fontWeight: 600, color: T.ink70 }}>{label}</span>
      {sub && (
        <span style={{ display: "block", marginTop: 2, fontFamily: T.m, fontSize: 13, fontWeight: 700, letterSpacing: ".06em", color: T.mono }}>{sub}</span>
      )}
    </button>
  );
}

const CareIcon = ({ d }: { d: string }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={T.ink70} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ display: "block", margin: "0 auto 5px" }}>{<path d={d} />}</svg>
);

export default function TourMyPet() {
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);
  const seq = useRef(0);
  const timer = useRef<number | null>(null);

  // Read-only: every care action is a no-op that nudges toward connecting a
  // wallet. NO API write, NO credit spend, NO fabricated success.
  const demoToast = useCallback((verb: string) => {
    const id = ++seq.current;
    // +5 pts is the REAL per-free-care grant signed-in raisers get (server-verified).
    setToast({ id, text: `Demo tour — connect a wallet to ${verb} your own pet. Every free care banks +5 pts.` });
    if (timer.current) clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToast((cur) => (cur && cur.id === id ? null : cur)), 3200);
  }, []);

  const element = DEMO.element.toUpperCase();
  // Season context — no dates/countdowns while Season 1 is unscheduled.
  const phase = SEASON_SCHEDULED ? seasonPhase() : "upcoming";
  const seasonNote = phase === "live" ? "SEASON 1 · LIVE" : phase === "ended" ? "SEASON 1 · ENDED" : "SEASON 1 · STARTING SOON";

  return (
    <div style={{ position: "relative", fontFamily: T.body, color: T.ink, paddingTop: 78 }}>
      <div className="ed-grain" /><div className="ed-glow" /><div className="ed-vignette" />
      <div style={{ position: "relative", zIndex: 2, maxWidth: 1080, margin: "0 auto", padding: "8px 24px 48px" }}>
        <div className="tmp-grid" style={{ display: "grid", gridTemplateColumns: "1.02fr 1fr", gap: 24, alignItems: "start" }}>
          <style>{`@media (max-width: 880px) { .tmp-grid { grid-template-columns: 1fr !important; } }`}</style>

          {/* poster (left) — the demo collectible */}
          <div style={{ position: "relative", background: T.terra, borderRadius: 18, minHeight: 520, overflow: "hidden", display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div aria-hidden style={{ position: "absolute", inset: 14, border: "1px solid rgba(252,233,207,.35)", borderRadius: 8, pointerEvents: "none" }} />
            <div style={{ position: "absolute", top: 26, left: 28, right: 28, display: "flex", justifyContent: "space-between", alignItems: "flex-start", zIndex: 3 }}>
              <div style={{ fontFamily: T.m, fontSize: 13, fontWeight: 700, letterSpacing: ".06em", color: T.creamOn, whiteSpace: "nowrap" }}>COMPANION PROTOCOL</div>
              <div style={{ fontFamily: T.m, fontSize: 13, fontWeight: 700, letterSpacing: ".14em", color: "#FFF8EE", background: "rgba(33,26,18,.34)", border: "1px solid rgba(252,233,207,.5)", borderRadius: 8, padding: "4px 10px" }}>DEMO</div>
            </div>
            <div style={{ position: "absolute", left: -2, top: "50%", transform: "rotate(-90deg) translateX(50%)", transformOrigin: "left center", fontFamily: T.m, fontSize: 13, fontWeight: 700, letterSpacing: ".18em", color: "rgba(252,233,207,.55)", whiteSpace: "nowrap" }}>
              ★ {element} · LV.{String(DEMO.level).padStart(2, "0")}
            </div>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", width: "100%", zIndex: 2, paddingTop: 56, paddingBottom: 34 }}>
              <div style={{ position: "relative", zIndex: 2 }}>
                <Motes />
                <CollectibleFrame photoUrl={DEMO.avatar} level={DEMO.level} speciesLabel="COMPANION" elementLabel={element} width={264} />
              </div>
              <div style={{ fontFamily: T.m, fontSize: 13, fontWeight: 700, letterSpacing: ".34em", color: T.creamOn, marginTop: 22, zIndex: 2 }}>MEET</div>
              <div className="ed-foil-text ed-foil-deboss" style={{ fontFamily: T.disp, fontWeight: 800, fontSize: "clamp(38px,4.6vw,64px)", lineHeight: 0.82, letterSpacing: "-.04em", zIndex: 2, textAlign: "center" }}>{DEMO.name}</div>
            </div>
          </div>

          {/* right column — identity · status · care · pond · CTA */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {/* demo notice */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(190,79,40,.08)", border: "1px solid rgba(190,79,40,.28)", borderRadius: 12, padding: "10px 13px" }}>
              <span style={{ fontFamily: T.m, fontSize: 13, fontWeight: 700, letterSpacing: ".1em", color: "#FFF8EE", background: T.terra, borderRadius: 7, padding: "3px 8px" }}>DEMO</span>
              <span style={{ fontSize: 13, color: T.muted2, lineHeight: 1.4 }}>Sample pet — not your data. Connect a wallet to adopt your own.</span>
            </div>

            {/* identity chips */}
            <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
              {[`LV.${String(DEMO.level).padStart(2, "0")}`, "COMPANION", element].map((t) => (
                <span key={t} style={{ fontFamily: T.m, fontSize: 13, fontWeight: 700, letterSpacing: ".1em", color: "#9A4E1E", background: T.paper, border: `1px solid ${T.hair}`, borderRadius: 9, padding: "5px 11px" }}>{t}</span>
              ))}
            </div>

            {/* status */}
            <div style={{ background: T.paper, borderRadius: 22, padding: 20, boxShadow: "var(--ed-shadow-card)" }}>
              <div style={{ fontFamily: T.m, fontWeight: 700, fontSize: 13, letterSpacing: ".14em", color: T.mono, textTransform: "uppercase" }}>Status <span style={{ color: T.terra }}>· demo</span></div>
              <div style={{ display: "flex", alignItems: "center", gap: 7, fontFamily: T.disp, fontWeight: 700, fontSize: 15, marginTop: 6, color: "#5C8A4E" }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#5C8A4E" }} />THRIVING
              </div>
              <StatRow label="Happy" value={DEMO.happy} color={T.happy} />
              <StatRow label="Energy" value={DEMO.energy} color={T.energy} />
              <StatRow label="Fullness" value={DEMO.fullness} color={T.gold} />
              <StatRow label="Bond" value={DEMO.bond} color={T.bond} />
            </div>

            {/* care — read-only in tour, no-op with honest toast. The +5 pts tile
                hint is the REAL signed-in per-free-care grant (server-verified). */}
            <div style={{ background: T.paper, borderRadius: 22, padding: 20, boxShadow: "var(--ed-shadow-card)" }}>
              <div style={{ fontFamily: T.m, fontWeight: 700, fontSize: 13, letterSpacing: ".14em", color: T.mono, textTransform: "uppercase" }}>Care</div>
              <div style={{ display: "flex", gap: 9, marginTop: 14 }}>
                <CareTile label="Feed" sub="+5 PTS" onClick={() => demoToast("feed")} icon={<CareIcon d="M5 3v8a3 3 0 0 0 6 0V3M8 3v18M19 3c-1.5 0-3 2-3 5s1.5 4 3 4v9" />} />
                <CareTile label="Play" sub="+5 PTS" onClick={() => demoToast("play with")} icon={<CareIcon d="M6 12h4M8 10v4M15 11h.01M18 13h.01M7 7h10a4 4 0 0 1 4 4v1a4 4 0 0 1-7 2.8 3 3 0 0 1-4 0A4 4 0 0 1 3 12v-1a4 4 0 0 1 4-4Z" />} />
                <CareTile label="Pet" sub="+5 PTS" onClick={() => demoToast("pet")} icon={<CareIcon d="M9 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM15 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM6 15a2 2 0 1 0 0-4M18 15a2 2 0 1 0 0-4M8.5 14c-1.5 1-2 2.2-2 3.4C6.5 18.8 7.7 20 9.2 20c1 0 1.6-.5 2.8-.5s1.8.5 2.8.5c1.5 0 2.7-1.2 2.7-2.6 0-1.2-.5-2.4-2-3.4" />} />
              </div>
              {toast && (
                <div key={toast.id} style={{ marginTop: 12, fontSize: 13, color: T.terra, fontStyle: "italic", lineHeight: 1.4 }}>{toast.text}</div>
              )}
            </div>

            {/* daily missions — DEMO strip: the real payoff values raisers see on
                their own My Pet checklist (5/care, 2/chat msg, 10/creation). No
                fabricated progress — this account has none. */}
            <div style={{ background: T.paper, borderRadius: 22, padding: 20, boxShadow: "var(--ed-shadow-card)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                <div style={{ fontFamily: T.m, fontWeight: 700, fontSize: 13, letterSpacing: ".14em", color: T.mono, textTransform: "uppercase" }}>Daily Missions <span style={{ color: T.terra }}>· demo</span></div>
                <span style={{ fontFamily: T.m, fontSize: 13, fontWeight: 700, letterSpacing: ".12em", color: T.muted }}>{seasonNote}</span>
              </div>
              {([
                ["Care ×3", "+5 PTS EACH"],
                ["Chat ×3 messages", "+2 PTS EACH"],
                ["Make 1 creation", "+10 PTS"],
              ] as const).map(([label, payoff]) => (
                <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginTop: 11 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 13, color: T.ink70 }}>
                    <span aria-hidden style={{ width: 18, height: 18, borderRadius: "50%", border: "1.5px solid rgba(33,26,18,.25)", flexShrink: 0 }} />
                    {label}
                  </span>
                  <span style={{ fontFamily: T.m, fontSize: 13, fontWeight: 700, letterSpacing: ".06em", color: T.mono, border: "1px solid rgba(154,123,78,.35)", borderRadius: 8, padding: "2px 8px", flexShrink: 0 }}>{payoff}</span>
                </div>
              ))}
              <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px dashed ${T.hair}`, fontSize: 13, color: T.muted2, lineHeight: 1.5 }}>
                Real reward values — connect a wallet to start banking them.
                {phase === "upcoming" ? " Points earned now carry into Season 1." : ""}
              </div>
            </div>

            {/* pond — ambient, zero-cost, driven by the demo values */}
            <div style={{ background: T.paper, borderRadius: 22, padding: "18px 18px 20px", boxShadow: "var(--ed-shadow-card)" }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
                <div style={{ fontFamily: T.m, fontWeight: 700, fontSize: 13, letterSpacing: ".14em", color: T.mono, textTransform: "uppercase" }}>{DEMO.name}&apos;s Pond</div>
                <div style={{ fontFamily: T.m, fontSize: 13, fontWeight: 700, letterSpacing: ".12em", color: T.muted }}>LO-FI · DEMO</div>
              </div>
              <div style={{ marginTop: 14 }}>
                <Suspense fallback={<div style={{ width: "100%", maxWidth: 340, aspectRatio: "1 / 1", margin: "0 auto", borderRadius: "50%", background: "rgba(26,126,104,.14)" }} />}>
                  <PetPond mood={DEMO.happy} level={DEMO.level} element={DEMO.element} name={DEMO.name} />
                </Suspense>
              </div>
            </div>

            {/* CTA — connect to adopt yours */}
            <div style={{ background: "linear-gradient(180deg,#F49B2A,#E27D0C)", borderRadius: 18, padding: "18px 18px 20px", color: "#FFF8EE", boxShadow: "0 12px 24px -14px rgba(226,125,12,.7)" }}>
              <div style={{ fontFamily: T.disp, fontWeight: 800, fontSize: 18 }}>Make one yours</div>
              <p style={{ fontFamily: T.body, fontSize: 13, color: "#FCE9CF", margin: "4px 0 14px", lineHeight: 1.5 }}>
                Connect a wallet to adopt a real pet — eligible care updates its progression, and selected chat context can support later replies. No gas, identity only; production on-chain minting is disabled.
              </p>
              <ConnectButton chainStatus="none" showBalance={false} label="Connect wallet to adopt" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
