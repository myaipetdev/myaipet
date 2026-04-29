/**
 * Pet Mechanics — Personality modifiers, gating rules, combos, event requests.
 * Centralized so interact API & client UI stay consistent.
 */

export type InteractionType = "feed" | "play" | "talk" | "pet" | "walk" | "train";

export interface BaseEffects {
  happiness: number;
  energy: number;
  hunger: number;
  exp: number;
  bond: number;
}

export const BASE_EFFECTS: Record<InteractionType, BaseEffects> = {
  feed:  { happiness: 5,  energy: 3,   hunger: -25, exp: 5,  bond: 1 },
  play:  { happiness: 15, energy: -20, hunger: 10,  exp: 10, bond: 2 },
  talk:  { happiness: 8,  energy: -3,  hunger: 2,   exp: 8,  bond: 3 },
  pet:   { happiness: 10, energy: 5,   hunger: 2,   exp: 5,  bond: 4 },
  walk:  { happiness: 12, energy: -15, hunger: 8,   exp: 12, bond: 2 },
  train: { happiness: 3,  energy: -25, hunger: 5,   exp: 20, bond: 1 },
};

// ── Personality modifiers ──
// Each personality boosts certain interactions and dampens others.
type Mod = Partial<Record<keyof BaseEffects, number>>;

export const PERSONALITY_MODIFIERS: Record<string, Partial<Record<InteractionType, Mod>>> = {
  friendly: {
    talk: { happiness: 1.3, bond: 1.4 },
    pet:  { happiness: 1.2, bond: 1.3 },
  },
  playful: {
    play: { happiness: 1.4, exp: 1.2, bond: 1.3 },
    walk: { happiness: 1.2, exp: 1.2 },
  },
  shy: {
    pet:  { happiness: 1.3, bond: 1.5 },
    talk: { happiness: 1.2, bond: 1.3 },
    play: { happiness: 0.8 },
    walk: { happiness: 0.85 },
  },
  brave: {
    train: { happiness: 1.3, exp: 1.4 },
    walk:  { happiness: 1.2, exp: 1.2 },
  },
  lazy: {
    feed:  { happiness: 1.3 },
    pet:   { happiness: 1.3, bond: 1.2 },
    play:  { energy: 0.8 }, // less energy drain (multiplier on negative = less negative)
    walk:  { energy: 0.7 },
    train: { energy: 0.7 },
  },
  curious: {
    talk:  { happiness: 1.3, exp: 1.3, bond: 1.2 },
    train: { exp: 1.3 },
    walk:  { exp: 1.2 },
  },
  mischievous: {
    play:  { happiness: 1.4, exp: 1.2 },
    train: { exp: 0.85, happiness: 0.85 },
  },
  gentle: {
    pet:  { happiness: 1.3, bond: 1.4 },
    talk: { happiness: 1.2, bond: 1.3 },
    feed: { happiness: 1.2 },
  },
  adventurous: {
    walk:  { happiness: 1.4, exp: 1.3 },
    train: { exp: 1.2 },
    play:  { exp: 1.2 },
  },
  dramatic: {
    talk: { happiness: 1.4, bond: 1.3 },
    play: { happiness: 1.3, energy: 1.2 }, // even more energy drain
    pet:  { happiness: 1.3 },
  },
  wise: {
    train: { exp: 1.4, happiness: 1.2 },
    talk:  { happiness: 1.3, exp: 1.2, bond: 1.3 },
  },
  sassy: {
    play: { happiness: 1.3, exp: 1.2 },
    talk: { happiness: 1.4, bond: 1.2 },
    pet:  { happiness: 0.85 },
  },
};

export function applyPersonality(
  type: InteractionType,
  personality: string,
  base: BaseEffects
): BaseEffects {
  const mods = PERSONALITY_MODIFIERS[personality]?.[type];
  if (!mods) return { ...base };
  const out = { ...base };
  (Object.keys(mods) as Array<keyof BaseEffects>).forEach((k) => {
    const mult = mods[k]!;
    out[k] = Math.round(out[k] * mult);
  });
  return out;
}

// ── Gating rules ──
// Returns null if allowed, or string reason if blocked.
export function gateInteraction(
  type: InteractionType,
  pet: { energy: number; hunger: number; happiness: number }
): string | null {
  // Need food: hunger >= 80 means too hungry to do energetic stuff
  if (pet.hunger >= 80 && (type === "play" || type === "walk" || type === "train")) {
    return `Too hungry — feed me first!`;
  }
  // Need rest: energy < 15 means too tired
  if (pet.energy < 15 && (type === "play" || type === "walk" || type === "train")) {
    return `Too tired — let me rest or take a walk after a meal.`;
  }
  // Already full: cannot keep feeding
  if (pet.hunger <= 5 && type === "feed") {
    return `I'm stuffed! Can't eat another bite.`;
  }
  return null;
}

// ── Combo system ──
// Sequences detected from last N interactions.
export interface ComboReward {
  name: string;
  description: string;
  emoji: string;
  bonusEffects: Partial<BaseEffects>;
}

export const COMBO_DEFINITIONS: { sequence: InteractionType[]; reward: ComboReward }[] = [
  {
    sequence: ["pet", "feed", "talk"],
    reward: {
      name: "Caregiver",
      description: "You truly care about your pet. +5 bond, +10 happiness.",
      emoji: "💞",
      bonusEffects: { bond: 5, happiness: 10 },
    },
  },
  {
    sequence: ["walk", "play", "train"],
    reward: {
      name: "Active Lifestyle",
      description: "Mind and body workout combo. +25 exp, +5 bond.",
      emoji: "🏃",
      bonusEffects: { exp: 25, bond: 5 },
    },
  },
  {
    sequence: ["talk", "talk", "talk"],
    reward: {
      name: "Deep Conversation",
      description: "You really opened up. +15 happiness, +8 bond.",
      emoji: "💭",
      bonusEffects: { happiness: 15, bond: 8 },
    },
  },
  {
    sequence: ["pet", "pet", "pet"],
    reward: {
      name: "Cuddle Marathon",
      description: "Pure affection. +20 bond, +5 happiness.",
      emoji: "🤗",
      bonusEffects: { bond: 20, happiness: 5 },
    },
  },
  {
    sequence: ["train", "train", "feed", "pet"],
    reward: {
      name: "Discipline & Reward",
      description: "Hard work pays off. +30 exp, +10 bond.",
      emoji: "🏆",
      bonusEffects: { exp: 30, bond: 10 },
    },
  },
  {
    sequence: ["feed", "play", "pet", "talk"],
    reward: {
      name: "Perfect Day",
      description: "Every need fulfilled. +20 happiness, +15 bond, +20 exp.",
      emoji: "✨",
      bonusEffects: { happiness: 20, bond: 15, exp: 20 },
    },
  },
];

export function detectCombo(history: InteractionType[]): ComboReward | null {
  // Check most recent first; longest combos take priority
  const sorted = [...COMBO_DEFINITIONS].sort((a, b) => b.sequence.length - a.sequence.length);
  for (const def of sorted) {
    const seq = def.sequence;
    if (history.length < seq.length) continue;
    const tail = history.slice(-seq.length);
    if (seq.every((t, i) => tail[i] === t)) {
      return def.reward;
    }
  }
  return null;
}

// ── Event request system ──
// Pet sometimes asks for a specific interaction. Fulfilling it gives bonus, ignoring drops happiness.

export interface EventRequest {
  type: InteractionType;
  message: string;
  expiresAt: string; // ISO date
  reward: { happiness: number; bond: number; exp: number };
}

const REQUEST_MESSAGES: Record<InteractionType, string[]> = {
  feed:  ["I'm getting hungry... feed me?", "My tummy is rumbling 🥺", "Got any treats? I could eat..."],
  play:  ["Wanna play?! 🎾", "Let's do something fun!", "I'm bored — play with me!"],
  talk:  ["Tell me about your day...", "I miss your voice. Talk to me?", "Can we chat for a bit?"],
  pet:   ["I want belly rubs 🥺", "Pet me please?", "I miss your touch..."],
  walk:  ["Can we go outside? 🌳", "I want fresh air!", "Walk time?? 🐾"],
  train: ["Teach me a new trick!", "I want to learn something today.", "Train me — I can do it!"],
};

export function generateRequest(
  pet: { energy: number; hunger: number; happiness: number; bond_level: number; last_interaction_at?: Date | null },
  personality: string
): EventRequest | null {
  // Don't spam requests — only generate if no recent interaction (>5min)
  const last = pet.last_interaction_at ? new Date(pet.last_interaction_at).getTime() : 0;
  const sinceLast = Date.now() - last;
  if (sinceLast < 5 * 60 * 1000) return null;

  // Roll based on stat conditions
  const candidates: { type: InteractionType; weight: number }[] = [];

  if (pet.hunger >= 60) candidates.push({ type: "feed", weight: pet.hunger });
  if (pet.energy < 30) candidates.push({ type: "pet", weight: 30 - pet.energy + 20 }); // tired pets want pets, not play
  if (pet.energy >= 70 && pet.hunger < 60) {
    candidates.push({ type: "play", weight: pet.energy - 50 });
    candidates.push({ type: "walk", weight: pet.energy - 60 });
  }
  if (pet.happiness < 60) {
    candidates.push({ type: "talk", weight: 60 - pet.happiness + 10 });
    candidates.push({ type: "pet", weight: 60 - pet.happiness + 5 });
  }
  if (pet.bond_level >= 5 && personality !== "lazy") {
    candidates.push({ type: "train", weight: 15 });
  }
  // Always some baseline talk/pet desire
  candidates.push({ type: "talk", weight: 8 });
  candidates.push({ type: "pet", weight: 6 });

  if (candidates.length === 0) return null;
  const total = candidates.reduce((s, c) => s + c.weight, 0);
  let roll = Math.random() * total;
  let chosen: InteractionType = "talk";
  for (const c of candidates) {
    roll -= c.weight;
    if (roll <= 0) { chosen = c.type; break; }
  }

  const messages = REQUEST_MESSAGES[chosen];
  const message = messages[Math.floor(Math.random() * messages.length)];

  return {
    type: chosen,
    message,
    expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // 30min window
    reward: { happiness: 12, bond: 8, exp: 10 },
  };
}

// ── Personality intimacy weighting ──
// How much of an interaction's bond/happiness translates to intimacy depends on personality.
export function intimacyMultiplier(personality: string, type: InteractionType): number {
  const map: Record<string, Partial<Record<InteractionType, number>>> = {
    friendly:    { talk: 1.5, pet: 1.3, walk: 1.2 },
    playful:     { play: 1.5, walk: 1.3 },
    shy:         { pet: 1.5, talk: 1.3, feed: 1.2 },
    brave:       { train: 1.5, walk: 1.3 },
    lazy:        { pet: 1.5, feed: 1.3 },
    curious:     { talk: 1.5, train: 1.3 },
    mischievous: { play: 1.4, walk: 1.2 },
    gentle:      { pet: 1.5, talk: 1.4, feed: 1.2 },
    adventurous: { walk: 1.5, play: 1.3, train: 1.2 },
    dramatic:    { talk: 1.5, play: 1.3 },
    wise:        { train: 1.5, talk: 1.3 },
    sassy:       { play: 1.3, talk: 1.4 },
  };
  return map[personality]?.[type] ?? 1.0;
}
