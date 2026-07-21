"use client";

/**
 * Season Rewards hub — the merged "my status + earn + compete + connect" page.
 *
 * Layout (top → bottom):
 *   TodayStrip        — the 5-second loop: one-tap Daily Check-in claim (the
 *                       SAME /api/checkin the home card uses — real D1–D7
 *                       ladder values, never invented), the next hourly
 *                       spotlight countdown, and the streak flame. A returning
 *                       visitor banks a reward before scrolling.
 *   IdentityHeader    — ink-dark pet card: avatar + pet NAME large, then a
 *                       separately-labelled "SEASON TIER" line (tier medallion
 *                       + "Sprout — N pts to Bronze" + progress bar) so a tier
 *                       name can never read as a second pet name again.
 *                       (Supersedes the old MyCard strip, where "Cat · Sprout"
 *                       collided into one unlabelled line.)
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

// ── Shared data shapes ──────────────────────────────────────────────────────

/** GET /api/me/summary — same payload the old MyCard consumed. */
interface MeSummary {
  points: number;
  credits: number;
  streak: number;       // mission/care streak (UserStreak.current_streak)
  longest: number;      // best-ever streak (UserStreak.longest_streak)
  shields: number;
  streakRank: number | null;
  pet: { name: string; avatar_url: string | null; level: number } | null;
}

/** GET/POST /api/checkin — `rewards` is the server's real D1–D7 ladder. */
interface CheckinState {
  streak: number;
  lastCheckin: string | null;
  checkedInToday: boolean;
  rewards: number[];
  awarded?: number;       // POST only: points actually granted just now
  bonusCredits?: number;  // POST only: day-3 starter-credit tranche, if paid
}

/** GET /api/drops/current — hourly spotlight (subset the strip needs). */
interface DropNow {
  emoji: string;
  label: string;
  ends_at: string;         // ISO — spotlight window close
  ends_in_seconds: number; // 0 = not live right now
  next_emoji: string;
  next_label: string;
  next_starts_at: string;  // ISO — top of the next hour
}

// ── TODAY strip — bank a reward within 5 seconds of landing ─────────────────

const EYEBROW: React.CSSProperties = {
  fontFamily: "var(--ed-m)", fontSize: 12, fontWeight: 700,
  textTransform: "uppercase", letterSpacing: "0.14em", color: RUST,
};

function fmtMMSS(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * One row, three cells: (a) one-tap Daily Check-in claim wired to the real
 * /api/checkin (identical ladder + POST as the home CheckinCard), (b) the next
 * hourly-spotlight countdown from /api/drops/current, (c) the streak flame
 * with best streak from /api/me/summary. Every number shown comes from those
 * APIs — nothing is invented, and no multiplier is advertised (the drops lib
 * explicitly does not apply multiplier_x to grants yet).
 */
function TodayStrip({ authed, me, onClaimed }: {
  authed: boolean | null;
  me: MeSummary | null;
  onClaimed: () => void;
}) {
  const [checkin, setCheckin] = useState<CheckinState | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [claimErr, setClaimErr] = useState<string | null>(null);
  const [justClaimed, setJustClaimed] = useState(false);
  const [drop, setDrop] = useState<DropNow | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());

  // Check-in state — only meaningful once we know the visitor is signed in.
  useEffect(() => {
    if (authed !== true) return;
    let alive = true;
    fetch("/api/checkin", { headers: getAuthHeaders() })
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (alive && d) setCheckin(d); })
      .catch(() => {});
    return () => { alive = false; };
  }, [authed]);

  // Spotlight — public endpoint; minutely refetch keeps the schedule honest,
  // a 1s tick drives the countdown between refetches.
  useEffect(() => {
    let alive = true;
    const load = () => {
      fetch("/api/drops/current")
        .then(r => (r.ok ? r.json() : null))
        .then(d => { if (alive && d) setDrop(d); })
        .catch(() => {});
    };
    load();
    const refetch = setInterval(load, 60_000);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => { alive = false; clearInterval(refetch); clearInterval(tick); };
  }, []);

  const claim = async () => {
    if (claiming || !checkin || checkin.checkedInToday) return;
    setClaiming(true);
    setClaimErr(null);
    try {
      const res = await fetch("/api/checkin", { method: "POST", headers: getAuthHeaders() });
      const d = await res.json();
      if (res.ok && d?.streak) {
        setCheckin(d);           // carries the REAL `awarded` from the server
        setJustClaimed(true);
        onClaimed();             // refresh points in the header + masthead
      } else {
        setClaimErr(d?.error || "Check-in failed — try again");
      }
    } catch {
      setClaimErr("Check-in failed — try again");
    }
    setClaiming(false);
  };

  // ── Ladder math — mirrors POST /api/checkin's newStreak logic exactly ──
  // (streak >= 7 → the cycle resets to Day 1). `R` is the server's ladder.
  const R = checkin?.rewards ?? [];
  const s = checkin?.streak ?? 0;
  /** Reward of the NEXT claim: today's if unclaimed, tomorrow's if claimed. */
  const nextReward = R.length ? R[s >= 7 ? 0 : s] : null;
  /** Day number the next/current claim lands on (1–7). */
  const dayNumber = checkin?.checkedInToday
    ? ((Math.max(1, s) - 1) % 7) + 1
    : s >= 7 ? 1 : s + 1;
  /** What today actually paid (server `awarded`, or derived from the ladder). */
  const todayAwarded = checkin?.checkedInToday
    ? (typeof checkin.awarded === "number" ? checkin.awarded : R.length ? R[(Math.max(1, s) - 1) % 7] : null)
    : null;
  /** If the visitor claims now, what tomorrow will pay. */
  const afterClaimNext = R.length ? R[dayNumber >= 7 ? 0 : dayNumber] : null;

  // ── Spotlight countdown — real ISO timestamps, ticking client-side ──
  const endsMs = drop ? Date.parse(drop.ends_at) : 0;
  const nextMs = drop ? Date.parse(drop.next_starts_at) : 0;
  const live = !!drop && endsMs > now;
  const remain = drop ? Math.round(((live ? endsMs : nextMs) - now) / 1000) : 0;

  const cellPad: React.CSSProperties = { padding: "12px 18px", minWidth: 0, display: "flex", alignItems: "center", gap: 12 };
  const mainLine: React.CSSProperties = {
    fontFamily: "var(--ed-disp)", fontWeight: 800, fontSize: 16,
    color: INK, letterSpacing: "-0.01em", lineHeight: 1.2,
  };
  const subLine: React.CSSProperties = {
    fontFamily: "var(--ed-m)", fontSize: 12, fontWeight: 700,
    color: INK_SOFT, marginTop: 2, fontVariantNumeric: "tabular-nums",
  };

  return (
    <div className="mp-enter" style={{ maxWidth: 1060, margin: "0 auto", padding: "0 24px", width: "100%" }}>
      <style>{`
        .srh-today { display: grid; grid-template-columns: 1.5fr 1fr 0.8fr; }
        .srh-today > .srh-cell + .srh-cell { border-left: 1px solid var(--ed-hair, rgba(33,26,18,.13)); }
        @media (max-width: 780px) {
          .srh-today { grid-template-columns: 1fr; }
          .srh-today > .srh-cell + .srh-cell { border-left: none; border-top: 1px solid var(--ed-hair, rgba(33,26,18,.13)); }
        }
      `}</style>
      <div className="srh-today" style={{
        background: PAPER, borderRadius: 16, border: `1px solid ${HAIR}`,
        boxShadow: CARD_SHADOW, overflow: "hidden",
      }}>
        {/* (a) One-tap Daily Check-in */}
        <div className="srh-cell" style={cellPad}>
          {authed === null || (authed === true && !checkin) ? (
            <>
              <div className="mp-skel" style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div className="mp-skel" style={{ width: 110, height: 12, borderRadius: 5 }} />
                <div className="mp-skel" style={{ width: 170, height: 15, borderRadius: 5, marginTop: 6 }} />
              </div>
            </>
          ) : authed === false ? (
            <>
              <span style={{
                width: 34, height: 34, borderRadius: 10, flexShrink: 0, background: TERRA,
                display: "inline-flex", alignItems: "center", justifyContent: "center",
              }}><Icon name="paw" size={18} /></span>
              <div style={{ minWidth: 0 }}>
                <div style={EYEBROW}>Daily Check-in</div>
                {/* Ladder mirrors STREAK_REWARDS in app/api/checkin/route.ts: D1 +5 → D7 +50. */}
                <div style={mainLine}>Day 1 pays +5 pts</div>
                <div style={subLine}>Sign in below to start · climbs to +50 by day 7</div>
              </div>
            </>
          ) : checkin!.checkedInToday ? (
            <>
              <span
                key={justClaimed ? "stamped" : "loaded"}
                style={{
                  width: 34, height: 34, borderRadius: "50%", flexShrink: 0,
                  background: GOLD_FOIL, border: "1.5px solid #C8932F",
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  fontFamily: "var(--ed-m)", fontWeight: 800, fontSize: 15, color: INK,
                  boxShadow: "2px 2px 0 rgba(33,26,18,0.16)",
                  animation: justClaimed ? "sealPress 400ms both" : "none",
                }}
                aria-hidden
              >✓</span>
              <div style={{ minWidth: 0 }}>
                <div style={EYEBROW}>Daily Check-in · Day {dayNumber} of 7</div>
                <div style={mainLine}>
                  Claimed today{todayAwarded != null ? ` +${todayAwarded}` : ""}
                  {justClaimed && todayAwarded != null && (
                    <span style={{ color: TERRA, marginLeft: 6, animation: "mpEnter 420ms cubic-bezier(0.2,0.8,0.2,1) both", display: "inline-block" }}>
                      banked!
                    </span>
                  )}
                </div>
                <div style={subLine}>
                  {nextReward != null ? `Come back tomorrow for +${nextReward}` : "Come back tomorrow"}
                  {typeof checkin!.bonusCredits === "number" && checkin!.bonusCredits > 0 && (
                    <span style={{ color: TERRA }}> · +{checkin!.bonusCredits} bonus credits unlocked</span>
                  )}
                </div>
              </div>
            </>
          ) : (
            <>
              <span style={{
                width: 34, height: 34, borderRadius: 10, flexShrink: 0, background: TERRA,
                display: "inline-flex", alignItems: "center", justifyContent: "center",
              }}><Icon name="paw" size={18} /></span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={EYEBROW}>Daily Check-in · Day {dayNumber} of 7</div>
                <div style={mainLine}>{nextReward != null ? `+${nextReward} pts today` : "Check in today"}</div>
                <div style={subLine}>
                  {claimErr
                    ? <span style={{ color: TERRA }}>{claimErr}</span>
                    : afterClaimNext != null ? `One tap · tomorrow pays +${afterClaimNext}` : "One tap"}
                </div>
              </div>
              {/* Ink-on-orange die-cut CTA — the one-tap bank. */}
              <button
                onClick={claim}
                disabled={claiming}
                style={{
                  flexShrink: 0, cursor: claiming ? "default" : "pointer",
                  fontFamily: "var(--ed-disp)", fontWeight: 800, fontSize: 15, color: INK,
                  background: "linear-gradient(180deg,#F6A93C,#E98A18)",
                  border: `1.5px solid ${INK}`, borderRadius: 12,
                  padding: "10px 18px",
                  boxShadow: "3px 3px 0 rgba(33,26,18,0.25)",
                  opacity: claiming ? 0.6 : 1,
                  whiteSpace: "nowrap",
                }}
              >
                {claiming ? "Claiming…" : nextReward != null ? `Claim +${nextReward}` : "Claim"}
              </button>
            </>
          )}
        </div>

        {/* (b) Spotlight countdown */}
        <div className="srh-cell" style={cellPad}>
          {!drop ? (
            <>
              <div className="mp-skel" style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div className="mp-skel" style={{ width: 100, height: 12, borderRadius: 5 }} />
                <div className="mp-skel" style={{ width: 140, height: 15, borderRadius: 5, marginTop: 6 }} />
              </div>
            </>
          ) : (
            <>
              <span style={{
                width: 34, height: 34, borderRadius: 10, flexShrink: 0,
                background: live ? TERRA : PAPER_DIM,
                border: live ? "none" : `1px solid ${HAIR}`,
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                fontSize: 17,
              }} aria-hidden>{live ? drop.emoji : drop.next_emoji}</span>
              <div style={{ minWidth: 0 }}>
                <div style={EYEBROW}>{live ? "Spotlight live" : "Next spotlight"}</div>
                <div style={{ ...mainLine, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {live ? drop.label : drop.next_label}
                </div>
                <div style={subLine}>
                  {remain > 0
                    ? live ? `${fmtMMSS(remain)} left` : `starts in ${fmtMMSS(remain)}`
                    : "any moment now"}
                </div>
              </div>
            </>
          )}
        </div>

        {/* (c) Streak flame + best streak */}
        <div className="srh-cell" style={cellPad}>
          <span style={{
            width: 34, height: 34, borderRadius: 10, flexShrink: 0,
            background: PAPER_DIM, border: `1px solid ${HAIR}`,
            display: "inline-flex", alignItems: "center", justifyContent: "center",
          }}><Icon name="fire" size={18} /></span>
          <div style={{ minWidth: 0 }}>
            <div style={EYEBROW}>Streak</div>
            {authed === false ? (
              <>
                <div style={mainLine}>—</div>
                <div style={subLine}>starts with your first day</div>
              </>
            ) : me ? (
              <>
                <div style={{ ...mainLine, fontVariantNumeric: "tabular-nums" }}>{me.streak}d</div>
                <div style={subLine}>best {me.longest}d</div>
              </>
            ) : (
              <>
                <div className="mp-skel" style={{ width: 44, height: 15, borderRadius: 5, marginTop: 2 }} />
                <div className="mp-skel" style={{ width: 70, height: 12, borderRadius: 5, marginTop: 6 }} />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Identity header — the PET first, the tier clearly labelled below ────────

function HeaderTile({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div style={{
      padding: "10px 16px", borderRadius: 12,
      background: "rgba(255,248,238,0.05)",
      border: "1px solid rgba(255,248,238,0.12)",
      minWidth: 88,
    }}>
      <div style={{ fontSize: 12, fontFamily: "var(--ed-m)", fontWeight: 700, letterSpacing: "0.12em", color: "rgba(255,248,238,0.6)", textTransform: "uppercase" }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, color: TERRA, fontFamily: "var(--ed-m)", lineHeight: 1.1, marginTop: 2, fontVariantNumeric: "tabular-nums" }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 12, color: "rgba(255,248,238,0.6)", marginTop: 1, fontFamily: "var(--ed-m)" }}>{sub}</div>}
    </div>
  );
}

/**
 * Replaces the old MyCard strip. Hierarchy fix: the pet's NAME is the big
 * display-face line next to its avatar, and the season tier lives on its own
 * row under a mono "SEASON TIER" eyebrow with the tier medallion and progress
 * bar — so "Sprout" can never be misread as a second pet name.
 */
function IdentityHeader({ me }: { me: MeSummary | null }) {
  if (!me) return null;

  const st = seasonTier(me.points);

  return (
    <div className="mp-enter" style={{ maxWidth: 1060, margin: "0 auto", padding: "0 24px" }}>
      <style>{`@media (max-width:640px){.srh-id-spacer{display:none !important}.srh-id-tiles{display:grid !important;grid-template-columns:repeat(auto-fit,minmax(96px,1fr)) !important;width:100% !important}}`}</style>
      <div style={{
        background: INK, color: CREAM, borderRadius: 18, padding: "20px 24px",
        border: `1px solid ${HAIR}`, boxShadow: CARD_SHADOW,
      }}>
        {/* Row 1 — the PET: avatar + name, unmistakably the pet. */}
        <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
            <img
              src={me.pet?.avatar_url || "/mascot.jpg"}
              alt={me.pet?.name || "Your pet"}
              style={{
                width: 64, height: 64, borderRadius: 16, objectFit: "cover",
                border: "1px solid rgba(255,248,238,0.18)",
                opacity: me.pet?.avatar_url ? 1 : 0.9,
              }}
            />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, fontFamily: "var(--ed-m)", fontWeight: 700, letterSpacing: "0.14em", color: "rgba(255,248,238,0.55)", textTransform: "uppercase" }}>
                My Pet
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                <span style={{ fontSize: "clamp(22px,4.5vw,28px)", fontWeight: 800, letterSpacing: "-0.02em", fontFamily: "var(--ed-disp)", lineHeight: 1.15 }}>
                  {me.pet?.name || "Your pet"}
                </span>
                {me.pet && (
                  <span style={{
                    fontFamily: "var(--ed-m)", fontSize: 12, fontWeight: 700, letterSpacing: "0.1em",
                    color: "rgba(255,248,238,0.75)", border: "1px solid rgba(255,248,238,0.25)",
                    borderRadius: 999, padding: "2px 9px", whiteSpace: "nowrap",
                  }}>
                    LV {me.pet.level}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="srh-id-spacer" style={{ flex: 1 }} />

          <div className="srh-id-tiles" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <HeaderTile label="Points" value={me.points.toLocaleString()} />
            <HeaderTile label="Credits" value={me.credits.toLocaleString()} />
            {me.streakRank != null && <HeaderTile label="Streak rank" value={`#${me.streakRank}`} sub="by streak" />}
            {me.shields > 0 && (
              <HeaderTile label="Shields" value={<><Icon name="shield" size={18} style={{ marginRight: 4 }} />{me.shields}</>} />
            )}
          </div>
        </div>

        {/* Row 2 — SEASON TIER, labelled so it can never read as a name. */}
        <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid rgba(255,248,238,0.14)" }}>
          <div style={{ fontSize: 12, fontFamily: "var(--ed-m)", fontWeight: 700, letterSpacing: "0.16em", color: "#DCB45F", textTransform: "uppercase" }}>
            Season Tier
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8, flexWrap: "wrap" }}>
            <WaxSeal
              seal={rungSeal(st.tier.name, "current")}
              size={40}
              title={`${st.tier.name} tier — your current season tier`}
            />
            <div style={{ minWidth: 0 }}>
              <span style={{ fontFamily: "var(--ed-disp)", fontWeight: 800, fontSize: 18, letterSpacing: "-0.01em" }}>
                {st.tier.name}
              </span>
              <span style={{ fontFamily: "var(--ed-m)", fontSize: 13, fontWeight: 700, color: "rgba(255,248,238,0.75)", marginLeft: 8, fontVariantNumeric: "tabular-nums" }}>
                {st.next ? `— ${st.toNext.toLocaleString()} pts to ${st.next.name}` : "— top tier reached"}
              </span>
            </div>
            {st.next && (
              <span style={{ marginLeft: "auto", fontFamily: "var(--ed-m)", fontSize: 12, fontWeight: 700, color: "rgba(255,248,238,0.6)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                {me.points.toLocaleString()} / {st.next.min.toLocaleString()}
              </span>
            )}
          </div>
          <div style={{ marginTop: 10, height: 10, background: "rgba(255,248,238,0.12)", borderRadius: 999, overflow: "hidden" }}>
            <div style={{
              height: "100%", width: `${(st.progress * 100).toFixed(1)}%`, background: TERRA,
              transition: "width 0.6s cubic-bezier(.22,1,.36,1)",
            }} />
          </div>
        </div>
      </div>
    </div>
  );
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

function SeasonMasthead({ refresh = 0 }: { refresh?: number }) {
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/dashboard/projection", { headers: getAuthHeaders(), credentials: "include" })
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (alive) setData(d); })
      .catch(() => {});
    return () => { alive = false; };
  }, [refresh]); // bumps after a check-in claim so the points chip stays live

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

  // One shared /api/me/summary fetch feeds the TODAY strip (streak flame) and
  // the identity header. `refresh` bumps after a check-in claim so points,
  // credits and the masthead chip update without a reload.
  const [me, setMe] = useState<MeSummary | null>(null);
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let alive = true;
    fetch("/api/me/summary", { headers: getAuthHeaders() })
      .then(r => {
        if (!alive) return null;
        if (r.status === 401) { setAuthed(false); return null; }
        setAuthed(true);
        return r.ok ? r.json() : null;
      })
      .then(d => { if (alive && d) setMe(d); })
      .catch(() => {});
    return () => { alive = false; };
  }, [refresh]);

  return (
    <div style={{ paddingTop: 100, display: "flex", flexDirection: "column", gap: 4 }}>
      {/* TODAY strip — one-tap check-in, next spotlight, streak. First thing
          a returning visitor sees; a reward is bankable in one tap. */}
      <TodayStrip authed={authed} me={me} onClaimed={() => setRefresh(k => k + 1)} />

      {/* Identity header — pet first, tier clearly labelled below. */}
      <IdentityHeader me={me} />

      {/* App's countdown ticket — ONLY once the founder scheduled the real
          Season 1 window. Unscheduled = far-future sentinel; rendering a
          countdown from it would fabricate a date (UI law in lib/season.ts),
          so the masthead's STARTING SOON framing stands in for it. */}
      {SEASON_SCHEDULED && banner}

      {/* The season centerpiece: status + tier ladder + compliance. */}
      <SeasonMasthead refresh={refresh} />

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
