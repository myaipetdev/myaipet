import { SignJWT, jwtVerify } from "jose";
import { NextRequest } from "next/server";
import { prisma } from "./prisma";

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
  const payload = await verifyToken(auth.slice(7));
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

/** SCRUM-58: rotate the user's session nonce — invalidates every prior token. */
export async function invalidateSession(userId: number): Promise<void> {
  const newNonce = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  await prisma.user.update({
    where: { id: userId },
    data: { nonce: newNonce },
  });
}
