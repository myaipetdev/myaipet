"use client";

/**
 * Season 1 standing — the tier ladder you climb with loyalty points.
 *
 * Turns the flat points number into felt status + anticipation: you can SEE the
 * rungs above you and how far the next one is, and that your standing is
 * snapshotted at season close. Deliberately non-financial — no token, no payout
 * promise — just status that's recorded.
 *
 * Self-contained: reads /api/dashboard/projection (the points/season source).
 */

import { useEffect, useState } from "react";
import { getAuthHeaders } from "@/lib/api";
import { SEASON_TIERS, seasonTier } from "@/lib/season";
import { WaxSeal, type SealSpec } from "@/components/Sticker";

const GOLD_FOIL = "repeating-linear-gradient(110deg,#f3e2bc 0 5px,#dcb45f 5px 10px,#f3e2bc 10px 15px)";
/** A season-tier rung as a wax seal: foil for the current tier, terracotta for
 *  reached, an un-stamped dashed ring for tiers not yet earned. */
function rungSeal(name: string, state: "current" | "reached" | "locked"): SealSpec {
  // 2-letter abbreviation so Sprout/Silver (both "S") don't collide.
  const glyph = name.slice(0, 2);
  if (state === "current") return { fill: GOLD_FOIL, ring: "#C8932F", glyph, glyphColor: "#FFF8EE", lip: "inset 0 2px 0 rgba(255,255,255,0.5)" };
  if (state === "reached") return { fill: "#BE4F28", ring: "#9A4E1E", glyph, glyphColor: "#FFF8EE", lip: "inset 0 1.5px 0 rgba(255,255,255,0.35)" };
  return { fill: "#F5EFE2", ring: "var(--ed-hair, rgba(33,26,18,.13))", glyph, glyphColor: "rgba(33,26,18,0.4)", lip: "none" };
}

export default function SeasonTierCard() {
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/dashboard/projection", { headers: getAuthHeaders(), credentials: "include" })
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (alive) setData(d); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const signedIn = !!data?.me;
  const points = data?.me?.points ?? 0;
  const participants = data?.pool?.participants ?? 0;
  const { tier, next, toNext, progress } = seasonTier(points);

  return (
    <div style={{ maxWidth: 1060, margin: "12px auto 0", padding: "0 24px", width: "100%" }}>
      <div style={{
        position: "relative", overflow: "hidden",
        background: "#FBF6EC", borderRadius: 20, padding: "22px 24px", color: "#211A12",
        border: "1px solid var(--ed-hair, rgba(33,26,18,.13))", boxShadow: "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))",
      }}>
        {/* Faint ruled-paper texture (a binder page), barely there */}
        <div aria-hidden style={{ position: "absolute", inset: 0, pointerEvents: "none",
          background: "repeating-linear-gradient(0deg, transparent 0 27px, rgba(33,26,18,0.04) 27px 28px)" }} />

        {/* Header */}
        <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <WaxSeal seal={rungSeal(tier.name, "current")} size={42} />
            <div>
              <div style={{ fontFamily: "var(--ed-m)", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.14em", color: "#9A4E1E" }}>SEASON 1 STANDING</div>
              <div style={{ fontFamily: "var(--ed-disp)", fontWeight: 800, fontSize: 26, letterSpacing: "-0.02em", color: "#211A12", marginTop: 2 }}>{tier.name}</div>
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontFamily: "var(--ed-m)", fontWeight: 800, fontSize: 26, color: "#211A12" }}>
              {signedIn ? points.toLocaleString() : "0"}<span style={{ fontSize: 13, color: "#7A6E5A", marginLeft: 5 }}>pts</span>
            </div>
            <div style={{ fontFamily: "var(--ed-m)", fontSize: 13, fontVariantNumeric: "tabular-nums", color: "#9A4E1E", fontWeight: 700, marginTop: 2 }}>
              {next ? `${toNext.toLocaleString()} to ${next.name}` : "Top tier reached"}
            </div>
          </div>
        </div>

        {/* Progress to next tier — paper track, hairline keyline, terracotta fill */}
        <div style={{ position: "relative", marginTop: 16, height: 12, background: "#F5EFE2", borderRadius: 999, border: "1px solid var(--ed-hair, rgba(33,26,18,.13))", overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${(progress * 100).toFixed(1)}%`, background: "#BE4F28", borderRight: progress > 0 && progress < 1 ? "1px solid var(--ed-hair, rgba(33,26,18,.13))" : "none", transition: "width 0.6s cubic-bezier(.22,1,.36,1)" }} />
        </div>

        {/* The ladder — a row of wax-seal rungs */}
        <div style={{ position: "relative", display: "flex", gap: 6, marginTop: 18, flexWrap: "wrap", rowGap: 14 }}>
          {SEASON_TIERS.map((t) => {
            const reached = points >= t.min;
            const current = t.key === tier.key;
            const state = current ? "current" : reached ? "reached" : "locked";
            return (
              <div key={t.key} style={{ flex: "1 1 0", minWidth: 92, display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
                <WaxSeal seal={rungSeal(t.name, state)} size={30} style={state === "locked" ? { boxShadow: "none", borderStyle: "dashed" } : undefined} />
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span aria-hidden style={{ width: 5, height: 5, borderRadius: "50%", background: t.color, flexShrink: 0 }} />
                  <span style={{ fontFamily: "var(--ed-disp)", fontSize: 12, fontWeight: 700, color: reached ? "#211A12" : "#9A7B4E", letterSpacing: "-0.01em" }}>{t.name}</span>
                </div>
                <div style={{ fontFamily: "var(--ed-m)", fontSize: 12, color: "#9A7B4E" }}>{t.min >= 1000 ? `${t.min / 1000}k` : t.min}</div>
              </div>
            );
          })}
        </div>

        {/* Snapshot scarcity — anticipation without a token promise */}
        <div style={{
          position: "relative", marginTop: 18, paddingTop: 14, borderTop: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
          display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
          fontFamily: "var(--ed-body)", fontSize: 13.5, color: "#5C5140",
        }}>
          <span style={{ display: "inline-flex", flexShrink: 0 }} aria-hidden="true">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#7A6E5A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 8.5A1.5 1.5 0 0 1 4.5 7h2.2l1-1.6A1 1 0 0 1 8.5 5h7a1 1 0 0 1 .85.46l1 1.54h2.15A1.5 1.5 0 0 1 21 8.5v9A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5v-9Z" />
              <circle cx="12" cy="13" r="3.2" />
            </svg>
          </span>
          <span>Your standing is <strong style={{ color: "#211A12" }}>snapshotted when Season 1 closes</strong> · {participants.toLocaleString()} raising now.</span>
          <span style={{ marginLeft: "auto", fontFamily: "var(--ed-m)", fontSize: 12, color: "#9A7B4E" }}>non-financial status</span>
        </div>
      </div>
    </div>
  );
}
