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
 * Deterministic rarity from a pet's REAL grind signals — client-safe (no prisma
 * import), so the collection album can label each owned card by its true rarity
 * without an extra fetch. The server card lib re-exports this and derives its
 * `CardData.rarity` from the exact same function, so client and server agree.
 * No fabricated numbers: every input is a real Pet column.
 */
export function computeRarity(p: {
  level: number; bond_level: number; care_streak: number;
  atk: number; def: number; spd: number; evolution_stage: number;
}): { rarity: Rarity; score: number } {
  const power = p.atk + p.def + p.spd;
  const score =
    p.level * 2 +
    p.bond_level * 3 +
    p.care_streak +
    Math.round(power / 3) +
    p.evolution_stage * 6;
  let rarity: Rarity = "Common";
  if (score >= 140) rarity = "Legendary";
  else if (score >= 90) rarity = "Epic";
  else if (score >= 55) rarity = "Rare";
  else if (score >= 28) rarity = "Uncommon";
  return { rarity, score };
}

/* Rarity is now carried by the wax-seal "Printed Stock" material model in
 * @/components/Sticker (rarityStock) — the old glow/holo/sparkle rarityFx was
 * retired with the visual system v2. */
