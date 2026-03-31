import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const myLevel = parseInt(req.nextUrl.searchParams.get("level") || "1");

  // Find random opponent pet from other users, within level range
  const opponents = await prisma.pet.findMany({
    where: {
      user_id: { not: user.id },
      is_active: true,
      level: { gte: Math.max(1, myLevel - 3), lte: myLevel + 3 },
    },
    select: {
      id: true,
      name: true,
      level: true,
      personality_type: true,
      avatar_url: true,
      happiness: true,
      energy: true,
      total_interactions: true,
      evolution_stage: true,
      user: { select: { wallet_address: true } },
    },
    take: 20,
  });

  if (opponents.length === 0) {
    // No opponents in range, expand search
    const any = await prisma.pet.findMany({
      where: { user_id: { not: user.id }, is_active: true },
      select: {
        id: true, name: true, level: true, personality_type: true,
        avatar_url: true, happiness: true, energy: true,
        total_interactions: true, evolution_stage: true,
        user: { select: { wallet_address: true } },
      },
      take: 10,
    });

    if (any.length === 0) {
      return NextResponse.json({ opponent: null, message: "No opponents available" });
    }

    const pick = any[Math.floor(Math.random() * any.length)];
    return NextResponse.json({
      opponent: {
        ...pick,
        wallet: `${pick.user.wallet_address.slice(0, 6)}...${pick.user.wallet_address.slice(-4)}`,
      },
    });
  }

  const pick = opponents[Math.floor(Math.random() * opponents.length)];
  return NextResponse.json({
    opponent: {
      ...pick,
      wallet: `${pick.user.wallet_address.slice(0, 6)}...${pick.user.wallet_address.slice(-4)}`,
    },
  });
}
