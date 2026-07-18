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

function parseIpv4(value: string): number[] | null {
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(value)) return null;
  const parts = value.split(".").map(Number);
  return parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)
    ? parts
    : null;
}

function parseIpv6(value: string): bigint | null {
  let input = value.toLowerCase();
  if (!input || input.includes("%") || (input.match(/::/g) || []).length > 1) return null;

  // Convert a dotted IPv4 tail into the two hextets used by mapped/compatible
  // IPv6 forms before applying the normal compression rules.
  if (input.includes(".")) {
    const lastColon = input.lastIndexOf(":");
    if (lastColon < 0) return null;
    const ipv4 = parseIpv4(input.slice(lastColon + 1));
    if (!ipv4) return null;
    const high = ((ipv4[0] << 8) | ipv4[1]).toString(16);
    const low = ((ipv4[2] << 8) | ipv4[3]).toString(16);
    input = `${input.slice(0, lastColon)}:${high}:${low}`;
  }

  const compressed = input.includes("::");
  const [leftRaw, rightRaw = ""] = input.split("::");
  const left = leftRaw ? leftRaw.split(":") : [];
  const right = rightRaw ? rightRaw.split(":") : [];
  if ([...left, ...right].some((part) => !/^[0-9a-f]{1,4}$/.test(part))) return null;
  const missing = 8 - left.length - right.length;
  if ((!compressed && missing !== 0) || (compressed && missing < 1)) return null;
  const groups = [...left, ...Array(missing).fill("0"), ...right];
  if (groups.length !== 8) return null;
  return groups.reduce(
    (result, group) => (result << BigInt(16)) | BigInt(`0x${group}`),
    BigInt(0),
  );
}

function ipv6Value(...groups: number[]): bigint {
  return Array.from({ length: 8 }, (_, index) => groups[index] || 0)
    .reduce<bigint>(
      (result, group) => (result << BigInt(16)) | BigInt(group),
      BigInt(0),
    );
}

function matchesIpv6Prefix(value: bigint, prefix: bigint, bits: number): boolean {
  const shift = BigInt(128 - bits);
  return (value >> shift) === (prefix >> shift);
}

const UNSAFE_IPV6_RANGES: ReadonlyArray<readonly [bigint, number]> = [
  [ipv6Value(), 96],                              // IPv4-compatible + unspecified/loopback
  [ipv6Value(0, 0, 0, 0, 0, 0xffff), 96],       // IPv4-mapped (incl. hexadecimal tails)
  [ipv6Value(0, 0, 0, 0, 0xffff, 0), 96],       // IPv4-translatable
  [ipv6Value(0x0064, 0xff9b), 96],               // well-known NAT64
  [ipv6Value(0x0064, 0xff9b, 0x0001), 48],       // local-use NAT64
  [ipv6Value(0x0100), 64],                       // discard-only
  [ipv6Value(0x2001, 0x0000), 32],               // Teredo
  [ipv6Value(0x2001, 0x0002), 48],               // benchmarking
  [ipv6Value(0x2001, 0x0010), 28],               // ORCHID (deprecated)
  [ipv6Value(0x2001, 0x0020), 28],               // ORCHIDv2
  [ipv6Value(0x2001, 0x0db8), 32],               // documentation
  [ipv6Value(0x2002), 16],                       // 6to4 transition space
  [ipv6Value(0xfc00), 7],                        // unique-local
  [ipv6Value(0xfe80), 10],                       // link-local (fe80:: through febf::)
  [ipv6Value(0xfec0), 10],                       // deprecated site-local
  [ipv6Value(0xff00), 8],                        // multicast
];

/** True if an IP literal is non-public/private/loopback/link-local/metadata. */
export function isPrivateIp(ip: string): boolean {
  const value = ip.toLowerCase().replace(/^\[|\]$/g, "");
  if (value.includes(":")) {
    const parsed = parseIpv6(value);
    if (parsed === null) return true; // malformed or zone-scoped → unsafe
    return UNSAFE_IPV6_RANGES.some(([prefix, bits]) => matchesIpv6Prefix(parsed, prefix, bits));
  }

  const parts = parseIpv4(value);
  if (!parts) return true;
  const [p0, p1, p2] = parts;
  if (p0 === 0 || p0 === 10 || p0 === 127) return true;
  if (p0 === 100 && p1 >= 64 && p1 <= 127) return true; // CGNAT / provider metadata
  if (p0 === 169 && p1 === 254) return true;
  if (p0 === 172 && p1 >= 16 && p1 <= 31) return true;
  if (p0 === 192 && p1 === 168) return true;
  if (p0 === 192 && p1 === 0 && (p2 === 0 || p2 === 2)) return true;
  if (p0 === 192 && p1 === 88 && p2 === 99) return true;
  if (p0 === 198 && (p1 === 18 || p1 === 19)) return true;
  if (p0 === 198 && p1 === 51 && p2 === 100) return true;
  if (p0 === 203 && p1 === 0 && p2 === 113) return true;
  if (p0 >= 224) return true; // multicast, reserved, limited broadcast
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
 * ordinary hostname-based SSRF. Callers that follow redirects must repeat the
 * check for every hop. (Pinning the validated address at connect time remains
 * the strongest defence against a sub-second DNS rebinding race.)
 */
export function isSafeImageUrl(input: unknown): boolean {
  if (typeof input !== "string") return false;
  const url = input.trim();
  if (url.length === 0 || url.length > 2048) return false;

  // Application-owned media is stored as a relative path so every request is
  // mediated by the owner/consent-aware /uploads rewrite. Only the canonical,
  // traversal-free form is accepted.
  if (url.startsWith("/uploads/")) {
    if (!/^\/uploads\/[A-Za-z0-9._/-]+$/.test(url)) return false;
    return !url.slice("/uploads/".length).split("/").some((part) => !part || part === "." || part === "..");
  }

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
  // A bare IP host (digits/colons/dots) is validated directly; ordinary
  // hostnames skip this branch and the async DNS check covers their addresses.
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
