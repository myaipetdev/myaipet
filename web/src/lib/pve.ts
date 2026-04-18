/**
 * PvE Boss System — Pokemon-style Stage Progression
 *
 * 30 stages across 6 regions, each with:
 * - 4 wild encounters (minions) + 1 boss
 * - Boss has unique skills, element, personality
 * - 3-star rating system per stage
 * - Rewards: EXP, credits, skill drops, evolution items
 *
 * Progression:
 *   Region 1: Grasslands  (Stage 1-5)   — Normal/Grass  — Lv.1-8
 *   Region 2: Volcano     (Stage 6-10)  — Fire          — Lv.8-16
 *   Region 3: Ocean       (Stage 11-15) — Water         — Lv.16-24
 *   Region 4: Storm Peak  (Stage 16-20) — Electric      — Lv.24-32
 *   Region 5: Shadow Realm(Stage 21-25) — Mixed         — Lv.32-42
 *   Region 6: Dragon's End(Stage 26-30) — Dragon bosses — Lv.42-60
 */

import { type Element, type SkillDef, SKILL_MAP, ELEMENTS } from "./skills";

// ── Region Definitions ──
export interface Region {
  id: number;
  name: string;
  emoji: string;
  element: Element;
  color: string;
  description: string;
  stages: number[]; // stage IDs in this region
}

export const REGIONS: Region[] = [
  {
    id: 1, name: "Grasslands", emoji: "🌿", element: "grass", color: "#22c55e",
    description: "A peaceful meadow where beginners take their first steps",
    stages: [1, 2, 3, 4, 5],
  },
  {
    id: 2, name: "Volcano Ridge", emoji: "🌋", element: "fire", color: "#f97316",
    description: "Scorching paths through volcanic terrain",
    stages: [6, 7, 8, 9, 10],
  },
  {
    id: 3, name: "Coral Depths", emoji: "🌊", element: "water", color: "#3b82f6",
    description: "Mysterious underwater ruins and deep currents",
    stages: [11, 12, 13, 14, 15],
  },
  {
    id: 4, name: "Storm Peak", emoji: "⛈️", element: "electric", color: "#eab308",
    description: "A mountain crackling with constant lightning",
    stages: [16, 17, 18, 19, 20],
  },
  {
    id: 5, name: "Shadow Realm", emoji: "🌑", element: "normal", color: "#a855f7",
    description: "A twisted dimension where all elements converge",
    stages: [21, 22, 23, 24, 25],
  },
  {
    id: 6, name: "Dragon's End", emoji: "🐉", element: "normal", color: "#dc2626",
    description: "The legendary dragon sanctuary — final challenge (elementally mixed)",
    stages: [26, 27, 28, 29, 30],
  },
];

// ── Boss / Enemy Definition ──
export interface PveBoss {
  id: number;        // same as stage_id
  name: string;
  emoji: string;
  title: string;     // e.g. "Gym Leader", "Elite Four", "Dragon King"
  element: Element;
  personality: string;
  level: number;
  baseHp: number;
  baseAtk: number;
  baseDef: number;
  baseSpd: number;
  skills: { key: string; level: number }[];
  dialogue: {
    intro: string;
    win: string;     // player wins
    lose: string;    // player loses
  };
  rewards: {
    exp: number;
    credits: number;
    airdropPoints: number;
    skillDrop?: string;      // guaranteed skill drop on first clear
    skillDropChance?: number; // repeat clear drop chance
  };
  isBoss: boolean;   // true for stage boss, false for minion
  region: number;
}

// ── Minion Templates (per region) ──
interface MinionTemplate {
  names: string[];
  emojis: string[];
  element: Element;
  personality: string;
}

const REGION_MINIONS: Record<number, MinionTemplate[]> = {
  1: [
    { names: ["Sprout Rat", "Moss Frog", "Leaf Bunny"], emojis: ["🐀", "🐸", "🐰"], element: "grass", personality: "playful" },
    { names: ["Wild Hamster", "Forest Fox"], emojis: ["🐹", "🦊"], element: "normal", personality: "brave" },
  ],
  2: [
    { names: ["Ember Lizard", "Flame Pup", "Magma Crab"], emojis: ["🦎", "🐕", "🦀"], element: "fire", personality: "brave" },
    { names: ["Ash Rat", "Cinder Bird"], emojis: ["🐀", "🐦"], element: "fire", personality: "playful" },
  ],
  3: [
    { names: ["Coral Fish", "Tide Crab", "Bubble Frog"], emojis: ["🐟", "🦀", "🐸"], element: "water", personality: "gentle" },
    { names: ["Reef Turtle", "Splash Otter"], emojis: ["🐢", "🦦"], element: "water", personality: "lazy" },
  ],
  4: [
    { names: ["Spark Mouse", "Thunder Bug", "Bolt Bird"], emojis: ["🐭", "🐛", "🐦"], element: "electric", personality: "playful" },
    { names: ["Storm Cat", "Lightning Fox"], emojis: ["🐱", "🦊"], element: "electric", personality: "brave" },
  ],
  5: [
    { names: ["Shadow Wolf", "Dark Raven", "Phantom Cat"], emojis: ["🐺", "🦅", "🐱"], element: "normal", personality: "brave" },
    { names: ["Void Snake", "Chaos Monkey"], emojis: ["🐍", "🐒"], element: "grass", personality: "playful" },
  ],
  6: [
    { names: ["Drake Whelp", "Fire Wyrm", "Storm Drake"], emojis: ["🐲", "🐍", "🦎"], element: "fire", personality: "brave" },
    { names: ["Ice Drake", "Thunder Drake"], emojis: ["🐉", "🐲"], element: "water", personality: "brave" },
  ],
};

// ── All 30 Stage Bosses ──
export const PVE_STAGES: PveBoss[] = [
  // ════ REGION 1: GRASSLANDS (Lv.1-8) ════
  {
    id: 1, name: "Thorn", emoji: "🌱", title: "Sprout Guardian",
    element: "grass", personality: "gentle", level: 3,
    baseHp: 60, baseAtk: 12, baseDef: 10, baseSpd: 8,
    skills: [{ key: "vine_whip", level: 1 }, { key: "scratch", level: 1 }],
    dialogue: { intro: "The meadow stirs... Thorn blocks your path!", win: "The sprout wilts. Path cleared!", lose: "Nature prevails..." },
    rewards: { exp: 20, credits: 5, airdropPoints: 10 },
    isBoss: true, region: 1,
  },
  {
    id: 2, name: "Briar", emoji: "🌿", title: "Vine Trainer",
    element: "grass", personality: "brave", level: 5,
    baseHp: 85, baseAtk: 16, baseDef: 12, baseSpd: 10,
    skills: [{ key: "vine_whip", level: 2 }, { key: "dodge", level: 1 }, { key: "scratch", level: 1 }],
    dialogue: { intro: "Trainer Briar: 'Show me what your pet can do!'", win: "Briar: 'Impressive technique!'", lose: "Briar: 'Train harder, young one.'" },
    rewards: { exp: 30, credits: 10, airdropPoints: 15 },
    isBoss: true, region: 1,
  },
  {
    id: 3, name: "Mossheart", emoji: "🍃", title: "Forest Keeper",
    element: "grass", personality: "gentle", level: 6,
    baseHp: 100, baseAtk: 18, baseDef: 16, baseSpd: 10,
    skills: [{ key: "razor_leaf", level: 1 }, { key: "leech_seed", level: 1 }, { key: "vine_whip", level: 2 }],
    dialogue: { intro: "The ancient Mossheart awakens from slumber...", win: "The forest acknowledges your strength.", lose: "The vines drag you back to the entrance." },
    rewards: { exp: 40, credits: 15, airdropPoints: 20 },
    isBoss: true, region: 1,
  },
  {
    id: 4, name: "Fern", emoji: "🌾", title: "Meadow Elite",
    element: "grass", personality: "playful", level: 7,
    baseHp: 120, baseAtk: 20, baseDef: 18, baseSpd: 14,
    skills: [{ key: "razor_leaf", level: 2 }, { key: "leech_seed", level: 1 }, { key: "dodge", level: 2 }, { key: "cute_attack", level: 2 }],
    dialogue: { intro: "Fern dances through the tall grass!", win: "The meadow falls silent in respect.", lose: "The grass whispers your defeat." },
    rewards: { exp: 50, credits: 20, airdropPoints: 25, skillDrop: "leech_seed" },
    isBoss: true, region: 1,
  },
  {
    id: 5, name: "Elderoak", emoji: "🌳", title: "Grassland Gym Leader",
    element: "grass", personality: "gentle", level: 8,
    baseHp: 160, baseAtk: 24, baseDef: 22, baseSpd: 12,
    skills: [{ key: "solar_bloom", level: 1 }, { key: "razor_leaf", level: 2 }, { key: "leech_seed", level: 2 }, { key: "iron_defense", level: 1 }],
    dialogue: { intro: "Gym Leader Elderoak: 'I am the root of all growth. Can you withstand my forest?'", win: "Elderoak: 'You've earned the Leaf Badge. The volcano awaits.'", lose: "Elderoak: 'Return when your roots grow deeper.'" },
    rewards: { exp: 80, credits: 40, airdropPoints: 50, skillDrop: "razor_leaf" },
    isBoss: true, region: 1,
  },

  // ════ REGION 2: VOLCANO RIDGE (Lv.8-16) ════
  {
    id: 6, name: "Cinder", emoji: "🔥", title: "Flame Scout",
    element: "fire", personality: "brave", level: 9,
    baseHp: 130, baseAtk: 26, baseDef: 16, baseSpd: 18,
    skills: [{ key: "ember", level: 2 }, { key: "scratch", level: 2 }, { key: "fire_fang", level: 1 }],
    dialogue: { intro: "Cinder sparks to life from the lava!", win: "The flames die down.", lose: "You're sent back by the heat." },
    rewards: { exp: 55, credits: 20, airdropPoints: 20 },
    isBoss: true, region: 2,
  },
  {
    id: 7, name: "Scorcha", emoji: "💥", title: "Eruption Trainer",
    element: "fire", personality: "brave", level: 11,
    baseHp: 160, baseAtk: 30, baseDef: 18, baseSpd: 20,
    skills: [{ key: "flame_burst", level: 1 }, { key: "ember", level: 2 }, { key: "intimidate", level: 1 }],
    dialogue: { intro: "Trainer Scorcha: 'The volcano is my arena!'", win: "Scorcha: 'You survived the heat!'", lose: "Scorcha: 'Not hot enough.'" },
    rewards: { exp: 65, credits: 25, airdropPoints: 25 },
    isBoss: true, region: 2,
  },
  {
    id: 8, name: "Magmaw", emoji: "🌋", title: "Lava Beast",
    element: "fire", personality: "lazy", level: 13,
    baseHp: 200, baseAtk: 32, baseDef: 24, baseSpd: 12,
    skills: [{ key: "flame_burst", level: 2 }, { key: "fire_fang", level: 2 }, { key: "iron_defense", level: 1 }, { key: "body_slam", level: 2 }],
    dialogue: { intro: "The ground cracks open — Magmaw rises!", win: "Magmaw sinks back into the lava.", lose: "The eruption overwhelms you." },
    rewards: { exp: 80, credits: 30, airdropPoints: 30, skillDrop: "fire_fang" },
    isBoss: true, region: 2,
  },
  {
    id: 9, name: "Pyrex", emoji: "🦎", title: "Volcano Elite",
    element: "fire", personality: "brave", level: 15,
    baseHp: 230, baseAtk: 36, baseDef: 22, baseSpd: 24,
    skills: [{ key: "flame_burst", level: 2 }, { key: "fire_fang", level: 2 }, { key: "fury_swipe", level: 2 }, { key: "intimidate", level: 2 }],
    dialogue: { intro: "Pyrex: 'Only the strong survive the ridge!'", win: "Pyrex bows in fiery respect.", lose: "The volcano erupts as you fall." },
    rewards: { exp: 100, credits: 40, airdropPoints: 40, skillDrop: "flame_burst" },
    isBoss: true, region: 2,
  },
  {
    id: 10, name: "Infernox", emoji: "🔥", title: "Volcano Gym Leader",
    element: "fire", personality: "brave", level: 16,
    baseHp: 280, baseAtk: 40, baseDef: 26, baseSpd: 26,
    skills: [{ key: "inferno", level: 1 }, { key: "flame_burst", level: 3 }, { key: "fire_fang", level: 2 }, { key: "intimidate", level: 2 }],
    dialogue: { intro: "Gym Leader Infernox: 'I am the heart of the volcano. Burn or be burned!'", win: "Infernox: 'The Flame Badge is yours. Dive into the depths next.'", lose: "Infernox: 'Ashes to ashes.'" },
    rewards: { exp: 150, credits: 60, airdropPoints: 70, skillDrop: "ember" },
    isBoss: true, region: 2,
  },

  // ════ REGION 3: CORAL DEPTHS (Lv.16-24) ════
  {
    id: 11, name: "Ripple", emoji: "💧", title: "Tide Scout",
    element: "water", personality: "gentle", level: 17,
    baseHp: 220, baseAtk: 30, baseDef: 28, baseSpd: 20,
    skills: [{ key: "water_gun", level: 3 }, { key: "aqua_jet", level: 1 }, { key: "dodge", level: 2 }],
    dialogue: { intro: "Ripple emerges from the coral!", win: "The tide recedes.", lose: "Washed away by the current." },
    rewards: { exp: 90, credits: 30, airdropPoints: 30 },
    isBoss: true, region: 3,
  },
  {
    id: 12, name: "Coraline", emoji: "🐚", title: "Reef Trainer",
    element: "water", personality: "gentle", level: 19,
    baseHp: 260, baseAtk: 32, baseDef: 32, baseSpd: 22,
    skills: [{ key: "aqua_jet", level: 2 }, { key: "water_gun", level: 3 }, { key: "rain_dance", level: 1 }, { key: "iron_defense", level: 1 }],
    dialogue: { intro: "Trainer Coraline: 'The reef protects its own.'", win: "Coraline: 'You swim with the current!'", lose: "Coraline: 'The depths consume you.'" },
    rewards: { exp: 100, credits: 35, airdropPoints: 35 },
    isBoss: true, region: 3,
  },
  {
    id: 13, name: "Abyssal", emoji: "🦑", title: "Deep Sea Horror",
    element: "water", personality: "brave", level: 21,
    baseHp: 300, baseAtk: 38, baseDef: 30, baseSpd: 16,
    skills: [{ key: "tidal_wave", level: 1 }, { key: "aqua_jet", level: 2 }, { key: "intimidate", level: 2 }, { key: "body_slam", level: 3 }],
    dialogue: { intro: "Something massive stirs in the darkness...", win: "The Abyssal retreats to deeper waters.", lose: "Crushed by the ocean pressure." },
    rewards: { exp: 120, credits: 45, airdropPoints: 45, skillDrop: "aqua_jet" },
    isBoss: true, region: 3,
  },
  {
    id: 14, name: "Tsunami", emoji: "🌊", title: "Ocean Elite",
    element: "water", personality: "brave", level: 23,
    baseHp: 340, baseAtk: 42, baseDef: 32, baseSpd: 28,
    skills: [{ key: "tidal_wave", level: 2 }, { key: "rain_dance", level: 2 }, { key: "aqua_jet", level: 3 }, { key: "fury_swipe", level: 2 }],
    dialogue: { intro: "Tsunami: 'I am the ocean's fury!'", win: "The waves calm as Tsunami concedes.", lose: "Swept away by the tsunami." },
    rewards: { exp: 140, credits: 50, airdropPoints: 50, skillDrop: "rain_dance" },
    isBoss: true, region: 3,
  },
  {
    id: 15, name: "Leviathan", emoji: "🐋", title: "Ocean Gym Leader",
    element: "water", personality: "gentle", level: 24,
    baseHp: 400, baseAtk: 44, baseDef: 38, baseSpd: 24,
    skills: [{ key: "tidal_wave", level: 3 }, { key: "rain_dance", level: 2 }, { key: "aqua_jet", level: 3 }, { key: "iron_defense", level: 2 }],
    dialogue: { intro: "Gym Leader Leviathan: 'The deep knows all. Show me your courage.'", win: "Leviathan: 'The Tide Badge is yours. The storm calls.'", lose: "Leviathan: 'Return when you can breathe underwater.'" },
    rewards: { exp: 200, credits: 80, airdropPoints: 80, skillDrop: "tidal_wave" },
    isBoss: true, region: 3,
  },

  // ════ REGION 4: STORM PEAK (Lv.24-32) ════
  {
    id: 16, name: "Zapper", emoji: "⚡", title: "Lightning Scout",
    element: "electric", personality: "playful", level: 25,
    baseHp: 300, baseAtk: 40, baseDef: 28, baseSpd: 36,
    skills: [{ key: "spark", level: 3 }, { key: "thunder_bolt", level: 1 }, { key: "charge_up", level: 1 }],
    dialogue: { intro: "Zapper crackles with static!", win: "The static fades.", lose: "Shocked unconscious." },
    rewards: { exp: 130, credits: 40, airdropPoints: 40 },
    isBoss: true, region: 4,
  },
  {
    id: 17, name: "Voltara", emoji: "🌩️", title: "Storm Trainer",
    element: "electric", personality: "brave", level: 27,
    baseHp: 340, baseAtk: 44, baseDef: 30, baseSpd: 38,
    skills: [{ key: "thunder_bolt", level: 2 }, { key: "spark", level: 3 }, { key: "charge_up", level: 2 }, { key: "dodge", level: 2 }],
    dialogue: { intro: "Trainer Voltara: 'Speed is everything up here!'", win: "Voltara: 'Fast! You're faster!'", lose: "Voltara: 'Too slow for the storm.'" },
    rewards: { exp: 150, credits: 50, airdropPoints: 50 },
    isBoss: true, region: 4,
  },
  {
    id: 18, name: "Tempest", emoji: "🌪️", title: "Storm Beast",
    element: "electric", personality: "brave", level: 29,
    baseHp: 380, baseAtk: 48, baseDef: 32, baseSpd: 34,
    skills: [{ key: "thunder_bolt", level: 3 }, { key: "charge_up", level: 2 }, { key: "fury_swipe", level: 3 }, { key: "intimidate", level: 2 }],
    dialogue: { intro: "The clouds converge — Tempest descends!", win: "The storm breaks.", lose: "Lost in the cyclone." },
    rewards: { exp: 170, credits: 55, airdropPoints: 55, skillDrop: "charge_up" },
    isBoss: true, region: 4,
  },
  {
    id: 19, name: "Raijin", emoji: "⛈️", title: "Peak Elite",
    element: "electric", personality: "brave", level: 31,
    baseHp: 420, baseAtk: 52, baseDef: 34, baseSpd: 40,
    skills: [{ key: "lightning_storm", level: 1 }, { key: "thunder_bolt", level: 3 }, { key: "charge_up", level: 2 }, { key: "dodge", level: 3 }],
    dialogue: { intro: "Raijin: 'I am the thunder god of this peak!'", win: "Raijin kneels in defeat.", lose: "Raijin: 'Not worthy of the summit.'" },
    rewards: { exp: 200, credits: 65, airdropPoints: 65, skillDrop: "thunder_bolt" },
    isBoss: true, region: 4,
  },
  {
    id: 20, name: "Zeus", emoji: "⚡", title: "Storm Peak Gym Leader",
    element: "electric", personality: "brave", level: 32,
    baseHp: 480, baseAtk: 56, baseDef: 38, baseSpd: 42,
    skills: [{ key: "lightning_storm", level: 2 }, { key: "thunder_bolt", level: 3 }, { key: "charge_up", level: 3 }, { key: "iron_defense", level: 2 }],
    dialogue: { intro: "Gym Leader Zeus: 'I command the skies. Every bolt answers to me.'", win: "Zeus: 'The Thunder Badge is yours. Darkness awaits.'", lose: "Zeus: 'Even lightning cannot strike the same place twice... but I can.'" },
    rewards: { exp: 280, credits: 100, airdropPoints: 100, skillDrop: "lightning_storm" },
    isBoss: true, region: 4,
  },

  // ════ REGION 5: SHADOW REALM (Lv.32-42) ════
  {
    id: 21, name: "Phantom", emoji: "👻", title: "Shadow Scout",
    element: "normal", personality: "playful", level: 33,
    baseHp: 400, baseAtk: 50, baseDef: 40, baseSpd: 38,
    skills: [{ key: "ultimate_charm", level: 1 }, { key: "intimidate", level: 3 }, { key: "dodge", level: 3 }, { key: "scratch", level: 4 }],
    dialogue: { intro: "A shadow materializes before you...", win: "The phantom fades.", lose: "Lost in the shadows." },
    rewards: { exp: 200, credits: 60, airdropPoints: 60 },
    isBoss: true, region: 5,
  },
  {
    id: 22, name: "Eclipse", emoji: "🌑", title: "Void Trainer",
    element: "fire", personality: "brave", level: 35,
    baseHp: 440, baseAtk: 54, baseDef: 42, baseSpd: 36,
    skills: [{ key: "inferno", level: 1 }, { key: "flame_burst", level: 3 }, { key: "intimidate", level: 2 }, { key: "iron_defense", level: 2 }],
    dialogue: { intro: "Trainer Eclipse: 'In the shadow, fire burns brightest!'", win: "Eclipse: 'Light pierces even my darkness.'", lose: "Eclipse: 'Consumed by the void.'" },
    rewards: { exp: 230, credits: 70, airdropPoints: 70 },
    isBoss: true, region: 5,
  },
  {
    id: 23, name: "Abyss", emoji: "🕳️", title: "Void Beast",
    element: "water", personality: "gentle", level: 37,
    baseHp: 480, baseAtk: 50, baseDef: 48, baseSpd: 30,
    skills: [{ key: "tidal_wave", level: 2 }, { key: "rain_dance", level: 2 }, { key: "leech_seed", level: 3 }, { key: "iron_defense", level: 3 }],
    dialogue: { intro: "The Abyss opens its maw...", win: "The void closes. Light returns.", lose: "Swallowed by the abyss." },
    rewards: { exp: 260, credits: 80, airdropPoints: 80, skillDrop: "ultimate_charm" },
    isBoss: true, region: 5,
  },
  {
    id: 24, name: "Chaos", emoji: "💀", title: "Shadow Elite",
    element: "electric", personality: "brave", level: 40,
    baseHp: 520, baseAtk: 58, baseDef: 44, baseSpd: 44,
    skills: [{ key: "lightning_storm", level: 2 }, { key: "thunder_bolt", level: 3 }, { key: "charge_up", level: 3 }, { key: "fury_swipe", level: 4 }],
    dialogue: { intro: "Chaos: 'Order is an illusion. I am the truth!'", win: "Chaos disperses into fragments.", lose: "Chaos: 'All returns to entropy.'" },
    rewards: { exp: 300, credits: 100, airdropPoints: 100, skillDrop: "iron_defense" },
    isBoss: true, region: 5,
  },
  {
    id: 25, name: "Oblivion", emoji: "🌀", title: "Shadow Realm Gym Leader",
    element: "normal", personality: "brave", level: 42,
    baseHp: 600, baseAtk: 62, baseDef: 50, baseSpd: 42,
    skills: [{ key: "ultimate_charm", level: 3 }, { key: "inferno", level: 2 }, { key: "lightning_storm", level: 1 }, { key: "iron_defense", level: 3 }],
    dialogue: { intro: "Gym Leader Oblivion: 'I have seen the end of all things. You cannot surprise me.'", win: "Oblivion: 'The Shadow Badge is yours. Only dragons remain.'", lose: "Oblivion: 'Your story ends here... for now.'" },
    rewards: { exp: 400, credits: 150, airdropPoints: 150, skillDrop: "inferno" },
    isBoss: true, region: 5,
  },

  // ════ REGION 6: DRAGON'S END (Lv.42-60) ════
  {
    id: 26, name: "Drakeling", emoji: "🐲", title: "Young Dragon",
    element: "fire", personality: "brave", level: 44,
    baseHp: 550, baseAtk: 60, baseDef: 48, baseSpd: 40,
    skills: [{ key: "inferno", level: 2 }, { key: "flame_burst", level: 3 }, { key: "body_slam", level: 4 }, { key: "intimidate", level: 3 }],
    dialogue: { intro: "A young dragon descends from the cliffs!", win: "The drakeling retreats to its nest.", lose: "Dragon fire scorches everything." },
    rewards: { exp: 350, credits: 100, airdropPoints: 100 },
    isBoss: true, region: 6,
  },
  {
    id: 27, name: "Stormwing", emoji: "🦅", title: "Thunder Dragon",
    element: "electric", personality: "brave", level: 47,
    baseHp: 600, baseAtk: 64, baseDef: 50, baseSpd: 50,
    skills: [{ key: "lightning_storm", level: 2 }, { key: "thunder_bolt", level: 4 }, { key: "charge_up", level: 3 }, { key: "dodge", level: 3 }],
    dialogue: { intro: "Stormwing: 'My wings carry the thunder itself!'", win: "The thunder dragon lands, humbled.", lose: "Struck down by lightning from above." },
    rewards: { exp: 400, credits: 120, airdropPoints: 120, skillDrop: "solar_bloom" },
    isBoss: true, region: 6,
  },
  {
    id: 28, name: "Tidecaller", emoji: "🐉", title: "Sea Dragon",
    element: "water", personality: "gentle", level: 50,
    baseHp: 680, baseAtk: 60, baseDef: 58, baseSpd: 42,
    skills: [{ key: "tidal_wave", level: 3 }, { key: "rain_dance", level: 3 }, { key: "aqua_jet", level: 4 }, { key: "iron_defense", level: 3 }],
    dialogue: { intro: "The sea parts — Tidecaller emerges!", win: "Tidecaller: 'The ocean salutes you.'", lose: "Tidecaller: 'The deep reclaims all.'" },
    rewards: { exp: 450, credits: 140, airdropPoints: 140, skillDrop: "tidal_wave" },
    isBoss: true, region: 6,
  },
  {
    id: 29, name: "Verdanthos", emoji: "🐲", title: "Ancient Dragon",
    element: "grass", personality: "gentle", level: 55,
    baseHp: 750, baseAtk: 66, baseDef: 60, baseSpd: 38,
    skills: [{ key: "solar_bloom", level: 3 }, { key: "razor_leaf", level: 4 }, { key: "leech_seed", level: 3 }, { key: "iron_defense", level: 3 }],
    dialogue: { intro: "Ancient Dragon Verdanthos: 'I am older than the forests themselves.'", win: "Verdanthos: 'A thousand years, and finally... a worthy challenger.'", lose: "Verdanthos: 'Come back in another century.'" },
    rewards: { exp: 500, credits: 200, airdropPoints: 200, skillDrop: "solar_bloom" },
    isBoss: true, region: 6,
  },
  {
    id: 30, name: "Bahamut", emoji: "🐉", title: "Dragon King — Final Boss",
    element: "fire", personality: "brave", level: 60,
    baseHp: 999, baseAtk: 80, baseDef: 65, baseSpd: 50,
    skills: [{ key: "inferno", level: 5 }, { key: "lightning_storm", level: 3 }, { key: "tidal_wave", level: 3 }, { key: "iron_defense", level: 3 }],
    dialogue: {
      intro: "👑 DRAGON KING BAHAMUT: 'I am the beginning and the end. Every element bows before me. Show me the bond between you and your pet — or be reduced to ash.'",
      win: "Bahamut: 'At last... a soul worthy of the Dragon Crown. You have conquered all 30 stages. LEGENDARY.'",
      lose: "Bahamut: 'Close... but the Dragon King does not fall easily. Return stronger.'",
    },
    rewards: { exp: 1000, credits: 500, airdropPoints: 500, skillDrop: "inferno" },
    isBoss: true, region: 6,
  },
];

// ── Helper: Get stage boss by ID ──
export function getStage(stageId: number): PveBoss | undefined {
  return PVE_STAGES.find((s) => s.id === stageId);
}

// ── Helper: Get region for a stage ──
export function getRegionForStage(stageId: number): Region | undefined {
  return REGIONS.find((r) => r.stages.includes(stageId));
}

// ── Helper: Generate minion for a stage ──
export function generateMinion(stageId: number): PveBoss {
  const boss = getStage(stageId)!;
  const region = getRegionForStage(stageId)!;
  const templates = REGION_MINIONS[region.id] || REGION_MINIONS[1];
  const template = templates[Math.floor(Math.random() * templates.length)];
  const nameIdx = Math.floor(Math.random() * template.names.length);

  const minionLevel = Math.max(1, boss.level - 2 - Math.floor(Math.random() * 3));
  const starterSkills = [
    { key: "scratch", level: Math.min(5, Math.ceil(minionLevel / 5)) },
    { key: template.element === "fire" ? "ember" : template.element === "water" ? "water_gun" : template.element === "electric" ? "spark" : template.element === "normal" ? "scratch" : "vine_whip", level: Math.min(5, Math.ceil(minionLevel / 6)) },
  ];

  return {
    id: stageId * 100 + Math.floor(Math.random() * 99),
    name: template.names[nameIdx],
    emoji: template.emojis[nameIdx % template.emojis.length],
    title: "Wild",
    element: template.element,
    personality: template.personality,
    level: minionLevel,
    baseHp: minionLevel * 8 + 30,
    baseAtk: minionLevel * 2 + 8,
    baseDef: minionLevel * 1.5 + 6,
    baseSpd: minionLevel * 1.5 + 6,
    skills: starterSkills,
    dialogue: { intro: `A wild ${template.names[nameIdx]} appeared!`, win: "You defeated it!", lose: "It was too strong..." },
    rewards: { exp: Math.floor(minionLevel * 3), credits: Math.floor(minionLevel * 0.5), airdropPoints: 5 },
    isBoss: false,
    region: region.id,
  };
}

// ── Star rating calculation ──
// 3 stars: win with > 50% HP and <= 10 turns
// 2 stars: win with > 25% HP
// 1 star: win
export function calculateStars(won: boolean, hpRatio: number, turns: number): number {
  if (!won) return 0;
  if (hpRatio > 0.5 && turns <= 10) return 3;
  if (hpRatio > 0.25) return 2;
  return 1;
}

// ── Level requirement for stage ──
export function getStageMinLevel(stageId: number): number {
  const boss = getStage(stageId);
  return boss ? Math.max(1, boss.level - 3) : 1;
}

// ── Check if stage is unlocked ──
export function isStageUnlocked(stageId: number, clearedStages: number[]): boolean {
  if (stageId === 1) return true;
  return clearedStages.includes(stageId - 1);
}
