/**
 * TCG trading-card data — derived ENTIRELY from a pet's real stats.
 *
 * No fabricated numbers: ATK/DEF/SPD/level/element/bond/care-streak/evolution
 * are the actual Pet columns; rarity is a deterministic function of real grind
 * signals (power + level + bond + care streak + evolution). Used by both the
 * public card page and the OG image route, so they always agree.
 */

import { prisma } from "@/lib/prisma";

const SPECIES_NAMES: Record<number, string> = {
  0: "Cat", 1: "Dog", 2: "Parrot", 3: "Turtle",
  4: "Hamster", 5: "Rabbit", 6: "Fox", 7: "Pomeranian",
};

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

export type Rarity = "Common" | "Uncommon" | "Rare" | "Epic" | "Legendary";

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

/** Deterministic rarity from real grind signals — higher = rarer. */
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

/** Humanize a skill_key like "water_gun" → "Water Gun". */
export function humanizeSkill(key: string): string {
  return key.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export interface CardData {
  id: number;
  name: string;
  speciesName: string;
  element: string;
  level: number;
  atk: number;
  def: number;
  spd: number;
  power: number;
  bondLevel: number;
  careStreak: number;
  evolutionName: string | null;
  evolutionStage: number;
  personality: string;
  avatarUrl: string | null;
  rarity: Rarity;
  /** "Top N%" rarity rank across all active pets (real count). null if unknown. */
  topPercent: number | null;
  /** Up to 3 equipped move names (humanized). */
  moves: string[];
  bornAt: string; // ISO
}

/**
 * Public, owner-agnostic card data for a pet id. Returns null if the pet is
 * missing/inactive. Exposes only card-appropriate public fields (no owner,
 * no private memory) — safe for a shareable page.
 */
export async function getCardData(petId: number): Promise<CardData | null> {
  if (!Number.isInteger(petId) || petId <= 0) return null;
  let pet;
  try {
    pet = await prisma.pet.findFirst({
      where: { id: petId, is_active: true },
      select: {
        id: true, name: true, species: true, element: true, level: true,
        atk: true, def: true, spd: true, bond_level: true, care_streak: true,
        evolution_name: true, evolution_stage: true, personality_type: true,
        avatar_url: true, created_at: true,
        skills: {
          where: { slot: { not: null } },
          orderBy: { slot: "asc" },
          take: 3,
          select: { skill_key: true },
        },
      },
    });
  } catch {
    return null;
  }
  if (!pet) return null;

  const { rarity, score } = computeRarity({
    level: pet.level, bond_level: pet.bond_level, care_streak: pet.care_streak,
    atk: pet.atk, def: pet.def, spd: pet.spd, evolution_stage: pet.evolution_stage,
  });

  // "Top N%" = share of active pets whose rarity score is >= this pet's. One
  // aggregate query; tolerate failure (badge just hides). The SQL score mirrors
  // computeRarity (integer division on (atk+def+spd)/3 is close enough for a %).
  let topPercent: number | null = null;
  try {
    const rows = await prisma.$queryRaw<{ total: bigint; higher: bigint }[]>`
      SELECT COUNT(*)::bigint AS total,
             COUNT(*) FILTER (
               WHERE (level*2 + bond_level*3 + care_streak + (atk+def+spd)/3 + evolution_stage*6) >= ${score}
             )::bigint AS higher
      FROM pets WHERE is_active = true`;
    const total = Number(rows?.[0]?.total || 0);
    const higher = Number(rows?.[0]?.higher || 0);
    if (total > 0) topPercent = Math.min(100, Math.max(1, Math.round((higher / total) * 100)));
  } catch { topPercent = null; }

  return {
    id: pet.id,
    name: pet.name,
    speciesName: SPECIES_NAMES[pet.species] || "Companion",
    element: pet.element,
    level: pet.level,
    atk: pet.atk,
    def: pet.def,
    spd: pet.spd,
    power: pet.atk + pet.def + pet.spd,
    bondLevel: pet.bond_level,
    careStreak: pet.care_streak,
    evolutionName: pet.evolution_name,
    evolutionStage: pet.evolution_stage,
    personality: pet.personality_type,
    avatarUrl: pet.avatar_url,
    rarity,
    topPercent,
    moves: pet.skills.map((s) => humanizeSkill(s.skill_key)),
    bornAt: pet.created_at.toISOString(),
  };
}
