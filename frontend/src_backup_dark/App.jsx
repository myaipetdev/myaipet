import { useState, useEffect, useCallback, lazy, Suspense } from "react";
import { useAccount } from "wagmi";

import { api } from "./api";
import { useAuth } from "./hooks/useAuth";
import { MOCK_STATS, MOCK_ACTIVITIES } from "./mockData";

import Nav from "./components/Nav";
import Hero from "./components/Hero";
import Stats from "./components/Stats";
import Feed from "./components/Feed";
import Generate from "./components/Generate";
import Gallery from "./components/Gallery";
import Analytics from "./components/Analytics";
import Pricing from "./components/Pricing";

const PetProfile = lazy(() => import("./components/PetProfile"));
const PetGenerate = lazy(() => import("./components/PetGenerate"));
const SocialGallery = lazy(() => import("./components/SocialGallery"));
const Arena = lazy(() => import("./components/Arena"));

// ── Grid Background ──
function Grid() {
  return (
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0, opacity: 0.025 }}>
      <svg width="100%" height="100%">
        <defs>
          <pattern id="g" width="50" height="50" patternUnits="userSpaceOnUse">
            <path d="M 50 0 L 0 0 0 50" fill="none" stroke="white" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#g)" />
      </svg>
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

  // Update credits from auth
  useEffect(() => {
    if (user) setCredits(user.credits);
  }, [user]);

  // Fetch platform stats
  const fetchStats = useCallback(async () => {
    try {
      const stats = await api.analytics.stats();
      setPlatformStats(stats);
    } catch {
      if (!platformStats) setPlatformStats(MOCK_STATS);
    }
  }, []);

  // Fetch activity feed
  const fetchActivity = useCallback(async () => {
    try {
      const res = await api.analytics.activity(10);
      if (res.items.length > 0) {
        setActivities(res.items);
      }
    } catch {
      if (activities.length === 0) setActivities(MOCK_ACTIVITIES);
    }
  }, []);

  // Initial fetch + polling
  useEffect(() => {
    fetchStats();
    fetchActivity();

    const statsInterval = setInterval(fetchStats, 15000);     // 15s
    const activityInterval = setInterval(fetchActivity, 6000); // 6s

    return () => {
      clearInterval(statsInterval);
      clearInterval(activityInterval);
    };
  }, [fetchStats, fetchActivity]);

  // Build stats array for Stats component
  const stats = platformStats
    ? [
        {
          label: "Total Users",
          value: platformStats.total_users.toLocaleString(),
          raw: platformStats.total_users,
          animated: true,
          change: platformStats.user_change,
          sub: "Unique wallets",
        },
        {
          label: "Videos Generated",
          value: platformStats.total_generations.toLocaleString(),
          raw: platformStats.total_generations,
          animated: true,
          change: platformStats.gen_change,
          sub: "All-time on-chain",
        },
        {
          label: "$PET Burned",
          value: platformStats.total_burned,
          change: platformStats.burned_change,
          sub: "Deflationary",
        },
        {
          label: "TX Today",
          value: platformStats.tx_today.toLocaleString(),
          raw: platformStats.tx_today,
          animated: true,
          change: platformStats.tx_change,
          sub: "Multi-chain",
        },
      ]
    : [
        { label: "Total Users", value: "—", sub: "Loading..." },
        { label: "Videos Generated", value: "—", sub: "Loading..." },
        { label: "$PET Burned", value: "—", sub: "Loading..." },
        { label: "TX Today", value: "—", sub: "Loading..." },
      ];

  const handleCreditsChange = (newCredits) => {
    if (typeof newCredits === "number") {
      setCredits(newCredits);
    } else {
      // Refresh from server
      refreshUser();
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#08080c", color: "white", position: "relative", overflow: "hidden" }}>
      <style>{`
        * { margin: 0; padding: 0; box-sizing: border-box }
        ::selection { background: rgba(251,191,36,0.25) }
        ::-webkit-scrollbar { width: 5px }
        ::-webkit-scrollbar-track { background: transparent }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 3px }
        @keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.3 } }
        @keyframes slideIn { from { opacity: 0; transform: translateY(-8px) } to { opacity: 1; transform: translateY(0) } }
        textarea::placeholder { color: rgba(255,255,255,0.15) }
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
            onGenerate={() => setSection("create")}
            onAdopt={() => setSection("my pet")}
            txToday={platformStats?.tx_today || 0}
          />
          <div style={{ padding: "0 40px 30px", maxWidth: 1060, margin: "0 auto" }}>
            <Stats stats={stats} />
          </div>
          <div style={{ padding: "0 40px 50px", maxWidth: 1060, margin: "0 auto" }}>
            <Feed activities={activities} />
          </div>
          <Pricing
            isAuthenticated={isAuthenticated}
            onCreditsChange={handleCreditsChange}
          />
        </>
      )}

      {section === "my pet" && (
        <Suspense fallback={<div style={{ paddingTop: 120, textAlign: "center", color: "rgba(255,255,255,0.2)", fontFamily: "mono", fontSize: 12 }}>Loading...</div>}>
          <PetProfile />
        </Suspense>
      )}

      {section === "arena" && (
        <Suspense fallback={<div style={{ paddingTop: 120, textAlign: "center", color: "rgba(255,255,255,0.2)", fontFamily: "mono", fontSize: 12 }}>Loading...</div>}>
          <Arena />
        </Suspense>
      )}

      {section === "create" && (
        <Suspense fallback={<div style={{ paddingTop: 120, textAlign: "center", color: "rgba(255,255,255,0.2)", fontFamily: "mono", fontSize: 12 }}>Loading...</div>}>
          <PetGenerate />
        </Suspense>
      )}

      {section === "community" && (
        <Suspense fallback={<div style={{ paddingTop: 120, textAlign: "center", color: "rgba(255,255,255,0.2)", fontFamily: "mono", fontSize: 12 }}>Loading...</div>}>
          <SocialGallery />
        </Suspense>
      )}

      {section === "analytics" && (
        <Analytics stats={stats} activities={activities} />
      )}

      <footer style={{ padding: "36px", textAlign: "center", borderTop: "1px solid rgba(255,255,255,0.03)" }}>
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 8, marginBottom: 14 }}>
          <span style={{
            fontFamily: "'Space Grotesk',sans-serif", fontSize: 13, fontWeight: 600,
            color: "rgba(255,255,255,0.3)",
          }}>
            AI PET
          </span>
        </div>
        <div style={{ display: "flex", justifyContent: "center", gap: 20, marginBottom: 12 }}>
          {["Docs", "GitHub", "Discord", "Twitter"].map((l) => (
            <span key={l} style={{
              fontFamily: "mono", fontSize: 11, color: "rgba(255,255,255,0.2)", cursor: "pointer",
            }}>
              {l}
            </span>
          ))}
        </div>
        <div style={{ fontFamily: "mono", fontSize: 10, color: "rgba(255,255,255,0.1)" }}>
          © 2025 AI PET · All on-chain data verifiable via block explorers
        </div>
      </footer>
    </div>
  );
}
