"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Arena from "@/components/Arena";
import PveMode from "@/components/PveMode";
import GameWorld from "@/components/GameWorld";
import Icon from "@/components/Icon";
import { api } from "@/lib/api";

// ── Types ──
interface Pet {
  id: number;
  name: string;
  species: number;
  personality_type: string;
  level: number;
  experience: number;
  happiness: number;
  energy: number;
  hunger: number;
  bond_level: number;
  total_interactions: number;
  current_mood?: string;
  is_active?: boolean;
  avatar_url?: string;
  evolution_stage?: number;
  personality_modifiers?: any;
}

const PET_EMOJIS = [
  "\u{1F431}", "\u{1F415}", "\u{1F99C}", "\u{1F422}", "\u{1F439}", "\u{1F430}", "\u{1F98A}", "\u{1F436}",
];

const MOOD_MAP: Record<string, { emoji: string; color: string }> = {
  happy: { emoji: "\u{1F60A}", color: "#4ade80" },
  excited: { emoji: "\u{1F929}", color: "#facc15" },
  calm: { emoji: "\u{1F60C}", color: "#60a5fa" },
  sleepy: { emoji: "\u{1F634}", color: "#a78bfa" },
  hungry: { emoji: "\u{1F924}", color: "#f97316" },
  sad: { emoji: "\u{1F622}", color: "#94a3b8" },
  playful: { emoji: "\u{1F63C}", color: "#f472b6" },
};

// ── Keyframes ──
const bootKeyframes = `
@keyframes blink {
  0%, 49% { opacity: 1; }
  50%, 100% { opacity: 0; }
}
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(20px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes fadeInScale {
  from { opacity: 0; transform: scale(0.92); }
  to   { opacity: 1; transform: scale(1); }
}
@keyframes scanline {
  0%   { transform: translateY(-100%); }
  100% { transform: translateY(100vh); }
}
@keyframes glowPulse {
  0%, 100% { box-shadow: 0 0 8px rgba(100,220,255,0.15), inset 0 0 8px rgba(100,220,255,0.03); }
  50%      { box-shadow: 0 0 20px rgba(100,220,255,0.35), inset 0 0 12px rgba(100,220,255,0.06); }
}
@keyframes activeGlow {
  0%, 100% { box-shadow: 0 0 12px rgba(80,200,120,0.4), inset 0 0 8px rgba(80,200,120,0.08); }
  50%      { box-shadow: 0 0 24px rgba(80,200,120,0.6), inset 0 0 14px rgba(80,200,120,0.12); }
}
@keyframes bootLogoFade {
  0%   { opacity: 0; transform: scale(0.7) translateY(10px); filter: blur(8px); }
  40%  { opacity: 1; transform: scale(1.05) translateY(0); filter: blur(0); }
  60%  { opacity: 1; transform: scale(1); }
  100% { opacity: 1; transform: scale(1); }
}
@keyframes bootClick {
  0%   { width: 0; height: 0; opacity: 0; }
  30%  { width: 40px; height: 40px; opacity: 0.6; }
  100% { width: 80px; height: 80px; opacity: 0; }
}
@keyframes bootFlash {
  0%, 70% { opacity: 0; }
  75%     { opacity: 0.2; }
  100%    { opacity: 0; }
}
@keyframes bootProgressGlow {
  0%   { box-shadow: 0 0 8px rgba(80,200,120,0.3), 0 0 20px rgba(80,200,120,0.1); }
  50%  { box-shadow: 0 0 16px rgba(80,200,120,0.6), 0 0 40px rgba(80,200,120,0.2); }
  100% { box-shadow: 0 0 8px rgba(80,200,120,0.3), 0 0 20px rgba(80,200,120,0.1); }
}
@keyframes bootProgressFill {
  0%   { width: 0%; }
  30%  { width: 25%; }
  60%  { width: 70%; }
  85%  { width: 90%; }
  100% { width: 100%; }
}
@keyframes matrixRain {
  0%   { transform: translateY(-100%); opacity: 0; }
  10%  { opacity: 1; }
  90%  { opacity: 1; }
  100% { transform: translateY(100vh); opacity: 0; }
}
@keyframes cardShimmer {
  0%   { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
@keyframes cardFloat {
  0%, 100% { transform: translateY(0); }
  50%      { transform: translateY(-4px); }
}
@keyframes iconPulse {
  0%, 100% { transform: scale(1); filter: brightness(1); }
  50%      { transform: scale(1.08); filter: brightness(1.2); }
}
@keyframes wildAppear {
  0%   { opacity: 0; transform: translateX(60px) scale(0.6); }
  50%  { transform: translateX(-8px) scale(1.05); }
  100% { opacity: 1; transform: translateX(0) scale(1); }
}
@keyframes playerSlideIn {
  0%   { opacity: 0; transform: translateX(-60px) scale(0.6); }
  50%  { transform: translateX(8px) scale(1.05); }
  100% { opacity: 1; transform: translateX(0) scale(1); }
}
@keyframes encounterFlash {
  0%   { opacity: 0; }
  15%  { opacity: 0.8; }
  30%  { opacity: 0; }
  45%  { opacity: 0.5; }
  60%  { opacity: 0; }
  100% { opacity: 0; }
}
@keyframes shimmer {
  0%   { background-position: -200% center; }
  100% { background-position: 200% center; }
}
@keyframes bounce {
  0%, 100% { transform: translateY(0); }
  50%      { transform: translateY(-8px); }
}
@keyframes hpDrain {
  from { transform: scaleX(1); }
  to   { transform: scaleX(var(--hp-pct, 1)); }
}
@keyframes revealLocation {
  0%   { opacity: 0; transform: rotateY(90deg) scale(0.8); }
  60%  { transform: rotateY(-5deg) scale(1.02); }
  100% { opacity: 1; transform: rotateY(0deg) scale(1); }
}
@keyframes fogClear {
  0%   { backdrop-filter: blur(12px); opacity: 0.8; }
  100% { backdrop-filter: blur(0px); opacity: 0; }
}
@keyframes sparkle {
  0%, 100% { opacity: 0; transform: scale(0) rotate(0deg); }
  50%      { opacity: 1; transform: scale(1) rotate(180deg); }
}
@keyframes campfireFlicker {
  0%, 100% { filter: brightness(1) hue-rotate(0deg); }
  25%      { filter: brightness(1.15) hue-rotate(-5deg); }
  50%      { filter: brightness(0.95) hue-rotate(5deg); }
  75%      { filter: brightness(1.1) hue-rotate(-3deg); }
}
@keyframes gymPulse {
  0%   { box-shadow: 0 0 10px rgba(245,158,11,0.3); }
  50%  { box-shadow: 0 0 30px rgba(245,158,11,0.7), 0 0 60px rgba(245,158,11,0.2); }
  100% { box-shadow: 0 0 10px rgba(245,158,11,0.3); }
}
@keyframes gymTargetMove {
  0%   { left: 0%; }
  50%  { left: calc(100% - 20px); }
  100% { left: 0%; }
}
@keyframes resultPop {
  0%   { opacity: 0; transform: scale(0.3); filter: blur(10px); }
  60%  { transform: scale(1.15); filter: blur(0); }
  80%  { transform: scale(0.95); }
  100% { opacity: 1; transform: scale(1); }
}
@keyframes screenShake {
  0%, 100% { transform: translateX(0); }
  10%  { transform: translateX(-6px) translateY(2px); }
  20%  { transform: translateX(5px) translateY(-3px); }
  30%  { transform: translateX(-4px) translateY(1px); }
  40%  { transform: translateX(3px) translateY(-1px); }
  50%  { transform: translateX(-2px); }
  60%  { transform: translateX(1px); }
}
@keyframes goldenBurst {
  0%   { box-shadow: 0 0 0 0 rgba(245,158,11,0.6); }
  50%  { box-shadow: 0 0 40px 20px rgba(245,158,11,0.3); }
  100% { box-shadow: 0 0 0 0 rgba(245,158,11,0); }
}
@keyframes particleBurst {
  0%   { opacity: 1; transform: translate(0, 0) scale(1); }
  100% { opacity: 0; transform: translate(var(--px, 30px), var(--py, -30px)) scale(0); }
}
@keyframes counterUp {
  0%   { opacity: 0; transform: translateY(10px); }
  50%  { opacity: 1; }
  100% { opacity: 0; transform: translateY(-20px); }
}
@keyframes skillGlow {
  0%, 100% { text-shadow: 0 0 10px rgba(245,158,11,0.4); }
  50%      { text-shadow: 0 0 20px rgba(245,158,11,0.8), 0 0 40px rgba(245,158,11,0.3); }
}
@keyframes borderRotate {
  0%   { --angle: 0deg; }
  100% { --angle: 360deg; }
}
@keyframes petSelectGlow {
  0%, 100% { box-shadow: 0 0 12px rgba(139,92,246,0.3), inset 0 0 6px rgba(139,92,246,0.05); }
  50%      { box-shadow: 0 0 24px rgba(139,92,246,0.5), inset 0 0 12px rgba(139,92,246,0.1); }
}
@keyframes skeletonPulse {
  0%, 100% { opacity: 0.04; }
  50%      { opacity: 0.08; }
}
@keyframes progressExplore {
  from { width: 0%; }
  to   { width: var(--progress, 0%); }
}
@keyframes statCountUp {
  0%   { opacity: 0; transform: scale(0.5); }
  50%  { transform: scale(1.2); }
  100% { opacity: 1; transform: scale(1); }
}
@keyframes rewardFloat {
  0%   { opacity: 1; transform: translateY(0) scale(1); }
  100% { opacity: 0; transform: translateY(-40px) scale(1.3); }
}
`;

const MENU_ITEMS = [
  {
    id: "world",
    iconName: "world-map",
    title: "Open World",
    desc: "Explore the map, find battles",
    available: true,
    accent: "#50c878",
    gradient: "linear-gradient(135deg, #0a2a1a, #0a1a0a)",
    iconBg: "radial-gradient(circle, #50c87830 0%, transparent 70%)",
  },
  {
    id: "battle",
    iconName: "sword",
    title: "Quick Battle",
    desc: "4-skill element PvP",
    available: true,
    accent: "#f59e0b",
    gradient: "linear-gradient(135deg, #2a1a0a, #1a1408)",
    iconBg: "radial-gradient(circle, #f59e0b30 0%, transparent 70%)",
  },
  {
    id: "pve",
    iconName: "skull",
    title: "Stage Select",
    desc: "30 stages, 6 regions",
    available: true,
    accent: "#dc2626",
    gradient: "linear-gradient(135deg, #2a0a0a, #1a0808)",
    iconBg: "radial-gradient(circle, #dc262630 0%, transparent 70%)",
  },
  {
    id: "wild",
    iconName: "compass",
    title: "Wild Encounter",
    desc: "Meet wild pets, find skills",
    available: true,
    accent: "#6bcf7f",
    gradient: "linear-gradient(135deg, #0a2a12, #0a1a0a)",
    iconBg: "radial-gradient(circle, #6bcf7f30 0%, transparent 70%)",
  },
  {
    id: "explore",
    iconName: "compass",
    title: "Explore",
    desc: "Discover treasure & skills",
    available: true,
    accent: "#64b5f6",
    gradient: "linear-gradient(135deg, #0a1a2a, #0a0a1e)",
    iconBg: "radial-gradient(circle, #64b5f630 0%, transparent 70%)",
  },
  {
    id: "gym",
    iconName: "boxing",
    title: "Gym Challenge",
    desc: "Train your pet's stats",
    available: true,
    accent: "#ffa726",
    gradient: "linear-gradient(135deg, #2a1a08, #1a1408)",
    iconBg: "radial-gradient(circle, #ffa72630 0%, transparent 70%)",
  },
] as const;

// ── Wild Encounter Data ──
const WILD_PETS = [
  { name: "Mossy Frog", emoji: "\u{1F438}", personality: "shy", rarity: "common" },
  { name: "Shadow Fox", emoji: "\u{1F98A}", personality: "cunning", rarity: "uncommon" },
  { name: "Crystal Bunny", emoji: "\u{1F430}", personality: "gentle", rarity: "rare" },
  { name: "Thunder Pup", emoji: "\u{1F436}", personality: "brave", rarity: "uncommon" },
  { name: "Mystic Owl", emoji: "\u{1F989}", personality: "wise", rarity: "rare" },
  { name: "Flame Lizard", emoji: "\u{1F98E}", personality: "fierce", rarity: "uncommon" },
  { name: "Coral Turtle", emoji: "\u{1F422}", personality: "calm", rarity: "common" },
  { name: "Starlight Cat", emoji: "\u{1F431}", personality: "mysterious", rarity: "rare" },
  { name: "Berry Hamster", emoji: "\u{1F439}", personality: "playful", rarity: "common" },
  { name: "Wind Parrot", emoji: "\u{1F99C}", personality: "chatty", rarity: "uncommon" },
];

const RARITY_COLORS: Record<string, string> = {
  common: "#9e9e9e",
  uncommon: "#4caf50",
  rare: "#a855f7",
};

const RARITY_BG: Record<string, string> = {
  common: "linear-gradient(135deg, #9e9e9e10, transparent)",
  uncommon: "linear-gradient(135deg, #4caf5015, transparent)",
  rare: "linear-gradient(135deg, #a855f720, #f59e0b08)",
};

// ── Explore Data ──
const EXPLORE_LOCATIONS = [
  { name: "Ancient Ruins", emoji: "\u{1F3DA}\uFE0F", type: "treasure" as const, desc: "Crumbling stones hide forgotten wealth" },
  { name: "Sunlit Meadow", emoji: "\u{1F33B}", type: "rest" as const, desc: "Warm grass and gentle breeze" },
  { name: "Training Dojo", emoji: "\u{1F94B}", type: "training" as const, desc: "A master awaits within" },
  { name: "Crystal Cave", emoji: "\u{1F48E}", type: "treasure" as const, desc: "Glimmering gems line the walls" },
  { name: "Hot Springs", emoji: "\u2668\uFE0F", type: "rest" as const, desc: "Rejuvenating mineral waters" },
  { name: "Obstacle Course", emoji: "\u{1F3CB}\uFE0F", type: "training" as const, desc: "Test your pet's limits" },
  { name: "Pirate Cove", emoji: "\u{1F3F4}\u200D\u2620\uFE0F", type: "treasure" as const, desc: "X marks the spot" },
  { name: "Zen Garden", emoji: "\u{1F33F}", type: "rest" as const, desc: "Inner peace and recovery" },
  { name: "Sparring Ring", emoji: "\u{1F94A}", type: "training" as const, desc: "Practice makes perfect" },
];

const LOCATION_COLORS: Record<string, { accent: string; bg: string }> = {
  treasure: { accent: "#ffa726", bg: "linear-gradient(135deg, #2a1a0a 0%, #111118 100%)" },
  training: { accent: "#a855f7", bg: "linear-gradient(135deg, #1a0a2a 0%, #111118 100%)" },
  rest: { accent: "#4ade80", bg: "linear-gradient(135deg, #0a2a1a 0%, #111118 100%)" },
};

// ── Glass card style helper ──
function glassCard(accent: string, extra?: React.CSSProperties): React.CSSProperties {
  return {
    background: `linear-gradient(135deg, ${accent}08 0%, rgba(15,15,25,0.8) 100%)`,
    backdropFilter: "blur(12px)",
    WebkitBackdropFilter: "blur(12px)",
    border: `1px solid ${accent}20`,
    borderRadius: 16,
    ...extra,
  };
}

// ── Animated HP Bar component ──
function HpBar({ value, max, color, height = 6, showLabel = false }: {
  value: number; max: number; color?: string; height?: number; showLabel?: boolean;
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const barColor = color || (pct > 60 ? "#4ade80" : pct > 30 ? "#facc15" : "#ef4444");
  return (
    <div style={{ width: "100%", position: "relative" }}>
      {showLabel && (
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
          <span style={{ fontSize: 9, color: "#666", fontWeight: 600 }}>{Math.round(value)}/{max}</span>
        </div>
      )}
      <div style={{
        width: "100%", height, borderRadius: height,
        background: "rgba(255,255,255,0.06)",
        overflow: "hidden",
        position: "relative",
      }}>
        <div style={{
          height: "100%", borderRadius: height,
          width: `${pct}%`,
          background: `linear-gradient(90deg, ${barColor}, ${barColor}cc)`,
          boxShadow: `0 0 8px ${barColor}40`,
          transition: "width 0.8s cubic-bezier(0.4, 0, 0.2, 1), background 0.5s ease",
          position: "relative",
        }}>
          {/* Glowing edge */}
          <div style={{
            position: "absolute", right: 0, top: 0, bottom: 0, width: 4,
            background: `linear-gradient(90deg, transparent, ${barColor})`,
            filter: "blur(2px)",
            borderRadius: height,
          }} />
        </div>
      </div>
    </div>
  );
}

// ── Skeleton Loading ──
function SkeletonCard({ count = 3 }: { count?: number }) {
  return (
    <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap", padding: "20px 0" }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{
          width: 130, height: 160, borderRadius: 14,
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.05)",
          animation: `skeletonPulse 1.5s ease-in-out infinite ${i * 0.2}s`,
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10,
        }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: "rgba(255,255,255,0.04)" }} />
          <div style={{ width: 60, height: 8, borderRadius: 4, background: "rgba(255,255,255,0.04)" }} />
          <div style={{ width: 40, height: 6, borderRadius: 3, background: "rgba(255,255,255,0.03)" }} />
        </div>
      ))}
    </div>
  );
}

// ── Particle Burst effect ──
function ParticleBurst({ color = "#f59e0b", count = 8 }: { color?: string; count?: number }) {
  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      {Array.from({ length: count }).map((_, i) => {
        const angle = (360 / count) * i;
        const px = Math.cos(angle * Math.PI / 180) * (40 + Math.random() * 30);
        const py = Math.sin(angle * Math.PI / 180) * (40 + Math.random() * 30);
        return (
          <div key={i} style={{
            position: "absolute", left: "50%", top: "50%",
            width: 6, height: 6, borderRadius: "50%",
            background: color,
            boxShadow: `0 0 6px ${color}`,
            animation: `particleBurst 0.8s ease-out ${i * 0.05}s forwards`,
            ["--px" as any]: `${px}px`,
            ["--py" as any]: `${py}px`,
          }} />
        );
      })}
    </div>
  );
}


// ── Shared Back Button ──
function BackButton({ onClick, accent }: { onClick: () => void; accent: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        ...glassCard(accent, {
          padding: "10px 20px",
          cursor: "pointer",
          marginBottom: 20,
          transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
          fontFamily: "inherit",
          color: accent,
          fontSize: 13,
          fontWeight: 600,
          letterSpacing: 1,
        }),
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor = `${accent}55`;
        (e.currentTarget as HTMLElement).style.transform = "translateX(-2px)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor = `${accent}20`;
        (e.currentTarget as HTMLElement).style.transform = "translateX(0)";
      }}
    >
      <span style={{ fontSize: 16, transition: "transform 0.2s ease" }}>{"\u2190"}</span>
      Back to Adventure
    </button>
  );
}

// ── RPG Action Button ──
function RpgButton({ onClick, disabled, emoji, label, desc, color, index = 0 }: {
  onClick: () => void; disabled?: boolean; emoji: React.ReactNode; label: string;
  desc: string; color: string; index?: number;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        ...glassCard(color, {
          padding: "16px 20px",
          cursor: disabled ? "not-allowed" : "pointer",
          textAlign: "center" as const,
          transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
          fontFamily: "inherit",
          opacity: disabled ? 0.5 : 1,
          minWidth: 120,
          position: "relative" as const,
          overflow: "hidden" as const,
          animation: `fadeInUp 0.4s ease-out ${index * 0.1}s both`,
        }),
      }}
      onMouseEnter={(e) => {
        if (!disabled) {
          (e.currentTarget as HTMLElement).style.borderColor = `${color}60`;
          (e.currentTarget as HTMLElement).style.transform = "translateY(-4px) scale(1.02)";
          (e.currentTarget as HTMLElement).style.boxShadow = `0 8px 24px ${color}20`;
        }
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor = `${color}20`;
        (e.currentTarget as HTMLElement).style.transform = "translateY(0) scale(1)";
        (e.currentTarget as HTMLElement).style.boxShadow = "none";
      }}
    >
      {/* Shimmer overlay */}
      <div style={{
        position: "absolute", inset: 0,
        background: `linear-gradient(105deg, transparent 40%, ${color}08 50%, transparent 60%)`,
        backgroundSize: "200% 100%",
        animation: "cardShimmer 3s ease-in-out infinite",
        pointerEvents: "none",
      }} />
      <div style={{ fontSize: 28, marginBottom: 6, position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>{emoji}</div>
      <div style={{
        color, fontSize: 14, fontWeight: 700, letterSpacing: 0.5,
        position: "relative",
      }}>{label}</div>
      <div style={{
        color: "#555", fontSize: 9, marginTop: 4, letterSpacing: 0.3,
        position: "relative",
      }}>{desc}</div>
    </button>
  );
}

// ── Pet Selector (shared by wild, explore, gym) ──
function PetSelector({ pets, onSelect, accent, loading }: {
  pets: Pet[];
  onSelect: (pet: Pet) => void;
  accent: string;
  loading: boolean;
}) {
  if (loading) {
    return <SkeletonCard count={3} />;
  }
  if (pets.length === 0) {
    return (
      <div style={{
        textAlign: "center", padding: 40,
        ...glassCard("#666", { padding: "40px 20px" }),
      }}>
        <div style={{ fontSize: 32, marginBottom: 10, opacity: 0.5 }}>{"\u{1F43E}"}</div>
        <div style={{ color: "#666", fontSize: 13 }}>No pets found. Adopt a pet first!</div>
      </div>
    );
  }
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
      gap: 14,
      maxWidth: 600,
      margin: "0 auto",
    }}>
      {pets.map((pet, idx) => {
        const mood = MOOD_MAP[pet.current_mood || ""] || MOOD_MAP.happy;

        return (
          <button
            key={pet.id}
            onClick={() => onSelect(pet)}
            style={{
              ...glassCard(accent, {
                padding: "18px 14px",
                cursor: "pointer",
                textAlign: "center" as const,
                transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                fontFamily: "inherit",
                position: "relative" as const,
                overflow: "hidden" as const,
                animation: `fadeInUp 0.4s ease-out ${idx * 0.08}s both`,
              }),
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.borderColor = `${accent}55`;
              (e.currentTarget as HTMLElement).style.transform = "translateY(-6px) scale(1.03)";
              (e.currentTarget as HTMLElement).style.boxShadow = `0 12px 32px ${accent}15`;
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.borderColor = `${accent}20`;
              (e.currentTarget as HTMLElement).style.transform = "translateY(0) scale(1)";
              (e.currentTarget as HTMLElement).style.boxShadow = "none";
            }}
          >
            {/* Avatar */}
            <div style={{
              fontSize: 36, marginBottom: 8, position: "relative",
              display: "inline-block",
            }}>
              {pet.avatar_url ? (
                <img src={pet.avatar_url} alt="" style={{
                  width: 44, height: 44, borderRadius: 12, objectFit: "cover",
                  border: `2px solid ${accent}30`,
                }} />
              ) : (
                <span style={{ filter: "drop-shadow(0 2px 8px rgba(0,0,0,0.3))" }}>
                  {PET_EMOJIS[pet.species] || "\u{1F43E}"}
                </span>
              )}
              {/* Mood indicator */}
              <span style={{
                position: "absolute", bottom: -2, right: -6,
                fontSize: 14, filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.5))",
              }}>{mood.emoji}</span>
            </div>

            {/* Name & Level */}
            <div style={{ color: "#e0e0e0", fontSize: 13, fontWeight: 700, marginBottom: 2 }}>{pet.name}</div>
            <div style={{
              display: "inline-block",
              background: `${accent}15`, border: `1px solid ${accent}25`,
              borderRadius: 6, padding: "1px 8px",
              color: accent, fontSize: 10, fontWeight: 600, marginBottom: 8,
            }}>Lv.{pet.level}</div>

            {/* Mini stat bars */}
            <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ fontSize: 8, color: "#4ade80", width: 10 }}>{"\u26A1"}</span>
                <HpBar value={pet.energy} max={100} color="#4ade80" height={4} />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ fontSize: 8, color: "#f472b6", width: 10 }}>{"\u2764"}</span>
                <HpBar value={pet.happiness} max={100} color="#f472b6" height={4} />
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ══════════════════════════════════════════
// ── Wild Encounter Mode ──
// ══════════════════════════════════════════
function WildEncounter({ onBack }: { onBack: () => void }) {
  const [pets, setPets] = useState<Pet[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPet, setSelectedPet] = useState<Pet | null>(null);
  const [wildPet, setWildPet] = useState<(typeof WILD_PETS)[number] | null>(null);
  const [phase, setPhase] = useState<"select" | "flash" | "encounter" | "result">("select");
  const [result, setResult] = useState<{ action: string; success: boolean; message: string; rewards: string; hasSkill?: boolean } | null>(null);
  const [acting, setActing] = useState(false);
  const [showParticles, setShowParticles] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.pets.list()
      .then((data: any) => { if (!cancelled) setPets(data.pets || data || []); })
      .catch(() => {
        if (!cancelled) setPets([
          { id: 1, name: "Luna", species: 0, personality_type: "playful", level: 5, experience: 320, happiness: 85, energy: 72, hunger: 45, bond_level: 68, total_interactions: 47 },
        ]);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const startEncounter = useCallback((pet: Pet) => {
    setSelectedPet(pet);
    setWildPet(WILD_PETS[Math.floor(Math.random() * WILD_PETS.length)]);
    setResult(null);
    setShowParticles(false);
    // Flash screen before encounter
    setPhase("flash");
    setTimeout(() => setPhase("encounter"), 600);
  }, []);

  const doAction = useCallback(async (action: "befriend" | "feed" | "flee") => {
    if (!selectedPet || !wildPet || acting) return;
    setActing(true);

    try {
      // Call real adventure API
      const data = await api.adventure.play("wild", selectedPet.id);
      const { outcomes, rewards: rew } = data;

      const success = action !== "flee" && (rew.exp > 10 || rew.credits > 0 || rew.skill);
      const message = outcomes.join(" ");
      const rewardParts = [];
      if (rew.exp) rewardParts.push(`+${rew.exp} EXP`);
      if (rew.credits) rewardParts.push(`+${rew.credits} Credits`);
      if (rew.skill) rewardParts.push(`New Skill: ${rew.skill}!`);

      setResult({
        action,
        success,
        message,
        rewards: rewardParts.join(", ") || "+EXP",
        hasSkill: !!rew.skill,
      });
    } catch {
      // Fallback to local calculation
      const success = action === "flee" || Math.random() < 0.6;
      setResult({
        action,
        success,
        message: success
          ? `${selectedPet.name} had a successful encounter with ${wildPet.name}!`
          : `The ${wildPet.name} got away...`,
        rewards: success ? "+15 EXP" : "+5 EXP",
      });
    }

    setShowParticles(true);
    setPhase("result");
    setActing(false);
  }, [selectedPet, wildPet, acting]);

  const accent = "#6bcf7f";

  return (
    <div style={{ position: "relative" }}>
      <BackButton onClick={onBack} accent={accent} />

      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <h3 style={{
          color: "#e0e0e0", fontSize: 20, fontWeight: 800, letterSpacing: 2, margin: 0,
          background: `linear-gradient(135deg, ${accent}, #a3e635)`,
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
        }}>
          WILD ENCOUNTER
        </h3>
        <p style={{ color: "#555", fontSize: 11, marginTop: 6, letterSpacing: 0.5 }}>
          {phase === "select" ? "Choose a pet to venture into the wild" : phase === "encounter" || phase === "flash" ? "A wild pet appeared!" : "Encounter complete"}
        </p>
      </div>

      {phase === "select" && (
        <div style={{ animation: "fadeIn 0.4s ease-out" }}>
          <PetSelector pets={pets} onSelect={startEncounter} accent={accent} loading={loading} />
        </div>
      )}

      {/* Encounter flash effect */}
      {phase === "flash" && (
        <div style={{
          position: "absolute", inset: 0, zIndex: 10,
          animation: "encounterFlash 0.6s ease-out forwards",
          background: "#fff",
          borderRadius: 16,
          pointerEvents: "none",
        }} />
      )}

      {phase === "encounter" && wildPet && selectedPet && (
        <div style={{
          ...glassCard(accent, {
            padding: "28px 24px",
            textAlign: "center" as const,
            position: "relative" as const,
            overflow: "hidden" as const,
          }),
          background: "linear-gradient(180deg, #0a1a0a 0%, rgba(15,15,25,0.9) 100%)",
        }}>
          {/* Battle arena layout */}
          <div style={{
            display: "flex", justifyContent: "space-around", alignItems: "center",
            marginBottom: 24, gap: 16, flexWrap: "wrap",
          }}>
            {/* Your pet card */}
            <div style={{
              ...glassCard("#60a5fa", {
                padding: "16px 20px",
                textAlign: "center" as const,
                minWidth: 120,
                animation: "playerSlideIn 0.6s cubic-bezier(0.2, 0, 0.2, 1)",
              }),
            }}>
              <div style={{ fontSize: 40, marginBottom: 6 }}>
                {selectedPet.avatar_url ? (
                  <img src={selectedPet.avatar_url} alt="" style={{
                    width: 44, height: 44, borderRadius: 10, objectFit: "cover",
                  }} />
                ) : (
                  PET_EMOJIS[selectedPet.species] || "\u{1F43E}"
                )}
              </div>
              <div style={{ color: "#e0e0e0", fontSize: 13, fontWeight: 700 }}>{selectedPet.name}</div>
              <div style={{
                display: "inline-block", background: "#60a5fa18",
                border: "1px solid #60a5fa30", borderRadius: 6,
                padding: "1px 8px", color: "#60a5fa", fontSize: 10, fontWeight: 600,
                marginTop: 4, marginBottom: 6,
              }}>Lv.{selectedPet.level}</div>
              <HpBar value={selectedPet.energy} max={100} height={5} />
            </div>

            {/* VS badge */}
            <div style={{
              color: "#f59e0b", fontSize: 16, fontWeight: 900, letterSpacing: 2,
              textShadow: "0 0 12px rgba(245,158,11,0.4)",
            }}>VS</div>

            {/* Wild pet card */}
            <div style={{
              ...glassCard(RARITY_COLORS[wildPet.rarity], {
                padding: "16px 20px",
                textAlign: "center" as const,
                minWidth: 120,
                animation: "wildAppear 0.6s cubic-bezier(0.2, 0, 0.2, 1)",
              }),
              background: RARITY_BG[wildPet.rarity],
            }}>
              <div style={{ fontSize: 40, marginBottom: 6, animation: "bounce 2.5s ease-in-out infinite" }}>
                {wildPet.emoji}
              </div>
              <div style={{ color: "#e0e0e0", fontSize: 13, fontWeight: 700 }}>{wildPet.name}</div>
              <div style={{ display: "flex", justifyContent: "center", gap: 6, marginTop: 6 }}>
                <span style={{
                  fontSize: 9, fontWeight: 700, padding: "2px 8px", borderRadius: 6,
                  background: `${RARITY_COLORS[wildPet.rarity]}18`,
                  color: RARITY_COLORS[wildPet.rarity],
                  border: `1px solid ${RARITY_COLORS[wildPet.rarity]}35`,
                  textTransform: "uppercase" as const, letterSpacing: 1,
                }}>
                  {wildPet.rarity}
                </span>
                <span style={{
                  fontSize: 9, fontWeight: 500, padding: "2px 8px", borderRadius: 6,
                  background: "rgba(255,255,255,0.05)",
                  color: "#777",
                }}>
                  {wildPet.personality}
                </span>
              </div>
            </div>
          </div>

          {/* Action buttons (RPG menu style) */}
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            {[
              { key: "befriend" as const, label: "Befriend", emoji: <Icon name="heart" size={28} />, color: "#6bcf7f", desc: "+EXP, +Bond, $PET chance" },
              { key: "feed" as const, label: "Feed", emoji: "\u{1F356}", color: "#ffa726", desc: "+EXP, Hunger recovery" },
              { key: "flee" as const, label: "Flee", emoji: "\u{1F4A8}", color: "#90a4ae", desc: "Safe retreat, +2 EXP" },
            ].map((act, i) => (
              <RpgButton
                key={act.key}
                onClick={() => doAction(act.key)}
                disabled={acting}
                emoji={act.emoji}
                label={act.label}
                desc={act.desc}
                color={act.color}
                index={i}
              />
            ))}
          </div>
        </div>
      )}

      {phase === "result" && result && wildPet && (
        <div style={{
          ...glassCard(result.success ? accent : "#f87171", {
            padding: "32px 24px",
            textAlign: "center" as const,
            animation: "fadeInScale 0.5s ease-out",
            position: "relative" as const,
            overflow: "hidden" as const,
          }),
          background: "linear-gradient(180deg, #0a1a0a 0%, rgba(15,15,25,0.9) 100%)",
        }}>
          {/* Particle burst on success */}
          {showParticles && result.success && (
            <ParticleBurst color={result.hasSkill ? "#f59e0b" : accent} count={12} />
          )}

          <div style={{
            fontSize: 64, marginBottom: 16, position: "relative",
            animation: "resultPop 0.6s cubic-bezier(0.2, 0, 0.2, 1)",
            filter: result.hasSkill ? "drop-shadow(0 0 20px rgba(245,158,11,0.6))" : undefined,
          }}>
            {result.success ? (result.action === "flee" ? "\u{1F4A8}" : "\u2728") : "\u{1F343}"}
          </div>
          <div style={{
            color: result.success ? accent : "#f87171",
            fontSize: 20, fontWeight: 800, marginBottom: 8, letterSpacing: 2,
          }}>
            {result.success ? (result.action === "flee" ? "SAFE RETREAT" : "SUCCESS!") : "NO LUCK..."}
          </div>
          <div style={{
            color: "#999", fontSize: 13, marginBottom: 20, lineHeight: 1.6, maxWidth: 400, margin: "0 auto 20px",
          }}>
            {result.message}
          </div>

          {/* Rewards card */}
          <div style={{
            display: "inline-block",
            ...glassCard(result.hasSkill ? "#f59e0b" : accent, {
              padding: "10px 24px",
              marginBottom: 24,
            }),
            animation: result.hasSkill ? "skillGlow 1.5s ease-in-out infinite" : undefined,
          }}>
            <span style={{
              color: result.hasSkill ? "#f59e0b" : accent,
              fontSize: 13, fontWeight: 700,
            }}>{result.rewards}</span>
          </div>

          <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
            <button
              onClick={() => { setPhase("flash"); setWildPet(WILD_PETS[Math.floor(Math.random() * WILD_PETS.length)]); setResult(null); setShowParticles(false); setTimeout(() => setPhase("encounter"), 600); }}
              style={{
                ...glassCard(accent, {
                  padding: "10px 24px", cursor: "pointer", fontFamily: "inherit",
                  color: accent, fontSize: 12, fontWeight: 600,
                  transition: "all 0.25s ease",
                }),
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.transform = "translateY(0)"; }}
            >
              New Encounter
            </button>
            <button
              onClick={() => { setPhase("select"); setSelectedPet(null); setWildPet(null); setResult(null); setShowParticles(false); }}
              style={{
                ...glassCard("#888", {
                  padding: "10px 24px", cursor: "pointer", fontFamily: "inherit",
                  color: "#888", fontSize: 12, fontWeight: 600,
                  transition: "all 0.25s ease",
                }),
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.transform = "translateY(0)"; }}
            >
              Change Pet
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════
// ── Explore Mode ──
// ══════════════════════════════════════════
function Explore({ onBack }: { onBack: () => void }) {
  const [pets, setPets] = useState<Pet[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPet, setSelectedPet] = useState<Pet | null>(null);
  const [phase, setPhase] = useState<"select" | "exploring" | "results">("select");
  const [locations, setLocations] = useState<(typeof EXPLORE_LOCATIONS)[number][]>([]);
  const [revealed, setRevealed] = useState<boolean[]>([false, false, false]);
  const [rewards, setRewards] = useState<(string | null)[]>([null, null, null]);
  const [allRevealed, setAllRevealed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.pets.list()
      .then((data: any) => { if (!cancelled) setPets(data.pets || data || []); })
      .catch(() => {
        if (!cancelled) setPets([
          { id: 1, name: "Luna", species: 0, personality_type: "playful", level: 5, experience: 320, happiness: 85, energy: 72, hunger: 45, bond_level: 68, total_interactions: 47 },
        ]);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const startExploring = useCallback((pet: Pet) => {
    setSelectedPet(pet);
    // Pick 3 random locations
    const shuffled = [...EXPLORE_LOCATIONS].sort(() => Math.random() - 0.5);
    setLocations(shuffled.slice(0, 3));
    setRevealed([false, false, false]);
    setRewards([null, null, null]);
    setAllRevealed(false);
    setPhase("exploring");
  }, []);

  const revealLocation = useCallback(async (index: number) => {
    if (revealed[index] || !selectedPet) return;

    let rewardText = "";

    try {
      const data = await api.adventure.play("explore", selectedPet.id);
      const { outcomes, rewards: rew } = data;
      const parts = [];
      if (rew.exp) parts.push(`+${rew.exp} EXP`);
      if (rew.credits) parts.push(`+${rew.credits} Credits`);
      if (rew.happiness) parts.push(`+${rew.happiness} Happiness`);
      if (rew.skill) parts.push(`Skill: ${rew.skill}!`);
      rewardText = parts.join(", ") || outcomes[0] || "+EXP";
    } catch {
      // Fallback
      const loc = locations[index];
      if (loc.type === "treasure") {
        rewardText = `Found +${5 + Math.floor(Math.random() * 16)} Credits!`;
      } else if (loc.type === "training") {
        rewardText = `Gained +${10 + Math.floor(Math.random() * 11)} EXP!`;
      } else {
        rewardText = `Recovered +${10 + Math.floor(Math.random() * 11)} Energy!`;
      }
    }

    const newRevealed = [...revealed];
    newRevealed[index] = true;
    setRevealed(newRevealed);

    const newRewards = [...rewards];
    newRewards[index] = rewardText;
    setRewards(newRewards);

    if (newRevealed.every(Boolean)) {
      setAllRevealed(true);
    }
  }, [revealed, rewards, locations, selectedPet]);

  const accent = "#64b5f6";
  const revealedCount = revealed.filter(Boolean).length;
  const progressPct = (revealedCount / 3) * 100;

  return (
    <div>
      <BackButton onClick={onBack} accent={accent} />

      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <h3 style={{
          color: "#e0e0e0", fontSize: 20, fontWeight: 800, letterSpacing: 2, margin: 0,
          background: `linear-gradient(135deg, ${accent}, #a78bfa)`,
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
        }}>
          EXPLORE
        </h3>
        <p style={{ color: "#555", fontSize: 11, marginTop: 6, letterSpacing: 0.5 }}>
          {phase === "select" ? "Choose a pet to explore with" : "Tap locations to discover what lies within"}
        </p>
      </div>

      {phase === "select" && (
        <div style={{ animation: "fadeIn 0.4s ease-out" }}>
          <PetSelector pets={pets} onSelect={startExploring} accent={accent} loading={loading} />
        </div>
      )}

      {phase === "exploring" && selectedPet && (
        <div style={{
          ...glassCard(accent, { padding: "24px 20px" }),
          background: "linear-gradient(180deg, #0a0a1e 0%, rgba(15,15,25,0.9) 100%)",
          animation: "fadeInScale 0.4s ease-out",
        }}>
          {/* Explorer info */}
          <div style={{
            display: "flex", justifyContent: "center", alignItems: "center", gap: 10,
            marginBottom: 16,
          }}>
            <span style={{ fontSize: 20 }}>
              {selectedPet.avatar_url ? (
                <img src={selectedPet.avatar_url} alt="" style={{ width: 24, height: 24, borderRadius: 6, objectFit: "cover" }} />
              ) : PET_EMOJIS[selectedPet.species] || "\u{1F43E}"}
            </span>
            <span style={{ color: "#888", fontSize: 11, letterSpacing: 1 }}>
              {selectedPet.name} ventures into the unknown...
            </span>
          </div>

          {/* Progress indicator */}
          <div style={{ maxWidth: 300, margin: "0 auto 20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontSize: 9, color: "#555", fontWeight: 600, letterSpacing: 1 }}>EXPLORATION</span>
              <span style={{ fontSize: 9, color: accent, fontWeight: 600 }}>{revealedCount}/3</span>
            </div>
            <div style={{
              width: "100%", height: 4, borderRadius: 4,
              background: "rgba(255,255,255,0.06)", overflow: "hidden",
            }}>
              <div style={{
                height: "100%", borderRadius: 4,
                width: `${progressPct}%`,
                background: `linear-gradient(90deg, ${accent}, #a78bfa)`,
                boxShadow: `0 0 10px ${accent}40`,
                transition: "width 0.6s cubic-bezier(0.4, 0, 0.2, 1)",
              }} />
            </div>
          </div>

          {/* Location cards */}
          <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" }}>
            {locations.map((loc, i) => {
              const lc = LOCATION_COLORS[loc.type];
              const isRevealed = revealed[i];
              const animationType = loc.type === "treasure" ? "sparkle" : loc.type === "rest" ? "campfireFlicker" : "iconPulse";

              return (
                <button
                  key={i}
                  onClick={() => revealLocation(i)}
                  disabled={isRevealed}
                  style={{
                    width: 155,
                    minHeight: 190,
                    ...(isRevealed
                      ? glassCard(lc.accent, {
                          padding: "20px 14px",
                          cursor: "default" as const,
                          textAlign: "center" as const,
                          fontFamily: "inherit",
                          animation: "revealLocation 0.6s cubic-bezier(0.2, 0, 0.2, 1)",
                          perspective: "800px",
                          transformStyle: "preserve-3d" as const,
                        })
                      : glassCard(accent, {
                          padding: "20px 14px",
                          cursor: "pointer",
                          textAlign: "center" as const,
                          fontFamily: "inherit",
                          transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                        })
                    ),
                    background: isRevealed ? lc.bg : "linear-gradient(180deg, #16161e 0%, rgba(15,15,25,0.9) 100%)",
                  } as React.CSSProperties}
                  onMouseEnter={(e) => {
                    if (!isRevealed) {
                      (e.currentTarget as HTMLElement).style.borderColor = `${accent}55`;
                      (e.currentTarget as HTMLElement).style.transform = "translateY(-6px) scale(1.03)";
                      (e.currentTarget as HTMLElement).style.boxShadow = `0 12px 32px ${accent}15`;
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isRevealed) {
                      (e.currentTarget as HTMLElement).style.borderColor = `${accent}20`;
                      (e.currentTarget as HTMLElement).style.transform = "translateY(0) scale(1)";
                      (e.currentTarget as HTMLElement).style.boxShadow = "none";
                    }
                  }}
                >
                  {isRevealed ? (
                    <>
                      <div style={{
                        fontSize: 40, marginBottom: 8, position: "relative",
                        animation: `${animationType} 2.5s ease-in-out infinite`,
                      }}>
                        {loc.emoji}
                        {loc.type === "treasure" && (
                          <span style={{
                            position: "absolute", top: -4, right: -8, fontSize: 12,
                            animation: "sparkle 1.5s ease-in-out infinite 0.3s",
                          }}>{"\u2728"}</span>
                        )}
                      </div>
                      <div style={{ color: "#e0e0e0", fontSize: 12, fontWeight: 700, marginBottom: 4 }}>{loc.name}</div>
                      <div style={{ color: "#666", fontSize: 10, marginBottom: 10, lineHeight: 1.3 }}>{loc.desc}</div>
                      <div style={{
                        ...glassCard(lc.accent, {
                          padding: "6px 12px",
                        }),
                        background: `${lc.accent}12`,
                      }}>
                        <span style={{
                          color: lc.accent, fontSize: 11, fontWeight: 600,
                        }}>{rewards[i]}</span>
                      </div>
                    </>
                  ) : (
                    <>
                      {/* Fog of war card */}
                      <div style={{
                        fontSize: 40, marginBottom: 8, opacity: 0.15,
                        filter: "blur(2px)",
                      }}>{"?"}</div>
                      <div style={{ color: "#444", fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Unknown</div>
                      <div style={{ color: "#333", fontSize: 10, marginTop: 6, letterSpacing: 0.5 }}>Tap to explore</div>
                      {/* Subtle shimmer overlay */}
                      <div style={{
                        position: "absolute", inset: 0, borderRadius: 16, pointerEvents: "none",
                        background: `linear-gradient(105deg, transparent 40%, ${accent}06 50%, transparent 60%)`,
                        backgroundSize: "200% 100%",
                        animation: "cardShimmer 4s ease-in-out infinite",
                      }} />
                    </>
                  )}
                </button>
              );
            })}
          </div>

          {allRevealed && (
            <div style={{ textAlign: "center", marginTop: 28, animation: "fadeInUp 0.5s ease-out" }}>
              <div style={{
                color: accent, fontSize: 16, fontWeight: 800, marginBottom: 14, letterSpacing: 2,
              }}>
                EXPLORATION COMPLETE
              </div>
              <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                <button
                  onClick={() => startExploring(selectedPet)}
                  style={{
                    ...glassCard(accent, {
                      padding: "10px 24px", cursor: "pointer", fontFamily: "inherit",
                      color: accent, fontSize: 12, fontWeight: 600,
                      transition: "all 0.25s ease",
                    }),
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.transform = "translateY(0)"; }}
                >
                  Explore Again
                </button>
                <button
                  onClick={() => { setPhase("select"); setSelectedPet(null); }}
                  style={{
                    ...glassCard("#888", {
                      padding: "10px 24px", cursor: "pointer", fontFamily: "inherit",
                      color: "#888", fontSize: 12, fontWeight: 600,
                      transition: "all 0.25s ease",
                    }),
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.transform = "translateY(0)"; }}
                >
                  Change Pet
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════
// ── Gym Challenge Mode ──
// ══════════════════════════════════════════
function GymChallenge({ onBack }: { onBack: () => void }) {
  const [pets, setPets] = useState<Pet[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPet, setSelectedPet] = useState<Pet | null>(null);
  const [phase, setPhase] = useState<"select" | "choose_stat" | "challenge" | "result">("select");
  const [stat, setStat] = useState<"Strength" | "Speed" | "Endurance" | null>(null);
  const [targetPos, setTargetPos] = useState(50);
  const [cursorPos, setCursorPos] = useState(0);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string; rewards: string } | null>(null);
  const [resultAnim, setResultAnim] = useState<"shake" | "burst" | null>(null);
  const animRef = useRef<number | null>(null);
  const startTimeRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    api.pets.list()
      .then((data: any) => { if (!cancelled) setPets(data.pets || data || []); })
      .catch(() => {
        if (!cancelled) setPets([
          { id: 1, name: "Luna", species: 0, personality_type: "playful", level: 5, experience: 320, happiness: 85, energy: 72, hunger: 45, bond_level: 68, total_interactions: 47 },
        ]);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const chooseStat = useCallback((pet: Pet) => {
    setSelectedPet(pet);
    setPhase("choose_stat");
  }, []);

  const startChallenge = useCallback((chosenStat: "Strength" | "Speed" | "Endurance") => {
    setStat(chosenStat);
    // Random target zone position
    setTargetPos(20 + Math.floor(Math.random() * 60));
    setCursorPos(0);
    setRunning(true);
    setPhase("challenge");
    startTimeRef.current = Date.now();
    setResultAnim(null);
  }, []);

  // Animate the cursor sweeping back and forth
  useEffect(() => {
    if (phase !== "challenge" || !running) return;

    let raf: number;
    const speed = stat === "Speed" ? 0.12 : stat === "Strength" ? 0.08 : 0.06;

    const animate = () => {
      const elapsed = Date.now() - startTimeRef.current;
      // Oscillate 0-100
      const raw = (elapsed * speed) % 200;
      const pos = raw <= 100 ? raw : 200 - raw;
      setCursorPos(pos);
      raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);
    animRef.current = raf;

    return () => { cancelAnimationFrame(raf); };
  }, [phase, running, stat]);

  const hitTarget = useCallback(async () => {
    if (!running || !selectedPet || !stat) return;
    setRunning(false);
    if (animRef.current) cancelAnimationFrame(animRef.current);

    // Check accuracy: target zone is +/- 8 from targetPos
    const distance = Math.abs(cursorPos - targetPos);
    const timingSuccess = distance <= 8;
    const close = distance <= 15;

    let finalSuccess = timingSuccess;
    let message = "";
    let rewards = "";

    try {
      const data = await api.adventure.play("gym", selectedPet.id);
      const { outcomes, success: apiSuccess, leveled_up, rewards: rew } = data;
      finalSuccess = timingSuccess && apiSuccess;
      message = outcomes.join(" ");
      const rewardParts = [];
      if (rew.exp) rewardParts.push(`+${rew.exp} EXP`);
      if (leveled_up) rewardParts.push("LEVEL UP!");
      rewards = rewardParts.join(", ") || message;
    } catch {
      if (timingSuccess) {
        message = `Perfect timing! ${selectedPet.name}'s ${stat} has improved significantly!`;
        rewards = `+20 EXP, ${stat} boosted`;
      } else if (close) {
        message = `Almost there! ${selectedPet.name} still gained some experience from the effort.`;
        rewards = "+10 EXP (close attempt)";
      } else {
        message = `Missed the mark. ${selectedPet.name} gets a consolation workout.`;
        rewards = "+5 EXP (consolation)";
      }
    }

    // Trigger animation
    setResultAnim(finalSuccess ? "burst" : "shake");
    setTimeout(() => {
      setResult({ success: finalSuccess, message, rewards });
      setPhase("result");
    }, finalSuccess ? 100 : 400);
  }, [running, cursorPos, targetPos, selectedPet, stat]);

  const accent = "#ffa726";

  const STAT_OPTIONS: { key: "Strength" | "Speed" | "Endurance"; emoji: React.ReactNode; color: string; desc: string }[] = [
    { key: "Strength", emoji: <Icon name="sword" size={28} />, color: "#f97316", desc: "Power and attack force" },
    { key: "Speed", emoji: <Icon name="electric" size={28} />, color: "#facc15", desc: "Quick reflexes (faster cursor)" },
    { key: "Endurance", emoji: <Icon name="shield" size={28} />, color: "#4ade80", desc: "Stamina and defense" },
  ];

  return (
    <div>
      <BackButton onClick={onBack} accent={accent} />

      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <h3 style={{
          color: "#e0e0e0", fontSize: 20, fontWeight: 800, letterSpacing: 2, margin: 0,
          background: `linear-gradient(135deg, ${accent}, #f97316)`,
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
        }}>
          GYM CHALLENGE
        </h3>
        <p style={{ color: "#555", fontSize: 11, marginTop: 6, letterSpacing: 0.5 }}>
          {phase === "select" ? "Choose a pet to train" :
           phase === "choose_stat" ? "Select a stat to train" :
           phase === "challenge" ? "Hit the target zone!" : "Training complete"}
        </p>
      </div>

      {phase === "select" && (
        <div style={{ animation: "fadeIn 0.4s ease-out" }}>
          <PetSelector pets={pets} onSelect={chooseStat} accent={accent} loading={loading} />
        </div>
      )}

      {phase === "choose_stat" && selectedPet && (
        <div style={{
          ...glassCard(accent, { padding: "24px 20px" }),
          background: "linear-gradient(180deg, #1a1408 0%, rgba(15,15,25,0.9) 100%)",
          animation: "fadeInScale 0.4s ease-out",
        }}>
          <div style={{
            display: "flex", justifyContent: "center", alignItems: "center", gap: 8,
            marginBottom: 20,
          }}>
            <span style={{ fontSize: 18 }}>
              {PET_EMOJIS[selectedPet.species] || "\u{1F43E}"}
            </span>
            <span style={{ color: "#888", fontSize: 11, letterSpacing: 1 }}>
              {selectedPet.name} enters the gym. Choose a training focus:
            </span>
          </div>

          <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" }}>
            {STAT_OPTIONS.map((s, idx) => (
              <RpgButton
                key={s.key}
                onClick={() => startChallenge(s.key)}
                emoji={s.emoji}
                label={s.key}
                desc={s.desc}
                color={s.color}
                index={idx}
              />
            ))}
          </div>
        </div>
      )}

      {phase === "challenge" && stat && (
        <div style={{
          ...glassCard(accent, {
            padding: "28px 24px",
            textAlign: "center" as const,
          }),
          background: "linear-gradient(180deg, #1a1408 0%, rgba(15,15,25,0.9) 100%)",
          animation: resultAnim === "shake" ? "screenShake 0.4s ease-out" : resultAnim === "burst" ? "goldenBurst 0.5s ease-out" : "fadeInScale 0.4s ease-out",
        }}>
          {/* Power meter */}
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 10, marginBottom: 6,
          }}>
            <span style={{ fontSize: 28, display: "inline-flex", alignItems: "center" }}>
              {stat === "Strength" ? <Icon name="sword" size={28} /> : stat === "Speed" ? <Icon name="electric" size={28} /> : <Icon name="shield" size={28} />}
            </span>
            <div>
              <div style={{ color: accent, fontSize: 16, fontWeight: 800, letterSpacing: 1 }}>
                Training: {stat}
              </div>
              <div style={{ color: "#555", fontSize: 11 }}>
                Click when the marker hits the target zone!
              </div>
            </div>
          </div>

          {/* Timing bar */}
          <div style={{
            position: "relative",
            width: "100%",
            maxWidth: 400,
            height: 48,
            background: "rgba(255,255,255,0.04)",
            borderRadius: 24,
            margin: "20px auto 28px",
            overflow: "hidden",
            border: "1px solid rgba(255,255,255,0.08)",
            boxShadow: "inset 0 2px 8px rgba(0,0,0,0.3)",
          }}>
            {/* Gradient track marks */}
            {Array.from({ length: 20 }).map((_, i) => (
              <div key={i} style={{
                position: "absolute", left: `${i * 5}%`, top: 0, bottom: 0,
                width: 1, background: "rgba(255,255,255,0.03)",
              }} />
            ))}

            {/* Target zone */}
            <div style={{
              position: "absolute",
              left: `${targetPos - 8}%`,
              width: "16%",
              height: "100%",
              background: `linear-gradient(180deg, ${accent}35, ${accent}15)`,
              borderRadius: 24,
              border: `2px solid ${accent}60`,
              animation: "gymPulse 1.5s ease infinite",
            }}>
              {/* Target center indicator */}
              <div style={{
                position: "absolute", left: "50%", top: "50%",
                transform: "translate(-50%, -50%)",
                width: 8, height: 8, borderRadius: "50%",
                background: accent, opacity: 0.6,
                boxShadow: `0 0 8px ${accent}`,
              }} />
            </div>

            {/* Moving cursor */}
            <div style={{
              position: "absolute",
              left: `calc(${cursorPos}% - 4px)`,
              top: 3,
              width: 8,
              height: 42,
              background: "linear-gradient(180deg, #fff, #ccc)",
              borderRadius: 4,
              boxShadow: "0 0 16px rgba(255,255,255,0.7), 0 0 4px rgba(255,255,255,0.9)",
              transition: "none",
            }} />
          </div>

          <button
            onClick={hitTarget}
            style={{
              ...glassCard(accent, {
                padding: "16px 56px",
                cursor: "pointer",
                fontFamily: "inherit",
                transition: "all 0.15s ease",
                fontSize: 18,
                fontWeight: 800,
                letterSpacing: 3,
                color: accent,
                textTransform: "uppercase" as const,
              }),
              background: `linear-gradient(135deg, ${accent}25, ${accent}10)`,
              border: `2px solid ${accent}50`,
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.transform = "scale(1.06)";
              (e.currentTarget as HTMLElement).style.boxShadow = `0 0 24px ${accent}30`;
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.transform = "scale(1)";
              (e.currentTarget as HTMLElement).style.boxShadow = "none";
            }}
          >
            STRIKE!
          </button>
        </div>
      )}

      {phase === "result" && result && stat && (
        <div style={{
          ...glassCard(result.success ? accent : "#666", {
            padding: "32px 24px",
            textAlign: "center" as const,
            position: "relative" as const,
            overflow: "hidden" as const,
          }),
          background: "linear-gradient(180deg, #1a1408 0%, rgba(15,15,25,0.9) 100%)",
          animation: result.success ? "goldenBurst 0.5s ease-out, fadeInScale 0.5s ease-out" : "fadeInScale 0.5s ease-out",
        }}>
          {/* Particles on success */}
          {result.success && <ParticleBurst color={accent} count={10} />}

          <div style={{
            fontSize: 64, marginBottom: 16, position: "relative",
            animation: "resultPop 0.6s cubic-bezier(0.2, 0, 0.2, 1)",
            filter: result.success ? `drop-shadow(0 0 20px ${accent}80)` : undefined,
          }}>
            {result.success ? "\u{1F3C6}" : "\u{1F4AA}"}
          </div>
          <div style={{
            color: result.success ? accent : "#aaa",
            fontSize: 22, fontWeight: 800, marginBottom: 8, letterSpacing: 2,
            animation: result.success ? "statCountUp 0.6s ease-out 0.2s both" : undefined,
          }}>
            {result.success ? "PERFECT TRAINING!" : "KEEP PRACTICING!"}
          </div>
          <div style={{
            color: "#999", fontSize: 13, marginBottom: 20, lineHeight: 1.6, maxWidth: 400, margin: "0 auto 20px",
          }}>
            {result.message}
          </div>

          {/* Animated reward card */}
          <div style={{
            display: "inline-block",
            ...glassCard(accent, { padding: "10px 24px", marginBottom: 24 }),
            animation: "statCountUp 0.5s ease-out 0.4s both",
          }}>
            <span style={{
              color: accent, fontSize: 14, fontWeight: 700,
            }}>{result.rewards}</span>
          </div>

          <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
            <button
              onClick={() => { setPhase("choose_stat"); setResult(null); setResultAnim(null); }}
              style={{
                ...glassCard(accent, {
                  padding: "10px 24px", cursor: "pointer", fontFamily: "inherit",
                  color: accent, fontSize: 12, fontWeight: 600,
                  transition: "all 0.25s ease",
                }),
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.transform = "translateY(0)"; }}
            >
              Train Again
            </button>
            <button
              onClick={() => { setPhase("select"); setSelectedPet(null); setStat(null); setResult(null); setResultAnim(null); }}
              style={{
                ...glassCard("#888", {
                  padding: "10px 24px", cursor: "pointer", fontFamily: "inherit",
                  color: "#888", fontSize: 12, fontWeight: 600,
                  transition: "all 0.25s ease",
                }),
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.transform = "translateY(0)"; }}
            >
              Change Pet
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════
// ── Main Adventure Component ──
// ══════════════════════════════════════════
export default function Adventure({ onNavigate }: { onNavigate?: (section: string) => void }) {
  const [booted, setBooted] = useState(false);
  const [bootProgress, setBootProgress] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [now, setNow] = useState("");
  const [hasPets, setHasPets] = useState<boolean | null>(null); // null = loading
  const worldStateRef = useRef<{ regionId: number; px: number; py: number } | null>(null);
  const [matrixChars, setMatrixChars] = useState<{ x: number; delay: number; char: string }[]>([]);

  // Check if user has pets -- re-check when returning to menu
  useEffect(() => {
    if (selected !== null) return; // Only check when on menu screen
    api.pets.list()
      .then((data: any) => {
        const pets = data.pets || data || [];
        setHasPets(pets.length > 0);
      })
      .catch(() => setHasPets(false));
  }, [selected]);

  // Boot sequence with progress
  useEffect(() => {
    // Generate matrix rain characters
    const chars: { x: number; delay: number; char: string }[] = [];
    const glyphs = "01ABCDEF";
    for (let i = 0; i < 30; i++) {
      chars.push({
        x: Math.random() * 100,
        delay: Math.random() * 1.5,
        char: glyphs[Math.floor(Math.random() * glyphs.length)],
      });
    }
    setMatrixChars(chars);

    // Simulate boot progress
    let progress = 0;
    const interval = setInterval(() => {
      progress += Math.random() * 15 + 5;
      if (progress >= 100) {
        progress = 100;
        clearInterval(interval);
      }
      setBootProgress(Math.min(100, Math.round(progress)));
    }, 150);

    const t = setTimeout(() => setBooted(true), 2000);
    return () => { clearTimeout(t); clearInterval(interval); };
  }, []);

  // Clock for bottom bar
  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setNow(
        d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      );
    };
    tick();
    const i = setInterval(tick, 30000);
    return () => clearInterval(i);
  }, []);

  const isInMode = selected !== null;

  return (
    <>
      <style>{bootKeyframes}</style>

      <section
        style={{
          paddingTop: 80,
          minHeight: "100vh",
          background: "linear-gradient(180deg, #0a0a1a 0%, #070710 100%)",
          fontFamily:
            "'SF Mono', 'Fira Code', 'Courier New', monospace",
        }}
      >
        {/* ── Console + Joy-Con wrapper ── */}
        <div
          style={{
            maxWidth: 960,
            margin: "0 auto",
            padding: "0 16px",
            display: "flex",
            alignItems: "stretch",
            justifyContent: "center",
            gap: 0,
          }}
        >
          {/* ── Left Joy-Con (neon blue) ── */}
          <div
            className="joycon-left"
            style={{
              width: 8,
              minHeight: 500,
              background: "linear-gradient(180deg, #00c8ff 0%, #0088cc 100%)",
              borderRadius: "20px 0 0 20px",
              flexShrink: 0,
              boxShadow: "inset -1px 0 4px rgba(0,200,255,0.3), 0 0 12px rgba(0,200,255,0.15)",
            }}
          />

          {/* ── Console Screen Frame (Switch bezel) ── */}
          <div
            style={{
              flex: 1,
              maxWidth: 900,
              display: "flex",
              flexDirection: "column",
            }}
          >
            {/* Bezel */}
            <div
              style={{
                background: "#1a1a1f",
                borderRadius: 20,
                border: "4px solid #2a2a30",
                overflow: "hidden",
                position: "relative",
                minHeight: 500,
                boxShadow:
                  "0 8px 32px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.04)",
              }}
            >
              {/* Bezel top bar with branding */}
              <div
                style={{
                  background: "linear-gradient(180deg, #141418, #111116)",
                  padding: "6px 16px",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  borderBottom: "1px solid #222228",
                }}
              >
                {/* Small decorative circles */}
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    background: "#50c878",
                    display: "inline-block",
                    opacity: 0.7,
                    boxShadow: "0 0 6px #50c87840",
                  }}
                />
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    background: "#64dcff",
                    display: "inline-block",
                    opacity: 0.7,
                    boxShadow: "0 0 6px #64dcff40",
                  }}
                />
                <span
                  style={{
                    color: "#444",
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: 3,
                    marginLeft: 8,
                    textTransform: "uppercase" as const,
                  }}
                >
                  MY AI PET
                </span>
              </div>

              {/* Scanline overlay */}
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  pointerEvents: "none",
                  zIndex: 5,
                  background:
                    "repeating-linear-gradient(0deg, rgba(255,255,255,0.015) 0px, rgba(255,255,255,0.015) 1px, transparent 1px, transparent 3px)",
                  mixBlendMode: "overlay",
                }}
              />

              {/* ── Boot Screen (cinematic) ── */}
              {!booted && (
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    zIndex: 10,
                    background: "#000",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 0,
                    overflow: "hidden",
                  }}
                >
                  {/* Matrix rain background */}
                  {matrixChars.map((c, i) => (
                    <div key={i} style={{
                      position: "absolute",
                      left: `${c.x}%`,
                      top: 0,
                      color: "#50c87830",
                      fontSize: 11,
                      fontWeight: 600,
                      animation: `matrixRain ${1.5 + Math.random()}s linear ${c.delay}s infinite`,
                      pointerEvents: "none",
                    }}>{c.char}</div>
                  ))}

                  {/* Click ring effect */}
                  <div
                    style={{
                      position: "absolute",
                      borderRadius: "50%",
                      border: "2px solid #50c878",
                      animation: "bootClick 0.6s ease-out 0.2s forwards",
                      opacity: 0,
                    }}
                  />
                  {/* Full-screen flash */}
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      background: "#fff",
                      animation: "bootFlash 1.5s ease forwards",
                    }}
                  />
                  {/* Logo */}
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 10,
                      animation: "bootLogoFade 1.2s cubic-bezier(0.2, 0, 0.2, 1) 0.3s both",
                      position: "relative",
                      zIndex: 2,
                    }}
                  >
                    <div style={{
                      fontSize: 42,
                      filter: "drop-shadow(0 0 20px rgba(80,200,120,0.4))",
                    }}>{"\u{1F3AE}"}</div>
                    <div
                      style={{
                        color: "#e0e0e0",
                        fontSize: 20,
                        fontWeight: 800,
                        letterSpacing: 8,
                        textShadow: "0 0 20px rgba(255,255,255,0.15)",
                      }}
                    >
                      MY AI PET
                    </div>
                    <div
                      style={{
                        background: "linear-gradient(135deg, #50c878, #4ade80)",
                        WebkitBackgroundClip: "text",
                        WebkitTextFillColor: "transparent",
                        fontSize: 11,
                        fontWeight: 700,
                        letterSpacing: 5,
                        marginTop: 2,
                      }}
                    >
                      ADVENTURE
                    </div>

                    {/* Boot progress bar */}
                    <div style={{
                      width: 200, marginTop: 20,
                    }}>
                      <div style={{
                        width: "100%", height: 3, borderRadius: 3,
                        background: "rgba(255,255,255,0.06)",
                        overflow: "hidden",
                        position: "relative",
                      }}>
                        <div style={{
                          height: "100%", borderRadius: 3,
                          width: `${bootProgress}%`,
                          background: "linear-gradient(90deg, #50c878, #4ade80)",
                          transition: "width 0.15s ease-out",
                          position: "relative",
                        }}>
                          {/* Glowing edge */}
                          <div style={{
                            position: "absolute", right: -2, top: -3, bottom: -3,
                            width: 8,
                            background: "radial-gradient(circle, #50c87880 0%, transparent 70%)",
                            filter: "blur(2px)",
                            animation: "bootProgressGlow 0.8s ease-in-out infinite",
                          }} />
                        </div>
                      </div>
                      <div style={{
                        color: "#50c87880", fontSize: 8, marginTop: 6,
                        letterSpacing: 2, textAlign: "center",
                      }}>
                        {bootProgress < 100 ? "LOADING..." : "READY"}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Main Content ── */}
              <div
                style={{
                  padding: "28px 24px 0",
                  opacity: booted ? 1 : 0,
                  transition: "opacity 0.5s cubic-bezier(0.4, 0, 0.2, 1)",
                }}
              >
                {/* Show menu or selected mode */}
                {hasPets === null && !isInMode ? (
                  /* Loading pet check - skeleton */
                  <div style={{ textAlign: "center", padding: "40px 20px" }}>
                    <SkeletonCard count={4} />
                    <div style={{ color: "#444", fontSize: 10, letterSpacing: 1, marginTop: 10 }}>Checking your pets...</div>
                  </div>
                ) : hasPets === false && !isInMode ? (
                  /* No pets -- prompt to adopt */
                  <div style={{
                    textAlign: "center", padding: "40px 20px",
                    animation: "fadeInUp 0.5s ease-out",
                  }}>
                    <div style={{
                      fontSize: 64, marginBottom: 20,
                      filter: "drop-shadow(0 4px 16px rgba(0,0,0,0.3))",
                      animation: "bounce 3s ease-in-out infinite",
                    }}>{"\u{1F95A}"}</div>
                    <h2 style={{
                      color: "#e0e0e0", fontSize: 22, fontWeight: 800, margin: "0 0 8px",
                      letterSpacing: 2,
                    }}>
                      No Pets Yet!
                    </h2>
                    <p style={{
                      color: "#666", fontSize: 12, lineHeight: 1.6, maxWidth: 300,
                      margin: "0 auto 28px",
                    }}>
                      You need to adopt a pet before starting your adventure. Head to the home screen and adopt your first companion!
                    </p>
                    <button
                      onClick={() => onNavigate?.("my pet")}
                      style={{
                        display: "inline-block",
                        ...glassCard("#50c878", {
                          padding: "14px 32px",
                          cursor: "pointer",
                          fontFamily: "inherit",
                          transition: "all 0.3s ease",
                          color: "#50c878",
                          fontSize: 14,
                          fontWeight: 700,
                          letterSpacing: 1,
                        }),
                        background: "linear-gradient(135deg, #50c87820, #50c87808)",
                        border: "1.5px solid #50c87845",
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLElement).style.transform = "translateY(-3px) scale(1.02)";
                        (e.currentTarget as HTMLElement).style.boxShadow = "0 8px 24px #50c87820";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLElement).style.transform = "translateY(0) scale(1)";
                        (e.currentTarget as HTMLElement).style.boxShadow = "none";
                      }}
                    >
                      {"\u{1F43E}"} Adopt a Pet
                    </button>
                  </div>
                ) : !isInMode ? (
                  <>
                    {/* Header */}
                    <div style={{ textAlign: "center", marginBottom: 28, animation: "fadeInUp 0.5s ease-out" }}>
                      <h2
                        style={{
                          fontSize: 24,
                          fontWeight: 800,
                          letterSpacing: 3,
                          margin: 0,
                          background: "linear-gradient(135deg, #e0e0e0, #888)",
                          WebkitBackgroundClip: "text",
                          WebkitTextFillColor: "transparent",
                        }}
                      >
                        ADVENTURE
                      </h2>
                      <p
                        style={{
                          color: "#555",
                          fontSize: 12,
                          marginTop: 8,
                          letterSpacing: 1.5,
                          fontWeight: 500,
                        }}
                      >
                        SELECT YOUR MODE
                      </p>
                    </div>

                    {/* ── Card grid (Switch game tiles) ── */}
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
                        gap: 16,
                        padding: "4px 4px 20px",
                        maxWidth: 680,
                        margin: "0 auto",
                      }}
                    >
                      {MENU_ITEMS.map((item, idx) => {
                        const isActive = item.available;

                        return (
                          <button
                            key={item.id}
                            onClick={() => {
                              if (!item.available) return;
                              if (hasPets === null) return; // still loading
                              if (hasPets === false) { onNavigate?.("my pet"); return; }
                              setSelected(item.id);
                            }}
                            style={{
                              position: "relative",
                              minHeight: 210,
                              ...glassCard(item.accent, {
                                padding: "24px 14px 18px",
                                cursor: isActive ? "pointer" : "default",
                                textAlign: "center" as const,
                                transition: "all 0.35s cubic-bezier(0.4, 0, 0.2, 1)",
                                fontFamily: "inherit",
                                display: "flex",
                                flexDirection: "column" as const,
                                alignItems: "center",
                                justifyContent: "center",
                                gap: 6,
                                overflow: "hidden",
                                outline: "none",
                                animation: `fadeInUp 0.4s ease-out ${idx * 0.06}s both`,
                              }),
                              background: isActive ? item.gradient : "linear-gradient(180deg, #131318 0%, #0f0f14 70%)",
                            }}
                            onMouseEnter={(e) => {
                              if (isActive) {
                                (e.currentTarget as HTMLElement).style.transform =
                                  "translateY(-8px) scale(1.04) rotateX(2deg)";
                                (e.currentTarget as HTMLElement).style.borderColor =
                                  `${item.accent}60`;
                                (e.currentTarget as HTMLElement).style.boxShadow =
                                  `0 16px 40px ${item.accent}20, 0 0 20px ${item.accent}10`;
                              }
                            }}
                            onMouseLeave={(e) => {
                              (e.currentTarget as HTMLElement).style.transform = "translateY(0) scale(1) rotateX(0)";
                              (e.currentTarget as HTMLElement).style.borderColor = `${item.accent}20`;
                              (e.currentTarget as HTMLElement).style.boxShadow = "none";
                            }}
                          >
                            {/* Shimmer overlay */}
                            {isActive && (
                              <div style={{
                                position: "absolute", inset: 0, borderRadius: 16, pointerEvents: "none",
                                background: `linear-gradient(105deg, transparent 40%, ${item.accent}08 50%, transparent 60%)`,
                                backgroundSize: "200% 100%",
                                animation: "cardShimmer 3s ease-in-out infinite",
                              }} />
                            )}

                            {/* Coming soon overlay */}
                            {!isActive && (
                              <div
                                style={{
                                  position: "absolute",
                                  inset: 0,
                                  background: "rgba(10,10,15,0.6)",
                                  backdropFilter: "blur(2px)",
                                  borderRadius: 14,
                                  zIndex: 2,
                                  display: "flex",
                                  alignItems: "flex-end",
                                  justifyContent: "center",
                                  paddingBottom: 16,
                                }}
                              >
                                <span
                                  style={{
                                    fontSize: 9,
                                    fontWeight: 700,
                                    letterSpacing: 1.5,
                                    color: "#555",
                                    background: "rgba(255,255,255,0.04)",
                                    padding: "4px 12px",
                                    borderRadius: 6,
                                    border: "1px solid rgba(255,255,255,0.06)",
                                  }}
                                >
                                  COMING SOON
                                </span>
                              </div>
                            )}

                            {/* Icon with animated background glow */}
                            <div style={{
                              position: "relative",
                              width: 64, height: 64,
                              display: "flex", alignItems: "center", justifyContent: "center",
                              marginBottom: 6,
                            }}>
                              <div style={{
                                position: "absolute", inset: 0, borderRadius: "50%",
                                background: isActive ? item.iconBg : "transparent",
                                animation: isActive ? "iconPulse 3s ease-in-out infinite" : "none",
                                opacity: 0.8,
                              }} />
                              <div
                                style={{
                                  position: "relative",
                                  filter: isActive ? "drop-shadow(0 2px 8px rgba(0,0,0,0.3))" : "grayscale(0.7)",
                                  display: "flex", alignItems: "center", justifyContent: "center",
                                }}
                              >
                                <Icon name={item.iconName} size={38} />
                              </div>
                            </div>

                            {/* Title */}
                            <div
                              style={{
                                color: isActive ? "#e0e0e0" : "#555",
                                fontSize: 14,
                                fontWeight: 800,
                                letterSpacing: 0.5,
                                marginBottom: 2,
                                position: "relative",
                              }}
                            >
                              {item.title}
                            </div>

                            {/* Description */}
                            <div
                              style={{
                                color: isActive ? "#777" : "#444",
                                fontSize: 11,
                                lineHeight: 1.4,
                                position: "relative",
                              }}
                            >
                              {item.desc}
                            </div>

                            {/* Status badge (active items only) */}
                            {isActive && (
                              <div
                                style={{
                                  marginTop: 10,
                                  padding: "4px 12px",
                                  borderRadius: 8,
                                  fontSize: 9,
                                  fontWeight: 700,
                                  letterSpacing: 1,
                                  background: `${item.accent}12`,
                                  color: item.accent,
                                  border: `1px solid ${item.accent}25`,
                                  position: "relative",
                                }}
                              >
                                READY
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </>
                ) : selected === "world" || selected === "wild_auto" || selected?.startsWith("pve_battle_") ? (
                  /* ── Open World mode ── */
                  <div style={{ animation: "fadeIn 0.3s ease-out" }}>
                    {selected === "world" && <BackButton onClick={() => setSelected(null)} accent="#50c878" />}
                    {selected === "wild_auto" ? (
                      /* Wild encounter from overworld -- run and return */
                      <WildEncounter onBack={() => setSelected("world")} />
                    ) : selected?.startsWith("pve_battle_") ? (
                      /* PvE boss battle from overworld */
                      <div>
                        <PveMode initialStage={parseInt(selected.replace("pve_battle_", ""))} onBack={() => setSelected("world")} />
                      </div>
                    ) : (
                      <GameWorld
                        onBattle={(stageId) => {
                          setSelected("pve_battle_" + stageId);
                        }}
                        onWildEncounter={() => {
                          setSelected("wild_auto");
                        }}
                        onNavigate={onNavigate}
                        hasPets={hasPets || false}
                        savedState={worldStateRef.current}
                        onStateChange={(s) => { worldStateRef.current = s; }}
                      />
                    )}
                  </div>
                ) : selected === "battle" ? (
                  /* ── Arena mode ── */
                  <div style={{ animation: "fadeIn 0.3s ease-out" }}>
                    <BackButton onClick={() => setSelected(null)} accent="#f59e0b" />
                    <Arena />
                  </div>
                ) : selected === "pve" ? (
                  /* ── PvE Story mode ── */
                  <div style={{ animation: "fadeIn 0.3s ease-out" }}>
                    <BackButton onClick={() => setSelected(null)} accent="#dc2626" />
                    <PveMode />
                  </div>
                ) : selected === "wild" ? (
                  <div style={{ animation: "fadeIn 0.3s ease-out" }}>
                    <WildEncounter onBack={() => setSelected(null)} />
                  </div>
                ) : selected === "explore" ? (
                  <div style={{ animation: "fadeIn 0.3s ease-out" }}>
                    <Explore onBack={() => setSelected(null)} />
                  </div>
                ) : selected === "gym" ? (
                  <div style={{ animation: "fadeIn 0.3s ease-out" }}>
                    <GymChallenge onBack={() => setSelected(null)} />
                  </div>
                ) : null}
              </div>

              {/* ── Controller Buttons ── */}
              <div style={{
                padding: "12px 24px 8px", display: "flex", justifyContent: "space-between",
                alignItems: "center", opacity: booted ? 1 : 0, transition: "opacity 0.5s ease 0.3s",
              }}>
                {/* D-Pad (Left side) */}
                <div style={{ position: "relative", width: 80, height: 80 }}>
                  {[
                    { label: "\u25B2", top: 0, left: 24, w: 28, h: 24 },
                    { label: "\u25BC", top: 52, left: 24, w: 28, h: 24 },
                    { label: "\u25C0", top: 24, left: 0, w: 24, h: 28 },
                    { label: "\u25B6", top: 24, left: 52, w: 24, h: 28 },
                  ].map(d => (
                    <div key={d.label} style={{
                      position: "absolute", top: d.top, left: d.left, width: d.w, height: d.h,
                      background: "linear-gradient(180deg, #2a2a35, #1e1e28)",
                      border: "1px solid #333340", borderRadius: 4,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      color: "#555", fontSize: 10, cursor: "default",
                      userSelect: "none" as const,
                    }}>
                      {d.label}
                    </div>
                  ))}
                  {/* Center of D-pad */}
                  <div style={{
                    position: "absolute", top: 24, left: 24, width: 28, height: 28,
                    background: "#22222c", border: "1px solid #333340", borderRadius: 2,
                  }} />
                </div>

                {/* Center hint text */}
                <div style={{
                  fontFamily: "mono", fontSize: 9, color: "#444", textAlign: "center",
                  letterSpacing: 1,
                }}>
                  {isInMode ? "B = BACK" : "A = SELECT"}
                </div>

                {/* ABXY Buttons (Right side) */}
                <div style={{ position: "relative", width: 80, height: 80 }}>
                  {[
                    { label: "X", top: 0, left: 28, color: "#64b5f6" },
                    { label: "B", top: 52, left: 28, color: "#ffa726", action: () => isInMode && setSelected(null) },
                    { label: "Y", top: 26, left: 2, color: "#66bb6a" },
                    { label: "A", top: 26, left: 54, color: "#ef5350" },
                  ].map(b => (
                    <button key={b.label} onClick={() => b.action?.()}
                      style={{
                        position: "absolute", top: b.top, left: b.left, width: 24, height: 24,
                        borderRadius: "50%",
                        background: `linear-gradient(180deg, ${b.color}33, ${b.color}15)`,
                        border: `1.5px solid ${b.color}55`,
                        color: b.color, fontSize: 10, fontWeight: 700,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        cursor: b.action ? "pointer" : "default",
                        fontFamily: "inherit", outline: "none",
                        transition: "all 0.2s ease",
                        boxShadow: `0 0 6px ${b.color}20`,
                      }}
                      onMouseEnter={e => { if (b.action) { e.currentTarget.style.boxShadow = `0 0 14px ${b.color}40`; e.currentTarget.style.transform = "scale(1.1)"; } }}
                      onMouseLeave={e => { e.currentTarget.style.boxShadow = `0 0 6px ${b.color}20`; e.currentTarget.style.transform = "scale(1)"; }}
                    >
                      {b.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* ── Bottom status bar (Switch-style) ── */}
              <div
                style={{
                  borderTop: "1px solid #1a1a22",
                  padding: "8px 20px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginTop: 8,
                  opacity: booted ? 0.7 : 0,
                  transition: "opacity 0.5s ease 0.2s",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    color: "#555",
                    fontSize: 11,
                  }}
                >
                  <span title="Settings" style={{ cursor: "default" }}>
                    {"\u2699\uFE0F"}
                  </span>
                  <span title="Controller" style={{ cursor: "default" }}>
                    {"\u{1F3AE}"}
                  </span>
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    color: "#555",
                    fontSize: 11,
                    letterSpacing: 1,
                  }}
                >
                  <span title="WiFi">{"\u{1F4F6}"}</span>
                  <span
                    title="Battery"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 3,
                    }}
                  >
                    {"\u{1F50B}"}
                    <span style={{ fontSize: 9 }}>98%</span>
                  </span>
                  <span style={{ fontWeight: 600, fontSize: 10 }}>
                    {now}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* ── Right Joy-Con (neon red) ── */}
          <div
            className="joycon-right"
            style={{
              width: 8,
              minHeight: 500,
              background: "linear-gradient(180deg, #ff3c50 0%, #cc2233 100%)",
              borderRadius: "0 20px 20px 0",
              flexShrink: 0,
              boxShadow: "inset 1px 0 4px rgba(255,60,80,0.3), 0 0 12px rgba(255,60,80,0.15)",
            }}
          />
        </div>
      </section>

      {/* ── Responsive: hide Joy-Cons on mobile, stack cards vertically ── */}
      <style>{`
        @media (max-width: 640px) {
          .joycon-left, .joycon-right {
            display: none !important;
          }
        }
      `}</style>
    </>
  );
}
