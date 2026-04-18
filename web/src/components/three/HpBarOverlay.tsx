"use client";

import React from "react";
import Icon, { ELEMENT_ICONS } from "@/components/Icon";
import type { Element } from "@/lib/skills";
import { ELEMENTS } from "@/lib/skills";

interface PetStatus {
  name: string;
  level: number;
  element: Element;
  hp: number;
  maxHp: number;
  energy: number;
  maxEnergy: number;
  avatarUrl?: string;
  isBoss?: boolean;
}

interface BuffIcons {
  defUp?: boolean;
  spAtkUp?: boolean;
  dodging?: boolean;
  waterBoost?: boolean;
  burn?: boolean;
  paralyze?: boolean;
  drain?: boolean;
}

interface HpBarOverlayProps {
  player: PetStatus;
  enemy: PetStatus;
  playerBuffs: BuffIcons;
  enemyBuffs: BuffIcons;
}

function HpGradient(ratio: number): string {
  if (ratio > 0.5) return "linear-gradient(90deg, #22c55e, #4ade80)";
  if (ratio > 0.25) return "linear-gradient(90deg, #eab308, #facc15)";
  return "linear-gradient(90deg, #dc2626, #f87171)";
}

function HpGlow(ratio: number): string {
  if (ratio > 0.5) return "#4ade8040";
  if (ratio > 0.25) return "#facc1540";
  return "#f8717140";
}

function BuffBadges({ buffs, type }: { buffs: BuffIcons; type: "player" | "enemy" }) {
  const icons: React.ReactNode[] = [];
  if (type === "player") {
    if (buffs.defUp) icons.push(<Icon key="def" name="shield" size={10} />);
    if (buffs.spAtkUp) icons.push(<Icon key="atk" name="sword" size={10} />);
    if (buffs.dodging) icons.push(<span key="dodge" style={{ fontSize: 10 }}>💨</span>);
    if (buffs.waterBoost) icons.push(<Icon key="water" name="water" size={10} />);
  } else {
    if (buffs.burn) icons.push(<Icon key="burn" name="fire" size={10} />);
    if (buffs.paralyze) icons.push(<Icon key="para" name="electric" size={10} />);
    if (buffs.drain) icons.push(<Icon key="drain" name="grass" size={10} />);
    if (buffs.dodging) icons.push(<span key="dodge" style={{ fontSize: 10 }}>💨</span>);
  }
  if (icons.length === 0) return null;

  return (
    <div style={{ display: "flex", gap: 2 }}>
      {icons.map((icon, i) => (
        <span key={i} style={{
          fontSize: 10, padding: "1px 3px", borderRadius: 4,
          background: type === "player" ? "rgba(74,222,128,0.15)" : "rgba(248,113,113,0.15)",
          border: `1px solid ${type === "player" ? "rgba(74,222,128,0.25)" : "rgba(248,113,113,0.25)"}`,
        }}>{icon}</span>
      ))}
    </div>
  );
}

function PetHpCard({ pet, buffs, side }: { pet: PetStatus; buffs: BuffIcons; side: "left" | "right" }) {
  const el = ELEMENTS[pet.element] || ELEMENTS.normal;
  const hpRatio = Math.max(0, pet.hp / pet.maxHp);
  const epRatio = Math.max(0, pet.energy / pet.maxEnergy);

  return (
    <div style={{
      background: "rgba(0,0,0,0.65)",
      backdropFilter: "blur(8px)",
      borderRadius: 10,
      padding: "6px 10px",
      minWidth: 130,
      border: "1px solid rgba(255,255,255,0.08)",
    }}>
      {/* Name + Level + Element */}
      <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 3 }}>
        {pet.isBoss && <Icon name="crown" size={11} />}
        <span style={{
          color: "#f0f0f0", fontSize: 11, fontWeight: 800,
          fontFamily: "'Space Grotesk', sans-serif",
        }}>{pet.name}</span>
        <span style={{
          fontSize: 7, padding: "1px 5px", borderRadius: 8,
          background: `${el.color}15`, border: `1px solid ${el.color}25`,
          color: el.color, fontFamily: "monospace", fontWeight: 700,
          display: "inline-flex", alignItems: "center", gap: 2,
        }}>
          <Icon name={ELEMENT_ICONS[pet.element] || "normal"} size={8} /> Lv.{pet.level}
        </span>
      </div>

      {/* Buffs */}
      <BuffBadges buffs={buffs} type={side === "left" ? "player" : "enemy"} />

      {/* HP Bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 3, marginTop: 3 }}>
        <span style={{ fontFamily: "monospace", fontSize: 7, color: "#666", fontWeight: 700 }}>HP</span>
        <div style={{
          flex: 1, height: 8, borderRadius: 4, overflow: "hidden",
          background: "rgba(255,255,255,0.08)",
          boxShadow: "inset 0 1px 2px rgba(0,0,0,0.4)",
        }}>
          <div style={{
            height: "100%", width: `${hpRatio * 100}%`,
            background: HpGradient(hpRatio),
            transition: "width 0.6s cubic-bezier(0.4,0,0.2,1)",
            borderRadius: 4,
            boxShadow: hpRatio > 0 ? `0 0 6px ${HpGlow(hpRatio)}` : "none",
          }} />
        </div>
      </div>
      <div style={{ fontFamily: "monospace", fontSize: 7, color: "#555", textAlign: "right", marginTop: 1 }}>
        {Math.max(0, pet.hp)}/{pet.maxHp}
      </div>

      {/* EP Bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 3, marginTop: 2 }}>
        <span style={{ fontFamily: "monospace", fontSize: 6, color: "#555", fontWeight: 700 }}>EP</span>
        <div style={{
          flex: 1, height: 4, borderRadius: 2, overflow: "hidden",
          background: "rgba(255,255,255,0.06)",
        }}>
          <div style={{
            height: "100%", width: `${epRatio * 100}%`,
            background: "linear-gradient(90deg, #6366f1, #a78bfa)",
            transition: "width 0.4s ease", borderRadius: 2,
          }} />
        </div>
        <span style={{ fontFamily: "monospace", fontSize: 6, color: "#555" }}>
          {pet.energy}/{pet.maxEnergy}
        </span>
      </div>
    </div>
  );
}

export default function HpBarOverlay({ player, enemy, playerBuffs, enemyBuffs }: HpBarOverlayProps) {
  return (
    <div style={{
      position: "absolute", top: 0, left: 0, right: 0,
      display: "flex", justifyContent: "space-between",
      padding: "8px 10px",
      pointerEvents: "none", zIndex: 10,
    }}>
      <PetHpCard pet={player} buffs={playerBuffs} side="left" />
      <PetHpCard pet={enemy} buffs={enemyBuffs} side="right" />
    </div>
  );
}
