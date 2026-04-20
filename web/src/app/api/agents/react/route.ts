import { generatePetReactions } from "@/lib/agents";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

// POST: Trigger agent reactions for specific generations
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { generation_ids } = body;
    const result = await generatePetReactions(generation_ids || []);
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Agent react error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// GET: Lazy trigger for recent unreacted content
export async function GET() {
  try {
    const recentGens = await prisma.generation.findMany({
      where: { status: "completed" },
      orderBy: { created_at: "desc" },
      take: 5,
      select: { id: true },
    });

    if (recentGens.length === 0) {
      return NextResponse.json({ reactions: 0 });
    }

    const result = await generatePetReactions(recentGens.map((g: any) => g.id));
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Agent lazy react error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
