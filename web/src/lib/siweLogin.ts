import { createHash, randomBytes } from "crypto";
import { Signature } from "ethers";
import { SiweMessage } from "siwe";
import { getAddress } from "viem";

const PRODUCTION_DOMAIN = "app.myaipet.ai";
const DEFAULT_CHAIN_ID = 56;
const DEFAULT_CHALLENGE_TTL_MS = 5 * 60 * 1000;
const MAX_CHALLENGE_TTL_MS = 10 * 60 * 1000;
const FUTURE_CLOCK_SKEW_MS = 60 * 1000;

export const SIWE_STATEMENT = "Sign in to MY AI PET";

export type TrustedSiweConfig = {
  domain: string;
  uri: string;
  chainId: number;
  challengeTtlMs: number;
  allowedDomains: ReadonlySet<string>;
};

function parsePositiveInteger(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeAuthority(raw: string): string {
  const authority = raw.trim().toLowerCase();
  if (!authority || authority.length > 255 || /[\s/@?#]/.test(authority)) {
    throw new Error("Invalid SIWE domain configuration");
  }

  let parsed: URL;
  try {
    parsed = new URL(`https://${authority}`);
  } catch {
    throw new Error("Invalid SIWE domain configuration");
  }
  if (parsed.host.toLowerCase() !== authority || parsed.pathname !== "/") {
    throw new Error("Invalid SIWE domain configuration");
  }
  return authority;
}

function localDevelopmentAuthority(requestUrl?: URL): string | null {
  if (process.env.NODE_ENV === "production" || !requestUrl) return null;
  const hostname = requestUrl.hostname.toLowerCase();
  if (hostname !== "localhost" && hostname !== "127.0.0.1" && hostname !== "[::1]") {
    return null;
  }
  return normalizeAuthority(requestUrl.host);
}

/**
 * Resolve the one canonical SIWE relying party for this deployment.
 *
 * Production never derives authority from Host/Origin/X-Forwarded-* headers.
 * SIWE_DOMAIN and SIWE_URI are operator-controlled configuration; absent those,
 * the fixed app.myaipet.ai origin is used. A localhost request is accepted only
 * outside production so local development remains usable.
 */
export function getTrustedSiweConfig(
  requestUrl?: URL,
  requestHost?: string | null,
): TrustedSiweConfig {
  const configuredDomain = process.env.SIWE_DOMAIN?.trim();
  const domain = normalizeAuthority(
    configuredDomain || localDevelopmentAuthority(requestUrl) || PRODUCTION_DOMAIN,
  );
  const presentedAuthority = requestHost || requestUrl?.host;

  // The request authority can only veto a production request; it can never
  // become an allowed SIWE authority. Nginx preserves the public Host, so a
  // direct-IP/alternate-Host request fails closed instead of receiving a valid
  // challenge for the canonical domain.
  if (
    process.env.NODE_ENV === "production" &&
    presentedAuthority &&
    normalizeAuthority(presentedAuthority) !== domain
  ) {
    throw new Error("Untrusted SIWE request authority");
  }

  const uriValue = process.env.SIWE_URI?.trim() ||
    `${process.env.NODE_ENV === "production" || domain === PRODUCTION_DOMAIN ? "https" : "http"}://${domain}`;

  let uriUrl: URL;
  try {
    uriUrl = new URL(uriValue);
  } catch {
    throw new Error("Invalid SIWE URI configuration");
  }
  if (
    uriUrl.username ||
    uriUrl.password ||
    uriUrl.host.toLowerCase() !== domain ||
    uriUrl.pathname !== "/" ||
    uriUrl.search ||
    uriUrl.hash ||
    (process.env.NODE_ENV === "production" && uriUrl.protocol !== "https:") ||
    (uriUrl.protocol !== "https:" && uriUrl.protocol !== "http:")
  ) {
    throw new Error("Invalid SIWE URI configuration");
  }
  const uri = uriUrl.origin;

  const configuredAllowed = (process.env.SIWE_ALLOWED_DOMAINS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map(normalizeAuthority);
  const allowedDomains = new Set<string>([domain, ...configuredAllowed]);

  const chainId = parsePositiveInteger(process.env.SIWE_CHAIN_ID, DEFAULT_CHAIN_ID);
  const requestedTtl = parsePositiveInteger(
    process.env.SIWE_CHALLENGE_TTL_SECONDS,
    DEFAULT_CHALLENGE_TTL_MS / 1000,
  ) * 1000;
  const challengeTtlMs = Math.min(requestedTtl, MAX_CHALLENGE_TTL_MS);

  return { domain, uri, chainId, challengeTtlMs, allowedDomains };
}

export function createSiweNonce(): string {
  // EIP-4361 requires at least 8 alphanumeric characters. Hex is uniformly
  // random, parser-safe, and gives each concurrent challenge its own key.
  return randomBytes(16).toString("hex");
}

export function createSessionNonce(): string {
  return randomBytes(16).toString("hex");
}

export function hashSiweMessage(message: string): string {
  return createHash("sha256").update(message, "utf8").digest("hex");
}

export function buildSiweMessage(params: {
  address: string;
  nonce: string;
  issuedAt: Date;
  expiresAt: Date;
  config: TrustedSiweConfig;
}): string {
  return new SiweMessage({
    domain: params.config.domain,
    // EIP-4361 requires EIP-55 casing when the address contains letters. User
    // identity remains lowercase in PostgreSQL, while the signed wire format is
    // canonical checksummed Ethereum text.
    address: getAddress(params.address as `0x${string}`),
    statement: SIWE_STATEMENT,
    uri: params.config.uri,
    version: "1",
    chainId: params.config.chainId,
    nonce: params.nonce,
    issuedAt: params.issuedAt.toISOString(),
    expirationTime: params.expiresAt.toISOString(),
  }).prepareMessage();
}

export function parseAndValidateSiweMessage(
  rawMessage: string,
  config: TrustedSiweConfig,
  now = new Date(),
): SiweMessage {
  // SiweMessage(string) invokes the package's EIP-4361 ABNF parser. Missing or
  // malformed required fields throw instead of being accepted piecemeal.
  const parsed = new SiweMessage(rawMessage);

  if (
    parsed.scheme !== undefined ||
    parsed.version !== "1" ||
    parsed.statement !== SIWE_STATEMENT ||
    parsed.domain !== config.domain ||
    !config.allowedDomains.has(parsed.domain) ||
    parsed.uri !== config.uri ||
    parsed.chainId !== config.chainId ||
    !parsed.nonce ||
    !parsed.issuedAt ||
    !parsed.expirationTime ||
    parsed.notBefore !== undefined ||
    parsed.requestId !== undefined ||
    parsed.resources !== undefined
  ) {
    throw new Error("SIWE relying-party fields do not match");
  }

  const issuedAtMs = Date.parse(parsed.issuedAt);
  const expiresAtMs = Date.parse(parsed.expirationTime);
  const nowMs = now.getTime();
  if (
    !Number.isFinite(issuedAtMs) ||
    !Number.isFinite(expiresAtMs) ||
    issuedAtMs > nowMs + FUTURE_CLOCK_SKEW_MS ||
    nowMs - issuedAtMs > config.challengeTtlMs + FUTURE_CLOCK_SKEW_MS ||
    expiresAtMs <= nowMs ||
    expiresAtMs <= issuedAtMs ||
    expiresAtMs - issuedAtMs > config.challengeTtlMs
  ) {
    throw new Error("SIWE challenge is outside its validity window");
  }

  return parsed;
}

export function normalizeSiweSignature(signature: string): string {
  // EIP-2098 compact signatures encode yParity in the high bit of s. Expand
  // the well-defined 64-byte wire form, then let siwe verify the canonical
  // 65-byte EIP-191 signature.
  if (/^0x[0-9a-fA-F]{128}$/.test(signature)) {
    return Signature.from(signature).serialized;
  }
  if (!/^0x[0-9a-fA-F]{130}$/.test(signature)) {
    throw new Error("Invalid SIWE signature encoding");
  }
  const v = Number.parseInt(signature.slice(-2), 16);
  if (v === 0 || v === 1) {
    return `${signature.slice(0, -2)}${(v + 27).toString(16).padStart(2, "0")}`;
  }
  if (v !== 27 && v !== 28) {
    throw new Error("Invalid SIWE signature recovery byte");
  }
  return signature;
}
