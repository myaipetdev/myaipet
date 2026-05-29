/**
 * Admin gate — used by every internal metrics endpoint after the DD audit
 * flagged public exposure of low absolute counts as a transparency liability.
 *
 * Usage:
 *   const gate = await requireAdmin(req);
 *   if (gate) return gate;   // 401 or 403 NextResponse
 *
 * ADMIN_WALLETS env: comma-separated wallet addresses, case-insensitive.
 */

import { NextRequest, NextResponse } from "next/server";
import { getUser } from "./auth";

export async function requireAdmin(req: NextRequest): Promise<NextResponse | null> {
  const user = await getUser(req).catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admins = (process.env.ADMIN_WALLETS || "")
    .split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
  if (!admins.includes(user.wallet_address.toLowerCase())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}
