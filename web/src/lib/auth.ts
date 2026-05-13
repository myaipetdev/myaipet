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
    const { payload } = await jwtVerify(token, JWT_SECRET);
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

  // SCRUM-58: session binding. A token issued with one nonce stops working
  // the moment we rotate that nonce (logout / re-verify).
  // Tokens that pre-date this change (no payload.sid) still validate until
  // their 8h TTL — naturally migrates everyone.
  if (payload.sid && payload.sid !== user.nonce) {
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
