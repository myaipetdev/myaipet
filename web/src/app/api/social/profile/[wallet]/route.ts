import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { publicGenerationWhere } from "@/lib/publicFeed";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ wallet: string }> }
) {
  try {
    const { wallet } = await params;

    const publicGenerations = await publicGenerationWhere();
    const user = await prisma.user.findFirst({
      where: { wallet_address: wallet.toLowerCase() },
      select: {
        id: true,
        wallet_address: true,
        created_at: true,
        profile: true,
        _count: {
          select: {
            followers: true,
            following: true,
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const [generationCount, totalLikes] = await Promise.all([
      prisma.generation.count({ where: await publicGenerationWhere({ user_id: user.id }) }),
      prisma.like.count({ where: { generation: { AND: [publicGenerations, { user_id: user.id }] } } }),
    ]);

    return NextResponse.json({
      id: user.id,
      wallet_address: user.wallet_address,
      created_at: user.created_at,
      profile: user.profile,
      stats: {
        followers: user._count.followers,
        following: user._count.following,
        generations: generationCount,
        total_likes: totalLikes,
      },
    });
  } catch (error) {
    console.error("Profile fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch profile" }, { status: 500 });
  }
}
