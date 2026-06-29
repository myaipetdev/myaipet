"use client";

/**
 * PetCard — a pet presented as a foil-stamped collectible in the "Collectible
 * Editorial" system: a holographic conic border ring around a warm cream card,
 * a gold-inset photo well with a holographic sheen + gloss, a circular rarity
 * seal, and editorial type (Bricolage / Hanken / Space Mono) on a soft floating
 * shadow. Pass `card` directly, or a `petId` to self-fetch /api/card/[petId].
 */

import { useEffect, useState } from "react";
import { elementTheme } from "@/lib/tcg/theme";
import type { CardData } from "@/lib/tcg/card";

const INK = "#211A12", PAPER = "#FBF6EC", MUTED = "rgba(33,26,18,.5)", HAIR = "rgba(33,26,18,.13)", GOLD = "#C8932F";
const RARITY: Record<string, { c: string; l: string }> = {
  Common: { c: "#5C8A4E", l: "C" }, Uncommon: { c: "#5C8A4E", l: "U" },
  Rare: { c: "#3E8FE0", l: "R" }, Epic: { c: "#9E72E8", l: "E" }, Legendary: { c: GOLD, l: "L" },
};
const HOLO = "conic-gradient(from 210deg, #FFE08A, #FF9FB0, #C0A6FF, #8FE6D8, #FFE08A)";

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
    return <div style={{ width: "100%", maxWidth, aspectRatio: "5 / 7", borderRadius: 18, background: PAPER, margin: "0 auto", boxShadow: "var(--ed-shadow-card)" }} />;
  }
  if (!card) return null;

  const t = elementTheme(card.element);
  const r = RARITY[card.rarity] || RARITY.Common;

  return (
    <div className="mp-enter" style={{ width: "100%", maxWidth, margin: "0 auto" }}>
      {/* Holographic conic border ring */}
      <div style={{ position: "relative", borderRadius: 18, padding: 3, background: HOLO, boxShadow: "var(--ed-shadow-card)" }}>
        {/* Inner card — warm cream paper */}
        <div style={{ position: "relative", display: "flex", flexDirection: "column", overflow: "hidden", borderRadius: 15, background: PAPER }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, padding: "11px 14px 9px" }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: "var(--ed-disp)", fontSize: 20, fontWeight: 800, color: INK, letterSpacing: "-0.02em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", lineHeight: 1.05 }}>{card.name}</div>
              <div style={{ fontFamily: "var(--ed-m)", fontSize: 10, fontWeight: 700, color: t.color, letterSpacing: "0.1em", textTransform: "uppercase", marginTop: 3 }}>{t.label}</div>
            </div>
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <div style={{ fontFamily: "var(--ed-disp)", fontSize: 15, fontWeight: 700, color: INK }}>Lv {card.level}</div>
              {card.topPercent != null && <div style={{ fontFamily: "var(--ed-m)", fontSize: 9, fontWeight: 700, color: MUTED, marginTop: 2 }}>TOP {card.topPercent}%</div>}
            </div>
          </div>

          {/* Photo well — gold inset keyline + holo sheen + gloss + circular rarity seal */}
          <div style={{ position: "relative", margin: "0 14px", borderRadius: 8, overflow: "hidden", boxShadow: "inset 0 0 0 2px rgba(184,130,44,.5)" }}>
            <div style={{ position: "relative", width: "100%", aspectRatio: "1 / 1", background: "#fff" }}>
              {card.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={card.avatarUrl} alt={card.name} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
              ) : (
                <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--ed-disp)", fontSize: 30, fontWeight: 800, color: "rgba(33,26,18,.3)" }}>{card.speciesName}</div>
              )}
              <div className="ed-holo-sheen" aria-hidden style={{ opacity: 0.26 }} />
              <div className="ed-gloss" aria-hidden style={{ left: 0 }} />
            </div>
            {/* Circular rarity seal */}
            <div aria-hidden title={`${card.rarity} rarity`} style={{
              position: "absolute", top: 8, right: 8, width: 30, height: 30, borderRadius: "50%",
              background: PAPER, border: `2px solid ${r.c}`, display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 2px 6px -1px rgba(40,20,0,.4)",
            }}>
              <span style={{ fontFamily: "var(--ed-m)", fontWeight: 700, fontSize: 13, color: r.c }}>{r.l}</span>
            </div>
          </div>

          {/* species · element caption */}
          <div style={{ fontFamily: "var(--ed-m)", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: MUTED, padding: "9px 14px 4px", textTransform: "uppercase" }}>
            {(card.evolutionName || card.speciesName)} · {t.label}
          </div>

          {/* Stats trio */}
          <div style={{ display: "flex", gap: 7, padding: "2px 14px 6px" }}>
            {([["ATK", card.atk], ["DEF", card.def], ["SPD", card.spd]] as const).map(([lab, val]) => (
              <div key={lab} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", background: "#fff", borderRadius: 9, border: `1px solid ${HAIR}`, padding: "7px 2px" }}>
                <span style={{ fontFamily: "var(--ed-disp)", fontSize: 19, fontWeight: 700, color: INK, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{val}</span>
                <span style={{ fontFamily: "var(--ed-m)", fontSize: 8.5, color: MUTED, letterSpacing: 1, marginTop: 4 }}>{lab}</span>
              </div>
            ))}
          </div>

          {/* Sub-stats */}
          <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 16px", fontFamily: "var(--ed-m)", fontSize: 10, color: MUTED, fontVariantNumeric: "tabular-nums" }}>
            <span>PWR {card.power}</span>
            <span>BOND {card.bondLevel}</span>
            <span>STREAK {card.careStreak}d</span>
          </div>

          {/* Moves */}
          {card.moves.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5, padding: "4px 14px 8px" }}>
              {card.moves.map((m, i) => (
                <span key={i} style={{ fontFamily: "var(--ed-body)", fontSize: 11, fontWeight: 600, color: INK, background: "#fff", borderRadius: 7, border: `1px solid ${HAIR}`, padding: "3px 9px" }}>{m}</span>
              ))}
            </div>
          )}

          {/* Footer */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: "auto", padding: "9px 14px", borderTop: `1px solid ${HAIR}` }}>
            <span style={{ fontFamily: "var(--ed-disp)", fontSize: 11, fontWeight: 800, color: t.color, letterSpacing: "0.01em" }}>MY AI PET</span>
            <span style={{ fontFamily: "var(--ed-m)", fontSize: 9, color: MUTED, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "60%" }}>№ {String(card.id).padStart(4, "0")} · {card.personality}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
