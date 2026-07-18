import { generatePetReactions } from "@/lib/agents";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { rateLimit } from "@/lib/rateLimit";
import { publicGenerationWhere } from "@/lib/publicFeed";
import { NextRequest, NextResponse } from "next/server";

// audit H9: each call fans out a PAID LLM completion per active pet per
// generation id. It must NOT be callable anonymously (was a free, unbounded
// cost-amplification / economic-DoS surface). Allow the internal cron
// (CRON_SECRET) or an authenticated user, rate-limit, and bound the batch.
async function authorize(req: NextRequest): Promise<NextResponse | null> {
  const secret = process.env.CRON_SECRET;
  const provided =
    (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim() ||
    (req.headers.get("x-cron-secret") || "").trim();
  if (secret && provided && provided === secret) return null; // internal cron runner

  const user = await getUser(req).catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rl = rateLimit(req, { key: "agents-react", limit: 10, windowMs: 60_000 });
  if (!rl.ok) return rl.response;
  return null;
}

// POST: Trigger agent reactions for specific generations
export async function POST(req: NextRequest) {
  try {
    const gate = await authorize(req);
    if (gate) return gate;

    const body = await req.json().catch(() => ({}));
    const ids = Array.isArray(body?.generation_ids)
      ? body.generation_ids.slice(0, 10) // bound the fan-out
      : [];
    const result = await generatePetReactions(ids);
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Agent react error:", error);
    return NextResponse.json({ error: "Failed to generate reactions" }, { status: 500 });
  }
}

// GET: Lazy trigger for recent unreacted content
export async function GET(req: NextRequest) {
  try {
    const gate = await authorize(req);
    if (gate) return gate;

    const recentGens = await prisma.generation.findMany({
      where: await publicGenerationWhere(),
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
    return NextResponse.json({ error: "Failed to generate reactions" }, { status: 500 });
  }
}
