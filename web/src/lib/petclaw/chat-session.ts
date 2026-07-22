const STABLE_SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

/**
 * Explicit client session ids remain stable. Missing or malformed ids receive
 * a one-request lineage id so unrelated clients can never share raw history by
 * falling into a surface/user-wide bucket.
 */
export function normalizedChatSession(value: unknown, surface: string): string {
  const candidate = typeof value === "string" ? value.trim() : "";
  if (STABLE_SESSION_ID.test(candidate)) return candidate;
  const safeSurface = surface.replace(/[^a-z0-9_-]+/gi, "-").slice(0, 20) || "unknown";
  return `${safeSurface}-ephemeral-${crypto.randomUUID()}`;
}
