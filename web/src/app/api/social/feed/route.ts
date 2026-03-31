import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { triggerAgentReactions } from "@/lib/agents";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const page_size = Math.min(100, Math.max(1, parseInt(searchParams.get("page_size") || "20")));
    const pet_type = searchParams.get("pet_type");
    const sort = searchParams.get("sort") || "recent";

    const user = await getUser(req).catch(() => null);

    const where: any = {
      status: "completed",
      OR: [
        { photo_path: { not: "" } },
        { video_path: { not: "" } },
      ],
    };

    if (pet_type) where.pet_type = pet_type;

    let orderBy: any;
    switch (sort) {
      case "trending":
        orderBy = [{ likes: { _count: "desc" } }, { created_at: "desc" }];
        break;
      case "most_liked":
        orderBy = [{ likes: { _count: "desc" } }];
        break;
      default:
        orderBy = { created_at: "desc" };
    }

    const [items, total] = await Promise.all([
      prisma.generation.findMany({
        where,
        orderBy,
        skip: (page - 1) * page_size,
        take: page_size,
        include: {
          user: {
            select: {
              wallet_address: true,
              profile: {
                select: { display_name: true },
              },
            },
          },
          _count: {
            select: {
              likes: true,
              comments: true,
            },
          },
          ...(user
            ? {
                likes: {
                  where: { user_id: user.id },
                  select: { id: true },
                },
              }
            : {}),
        },
      }),
      prisma.generation.count({ where }),
    ]);

    const formatted = items.map((item: any) => {
      const w = item.user?.wallet_address || "";
      const truncated_wallet = w
        ? `0x${w.slice(2, 6)}...${w.slice(-4)}`
        : null;

      return {
        id: item.id,
        pet_type: item.pet_type,
        style: item.style,
        prompt: item.prompt,
        photo_path: item.photo_path,
        photo_url: item.photo_path,
        video_path: item.video_path,
        video_url: item.video_path,
        duration: item.duration,
        gen_type: item.video_path ? "video" : "image",
        created_at: item.created_at,
        wallet_address: truncated_wallet,
        display_name: item.user?.profile?.display_name || null,
        likes_count: item._count.likes,
        comments_count: item._count.comments,
        is_liked: user ? item.likes?.length > 0 : false,
      };
    });

    // Lazy trigger: generate pet reactions for displayed content (fire-and-forget)
    if (items.length > 0) {
      triggerAgentReactions(items.map((i: any) => i.id));
    }

    return NextResponse.json({ items: formatted, total, page, page_size });
  } catch (error: any) {
    console.error("Social feed error:", error);
    return NextResponse.json({
      error: "Failed to fetch social feed",
      details: error.message,
    }, { status: 500 });
  }
}
