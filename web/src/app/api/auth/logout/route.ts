import { NextRequest, NextResponse } from "next/server";
import { getUser, invalidateSession, SESSION_COOKIE_NAME } from "@/lib/auth";
import { rateLimit } from "@/lib/rateLimit";

/**
 * SCRUM-58: explicit logout endpoint.
 *
 * Rotates the user's session nonce (server-side), which immediately
 * invalidates every previously-issued JWT for that user. Clients should
 * also drop their token from localStorage on success.
 */
export async function POST(req: NextRequest) {
  const rl = rateLimit(req, { key: "auth-logout", limit: 10, windowMs: 60_000 });
  if (!rl.ok) return rl.response;

  const user = await getUser(req);
  if (!user) {
    // Already not authenticated — treat as success (idempotent)
    const response = NextResponse.json({ ok: true });
    response.cookies.delete(SESSION_COOKIE_NAME);
    return response;
  }

  try {
    // Rotate every active session and consume any still-pending signed login
    // challenge for this wallet in the same transaction.
    await invalidateSession(user.id, user.wallet_address);
    const response = NextResponse.json({ ok: true });
    response.cookies.delete(SESSION_COOKIE_NAME);
    return response;
  } catch (e: any) {
    console.error("Logout error:", e?.message);
    return NextResponse.json({ error: "Logout failed" }, { status: 500 });
  }
}
