/**
 * Mood-variant "expression pack" for a pet — real facial expressions generated
 * once (anchored on the pet's identity image), then swapped onto the living
 * portrait by mood. The payoff beyond emote overlays: the pet's FACE changes.
 *
 * Stored in pet.personality_modifiers.mood_portraits = { [key]: url } (JSON, no
 * migration). Shared by the generate UI, the save endpoint, and PetAvatar so the
 * keys + mood mapping never drift.
 */

export const EXPRESSION_KEYS = ["happy", "sad", "sleepy", "excited"] as const;
export type ExpressionKey = (typeof EXPRESSION_KEYS)[number];

export const EXPRESSION_META: Record<ExpressionKey, { label: string; emoji: string; prompt: string }> = {
  happy:   { label: "Happy",   emoji: "😊", prompt: "a warm happy smiling expression, content and cheerful, bright eyes" },
  sad:     { label: "Sad",     emoji: "😢", prompt: "a sad downcast expression, droopy teary eyes, a little gloomy" },
  sleepy:  { label: "Sleepy",  emoji: "😴", prompt: "a sleepy drowsy expression, half-closed eyes, mid-yawn, cozy" },
  excited: { label: "Excited", emoji: "🤩", prompt: "an ecstatic excited expression, sparkling wide eyes, big joyful energy" },
};

export function isExpressionKey(k: string): k is ExpressionKey {
  return (EXPRESSION_KEYS as readonly string[]).includes(k);
}

// Map a live pet mood to the closest generated expression (null → use the base avatar).
export function moodToExpressionKey(mood: string): ExpressionKey | null {
  switch (mood) {
    case "ecstatic": return "excited";
    case "happy": return "happy";
    case "sad": return "sad";
    case "grumpy": return "sad";
    case "exhausted": return "sleepy";
    case "tired": return "sleepy";
    default: return null; // neutral / hungry / starving → keep the base identity image
  }
}
