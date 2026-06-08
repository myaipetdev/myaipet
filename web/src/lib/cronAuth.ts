/**
 * Cron endpoint authentication (audit H12).
 *
 * Fails CLOSED: if CRON_SECRET is not configured the request is rejected, so a
 * missing env var can never leave decay/activity/pool-distribution publicly
 * triggerable. Accepts the secret via `Authorization: Bearer <secret>` (Vercel
 * Cron) or an `x-cron-secret` header, compared in constant time.
 */

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

export function verifyCron(req: NextRequest): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Cron not configured" }, { status: 503 });
  }
  const provided =
    (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim() ||
    (req.headers.get("x-cron-secret") || "").trim();

  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
