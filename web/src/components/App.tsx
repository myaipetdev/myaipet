"use client";

import { useState, useEffect, useCallback, lazy, Suspense } from "react";
import { useAccount } from "wagmi";

import { api } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { MOCK_STATS, MOCK_ACTIVITIES } from "@/lib/mockData";

import Nav from "@/components/Nav";
import Hero from "@/components/Hero";
import Stats from "@/components/Stats";
import Feed from "@/components/Feed";
import Pricing from "@/components/Pricing";
import WalletGate from "@/components/WalletGate";

const PetProfile = lazy(() => import("@/components/PetProfile"));
const PetGenerate = lazy(() => import("@/components/PetGenerate"));
const SocialGallery = lazy(() => import("@/components/SocialGallery"));
const Adventure = lazy(() => import("@/components/Adventure"));
const Leaderboard = lazy(() => import("@/components/Leaderboard"));
const PremiumShop = lazy(() => import("@/components/PremiumShop"));
const AgentDashboard = lazy(() => import("@/components/AgentDashboard"));
const SovereigntyDashboard = lazy(() => import("@/components/SovereigntyDashboard"));

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
    <div style={{ paddingTop: 120, textAlign: "center", color: "rgba(26,26,46,0.3)", fontFamily: "mono", fontSize: 12 }}>
      Loading...
    </div>
  );
}

// ── Season 1 Airdrop Banner ──
function SeasonBanner() {
  const SEASON_START = new Date("2026-03-01T00:00:00Z").getTime();
  const SEASON_END = new Date("2026-06-15T00:00:00Z").getTime();
  const SEASON_TOTAL = SEASON_END - SEASON_START;

  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const remaining = Math.max(0, SEASON_END - now);
  const days = Math.floor(remaining / 86_400_000);
  const hours = Math.floor((remaining % 86_400_000) / 3_600_000);
  const minutes = Math.floor((remaining % 3_600_000) / 60_000);
  const seconds = Math.floor((remaining % 60_000) / 1000);
  const progress = Math.min(1, Math.max(0, (now - SEASON_START) / SEASON_TOTAL));

  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <div style={{ padding: "0 40px", maxWidth: 1060, margin: "0 auto 0" }}>
      <div
        style={{
          background: "linear-gradient(135deg, #f59e0b 0%, #d97706 40%, #b45309 100%)",
          borderRadius: 14,
          padding: "14px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
          marginBottom: 8,
          boxShadow: "0 2px 16px rgba(245,158,11,0.18)",
          position: "relative",
          overflow: "hidden",
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
          <span style={{ fontSize: 20, lineHeight: 1 }}>🏆</span>
          <div style={{ minWidth: 0 }}>
            <div style={{
              fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 14,
              color: "#fff", letterSpacing: "-0.02em", whiteSpace: "nowrap",
            }}>
              Season 1 Airdrop
            </div>
            <div style={{
              fontFamily: "monospace", fontSize: 11, color: "rgba(255,255,255,0.75)",
              marginTop: 1, whiteSpace: "nowrap",
            }}>
              100,000 $PET Prize Pool
            </div>
          </div>
        </div>

        {/* Center: countdown */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, zIndex: 1 }}>
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

        {/* Right: rank + progress */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, zIndex: 1, minWidth: 120 }}>
          <div style={{
            fontFamily: "monospace", fontSize: 11, color: "rgba(255,255,255,0.8)",
            whiteSpace: "nowrap",
          }}>
            Your Rank: <span style={{ fontWeight: 700, color: "#fff" }}>--</span>
          </div>
          <div style={{ width: "100%", height: 5, background: "rgba(0,0,0,0.18)", borderRadius: 3, overflow: "hidden" }}>
            <div style={{
              height: "100%", borderRadius: 3,
              background: "linear-gradient(90deg, #fde68a, #fff)",
              width: `${(progress * 100).toFixed(1)}%`,
              transition: "width 1s linear",
            }} />
          </div>
          <div style={{ fontFamily: "monospace", fontSize: 8, color: "rgba(255,255,255,0.5)" }}>
            Season {(progress * 100).toFixed(0)}% complete
          </div>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const { isConnected } = useAccount();
  const { user, isAuthenticated, refreshUser } = useAuth();

  const [section, setSection] = useState("home");
  const [activities, setActivities] = useState<any[]>([]);
  const [platformStats, setPlatformStats] = useState<any>(null);
  const [credits, setCredits] = useState(0);

  useEffect(() => {
    if (user) setCredits(user.credits);
  }, [user]);

  const fetchStats = useCallback(async () => {
    try {
      const stats = await api.analytics.stats();
      setPlatformStats(stats);
    } catch {
      if (!platformStats) setPlatformStats(MOCK_STATS);
    }
  }, []);

  const fetchActivity = useCallback(async () => {
    try {
      const res = await api.analytics.activity(10);
      if (res.items.length > 0) setActivities(res.items);
    } catch {
      if (activities.length === 0) setActivities(MOCK_ACTIVITIES);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    fetchActivity();
    const s = setInterval(fetchStats, 15000);
    const a = setInterval(fetchActivity, 6000);
    return () => { clearInterval(s); clearInterval(a); };
  }, [fetchStats, fetchActivity]);

  const stats = platformStats
    ? [
        { label: "Verified Users", value: (platformStats.total_users ?? 0).toLocaleString(), raw: platformStats.total_users ?? 0, animated: true, sub: "Unique wallets" },
        { label: "AI Content Created", value: (platformStats.total_generations ?? 0).toLocaleString(), raw: platformStats.total_generations ?? 0, animated: true, sub: "Videos & Images" },
      ]
    : [
        { label: "Verified Users", value: "0", sub: "Unique wallets" },
        { label: "AI Content Created", value: "0", sub: "Videos & Images" },
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
      `}</style>

      <Grid />
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
          <SeasonBanner />
          <div style={{ padding: "0 40px 30px", maxWidth: 1060, margin: "0 auto" }}>
            <Stats stats={stats} />
          </div>
          <div style={{ padding: "0 40px 30px", maxWidth: 1060, margin: "0 auto" }}>
            <Feed activities={activities} />
          </div>
          <Pricing
            isAuthenticated={isAuthenticated}
            onCreditsChange={handleCreditsChange}
          />
        </>
      )}

      {section === "my pet" && (
        <WalletGate section="my pet">
          <Suspense fallback={<Loader />}>
            <PetProfile />
          </Suspense>
        </WalletGate>
      )}

      {section === "create" && (
        <WalletGate section="create">
          <Suspense fallback={<Loader />}>
            <PetGenerate />
          </Suspense>
        </WalletGate>
      )}

      {section === "community" && (
        <WalletGate section="community">
          <Suspense fallback={<Loader />}>
            <SocialGallery />
          </Suspense>
        </WalletGate>
      )}

      {section === "adventure" && (
        <WalletGate section="adventure">
          <Suspense fallback={<Loader />}>
            <Adventure onNavigate={setSection} />
          </Suspense>
        </WalletGate>
      )}

      {section === "shop" && (
        <WalletGate section="shop">
          <Suspense fallback={<Loader />}>
            <PremiumShop />
          </Suspense>
        </WalletGate>
      )}

      {section === "agent" && (
        <WalletGate section="agent">
          <Suspense fallback={<Loader />}>
            <AgentDashboard />
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

      {section === "leaderboard" && (
        <Suspense fallback={<Loader />}>
          <Leaderboard />
        </Suspense>
      )}

      {/* Footer */}
      <footer style={{ padding: "36px", textAlign: "center", borderTop: "1px solid rgba(0,0,0,0.06)" }}>
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 8, marginBottom: 14 }}>
          <span style={{
            fontFamily: "'Space Grotesk',sans-serif", fontSize: 14, fontWeight: 600,
            color: "rgba(26,26,46,0.4)",
          }}>
            MY AI PET
          </span>
          <span style={{
            fontSize: 8, padding: "2px 8px", borderRadius: 10,
            background: "linear-gradient(135deg, rgba(251,191,36,0.1), rgba(139,92,246,0.08))",
            color: "#d97706", fontFamily: "mono", fontWeight: 600,
            border: "1px solid rgba(251,191,36,0.15)",
          }}>
            CompanionFi
          </span>
        </div>
        <p style={{
          fontFamily: "mono", fontSize: 11, color: "rgba(26,26,46,0.35)",
          maxWidth: 480, margin: "0 auto 14px", lineHeight: 1.7,
        }}>
          Where Emotional Bonds Generate Real Value. The first full-cycle Web3 revenue ecosystem
          driven by emotional AI companionship.
        </p>
        <div style={{ display: "flex", justifyContent: "center", gap: 20, marginBottom: 12 }}>
          {[
            { label: "Twitter", url: "https://x.com/myaipets" },
            { label: "Docs", url: "/docs" },
          ].map((l) => (
            <a key={l.label} href={l.url} target="_blank" rel="noopener noreferrer" style={{
              fontFamily: "mono", fontSize: 11, color: "rgba(26,26,46,0.35)", cursor: "pointer",
              textDecoration: "none",
            }}>
              {l.label}
            </a>
          ))}
        </div>
        <div style={{ fontFamily: "mono", fontSize: 10, color: "rgba(26,26,46,0.25)" }}>
          © 2026 My AI PET Protocol · Raise · Bond · Earn
        </div>
      </footer>
    </div>
  );
}
