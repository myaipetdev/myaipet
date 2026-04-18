import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ petId: string }> }
) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { petId } = await params;
    const pet = await prisma.pet.findFirst({
      where: { id: Number(petId), user_id: user.id, is_active: true },
    });
    if (!pet) return NextResponse.json({ error: "Pet not found" }, { status: 404 });

    // Parse query params
    const { searchParams } = new URL(req.url);
    const platform = searchParams.get("platform");
    const limit = Math.min(Math.max(Number(searchParams.get("limit")) || 50, 1), 100);
    const offset = Math.max(Number(searchParams.get("offset")) || 0, 0);

    // Build where clause
    const where: Record<string, any> = { pet_id: pet.id };
    if (platform && ["telegram", "twitter"].includes(platform)) {
      where.platform = platform;
    }

    const [messages, total] = await Promise.all([
      prisma.petAgentMessage.findMany({
        where,
        orderBy: { created_at: "desc" },
        skip: offset,
        take: limit,
        select: {
          id: true,
          platform: true,
          direction: true,
          message_type: true,
          content: true,
          platform_msg_id: true,
          chat_id: true,
          credits_used: true,
          metadata: true,
          created_at: true,
        },
      }),
      prisma.petAgentMessage.count({ where }),
    ]);

    return NextResponse.json({
      messages,
      pagination: {
        total,
        limit,
        offset,
        has_more: offset + limit < total,
      },
    });
  } catch (error: any) {
    console.error("Agent messages error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
