import { prisma } from "@/lib/prisma";
import { privateAutoGenIds } from "@/lib/publicFeed";
import { getUser } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const page_size = Math.min(100, Math.max(1, parseInt(searchParams.get("page_size") || "20")));
    const pet_type = searchParams.get("pet_type");
    const style = searchParams.get("style");
    const sort = searchParams.get("sort") || "recent";

    const where: any = {
      status: "completed",
      OR: [
        { photo_path: { not: "" } },
        { video_path: { not: "" } },
      ],
      // Privacy: daydream auto-gens embed the pet's private inner insight in
      // their prompt — never list them publicly (see lib/publicFeed.ts).
      id: { notIn: await privateAutoGenIds() },
    };

    if (pet_type) where.pet_type = pet_type;
    if (style) where.style = style;

    const orderBy = sort === "oldest"
      ? { created_at: "asc" as const }
      : { created_at: "desc" as const };

    const [items, total] = await Promise.all([
      prisma.generation.findMany({
        where,
        orderBy,
        skip: (page - 1) * page_size,
        take: page_size,
        include: {
          user: {
            select: { wallet_address: true },
          },
        },
      }),
      prisma.generation.count({ where }),
    ]);

    const formatted = items.map((item: any) => {
      const w = item.user?.wallet_address || "";
      const truncated_wallet = w
        ? `0x${w.slice(2, 6)}...${w.slice(-4)}`
        : null;

      // Explicit public whitelist — `...item` used to leak user_id,
      // fal_request_id, error_message, tx_hash, and the raw prompt.
      return {
        id: item.id,
        pet_type: item.pet_type,
        style: item.style,
        duration: item.duration,
        photo_path: item.photo_path,
        video_path: item.video_path,
        status: item.status,
        created_at: item.created_at,
        completed_at: item.completed_at,
        likes: item.likes,
        comments: item.comments,
        _count: item._count,
        wallet_address: truncated_wallet,
      };
    });

    return NextResponse.json({ items: formatted, total, page, page_size });
  } catch (error) {
    console.error("Gallery fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch gallery" }, { status: 500 });
  }
}
