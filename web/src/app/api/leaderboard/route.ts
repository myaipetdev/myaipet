import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  try {
    const limit = Math.min(100, parseInt(req.nextUrl.searchParams.get("limit") || "50"));

    // Get current user (optional - don't fail if not authenticated)
    let currentUser: any = null;
    try { currentUser = await getUser(req); } catch {}

    // Get top users by airdrop points
    const users = await prisma.user.findMany({
      select: {
        id: true,
        wallet_address: true,
        airdrop_points: true,
        credits: true,
        pets: {
          where: { is_active: true },
          orderBy: { level: "desc" },
          take: 1,
          select: {
            name: true,
            level: true,
            experience: true,
            total_interactions: true,
            avatar_url: true,
            personality_type: true,
            evolution_stage: true,
          },
        },
      },
      orderBy: { airdrop_points: "desc" },
      take: limit,
    });

    const leaderboard = users
      .filter(u => u.pets.length > 0)
      .map((u, i) => {
        const isMe = currentUser ? u.id === currentUser.id : false;
        return {
        rank: i + 1,
        wallet: `${u.wallet_address.slice(0, 6)}...${u.wallet_address.slice(-4)}`,
        ...(isMe ? { wallet_full: u.wallet_address } : {}),
        points: u.airdrop_points,
        isMe,
        pet: u.pets[0] ? {
          name: u.pets[0].name,
          level: u.pets[0].level,
          avatar_url: u.pets[0].avatar_url,
          personality: u.pets[0].personality_type,
          evolution: u.pets[0].evolution_stage,
          interactions: u.pets[0].total_interactions,
        } : null,
      };
      });

    // Find current user's rank if not in top list
    let myRank = null;
    if (currentUser) {
      const meInList = leaderboard.find(e => e.isMe);
      if (meInList) {
        myRank = meInList;
      } else {
        // Count users with more points to determine rank
        const higherCount = await prisma.user.count({
          where: {
            airdrop_points: { gt: currentUser.airdrop_points },
            pets: { some: { is_active: true } },
          },
        });
        const myPet = await prisma.pet.findFirst({
          where: { user_id: currentUser.id, is_active: true },
          orderBy: { level: "desc" },
          select: { name: true, level: true, avatar_url: true, personality_type: true, evolution_stage: true, total_interactions: true },
        });
        if (myPet) {
          myRank = {
            rank: higherCount + 1,
            wallet: `${currentUser.wallet_address.slice(0, 6)}...${currentUser.wallet_address.slice(-4)}`,
            points: currentUser.airdrop_points,
            isMe: true,
            pet: {
              name: myPet.name,
              level: myPet.level,
              avatar_url: myPet.avatar_url,
              personality: myPet.personality_type,
              evolution: myPet.evolution_stage,
              interactions: myPet.total_interactions,
            },
          };
        }
      }
    }

    return NextResponse.json({ leaderboard, total: leaderboard.length, myRank });
  } catch (error: any) {
    console.error("Leaderboard error:", error);
    return NextResponse.json({ error: "Failed to fetch leaderboard" }, { status: 500 });
  }
}
