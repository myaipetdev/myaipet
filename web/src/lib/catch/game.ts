/**
 * Cat Catch game logic — rarity roll + stat/element/name generation at catch
 * time. These are GAME stats for a freshly-caught creature (transparent game
 * mechanic), rolled by rarity tier.
 */

export type CatRarity = "gray" | "green" | "blue" | "purple" | "orange";

export interface RarityTier {
  key: CatRarity;
  label: string;
  color: string;
  weight: number; // relative spawn weight
}

export const RARITY_TIERS: RarityTier[] = [
  { key: "gray",   label: "Common",    color: "#9ca3af", weight: 50 },
  { key: "green",  label: "Uncommon",  color: "#22c55e", weight: 28 },
  { key: "blue",   label: "Rare",      color: "#3b82f6", weight: 14 },
  { key: "purple", label: "Epic",      color: "#a855f7", weight: 6 },
  { key: "orange", label: "Legendary", color: "#f59e0b", weight: 2 },
];

export function rarityMeta(key: string): RarityTier {
  return RARITY_TIERS.find((t) => t.key === key) || RARITY_TIERS[0];
}

/** Airdrop points awarded per catch, scaled by rarity (daily-capped in the route). */
export const CATCH_POINTS: Record<CatRarity, number> = {
  gray: 10, green: 18, blue: 30, purple: 50, orange: 80,
};

/** Weighted rarity roll. A very clear, confident sighting gets a small luck nudge. */
export function rollRarity(confidence = 0.6): CatRarity {
  const tiers = RARITY_TIERS.map((t) => ({
    ...t,
    // confidence > 0.85 slightly favors the rarer tiers (a clean, well-framed cat).
    w: t.weight * (confidence > 0.85 && t.weight <= 14 ? 1.4 : 1),
  }));
  const total = tiers.reduce((s, t) => s + t.w, 0);
  let r = Math.random() * total;
  for (const t of tiers) { r -= t.w; if (r <= 0) return t.key; }
  return "gray";
}

const STAT_RANGES: Record<CatRarity, { hp: [number, number]; stat: [number, number] }> = {
  gray:   { hp: [30, 46],  stat: [8, 15] },
  green:  { hp: [42, 60],  stat: [12, 20] },
  blue:   { hp: [58, 78],  stat: [18, 28] },
  purple: { hp: [76, 100], stat: [26, 40] },
  orange: { hp: [98, 130], stat: [38, 55] },
};

const rint = ([lo, hi]: [number, number]) => lo + Math.floor(Math.random() * (hi - lo + 1));

export function rollStats(rarity: CatRarity): { hp: number; atk: number; def: number; spd: number } {
  const r = STAT_RANGES[rarity];
  return { hp: rint(r.hp), atk: rint(r.stat), def: rint(r.stat), spd: rint(r.stat) };
}

/** Thematic element from the cat's read mood. */
export function pickElement(mood: string): string {
  const m: Record<string, string> = {
    fierce: "fire", grumpy: "fire",
    sleepy: "water", shy: "water",
    playful: "electric", curious: "grass",
    calm: "normal",
  };
  return m[mood] || "normal";
}

const CAT_NAMES = [
  "Mochi", "Biscuit", "Shadow", "Pumpkin", "Tiger", "Luna", "Oreo", "Smokey",
  "Ginger", "Pepper", "Bean", "Noodle", "Pickle", "Waffle", "Sushi", "Miso",
  "Pixel", "Gizmo", "Bandit", "Cleo", "Nori", "Dumpling", "Marble", "Toast",
];

const DOG_NAMES = [
  "Rocky", "Bella", "Cooper", "Max", "Daisy", "Buddy", "Rex", "Coco",
  "Bruno", "Nala", "Zeus", "Hazel", "Duke", "Ruby", "Otis", "Maple",
  "Bear", "Pippin", "Scout", "Tofu", "Biscuit", "Pretzel", "Moose", "Pumpkin",
];

export function pickName(kind: "cat" | "dog" = "cat"): string {
  const pool = kind === "dog" ? DOG_NAMES : CAT_NAMES;
  return pool[Math.floor(Math.random() * pool.length)];
}
