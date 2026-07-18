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
  saleEnabled: boolean;
  unavailableReason?: string;
}

export const PREMIUM_ITEMS: PremiumItem[] = [
  // ── Boosts ──
  {
    key: "premium_feed", name: "Premium Feed", emoji: "🍖",
    description: "Not for sale until a persistent 24-hour 2x EXP boost is enforced.",
    category: "boost", priceUSD: 1, priceCredits: 500,
    effect: "exp_2x", rarity: "common", duration: 24, stackable: true,
    saleEnabled: false,
    unavailableReason: "Premium Feed is unavailable: its advertised 24-hour 2x EXP effect is not persisted yet.",
  },
  {
    key: "battle_pass_daily", name: "Daily Battle Pass", emoji: "🎫",
    description: "Not for sale until unlimited battles and 2x drops are persistently enforced.",
    category: "battle", priceUSD: 2, priceCredits: 800,
    effect: "unlimited_battles", rarity: "rare", duration: 24, stackable: false,
    saleEnabled: false,
    unavailableReason: "Daily Battle Pass is unavailable until its battle limits and drop-rate effects are enforced.",
  },

  // ── Skills ──
  {
    key: "skill_scroll", name: "Skill Scroll", emoji: "📜",
    description: "Learn a random Rare+ skill. Element matches your pet.",
    category: "skill", priceUSD: 3, priceCredits: 1200,
    effect: "random_rare_skill", rarity: "rare", stackable: true, saleEnabled: true,
  },
  {
    key: "skill_crystal", name: "Skill Upgrade Crystal", emoji: "💎",
    description: "Upgrade any skill by +1 level (max ★5). Higher stars = flashier effects.",
    category: "skill", priceUSD: 2, priceCredits: 900,
    effect: "skill_level_up", rarity: "rare", stackable: true, saleEnabled: true,
  },

  // ── Evolution ──
  {
    key: "element_stone", name: "Element Stone", emoji: "🔮",
    description: "Change your pet's element type. Resets type advantage matchups.",
    category: "evolution", priceUSD: 5, priceCredits: 2000,
    effect: "change_element", rarity: "epic", stackable: true, saleEnabled: true,
  },
  {
    key: "evolution_catalyst", name: "Evolution Catalyst", emoji: "⚗️",
    description: "Instantly evolve your pet to next stage. Skip level requirements.",
    category: "evolution", priceUSD: 10, priceCredits: 5000,
    effect: "instant_evolve", rarity: "legendary", stackable: true, saleEnabled: true,
  },

  // ── Battle ──
  {
    key: "revive_token", name: "Revive Token", emoji: "💚",
    description: "Not for sale until revive inventory and battle consumption are persisted.",
    category: "battle", priceUSD: 0.5, priceCredits: 200,
    effect: "battle_revive", rarity: "common", stackable: true,
    saleEnabled: false,
    unavailableReason: "Revive Token is unavailable until durable inventory and battle consumption are enforced.",
  },
  {
    key: "type_shield", name: "Type Shield", emoji: "🛡️",
    description: "Not for sale until three-battle shield inventory is persisted and enforced.",
    category: "battle", priceUSD: 1.5, priceCredits: 600,
    effect: "type_shield", rarity: "rare", stackable: true,
    saleEnabled: false,
    unavailableReason: "Type Shield is unavailable until its durable three-battle effect is enforced.",
  },

  // ── Gacha (REMOVED) ──
  // The randomized paid pulls (legendary_egg 90/10, mystery_box) were removed —
  // a purchasable RNG "egg" is gambling-adjacent and contradicts the de-gambling
  // posture (battle-gambling was already retired). Collectibles are EARNED
  // deterministically (chatting/creating → TCG cards), never bought as a random pull.
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
};
