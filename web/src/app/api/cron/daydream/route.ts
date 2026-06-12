/**
 * POST /api/cron/daydream?cron=1   (header: x-cron-secret: $CRON_SECRET)
 *
 * Walks pets that have been active recently + have enough memories, and runs
 * a daydream cycle for each. Bounded so a single cron tick can't fan out into
 * hundreds of Grok calls — processes up to BATCH pets per invocation, oldest
 * daydream first.
 *
 * Suggested cadence: every 6h via crontab (see deploy/crontab.example).
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { daydream } from "@/lib/petclaw/memory/daydream";

const BATCH = 25;
const ACTIVE_WINDOW_DAYS = 14;

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret");
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const activeSince = new Date(Date.now() - ACTIVE_WINDOW_DAYS * 86_400_000);

  // Candidate pets: active recently. We further gate inside daydream() on
  // memory count, so pets with too few memories are cheap no-ops.
  const pets = await prisma.pet.findMany({
    where: { is_active: true, last_interaction_at: { gte: activeSince } },
    orderBy: { last_interaction_at: "desc" },
    take: BATCH,
    select: { id: true },
  });

  let created = 0, processed = 0;
  for (const p of pets) {
    try {
      const insights = await daydream(p.id);
      if (insights.length) {
        await prisma.petInsight.createMany({
          data: insights.map(ins => ({
            pet_id: p.id,
            insight: ins.insight,
            rationale: ins.rationale,
            mood: ins.mood,
            score: Math.round(ins.score),
            source_keys: ins.sourceKeys as any,
          })),
        });
        created += insights.length;
      }
      processed++;
    } catch { /* one bad pet shouldn't kill the batch */ }
  }

  return NextResponse.json({ ok: true, processed, created });
}
