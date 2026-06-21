"use client";

/**
 * PetCard — premium PORTRAIT trading card rendered in crisp CSS (not the
 * landscape OG PNG, which is for X-unfurl/download only). Element-themed frame,
 * rarity glow, and a holographic sheen for Epic/Legendary. Pass `card` directly,
 * or a `petId` to self-fetch /api/card/[petId].
 */

import { useEffect, useState } from "react";
import { elementTheme, rarityColor } from "@/lib/tcg/theme";
import type { CardData } from "@/lib/tcg/card";

export default function PetCard({ card: cardProp, petId, maxWidth = 320 }: { card?: CardData; petId?: number; maxWidth?: number }) {
  const [card, setCard] = useState<CardData | null>(cardProp || null);
  const [loading, setLoading] = useState(!cardProp);

  useEffect(() => {
    if (cardProp || !petId) return;
    let alive = true;
    setLoading(true);
    fetch(`/api/card/${petId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive) { setCard(d?.card || null); setLoading(false); } })
      .catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [petId, cardProp]);

  if (loading) {
    return <div style={{ width: "100%", maxWidth, aspectRatio: "5 / 7", borderRadius: 18, background: "linear-gradient(135deg,#1a1a22,#2a2a35)", margin: "0 auto" }} />;
  }
  if (!card) return null;

  const t = elementTheme(card.element);
  const rc = rarityColor(card.rarity);
  const holo = card.rarity === "Epic" || card.rarity === "Legendary";

  return (
    <div style={{ width: "100%", maxWidth, margin: "0 auto" }}>
      <style>{`@keyframes tcgHolo{0%{transform:translateX(-120%) rotate(8deg)}100%{transform:translateX(220%) rotate(8deg)}}`}</style>
      <div style={{
        position: "relative", display: "flex", flexDirection: "column", overflow: "hidden",
        borderRadius: 18, border: `4px solid ${rc}`, background: "#0f0f14",
        boxShadow: `0 14px 40px rgba(0,0,0,0.4)${holo ? `, 0 0 26px ${rc}66` : ""}`,
      }}>
        {/* Holographic sheen (Epic/Legendary) */}
        {holo && (
          <div style={{ position: "absolute", inset: 0, zIndex: 3, pointerEvents: "none", overflow: "hidden", borderRadius: 14 }}>
            <div style={{ position: "absolute", top: 0, bottom: 0, width: "40%", background: "linear-gradient(115deg, transparent, rgba(255,255,255,0.45), transparent)", mixBlendMode: "overlay", animation: "tcgHolo 4.5s ease-in-out infinite" }} />
          </div>
        )}

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: t.color }}>
          <span style={{ fontSize: 19, fontWeight: 800, color: "#fff", fontFamily: "'Space Grotesk',sans-serif", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{card.name}</span>
          <span style={{ fontSize: 14, fontWeight: 800, color: "#fff", flexShrink: 0, marginLeft: 8 }}>Lv {card.level}</span>
        </div>

        {/* Art */}
        <div style={{ position: "relative", width: "100%", aspectRatio: "1 / 1", background: `linear-gradient(135deg, ${t.grad[0]}, ${t.grad[1]})` }}>
          {card.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={card.avatarUrl} alt={card.name} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          ) : (
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 34, fontWeight: 800, color: "rgba(255,255,255,0.9)" }}>{card.speciesName}</div>
          )}
          {/* element badge */}
          <div style={{ position: "absolute", top: 8, left: 8, padding: "3px 10px", borderRadius: 999, background: t.color, color: "#fff", fontSize: 11, fontWeight: 800, boxShadow: "0 2px 8px rgba(0,0,0,0.3)" }}>{t.label}</div>
          {/* rarity */}
          <div style={{ position: "absolute", top: 8, right: 8, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
            <div style={{ padding: "3px 10px", borderRadius: 999, background: rc, color: "#1a1a22", fontSize: 11, fontWeight: 900, letterSpacing: 0.5, boxShadow: "0 2px 8px rgba(0,0,0,0.3)" }}>{card.rarity.toUpperCase()}</div>
            {card.topPercent != null && <div style={{ fontSize: 10, fontWeight: 700, color: "#fff", textShadow: "0 1px 4px rgba(0,0,0,0.6)" }}>TOP {card.topPercent}%</div>}
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: "flex", gap: 6, padding: "10px 12px 4px" }}>
          {([["ATK", card.atk], ["DEF", card.def], ["SPD", card.spd]] as const).map(([lab, val]) => (
            <div key={lab} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", background: "#1a1a22", borderRadius: 9, padding: "7px 2px" }}>
              <span style={{ fontSize: 19, fontWeight: 900, color: "#fff", fontFamily: "'Space Grotesk',sans-serif" }}>{val}</span>
              <span style={{ fontSize: 9.5, color: "#8a8a93", letterSpacing: 1 }}>{lab}</span>
            </div>
          ))}
        </div>

        {/* Sub-stats */}
        <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 16px", fontSize: 11, color: "#b8b8c0", fontFamily: "'JetBrains Mono',monospace" }}>
          <span>PWR {card.power}</span>
          <span>BOND {card.bondLevel}</span>
          <span>STREAK {card.careStreak}d</span>
        </div>

        {/* Moves */}
        {card.moves.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5, padding: "2px 14px 6px" }}>
            {card.moves.map((m, i) => (
              <span key={i} style={{ fontSize: 11, color: "#e8e8ee", background: "#222230", borderRadius: 6, padding: "3px 9px" }}>{m}</span>
            ))}
          </div>
        )}

        {/* Footer */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "auto", padding: "8px 14px", background: "#000" }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: t.color, fontFamily: "'Space Grotesk',sans-serif" }}>MY AI PET</span>
          <span style={{ fontSize: 10.5, color: "#8a8a93" }}>{card.evolutionName || card.speciesName} · {card.personality}</span>
        </div>
      </div>
    </div>
  );
}
