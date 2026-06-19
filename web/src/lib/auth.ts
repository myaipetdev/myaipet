import { SignJWT, jwtVerify } from "jose";
import { NextRequest } from "next/server";
import { createHash, randomBytes } from "crypto";
import { prisma } from "./prisma";

// CLI personal access tokens carry this prefix so getUser can route them to the
// cli_tokens table instead of JWT verification. The plaintext is shown once at
// mint time; only its sha256 hash is ever stored. See /api/petclaw/cli/token.
export const CLI_TOKEN_PREFIX = "pck_";

/** Mint a fresh CLI token string (plaintext, returned to the user only once). */
export function generateCliToken(): string {
  return CLI_TOKEN_PREFIX + randomBytes(32).toString("base64url");
}

/** sha256 hex of a CLI token — what we store and look up by. */
export function hashCliToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function isCliToken(token: string): boolean {
  return token.startsWith(CLI_TOKEN_PREFIX);
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

export async function getUser(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const token = auth.slice(7);

  // CLI personal access tokens (pck_…): long-lived, revocable, owner-bound. They
  // intentionally bypass the JWT nonce/session binding — that's the point of a
  // stable CLI credential — and are revoked explicitly via revoked_at, not by
  // rotating the web session nonce.
  if (isCliToken(token)) return getUserByCliToken(token);

  const payload = await verifyToken(token);
  if (!payload) return null;

  const user = await prisma.user.findUnique({
    where: { id: Number(payload.sub) },
  });
  if (!user) return null;

  // SCRUM-58 + audit L3: session binding. A token only validates while its sid
  // equals the user's current nonce; rotating the nonce (logout / re-verify)
  // invalidates every prior token immediately. Now STRICT — a token with a
  // missing/empty sid no longer bypasses the check (the pre-SCRUM-58 migration
  // window is long past; all live tokens carry a sid).
  if (payload.sid !== user.nonce) {
    return null;
  }

  return user;
}

/**
 * Resolve a CLI personal access token to its owner. Rejects unknown, revoked,
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
export async function invalidateSession(userId: number): Promise<void> {
  const newNonce = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  await prisma.user.update({
    where: { id: userId },
    data: { nonce: newNonce },
  });
}
