import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = req.nextUrl;
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const page_size = Math.min(100, Math.max(1, parseInt(searchParams.get("page_size") || "20")));

    const where = { user_id: user.id };

    const [items, total] = await Promise.all([
      prisma.generation.findMany({
        where,
        orderBy: { created_at: "desc" },
        skip: (page - 1) * page_size,
        take: page_size,
      }),
      prisma.generation.count({ where }),
    ]);

    return NextResponse.json({ items, total, page, page_size });
  } catch (error) {
    console.error("Generation history error:", error);
    return NextResponse.json({ error: "Failed to fetch generation history" }, { status: 500 });
  }
}
