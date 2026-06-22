/**
 * Client-safe TCG theme constants (no prisma import) — shared by the server
 * card lib, the OG image route, and the client <PetCard> component.
 */

export type Rarity = "Common" | "Uncommon" | "Rare" | "Epic" | "Legendary";

export interface ElementTheme {
  label: string;
  /** primary accent */
  color: string;
  /** dark gradient stops for the card/background */
  grad: [string, string];
}

export const ELEMENT_THEME: Record<string, ElementTheme> = {
  fire:     { label: "Fire",     color: "#f97316", grad: ["#7c2d12", "#f97316"] },
  water:    { label: "Water",    color: "#3b82f6", grad: ["#1e3a8a", "#3b82f6"] },
  grass:    { label: "Grass",    color: "#22c55e", grad: ["#14532d", "#22c55e"] },
  electric: { label: "Electric", color: "#eab308", grad: ["#713f12", "#eab308"] },
  normal:   { label: "Normal",   color: "#9ca3af", grad: ["#374151", "#9ca3af"] },
};

export function elementTheme(element: string): ElementTheme {
  return ELEMENT_THEME[element] || ELEMENT_THEME.normal;
}

const RARITY_COLOR: Record<Rarity, string> = {
  Common: "#9ca3af",
  Uncommon: "#22c55e",
  Rare: "#3b82f6",
  Epic: "#a855f7",
  Legendary: "#f59e0b",
};
export function rarityColor(r: Rarity): string {
  return RARITY_COLOR[r];
}

export const RARITY_ORDER: Rarity[] = ["Common", "Uncommon", "Rare", "Epic", "Legendary"];
export function rarityTier(r: Rarity): number {
  const i = RARITY_ORDER.indexOf(r);
  return i < 0 ? 0 : i;
}

/**
 * Escalating visual FX per rarity tier (0 Common → 4 Legendary). Drives the
 * card's border, glow, holo sheen, sparkles and animated frame. `color` is the
 * accent (rarity colour) used to build the ring/glow.
 *
 * tier 0 Common      — clean solid border, no glow.
 * tier 1 Uncommon    — solid border + soft static glow.
 * tier 2 Rare        — metallic inner ring + glow + holo sheen.
 * tier 3 Epic        — animated gradient border + pulsing glow + holo.
 * tier 4 Legendary   — animated gold→rainbow border + strong pulse + holo + sparkles.
 */
export interface RarityFx {
  tier: number;
  borderWidth: number;
  animatedBorder: boolean;
  ringGradient: string; // conic gradient (animated tiers) or a flat color
  glow: number;         // outer-glow blur px (0 = none)
  glowPulse: boolean;
  holo: boolean;
  holoOpacity: number;
  sparkles: boolean;
  innerRing: boolean;
}

export function rarityFx(tier: number, color: string): RarityFx {
  const t = Math.max(0, Math.min(4, Math.round(tier)));
  const base = [
    { borderWidth: 3,   animatedBorder: false, glow: 0,  glowPulse: false, holo: false, holoOpacity: 0,    sparkles: false, innerRing: false },
    { borderWidth: 3,   animatedBorder: false, glow: 13, glowPulse: false, holo: false, holoOpacity: 0,    sparkles: false, innerRing: false },
    { borderWidth: 3.5, animatedBorder: false, glow: 20, glowPulse: false, holo: true,  holoOpacity: 0.30, sparkles: false, innerRing: true  },
    { borderWidth: 4,   animatedBorder: true,  glow: 26, glowPulse: true,  holo: true,  holoOpacity: 0.42, sparkles: false, innerRing: true  },
    { borderWidth: 4.5, animatedBorder: true,  glow: 34, glowPulse: true,  holo: true,  holoOpacity: 0.55, sparkles: true,  innerRing: true  },
  ][t];
  const ringGradient = base.animatedBorder
    ? (t === 4
        ? "conic-gradient(#f59e0b,#fde68a,#fb7185,#a855f7,#38bdf8,#f59e0b)" // legendary gold→rainbow
        : `conic-gradient(${color},#ffffffcc,${color},${color}55,${color})`) // epic shimmer
    : color;
  return { tier: t, ringGradient, ...base };
}
