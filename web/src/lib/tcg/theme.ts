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

/* Collectible Editorial element accents — warm tones that read on both the
 * cream paper card and the warm-dark (#1E1710) card-vault share pages. The
 * grads are deep warm stops for dark backdrops (OG images, share pages). */
export const ELEMENT_THEME: Record<string, ElementTheme> = {
  fire:     { label: "Fire",     color: "#BE4F28", grad: ["#4A2A12", "#BE4F28"] },
  water:    { label: "Water",    color: "#3E8FE0", grad: ["#1E3A54", "#3E8FE0"] },
  grass:    { label: "Grass",    color: "#5C8A4E", grad: ["#26391E", "#5C8A4E"] },
  electric: { label: "Electric", color: "#C8932F", grad: ["#4A3512", "#C8932F"] },
  normal:   { label: "Normal",   color: "#7A6E5A", grad: ["#3A3024", "#7A6E5A"] },
};

export function elementTheme(element: string): ElementTheme {
  return ELEMENT_THEME[element] || ELEMENT_THEME.normal;
}

/* Locked Collectible Editorial rarity tokens (Uncommon rides with Common). */
const RARITY_COLOR: Record<Rarity, string> = {
  Common: "#5C8A4E",
  Uncommon: "#5C8A4E",
  Rare: "#3E8FE0",
  Epic: "#9E72E8",
  Legendary: "#C8932F",
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
/** Real score thresholds each rarity tier starts at — exported so UI progress
 *  lines ("{score}/{threshold} to Epic") stay in lockstep with computeRarity. */
export const RARITY_THRESHOLD: Record<Exclude<Rarity, "Common">, number> = {
  Uncommon: 28, Rare: 55, Epic: 90, Legendary: 140,
};

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
  if (score >= RARITY_THRESHOLD.Legendary) rarity = "Legendary";
  else if (score >= RARITY_THRESHOLD.Epic) rarity = "Epic";
  else if (score >= RARITY_THRESHOLD.Rare) rarity = "Rare";
  else if (score >= RARITY_THRESHOLD.Uncommon) rarity = "Uncommon";
  return { rarity, score };
}

/* Rarity is now carried by the wax-seal "Printed Stock" material model in
 * @/components/Sticker (rarityStock) — the old glow/holo/sparkle rarityFx was
 * retired with the visual system v2. */

/** Fixed adopt-species universe — the honest denominator for the album's
 *  species dex. Single source shared with the server card lib (card.ts). */
export const SPECIES_NAMES: Record<number, string> = {
  0: "Cat", 1: "Dog", 2: "Parrot", 3: "Turtle",
  4: "Hamster", 5: "Rabbit", 6: "Fox", 7: "Pomeranian",
};
/** /public/icons filenames per species (Pomeranian reuses the dog glyph). */
export const SPECIES_ICONS: Record<number, string> = {
  0: "cat", 1: "dog", 2: "parrot", 3: "turtle",
  4: "hamster", 5: "rabbit", 6: "fox", 7: "dog",
};
