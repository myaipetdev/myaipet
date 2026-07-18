/**
 * GET /api/sos/feed — live SOS requests in the last 24h. Public.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { publicPetWhere } from "@/lib/publicPet";

export async function GET(_req: NextRequest) {
  const rows = await prisma.streakSos.findMany({
    where: { helped_by_id: null, expires_at: { gt: new Date() } },
    take: 30,
    orderBy: { created_at: "desc" },
    include: {
      sender: { select: {
        wallet_address: true,
        pets: { take: 1, orderBy: { level: "desc" }, where: publicPetWhere(), select: { name: true, avatar_url: true } },
      } },
    },
  });
  return NextResponse.json({
    items: rows.map(r => ({
      id: r.id,
      sender_streak: r.sender_streak,
      message: r.message,
      created_at: r.created_at.toISOString(),
      expires_at: r.expires_at.toISOString(),
      sender: {
        wallet: `${r.sender.wallet_address.slice(0, 6)}...${r.sender.wallet_address.slice(-4)}`,
        pet: r.sender.pets[0] || null,
      },
    })),
  });
}
