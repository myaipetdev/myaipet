"use client";

/**
 * Printed Stock — Design System v2 shared primitives.
 *
 * The whole product reads as die-cut stickers: a thick ink keyline, a cream/
 * white die-cut margin, and ONE hard, zero-blur ink offset shadow. Rarity is
 * carried by a hand-stamped WAX SEAL (the only place a rarity hue appears) —
 * never by glow. Depth is static; motion is the .dc peel/press only.
 *
 * Used by PetCard, CatCatch, SeasonTierCard and PetStudioPro so a TCG card, a
 * caught animal, a season tier and a generated frame are visibly one family.
 */

import React from "react";

export const INK = "#1a1a22";
export const CREAM = "#faf7f2";

export interface SealSpec {
  fill: string;        // flat fill (or matte foil) — never a radial fade
  ring: string;        // ink keyline of the seal
  glyph: string;       // one short token: C / U / R / E / ★
  glyphColor: string;
  lip: string;         // inset embossed highlight
}

export interface RarityStock {
  tier: number;
  keyline: number;          // outer keyline width (px)
  keylineColor: string;
  marginStock: string;      // die-cut margin background (solid or matte foil)
  marginHairline: boolean;  // Uncommon letterpress double-strike
  stitch: boolean;          // Rare+ dashed ink stitch just inside the margin
  shadowAlpha: number;      // rest offset-shadow alpha
  seal: SealSpec;
}

const STOCK: RarityStock[] = [
  { tier: 0, keyline: 2.5, keylineColor: INK, marginStock: "#ffffff", marginHairline: false, stitch: false, shadowAlpha: 0.14,
    seal: { fill: "#faf7f2", ring: INK, glyph: "C", glyphColor: "rgba(26,26,46,0.55)", lip: "inset 0 1.5px 0 rgba(255,255,255,0.5)" } },
  { tier: 1, keyline: 2.5, keylineColor: INK, marginStock: "#ffffff", marginHairline: true, stitch: false, shadowAlpha: 0.16,
    seal: { fill: "#cdb89a", ring: INK, glyph: "U", glyphColor: INK, lip: "inset 0 1.5px 0 rgba(255,255,255,0.5)" } },
  { tier: 2, keyline: 3, keylineColor: INK, marginStock: "#ffffff", marginHairline: false, stitch: true, shadowAlpha: 0.18,
    seal: { fill: "#f59e0b", ring: "#b45309", glyph: "R", glyphColor: INK, lip: "inset 0 1.5px 0 rgba(255,255,255,0.5)" } },
  { tier: 3, keyline: 3, keylineColor: INK, marginStock: "repeating-linear-gradient(45deg,#f3ece0 0 6px,#e7ddcc 6px 12px)", marginHairline: false, stitch: true, shadowAlpha: 0.20,
    seal: { fill: "#f59e0b", ring: "#b45309", glyph: "E", glyphColor: INK, lip: "inset 0 1.5px 0 rgba(255,255,255,0.65)" } },
  { tier: 4, keyline: 3, keylineColor: "#b45309", marginStock: "repeating-linear-gradient(110deg,#fbe6b0 0 5px,#f1c453 5px 10px,#fbe6b0 10px 15px)", marginHairline: false, stitch: true, shadowAlpha: 0.20,
    seal: { fill: "#f1c453", ring: "#b45309", glyph: "★", glyphColor: "#fff", lip: "inset 0 2px 0 rgba(255,255,255,0.7)" } },
];

export function rarityStock(tier: number): RarityStock {
  return STOCK[Math.max(0, Math.min(4, Math.round(tier)))];
}

/**
 * The three offset-shadow steps (rest/hover/press) for a .dc sticker, as CSS
 * custom properties. `alpha` scales depth with rarity; `dark` switches to a
 * black shadow for the warm-ink Studio/Catch-reveal surfaces.
 */
export function dcVars(alpha = 0.16, dark = false, extraInset = ""): React.CSSProperties {
  const c = dark ? `rgba(0,0,0,${Math.min(0.4, alpha + 0.18)})` : `rgba(26,26,34,${alpha})`;
  const x = extraInset ? `, ${extraInset}` : "";
  return {
    ["--dc-rest" as any]: `0 8px 0 ${c}${x}`,
    ["--dc-hover" as any]: `0 12px 0 ${c}${x}`,
    ["--dc-press" as any]: `0 4px 0 ${c}${x}`,
  };
}

/** A hand-stamped wax seal — the sole rarity carrier. `stamp` plays the
 *  one-shot sealPress on mount (used at the reveal moment). */
export function WaxSeal({ seal, size = 30, stamp = false, title, style }: {
  seal: SealSpec; size?: number; stamp?: boolean; title?: string; style?: React.CSSProperties;
}) {
  return (
    <div
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      style={{
        width: size, height: size, borderRadius: "50%", flexShrink: 0,
        background: seal.fill, border: `2px solid ${seal.ring}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        transform: "rotate(-8deg)",
        boxShadow: `2px 3px 0 rgba(26,26,34,0.26), ${seal.lip}`,
        animation: stamp ? "sealPress 0.32s cubic-bezier(0.2,1.3,0.4,1) both" : undefined,
        ...style,
      }}
    >
      <span style={{
        fontFamily: "'JetBrains Mono', monospace", fontWeight: 800,
        fontSize: Math.round(size * 0.42), color: seal.glyphColor,
        textShadow: "0 1px 0 rgba(255,255,255,0.5)", lineHeight: 1,
      }}>{seal.glyph}</span>
    </div>
  );
}
