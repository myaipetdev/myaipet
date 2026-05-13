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

/**
 * Validate that a URL is safe to render as an image or download target.
 * Rejects javascript:, data: (except images), file:, vbscript:, and intranet IPs.
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

  // Block private / loopback / link-local IP literals — defense against SSRF
  const host = parsed.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host === "0.0.0.0" ||
    host.endsWith(".local") ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2[0-9]|3[01])\./.test(host) ||
    /^169\.254\./.test(host) ||      // AWS metadata / link-local
    /^::1$/.test(host) ||
    /^fc00:/i.test(host) ||
    /^fe80:/i.test(host)
  ) {
    return false;
  }
  return true;
}

export function safeUrlOrEmpty(input: unknown): string {
  return isSafeImageUrl(input) ? (input as string) : "";
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
