/**
 * Runtime language boundary for model-generated product copy.
 *
 * Prompts still tell providers/BYOK models to answer in English. This guard is
 * the final invariant before generated text is shown or persisted: a model may
 * ignore a prompt, but Hangul must never leak into an English-only surface.
 * User-authored input is intentionally not modified by these helpers.
 */

export const HANGUL_PATTERN = /[\u1100-\u11ff\u3130-\u318f\ua960-\ua97f\uac00-\ud7af\ud7b0-\ud7ff]/u;

export function containsHangul(value: unknown): boolean {
  if (typeof value === "string") return HANGUL_PATTERN.test(value);
  if (Array.isArray(value)) return value.some(containsHangul);
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).some(containsHangul);
  }
  return false;
}

/** Return trimmed generated text only when it is non-empty and Hangul-free. */
export function generatedEnglishOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text && !containsHangul(text) ? text : null;
}

/**
 * Use a fixed English fallback without another model call. Callers should pass
 * constant product copy, never user/DB text, as the fallback.
 */
export function generatedEnglishOrFallback(value: unknown, fallback: string): string {
  const safeFallback = generatedEnglishOrNull(fallback);
  if (!safeFallback) throw new Error("Generated-language fallback must be non-empty and Hangul-free");
  return generatedEnglishOrNull(value) || safeFallback;
}
