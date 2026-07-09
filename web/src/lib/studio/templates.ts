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
  category: "trending" | "celebration" | "everyday" | "cinematic" | "social" | "fantasy";
  title: string;
  emoji: string;
  description: string;
  suggestedModelId: string;       // default model — user can override
  buildPrompt: (pet: PetContext, customDirection?: string) => string;
  duration: number;
  aspect?: "16:9" | "9:16" | "1:1"; // trending short-form → 9:16 vertical
  thumbnail?: string;             // optional /studio_thumbs/X.jpg
  beats?: string[];               // hover-tooltip breakdown — the shot list in plain words
  swatch?: string;                // CSS gradient poster fallback for templates with no /studio_examples still or clip yet
}

const baseDescription = (pet: PetContext) => {
  const parts = [pet.appearanceDesc, pet.species, pet.personalityType ? `${pet.personalityType} personality` : ""].filter(Boolean);
  return parts.length ? parts.join(", ") : "an adorable pet";
};

export const TEMPLATES: StudioTemplate[] = [
  // ── 🔥 Trending on TikTok / Shorts (vertical 9:16, pet as the star) ──
  // i2v models (supportsImageRef) keep the pet's likeness — "just swap the
  // character." Prompts are self-contained short-form recipes; the reference
  // photo is attached server-side for image-to-video engines.
  {
    id: "cutie-dance",
    category: "trending",
    title: "Cutie idol dance",
    emoji: "💗",
    description: "5s vertical idol dance · 5 camera angles cutting every 2s · crayon hearts & stars",
    beats: [
      "Bright pastel classroom set, original J-pop track",
      "Easy-to-copy routine: heart hands → cheek peace-sign → spin → wink",
      "5 cameras cut every ~2s (front / top / left / right / behind), always eye contact",
      "Hand-drawn crayon hearts, stars & sparkles pop on the beats",
    ],
    suggestedModelId: "kling-image-to-video",
    duration: 5,
    aspect: "9:16",
    swatch: "linear-gradient(135deg,#FBF6EC 0%,#F3C6D6 45%,#6B4FA0 100%)",
    buildPrompt: (pet, custom) =>
      `${pet.name}, ${baseDescription(pet)}, as the SOLE star of a viral Japanese full-color anime idol dance short. Theatrical-quality cel animation, high frame count, bright and adorable. Keep ${pet.name}'s exact look from the reference — hairstyle/fur, colors, eyes, face, build, age feel, outfit and accessories; do NOT restyle into a different character or change the costume. Vertical 9:16 short-form loop, ~24fps feel.
Setting: a bright, tidy pastel classroom/studio — simple but poppy and fresh so the pet stays the hero.
Song: an upbeat ORIGINAL Japanese-language pop track (never a real existing song).
Performance: the pet dances a cute, easy-to-copy routine straight to camera — light side-steps, two-hand heart at the chest, one-hand heart, cheek peace-sign, hands opening softly by the cheeks, a finger point, little shoulder bounces, gentle hip sway, a small spin, ending on a wink. Cute and a touch cheeky, always performing for YOU.
Camera: a 5-camera setup that CUTS every ~2 seconds — front, high top-angle, left, right, and behind. On every angle the pet keeps eye contact with the lens (turning head/eyes back to camera; on the back cam it glances over the shoulder). Each shot has a small beat-synced bounce / short punch-in / slight sway — intentional readable cute camera shake, never messy handheld.
Effects: flat 2D After-Effects-style motion graphics with a hand-drawn crayon / oil-pastel texture — hearts, stars, circles, flowers, music notes, arrows, ribbons, crowns, sparkles, wavy and swirly lines, speech-bubble frames, checker patterns, halftone dots — popping in synced to the hands/face/feet, bouncing/scaling/rotating then floating away. Palette: pink, sky-blue, yellow, white, lavender, mint, harmonized with the pet.
Constraints: no other characters; keep the pet's likeness and outfit; no realistic explosions/fire/smoke/heavy glitch; don't cover the pet's face with effects; NO text, subtitles, logos or watermarks. ${custom || ""}`.trim(),
  },
  {
    id: "glow-up",
    category: "trending",
    title: "Glow-up reveal",
    emoji: "✨",
    description: "5s vertical before/after — plain start, beat-drop sparkle wipe, epic hero pose",
    beats: [
      "Starts plain and dim, everyday look",
      "Beat-drop: sparkle swirl + light-wipe sweeps across",
      "Match-cut reveal into confident hero version, same face, rim light + wind",
      "Ends on a slow-mo hero pose, eye contact with the lens",
    ],
    suggestedModelId: "kling-image-to-video",
    duration: 5,
    aspect: "9:16",
    swatch: "linear-gradient(135deg,#3A3024 0%,#C8932F 55%,#E8C77E 100%)",
    buildPrompt: (pet, custom) =>
      `${pet.name}, ${baseDescription(pet)}, in a viral "glow-up" transformation reveal. Starts in a plain, slightly dim everyday look; on a beat-drop a swirl of sparkles and a light-wipe sweeps across and reveals ${pet.name} as an epic, confident hero version — SAME face and likeness, upgraded styling, dramatic rim light, wind in the hair/fur. Vertical 9:16 short-form. Snappy match-cut on the beat, slow-mo hero pose at the end, eye contact with the lens. Hand-drawn crayon/oil-pastel 2D sparkle and star bursts on the reveal, pastel-to-vivid palette. No other characters; keep the pet's likeness; no text, logos or watermark. ${custom || ""}`.trim(),
  },
  {
    id: "runway-fashion",
    category: "trending",
    title: "Runway model",
    emoji: "👑",
    description: "5s vertical catwalk strut · outfit swap on every beat · pose-and-turn finish",
    beats: [
      "Confident catwalk straight toward camera, hip sway",
      "Quick stylish outfit/accessory swap on each beat, face stays identical",
      "Editorial studio lighting, seamless pastel backdrop, camera-flash bokeh",
      "Ends on a pose-and-turn, eye contact with the lens",
    ],
    suggestedModelId: "kling-image-to-video",
    duration: 5,
    aspect: "9:16",
    swatch: "linear-gradient(135deg,#6B4FA0 0%,#9E72E8 45%,#E8C77E 100%)",
    buildPrompt: (pet, custom) =>
      `${pet.name}, ${baseDescription(pet)}, strutting a fashion runway like a superstar model. Confident catwalk toward the camera, hip sway, a pose-and-turn at the end. On each beat a quick stylish outfit/accessory swap while keeping the pet's face and body identical. Vertical 9:16 short-form. Editorial studio lighting, seamless pastel backdrop, flashing-camera sparkle bokeh. Flat 2D crayon sparkle and arrow accents on the beat. Always eye contact with the lens. No other characters; keep the pet's likeness; no text or watermark. ${custom || ""}`.trim(),
  },
  {
    id: "pov-talk",
    category: "trending",
    title: "POV: talks to you",
    emoji: "🗯",
    description: "5s vertical front-camera selfie · pet talks straight into the lens, cozy room behind",
    beats: [
      "Held close like a front-facing phone video",
      "Animated 'talking': head tilts, blinks, little gestures",
      "Cozy lifestyle room, softly blurred behind",
      "Crayon-style speech bubbles & hearts pop in occasionally",
    ],
    suggestedModelId: "wan-2.1",
    duration: 5,
    aspect: "9:16",
    swatch: "linear-gradient(135deg,#F5EFE2 0%,#F49B2A 55%,#BE4F28 100%)",
    buildPrompt: (pet, custom) =>
      `${pet.name}, ${baseDescription(pet)}, in a relatable "POV: your pet talks to you" selfie-style short. Held close like a front-facing phone video, looking right into the lens and animatedly "talking" with expressive head tilts, blinks and little gestures, as if telling you something cute. Vertical 9:16, natural lifestyle lighting, cozy room slightly blurred behind. Occasional crayon-style speech-bubble and heart pop-ins. Keep the pet's likeness; no other characters; no text, subtitles or watermark. ${custom || ""}`.trim(),
  },
  {
    id: "tiny-mukbang",
    category: "trending",
    title: "Tiny mukbang",
    emoji: "🍙",
    description: "5s vertical ASMR mini-feast · macro bites, puffy cheeks, happy reactions",
    beats: [
      "Miniature table set with cute bite-size food",
      "Small happy bites, cheeks puffing, satisfied reactions to camera",
      "Macro close-ups, shallow depth of field, warm kitchen ASMR light",
      "Crayon hearts & sparkles pop on the best bites",
    ],
    suggestedModelId: "wan-2.1",
    duration: 5,
    aspect: "9:16",
    swatch: "linear-gradient(135deg,#FBF6EC 0%,#F49B2A 60%,#9A4E1E 100%)",
    buildPrompt: (pet, custom) =>
      `${pet.name}, ${baseDescription(pet)}, doing an adorable tiny-food ASMR mukbang. Sitting at a miniature table with cute bite-size food, taking small happy bites, cheeks puffing, satisfied little reactions to camera. Vertical 9:16, macro close-ups with shallow depth of field, soft warm kitchen light, cozy ASMR mood. Small crayon-style hearts and sparkles pop when it enjoys a bite. Keep the pet's likeness; no other characters; no text or watermark. ${custom || ""}`.trim(),
  },
  {
    id: "retro-anime-op",
    category: "trending",
    title: "90s anime OP",
    emoji: "📼",
    description: "5s vertical retro anime opening · VHS grain, city-pop sunset, hero pan",
    beats: [
      "Retro cel-shaded anime look, subtle VHS grain + chromatic bloom",
      "Warm city-pop sunset palette, wind-blown hair/fur",
      "Slow pan up to a determined look, quick beat-synced zoom cuts",
      "Hand-drawn star & speed-line accents",
    ],
    suggestedModelId: "kling-1.6-pro",
    duration: 5,
    aspect: "9:16",
    swatch: "linear-gradient(135deg,#3A3024 0%,#BE4F28 45%,#6B4FA0 100%)",
    buildPrompt: (pet, custom) =>
      `${pet.name}, ${baseDescription(pet)}, as the protagonist of a nostalgic 1990s anime opening. Retro cel-shaded anime, subtle VHS grain and chromatic bloom, warm city-pop sunset palette. Hero shots: wind-blown hair/fur, dramatic backlight and sun flare, a slow pan up to a determined look straight at camera, quick beat-synced zoom cuts. Vertical 9:16 short-form. Hand-drawn 2D star and speed-line accents. Keep the pet's look and outfit; no other characters; no text, logos or watermark. ${custom || ""}`.trim(),
  },
  {
    id: "phonk-flex",
    category: "trending",
    title: "Phonk flex edit",
    emoji: "🕶",
    description: "5s vertical slow-mo flex · low hero angle, teal-amber grade, beat-synced punch-ins",
    beats: [
      "Slow-motion swagger from a low hero angle",
      "High-contrast lighting, cool teal-and-amber cinematic grade",
      "Speed-ramps + punch-in cuts synced to a hard phonk beat",
      "Cute-cool confident look at the lens, small breeze in the fur",
    ],
    suggestedModelId: "kling-image-to-video",
    duration: 5,
    aspect: "9:16",
    swatch: "linear-gradient(135deg,#191334 0%,#3E3470 45%,#E8C77E 100%)",
    buildPrompt: (pet, custom) =>
      `${pet.name}, ${baseDescription(pet)}, in a high-energy phonk "flex" edit. Slow-motion swagger, low hero angle, dramatic high-contrast lighting with a cool teal-and-amber grade, subtle speed-ramps and punch-in cuts synced to a hard phonk beat. Confident look straight at the lens, a small breeze in the hair/fur. Vertical 9:16 short-form, punchy and cool (cute-cool, not scary). Minimal crayon-style star and arrow accents on the hits. Keep the pet's likeness; no other characters; no realistic smoke or fire, no text or watermark. ${custom || ""}`.trim(),
  },

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
