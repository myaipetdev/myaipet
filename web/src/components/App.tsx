"use client";

import { useState, useEffect, useCallback, useRef, lazy, Suspense } from "react";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";

import { api, getAuthHeaders } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import useCountUp from "@/hooks/useCountUp";

import Nav from "@/components/Nav";
import Icon from "@/components/Icon";
import Hero from "@/components/Hero";
import Reveal from "@/components/Reveal";
import Stats from "@/components/Stats";
import Pricing from "@/components/Pricing";
import OrchestrationExplainer from "@/components/OrchestrationExplainer";
import RaisePitch from "@/components/RaisePitch";
import WalletGate, { TourBanner } from "@/components/WalletGate";
import ToastHost from "@/components/Toast";
import DialogHost from "@/components/Dialog";
import { seasonPhase, SEASON_SCHEDULED, SEASON_START_MS, SEASON_END_MS } from "@/lib/season";
import SeasonRewardsHub from "@/components/SeasonRewardsHub";
import PetOfTheWeek from "@/components/PetOfTheWeek";
import { isTourActive, TOUR_ALLOWLIST } from "@/lib/tour";

const MyPetEditorial = lazy(() => import("@/components/editorial/MyPetEditorial"));
const ChatEditorial = lazy(() => import("@/components/editorial/ChatEditorial"));
const PetGenerate = lazy(() => import("@/components/PetGenerate"));
const SocialGallery = lazy(() => import("@/components/SocialGallery"));
const Leaderboard = lazy(() => import("@/components/Leaderboard"));
const AgentDashboard = lazy(() => import("@/components/AgentDashboard"));
const AgentWorkbench = lazy(() => import("@/components/AgentWorkbench"));
const AgentOffice = lazy(() => import("@/components/AgentOffice"));
const SovereigntyDashboard = lazy(() => import("@/components/SovereigntyDashboard"));
const PetStudioPro = lazy(() => import("@/components/PetStudioPro"));
const WorldCupPet = lazy(() => import("@/components/WorldCupPet")); // evergreen Favorites Bracket (+ seasonal World Cup module)
const CardDeck = lazy(() => import("@/components/CardDeck")); // TCG trading cards (owns the Catch tab)

// ── Grid Background ──
function Grid() {
  return (
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0, opacity: 0.03 }}>
      <svg width="100%" height="100%">
        <defs>
          <pattern id="g" width="50" height="50" patternUnits="userSpaceOnUse">
            <path d="M 50 0 L 0 0 0 50" fill="none" stroke="#211A12" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#g)" />
      </svg>
    </div>
  );
}

function Loader() {
  return (
    <div style={{ paddingTop: 120, textAlign: "center" }}>
      <img src="/mascot.jpg" alt="" style={{
        width: 64, height: 64, borderRadius: "50%", objectFit: "cover",
        border: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
        boxShadow: "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))",
        animation: "loaderFloat 2.4s ease-in-out infinite",
      }} />
      <div style={{
        marginTop: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
        color: "#9A7B4E", fontFamily: "var(--ed-m)", fontSize: 13, fontWeight: 700,
        letterSpacing: "0.14em", textTransform: "uppercase",
      }}>
        LOADING
        <span style={{ display: "inline-flex", gap: 3, alignItems: "center" }}>
          {[0, 1, 2].map(i => (
            <span key={i} style={{
              width: 4, height: 4, borderRadius: "50%", background: "#9A7B4E",
              display: "inline-block",
              animation: `edTypingDot 1.1s ease-in-out ${i * 0.15}s infinite both`,
            }} />
          ))}
        </span>
      </div>
      <style>{`@keyframes loaderFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}`}</style>
    </div>
  );
}

// ── Daily Check-in Card ──
function CheckinCard({ isAuthenticated, onPointsChanged }: { isAuthenticated: boolean; onPointsChanged?: () => void }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  // Ceremony state — the day pill just stamped by THIS check-in (sealPress)
  // and the real awarded amount from the API (rises above the pill).
  const [justChecked, setJustChecked] = useState<number | null>(null);
  const [awarded, setAwarded] = useState<number | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;
    // SCRUM-98: the check-in endpoint is authenticated — without the Bearer token
    // both the state GET and the POST 401 ("Unauthorized"), so streak never loads
    // and Check In silently fails even with a connected wallet.
    fetch("/api/checkin", { headers: getAuthHeaders() }).then(r => (r.ok ? r.json() : null)).then(d => d && setData(d)).catch(() => {});
  }, [isAuthenticated]);

  const doCheckin = async () => {
    if (!isAuthenticated || loading || data?.checkedInToday) return;
    setLoading(true);
    try {
      const res = await fetch("/api/checkin", { method: "POST", headers: getAuthHeaders() });
      const d = await res.json();
      if (d.streak) {
        setData(d);
        setJustChecked(d.streak);
        setAwarded(typeof d.awarded === "number" ? d.awarded : null);
        setMsg(`+${d.awarded} pts! Day ${d.streak} streak 🔥`);
        onPointsChanged?.(); // SCRUM-102: refresh header points immediately after the award
      }
      else setMsg(d.error || "Already checked in");
    } catch { setMsg("Failed"); }
    setLoading(false);
    setTimeout(() => { setMsg(null); setAwarded(null); }, 3000);
  };

  const rewards = [5, 10, 15, 20, 25, 30, 50];
  const streak = data?.streak ?? 0;
  const checkedIn = data?.checkedInToday ?? false;

  return (
    // Scroll-revealed (was mount-time mp-enter-2). The check-in ceremony
    // animations inside (sealPress, slideIn) are untouched.
    // No home-beat here: check-in is part of the tight season cluster
    // (banner → check-in → protocol footnote), so only a 10px seam below.
    <Reveal dir="up" delay={90} className="home-section-pad" style={{ padding: "0 40px", maxWidth: 1060, margin: "0 auto 10px" }}>
      <div id="daily-checkin" style={{
        borderRadius: 16, padding: "14px 20px", marginBottom: 8,
        background: "#FBF6EC", border: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
        boxShadow: "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))",
        display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap",
        scrollMarginTop: 88,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <span style={{
            width: 26, height: 26, borderRadius: 8, flexShrink: 0,
            background: "#BE4F28", border: "none",
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            color: "#FFF8EE",
          }}><Icon name="paw" size={14} /></span>
          <div>
            <div style={{ fontFamily: "var(--ed-disp)", fontWeight: 700, fontSize: 14, color: "#211A12" }}>
              Daily Check-in
            </div>
            <div style={{ fontFamily: "var(--ed-m)", fontSize: 13, color: "#7A6E5A" }}>
              {checkedIn
                ? `Day ${streak} streak active 🔥`
                : SEASON_SCHEDULED
                  ? "Check in to collect Season Rewards points"
                  : "Collect Season Rewards points — pre-season points carry into Season 1"}
            </div>
          </div>
        </div>

        {/* Day pills — on <480px this becomes ONE horizontal scroll row (.checkin-pills) */}
        <div className="checkin-pills" style={{ display: "flex", gap: 5, flex: 1, flexWrap: "wrap" }}>
          {rewards.map((r, i) => {
            const day = i + 1;
            const done = checkedIn ? streak >= day : streak > day;
            const isToday = checkedIn ? streak === day : streak + 1 === day;
            // Stamped by this session's check-in — wax-seal press, one shot.
            const stamped = justChecked === day;
            return (
              <div key={day} style={{
                padding: "4px 8px", borderRadius: 9, textAlign: "center",
                background: done ? "#BE4F28" : "#F5EFE2",
                border: `1px solid ${isToday ? "#BE4F28" : "var(--ed-hair, rgba(33,26,18,.13))"}`,
                boxShadow: isToday ? "0 0 0 2px rgba(190,79,40,0.18)" : "none",
                minWidth: 36, position: "relative",
                animation: stamped ? "sealPress 400ms both" : "none",
              }}>
                {stamped && awarded != null && (
                  <div style={{
                    position: "absolute", top: -16, left: 0, right: 0, textAlign: "center",
                    fontFamily: "var(--ed-m)", fontSize: 13, fontWeight: 700, color: "#BE4F28",
                    whiteSpace: "nowrap", pointerEvents: "none",
                    animation: "mpEnter 420ms cubic-bezier(0.2,0.8,0.2,1) both",
                  }}>
                    +{awarded}
                  </div>
                )}
                <div style={{ fontFamily: "var(--ed-m)", fontSize: 13, color: done ? "#FFF8EE" : isToday ? "#BE4F28" : "#9A7B4E", fontWeight: 700 }}>
                  {done ? "✓" : `D${day}`}
                </div>
                <div style={{ fontFamily: "var(--ed-m)", fontSize: 13, color: done ? "#FCE9CF" : "#9A7B4E" }}>
                  +{r}
                </div>
              </div>
            );
          })}
        </div>

        {msg && <span style={{ fontFamily: "var(--ed-m)", fontSize: 13, color: "#BE4F28", fontWeight: 700, animation: "slideIn .25s ease both" }}>{msg}</span>}

        {isAuthenticated ? (
          <button
            className="ed-press checkin-cta"
            onClick={doCheckin}
            disabled={checkedIn || loading}
            style={{
              padding: "9px 18px", borderRadius: 11, flexShrink: 0,
              background: checkedIn ? "#F5EFE2" : "linear-gradient(180deg,#F49B2A,#E27D0C)",
              color: checkedIn ? "#9A8A70" : "#FFF8EE",
              border: checkedIn ? "1px solid var(--ed-hair, rgba(33,26,18,.13))" : "none",
              boxShadow: checkedIn ? "none" : "0 10px 20px -12px rgba(226,125,12,.7)",
              fontFamily: "var(--ed-body)", fontSize: 13, fontWeight: 700,
              cursor: checkedIn ? "default" : "pointer",
            }}
          >
            {loading ? "..." : checkedIn ? "Done ✓" : "Check In"}
          </button>
        ) : (
          <div className="checkin-cta">
            <ConnectButton chainStatus="none" showBalance={false} label="Connect wallet to start" />
          </div>
        )}
      </div>
    </Reveal>
  );
}

// ── Season 1 Rewards Banner ──
// Season 1 opens WITH the public launch. Until the founder schedules it
// (SEASON_SCHEDULED, lib/season.ts) the banner is a launch-energy ticket:
// "STARTING SOON" + the real earn-rate chips, and NO dates/countdown — the
// unscheduled window holds a 2099 sentinel, so rendering it would fabricate
// a date. Scheduled → the real countdown returns: to the start while
// upcoming, to the close while live, frozen standings after the end.

// Real earn rates ONLY — mirrors RaisePitch + lib/seasonRewards.ts (care +5,
// image +10 / video +20, check-in ladder D1→D7 = +5→+50). Never invent rates.
const EARN_CHIPS = [
  { icon: "heart", label: "Care +5" },
  { icon: "sparkling", label: "Create +10–20" },
  { icon: "fire", label: "Streak +5→50" },
] as const;

function SeasonBanner({ seasonPoints }: { seasonPoints: number }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!SEASON_SCHEDULED) return; // no clock to tick while unscheduled
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Count the REAL points total up/down instead of hard-cutting, and flash the
  // chip briefly when the value changes (check-in award, activity refresh).
  const displayPoints = useCountUp(seasonPoints);
  const [ptsFlash, setPtsFlash] = useState(false);
  const prevPtsRef = useRef<number | null>(null);
  useEffect(() => {
    const prev = prevPtsRef.current;
    prevPtsRef.current = seasonPoints;
    if (prev !== null && prev !== seasonPoints) {
      setPtsFlash(true);
      const t = setTimeout(() => setPtsFlash(false), 500);
      return () => clearTimeout(t);
    }
  }, [seasonPoints]);

  const scheduled = SEASON_SCHEDULED;
  const phase = seasonPhase(now); // unscheduled → always "upcoming"
  // Real countdown (scheduled only): to the START while upcoming, then to the close.
  const remaining = Math.max(0, (phase === "upcoming" ? SEASON_START_MS : SEASON_END_MS) - now);
  const days = Math.floor(remaining / 86_400_000);
  const hours = Math.floor((remaining % 86_400_000) / 3_600_000);
  const minutes = Math.floor((remaining % 3_600_000) / 60_000);
  const seconds = Math.floor((remaining % 60_000) / 1000);

  const pad = (n: number) => String(n).padStart(2, "0");
  // UTC-pinned so server + client print the same date string (no hydration drift).
  const fmtDay = (ms: number) =>
    new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

  return (
    // Full-width terracotta ticket — scroll-revealed with the "pop" grammar
    // (was mount-time mp-enter-1).
    <Reveal dir="pop" style={{ padding: "0 clamp(16px,4vw,40px)", maxWidth: 1060, margin: "0 auto 0" }}>
      {/* Terracotta foil ticket: brand fill, cream content, soft floating shadow,
          one perforated cream tear edge. Editorial — no hard keyline, no offset. */}
      <div
        className="season-banner"
        style={{
          background: "#BE4F28",
          borderRadius: 18,
          padding: "15px 22px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 14,
          marginBottom: 8,
          border: "none",
          boxShadow: "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))",
          position: "relative",
          cursor: "default",
        }}
      >
        {/* Left: title + phase badge — with a perforated cream tear line after it */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, paddingRight: 16, borderRight: "2px dashed rgba(252,233,207,0.4)" }}>
          <Icon name="trophy" size={26} />
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <h1 className="season-banner-title" style={{
                fontFamily: "var(--ed-disp)", fontWeight: 800, fontSize: 18,
                color: "#FFF8EE", letterSpacing: "-0.02em", whiteSpace: "nowrap", margin: 0,
              }}>
                Season 1 Rewards
              </h1>
              {/* Gold-foil phase seal — launch energy pre-schedule, LIVE once running */}
              {(!scheduled || phase === "live") && (
                <span style={{
                  background: "linear-gradient(180deg,#D9A83C,#C8932F)", color: "#211A12",
                  borderRadius: 999, padding: "3px 9px",
                  fontFamily: "var(--ed-m)", fontSize: 12, fontWeight: 800,
                  letterSpacing: "0.08em", whiteSpace: "nowrap",
                  boxShadow: "0 1px 0 rgba(33,26,18,0.25)",
                }}>
                  {scheduled ? "LIVE" : "STARTING SOON"}
                </span>
              )}
            </div>
            {/* Dates render ONLY once the real window is scheduled — the
                unscheduled sentinel must never leak into copy. */}
            <div style={{
              fontFamily: "var(--ed-m)", fontSize: 12, color: "rgba(252,233,207,0.85)",
              marginTop: 3, whiteSpace: "nowrap", letterSpacing: "0.06em", textTransform: "uppercase",
            }}>
              {scheduled
                ? `${fmtDay(SEASON_START_MS)} – ${fmtDay(SEASON_END_MS)} · recognition only`
                : "Opens with public launch · recognition only"}
            </div>
          </div>
        </div>

        {/* Center: unscheduled → launch hook + real earn-rate chips (this is
            what fills the old dead middle); scheduled → the real countdown
            (to start while upcoming, to close while live), frozen when over. */}
        {!scheduled ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, flex: 1, minWidth: 240 }}>
            <div style={{ fontFamily: "var(--ed-body)", fontSize: 14, fontWeight: 700, color: "#FFF8EE", textAlign: "center" }}>
              Raise now — pre-season points carry into Season 1
            </div>
            <div className="season-chips" style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 6 }}>
              {EARN_CHIPS.map((c) => (
                <span key={c.label} style={{
                  display: "inline-flex", alignItems: "center", gap: 5,
                  background: "#FBF6EC", borderRadius: 999, padding: "4px 10px",
                  fontFamily: "var(--ed-m)", fontSize: 12, fontWeight: 700, color: "#9A4E1E",
                  whiteSpace: "nowrap",
                }}>
                  <Icon name={c.icon} size={14} /> {c.label}
                </span>
              ))}
            </div>
          </div>
        ) : phase === "ended" ? (
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8, flex: 1,
            fontFamily: "var(--ed-disp)", fontWeight: 800, fontSize: 14, color: "#FFF8EE",
          }}>
            Season 1 wrapped · <span style={{ opacity: 0.75, fontWeight: 700 }}>standings frozen · Season 2 soon</span>
          </div>
        ) : (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, flex: 1 }}>
          <div style={{ fontFamily: "var(--ed-m)", fontWeight: 700, fontSize: 12, color: "#FFF8EE", whiteSpace: "nowrap", letterSpacing: "0.1em", textTransform: "uppercase" }}>
            {phase === "upcoming" ? "STARTS IN" : "CLOSES IN"}
          </div>
          <div className="season-banner-countdown" style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {[
            { val: pad(days), label: "D" },
            { val: pad(hours), label: "H" },
            { val: pad(minutes), label: "M" },
            { val: pad(seconds), label: "S" },
          ].map((t, i) => (
            <div key={i} style={{ textAlign: "center" }}>
              <div style={{
                fontFamily: "var(--ed-m)", fontWeight: 700, fontSize: 18, color: "#BE4F28",
                lineHeight: 1, minWidth: 30,
                background: "#FBF6EC", borderRadius: 8, border: "none", padding: "5px 6px",
                fontVariantNumeric: "tabular-nums",
              }}>
                {t.val}
              </div>
              <div style={{ fontFamily: "var(--ed-m)", fontSize: 13, color: "rgba(252,233,207,0.8)", marginTop: 3 }}>
                {t.label}
              </div>
            </div>
          ))}
          </div>
        </div>
        )}

        {/* Right: the user's REAL points — labeled as pre-season carry-over
            before the start (never hidden, never zeroed, never re-branded). */}
        {seasonPoints > 0 && (
          <div style={{
            background: "#FBF6EC", borderRadius: 12, padding: "8px 14px", textAlign: "center",
            boxShadow: ptsFlash ? "0 0 0 3px rgba(200,147,47,0.55)" : "0 0 0 0 rgba(200,147,47,0)",
            transition: "box-shadow .3s ease", flexShrink: 0,
          }}>
            <div style={{
              fontFamily: "var(--ed-m)", fontWeight: 700, fontSize: 18, color: "#BE4F28",
              fontVariantNumeric: "tabular-nums", lineHeight: 1,
            }}>
              {displayPoints.toLocaleString()}
            </div>
            <div style={{
              fontFamily: "var(--ed-m)", fontSize: 12, color: "#7A6E5A", marginTop: 3,
              fontWeight: 700, letterSpacing: "0.08em", whiteSpace: "nowrap",
            }}>
              {phase === "upcoming" ? "PRE-SEASON PTS" : phase === "live" ? "SEASON PTS" : "FINAL PTS"}
            </div>
          </div>
        )}

      </div>
    </Reveal>
  );
}

// The EXACT in-SPA section keys that App renders below (note: "worldcup"/
// "workbench" are single words, and Studio is the "create" section — "studio"
// is only a header URL nav, never a section value).
const VALID_SECTIONS = ["home", "my pet", "cards", "catch", "create", "community", "agent", "office", "workbench", "sovereignty", "worldcup", "season", "chat"];

// Shared by the initial deep link AND the popstate (Back/Forward) handler.
// Season Rewards hub — the canonical section key is "season". The legacy
// "airdrop"/"leaderboard" keys (token-flavoured, contradict the no-token
// posture) are kept as inbound aliases so old deep links still resolve.
// Unknown section values used to render nav + an empty body — fall back home.
function normalizeSection(raw: string | null): string {
  if (raw === "leaderboard" || raw === "airdrop") return "season";
  return raw && VALID_SECTIONS.includes(raw) ? raw : "home";
}

export default function App() {
  const { isConnected } = useAccount();
  const { user, isAuthenticated, refreshUser } = useAuth();

  // Guest tour: WalletGate pins a fixed DEMO-TOUR banner to the bottom over
  // allowlisted sections. Without matching bottom padding on the page it
  // overlapped the last ~61px (desktop) / ~111px (mobile) of content — mirror
  // the banner's presence here to reserve that space (see .tour-pad CSS below).
  const [tourActive, setTourActive] = useState(false);
  useEffect(() => { setTourActive(isTourActive()); }, []);

  // Section is URL-aware via ?section= so cross-page links land correctly.
  // (Studio is a separate route and routes back here with ?section=...)
  const [section, setSection] = useState(() => {
    if (typeof window === "undefined") return "home";
    return normalizeSection(new URLSearchParams(window.location.search).get("section"));
  });
  // Where the current section value came from — decides how the history effect
  // below writes the URL. "init" (first paint) and "pop" (Back/Forward) must
  // NOT push a new entry; only in-app navigation ("nav") does.
  const sectionNavSource = useRef<"init" | "nav" | "pop">("init");
  // Keep the URL in sync when the user clicks nav inside the SPA. pushState
  // (not replaceState) so the browser Back button walks back through sections
  // instead of exiting the site (DD P1); the popstate listener below restores
  // the section when the user actually presses Back/Forward.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (section === "home") params.delete("section");
    else params.set("section", section);
    const next = params.toString();
    const url = next ? `/?${next}` : "/";
    const source = sectionNavSource.current;
    sectionNavSource.current = "nav";
    if (source === "nav") {
      window.history.pushState({}, "", url);
    } else {
      // First load or Back/Forward: the entry already exists — just normalize
      // aliases (airdrop/leaderboard → season) in place, never add an entry.
      window.history.replaceState({}, "", url);
    }
    // Section switches used to inherit the previous tab's scroll offset (users
    // landed mid-page/at the footer). Reset to top; the Pricing deep-links
    // below fire 100–150ms later, so they still win over this reset.
    window.scrollTo({ top: 0 });
  }, [section]);

  // Back/Forward: restore the section encoded in the URL of the history entry
  // the browser moved to (same aliases/validation as the initial deep link).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onPop = () => {
      const target = normalizeSection(new URLSearchParams(window.location.search).get("section"));
      setSection((prev: string) => {
        if (prev !== target) sectionNavSource.current = "pop";
        return target;
      });
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Stuck-entrance safety: the section outlet enters via a CSS keyframe that
  // STARTS at opacity 0. If the animation clock stalls (hidden/background tab,
  // capture pipelines), the whole section could sit invisible — force any
  // still-running entrance to its end state shortly after the switch.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const t = window.setTimeout(() => {
      document.querySelectorAll<HTMLElement>(".ed-section-enter").forEach((el) => {
        try { (el as any).getAnimations?.({ subtree: true }).forEach((a: Animation) => a.finish()); } catch { el.getAnimations?.().forEach((a) => { try { a.finish(); } catch { /* done */ } }); }
      });
    }, 900);
    return () => clearTimeout(t);
  }, [section]);

  // Landing on Pricing from /studio: Nav's "Credits & Points" and Studio's
  // out-of-credits links navigate to /?section=home&scroll=pricing (or set the
  // sessionStorage `scrollPricing` flag before the full-page hop). Honor it
  // once the home section renders, then clear both so refreshes stay at top.
  useEffect(() => {
    if (typeof window === "undefined" || section !== "home") return;
    const params = new URLSearchParams(window.location.search);
    const fromParam = params.get("scroll") === "pricing";
    let fromFlag = false;
    try { fromFlag = !!sessionStorage.getItem("scrollPricing"); } catch { /* storage blocked */ }
    if (!fromParam && !fromFlag) return;
    try { sessionStorage.removeItem("scrollPricing"); } catch { /* storage blocked */ }
    if (fromParam) {
      params.delete("scroll");
      const rest = params.toString();
      window.history.replaceState({}, "", rest ? `/?${rest}` : "/");
    }
    // Wait a beat so the home section has rendered and the scroll-to-top
    // from the [section] effect above has already fired.
    const t = setTimeout(() => {
      document.querySelector(".pricing-root")?.scrollIntoView({ behavior: "smooth" });
    }, 150);
    return () => clearTimeout(t);
  }, [section]);
  const [platformStats, setPlatformStats] = useState<any>(null);
  const [credits, setCredits] = useState(0);
  const [seasonPoints, setSeasonPoints] = useState(0);

  useEffect(() => {
    if (user) {
      setCredits(user.credits);
      // `season_points` is the persisted API/DB field; surfaced as Season Rewards points.
      if (user.season_points) setSeasonPoints(user.season_points);
    } else {
      // Logout / token expiry — clear so SeasonBanner doesn't keep showing the
      // previous user's point total.
      setCredits(0);
      setSeasonPoints(0);
    }
  }, [user]);

  // Request token so a slow poll response can't overwrite a newer one out of order.
  const statsReqRef = useRef(0);

  const fetchStats = useCallback(async () => {
    const reqId = ++statsReqRef.current;
    try {
      // Public, REAL aggregates (no admin gate, no mock). api.analytics.stats()
      // is admin-only, so visitors 401'd and we used to silently show
      // fabricated MOCK numbers on the landing page — a transparency risk.
      // Real data here, or the always-true qualitative fallback below.
      const r = await fetch("/api/community/highlights");
      if (!r.ok) return;
      const d = await r.json();
      if (reqId !== statsReqRef.current) return; // superseded by a newer poll
      if (d?.stats) {
        setPlatformStats({
          total_users: d.stats.pets ?? 0,
          total_generations: d.stats.generations ?? 0,
          tx_today: d.stats.generationsThisWeek ?? 0,
        });
      }
    } catch { /* leave null → honest qualitative fallback */ }
  }, []);

  useEffect(() => {
    // Stats only render on Home — don't poll (and write state) on other tabs.
    if (section !== "home") return;
    fetchStats();
    const s = setInterval(fetchStats, 15000);
    return () => clearInterval(s);
  }, [section, fetchStats]);

  // Never show "0" in a social-proof slot — the big stat cards only render on
  // REAL aggregates; otherwise the guest home shows two quiet mono footnote
  // lines (always-true qualitative facts) instead of dressed-up stat cards.
  const hasRealStats = !!(platformStats && ((platformStats.total_users ?? 0) >= 100 || (platformStats.total_generations ?? 0) >= 100));
  const stats = hasRealStats
    ? [
        { label: "Pets Adopted", value: (platformStats.total_users ?? 0).toLocaleString(), raw: platformStats.total_users ?? 0, animated: true, sub: "Companions raised" },
        { label: "AI Content Created", value: (platformStats.total_generations ?? 0).toLocaleString(), raw: platformStats.total_generations ?? 0, animated: true, sub: "Videos & Images" },
      ]
    : [];

  const handleCreditsChange = (newCredits: any) => {
    if (typeof newCredits === "number") setCredits(newCredits);
    else refreshUser();
  };

  // overflowX:clip (not overflow:hidden) — still clips horizontal reveal-animation
  // overflow, but does NOT create a scroll container, so position:sticky (My Pet
  // poster, etc.) keeps working. `overflow:hidden` silently broke sticky.
  const showTourBanner = !isConnected && tourActive && TOUR_ALLOWLIST.has(section);
  return (
    <div className={showTourBanner ? "tour-pad" : undefined} style={{ minHeight: "100vh", background: "#ECE4D4", color: "#211A12", position: "relative", overflowX: "clip" }}>
      <style>{`
        * { margin: 0; padding: 0; box-sizing: border-box }
        ::selection { background: rgba(190,79,40,0.18) }
        textarea::placeholder { color: rgba(33,26,18,0.25) }
        /* Guest-tour: reserve room for the fixed DEMO-TOUR banner so it never
           overlaps the last strip of content (e.g. the "Connect wallet to
           adopt" CTA) — safe-area aware to clear the iOS home indicator. The
           banner may wrap to two rows on mid widths, so reserve generously;
           on ≤640px the banner is a compact single fixed-height row (see
           TourBanner in WalletGate.tsx), so its height is known. */
        .tour-pad { padding-bottom: calc(120px + env(safe-area-inset-bottom, 0px)); }
        @media (max-width: 640px) { .tour-pad { padding-bottom: calc(84px + env(safe-area-inset-bottom, 0px)); } }
        @media (max-width: 768px) {
          .desktop-grid { grid-template-columns: 1fr !important; }
          .desktop-two-col { grid-template-columns: 1fr !important; }
        }
        /* ── Guest-home vertical rhythm ──
           Home sections sit on one consistent beat — 140px desktop / 80px
           mobile — instead of near-uniform 8-30px card stacking. RaisePitch,
           OrchestrationExplainer and Pricing carry their own 56-60px vertical
           padding, so their neighbors take the half/join classes to land every
           visual gap in the same 120-160px band.
           (!important beats the Reveal wrappers' inline margin: 0 auto.) */
        .home-beat { margin-bottom: 140px !important; }
        .home-beat-half { margin-bottom: 80px !important; }  /* + next section's ~60px own padding */
        .home-beat-join { margin-bottom: 24px; }             /* between two self-padded sections */
        @media (max-width: 640px) {
          .home-section-pad { padding-left: 16px !important; padding-right: 16px !important; }
          .season-banner { padding: 12px 16px !important; }
          .season-banner-title { font-size: 15px !important; }
          .season-chips { gap: 4px !important; }
          .season-banner-countdown { gap: 4px !important; }
          .season-banner-countdown > div > div:first-child { font-size: 14px !important; }
          .home-beat { margin-bottom: 80px !important; }
          .home-beat-half { margin-bottom: 32px !important; }
          .home-beat-join { margin-bottom: 0; }
        }
        @media (max-width: 480px) {
          /* Daily Check-in: D1-D7 chips become ONE horizontal scroll row
             (no wrap), and the CTA drops to a full-width row below. */
          .checkin-pills {
            flex-wrap: nowrap !important; overflow-x: auto; flex-basis: 100%;
            -webkit-overflow-scrolling: touch; scrollbar-width: none;
            /* room for the +N award float above a freshly stamped pill */
            padding-top: 18px; margin-top: -10px;
          }
          .checkin-pills::-webkit-scrollbar { display: none; }
          .checkin-pills > div { flex: 0 0 auto; }
          .checkin-cta { flex-basis: 100% !important; width: 100%; }
          .checkin-cta button { width: 100%; }
        }
      `}</style>

      {/* Always show app (landing is on separate domain myaipet.ai) */}
          <Grid />
          <ToastHost />
          <DialogHost />
          <Nav
            section={section}
            setSection={setSection}
            credits={isAuthenticated ? credits : null}
          />

          {/* One shared entrance for every section switch — keyed remount re-runs it. */}
          <div key={section} className="ed-section-enter">
          {section === "home" && (
            <>
              <Hero
                onAdopt={() => setSection("my pet")}
                onExplore={() => setSection("community")}
                onNavigate={(s: string) => setSection(s)}
                txToday={platformStats?.tx_today || 0}
              />
              {/* Season cluster — banner, check-in and the protocol footnote
                  read as ONE tight block (10px seams, no dead voids); the big
                  home-beat rhythm resumes below the footnote row. */}
              <div style={{ marginBottom: 10 }}>
                <SeasonBanner seasonPoints={seasonPoints} />
              </div>
              <CheckinCard isAuthenticated={isAuthenticated} onPointsChanged={refreshUser} />
              <Reveal dir="up" delay={180} className="home-section-pad home-beat-half" style={{ padding: "0 40px", maxWidth: 1060, margin: "0 auto" }}>
                {hasRealStats ? (
                  <Stats stats={stats} />
                ) : (
                  // The old PROTOCOL / YOUR DATA two-card Stats split — now ONE
                  // designed colophon row closing the season cluster (hairline
                  // rule + mono footnotes) instead of lines floating in a void.
                  <div style={{
                    display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px 12px",
                    borderTop: "1px solid var(--ed-hair, rgba(33,26,18,.13))", paddingTop: 12,
                  }}>
                    <span style={{
                      fontFamily: "var(--ed-m)", fontSize: 12, color: "#7A6E5A",
                      fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase",
                    }}>
                      Protocol — PetClaw v1 · open data standard
                    </span>
                    <span aria-hidden style={{ color: "#B9AB8F", fontSize: 12 }}>◆</span>
                    <span style={{
                      fontFamily: "var(--ed-m)", fontSize: 12, color: "#7A6E5A",
                      fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase",
                    }}>
                      Your data — yours · export &amp; delete anytime
                    </span>
                  </div>
                )}
              </Reveal>
              {/* (Recent Activity feed removed — RaisePitch's "LIVE · LAST 7 DAYS"
                  ticker below is the ONE live activity strip on the home page.) */}
              {/* Pitch: why raise + how to earn (closes the gap between Hero and Pricing) */}
              <div className="home-beat-join">
                <RaisePitch onNavigate={setSection} />
              </div>
              {/* How the agent infrastructure orchestrates (Trinity-style explainer) */}
              <div className="home-beat-join">
                <OrchestrationExplainer onTry={() => setSection("workbench")} />
              </div>
              <Pricing
                isAuthenticated={isAuthenticated}
                onCreditsChange={handleCreditsChange}
              />
            </>
          )}

      {/* Season Rewards — the merged "my status + earn + compete + connect" hub.
          The old standalone Leaderboard tab folds in here under the tabs. */}
      {section === "season" && (
        <SeasonRewardsHub banner={<SeasonBanner seasonPoints={seasonPoints} />} />
      )}

      {section === "my pet" && (
        <WalletGate section="my pet">
          <Suspense fallback={<Loader />}>
            <MyPetEditorial onNavigate={setSection} />
          </Suspense>
        </WalletGate>
      )}

      {section === "chat" && (
        <WalletGate section="chat">
          <Suspense fallback={<Loader />}>
            <ChatEditorial onNavigate={setSection} />
          </Suspense>
        </WalletGate>
      )}

      {section === "create" && (
        <Suspense fallback={<Loader />}>
          {/* Same Studio as /studio — PetStudioPro handles its own demo (no-wallet)
              + signed-in modes, so "Create" no longer dead-ends at a bare wallet gate. */}
          <PetStudioPro />
        </Suspense>
      )}

      {section === "community" && (
        <div style={{ paddingTop: 90 }}>
          {/* Per the design concept, Community opens straight into the remix wall
              (SocialGallery). The old dark "THE PACK — not a wall of images"
              hero was off-mockup and self-contradictory, so it's removed. */}
          <PetOfTheWeek />
          <WalletGate section="community">
            <Suspense fallback={<Loader />}>
              <SocialGallery />
            </Suspense>
          </WalletGate>
        </div>
      )}

      {/* Battle/Adventure retired from the live UI — section de-linked.
          Components (Adventure/Arena/PveMode) kept in the repo for a future relaunch. */}

      {section === "agent" && (
        <WalletGate section="agent">
          <Suspense fallback={<Loader />}>
            <AgentDashboard />
          </Suspense>
        </WalletGate>
      )}

      {/* Agent Office — the flagship Mission-Control dashboard: 5 pillars, kanban,
          staff roster, cron schedules + a live dispatch bar. Owner-only-friendly. */}
      {section === "office" && (
        <WalletGate section="office">
          <Suspense fallback={<Loader />}>
            <AgentOffice />
          </Suspense>
        </WalletGate>
      )}

      {/* Agent Workbench — give your pet a goal, watch the plan-execute loop run.
          Reached from the Home OrchestrationExplainer ("Run the loop") + ?section=workbench. */}
      {section === "workbench" && (
        <WalletGate section="workbench">
          <Suspense fallback={<Loader />}>
            <AgentWorkbench />
          </Suspense>
        </WalletGate>
      )}

      {section === "sovereignty" && (
        <WalletGate section="sovereignty">
          <Suspense fallback={<Loader />}>
            <SovereigntyDashboard />
          </Suspense>
        </WalletGate>
      )}

      {section === "worldcup" && (
        <div style={{ paddingTop: 96, paddingLeft: 20, paddingRight: 20 }}>
          <WalletGate section="worldcup">
            <Suspense fallback={<Loader />}>
              <WorldCupPet />
            </Suspense>
          </WalletGate>
        </div>
      )}

      {/* Catch merged into Cards as a tab — "catch" stays a valid section key so
          old /?section=catch deep links (and in-app onNavigate("catch") senders)
          land on the Cards screen with the Catch tab pre-selected. */}
      {(section === "cards" || section === "catch") && (
        <div style={{ paddingTop: 96, paddingLeft: 20, paddingRight: 20 }}>
          <WalletGate section="cards">
            <Suspense fallback={<Loader />}>
              <CardDeck onNavigate={setSection} initialTab={section === "catch" ? "catch" : undefined} />
            </Suspense>
          </WalletGate>
        </div>
      )}
      </div>

      {/* Guest-tour DEMO banner — must live OUTSIDE the animated section
          outlet above: the outlet's entrance animation (fill-mode both) keeps
          a transform applied forever, which turns it into the containing
          block for position:fixed children. Rendered inside it (as WalletGate
          used to), the "fixed" banner anchored to the SECTION bottom and
          covered the tour page's closing "Connect wallet to adopt" CTA. */}
      {showTourBanner && <TourBanner />}

      {/* Footer — only show in app mode */}
      <footer style={{ padding: "48px 24px 36px", textAlign: "center", borderTop: "1px solid var(--ed-hair, rgba(33,26,18,.13))", background: "rgba(33,26,18,0.02)" }}>
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 10, marginBottom: 20 }}>
          <span style={{
            fontFamily: "var(--ed-disp)", fontSize: 22, fontWeight: 800,
            color: "#211A12", letterSpacing: "-0.02em",
          }}>
            MY AI PET
          </span>
          <span style={{
            fontSize: 13, padding: "4px 11px", borderRadius: 999,
            background: "transparent",
            color: "#9A4E1E", fontFamily: "var(--ed-m)", fontWeight: 700,
            border: "1px solid rgba(154,78,30,0.4)",
            letterSpacing: "0.12em", textTransform: "uppercase",
          }}>
            Companion Protocol
          </span>
        </div>
        <p style={{
          fontFamily: "var(--ed-body)", fontSize: 16, color: "#5C5140",
          maxWidth: 560, margin: "0 auto 26px", lineHeight: 1.6, fontWeight: 500,
        }}>
          Your AI. Your data. Your companion. An open protocol for AI pets you actually own — across every surface you use.
        </p>

        {/* Social buttons */}
        <div style={{ display: "flex", justifyContent: "center", gap: 12, marginBottom: 28, flexWrap: "wrap" }}>
          <a href="https://x.com/myaipets" target="_blank" rel="noopener noreferrer" style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            padding: "12px 22px", borderRadius: 12,
            background: "#211A12", color: "#FBF6EC",
            border: "none",
            fontFamily: "var(--ed-body)", fontSize: 15, fontWeight: 700,
            textDecoration: "none", transition: "transform 0.15s, box-shadow 0.15s",
            boxShadow: "0 12px 24px -16px rgba(33,26,18,.7)",
          }}
            onMouseOver={(e) => { e.currentTarget.style.transform = "translateY(-1px)"; }}
            onMouseOut={(e) => { e.currentTarget.style.transform = ""; }}
          >
            <span style={{ fontSize: 18, fontWeight: 900 }}>𝕏</span>
            Twitter
          </a>
          {/* GitHub button — re-enable AFTER pushing /public-repo/ to a NEW GitHub org
              (NOT the personal myaipetdev or junheony account). Replace PETCLAW-ORG/petclaw-sdk
              with the real org/repo, then uncomment.

          <a href="https://github.com/PETCLAW-ORG/petclaw-sdk" target="_blank" rel="noopener noreferrer" style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            padding: "12px 22px", borderRadius: 12,
            background: "#FBF6EC", color: "#211A12",
            border: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
            fontFamily: "var(--ed-body)", fontSize: 15, fontWeight: 700,
            textDecoration: "none", transition: "all 0.2s",
          }}>
            <span style={{ fontSize: 16 }}>⌥</span>
            GitHub
          </a>
          */}
          <a href="/?section=sovereignty#petclaw-extension" style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            padding: "12px 22px", borderRadius: 12,
            background: "linear-gradient(180deg,#F49B2A,#E27D0C)", color: "#211A12",
            border: "none",
            fontFamily: "var(--ed-body)", fontSize: 15, fontWeight: 700,
            textDecoration: "none", transition: "transform 0.15s, box-shadow 0.15s",
            boxShadow: "0 12px 22px -12px rgba(226,125,12,.7)",
          }}
            onMouseOver={(e) => { e.currentTarget.style.transform = "translateY(-1px)"; }}
            onMouseOut={(e) => { e.currentTarget.style.transform = ""; }}
          >
            <span>⬇</span>
            Chrome Extension Setup
          </a>
        </div>

        {/* Legal & info links */}
        <div style={{
          display: "flex", justifyContent: "center", gap: 18,
          marginBottom: 14, flexWrap: "wrap",
        }}>
          {[
            { href: "/skills", label: "Skills" },
            { href: "/stats", label: "Stats" },
            { href: "/api-docs", label: "API Docs" },
            { href: "/terms", label: "Terms" },
            { href: "/privacy", label: "Privacy" },
            { href: "/contracts", label: "Contracts" },
            { href: "/architecture", label: "Architecture" },
          ].map(l => (
            <a key={l.href} href={l.href} className="ed-underline-slide" style={{
              fontFamily: "var(--ed-m)", fontSize: 14, fontWeight: 700,
              letterSpacing: "0.08em", textTransform: "uppercase",
              color: "#9A7B4E", textDecoration: "none",
            }}>{l.label}</a>
          ))}
        </div>

        <div style={{
          fontFamily: "var(--ed-m)", fontSize: 14, color: "#9A7B4E",
          fontWeight: 700, letterSpacing: "0.06em", marginBottom: 12,
        }}>
          © 2026 My AI Pet Protocol · Raise · Bond · Remember
        </div>

        {/* Disclaimer */}
        <div style={{
          maxWidth: 680, margin: "0 auto",
          fontFamily: "var(--ed-body)", fontSize: 14,
          color: "#8A7E68", lineHeight: 1.6, fontWeight: 400,
        }}>
          Engagement points are non-financial loyalty credits, not securities. No token is issued —
          the economy is points-only loyalty. Nothing here is financial advice.
        </div>
      </footer>
    </div>
  );
}
