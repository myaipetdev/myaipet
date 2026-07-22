import { isProviderSafeRetainedText } from "./memory/persistent-memory";

/**
 * Admit owner-stored text to a third-party provider only after checking the
 * complete value for secret/Hangul markers, then cap what can enter a prompt.
 * Checking before slicing prevents a credential hidden beyond the prompt cap
 * from turning an otherwise rejected durable value into accepted context.
 */
export function providerSafeStoredText(
  value: string | null | undefined,
  label: string,
  maxChars: number,
): string | null {
  if (typeof value !== "string"
    || !Number.isSafeInteger(maxChars)
    || maxChars <= 0) {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed || !isProviderSafeRetainedText(`${label} ${trimmed}`)) {
    return null;
  }
  return trimmed.slice(0, maxChars).trim() || null;
}
