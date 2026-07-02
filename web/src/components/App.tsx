"use client";

import { useState, useEffect, useCallback, useRef, lazy, Suspense } from "react";
import { useAccount } from "wagmi";

import { api, getAuthHeaders } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import useCountUp from "@/hooks/useCountUp";

import Nav from "@/components/Nav";
import Icon from "@/components/Icon";
import Hero from "@/components/Hero";
import Stats from "@/components/Stats";
import Feed from "@/components/Feed";
import Pricing from "@/components/Pricing";
import OrchestrationExplainer from "@/components/OrchestrationExplainer";
import RaisePitch from "@/components/RaisePitch";
import WalletGate from "@/components/WalletGate";
import ToastHost from "@/components/Toast";
import DialogHost from "@/components/Dialog";
import { seasonTier } from "@/lib/season";
import SeasonRewardsHub from "@/components/SeasonRewardsHub";
import PetOfTheWeek from "@/components/PetOfTheWeek";

const MyPetEditorial = lazy(() => import("@/components/editorial/MyPetEditorial"));
const ChatEditorial = lazy(() => import("@/components/editorial/ChatEditorial"));
const PetGenerate = lazy(() => import("@/components/PetGenerate"));
const SocialGallery = lazy(() => import("@/components/SocialGallery"));
const Leaderboard = lazy(() => import("@/components/Leaderboard"));
const AgentDashboard = lazy(() => import("@/components/AgentDashboard"));
const AgentWorkbench = lazy(() => import("@/components/AgentWorkbench"));
const SovereigntyDashboard = lazy(() => import("@/components/SovereigntyDashboard"));
const PetStudioPro = lazy(() => import("@/components/PetStudioPro"));
const WorldCupPet = lazy(() => import("@/components/WorldCupPet")); // time-boxed World Cup 2026 event
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
        color: "#9A7B4E", fontFamily: "var(--ed-m)", fontSize: 10, fontWeight: 700,
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
    <div className="mp-enter mp-enter-2" style={{ padding: "0 40px", maxWidth: 1060, margin: "0 auto 0" }}>
      <div style={{
        borderRadius: 16, padding: "14px 20px", marginBottom: 8,
        background: "#FBF6EC", border: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
        boxShadow: "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))",
        display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <span style={{
            width: 26, height: 26, borderRadius: 8, flexShrink: 0,
            background: "#BE4F28", border: "none",
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            fontFamily: "var(--ed-m)", fontWeight: 700, fontSize: 11, color: "#FFF8EE",
          }}>1</span>
          <div>
            <div style={{ fontFamily: "var(--ed-disp)", fontWeight: 700, fontSize: 14, color: "#211A12" }}>
              Daily Check-in
            </div>
            <div style={{ fontFamily: "var(--ed-m)", fontSize: 10, color: "#9A7B4E" }}>
              {checkedIn ? `Day ${streak} streak active 🔥` : "Check in to earn Season Rewards points"}
            </div>
          </div>
        </div>

        {/* Day pills */}
        <div style={{ display: "flex", gap: 5, flex: 1, flexWrap: "wrap" }}>
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
                    fontFamily: "var(--ed-m)", fontSize: 9, fontWeight: 700, color: "#BE4F28",
                    whiteSpace: "nowrap", pointerEvents: "none",
                    animation: "mpEnter 420ms cubic-bezier(0.2,0.8,0.2,1) both",
                  }}>
                    +{awarded}
                  </div>
                )}
                <div style={{ fontFamily: "var(--ed-m)", fontSize: 9, color: done ? "#FFF8EE" : isToday ? "#BE4F28" : "#9A7B4E", fontWeight: 700 }}>
                  {done ? "✓" : `D${day}`}
                </div>
                <div style={{ fontFamily: "var(--ed-m)", fontSize: 8, color: done ? "#FCE9CF" : "#9A7B4E" }}>
                  +{r}
                </div>
              </div>
            );
          })}
        </div>

        {msg && <span style={{ fontFamily: "var(--ed-m)", fontSize: 11, color: "#BE4F28", fontWeight: 700, animation: "slideIn .25s ease both" }}>{msg}</span>}

        {isAuthenticated ? (
          <button
            className="ed-press"
            onClick={doCheckin}
            disabled={checkedIn || loading}
            style={{
              padding: "9px 18px", borderRadius: 11, flexShrink: 0,
              background: checkedIn ? "#F5EFE2" : "linear-gradient(180deg,#F49B2A,#E27D0C)",
              color: checkedIn ? "#9A8A70" : "#FFF8EE",
              border: checkedIn ? "1px solid var(--ed-hair, rgba(33,26,18,.13))" : "none",
              boxShadow: checkedIn ? "none" : "0 10px 20px -12px rgba(226,125,12,.7)",
              fontFamily: "var(--ed-body)", fontSize: 12.5, fontWeight: 700,
              cursor: checkedIn ? "default" : "pointer",
            }}
          >
            {loading ? "..." : checkedIn ? "Done ✓" : "Check In"}
          </button>
        ) : (
          <span style={{ fontFamily: "var(--ed-m)", fontSize: 10, color: "#9A7B4E" }}>Connect wallet to earn</span>
        )}
      </div>
    </div>
  );
}

// ── Season 1 Rewards Banner ──
function SeasonBanner({ seasonPoints }: { seasonPoints: number }) {
  const SEASON_START = new Date("2026-07-01T00:00:00Z").getTime();
  const SEASON_END = new Date("2026-08-01T00:00:00Z").getTime();
  const SEASON_TOTAL = SEASON_END - SEASON_START;

  const [now, setNow] = useState(Date.now());

  useEffect(() => {
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

  const notStarted = now < SEASON_START;
  const seasonOver = now >= SEASON_END;
  // Before the season opens, count down to the START; once running, to the END.
  const remaining = Math.max(0, (notStarted ? SEASON_START : SEASON_END) - now);
  const days = Math.floor(remaining / 86_400_000);
  const hours = Math.floor((remaining % 86_400_000) / 3_600_000);
  const minutes = Math.floor((remaining % 3_600_000) / 60_000);
  const seconds = Math.floor((remaining % 60_000) / 1000);
  const progress = Math.min(1, Math.max(0, (now - SEASON_START) / SEASON_TOTAL));
  // Tier standing — climbs with the user's loyalty points (non-financial status).
  const { tier, next, toNext, progress: tierProgress } = seasonTier(seasonPoints);

  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <div className="mp-enter mp-enter-1" style={{ padding: "0 40px", maxWidth: 1060, margin: "0 auto 0" }}>
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
        {/* Left: title + standing — with a perforated cream tear line after it */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, paddingRight: 16, borderRight: "2px dashed rgba(252,233,207,0.4)" }}>
          <Icon name="trophy" size={26} />
          <div style={{ minWidth: 0 }}>
            <div className="season-banner-title" style={{
              fontFamily: "var(--ed-disp)", fontWeight: 800, fontSize: 18,
              color: "#FFF8EE", letterSpacing: "-0.02em", whiteSpace: "nowrap",
            }}>
              Season 1 Rewards
            </div>
            <div style={{
              fontFamily: "var(--ed-m)", fontSize: 11, color: "rgba(252,233,207,0.85)",
              marginTop: 2, whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 5,
            }}>
              <span style={{ fontWeight: 700, color: "#FFF8EE" }}>{tier.name}</span>
              <span>{next ? `· ${toNext.toLocaleString()} to ${next.name}` : "· max tier"}</span>
            </div>
          </div>
        </div>

        {/* Center: countdown (or a season-over badge once it ends) */}
        {seasonOver ? (
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            fontFamily: "var(--ed-disp)", fontWeight: 800, fontSize: 14, color: "#FFF8EE",
          }}>
            Season 1 wrapped · <span style={{ opacity: 0.75, fontWeight: 700 }}>Season 2 soon</span>
          </div>
        ) : (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
          {notStarted && (
            <div style={{ fontFamily: "var(--ed-m)", fontWeight: 700, fontSize: 10.5, color: "#FFF8EE", whiteSpace: "nowrap", letterSpacing: "0.1em", textTransform: "uppercase" }}>
              STARTS JUL 1 — GET READY
            </div>
          )}
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
              <div style={{ fontFamily: "var(--ed-m)", fontSize: 8, color: "rgba(252,233,207,0.8)", marginTop: 3 }}>
                {t.label}
              </div>
            </div>
          ))}
          </div>
        </div>
        )}

        {/* Right: points + progress */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, minWidth: 120 }}>
          <div style={{ fontFamily: "var(--ed-m)", fontSize: 11, color: "rgba(252,233,207,0.85)", whiteSpace: "nowrap" }}>
            {seasonPoints > 0
              ? <>
                  {/* Change-flash uses a cream pulse here — the spec's terracotta
                      flash would vanish on this terracotta ticket. */}
                  <span style={{
                    fontWeight: 700, color: "#FFF8EE",
                    padding: "1px 5px", margin: "-1px -5px", borderRadius: 6,
                    background: ptsFlash ? "rgba(252,233,207,0.28)" : "transparent",
                    transition: "background 250ms ease",
                  }}>{displayPoints.toLocaleString()}</span> pts
                </>
              : <>Your Points: <span style={{ fontWeight: 700, color: "#FFF8EE" }}>0</span></>
            }
          </div>
          <div style={{ width: "100%", height: 8, background: "rgba(252,233,207,0.28)", borderRadius: 999, border: "none", overflow: "hidden" }}>
            <div style={{
              height: "100%",
              background: "#FFF8EE",
              width: `${(tierProgress * 100).toFixed(1)}%`,
              transition: "width 0.6s ease",
            }} />
          </div>
          <div style={{ fontFamily: "var(--ed-m)", fontSize: 8, color: "rgba(252,233,207,0.8)" }}>
            {next ? `${toNext.toLocaleString()} pts to ${next.name}` : "Top tier reached"}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const { isConnected } = useAccount();
  const { user, isAuthenticated, refreshUser } = useAuth();

  // Section is URL-aware via ?section= so cross-page links land correctly.
  // (Studio is a separate route and routes back here with ?section=...)
  const [section, setSection] = useState(() => {
    if (typeof window === "undefined") return "home";
    const fromUrl = new URLSearchParams(window.location.search).get("section");
    // Leaderboard folded into the Season Rewards hub — normalize old links/tabs.
    // ("airdrop" stays the internal section/route key; the UI label is "Season Rewards".)
    if (fromUrl === "leaderboard") return "airdrop";
    return fromUrl || "home";
  });
  // Keep the URL in sync when the user clicks nav inside the SPA.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (section === "home") params.delete("section");
    else params.set("section", section);
    const next = params.toString();
    const url = next ? `/?${next}` : "/";
    window.history.replaceState({}, "", url);
    // Section switches used to inherit the previous tab's scroll offset (users
    // landed mid-page/at the footer). Reset to top; the Pricing deep-links
    // below fire 100–150ms later, so they still win over this reset.
    window.scrollTo({ top: 0 });
  }, [section]);

  // Landing on Pricing from /studio: Nav's "Get More Credits" and Studio's
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
  const [activities, setActivities] = useState<any[]>([]);
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

  // Request tokens so a slow poll response can't overwrite a newer one out of order.
  const statsReqRef = useRef(0);
  const activityReqRef = useRef(0);

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

  const fetchActivity = useCallback(async () => {
    const reqId = ++activityReqRef.current;
    try {
      // Public, REAL activity (no admin gate, no mock). The old
      // api.analytics.activity is admin-only, so every visitor 401'd and the
      // "Live On-Chain Activity" strip stayed empty for all real users.
      const r = await fetch("/api/activity/recent?limit=12");
      if (!r.ok) return;
      const d = await r.json();
      if (reqId !== activityReqRef.current) return; // superseded by a newer poll
      if (Array.isArray(d?.items) && d.items.length > 0) setActivities(d.items);
    } catch { /* no mock fallback — an empty feed is honest */ }
  }, []);

  useEffect(() => {
    // Stats/Feed only render on Home — don't poll (and write state) on other tabs.
    if (section !== "home") return;
    fetchStats();
    fetchActivity();
    const s = setInterval(fetchStats, 15000);
    const a = setInterval(fetchActivity, 6000);
    return () => { clearInterval(s); clearInterval(a); };
  }, [section, fetchStats, fetchActivity]);

  // Never show "0" in a social-proof slot — fall back to qualitative,
  // always-true facts when stats are unavailable or still zero.
  const stats = (platformStats && ((platformStats.total_users ?? 0) >= 100 || (platformStats.total_generations ?? 0) >= 100))
    ? [
        { label: "Pets Adopted", value: (platformStats.total_users ?? 0).toLocaleString(), raw: platformStats.total_users ?? 0, animated: true, sub: "Companions raised" },
        { label: "AI Content Created", value: (platformStats.total_generations ?? 0).toLocaleString(), raw: platformStats.total_generations ?? 0, animated: true, sub: "Videos & Images" },
      ]
    : [
        { label: "Protocol", value: "PetClaw v1", sub: "Open data standard" },
        { label: "Your data", value: "Yours", sub: "Export & delete anytime" },
      ];

  const handleCreditsChange = (newCredits: any) => {
    if (typeof newCredits === "number") setCredits(newCredits);
    else refreshUser();
  };

  return (
    <div style={{ minHeight: "100vh", background: "#ECE4D4", color: "#211A12", position: "relative", overflow: "hidden" }}>
      <style>{`
        * { margin: 0; padding: 0; box-sizing: border-box }
        ::selection { background: rgba(190,79,40,0.18) }
        textarea::placeholder { color: rgba(33,26,18,0.25) }
        @media (max-width: 768px) {
          .desktop-grid { grid-template-columns: 1fr !important; }
          .desktop-two-col { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 640px) {
          .home-section-pad { padding-left: 16px !important; padding-right: 16px !important; }
          .season-banner { padding: 10px 16px !important; }
          .season-banner-title { font-size: 12px !important; }
          .season-banner-countdown { gap: 4px !important; }
          .season-banner-countdown > div > div:first-child { font-size: 14px !important; }
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
                txToday={platformStats?.tx_today || 0}
              />
              <SeasonBanner seasonPoints={seasonPoints} />
              <CheckinCard isAuthenticated={isAuthenticated} onPointsChanged={refreshUser} />
              <div className="home-section-pad mp-enter mp-enter-3" style={{ padding: "0 40px 30px", maxWidth: 1060, margin: "0 auto" }}>
                <Stats stats={stats} />
              </div>
              {activities.length > 0 && (
                <div className="home-section-pad mp-enter mp-enter-4" style={{ padding: "0 40px 30px", maxWidth: 1060, margin: "0 auto" }}>
                  <Feed activities={activities} />
                </div>
              )}
              {/* Pitch: why raise + how to earn (closes the gap between Hero and Pricing) */}
              <RaisePitch onNavigate={setSection} />
              {/* How the agent infrastructure orchestrates (Trinity-style explainer) */}
              <OrchestrationExplainer onTry={() => setSection("workbench")} />
              <Pricing
                isAuthenticated={isAuthenticated}
                onCreditsChange={handleCreditsChange}
              />
            </>
          )}

      {/* Season Rewards — the merged "my status + earn + compete + connect" hub.
          The old standalone Leaderboard tab folds in here under the tabs. */}
      {(section === "airdrop" || section === "leaderboard") && (
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
          {/* Per the design 시안, Community opens straight into the remix wall
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
            fontSize: 10.5, padding: "4px 11px", borderRadius: 999,
            background: "transparent",
            color: "#9A4E1E", fontFamily: "var(--ed-m)", fontWeight: 700,
            border: "1px solid rgba(154,78,30,0.4)",
            letterSpacing: "0.12em", textTransform: "uppercase",
          }}>
            CompanionFi
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
          <a href="/petclaw-extension.zip" download="myaipet-extension.zip" style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            padding: "12px 22px", borderRadius: 12,
            background: "linear-gradient(180deg,#F49B2A,#E27D0C)", color: "#FFF8EE",
            border: "none",
            fontFamily: "var(--ed-body)", fontSize: 15, fontWeight: 700,
            textDecoration: "none", transition: "transform 0.15s, box-shadow 0.15s",
            boxShadow: "0 12px 22px -12px rgba(226,125,12,.7)",
          }}
            onMouseOver={(e) => { e.currentTarget.style.transform = "translateY(-1px)"; }}
            onMouseOut={(e) => { e.currentTarget.style.transform = ""; }}
          >
            <span>⬇</span>
            Chrome Extension
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
            <a key={l.href} href={l.href} style={{
              fontFamily: "var(--ed-m)", fontSize: 11.5, fontWeight: 700,
              letterSpacing: "0.08em", textTransform: "uppercase",
              color: "#9A7B4E", textDecoration: "none",
            }}>{l.label}</a>
          ))}
        </div>

        <div style={{
          fontFamily: "var(--ed-m)", fontSize: 12, color: "#9A7B4E",
          fontWeight: 700, letterSpacing: "0.06em", marginBottom: 12,
        }}>
          © 2026 My AI Pet Protocol · Raise · Bond · Remember
        </div>

        {/* Disclaimer */}
        <div style={{
          maxWidth: 680, margin: "0 auto",
          fontFamily: "var(--ed-body)", fontSize: 11.5,
          color: "#8A7E68", lineHeight: 1.6, fontWeight: 400,
        }}>
          Engagement points are non-financial loyalty credits, not securities. No token is issued —
          the economy is points-only loyalty. Nothing here is financial advice.
        </div>
      </footer>
    </div>
  );
}
