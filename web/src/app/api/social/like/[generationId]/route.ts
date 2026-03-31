import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
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

    const generation = await prisma.generation.findUnique({
      where: { id: Number(generationId) },
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

    return NextResponse.json({ liked, likes_count });
  } catch (error) {
    console.error("Like toggle error:", error);
    return NextResponse.json({ error: "Failed to toggle like" }, { status: 500 });
  }
}
