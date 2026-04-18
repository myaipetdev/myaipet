/**
 * Adventure V2 — Pokemon-style Skill System
 * 4 skill slots per pet, element advantages, skill leveling
 */

// ── Element Types ──
export type Element = "normal" | "fire" | "water" | "grass" | "electric";

export const ELEMENTS: Record<Element, { emoji: string; color: string; name: string }> = {
  normal:   { emoji: "⚪", color: "#a8a8a8", name: "Normal" },
  fire:     { emoji: "🔥", color: "#f97316", name: "Fire" },
  water:    { emoji: "💧", color: "#3b82f6", name: "Water" },
  grass:    { emoji: "🌿", color: "#22c55e", name: "Grass" },
  electric: { emoji: "⚡", color: "#eab308", name: "Electric" },
};

// Element advantage matrix: attacker → defender → multiplier
export const TYPE_CHART: Record<Element, Record<Element, number>> = {
  normal:   { normal: 1.0, fire: 1.0, water: 1.0, grass: 1.0, electric: 1.0 },
  fire:     { normal: 1.0, fire: 0.5, water: 0.5, grass: 2.0, electric: 1.0 },
  water:    { normal: 1.0, fire: 2.0, water: 0.5, grass: 0.5, electric: 0.5 },
  grass:    { normal: 1.0, fire: 0.5, water: 2.0, grass: 0.5, electric: 1.0 },
  electric: { normal: 1.0, fire: 1.0, water: 2.0, grass: 0.5, electric: 0.5 },
};

// ── Skill Types ──
export type SkillType = "physical" | "special" | "status" | "utility";

export interface SkillDef {
  key: string;
  name: string;
  emoji: string;
  element: Element;
  type: SkillType;
  power: number;         // 0 for status/utility
  accuracy: number;      // 0-100
  energyCost: number;
  levelReq: number;      // pet level required to learn
  maxLevel: number;       // skill can be upgraded 1→maxLevel
  rarity: 1 | 2 | 3 | 4 | 5; // star rarity
  effect?: string;
  description: string;
  price?: number;        // credits to buy (0 = free / drop only)
}

// ── Full Skill Database (24 skills) ──
export const SKILL_DB: SkillDef[] = [
  // ── Normal ──
  { key: "scratch", name: "Scratch", emoji: "🐾", element: "normal", type: "physical", power: 35, accuracy: 95, energyCost: 0, levelReq: 1, maxLevel: 5, rarity: 1, description: "A basic scratch attack" },
  { key: "cute_attack", name: "Cute Attack", emoji: "🥺", element: "normal", type: "special", power: 30, accuracy: 100, energyCost: 0, levelReq: 1, maxLevel: 5, rarity: 1, effect: "def_down", description: "Charm that lowers opponent's defense" },
  { key: "body_slam", name: "Body Slam", emoji: "💥", element: "normal", type: "physical", power: 65, accuracy: 85, energyCost: 15, levelReq: 5, maxLevel: 5, rarity: 2, description: "A powerful slam attack" },
  { key: "dodge", name: "Dodge", emoji: "💨", element: "normal", type: "utility", power: 0, accuracy: 100, energyCost: 5, levelReq: 3, maxLevel: 3, rarity: 1, effect: "dodge", description: "Evade the next attack and heal slightly" },
  { key: "fury_swipe", name: "Fury Swipe", emoji: "⚡", element: "normal", type: "physical", power: 22, accuracy: 90, energyCost: 12, levelReq: 8, maxLevel: 5, rarity: 2, effect: "multi_hit", description: "Hit 2-4 times in succession" },
  { key: "intimidate", name: "Intimidate", emoji: "😈", element: "normal", type: "status", power: 0, accuracy: 95, energyCost: 8, levelReq: 6, maxLevel: 3, rarity: 2, effect: "atk_down", description: "Lower opponent's ATK sharply" },
  { key: "iron_defense", name: "Iron Defense", emoji: "🛡️", element: "normal", type: "status", power: 0, accuracy: 100, energyCost: 12, levelReq: 10, maxLevel: 3, rarity: 2, effect: "def_up", description: "Raise your DEF for 2 turns" },
  { key: "ultimate_charm", name: "Ultimate Charm", emoji: "✨", element: "normal", type: "special", power: 90, accuracy: 75, energyCost: 25, levelReq: 20, maxLevel: 5, rarity: 4, description: "An overwhelming special attack", price: 500 },

  // ── Fire ──
  { key: "ember", name: "Ember", emoji: "🔥", element: "fire", type: "special", power: 40, accuracy: 95, energyCost: 5, levelReq: 3, maxLevel: 5, rarity: 1, description: "A small flame attack" },
  { key: "flame_burst", name: "Flame Burst", emoji: "💥🔥", element: "fire", type: "special", power: 70, accuracy: 85, energyCost: 18, levelReq: 12, maxLevel: 5, rarity: 3, description: "An explosive burst of flame" },
  { key: "inferno", name: "Inferno", emoji: "🌋", element: "fire", type: "special", power: 100, accuracy: 70, energyCost: 30, levelReq: 25, maxLevel: 5, rarity: 5, effect: "burn", description: "Devastating fire that may burn", price: 800 },
  { key: "fire_fang", name: "Fire Fang", emoji: "🦷🔥", element: "fire", type: "physical", power: 55, accuracy: 90, energyCost: 10, levelReq: 8, maxLevel: 5, rarity: 2, description: "Bite with fiery fangs" },

  // ── Water ──
  { key: "water_gun", name: "Water Gun", emoji: "💦", element: "water", type: "special", power: 40, accuracy: 95, energyCost: 5, levelReq: 3, maxLevel: 5, rarity: 1, description: "A jet of water" },
  { key: "aqua_jet", name: "Aqua Jet", emoji: "🌊", element: "water", type: "physical", power: 50, accuracy: 100, energyCost: 10, levelReq: 7, maxLevel: 5, rarity: 2, effect: "priority", description: "Quick water strike, always goes first" },
  { key: "tidal_wave", name: "Tidal Wave", emoji: "🌊💥", element: "water", type: "special", power: 95, accuracy: 75, energyCost: 28, levelReq: 22, maxLevel: 5, rarity: 4, description: "A massive wave crashing down", price: 600 },
  { key: "rain_dance", name: "Rain Dance", emoji: "🌧️", element: "water", type: "status", power: 0, accuracy: 100, energyCost: 15, levelReq: 10, maxLevel: 3, rarity: 2, effect: "water_boost", description: "Boost Water moves for 3 turns" },

  // ── Grass ──
  { key: "vine_whip", name: "Vine Whip", emoji: "🌱", element: "grass", type: "physical", power: 40, accuracy: 95, energyCost: 5, levelReq: 3, maxLevel: 5, rarity: 1, description: "Strike with sharp vines" },
  { key: "razor_leaf", name: "Razor Leaf", emoji: "🍃", element: "grass", type: "physical", power: 60, accuracy: 90, energyCost: 12, levelReq: 10, maxLevel: 5, rarity: 2, effect: "crit_up", description: "Sharp leaves with high crit rate" },
  { key: "solar_bloom", name: "Solar Bloom", emoji: "🌸", element: "grass", type: "special", power: 95, accuracy: 80, energyCost: 28, levelReq: 22, maxLevel: 5, rarity: 4, description: "Channel sunlight into a blast", price: 600 },
  { key: "leech_seed", name: "Leech Seed", emoji: "🌰", element: "grass", type: "status", power: 0, accuracy: 90, energyCost: 10, levelReq: 8, maxLevel: 3, rarity: 2, effect: "drain", description: "Drain HP each turn for 3 turns" },

  // ── Electric ──
  { key: "spark", name: "Spark", emoji: "⚡", element: "electric", type: "physical", power: 40, accuracy: 95, energyCost: 5, levelReq: 3, maxLevel: 5, rarity: 1, description: "A quick electric jolt" },
  { key: "thunder_bolt", name: "Thunder Bolt", emoji: "🌩️", element: "electric", type: "special", power: 75, accuracy: 85, energyCost: 18, levelReq: 14, maxLevel: 5, rarity: 3, description: "A strong bolt of lightning" },
  { key: "lightning_storm", name: "Lightning Storm", emoji: "⛈️", element: "electric", type: "special", power: 100, accuracy: 65, energyCost: 32, levelReq: 28, maxLevel: 5, rarity: 5, effect: "paralyze", description: "An overwhelming storm, may paralyze", price: 800 },
  { key: "charge_up", name: "Charge Up", emoji: "🔋", element: "electric", type: "status", power: 0, accuracy: 100, energyCost: 10, levelReq: 6, maxLevel: 3, rarity: 2, effect: "sp_atk_up", description: "Boost Special ATK for next attack" },
];

// Map for quick lookup
export const SKILL_MAP: Record<string, SkillDef> = Object.fromEntries(
  SKILL_DB.map((s) => [s.key, s])
);

// Species → default element mapping
export const SPECIES_ELEMENTS: Record<number, Element> = {
  0: "normal",    // Cat
  1: "normal",    // Dog
  2: "grass",     // Parrot
  3: "water",     // Turtle
  4: "normal",    // Hamster
  5: "grass",     // Rabbit
  6: "fire",      // Fox
  7: "electric",  // Pomeranian
  8: "fire",      // Shiba Inu
  9: "electric",  // Doge
  10: "fire",     // Dragon
  11: "fire",     // Phoenix
  12: "grass",    // Unicorn
  13: "normal",   // Wolf
  14: "fire",     // Tiger
  15: "grass",    // Panda
  16: "water",    // Penguin
  17: "normal",   // Owl
  18: "normal",   // Bear
  19: "grass",    // Monkey
  20: "grass",    // Snake
  21: "electric", // Eagle
  22: "water",    // Dolphin
  23: "water",    // Shark
  24: "normal",   // Raccoon
  25: "fire",     // Red Panda
  26: "water",    // Axolotl
  27: "grass",    // Capybara
};

// ── Starter Skills per Element ──
// When a pet is created or first enters battle, they get 2 starter skills
export function getStarterSkills(element: Element): string[] {
  const starters: Record<Element, string[]> = {
    normal:   ["scratch", "cute_attack"],
    fire:     ["scratch", "ember"],
    water:    ["scratch", "water_gun"],
    grass:    ["scratch", "vine_whip"],
    electric: ["scratch", "spark"],
  };
  return starters[element] || starters.normal;
}

// Skills available to learn at each level threshold
export function getLearnableSkills(element: Element, level: number): SkillDef[] {
  return SKILL_DB.filter(
    (s) =>
      s.levelReq <= level &&
      (s.element === element || s.element === "normal")
  );
}

// ── Damage Calculation V2 ──
export function calcDamageV2(params: {
  attackerAtk: number;
  attackerSpAtk?: number;
  defenderDef: number;
  defenderSpDef?: number;
  skill: SkillDef;
  skillLevel: number;
  attackerElement: Element;
  defenderElement: Element;
  defBuff: number;
}): { damage: number; effectiveness: number; isCrit: boolean; hits?: number } {
  const {
    attackerAtk, attackerSpAtk, defenderDef, defenderSpDef, skill, skillLevel,
    attackerElement, defenderElement, defBuff,
  } = params;

  if (skill.power === 0) return { damage: 0, effectiveness: 1, isCrit: false };

  // STAB (Same Type Attack Bonus)
  const stab = skill.element === attackerElement ? 1.3 : 1.0;

  // Type effectiveness
  const effectiveness = TYPE_CHART[skill.element]?.[defenderElement] ?? 1.0;

  // Skill level bonus: each level adds 10%
  const levelBonus = 1 + (skillLevel - 1) * 0.1;

  // Use SpAtk/SpDef for special moves, Atk/Def for physical
  const atkStat = skill.type === "special" ? (attackerSpAtk ?? attackerAtk) : attackerAtk;
  const defStat = skill.type === "special" ? (defenderSpDef ?? defenderDef) : defenderDef;

  // Defense with buffs
  const effectiveDef = defStat * (1 + defBuff * 0.3);

  // Base damage formula
  const baseDmg = Math.max(1, (atkStat * skill.power * levelBonus) / (effectiveDef * 2 + 10));

  // Crit chance: 6.25% base, 18.75% for crit_up effect
  const critChance = skill.effect === "crit_up" ? 0.1875 : 0.0625;
  const isCrit = Math.random() < critChance;
  const critMul = isCrit ? 1.5 : 1.0;

  // Random variance 85-115%
  const variance = 0.85 + Math.random() * 0.3;

  const finalDmg = Math.floor(baseDmg * stab * effectiveness * critMul * variance);

  // Multi-hit: roll 2-4 hits and multiply total damage
  if (skill.effect === "multi_hit") {
    const hits = 2 + Math.floor(Math.random() * 3); // 2, 3, or 4
    return { damage: Math.max(1, finalDmg) * hits, effectiveness, isCrit, hits };
  }

  return { damage: Math.max(1, finalDmg), effectiveness, isCrit };
}

// ── Battle Constants ──
export const MAX_SKILL_SLOTS = 4;
export const DAILY_BATTLE_CAP = 30;           // Max battles per day per pet
export const DAILY_EXP_CAP = 1500;            // Max free exp per day
export const DAILY_PLAY_REWARD_MINUTES = 30;  // Minutes needed for daily reward
export const PLAY_TIME_REWARD_EXP = 50;       // EXP for daily play time
export const PLAY_TIME_REWARD_CREDITS = 10;   // Credits for daily play time

// Growth boost from USDT spending
export function getGrowthMultiplier(totalCreditsSpent: number): number {
  if (totalCreditsSpent >= 5000) return 1.5;  // Pro tier
  if (totalCreditsSpent >= 1000) return 1.3;  // Creator tier
  if (totalCreditsSpent >= 200)  return 1.15; // Starter tier
  return 1.0;
}

// Skill upgrade cost (in credits)
export function getSkillUpgradeCost(currentLevel: number, rarity: number): number {
  const baseCost = rarity * 30;
  return baseCost * currentLevel;
}
