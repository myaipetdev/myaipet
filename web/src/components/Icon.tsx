"use client";

// ── 3D Game Icon Component ──
// Uses icons8 3D Fluency icons stored in /public/icons/

interface IconProps {
  name: string;
  size?: number;
  style?: React.CSSProperties;
  className?: string;
  alt?: string;
}

export default function Icon({ name, size = 24, style, className, alt }: IconProps) {
  return (
    <img
      src={`/icons/${name}.png`}
      alt={alt || name}
      width={size}
      height={size}
      className={className}
      style={{
        display: "inline-block",
        verticalAlign: "middle",
        objectFit: "contain",
        ...style,
      }}
      loading="lazy"
    />
  );
}

// ── Element icon mapping ──
export const ELEMENT_ICONS: Record<string, string> = {
  fire: "fire",
  water: "water",
  grass: "grass",
  electric: "electric",
  normal: "normal",
};

// ── Premium shop item icon mapping ──
export const SHOP_ICONS: Record<string, string> = {
  exp_2x: "rocket",
  battle_pass: "sword",
  skill_scroll: "scroll",
  skill_crystal: "diamond",
  element_stone: "crystal-ball",
  instant_evolve: "sparkling",
  revive_token: "heart",
  type_shield: "shield",
  gacha_legendary: "treasure-chest",
  gacha_mystery: "gift",
};

// ── Category icon mapping ──
export const CATEGORY_ICONS: Record<string, string> = {
  all: "shop",
  boosts: "rocket",
  skills: "scroll",
  evolution: "crystal-ball",
  battle: "sword",
  gacha: "slot-machine",
};

// ── Nav icon mapping ──
export const NAV_ICONS: Record<string, string> = {
  home: "home",
  "my pet": "paw",
  create: "sparkling",
  adventure: "joystick",
  shop: "shopping-cart",
  community: "chat",
  leaderboard: "trophy",
};

// ── Pet species icon mapping ──
export const PET_ICONS: Record<number, string> = {
  0: "cat",
  1: "dog",
  2: "parrot",
  3: "turtle",
  4: "hamster",
  5: "rabbit",
  6: "fox",
  7: "dog",
  8: "dog",
  9: "dog",
  10: "snake",  // dragon -> snake (closest)
  11: "chicken", // eagle -> chicken
  12: "unicorn",
  13: "wolf",
  14: "tiger",
  15: "panda",
  16: "chicken", // penguin
  17: "chicken", // owl
  18: "bear",
  19: "panda",   // monkey -> panda
  20: "snake",
  21: "chicken", // eagle
  22: "dolphin",
  23: "dolphin", // shark -> dolphin
  24: "fox",     // raccoon -> fox
  25: "paw",
  26: "snake",   // lizard
  27: "hamster",
};
