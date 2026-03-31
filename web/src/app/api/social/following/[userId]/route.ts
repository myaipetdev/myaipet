import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId } = await params;

    const following = await prisma.follow.findMany({
      where: { follower_id: Number(userId) },
      include: {
        following: {
          select: {
            id: true,
            wallet_address: true,
          },
        },
      },
    });

    const result = following.map((f: any) => ({
      id: f.following.id,
      wallet_address: f.following.wallet_address,
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error("Following fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch following" }, { status: 500 });
  }
}
