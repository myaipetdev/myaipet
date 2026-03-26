import { useState, useEffect, useCallback, lazy, Suspense } from "react";
import { useAccount } from "wagmi";

import { api } from "./api";
import { useAuth } from "./hooks/useAuth";
import { MOCK_STATS, MOCK_ACTIVITIES } from "./mockData";

import NavKawaii from "./components/NavKawaii";
import BottomNav from "./components/BottomNav";
import Hero from "./components/Hero";
import Stats from "./components/Stats";
import Feed from "./components/Feed";
import Pricing from "./components/Pricing";
import Onboarding from "./components/Onboarding";
import WalletGate from "./components/WalletGate";

// New Kawaii components (lazy)
const MyPetLounge = lazy(() => import("./components/MyPetLounge"));
const ArenaWall = lazy(() => import("./components/ArenaWall"));
const EnergyDashboard = lazy(() => import("./components/EnergyDashboard"));

// Ecosystem components (lazy)
const PetVillage = lazy(() => import("./components/PetVillage"));

// Legacy components (still functional, lazy)
const PetGenerate = lazy(() => import("./components/PetGenerate"));
const SocialGallery = lazy(() => import("./components/SocialGallery"));
const Analytics = lazy(() => import("./components/Analytics"));

// ── Loading Spinner (Kawaii) ──
function KawaiiLoader() {
  return (
    <div className="flex flex-col items-center justify-center pt-32 gap-4">
      <div className="text-5xl animate-float">🐾</div>
      <span className="font-body text-sm text-pink/60 font-semibold">Loading...</span>
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
  const [showOnboarding, setShowOnboarding] = useState(() => {
    return !localStorage.getItem("aipet_onboarded");
  });

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
    if (showOnboarding) return;
    fetchStats();
    fetchActivity();
    const s = setInterval(fetchStats, 15000);
    const a = setInterval(fetchActivity, 6000);
    return () => { clearInterval(s); clearInterval(a); };
  }, [fetchStats, fetchActivity, showOnboarding]);

  const stats = platformStats
    ? [
        { label: "Total Users", value: platformStats.total_users.toLocaleString(), raw: platformStats.total_users, animated: true, change: platformStats.user_change, sub: "Unique wallets" },
        { label: "Videos Generated", value: platformStats.total_generations.toLocaleString(), raw: platformStats.total_generations, animated: true, change: platformStats.gen_change, sub: "All-time on-chain" },
        { label: "$PET Burned", value: platformStats.total_burned, change: platformStats.burned_change, sub: "Deflationary" },
        { label: "TX Today", value: platformStats.tx_today.toLocaleString(), raw: platformStats.tx_today, animated: true, change: platformStats.tx_change, sub: "Multi-chain" },
      ]
    : [
        { label: "Total Users", value: "—", sub: "Loading..." },
        { label: "Videos Generated", value: "—", sub: "Loading..." },
        { label: "$PET Burned", value: "—", sub: "Loading..." },
        { label: "TX Today", value: "—", sub: "Loading..." },
      ];

  const handleCreditsChange = (newCredits) => {
    if (typeof newCredits === "number") setCredits(newCredits);
    else refreshUser();
  };

  const handleOnboardingComplete = (data) => {
    localStorage.setItem("aipet_onboarded", "true");
    setShowOnboarding(false);
    if (data && !data.skipped) setSection("village");
  };

  // ── Onboarding ──
  if (showOnboarding) {
    return (
      <div className="min-h-screen bg-cream">
        <Onboarding onComplete={handleOnboardingComplete} />
      </div>
    );
  }

  // ── Main App ──
  return (
    <div className="min-h-screen bg-cream text-[#422D26] relative pb-20 sm:pb-0">
      <style>{`
        *, *::before, *::after { padding: 0; box-sizing: border-box }
        ::selection { background: rgba(255,134,183,0.2) }
        ::-webkit-scrollbar { width: 6px }
        ::-webkit-scrollbar-track { background: transparent }
        ::-webkit-scrollbar-thumb { background: rgba(255,134,183,0.15); border-radius: 3px }
        @keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.3 } }
        @keyframes slideIn { from { opacity: 0; transform: translateY(-8px) } to { opacity: 1; transform: translateY(0) } }
        textarea::placeholder { color: rgba(255,134,183,0.2) }
      `}</style>

      <NavKawaii
        section={section}
        setSection={setSection}
        credits={isAuthenticated ? credits : null}
      />

      {section === "home" && (
        <>
          <Hero
            onGenerate={() => setSection("create")}
            txToday={platformStats?.tx_today || 0}
          />
          <div className="max-w-[1060px] mx-auto px-4 sm:px-10 space-y-8 pb-8">
            <Stats stats={stats} />
            <Feed activities={activities} />
          </div>
          <Pricing isAuthenticated={isAuthenticated} onCreditsChange={handleCreditsChange} />
        </>
      )}

      {/* ═══ NEW KAWAII SECTIONS ═══ */}

      {section === "my pet" && (
        <WalletGate section="my pet">
          <Suspense fallback={<KawaiiLoader />}>
            <MyPetLounge />
          </Suspense>
        </WalletGate>
      )}

      {section === "arena" && (
        <Suspense fallback={<KawaiiLoader />}>
          <ArenaWall />
        </Suspense>
      )}

      {section === "energy" && (
        <Suspense fallback={<KawaiiLoader />}>
          <EnergyDashboard onGoToArena={() => setSection("arena")} />
        </Suspense>
      )}

      {/* ═══ ECOSYSTEM SECTIONS ═══ */}

      {section === "village" && (
        <WalletGate section="village">
          <Suspense fallback={<KawaiiLoader />}>
            <PetVillage />
          </Suspense>
        </WalletGate>
      )}


      {/* ═══ CREATE (CORE) ═══ */}

      {section === "create" && (
        <WalletGate section="create">
          <Suspense fallback={<KawaiiLoader />}>
            <PetGenerate />
          </Suspense>
        </WalletGate>
      )}

      {/* ═══ LEGACY SECTIONS ═══ */}

      {section === "community" && (
        <Suspense fallback={<KawaiiLoader />}>
          <SocialGallery />
        </Suspense>
      )}

      {section === "analytics" && (
        <Suspense fallback={<KawaiiLoader />}>
          <Analytics stats={stats} activities={activities} />
        </Suspense>
      )}

      {/* Footer (desktop only) */}
      <footer className="hidden sm:block py-12 text-center" style={{ borderTop: "1px solid rgba(255,134,183,0.08)" }}>
        <div className="flex justify-center items-center gap-3 mb-4">
          <span className="font-heading text-xl text-pink/60">AI PET</span>
          <span className="font-body text-xs font-bold px-3 py-1.5 rounded-full bg-gradient-to-r from-purple-500/10 to-pink/10 text-purple-500/70 border border-purple-500/15">
            WEB 4.0
          </span>
        </div>
        <p className="font-body text-sm text-[#422D26]/50 max-w-md mx-auto mb-4 leading-relaxed">
          The first protocol where AI pets autonomously pay for their own evolution using X402.
        </p>
        <div className="font-body text-sm text-[#422D26]/40">
          © 2026 AI PET Protocol · Powered by X402
        </div>
      </footer>

      {/* Mobile Bottom Nav */}
      <BottomNav section={section} setSection={setSection} />
    </div>
  );
}
