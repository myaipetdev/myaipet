/**
 * Pet Studio templates — pre-baked prompt scaffolds tied to your pet.
 *
 * Each template is `{petName, species, personality, customDirection}` →
 * full prompt with cinematography hints. Picks a sensible default model.
 *
 * The point: a fresh user clicks "Birthday party" → has a sharable 5s video
 * 60 seconds later. No prompt engineering required.
 */

import type { StudioModel } from "./providers";

export interface PetContext {
  name: string;
  species?: string;
  personalityType?: string;
  appearanceDesc?: string;
  avatarUrl?: string;
}

export interface StudioTemplate {
  id: string;
  category: "celebration" | "everyday" | "cinematic" | "social" | "fantasy";
  title: string;
  emoji: string;
  description: string;
  suggestedModelId: string;       // default model — user can override
  buildPrompt: (pet: PetContext, customDirection?: string) => string;
  duration: number;
  thumbnail?: string;             // optional /studio_thumbs/X.jpg
}

const baseDescription = (pet: PetContext) => {
  const parts = [pet.appearanceDesc, pet.species, pet.personalityType ? `${pet.personalityType} personality` : ""].filter(Boolean);
  return parts.length ? parts.join(", ") : "an adorable pet";
};

export const TEMPLATES: StudioTemplate[] = [
  // ── Celebration ──
  {
    id: "birthday-party",
    category: "celebration",
    title: "Birthday party",
    emoji: "🎂",
    description: "Confetti, cake, candle blow-out moment — your pet stars.",
    suggestedModelId: "kling-image-to-video",
    duration: 5,
    buildPrompt: (pet, custom) =>
      `${pet.name}, ${baseDescription(pet)}, at a cute birthday party. Pastel confetti drifting in slow motion, a small frosted cake with a single lit candle in front of them. The pet leans in, eyes wide with curiosity, then gently puffs at the candle. Warm soft light, shallow depth of field, cinematic close-up. ${custom || ""}`.trim(),
  },
  {
    id: "new-year-wish",
    category: "celebration",
    title: "New Year wish",
    emoji: "🎊",
    description: "Fireworks reflected in their eyes, holding a tiny banner.",
    suggestedModelId: "kling-image-to-video",
    duration: 5,
    buildPrompt: (pet, custom) =>
      `${pet.name}, ${baseDescription(pet)}, sitting under a night sky exploding with colorful fireworks. Soft glow reflected in their eyes. A small banner saying "HAPPY NEW YEAR" gently sways behind them. Cinematic wide shot pulling back. ${custom || ""}`.trim(),
  },

  // ── Everyday vlog ──
  {
    id: "daily-vlog",
    category: "everyday",
    title: "Daily vlog intro",
    emoji: "🎬",
    description: "Camera circles around your pet — vlog opener style.",
    suggestedModelId: "kling-image-to-video",
    duration: 5,
    buildPrompt: (pet, custom) =>
      `${pet.name}, ${baseDescription(pet)}, sitting in a sunlit window seat looking directly into the camera with a curious tilt of the head. Camera slowly orbits 30° around. Soft natural light, lifestyle vlog opener feel, motion-blur leaves rustling outside. ${custom || ""}`.trim(),
  },
  {
    id: "morning-stretch",
    category: "everyday",
    title: "Morning stretch",
    emoji: "🌅",
    description: "Sunrise, sleepy yawn, big stretch. Cozy.",
    suggestedModelId: "wan-2.1",
    duration: 5,
    buildPrompt: (pet, custom) =>
      `${pet.name}, ${baseDescription(pet)}, waking up on a soft blanket as warm morning sunlight streams in. Stretches slowly with paws extended, then yawns. Golden hour color grade, low angle, gentle camera push-in. ${custom || ""}`.trim(),
  },

  // ── Cinematic ──
  {
    id: "noir-detective",
    category: "cinematic",
    title: "Noir detective",
    emoji: "🕵",
    description: "Tiny trench coat, rain, neon. 1940s noir vibe.",
    suggestedModelId: "kling-1.6-pro",
    duration: 5,
    buildPrompt: (pet, custom) =>
      `${pet.name}, ${baseDescription(pet)}, wearing a tiny trench coat and fedora, standing under a neon street lamp in the rain at night. Steam rising from a sewer grate behind. Smoky 1940s noir cinematography, black & white with selective red neon, slow camera dolly. ${custom || ""}`.trim(),
  },
  {
    id: "anime-opening",
    category: "cinematic",
    title: "Anime opening",
    emoji: "✨",
    description: "Wind, cherry blossoms, hero-shot style.",
    suggestedModelId: "kling-1.6-pro",
    duration: 5,
    buildPrompt: (pet, custom) =>
      `${pet.name}, ${baseDescription(pet)}, anime aesthetic, standing on a hilltop as cherry blossom petals swirl past. Hair/fur blowing in the wind, dramatic backlight, sun flare. Hero shot framing, anticipatory atmosphere of an opening title sequence. ${custom || ""}`.trim(),
  },

  // ── Social (highly shareable) ──
  {
    id: "dance-loop",
    category: "social",
    title: "Dance loop",
    emoji: "💃",
    description: "Rhythmic head bob — loops perfectly for reels.",
    suggestedModelId: "kling-image-to-video",
    duration: 5,
    buildPrompt: (pet, custom) =>
      `${pet.name}, ${baseDescription(pet)}, bobbing their head rhythmically to an unheard beat with a happy expression. Looping motion that returns to start position. Colorful disco light wash, fixed camera, perfect for short-form social loops. ${custom || ""}`.trim(),
  },
  {
    id: "reaction-shock",
    category: "social",
    title: "Reaction (shocked)",
    emoji: "😱",
    description: "Wide-eyed shock zoom — meme-able reaction shot.",
    suggestedModelId: "wan-2.1",
    duration: 3,
    buildPrompt: (pet, custom) =>
      `${pet.name}, ${baseDescription(pet)}, eyes growing wide in dramatic shock, ears perking up. Rapid camera zoom-in on the face, slight shake. Perfect meme reaction frame. ${custom || ""}`.trim(),
  },

  // ── Fantasy ──
  {
    id: "sci-fi-hero",
    category: "fantasy",
    title: "Sci-fi hero",
    emoji: "🚀",
    description: "Holographic suit, spaceship cockpit, the captain.",
    suggestedModelId: "veo-3",
    duration: 6,
    buildPrompt: (pet, custom) =>
      `${pet.name}, ${baseDescription(pet)}, captain of a starship, sitting in a glowing holographic cockpit. Stars streaking past through the viewport. Pet adjusts a small floating control panel with a determined expression. Cinematic sci-fi color grade. ${custom || ""}`.trim(),
  },
  {
    id: "magic-wizard",
    category: "fantasy",
    title: "Magic wizard",
    emoji: "🪄",
    description: "Tiny robes, glowing orb, sparkles.",
    suggestedModelId: "minimax-hailuo",
    duration: 5,
    buildPrompt: (pet, custom) =>
      `${pet.name}, ${baseDescription(pet)}, wearing tiny midnight-blue wizard robes, holding a small glowing orb between their paws. Sparkles drift up around them, candlelit medieval library backdrop. Slow zoom in on the orb's reflection in their eyes. ${custom || ""}`.trim(),
  },
];

export function listTemplates(category?: StudioTemplate["category"]): StudioTemplate[] {
  return category ? TEMPLATES.filter(t => t.category === category) : TEMPLATES;
}

export function getTemplate(id: string): StudioTemplate | undefined {
  return TEMPLATES.find(t => t.id === id);
}
