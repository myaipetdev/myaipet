import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const days = Math.min(365, Math.max(1, parseInt(searchParams.get("days") || "20")));

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    const generations = await prisma.generation.findMany({
      where: {
        created_at: { gte: startDate },
      },
      select: { created_at: true },
    });

    const countMap: Record<string, number> = {};
    for (const gen of generations) {
      const dateStr = gen.created_at.toISOString().split("T")[0];
      countMap[dateStr] = (countMap[dateStr] || 0) + 1;
    }

    const result: { date: string; count: number }[] = [];
    const current = new Date(startDate);
    const now = new Date();
    now.setHours(23, 59, 59, 999);

    while (current <= now) {
      const dateStr = current.toISOString().split("T")[0];
      result.push({
        date: dateStr,
        count: countMap[dateStr] || 0,
      });
      current.setDate(current.getDate() + 1);
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Analytics daily error:", error);
    return NextResponse.json({ error: "Failed to fetch daily analytics" }, { status: 500 });
  }
}
