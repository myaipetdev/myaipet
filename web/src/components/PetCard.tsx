"use client";

/**
 * PetCard — a portrait trading card in the "Printed Stock" system: a die-cut
 * sticker (thick ink keyline + cream/foil margin + ONE hard offset shadow) that
 * peels on hover and presses on tap. Rarity is carried entirely by a hand-
 * stamped WAX SEAL — never glow. Element colour is demoted to a left rule on
 * the header + the footer wordmark. Pass `card` directly, or a `petId` to
 * self-fetch /api/card/[petId].
 */

import { useEffect, useState } from "react";
import { elementTheme, rarityTier } from "@/lib/tcg/theme";
import { WaxSeal, rarityStock, dcVars, INK, CREAM } from "@/components/Sticker";
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
    return <div style={{ width: "100%", maxWidth, aspectRatio: "5 / 7", borderRadius: 18, background: "#fff", border: `2.5px solid ${INK}`, margin: "0 auto", boxShadow: "0 8px 0 rgba(26,26,34,0.10)" }} />;
  }
  if (!card) return null;

  const t = elementTheme(card.element);
  const tier = rarityTier(card.rarity);
  const stock = rarityStock(tier);
  const hairline = stock.marginHairline ? "inset 0 0 0 1.5px rgba(26,26,34,0.18)" : "";

  return (
    <div className="mp-enter" style={{ width: "100%", maxWidth, margin: "0 auto" }}>
      {/* The die-cut sticker: keyline + margin + hard offset shadow + peel/press */}
      <div className="dc" style={{
        position: "relative", borderRadius: 18, padding: 11,
        border: `${stock.keyline}px solid ${stock.keylineColor}`,
        background: stock.marginStock,
        ...dcVars(stock.shadowAlpha, false, hairline),
      }}>
        {/* Rare+ dashed ink stitch inside the margin */}
        {stock.stitch && (
          <div aria-hidden style={{ position: "absolute", inset: 5, borderRadius: 14, border: "1px dashed rgba(26,26,34,0.5)", pointerEvents: "none" }} />
        )}

        {/* Wax seal — the sole rarity carrier, stamped onto the margin */}
        <WaxSeal seal={stock.seal} size={34} title={`${card.rarity} rarity`} style={{ position: "absolute", top: 3, right: 3, zIndex: 5 }} />

        {/* Inner block — printed on the sticker */}
        <div style={{ position: "relative", display: "flex", flexDirection: "column", overflow: "hidden", borderRadius: 12, border: `2px solid ${INK}`, background: CREAM }}>
          {/* Header — element left-rule, name, level */}
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, padding: "10px 12px", borderLeft: `3px solid ${t.color}` }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: INK, fontFamily: "'Space Grotesk',sans-serif", letterSpacing: "-0.01em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", lineHeight: 1.1 }}>{card.name}</div>
              <div style={{ fontSize: 10, fontWeight: 700, color: t.color, fontFamily: "'JetBrains Mono',monospace", letterSpacing: "0.08em", textTransform: "uppercase", marginTop: 2 }}>{t.label}</div>
            </div>
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: "#b45309", fontFamily: "'JetBrains Mono',monospace" }}>Lv {card.level}</div>
              {card.topPercent != null && <div style={{ fontSize: 9.5, fontWeight: 700, color: "rgba(26,26,46,0.5)", fontFamily: "'JetBrains Mono',monospace", marginTop: 2 }}>TOP {card.topPercent}%</div>}
            </div>
          </div>

          {/* Art — square image with an ink hairline separator below */}
          <div style={{ position: "relative", width: "100%", aspectRatio: "1 / 1", background: "#fff", borderTop: `2px solid ${INK}`, borderBottom: `2px solid ${INK}` }}>
            {card.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={card.avatarUrl} alt={card.name} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            ) : (
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30, fontWeight: 800, color: "rgba(26,26,46,0.35)", fontFamily: "'Space Grotesk',sans-serif" }}>{card.speciesName}</div>
            )}
          </div>

          {/* Stats — three printed tiles */}
          <div style={{ display: "flex", gap: 6, padding: "10px 12px 4px" }}>
            {([["ATK", card.atk], ["DEF", card.def], ["SPD", card.spd]] as const).map(([lab, val]) => (
              <div key={lab} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", background: "#fff", borderRadius: 9, border: `2px solid ${INK}`, padding: "6px 2px", boxShadow: "0 3px 0 rgba(26,26,34,0.14)" }}>
                <span style={{ fontSize: 18, fontWeight: 800, color: INK, fontFamily: "'Space Grotesk',sans-serif", lineHeight: 1 }}>{val}</span>
                <span style={{ fontSize: 9, color: "rgba(26,26,46,0.5)", fontFamily: "'JetBrains Mono',monospace", letterSpacing: 1, marginTop: 3 }}>{lab}</span>
              </div>
            ))}
          </div>

          {/* Sub-stats */}
          <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 14px", fontSize: 10.5, color: "rgba(26,26,46,0.55)", fontFamily: "'JetBrains Mono',monospace" }}>
            <span>PWR {card.power}</span>
            <span>BOND {card.bondLevel}</span>
            <span>STREAK {card.careStreak}d</span>
          </div>

          {/* Moves */}
          {card.moves.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5, padding: "2px 12px 8px" }}>
              {card.moves.map((m, i) => (
                <span key={i} style={{ fontSize: 10.5, fontWeight: 700, color: INK, background: "#fff", borderRadius: 7, border: `2px solid ${INK}`, padding: "2px 8px", fontFamily: "'Space Grotesk',sans-serif" }}>{m}</span>
              ))}
            </div>
          )}

          {/* Footer — wordmark in element colour, edition line for Legendary */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: "auto", padding: "8px 12px", borderTop: `2px solid ${INK}`, background: "#fff" }}>
            <span style={{ fontSize: 10.5, fontWeight: 800, color: t.color, fontFamily: "'Space Grotesk',sans-serif", letterSpacing: "0.01em" }}>MY AI PET</span>
            {tier === 4 ? (
              <span style={{ fontSize: 9.5, fontWeight: 700, color: "#b45309", fontFamily: "'JetBrains Mono',monospace" }}>№ {String(card.id).padStart(3, "0")} · SEASON 1</span>
            ) : (
              <span style={{ fontSize: 9.5, color: "rgba(26,26,46,0.5)", fontFamily: "'JetBrains Mono',monospace", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "62%" }}>{card.evolutionName || card.speciesName} · {card.personality}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
