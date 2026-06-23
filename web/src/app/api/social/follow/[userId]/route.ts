import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { awardPointsCapped, DAILY_POINT_CAPS } from "@/lib/seasonRewards";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { userId } = await params;

    if (user.id === Number(userId)) {
      return NextResponse.json({ error: "Cannot follow yourself" }, { status: 400 });
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: Number(userId) },
    });

    if (!targetUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const existingFollow = await prisma.follow.findFirst({
      where: {
        follower_id: user.id,
        following_id: Number(userId),
      },
    });

    let following: boolean;

    if (existingFollow) {
      await prisma.follow.delete({ where: { id: existingFollow.id } });
      following = false;
    } else {
      await prisma.follow.create({
        data: {
          follower_id: user.id,
          following_id: Number(userId),
        },
      });
      following = true;
    }

    // Gaining a follower is community standing for the FOLLOWED user (capped;
    // self-follow already rejected above).
    if (following) {
      await awardPointsCapped(Number(userId), "community", 2, DAILY_POINT_CAPS.community).catch(() => {});
    }

    return NextResponse.json({ following });
  } catch (error) {
    console.error("Follow toggle error:", error);
    return NextResponse.json({ error: "Failed to toggle follow" }, { status: 500 });
  }
}
