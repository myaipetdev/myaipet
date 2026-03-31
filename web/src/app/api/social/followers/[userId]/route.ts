import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId } = await params;

    const followers = await prisma.follow.findMany({
      where: { following_id: Number(userId) },
      include: {
        follower: {
          select: {
            id: true,
            wallet_address: true,
          },
        },
      },
    });

    const result = followers.map((f: any) => ({
      id: f.follower.id,
      wallet_address: f.follower.wallet_address,
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error("Followers fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch followers" }, { status: 500 });
  }
}
