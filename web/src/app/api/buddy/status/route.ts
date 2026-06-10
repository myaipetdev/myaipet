/**
 * GET /api/buddy/status — returns the user's active buddy + pending invites.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await prisma.streakBuddy.findMany({
    where: {
      OR: [
        { user_a_id: user.id, status: { in: ["pending", "active"] } },
        { user_b_id: user.id, status: { in: ["pending", "active"] } },
      ],
    },
    include: {
      user_a: { select: { id: true, wallet_address: true, pets: { take: 1, orderBy: { level: "desc" }, where: { is_active: true }, select: { name: true, avatar_url: true } } } },
      user_b: { select: { id: true, wallet_address: true, pets: { take: 1, orderBy: { level: "desc" }, where: { is_active: true }, select: { name: true, avatar_url: true } } } },
    },
    orderBy: { created_at: "desc" },
  });

  const active = rows.filter(r => r.status === "active").map(r => {
    const other = r.user_a_id === user.id ? r.user_b : r.user_a;
    return {
      id: r.id, status: r.status, shared_streak: r.shared_streak,
      partner: {
        wallet: `${other.wallet_address.slice(0, 6)}...${other.wallet_address.slice(-4)}`,
        pet: other.pets[0] || null,
      },
    };
  });

  // Inbound invites (you're user_b and status is pending)
  const inboundInvites = rows.filter(r => r.status === "pending" && r.user_b_id === user.id).map(r => ({
    id: r.id, sender: {
      wallet: `${r.user_a.wallet_address.slice(0, 6)}...${r.user_a.wallet_address.slice(-4)}`,
      pet: r.user_a.pets[0] || null,
    },
  }));

  const outboundInvites = rows.filter(r => r.status === "pending" && r.user_a_id === user.id).map(r => ({
    id: r.id, target: {
      wallet: `${r.user_b.wallet_address.slice(0, 6)}...${r.user_b.wallet_address.slice(-4)}`,
      pet: r.user_b.pets[0] || null,
    },
  }));

  return NextResponse.json({ active, inboundInvites, outboundInvites });
}
