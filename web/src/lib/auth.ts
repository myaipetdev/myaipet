import { SignJWT, jwtVerify } from "jose";
import { NextRequest } from "next/server";
import { createHash, randomBytes } from "crypto";
import { prisma } from "./prisma";
import type { User } from "@/generated/prisma/client";

// Personal access tokens carry one of these prefixes so getUser can route them
// to the cli_tokens table instead of JWT verification. The plaintext is shown
// once at mint time; only its sha256 hash is stored. See /api/petclaw/cli/token.
export const CLI_TOKEN_PREFIX = "pck_";
export const EXTENSION_TOKEN_PREFIX = "pex_";
export const SESSION_COOKIE_NAME = process.env.NODE_ENV === "production"
  ? "__Host-petclaw_session"
  : "petclaw_session";

/** Mint a fresh personal-access token (plaintext, returned only once). */
export function generateCliToken(prefix: typeof CLI_TOKEN_PREFIX | typeof EXTENSION_TOKEN_PREFIX = CLI_TOKEN_PREFIX): string {
  return prefix + randomBytes(32).toString("base64url");
}

/** sha256 hex of a personal-access token — what we store and look up by. */
export function hashCliToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function isCliToken(token: string): boolean {
  return token.startsWith(CLI_TOKEN_PREFIX) || token.startsWith(EXTENSION_TOKEN_PREFIX);
}

export function isExtensionToken(token: string): boolean {
  return token.startsWith(EXTENSION_TOKEN_PREFIX);
}

export type AuthCredentialType = "session" | "cli" | "extension";

export interface AuthContext {
  user: User;
  credential: AuthCredentialType;
}

function extensionTokenCanAccess(req: NextRequest): boolean {
  const path = req.nextUrl.pathname;
  const method = req.method.toUpperCase();
  if (method === "GET" && (path === "/api/pets" || /^\/api\/pets\/\d+$/.test(path))) return true;
  if ((method === "GET" || method === "POST") && path === "/api/petclaw/skills") return true;
  if (method === "GET" && path === "/api/petclaw/export") return true;
  if (method === "GET" && (/^\/api\/media\//.test(path) || /^\/uploads\//.test(path))) return true;
  if (method === "POST" && path === "/api/petclaw/import") return true;
  if ((method === "GET" || method === "POST") && path === "/api/petclaw/engagement") return true;
  return false;
}

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) throw new Error("JWT_SECRET environment variable is required");
const JWT_SECRET = new TextEncoder().encode(jwtSecret);

// SCRUM-58: shorter TTL reduces theft window. Combined with the session-id
// (nonce) binding below, logout becomes effective immediately.
const ACCESS_TOKEN_TTL = "8h";

/**
 * Create a JWT bound to the user's current nonce. Logout = rotate nonce, which
 * invalidates every previously-issued token in one shot, without needing a
 * separate revocation table.
 */
export async function createToken(userId: number, wallet: string) {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { nonce: true },
  });
  return new SignJWT({ sub: String(userId), wallet, sid: u?.nonce || "" })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(ACCESS_TOKEN_TTL)
    .setIssuedAt()
    .sign(JWT_SECRET);
}

export async function verifyToken(token: string) {
  try {
    // audit L2: pin the algorithm so a token can't be presented under a
    // different alg than we sign with.
    const { payload } = await jwtVerify(token, JWT_SECRET, { algorithms: ["HS256"] });
    return payload as { sub: string; wallet: string; sid?: string };
  } catch {
    return null;
  }
}

/**
 * Authenticate a request while retaining the credential class. Routes with a
 * reduced extension contract use this context so a valid pex_ token never
 * receives the broader first-party session response by accident.
 */
export async function getAuthContext(req: NextRequest): Promise<AuthContext | null> {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const token = auth.slice(7);

  // Owner-bound personal access tokens are explicitly revocable. Extension
  // tokens (pex_…) are shorter lived and additionally restricted by route.
  if (isCliToken(token)) {
    if (isExtensionToken(token) && !extensionTokenCanAccess(req)) return null;
    const user = await getUserByCliToken(token);
    if (!user) return null;
    return {
      user,
      credential: isExtensionToken(token) ? "extension" : "cli",
    };
  }

  const payload = await verifyToken(token);
  if (!payload) return null;

  const user = await prisma.user.findUnique({
    where: { id: Number(payload.sub) },
  });
  if (!user) return null;

  // SCRUM-58 + audit L3: session binding. A token only validates while its sid
  // equals the user's current nonce; rotating the nonce on explicit logout
  // invalidates every prior token immediately. Login challenges live in their
  // own table and never mutate this revocation binding. Now STRICT — a token with a
  // missing/empty sid no longer bypasses the check (the pre-SCRUM-58 migration
  // window is long past; all live tokens carry a sid).
  if (payload.sid !== user.nonce) {
    return null;
  }

  return { user, credential: "session" };
}

/** Preserve the existing user-only auth contract for all other routes. */
export async function getUser(req: NextRequest): Promise<User | null> {
  return (await getAuthContext(req))?.user ?? null;
}

/**
 * Browser media elements cannot attach an Authorization header. The login
 * endpoint therefore mirrors the same nonce-bound JWT into an HttpOnly,
 * SameSite cookie used only by the protected media handler.
 */
export async function getUserFromSessionCookie(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  const payload = await verifyToken(token);
  if (!payload) return null;
  const user = await prisma.user.findUnique({ where: { id: Number(payload.sub) } });
  if (!user || payload.sid !== user.nonce) return null;
  return user;
}

/**
 * Resolve a personal access token to its owner. Rejects unknown, revoked,
 * and expired tokens. Touches last_used_at (throttled, best-effort) so the web
 * UI can show when a token was last active. Returns the User or null.
 */
async function getUserByCliToken(token: string) {
  const row = await prisma.cliToken.findUnique({ where: { token_hash: hashCliToken(token) } });
  if (!row) return null;
  if (row.revoked_at) return null;
  if (row.expires_at && row.expires_at.getTime() < Date.now()) return null;

  const user = await prisma.user.findUnique({ where: { id: row.owner_user_id } });
  if (!user) return null;

  // Throttle the last-used write to ~once/minute to avoid a DB write on every
  // authenticated request. Fire-and-forget — never block or fail auth on it.
  if (!row.last_used_at || Date.now() - row.last_used_at.getTime() > 60_000) {
    prisma.cliToken.update({ where: { id: row.id }, data: { last_used_at: new Date() } }).catch(() => {});
  }
  return user;
}

/** SCRUM-58: rotate the user's session nonce — invalidates every prior token. */
export async function invalidateSession(userId: number, walletAddress?: string): Promise<void> {
  const newNonce = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { nonce: newNonce },
    }),
    ...(walletAddress ? [prisma.loginChallenge.updateMany({
      where: { wallet_address: walletAddress.toLowerCase(), consumed_at: null },
      data: { consumed_at: new Date() },
    })] : []),
  ]);
}
