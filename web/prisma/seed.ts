import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";

// Standard pg adapter — works against local Postgres, AWS RDS, or any
// vanilla Postgres. Matches src/lib/prisma.ts (AWS-only consolidation).
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter } as any);

const GAME_ITEMS = [
  // ── Consumables: EXP & Stats ──
  {
    key: "exp_potion_s",
    name: "EXP Potion (S)",
    description: "A small vial of experience essence. Instantly grants +100 EXP.",
    category: "consumable",
    rarity: "common",
    price: 50,
    icon: "🧪",
    stat_bonus: { experience: 100 },
  },
  {
    key: "exp_potion_m",
    name: "EXP Potion (M)",
    description: "A concentrated brew of experience. Instantly grants +300 EXP.",
    category: "consumable",
    rarity: "uncommon",
    price: 120,
    icon: "🧪",
    stat_bonus: { experience: 300 },
  },
  {
    key: "exp_potion_l",
    name: "EXP Potion (L)",
    description: "A rare elixir of pure experience. Instantly grants +800 EXP.",
    category: "consumable",
    rarity: "rare",
    price: 280,
    icon: "🧬",
    stat_bonus: { experience: 800 },
  },
  {
    key: "energy_drink",
    name: "Energy Drink",
    description: "Fully restores your pet's energy to 100. Ready for more adventures!",
    category: "consumable",
    rarity: "common",
    price: 30,
    icon: "⚡",
    stat_bonus: { energy: 100 },
  },
  {
    key: "premium_feast",
    name: "Premium Feast",
    description: "A gourmet meal that removes all hunger and boosts happiness.",
    category: "consumable",
    rarity: "uncommon",
    price: 45,
    icon: "🍱",
    stat_bonus: { hunger: -80, happiness: 25 },
  },
  {
    key: "happiness_cake",
    name: "Happiness Cake",
    description: "A magical cake that fills your pet with joy. +40 happiness!",
    category: "consumable",
    rarity: "uncommon",
    price: 60,
    icon: "🎂",
    stat_bonus: { happiness: 40 },
  },
  {
    key: "bond_ring",
    name: "Bond Ring",
    description: "A mystical ring that deepens the bond with your pet. +35 bond.",
    category: "consumable",
    rarity: "rare",
    price: 150,
    icon: "💍",
    stat_bonus: { bond_level: 35 },
  },
  {
    key: "full_restore",
    name: "Full Restore",
    description: "Restores ALL stats to maximum. The ultimate recovery item!",
    category: "consumable",
    rarity: "epic",
    price: 300,
    icon: "💎",
    stat_bonus: { happiness: 100, energy: 100, hunger: -100, bond_level: 20 },
  },
  {
    key: "mega_exp_elixir",
    name: "Mega EXP Elixir",
    description: "Legendary potion. Grants +2000 EXP instantly. Only for serious trainers.",
    category: "consumable",
    rarity: "legendary",
    price: 600,
    icon: "🌟",
    stat_bonus: { experience: 2000 },
  },

  // ── Equipment ──
  {
    key: "training_weights",
    name: "Training Weights",
    description: "Unavailable at launch; its passive training effect is not implemented yet.",
    category: "equipment",
    rarity: "uncommon",
    price: 100,
    icon: "🏋️",
    stat_bonus: {},
  },
  {
    key: "lucky_charm",
    name: "Lucky Charm",
    description: "Unavailable at launch; its passive interaction effect is not implemented yet.",
    category: "equipment",
    rarity: "rare",
    price: 200,
    icon: "🍀",
    stat_bonus: {},
  },
  {
    key: "battle_armor",
    name: "Battle Armor",
    description: "Unavailable at launch; its passive arena effect is not implemented yet.",
    category: "equipment",
    rarity: "epic",
    price: 350,
    icon: "🛡️",
    stat_bonus: {},
  },
  {
    key: "dragon_blade",
    name: "Dragon Blade",
    description: "Unavailable at launch; its passive arena effect is not implemented yet.",
    category: "equipment",
    rarity: "legendary",
    price: 500,
    icon: "⚔️",
    stat_bonus: {},
  },

  // ── Accessories ──
  {
    key: "cute_bow",
    name: "Cute Bow",
    description: "An adorable bow tie. Makes your pet 200% cuter (scientifically proven).",
    category: "accessory",
    rarity: "common",
    price: 25,
    icon: "🎀",
    stat_bonus: { happiness: 3 },
  },
  {
    key: "cool_sunglasses",
    name: "Cool Sunglasses",
    description: "Stylish visual-only shades for your pet profile.",
    category: "accessory",
    rarity: "uncommon",
    price: 80,
    icon: "🕶️",
    stat_bonus: {},
  },
  {
    key: "crown",
    name: "Royal Crown",
    description: "A visual-only golden crown for your pet profile.",
    category: "accessory",
    rarity: "legendary",
    price: 800,
    icon: "👑",
    stat_bonus: {},
  },

  // ── Cosmetics ──
  {
    key: "sparkle_aura",
    name: "Sparkle Aura",
    description: "Adds a visual-only sparkle accent to your pet profile.",
    category: "cosmetic",
    rarity: "rare",
    price: 150,
    icon: "✨",
    stat_bonus: {},
  },
  {
    key: "flame_trail",
    name: "Flame Accent",
    description: "Adds a visual-only flame accent to your pet profile.",
    category: "cosmetic",
    rarity: "epic",
    price: 300,
    icon: "🔥",
    stat_bonus: {},
  },

  // ── Furniture ──
  {
    key: "cozy_bed",
    name: "Cozy Bed",
    description: "Unavailable at launch; its passive recovery effect is not implemented yet.",
    category: "furniture",
    rarity: "common",
    price: 40,
    icon: "🛏️",
    stat_bonus: {},
  },
  {
    key: "play_tower",
    name: "Play Tower",
    description: "Unavailable at launch; its passive play effect is not implemented yet.",
    category: "furniture",
    rarity: "uncommon",
    price: 90,
    icon: "🏰",
    stat_bonus: {},
  },
  {
    key: "zen_garden",
    name: "Zen Garden",
    description: "Unavailable at launch; its passive stat effect is not implemented yet.",
    category: "furniture",
    rarity: "epic",
    price: 400,
    icon: "🪴",
    stat_bonus: {},
  },
];

const DISABLED_LAUNCH_ITEMS = new Set([
  "training_weights", "lucky_charm", "battle_armor", "dragon_blade",
  "cozy_bed", "play_tower", "zen_garden",
]);

async function main() {
  console.log("Seeding game items...");

  for (const item of GAME_ITEMS) {
    await prisma.shopItem.upsert({
      where: { key: item.key },
      update: {
        name: item.name,
        description: item.description,
        category: item.category,
        rarity: item.rarity,
        price: item.price,
        icon: item.icon,
        stat_bonus: item.stat_bonus,
        is_active: !DISABLED_LAUNCH_ITEMS.has(item.key),
      },
      create: { ...item, is_active: !DISABLED_LAUNCH_ITEMS.has(item.key) },
    });
    console.log(`  ✓ ${item.icon} ${item.name} (${item.rarity}) — ${item.price} $PET`);
  }

  console.log(`\nDone! ${GAME_ITEMS.length} items seeded.`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
