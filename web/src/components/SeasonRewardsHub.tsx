"use client";

/**
 * Season Rewards hub — the merged "my status + earn + compete + connect" page.
 *
 * Layout (top → bottom):
 *   MyCard            — personal ink-dark status strip (pet, streak, credits)
 *   {banner}          — App's countdown ticket, rendered ONLY when the founder
 *                       has scheduled Season 1 (SEASON_SCHEDULED). While the
 *                       season is unscheduled the window holds a far-future
 *                       sentinel, so any countdown/date would be fabricated —
 *                       the masthead's STARTING SOON framing replaces it.
 *   SeasonMasthead    — THE centerpiece: Season 1 status + the Sprout→Legend
 *                       tier ladder as big wax-seal medallions, the user's real
 *                       points as a sticker chip, and the recognition-only
 *                       compliance stamp. (Supersedes the old separate
 *                       SeasonBanner + SeasonTierCard stack — one block, no
 *                       scattered whitespace.)
 *   Tabs              — 🎯 Earn · 🏆 Compete · 🤝 Connect pillars
 *   PremiumTeaser     — upsell, after the content on every pillar.
 *
 * All numbers are real (projection API + lib/season). Pre-start, points are
 * honest PRE-SEASON points that carry into Season 1 — the copy says so.
 */
import { useEffect, useState } from "react";

import Icon from "@/components/Icon";
import Reveal from "@/components/Reveal";
import MyCard from "@/components/MyCard";
import HourlyDropBanner from "@/components/HourlyDropBanner";
import MissionsCard from "@/components/MissionsCard";
import WeeklyMonthlyCard from "@/components/WeeklyMonthlyCard";
import MultiLeaderboard from "@/components/MultiLeaderboard";
import SosFeedAndBuddy from "@/components/SosFeedAndBuddy";
import PetDateWidget from "@/components/PetDateWidget";
import PremiumTeaser from "@/components/PremiumTeaser";
import { getAuthHeaders } from "@/lib/api";
import { SEASON_TIERS, SEASON_SCHEDULED, seasonPhase, seasonTier } from "@/lib/season";
import { WaxSeal, type SealSpec } from "@/components/Sticker";

// ── Shared Collectible Editorial tokens ─────────────────────────────────────
const INK = "#211A12";
const CREAM = "#FFF8EE";
const PAPER = "#FBF6EC";
const PAPER_DIM = "#F5EFE2";
const TERRA = "#BE4F28";
const RUST = "#9A4E1E";
const INK_SOFT = "#5C5140";
const HAIR = "var(--ed-hair, rgba(33,26,18,.13))";
const CARD_SHADOW = "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))";
const GOLD_FOIL = "repeating-linear-gradient(110deg,#f3e2bc 0 5px,#dcb45f 5px 10px,#f3e2bc 10px 15px)";

/** A season-tier rung as a wax seal: gold foil for the current tier, terracotta
 *  for reached rungs, an un-stamped dashed ring for tiers not yet earned. */
function rungSeal(name: string, state: "current" | "reached" | "locked"): SealSpec {
  // 2-letter abbreviation so Sprout/Silver (both "S") don't collide.
  const glyph = name.slice(0, 2);
  if (state === "current") return { fill: GOLD_FOIL, ring: "#C8932F", glyph, glyphColor: CREAM, lip: "inset 0 2px 0 rgba(255,255,255,0.5)" };
  if (state === "reached") return { fill: TERRA, ring: RUST, glyph, glyphColor: CREAM, lip: "inset 0 1.5px 0 rgba(255,255,255,0.35)" };
  return { fill: PAPER_DIM, ring: HAIR, glyph, glyphColor: "rgba(33,26,18,0.55)", lip: "none" };
}

// ── Season masthead — status + points sticker + the tier ladder ─────────────

type Phase = ReturnType<typeof seasonPhase>;

/** Phase-status tag: gold foil while we build to launch, terracotta once live. */
function StatusTag({ phase }: { phase: Phase }) {
  const base: React.CSSProperties = {
    display: "inline-flex", alignItems: "center",
    fontFamily: "var(--ed-m)", fontSize: 12, fontWeight: 700,
    letterSpacing: "0.14em", textTransform: "uppercase",
    padding: "4px 11px", borderRadius: 999,
    transform: "rotate(-1.5deg)",
    boxShadow: "2px 2px 0 rgba(33,26,18,0.18)",
    whiteSpace: "nowrap",
  };
  if (!SEASON_SCHEDULED || phase === "upcoming") {
    // Gold-foil launch stamp — anticipation, never a fabricated date.
    return <span style={{ ...base, background: GOLD_FOIL, color: INK, border: "1.5px solid #C8932F" }}>Starting Soon</span>;
  }
  if (phase === "live") {
    return <span style={{ ...base, background: TERRA, color: CREAM, border: `1.5px solid ${RUST}` }}>Live</span>;
  }
  return <span style={{ ...base, background: INK, color: CREAM, border: `1.5px solid ${INK}` }}>Ended</span>;
}

function SeasonMasthead() {
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/dashboard/projection", { headers: getAuthHeaders(), credentials: "include" })
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (alive) setData(d); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const phase = seasonPhase();
  const preStart = phase === "upcoming"; // includes the unscheduled state
  const loading = data === null;
  const signedIn = !!data?.me;
  const points = data?.me?.points ?? 0;
  const rank: number | null = data?.me?.rank ?? null;
  const participants: number = data?.pool?.participants ?? 0;
  const { tier, next, toNext, progress } = seasonTier(points);

  // Copy per phase — no dates anywhere in the masthead; when a real window
  // exists, the countdown lives in the App-owned banner above.
  const headline = preStart
    ? "Every point carries in."
    : phase === "live"
      ? "The climb is on."
      : "Final standings.";
  const subline = preStart
    ? "Season 1 opens with the public launch. Points you earn now are pre-season points — they carry into Season 1."
    : phase === "live"
      ? "Climb the tier ladder — your standing is snapshotted when Season 1 closes."
      : "Season 1 is wrapped. Standings are frozen — Season 2 soon.";
  const chipLabel = preStart ? "Pre-Season PTS" : phase === "live" ? "Season PTS" : "Final PTS";

  // Quiet skeleton until the projection resolves — never flash fake zeros.
  if (loading) {
    return (
      <Reveal dir="pop" style={{ maxWidth: 1060, margin: "12px auto 0", padding: "0 24px", width: "100%" }}>
        <div className="mp-enter" style={{
          background: PAPER, borderRadius: 20, padding: "24px",
          border: `1px solid ${HAIR}`, boxShadow: CARD_SHADOW,
          display: "flex", flexDirection: "column", gap: 18,
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div className="mp-skel" style={{ width: 190, height: 18, borderRadius: 6 }} />
              <div className="mp-skel" style={{ width: 260, height: 30, borderRadius: 6 }} />
            </div>
            <div className="mp-skel" style={{ width: 130, height: 64, borderRadius: 14 }} />
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            {[0, 1, 2, 3, 4, 5].map(i => <div key={i} className="mp-skel" style={{ flex: 1, height: 88, borderRadius: 12 }} />)}
          </div>
          <div className="mp-skel" style={{ width: "100%", height: 14, borderRadius: 999 }} />
        </div>
      </Reveal>
    );
  }

  return (
    <Reveal dir="pop" style={{ maxWidth: 1060, margin: "12px auto 0", padding: "0 24px", width: "100%" }}>
      <style>{`
        @media (max-width: 700px) {
          .srh-ladder { grid-template-columns: repeat(3, 1fr) !important; row-gap: 18px !important; }
        }
      `}</style>
      <div style={{
        position: "relative", overflow: "hidden",
        background: PAPER, borderRadius: 20, padding: "24px", color: INK,
        border: `1px solid ${HAIR}`, boxShadow: CARD_SHADOW,
      }}>
        {/* Faint ruled-paper texture (a binder page), barely there */}
        <div aria-hidden style={{ position: "absolute", inset: 0, pointerEvents: "none",
          background: "repeating-linear-gradient(0deg, transparent 0 27px, rgba(33,26,18,0.04) 27px 28px)" }} />

        {/* ── Header: SEASON 1 status + real points as a sticker chip ── */}
        <div style={{ position: "relative", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div style={{ minWidth: 220, flex: "1 1 300px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span style={{ fontFamily: "var(--ed-m)", fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.16em", color: RUST }}>
                Season 1
              </span>
              <StatusTag phase={phase} />
            </div>
            <div style={{ fontFamily: "var(--ed-disp)", fontWeight: 800, fontSize: "clamp(24px,5vw,32px)", letterSpacing: "-0.02em", color: INK, marginTop: 8, lineHeight: 1.08 }}>
              {headline}
            </div>
            <div style={{ fontFamily: "var(--ed-body)", fontSize: 14, color: INK_SOFT, lineHeight: 1.5, marginTop: 6, maxWidth: 520 }}>
              {subline}
            </div>
          </div>

          {/* Points sticker chip — die-cut: ink keyline + hard offset shadow */}
          <div style={{
            background: CREAM, border: `2px solid ${INK}`, borderRadius: 14,
            boxShadow: "4px 4px 0 rgba(33,26,18,0.2)",
            padding: "10px 18px 12px", transform: "rotate(1.6deg)",
            textAlign: "right", flexShrink: 0,
          }}>
            <div style={{ fontFamily: "var(--ed-m)", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.14em", color: RUST }}>
              {chipLabel}
            </div>
            <div style={{ fontFamily: "var(--ed-m)", fontWeight: 800, fontSize: "clamp(26px,6vw,34px)", color: INK, lineHeight: 1.1, fontVariantNumeric: "tabular-nums" }}>
              {points.toLocaleString()}
            </div>
            <div style={{ fontFamily: "var(--ed-body)", fontSize: 12, color: INK_SOFT, marginTop: 2 }}>
              {preStart
                ? "carry into Season 1"
                : signedIn && rank != null
                  ? `rank #${rank.toLocaleString()}`
                  : "start climbing"}
            </div>
          </div>
        </div>

        {/* ── THE TIER LADDER — Sprout → Legend, the centerpiece ── */}
        <div className="srh-ladder" style={{
          position: "relative", marginTop: 22,
          display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 10,
        }}>
          {SEASON_TIERS.map((t, i) => {
            const reached = points >= t.min;
            const current = t.key === tier.key;
            const state = current ? "current" : reached ? "reached" : "locked";
            return (
              <div key={t.key} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 7, minWidth: 0 }}>
                <WaxSeal
                  seal={rungSeal(t.name, state)}
                  size={current ? 58 : 44}
                  title={`${t.name} tier — ${t.min.toLocaleString()}+ points${current ? " (your tier)" : ""}`}
                  style={state === "locked" ? { boxShadow: "none", borderStyle: "dashed" } : undefined}
                />
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span aria-hidden style={{ width: 5, height: 5, borderRadius: "50%", background: t.color, flexShrink: 0 }} />
                  <span style={{
                    fontFamily: "var(--ed-disp)", fontSize: current ? 15 : 13, fontWeight: current ? 800 : 700,
                    color: reached ? INK : INK_SOFT, letterSpacing: "-0.01em", whiteSpace: "nowrap",
                  }}>
                    {t.name}
                  </span>
                </div>
                {/* Threshold as a mini sticker chip */}
                <span style={{
                  fontFamily: "var(--ed-m)", fontSize: 12, fontWeight: 700, fontVariantNumeric: "tabular-nums",
                  color: reached ? INK : INK_SOFT,
                  background: reached ? CREAM : PAPER_DIM,
                  border: reached ? `1.5px solid ${INK}` : `1px solid ${HAIR}`,
                  boxShadow: reached ? "2px 2px 0 rgba(33,26,18,0.16)" : "none",
                  borderRadius: 8, padding: "2px 8px",
                  transform: `rotate(${i % 2 === 0 ? -1.5 : 1.5}deg)`,
                }}>
                  {t.min >= 1000 ? `${t.min / 1000}K` : t.min}
                </span>
                {current && (
                  <span style={{
                    fontFamily: "var(--ed-m)", fontSize: 12, fontWeight: 700, letterSpacing: "0.12em",
                    color: CREAM, background: TERRA, borderRadius: 6, padding: "1px 7px",
                  }}>
                    YOU
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* ── Progress to the next rung ── */}
        <div style={{ position: "relative", marginTop: 18 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 7 }}>
            <span style={{ fontFamily: "var(--ed-m)", fontSize: 13, fontWeight: 700, color: INK }}>
              {tier.name}
            </span>
            <span style={{ fontFamily: "var(--ed-m)", fontSize: 13, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: RUST }}>
              {next ? `${toNext.toLocaleString()} pts to ${next.name}` : "Top tier reached"}
            </span>
          </div>
          <div style={{ height: 14, background: PAPER_DIM, borderRadius: 999, border: `1px solid ${HAIR}`, overflow: "hidden" }}>
            <div style={{
              height: "100%", width: `${(progress * 100).toFixed(1)}%`, background: TERRA,
              borderRight: progress > 0 && progress < 1 ? `1px solid ${HAIR}` : "none",
              transition: "width 0.6s cubic-bezier(.22,1,.36,1)",
            }} />
          </div>
        </div>

        {/* ── Compliance stamp + real participation ── */}
        <div style={{
          position: "relative", marginTop: 18, paddingTop: 14, borderTop: `1px solid ${HAIR}`,
          display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
        }}>
          <span style={{
            fontFamily: "var(--ed-m)", fontSize: 12, fontWeight: 700, textTransform: "uppercase",
            letterSpacing: "0.12em", color: RUST,
            border: "1.5px solid rgba(154,78,30,0.5)", borderRadius: 999, padding: "4px 11px",
            transform: "rotate(-1deg)", whiteSpace: "nowrap",
          }}>
            Recognition only · no cash value
          </span>
          <span style={{ fontFamily: "var(--ed-body)", fontSize: 13, color: INK_SOFT }}>
            Standing is snapshotted at season close · non-transferable
          </span>
          <span style={{ marginLeft: "auto", fontFamily: "var(--ed-m)", fontSize: 13, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: INK }}>
            {participants === 1
              ? (preStart ? "1 raiser in pre-season" : "1 raising now")
              : `${participants.toLocaleString()} ${preStart ? "raising in pre-season" : "raising now"}`}
          </span>
        </div>
      </div>
    </Reveal>
  );
}

// ── Pillar tabs ─────────────────────────────────────────────────────────────

type Pillar = "earn" | "compete" | "connect";

const TABS: Array<{ key: Pillar; icon: string; title: string; sub: string }> = [
  { key: "earn",    icon: "coins",  title: "Earn",    sub: "Missions · spotlights · streak" },
  { key: "compete", icon: "trophy", title: "Compete", sub: "Leaderboards" },
  { key: "connect", icon: "chat",   title: "Connect", sub: "SOS · buddies" },
];

export default function SeasonRewardsHub({ banner }: { banner?: React.ReactNode }) {
  const [pillar, setPillar] = useState<Pillar>(() => {
    // Deep-link support: /?section=season&pillar=compete lands on that tab.
    if (typeof window !== "undefined") {
      const p = new URLSearchParams(window.location.search).get("pillar");
      if (p === "earn" || p === "compete" || p === "connect") return p;
    }
    return "earn";
  });

  return (
    <div style={{ paddingTop: 100, display: "flex", flexDirection: "column", gap: 4 }}>
      {/* Persistent status header — doubles as the user's "my page". */}
      <MyCard />

      {/* App's countdown ticket — ONLY once the founder scheduled the real
          Season 1 window. Unscheduled = far-future sentinel; rendering a
          countdown from it would fabricate a date (UI law in lib/season.ts),
          so the masthead's STARTING SOON framing stands in for it. */}
      {SEASON_SCHEDULED && banner}

      {/* The season centerpiece: status + tier ladder + compliance. */}
      <SeasonMasthead />

      {/* Pillar tabs — big, labelled, so each pillar's purpose reads instantly. */}
      <Reveal dir="up" style={{ maxWidth: 1060, margin: "16px auto 0", padding: "0 24px", width: "100%" }}>
        <style>{`@media (max-width: 560px) { .srh-tabs { grid-template-columns: 1fr !important; } }`}</style>
        <div className="srh-tabs" style={{
          display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8,
        }}>
          {TABS.map(t => {
            const sel = t.key === pillar;
            return (
              <button
                key={t.key}
                onClick={() => setPillar(t.key)}
                className="mp-lift"
                style={{
                  display: "flex", alignItems: "center", gap: 11,
                  padding: "13px 16px", borderRadius: 14, cursor: "pointer",
                  textAlign: "left",
                  background: sel ? TERRA : PAPER,
                  border: `1px solid ${HAIR}`,
                  boxShadow: CARD_SHADOW,
                  transition: "background 0.15s, box-shadow 0.15s",
                }}
              >
                <span style={{ fontSize: 22, lineHeight: 1, display: "inline-flex" }}>
                  <Icon name={t.icon} size={22} />
                </span>
                <span style={{ minWidth: 0 }}>
                  <span style={{
                    display: "block",
                    fontFamily: "var(--ed-disp)", fontWeight: 800, fontSize: 15,
                    color: sel ? CREAM : INK, letterSpacing: "-0.01em",
                  }}>
                    {t.title}
                  </span>
                  <span style={{
                    display: "block", fontSize: 13, marginTop: 1,
                    color: sel ? "rgba(252,233,207,0.92)" : INK_SOFT,
                    fontFamily: "var(--ed-body)",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {t.sub}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </Reveal>

      {/* Pillar content — the tab chips label each section themselves; the old
          floating one-line intro block (dead whitespace) was removed. */}
      {pillar === "earn" && (
        <>
          <HourlyDropBanner />
          <MissionsCard />
          <WeeklyMonthlyCard />
        </>
      )}

      {pillar === "compete" && <MultiLeaderboard />}

      {pillar === "connect" && (
        <>
          <SosFeedAndBuddy />
          <PetDateWidget />
        </>
      )}

      {/* Upsell — present on every pillar, after the content. */}
      <PremiumTeaser />
    </div>
  );
}
