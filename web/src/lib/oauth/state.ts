/**
 * OAuth state token helpers.
 *
 * The "state" parameter passed to the provider authorize URL must:
 *  - bind the request to the originating user/pet (CSRF defense)
 *  - survive a round-trip through the provider (we don't control the redirect)
 *  - expire quickly (5 minutes is plenty)
 *
 * We use a short-lived JWT signed with JWT_SECRET. PKCE verifier (for Twitter/X)
 * also lives in the state so we don't need server-side session storage.
 */

import { SignJWT, jwtVerify } from "jose";
import crypto from "crypto";

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) throw new Error("JWT_SECRET required for OAuth state");
const SECRET = new TextEncoder().encode(jwtSecret);

export interface OAuthStatePayload {
  petId: number;
  userId: number;
  provider: string;
  returnTo?: string;
  codeVerifier?: string;  // PKCE
  nonce: string;
}

export async function signState(p: Omit<OAuthStatePayload, "nonce">): Promise<string> {
  const payload: OAuthStatePayload = { ...p, nonce: crypto.randomUUID() };
  return new SignJWT(payload as any)
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("5m")
    .setIssuedAt()
    .sign(SECRET);
}

export async function verifyState(token: string): Promise<OAuthStatePayload | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return payload as unknown as OAuthStatePayload;
  } catch {
    return null;
  }
}

// PKCE helpers — RFC 7636 (only Twitter/X uses these among current providers,
// but it's safe to apply to any OAuth 2.0 provider that supports PKCE).
export function pkceVerifier(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export function pkceChallenge(verifier: string): string {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}
