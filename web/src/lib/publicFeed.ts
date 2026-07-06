/**
 * Public-feed privacy guard for auto-generated daydream videos.
 *
 * The daydream-to-video cron turns a pet's PRIVATE inner insight (derived from
 * its pet_memories about the owner) into a video whose stored prompt embeds that
 * insight. Those rows must never surface in public feeds (gallery, showcase,
 * highlights, /c/[id] + its OG card) without the owner explicitly sharing —
 * the prompt text can leak personal memories.
 *
 * Marker: pet_insights.video_generation_id points at exactly the auto-generated
 * rows (set by the cron, never by user-initiated generations). No migration
 * needed. Volume is tiny (≤18/day by cron cap), so an id-list filter is fine;
 * revisit with a `source` column if auto-gen volume ever grows.
 */
import { prisma } from "@/lib/prisma";

/** Ids of generations that were auto-created from private daydream insights. */
export async function privateAutoGenIds(): Promise<number[]> {
  const rows = await prisma.petInsight.findMany({
    where: { video_generation_id: { not: null } },
    select: { video_generation_id: true },
  }).catch(() => [] as { video_generation_id: number | null }[]);
  return rows.map((r) => r.video_generation_id!).filter((n) => Number.isInteger(n));
}

/** True if this generation id is a private daydream auto-gen. */
export async function isPrivateAutoGen(generationId: number): Promise<boolean> {
  const row = await prisma.petInsight.findFirst({
    where: { video_generation_id: generationId },
    select: { id: true },
  }).catch(() => null);
  return !!row;
}
