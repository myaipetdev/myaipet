"use client";

import { useState, useEffect, useCallback, useRef, lazy, Suspense } from "react";
import { useAccount } from "wagmi";

import { api } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";

import Nav from "@/components/Nav";
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
import CommunityHighlights from "@/components/CommunityHighlights";
import PetOfTheWeek from "@/components/PetOfTheWeek";

const PetProfile = lazy(() => import("@/components/PetProfile"));
const PetGenerate = lazy(() => import("@/components/PetGenerate"));
const SocialGallery = lazy(() => import("@/components/SocialGallery"));
const Leaderboard = lazy(() => import("@/components/Leaderboard"));
const AgentDashboard = lazy(() => import("@/components/AgentDashboard"));
const AgentWorkbench = lazy(() => import("@/components/AgentWorkbench"));
const SovereigntyDashboard = lazy(() => import("@/components/SovereigntyDashboard"));
const PetStudioPro = lazy(() => import("@/components/PetStudioPro"));
const WorldCupPet = lazy(() => import("@/components/WorldCupPet")); // time-boxed World Cup 2026 event
const CardDeck = lazy(() => import("@/components/CardDeck")); // TCG trading cards
const CatCatch = lazy(() => import("@/components/CatCatch")); // catch real street cats

// ── Grid Background ──
function Grid() {
  return (
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0, opacity: 0.03 }}>
      <svg width="100%" height="100%">
        <defs>
          <pattern id="g" width="50" height="50" patternUnits="userSpaceOnUse">
            <path d="M 50 0 L 0 0 0 50" fill="none" stroke="#1a1a2e" strokeWidth="0.5" />
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
        boxShadow: "0 6px 20px rgba(0,0,0,0.10)",
        animation: "loaderFloat 2.4s ease-in-out infinite",
      }} />
      <div style={{ marginTop: 14, color: "rgba(26,26,46,0.4)", fontFamily: "mono", fontSize: 12 }}>
        Loading…
      </div>
      <style>{`@keyframes loaderFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}`}</style>
    </div>
  );
}

// ── Daily Check-in Card ──
function CheckinCard({ isAuthenticated }: { isAuthenticated: boolean }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;
    fetch("/api/checkin").then(r => (r.ok ? r.json() : null)).then(d => d && setData(d)).catch(() => {});
  }, [isAuthenticated]);

  const doCheckin = async () => {
    if (!isAuthenticated || loading || data?.checkedInToday) return;
    setLoading(true);
    try {
      const res = await fetch("/api/checkin", { method: "POST" });
      const d = await res.json();
      if (d.streak) { setData(d); setMsg(`+${d.awarded} pts! Day ${d.streak} streak 🔥`); }
      else setMsg(d.error || "Already checked in");
    } catch { setMsg("Failed"); }
    setLoading(false);
    setTimeout(() => setMsg(null), 3000);
  };

  const rewards = [5, 10, 15, 20, 25, 30, 50];
  const streak = data?.streak ?? 0;
  const checkedIn = data?.checkedInToday ?? false;

  return (
    <div style={{ padding: "0 40px", maxWidth: 1060, margin: "0 auto 0" }}>
      <div style={{
        borderRadius: 14, padding: "14px 20px", marginBottom: 8,
        background: "rgba(0,0,0,0.025)", border: "1px solid rgba(0,0,0,0.06)",
        display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <span style={{ fontSize: 18 }}>📅</span>
          <div>
            <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 13, color: "#1a1a2e" }}>
              Daily Check-in
            </div>
            <div style={{ fontFamily: "monospace", fontSize: 10, color: "rgba(26,26,46,0.4)" }}>
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
            return (
              <div key={day} style={{
                padding: "4px 8px", borderRadius: 8, textAlign: "center",
                background: done ? "rgba(245,158,11,0.12)" : isToday ? "rgba(245,158,11,0.06)" : "rgba(0,0,0,0.03)",
                border: `1px solid ${done ? "rgba(245,158,11,0.3)" : isToday ? "rgba(245,158,11,0.2)" : "rgba(0,0,0,0.05)"}`,
                minWidth: 36,
              }}>
                <div style={{ fontFamily: "monospace", fontSize: 9, color: done ? "#b45309" : isToday ? "#d97706" : "rgba(26,26,46,0.3)", fontWeight: 700 }}>
                  {done ? "✓" : `D${day}`}
                </div>
                <div style={{ fontFamily: "monospace", fontSize: 8, color: done ? "#d97706" : "rgba(26,26,46,0.25)" }}>
                  +{r}
                </div>
              </div>
            );
          })}
        </div>

        {msg && <span style={{ fontFamily: "monospace", fontSize: 11, color: "#16a34a" }}>{msg}</span>}

        {isAuthenticated ? (
          <button
            onClick={doCheckin}
            disabled={checkedIn || loading}
            style={{
              padding: "8px 18px", borderRadius: 10, border: "none", flexShrink: 0,
              background: checkedIn ? "rgba(0,0,0,0.05)" : "linear-gradient(135deg,#f59e0b,#d97706)",
              color: checkedIn ? "rgba(26,26,46,0.35)" : "#fff",
              fontFamily: "'Space Grotesk',sans-serif", fontSize: 12, fontWeight: 700,
              cursor: checkedIn ? "default" : "pointer",
            }}
          >
            {loading ? "..." : checkedIn ? "Done ✓" : "Check In"}
          </button>
        ) : (
          <span style={{ fontFamily: "monospace", fontSize: 10, color: "rgba(26,26,46,0.3)" }}>Connect wallet to earn</span>
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
    <div className="mp-enter" style={{ padding: "0 40px", maxWidth: 1060, margin: "0 auto 0" }}>
      <div
        className="mp-lift"
        style={{
          background: "linear-gradient(135deg, #f59e0b 0%, #d97706 40%, #b45309 100%)",
          borderRadius: 16,
          padding: "16px 26px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
          marginBottom: 8,
          boxShadow: "0 4px 24px rgba(245,158,11,0.22), inset 0 1px 0 rgba(255,255,255,0.20)",
          position: "relative",
          overflow: "hidden",
          cursor: "default",
        }}
      >
        {/* Decorative shimmer */}
        <div style={{
          position: "absolute", inset: 0, opacity: 0.07,
          background: "linear-gradient(110deg, transparent 30%, rgba(255,255,255,0.6) 50%, transparent 70%)",
          pointerEvents: "none",
        }} />

        {/* Left: title + prize */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, zIndex: 1, minWidth: 0 }}>
          <span style={{ fontSize: 28, lineHeight: 1 }}>🏆</span>
          <div style={{ minWidth: 0 }}>
            <div style={{
              fontFamily: "'Space Grotesk',sans-serif", fontWeight: 800, fontSize: 17,
              color: "#fff", letterSpacing: "-0.02em", whiteSpace: "nowrap",
            }}>
              Season 1 Rewards
            </div>
            <div style={{
              fontFamily: "monospace", fontSize: 11, color: "rgba(255,255,255,0.85)",
              marginTop: 2, whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 5,
            }}>
              <span style={{ fontSize: 13 }}>{tier.emoji}</span>
              <span style={{ fontWeight: 700, color: "#fff" }}>{tier.name}</span>
              <span style={{ opacity: 0.8 }}>{next ? `· ${toNext.toLocaleString()} to ${next.name}` : "· max tier"}</span>
            </div>
          </div>
        </div>

        {/* Center: countdown (or a season-over badge once it ends) */}
        {seasonOver ? (
          <div style={{
            display: "flex", alignItems: "center", gap: 8, zIndex: 1,
            fontFamily: "'Space Grotesk',sans-serif", fontWeight: 800, fontSize: 14, color: "#fff",
          }}>
            🏁 Season 1 wrapped · <span style={{ opacity: 0.85, fontWeight: 700 }}>Season 2 soon</span>
          </div>
        ) : (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, zIndex: 1 }}>
          {notStarted && (
            <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 11, color: "#fff", whiteSpace: "nowrap" }}>
              🚀 Starts Jul 1 — get ready
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {[
            { val: pad(days), label: "D" },
            { val: pad(hours), label: "H" },
            { val: pad(minutes), label: "M" },
            { val: pad(seconds), label: "S" },
          ].map((t, i) => (
            <div key={i} style={{ textAlign: "center" }}>
              <div style={{
                fontFamily: "monospace", fontWeight: 700, fontSize: 18, color: "#fff",
                lineHeight: 1, minWidth: 28,
                background: "rgba(0,0,0,0.15)", borderRadius: 6, padding: "4px 5px",
              }}>
                {t.val}
              </div>
              <div style={{ fontFamily: "monospace", fontSize: 8, color: "rgba(255,255,255,0.55)", marginTop: 2 }}>
                {t.label}
              </div>
            </div>
          ))}
          </div>
        </div>
        )}

        {/* Right: points + progress */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, zIndex: 1, minWidth: 120 }}>
          <div style={{
            fontFamily: "monospace", fontSize: 11, color: "rgba(255,255,255,0.8)",
            whiteSpace: "nowrap",
          }}>
            {seasonPoints > 0
              ? <><span style={{ fontWeight: 700, color: "#fff" }}>{seasonPoints.toLocaleString()}</span> pts</>
              : <>Your Points: <span style={{ fontWeight: 700, color: "#fff" }}>0</span></>
            }
          </div>
          <div style={{ width: "100%", height: 5, background: "rgba(0,0,0,0.18)", borderRadius: 3, overflow: "hidden" }}>
            <div style={{
              height: "100%", borderRadius: 3,
              background: "linear-gradient(90deg, #fde68a, #fff)",
              width: `${(tierProgress * 100).toFixed(1)}%`,
              transition: "width 0.6s ease",
            }} />
          </div>
          <div style={{ fontFamily: "monospace", fontSize: 8, color: "rgba(255,255,255,0.5)" }}>
            {next ? `${toNext.toLocaleString()} pts to ${next.name}` : "👑 Top tier reached"}
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
  }, [section]);
  const [activities, setActivities] = useState<any[]>([]);
  const [platformStats, setPlatformStats] = useState<any>(null);
  const [credits, setCredits] = useState(0);
  const [seasonPoints, setSeasonPoints] = useState(0);

  useEffect(() => {
    if (user) {
      setCredits(user.credits);
      // `airdrop_points` is the persisted API/DB field; surfaced as Season Rewards points.
      if (user.airdrop_points) setSeasonPoints(user.airdrop_points);
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
    <div style={{ minHeight: "100vh", background: "#faf7f2", color: "#1a1a2e", position: "relative", overflow: "hidden" }}>
      <style>{`
        * { margin: 0; padding: 0; box-sizing: border-box }
        ::selection { background: rgba(251,191,36,0.2) }
        ::-webkit-scrollbar { width: 5px }
        ::-webkit-scrollbar-track { background: transparent }
        ::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.08); border-radius: 3px }
        @keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.3 } }
        @keyframes slideIn { from { opacity: 0; transform: translateY(-8px) } to { opacity: 1; transform: translateY(0) } }
        textarea::placeholder { color: rgba(26,26,46,0.2) }
        button:hover { opacity: 0.92 }
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

          {section === "home" && (
            <>
              <Hero
                onAdopt={() => setSection("my pet")}
                onExplore={() => setSection("community")}
                txToday={platformStats?.tx_today || 0}
              />
              <SeasonBanner seasonPoints={seasonPoints} />
              <CheckinCard isAuthenticated={isAuthenticated} />
              <div className="home-section-pad" style={{ padding: "0 40px 30px", maxWidth: 1060, margin: "0 auto" }}>
                <Stats stats={stats} />
              </div>
              {activities.length > 0 && (
                <div className="home-section-pad" style={{ padding: "0 40px 30px", maxWidth: 1060, margin: "0 auto" }}>
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
            <PetProfile />
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
          {/* Public highlights header — frames the tab as "a place full of
              pets" and proves it's alive before the (gated) gallery. */}
          <PetOfTheWeek />
          <CommunityHighlights />
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

      {section === "cards" && (
        <div style={{ paddingTop: 96, paddingLeft: 20, paddingRight: 20 }}>
          <WalletGate section="cards">
            <Suspense fallback={<Loader />}>
              <CardDeck />
            </Suspense>
          </WalletGate>
        </div>
      )}

      {section === "catch" && (
        <div style={{ paddingTop: 96, paddingLeft: 20, paddingRight: 20 }}>
          <WalletGate section="catch">
            <Suspense fallback={<Loader />}>
              <CatCatch />
            </Suspense>
          </WalletGate>
        </div>
      )}


      {/* Footer — only show in app mode */}
      <footer style={{ padding: "48px 24px 36px", textAlign: "center", borderTop: "1px solid rgba(0,0,0,0.08)", background: "rgba(0,0,0,0.015)" }}>
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 10, marginBottom: 20 }}>
          <span style={{
            fontFamily: "'Space Grotesk',sans-serif", fontSize: 22, fontWeight: 800,
            color: "#1a1a2e", letterSpacing: "-0.02em",
          }}>
            MY AI PET
          </span>
          <span style={{
            fontSize: 11, padding: "4px 12px", borderRadius: 999,
            background: "linear-gradient(135deg, rgba(251,191,36,0.18), rgba(139,92,246,0.12))",
            color: "#b45309", fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700,
            border: "1px solid rgba(251,191,36,0.3)",
            letterSpacing: "0.04em",
          }}>
            CompanionFi
          </span>
        </div>
        <p style={{
          fontFamily: "'Space Grotesk',sans-serif", fontSize: 16, color: "rgba(26,26,46,0.7)",
          maxWidth: 560, margin: "0 auto 26px", lineHeight: 1.6, fontWeight: 500,
        }}>
          Your AI. Your data. Your companion. An open protocol for AI pets you actually own — across every surface you use.
        </p>

        {/* Social buttons */}
        <div style={{ display: "flex", justifyContent: "center", gap: 12, marginBottom: 28, flexWrap: "wrap" }}>
          <a href="https://x.com/myaipets" target="_blank" rel="noopener noreferrer" style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            padding: "12px 22px", borderRadius: 12,
            background: "#1a1a2e", color: "#fff",
            fontFamily: "'Space Grotesk',sans-serif", fontSize: 15, fontWeight: 700,
            textDecoration: "none", transition: "all 0.2s",
            boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
          }}
            onMouseOver={(e) => { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 6px 16px rgba(0,0,0,0.18)"; }}
            onMouseOut={(e) => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.12)"; }}
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
            background: "white", color: "#1a1a2e",
            border: "2px solid rgba(26,26,46,0.12)",
            fontFamily: "'Space Grotesk',sans-serif", fontSize: 15, fontWeight: 700,
            textDecoration: "none", transition: "all 0.2s",
          }}>
            <span style={{ fontSize: 16 }}>⌥</span>
            GitHub
          </a>
          */}
          <a href="/petclaw-extension.zip" download="myaipet-extension.zip" style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            padding: "12px 22px", borderRadius: 12,
            background: "linear-gradient(135deg, #f59e0b, #d97706)", color: "white",
            fontFamily: "'Space Grotesk',sans-serif", fontSize: 15, fontWeight: 700,
            textDecoration: "none", transition: "all 0.2s",
            boxShadow: "0 2px 8px rgba(245,158,11,0.3)",
          }}
            onMouseOver={(e) => { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 6px 16px rgba(245,158,11,0.4)"; }}
            onMouseOut={(e) => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = "0 2px 8px rgba(245,158,11,0.3)"; }}
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
              fontFamily: "'Space Grotesk',sans-serif", fontSize: 12, fontWeight: 500,
              color: "rgba(26,26,46,0.5)", textDecoration: "none",
            }}>{l.label}</a>
          ))}
        </div>

        <div style={{
          fontFamily: "'Space Grotesk',sans-serif", fontSize: 13, color: "rgba(26,26,46,0.4)",
          fontWeight: 500, letterSpacing: "0.02em", marginBottom: 12,
        }}>
          © 2026 My AI Pet Protocol · Raise · Bond · Remember
        </div>

        {/* Disclaimer */}
        <div style={{
          maxWidth: 680, margin: "0 auto",
          fontFamily: "'Space Grotesk',sans-serif", fontSize: 11,
          color: "rgba(26,26,46,0.35)", lineHeight: 1.6, fontWeight: 400,
        }}>
          Engagement points are non-financial loyalty credits, not securities. No token is issued —
          the economy is points-only loyalty. Nothing here is financial advice.
        </div>
      </footer>
    </div>
  );
}
