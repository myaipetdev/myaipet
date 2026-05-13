import { NextRequest, NextResponse } from "next/server";
import { getUser, invalidateSession } from "@/lib/auth";
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
    return NextResponse.json({ ok: true });
  }

  try {
    await invalidateSession(user.id);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("Logout error:", e?.message);
    return NextResponse.json({ error: "Logout failed" }, { status: 500 });
  }
}
