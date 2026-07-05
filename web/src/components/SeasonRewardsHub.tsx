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
 * by App (it owns the live season-point count the season strip renders).
 */
import { useState, type ReactNode } from "react";

import Icon from "@/components/Icon";
import Reveal from "@/components/Reveal";
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
  const { line } = INTRO[pillar];
  // The selected tab chip already labels the section — the eyebrow just echoed
  // it, so only the descriptive line remains, at the header's ~16px rhythm.
  return (
    <Reveal dir="fade" delay={80} style={{ maxWidth: 1060, margin: "16px auto 16px", padding: "0 24px" }}>
      <div style={{
        fontSize: 14, color: "#5C5140",
        fontFamily: "var(--ed-body)", lineHeight: 1.45, maxWidth: 640,
      }}>
        {line}
      </div>
    </Reveal>
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
      <Reveal dir="up" style={{ maxWidth: 1060, margin: "16px auto 0", padding: "0 24px", width: "100%" }}>
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
                  background: sel ? "#BE4F28" : "#FBF6EC",
                  border: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
                  boxShadow: "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))",
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
                    color: sel ? "#FFF8EE" : "#211A12", letterSpacing: "-0.01em",
                  }}>
                    {t.title}
                  </span>
                  <span style={{
                    display: "block", fontSize: 13, marginTop: 1,
                    color: sel ? "rgba(252,233,207,0.92)" : "#5C5140",
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
