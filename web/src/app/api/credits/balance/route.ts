import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userData = await prisma.user.findUnique({
      where: { id: user.id },
      select: { credits: true, airdrop_points: true },
    });

    return NextResponse.json({
      credits: userData?.credits ?? 0,
      airdrop_points: userData?.airdrop_points ?? 0,
    });
  } catch (error) {
    console.error("Credits balance error:", error);
    return NextResponse.json({ error: "Failed to fetch credit balance" }, { status: 500 });
  }
}
