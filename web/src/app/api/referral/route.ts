import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";

/**
 * Referral system.
 *
 * GET /api/referral (auth) → { code, link, referralCount }
 *
 * The code is a short, stable, deterministic hash of the user's id — no new
 * secret is minted or stored. It reuses JWT_SECRET (already required by
 * src/lib/auth.ts) purely as a salt so codes aren't trivially guessable /
 * sequential; it is NOT a credential and can't be used to authenticate.
 *
 * Grant wiring: crediting a referral (both sides get a small credit grant)
 * happens when the REFERRED user adopts their first pet — see the TODO block
 * at that call site's description in the structured-output notes. This route
 * only reads/derives; it does not itself grant credits on GET.
 */

const REF_SALT = process.env.JWT_SECRET || "myaipet-referral-fallback-salt";

/** Deterministic 8-char base36 code for a user id. Stable forever (no rotation). */
export function referralCodeForUserId(userId: number): string {
  const hash = createHash("sha256").update(`${REF_SALT}:referral:${userId}`).digest("hex");
  // Take a slice of the hex digest and re-encode as base36 for a shorter, ref-link-friendly code.
  const num = BigInt("0x" + hash.slice(0, 12));
  return num.toString(36).toUpperCase().slice(0, 8).padStart(8, "0");
}

function baseUrl(req: NextRequest): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
    req.nextUrl.origin
  );
}

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const code = referralCodeForUserId(user.id);
  const link = `${baseUrl(req)}/?ref=${code}`;

  const referralCount = await prisma.referral.count({
    where: { referrer_id: user.id, credited: true },
  });
  const pendingCount = await prisma.referral.count({
    where: { referrer_id: user.id, credited: false },
  });

  return NextResponse.json({
    code,
    link,
    referralCount,
    pendingCount,
  });
}
