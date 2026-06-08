/**
 * Server-side sanitization helpers for user-supplied strings + URLs.
 * Keep this small and explicit — these are security boundaries, not formatting.
 */

// Strip HTML tags, control characters, and overlong strings.
// Used for pet names, custom traits, anything echoed into other surfaces.
export function sanitizeName(input: unknown, maxLen = 50): string {
  if (typeof input !== "string") return "";
  return input
    .replace(/<[^>]*>/g, "")               // no HTML tags
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1f\x7f]/g, "")        // no control chars
    .replace(/[​-‍﻿]/g, "")   // no zero-width chars
    .replace(/\s+/g, " ")                   // collapse whitespace
    .trim()
    .slice(0, maxLen);
}

// Free-text user input — allow more characters but still strip HTML + controls.
export function sanitizeText(input: unknown, maxLen = 2000): string {
  if (typeof input !== "string") return "";
  return input
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]*>/g, "")
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .trim()
    .slice(0, maxLen);
}

/** True if an IP literal (v4 or v6) is private/loopback/link-local/metadata. */
export function isPrivateIp(ip: string): boolean {
  const a = ip.toLowerCase().replace(/^\[|\]$/g, "");
  if (a.includes(":")) {
    // IPv6
    if (a === "::1" || a === "::") return true;
    if (a.startsWith("fc") || a.startsWith("fd")) return true; // ULA fc00::/7
    if (a.startsWith("fe80")) return true;                      // link-local
    if (a.startsWith("::ffff:")) return isPrivateIp(a.slice(7)); // IPv4-mapped
    return false;
  }
  const parts = a.split(".").map((n) => parseInt(n, 10));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true; // malformed → unsafe
  const [p0, p1] = parts;
  if (p0 === 0 || p0 === 127 || p0 === 10) return true;
  if (p0 === 192 && p1 === 168) return true;
  if (p0 === 172 && p1 >= 16 && p1 <= 31) return true;
  if (p0 === 169 && p1 === 254) return true; // link-local / cloud metadata
  if (p0 === 100 && p1 >= 64 && p1 <= 127) return true; // CGNAT
  return false;
}

/**
 * Validate that a URL is safe to render as an image or download target.
 * Rejects javascript:, data: (except images), file:, vbscript:, intranet IPs,
 * IPv6 (incl. bracketed/IPv4-mapped) loopback/metadata, and internal hostnames.
 *
 * NOTE: this is the synchronous, input-time check. Before the server actually
 * FETCHES a user-supplied URL, also call isFetchableImageUrl() (async) which
 * resolves DNS and rejects hosts pointing at private space — defeating
 * hostname-based and DNS-rebinding SSRF (audit H8).
 */
export function isSafeImageUrl(input: unknown): boolean {
  if (typeof input !== "string") return false;
  const url = input.trim();
  if (url.length === 0 || url.length > 2048) return false;

  // Allow data: URLs only for known image MIME types
  if (url.startsWith("data:")) {
    return /^data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,/i.test(url);
  }

  let parsed: URL;
  try { parsed = new URL(url); } catch { return false; }

  if (!["http:", "https:"].includes(parsed.protocol)) return false;

  // Normalise host: lowercase + strip IPv6 brackets so [::1] / [::ffff:a9fe:a9fe]
  // are matched too.
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");

  // Block internal hostnames + cloud metadata endpoints.
  if (
    host === "localhost" ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host === "metadata.google.internal" ||
    host === "metadata.goog"
  ) {
    return false;
  }

  // Block IP literals in private/loopback/link-local/metadata ranges (v4 + v6).
  // A bare IP host (digits/colons/dots) is validated directly; if it's a
  // hostname, isPrivateIp returns false here and the async DNS check covers it.
  const looksLikeIp = /^[0-9.]+$/.test(host) || host.includes(":");
  if (looksLikeIp && isPrivateIp(host)) return false;

  return true;
}

export function safeUrlOrEmpty(input: unknown): string {
  return isSafeImageUrl(input) ? (input as string) : "";
}

/**
 * Async, fetch-time SSRF guard (audit H8). Runs the sync checks, then resolves
 * the hostname and rejects if ANY resolved address is private/loopback/link-
 * local/metadata. Call this immediately before the server fetches a user-
 * supplied image URL. (Residual DNS-rebinding between this lookup and the actual
 * connect is best closed with a pinned-IP fetch agent.)
 */
export async function isFetchableImageUrl(input: unknown): Promise<boolean> {
  if (!isSafeImageUrl(input)) return false;
  const url = (input as string).trim();
  if (url.startsWith("data:")) return true;
  let parsed: URL;
  try { parsed = new URL(url); } catch { return false; }
  const host = parsed.hostname.replace(/^\[|\]$/g, "");
  try {
    const { lookup } = await import("node:dns/promises");
    const results = await lookup(host, { all: true });
    if (!results.length) return false;
    return results.every((r) => !isPrivateIp(r.address));
  } catch {
    return false; // unresolvable / lookup error → reject
  }
}

/**
 * Magic-byte file type detection.
 * Trusts the actual bytes, not the client-supplied MIME or extension.
 */
export function detectImageMime(buf: Buffer): "image/jpeg" | "image/png" | "image/webp" | "image/gif" | null {
  if (buf.length < 12) return null;
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  ) return "image/png";
  // GIF: 47 49 46 38
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return "image/gif";
  // WebP: RIFF????WEBP
  if (
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  ) return "image/webp";
  return null;
}
