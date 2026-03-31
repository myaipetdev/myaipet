import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  try {
    const generations = await prisma.generation.groupBy({
      by: ["chain"],
      _count: { id: true },
    });

    const total = generations.reduce((sum, g) => sum + g._count.id, 0);

    const result = generations.map((g) => ({
      chain: g.chain,
      count: g._count.id,
      percentage: total > 0 ? Math.round((g._count.id / total) * 10000) / 100 : 0,
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error("Analytics chains error:", error);
    return NextResponse.json({ error: "Failed to fetch chain analytics" }, { status: 500 });
  }
}
