/**
 * Premium Shop — USDT-purchasable items
 */

export interface PremiumItem {
  key: string;
  name: string;
  emoji: string;
  description: string;
  category: "boost" | "skill" | "evolution" | "battle" | "gacha";
  priceUSD: number;
  priceCredits?: number;  // alternative credit price (much higher)
  effect: string;
  rarity: "common" | "rare" | "epic" | "legendary";
  duration?: number;      // hours, if time-limited
  stackable: boolean;
}

export const PREMIUM_ITEMS: PremiumItem[] = [
  // ── Boosts ──
  {
    key: "premium_feed", name: "Premium Feed", emoji: "🍖",
    description: "Double EXP gain for 24 hours. Stack with Battle Pass.",
    category: "boost", priceUSD: 1, priceCredits: 500,
    effect: "exp_2x", rarity: "common", duration: 24, stackable: true,
  },
  {
    key: "battle_pass_daily", name: "Daily Battle Pass", emoji: "🎫",
    description: "Unlimited battles + 2x drop rate for 24 hours.",
    category: "battle", priceUSD: 2, priceCredits: 800,
    effect: "unlimited_battles", rarity: "rare", duration: 24, stackable: false,
  },

  // ── Skills ──
  {
    key: "skill_scroll", name: "Skill Scroll", emoji: "📜",
    description: "Learn a random Rare+ skill. Element matches your pet.",
    category: "skill", priceUSD: 3, priceCredits: 1200,
    effect: "random_rare_skill", rarity: "rare", stackable: true,
  },
  {
    key: "skill_crystal", name: "Skill Upgrade Crystal", emoji: "💎",
    description: "Upgrade any skill by +1 level (max ★5). Higher stars = flashier effects.",
    category: "skill", priceUSD: 2, priceCredits: 900,
    effect: "skill_level_up", rarity: "rare", stackable: true,
  },

  // ── Evolution ──
  {
    key: "element_stone", name: "Element Stone", emoji: "🔮",
    description: "Change your pet's element type. Resets type advantage matchups.",
    category: "evolution", priceUSD: 5, priceCredits: 2000,
    effect: "change_element", rarity: "epic", stackable: true,
  },
  {
    key: "evolution_catalyst", name: "Evolution Catalyst", emoji: "⚗️",
    description: "Instantly evolve your pet to next stage. Skip level requirements.",
    category: "evolution", priceUSD: 10, priceCredits: 5000,
    effect: "instant_evolve", rarity: "legendary", stackable: true,
  },

  // ── Battle ──
  {
    key: "revive_token", name: "Revive Token", emoji: "💚",
    description: "Use in battle to fully restore HP. One-time use per battle.",
    category: "battle", priceUSD: 0.5, priceCredits: 200,
    effect: "battle_revive", rarity: "common", stackable: true,
  },
  {
    key: "type_shield", name: "Type Shield", emoji: "🛡️",
    description: "Nullify type disadvantage for 3 battles.",
    category: "battle", priceUSD: 1.5, priceCredits: 600,
    effect: "type_shield", rarity: "rare", stackable: true,
  },

  // ── Gacha ──
  {
    key: "legendary_egg", name: "Legendary Egg", emoji: "🥚",
    description: "Hatch a Legendary pet OR a ★5 skill. 10% Legendary, 90% Epic.",
    category: "gacha", priceUSD: 5, priceCredits: 3000,
    effect: "gacha_legendary", rarity: "legendary", stackable: true,
  },
  {
    key: "mystery_box", name: "Mystery Box", emoji: "🎁",
    description: "Random reward: Credits, Skill Scroll, Element Stone, or Legendary Egg.",
    category: "gacha", priceUSD: 2, priceCredits: 1000,
    effect: "gacha_mystery", rarity: "epic", stackable: true,
  },
];

export const PREMIUM_MAP = Object.fromEntries(PREMIUM_ITEMS.map(i => [i.key, i]));

export const RARITY_COLORS: Record<string, { bg: string; border: string; text: string; glow: string }> = {
  common:    { bg: "#ffffff08", border: "#ffffff15", text: "#888", glow: "transparent" },
  rare:      { bg: "#3b82f608", border: "#3b82f625", text: "#3b82f6", glow: "#3b82f620" },
  epic:      { bg: "#a855f708", border: "#a855f725", text: "#a855f7", glow: "#a855f720" },
  legendary: { bg: "#f59e0b08", border: "#f59e0b25", text: "#f59e0b", glow: "#f59e0b30" },
};

export const CATEGORY_LABELS: Record<string, { label: string; emoji: string }> = {
  all:       { label: "All", emoji: "🏪" },
  boost:     { label: "Boosts", emoji: "⚡" },
  skill:     { label: "Skills", emoji: "📜" },
  evolution: { label: "Evolution", emoji: "🔮" },
  battle:    { label: "Battle", emoji: "⚔️" },
  gacha:     { label: "Gacha", emoji: "🎰" },
};
