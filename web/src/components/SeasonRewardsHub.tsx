"use client";

/**
 * Season Rewards hub — the merged "my status + earn + compete + connect" page.
 *
 * Replaces the old 9-card vertical scroll with a persistent status header
 * (MyCard + the season banner) over three tabbed pillars that mirror how the
 * reward economy is actually framed:
 *
 *   🎯 Earn    (활동 유도)   — hourly drops, daily/weekly/monthly missions, streak
 *   🏆 Compete (경쟁심리)   — the six-dimensional leaderboard
 *   🤝 Connect (소셜)       — SOS rescues, buddies, pet dates
 *
 * The premium upsell sits below the tabs on every pillar. `banner` is injected
 * by App (it owns the live airdrop-point count the season strip renders).
 */
import { useState, type ReactNode } from "react";

import Icon from "@/components/Icon";
import MyCard from "@/components/MyCard";
import SeasonTierCard from "@/components/SeasonTierCard";
import HourlyDropBanner from "@/components/HourlyDropBanner";
import MissionsCard from "@/components/MissionsCard";
import WeeklyMonthlyCard from "@/components/WeeklyMonthlyCard";
import MultiLeaderboard from "@/components/MultiLeaderboard";
import SosFeedAndBuddy from "@/components/SosFeedAndBuddy";
import PetDateWidget from "@/components/PetDateWidget";
import PremiumTeaser from "@/components/PremiumTeaser";

type Pillar = "earn" | "compete" | "connect";

const TABS: Array<{ key: Pillar; icon: string; title: string; sub: string }> = [
  { key: "earn",    icon: "coins",  title: "Earn",    sub: "Missions · drops · streak" },
  { key: "compete", icon: "trophy", title: "Compete", sub: "Leaderboards" },
  { key: "connect", icon: "chat",   title: "Connect", sub: "SOS · buddies · dates" },
];

const INTRO: Record<Pillar, { eyebrow: string; line: string }> = {
  earn: {
    eyebrow: "EARN",
    line: "Show up, clear missions, keep the streak alive. Every action banks loyalty points toward the season pool.",
  },
  compete: {
    eyebrow: "COMPETE",
    line: "Six ways to be #1 — streaks, chats, memories, creations, bond, or seniority. Everyone leads somewhere.",
  },
  connect: {
    eyebrow: "CONNECT",
    line: "Your pet doesn't grow alone. Send an SOS, pair with a buddy, or set up a pet date.",
  },
};

function SectionIntro({ pillar }: { pillar: Pillar }) {
  const { eyebrow, line } = INTRO[pillar];
  return (
    <div style={{ maxWidth: 1060, margin: "18px auto 2px", padding: "0 24px" }}>
      <div style={{
        fontSize: 10, fontFamily: "'JetBrains Mono', monospace",
        letterSpacing: "0.16em", color: "#b45309", fontWeight: 700,
      }}>
        {eyebrow}
      </div>
      <div style={{
        fontSize: 14, color: "rgba(26,26,46,0.6)", marginTop: 4,
        fontFamily: "'Space Grotesk', sans-serif", lineHeight: 1.45, maxWidth: 640,
      }}>
        {line}
      </div>
    </div>
  );
}

export default function SeasonRewardsHub({ banner }: { banner?: React.ReactNode }) {
  const [pillar, setPillar] = useState<Pillar>("earn");

  return (
    <div style={{ paddingTop: 100, display: "flex", flexDirection: "column", gap: 4 }}>
      {/* Persistent status header — doubles as the user's "my page". */}
      <MyCard />
      {banner}
      <SeasonTierCard />

      {/* Pillar tabs — big, labelled, so each pillar's purpose reads instantly. */}
      <div style={{ maxWidth: 1060, margin: "16px auto 0", padding: "0 24px", width: "100%" }}>
        <div style={{
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
                  background: sel
                    ? "linear-gradient(135deg, #f59e0b 0%, #d97706 55%, #b45309 100%)"
                    : "white",
                  border: sel ? "1px solid transparent" : "1px solid rgba(0,0,0,0.07)",
                  boxShadow: sel ? "0 6px 20px rgba(245,158,11,0.24)" : "0 1px 0 rgba(0,0,0,0.03)",
                  transition: "background 0.15s, box-shadow 0.15s",
                }}
              >
                <span style={{ fontSize: 22, lineHeight: 1, display: "inline-flex" }}>
                  <Icon name={t.icon} size={22} />
                </span>
                <span style={{ minWidth: 0 }}>
                  <span style={{
                    display: "block",
                    fontFamily: "'Space Grotesk', sans-serif", fontWeight: 800, fontSize: 15,
                    color: sel ? "#fff" : "#1a1a2e", letterSpacing: "-0.01em",
                  }}>
                    {t.title}
                  </span>
                  <span style={{
                    display: "block", fontSize: 11, marginTop: 1,
                    color: sel ? "rgba(255,255,255,0.8)" : "rgba(26,26,46,0.5)",
                    fontFamily: "'Space Grotesk', sans-serif",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {t.sub}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Pillar content */}
      <SectionIntro pillar={pillar} />

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
