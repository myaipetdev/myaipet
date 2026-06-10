/**
 * POST /api/buddy/invite — Body: { partnerWallet }
 * Send a buddy-lock invite. Both users have to complete a daily mission
 * for the shared streak to tick. Worst friend-keeping mechanism ever
 * invented — exactly the point.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { partnerWallet } = await req.json().catch(() => ({}));
  if (!partnerWallet || typeof partnerWallet !== "string") {
    return NextResponse.json({ error: "partnerWallet required" }, { status: 400 });
  }

  const partner = await prisma.user.findUnique({ where: { wallet_address: partnerWallet.toLowerCase() } });
  if (!partner) return NextResponse.json({ error: "Partner not found" }, { status: 404 });
  if (partner.id === user.id) return NextResponse.json({ error: "Can't buddy yourself" }, { status: 400 });

  // Reject if a row already exists either direction
  const existing = await prisma.streakBuddy.findFirst({
    where: {
      OR: [
        { user_a_id: user.id, user_b_id: partner.id },
        { user_a_id: partner.id, user_b_id: user.id },
      ],
      status: { in: ["pending", "active"] },
    },
  });
  if (existing) return NextResponse.json({ error: "Buddy already exists or pending" }, { status: 409 });

  const row = await prisma.streakBuddy.create({
    data: { user_a_id: user.id, user_b_id: partner.id, status: "pending" },
  });
  return NextResponse.json({ ok: true, id: row.id });
}
