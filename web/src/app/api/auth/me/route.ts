import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const user = await getUser(req);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const generationCount = await prisma.generation.count({
    where: { user_id: user.id },
  });

  return NextResponse.json({
    wallet_address: user.wallet_address,
    credits: user.credits,
    generation_count: generationCount,
    created_at: user.created_at,
  });
}
