import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  try {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    const [
      total_users,
      total_generations,
      users_last_7,
      users_prev_7,
      generations_last_7,
      generations_prev_7,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.generation.count({ where: { status: "completed" } }),
      prisma.user.count({
        where: { created_at: { gte: sevenDaysAgo } },
      }),
      prisma.user.count({
        where: {
          created_at: { gte: fourteenDaysAgo, lt: sevenDaysAgo },
        },
      }),
      prisma.generation.count({
        where: {
          status: "completed",
          created_at: { gte: sevenDaysAgo },
        },
      }),
      prisma.generation.count({
        where: {
          status: "completed",
          created_at: { gte: fourteenDaysAgo, lt: sevenDaysAgo },
        },
      }),
    ]);

    const weekly_change_users = users_prev_7 === 0
      ? (users_last_7 > 0 ? 100 : 0)
      : Math.round(((users_last_7 - users_prev_7) / users_prev_7) * 100);

    const weekly_change_generations = generations_prev_7 === 0
      ? (generations_last_7 > 0 ? 100 : 0)
      : Math.round(((generations_last_7 - generations_prev_7) / generations_prev_7) * 100);

    return NextResponse.json({
      total_users,
      total_generations,
      weekly_change_users,
      weekly_change_generations,
    });
  } catch (error) {
    console.error("Analytics stats error:", error);
    return NextResponse.json({ error: "Failed to fetch analytics stats" }, { status: 500 });
  }
}
