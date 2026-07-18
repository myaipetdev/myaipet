import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { awardPointsCapped, DAILY_POINT_CAPS } from "@/lib/seasonRewards";
import { publicGenerationWhere } from "@/lib/publicFeed";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ generationId: string }> }
) {
  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { generationId } = await params;

    const generation = await prisma.generation.findFirst({
      where: await publicGenerationWhere({ id: Number(generationId) }),
    });

    if (!generation) {
      return NextResponse.json({ error: "Generation not found" }, { status: 404 });
    }

    const existingLike = await prisma.like.findFirst({
      where: {
        user_id: user.id,
        generation_id: Number(generationId),
      },
    });

    let liked: boolean;

    if (existingLike) {
      await prisma.like.delete({ where: { id: existingLike.id } });
      liked = false;
    } else {
      await prisma.like.create({
        data: {
          user_id: user.id,
          generation_id: Number(generationId),
        },
      });
      liked = true;
    }

    const likes_count = await prisma.like.count({
      where: { generation_id: Number(generationId) },
    });

    // Record high-engagement milestones idempotently. Optional chain anchoring
    // stays fire-and-forget so it never delays the like response.
    if (liked && likes_count >= 50 && likes_count % 10 === 0) {
      import("@/lib/petclaw/nft-mint").then(({ recordTopContentMilestone }) =>
        recordTopContentMilestone(Number(generationId))
      ).catch((e) => console.error("[like] content milestone failed:", e?.message));
    }

    // Engagement reward: when someone likes your creation, the AUTHOR earns a
    // little season standing (capped; no self-like farming).
    if (liked && generation.user_id && generation.user_id !== user.id) {
      await awardPointsCapped(generation.user_id, "community", 1, DAILY_POINT_CAPS.community).catch(() => {});
    }

    return NextResponse.json({ liked, likes_count });
  } catch (error) {
    console.error("Like toggle error:", error);
    return NextResponse.json({ error: "Failed to toggle like" }, { status: 500 });
  }
}
