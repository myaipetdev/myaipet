import { useState, useEffect, useCallback, lazy, Suspense } from "react";
import { useAccount } from "wagmi";

import { api } from "./api";
import { useAuth } from "./hooks/useAuth";
import { MOCK_STATS, MOCK_ACTIVITIES } from "./mockData";

import Nav from "./components/Nav";
import Hero from "./components/Hero";
import Stats from "./components/Stats";
import Feed from "./components/Feed";
import Pricing from "./components/Pricing";
import WalletGate from "./components/WalletGate";

const PetProfile = lazy(() => import("./components/PetProfile"));
const PetGenerate = lazy(() => import("./components/PetGenerate"));
const SocialGallery = lazy(() => import("./components/SocialGallery"));
const Arena = lazy(() => import("./components/Arena"));
const Analytics = lazy(() => import("./components/Analytics"));

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

export default function App() {
  const { isConnected } = useAccount();
  const { user, isAuthenticated, refreshUser } = useAuth();

  const [section, setSection] = useState("home");
  const [activities, setActivities] = useState([]);
  const [platformStats, setPlatformStats] = useState(null);
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
        { label: "Verified Users", value: platformStats.total_users.toLocaleString(), raw: platformStats.total_users, animated: true, change: platformStats.user_change, sub: "Unique wallets" },
        { label: "AI Content Created", value: platformStats.total_generations.toLocaleString(), raw: platformStats.total_generations, animated: true, change: platformStats.gen_change, sub: "Videos & Images" },
        { label: "$PET Burned", value: platformStats.total_burned, change: platformStats.burned_change, sub: "Deflationary" },
        { label: "TX Today", value: platformStats.tx_today.toLocaleString(), raw: platformStats.tx_today, animated: true, change: platformStats.tx_change, sub: "Multi-chain" },
      ]
    : [
        { label: "Verified Users", value: "20,000+", sub: "Unique wallets" },
        { label: "AI Content Created", value: "100,000+", sub: "Videos & Images" },
        { label: "$PET Burned", value: "—", sub: "Deflationary" },
        { label: "TX Today", value: "—", sub: "Multi-chain" },
      ];

  const handleCreditsChange = (newCredits) => {
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

      {section === "arena" && (
        <WalletGate section="arena">
          <Suspense fallback={<Loader />}>
            <Arena />
          </Suspense>
        </WalletGate>
      )}

      {section === "analytics" && (
        <Suspense fallback={<Loader />}>
          <Analytics stats={stats} activities={activities} />
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
          Where Companionship Creates Value. The first full-cycle Web3 revenue ecosystem
          driven by emotional AI companionship.
        </p>
        <div style={{ display: "flex", justifyContent: "center", gap: 20, marginBottom: 12 }}>
          {[
            { label: "Twitter", url: "https://x.com/myaipets" },
            { label: "Docs", url: "#" },
            { label: "Discord", url: "#" },
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
