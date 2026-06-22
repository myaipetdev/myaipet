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
import Icon from "@/components/Icon";

/** Maps each season tier to a crafted 3D icon (replaces the bare medal/rank emoji). */
const TIER_ICON: Record<string, string> = {
  sprout: "grass",
  bronze: "medal",
  silver: "medal",
  gold: "medal",
  diamond: "diamond",
  legend: "crown",
};

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
        background: "linear-gradient(135deg, #14142a 0%, #2d1b69 70%, #4c1d95 100%)",
        borderRadius: 18, padding: "22px 24px", color: "#fff",
        boxShadow: "0 8px 32px rgba(20,20,42,0.25)", position: "relative", overflow: "hidden",
      }}>
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none",
          background: `radial-gradient(circle at 88% 18%, ${tier.color}33 0%, transparent 55%)`,
        }} />

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, position: "relative", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.18em", color: "rgba(255,255,255,0.55)" }}>
              SEASON 1 STANDING
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 4 }}>
              <span style={{ fontSize: 30, lineHeight: 1, display: "inline-flex" }}><Icon name={TIER_ICON[tier.key] || "medal"} size={30} /></span>
              <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 800, fontSize: 26, letterSpacing: "-0.02em", color: tier.color }}>
                {tier.name}
              </span>
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 800, fontSize: 24, color: "#fde68a" }}>
              {signedIn ? points.toLocaleString() : "0"}<span style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", marginLeft: 5 }}>pts</span>
            </div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "rgba(255,255,255,0.5)", marginTop: 2, display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 4 }}>
              {next ? `${toNext.toLocaleString()} to ${next.name}` : (
                <>
                  <Icon name="crown" size={12} />
                  Top tier reached
                </>
              )}
            </div>
          </div>
        </div>

        {/* Progress to next tier */}
        <div style={{ marginTop: 16, position: "relative" }}>
          <div style={{ height: 8, background: "rgba(255,255,255,0.12)", borderRadius: 5, overflow: "hidden" }}>
            <div style={{
              height: "100%", borderRadius: 5, width: `${(progress * 100).toFixed(1)}%`,
              background: `linear-gradient(90deg, ${tier.color}, #fff)`, transition: "width 0.6s ease",
            }} />
          </div>
        </div>

        {/* The ladder */}
        <div style={{ display: "flex", gap: 6, marginTop: 16, position: "relative" }}>
          {SEASON_TIERS.map((t) => {
            const reached = points >= t.min;
            const current = t.key === tier.key;
            return (
              <div key={t.key} style={{
                flex: 1, textAlign: "center", padding: "8px 2px", borderRadius: 10,
                background: current ? "rgba(255,255,255,0.12)" : "transparent",
                border: current ? `1px solid ${t.color}66` : "1px solid transparent",
                opacity: reached ? 1 : 0.4, filter: reached ? "none" : "grayscale(0.6)",
                transition: "all 0.3s",
              }}>
                <div style={{ fontSize: 18, lineHeight: 1.1, display: "flex", justifyContent: "center" }}><Icon name={TIER_ICON[t.key] || "medal"} size={18} /></div>
                <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 9.5, fontWeight: 700, color: reached ? t.color : "rgba(255,255,255,0.7)", marginTop: 2, letterSpacing: "-0.01em" }}>
                  {t.name}
                </div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8, color: "rgba(255,255,255,0.4)", marginTop: 1 }}>
                  {t.min >= 1000 ? `${t.min / 1000}k` : t.min}
                </div>
              </div>
            );
          })}
        </div>

        {/* Snapshot scarcity — anticipation without a token promise */}
        <div style={{
          marginTop: 16, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.10)",
          display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
          fontFamily: "'Space Grotesk',sans-serif", fontSize: 12, color: "rgba(255,255,255,0.78)",
        }}>
          <span style={{ fontSize: 14, display: "inline-flex", flexShrink: 0 }} aria-hidden="true">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.78)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 8.5A1.5 1.5 0 0 1 4.5 7h2.2l1-1.6A1 1 0 0 1 8.5 5h7a1 1 0 0 1 .85.46l1 1.54h2.15A1.5 1.5 0 0 1 21 8.5v9A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5v-9Z" />
              <circle cx="12" cy="13" r="3.2" />
            </svg>
          </span>
          <span>Your standing is <strong style={{ color: "#fff" }}>snapshotted when Season 1 closes</strong> · {participants.toLocaleString()} raising now.</span>
          <span style={{ marginLeft: "auto", fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: "rgba(255,255,255,0.4)" }}>
            non-financial status
          </span>
        </div>
      </div>
    </div>
  );
}
