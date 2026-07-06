/**
 * POST /api/sos/[id]/help — donate a shield (50 cr) to save another user's
 * streak. Helper gets "Streak Savior" reputation on a NON-RANKING ledger.
 *
 * COMPLIANCE: helping costs purchasable credits, so it must NOT grant
 * season_points (points are "never bought"). The +20 recognition goes to
 * total_points_earned — a lifetime thank-you ledger that does not rank.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";

const HELP_COST_CREDITS = 50;
const HELPER_REWARD_PTS = 20;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const helper = await getUser(req);
  if (!helper) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const sosId = Number(id);
  if (!sosId) return NextResponse.json({ error: "Bad id" }, { status: 400 });

  const sos = await prisma.streakSos.findUnique({ where: { id: sosId } });
  if (!sos) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (sos.helped_by_id) return NextResponse.json({ error: "Already helped" }, { status: 400 });
  if (sos.sender_id === helper.id) return NextResponse.json({ error: "Can't help yourself" }, { status: 400 });
  if (sos.expires_at < new Date()) return NextResponse.json({ error: "Expired" }, { status: 400 });

  // Fully atomic: claim the SOS first (guards two helpers double-paying for the
  // same SOS), then guarded-decrement the credits (guards a negative balance) —
  // both as conditional updateMany so concurrent requests can't race past checks.
  const result = await prisma.$transaction(async (tx) => {
    const claim = await tx.streakSos.updateMany({
      where: { id: sosId, helped_by_id: null, expires_at: { gt: new Date() } },
      data: { helped_by_id: helper.id, helped_at: new Date(), credits_paid: HELP_COST_CREDITS },
    });
    if (claim.count !== 1) return "already_helped" as const;

    const dec = await tx.user.updateMany({
      where: { id: helper.id, credits: { gte: HELP_COST_CREDITS } },
      // Recognition on the non-ranking lifetime ledger only — never season_points.
      data: { credits: { decrement: HELP_COST_CREDITS }, total_points_earned: { increment: HELPER_REWARD_PTS } },
    });
    if (dec.count === 0) throw new Error("INSUFFICIENT_CREDITS"); // rolls back the claim

    await tx.userStreak.upsert({
      where: { user_id: sos.sender_id },
      update: { shields_owned: { increment: 1 } },
      create: { user_id: sos.sender_id, shields_owned: 1 },
    });
    return "ok" as const;
  }).catch((e: any) => (e?.message === "INSUFFICIENT_CREDITS" ? ("no_credits" as const) : Promise.reject(e)));

  if (result === "already_helped") return NextResponse.json({ error: "Already helped" }, { status: 409 });
  if (result === "no_credits") return NextResponse.json({ error: "Not enough credits" }, { status: 402 });

  return NextResponse.json({ ok: true, reward_pts: HELPER_REWARD_PTS, ledger: "lifetime" });
}
