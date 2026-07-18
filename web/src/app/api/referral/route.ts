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
  // The referral schema and grant flow are not part of this launch. Keep the
  // dormant route fail-closed so a clean production build does not depend on
  // an unapproved migration. When the program is reviewed and migrated, this
  // exact flag can be enabled without exposing a half-created ledger.
  if (process.env.REFERRALS_ENABLED !== "true") {
    return NextResponse.json(
      { error: "Referrals are not available" },
      { status: 503 },
    );
  }

  const user = await getUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const code = referralCodeForUserId(user.id);
  const link = `${baseUrl(req)}/?ref=${code}`;

  // Raw SQL deliberately keeps this dormant route decoupled from the launch
  // Prisma schema. The table exists only after the separately reviewed
  // referral migration is approved.
  const [counts] = await prisma.$queryRaw<Array<{
    credited_count: bigint;
    pending_count: bigint;
  }>>`
    SELECT
      count(*) FILTER (WHERE "credited" = true)::bigint AS "credited_count",
      count(*) FILTER (WHERE "credited" = false)::bigint AS "pending_count"
    FROM "referrals"
    WHERE "referrer_id" = ${user.id}
  `;
  const referralCount = Number(counts?.credited_count ?? BigInt(0));
  const pendingCount = Number(counts?.pending_count ?? BigInt(0));

  return NextResponse.json({
    code,
    link,
    referralCount,
    pendingCount,
  });
}
