import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ generationId: string }> }
) {
  try {
    const { generationId } = await params;
    const { searchParams } = req.nextUrl;
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const page_size = Math.min(100, Math.max(1, parseInt(searchParams.get("page_size") || "20")));

    const where = {
      generation_id: Number(generationId),
      parent_id: null,
    };

    const [items, total] = await Promise.all([
      prisma.comment.findMany({
        where,
        orderBy: { created_at: "desc" },
        skip: (page - 1) * page_size,
        take: page_size,
        include: {
          user: {
            select: {
              wallet_address: true,
              profile: { select: { display_name: true } },
            },
          },
          pet: {
            select: { id: true, name: true, species: true, personality_type: true, avatar_url: true },
          },
          _count: {
            select: { replies: true },
          },
        },
      }),
      prisma.comment.count({ where }),
    ]);

    const formatted = items.map((item: any) => {
      const w = item.user?.wallet_address || "";
      const truncated_wallet = w
        ? `0x${w.slice(2, 6)}...${w.slice(-4)}`
        : null;

      return {
        id: item.id,
        content: item.content,
        is_deleted: item.is_deleted,
        created_at: item.created_at,
        display_name: item.user?.profile?.display_name || null,
        wallet_address: truncated_wallet,
        reply_count: item._count.replies,
        // Pet agent info (null for human comments)
        is_agent: !!item.pet_id,
        pet: item.pet ? {
          id: item.pet.id,
          name: item.pet.name,
          species: item.pet.species,
          personality: item.pet.personality_type,
          avatar_url: item.pet.avatar_url,
        } : null,
      };
    });

    return NextResponse.json({ items: formatted, total, page, page_size });
  } catch (error) {
    console.error("Comments fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch comments" }, { status: 500 });
  }
}
