import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ wallet: string }> }
) {
  try {
    const { wallet } = await params;

    const user = await prisma.user.findFirst({
      where: { wallet_address: wallet.toLowerCase() },
      select: {
        id: true,
        wallet_address: true,
        created_at: true,
        profile: true,
        _count: {
          select: {
            generations: true,
            followers: true,
            following: true,
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const totalLikes = await prisma.like.count({
      where: {
        generation: {
          user_id: user.id,
        },
      },
    });

    return NextResponse.json({
      id: user.id,
      wallet_address: user.wallet_address,
      created_at: user.created_at,
      profile: user.profile,
      stats: {
        followers: user._count.followers,
        following: user._count.following,
        generations: user._count.generations,
        total_likes: totalLikes,
      },
    });
  } catch (error) {
    console.error("Profile fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch profile" }, { status: 500 });
  }
}
