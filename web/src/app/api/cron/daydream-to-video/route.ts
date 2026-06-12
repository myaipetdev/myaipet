/**
 * POST /api/cron/daydream-to-video?cron=1   (header: x-cron-secret: $CRON_SECRET)
 *
 * Turns the best fresh daydream insights into short auto-generated videos —
 * "content only we can make" because it's seeded by the pet's memory ledger.
 *
 * Two phases per tick:
 *   1. Settle in-flight jobs from previous ticks (poll Grok video status,
 *      persist the finished video, mark the Generation completed/failed).
 *   2. Pick up to MAX_NEW unconverted insights (score >= MIN_SCORE, fresh,
 *      one per pet, per-pet cooldown), convert insight → visual scene via
 *      grok-3-mini, build the pet-anchored prompt, submit a 5s video, and
 *      link the insight to the new Generation row.
 *
 * Cost posture: auto-videos are platform-funded (credits_charged = 0) and the
 * per-tick MAX_NEW + per-pet cooldown are the spending ceiling. ?dry=1 runs
 * selection + prompt building but submits nothing (for safe testing).
 *
 * Suggested cadence: every 4h (see deploy/crontab.example).
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyCron } from "@/lib/cronAuth";
import { isFetchableImageUrl } from "@/lib/sanitize";
import {
  buildPetPrompt,
  submitGrokVideo,
  checkGrokVideoStatus,
} from "@/lib/services/video";

const MAX_NEW = 3;             // new submissions per tick — hard spend ceiling
const MIN_SCORE = 7;           // only the critic's best daydreams become videos
const INSIGHT_WINDOW_H = 48;   // convert only fresh insights
const PET_COOLDOWN_DAYS = 3;   // at most one auto-video per pet per N days
const DURATION_SEC = 5;
const SETTLE_LIMIT = 10;       // in-flight jobs polled per tick

interface Candidate {
  insight_id: number;
  insight: string;
  mood: string;
  pet_id: number;
  user_id: number;
  name: string;
  species: number;
  personality_type: string;
  avatar_url: string | null;
  appearance_desc: string | null;
}

/** Insight (1st-person inner thought) → concrete third-person visual scene. */
async function insightToScene(c: Candidate): Promise<string> {
  const key = process.env.GROK_API_KEY;
  const fallback = `${c.name} quietly reminiscing about their owner, ${c.mood} mood, cozy familiar setting`;
  if (!key) return fallback;
  try {
    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "grok-3-mini",
        messages: [
          {
            role: "system",
            content:
              "You are a creative director for short heartwarming pet videos. " +
              "Convert the pet's inner thought about its owner into ONE concrete, filmable " +
              "third-person scene starring the pet (no human faces). Include setting, the pet's " +
              "action, mood and lighting. Max 45 words. Output ONLY the scene description.",
          },
          {
            role: "user",
            content:
              `Pet: ${c.name}${c.appearance_desc ? ` (${c.appearance_desc})` : ""}. ` +
              `Mood: ${c.mood}. Inner thought: "${c.insight}"`,
          },
        ],
        max_tokens: 120,
        temperature: 0.8,
      }),
    });
    if (!res.ok) return fallback;
    const d = await res.json();
    const out = d?.choices?.[0]?.message?.content?.trim();
    return out ? out.slice(0, 400) : fallback;
  } catch {
    return fallback;
  }
}

export async function POST(req: NextRequest) {
  const denied = verifyCron(req);
  if (denied) return denied;

  const dry = req.nextUrl.searchParams.get("dry") === "1";

  // ── Phase 1: settle in-flight auto-generations from previous ticks ──
  let settledCompleted = 0, settledFailed = 0, stillProcessing = 0;
  if (!dry) {
    const inflight = await prisma.$queryRaw<Array<{ id: number; fal_request_id: string }>>`
      SELECT g.id, g.fal_request_id
      FROM generations g
      JOIN pet_insights pi ON pi.video_generation_id = g.id
      WHERE g.status IN ('pending', 'processing')
        AND g.fal_request_id IS NOT NULL
      ORDER BY g.created_at ASC
      LIMIT ${SETTLE_LIMIT}`;

    for (const job of inflight) {
      try {
        const st = await checkGrokVideoStatus(job.fal_request_id);
        if (st.status === "completed" && st.videoUrl) {
          await prisma.generation.update({
            where: { id: job.id },
            data: { status: "completed", video_path: st.videoUrl, completed_at: new Date() },
          });
          settledCompleted++;
        } else if (st.status === "failed") {
          await prisma.generation.update({
            where: { id: job.id },
            data: { status: "failed", error_message: (st.error || "video failed").slice(0, 500) },
          });
          settledFailed++;
        } else {
          stillProcessing++;
        }
      } catch { stillProcessing++; }
    }
  }

  // ── Phase 2: pick fresh, unconverted, high-scoring insights ──
  const windowStart = new Date(Date.now() - INSIGHT_WINDOW_H * 3_600_000);
  const cooldownStart = new Date(Date.now() - PET_COOLDOWN_DAYS * 86_400_000);

  const rows = await prisma.$queryRaw<Candidate[]>`
    SELECT pi.id AS insight_id, pi.insight, pi.mood, pi.pet_id,
           p.user_id, p.name, p.species, p.personality_type,
           p.avatar_url, p.appearance_desc
    FROM pet_insights pi
    JOIN pets p ON p.id = pi.pet_id
    WHERE pi.video_generation_id IS NULL
      AND pi.score >= ${MIN_SCORE}
      AND pi.created_at >= ${windowStart}
      AND p.is_active = true
      AND NOT EXISTS (
        SELECT 1
        FROM pet_insights pi2
        JOIN generations g2 ON g2.id = pi2.video_generation_id
        WHERE pi2.pet_id = pi.pet_id
          AND g2.created_at >= ${cooldownStart}
      )
    ORDER BY pi.score DESC, pi.created_at DESC
    LIMIT ${MAX_NEW * 3}`;

  // One insight per pet per tick, capped at MAX_NEW.
  const seenPets = new Set<number>();
  const picked: Candidate[] = [];
  for (const r of rows) {
    if (seenPets.has(r.pet_id)) continue;
    seenPets.add(r.pet_id);
    picked.push(r);
    if (picked.length >= MAX_NEW) break;
  }

  const submitted: Array<{ insightId: number; petId: number; generationId?: number; prompt: string }> = [];
  const errors: string[] = [];

  for (const c of picked) {
    try {
      const scene = await insightToScene(c);
      const prompt = buildPetPrompt(
        c.name, c.species, c.personality_type,
        /* style: cinematic */ 1,
        scene,
        c.avatar_url || undefined,
        c.appearance_desc || undefined,
      );

      if (dry) {
        submitted.push({ insightId: c.insight_id, petId: c.pet_id, prompt });
        continue;
      }

      // Identity anchor: pass the avatar as image-to-video reference only when
      // it's a publicly fetchable URL (SSRF-guarded; local /uploads paths are
      // unreachable for the provider).
      let anchor: string | undefined;
      if (c.avatar_url && /^https?:\/\//i.test(c.avatar_url) && (await isFetchableImageUrl(c.avatar_url))) {
        anchor = c.avatar_url;
      }

      const { requestId } = await submitGrokVideo(prompt, DURATION_SEC, anchor);

      const gen = await prisma.generation.create({
        data: {
          user_id: c.user_id,
          pet_type: c.species,
          style: 1,
          prompt,
          duration: DURATION_SEC,
          photo_path: c.avatar_url || "",
          status: "processing",
          fal_request_id: requestId,
          credits_charged: 0, // platform-funded daydream content
        },
      });

      await prisma.petInsight.update({
        where: { id: c.insight_id },
        data: { video_generation_id: gen.id },
      });

      submitted.push({ insightId: c.insight_id, petId: c.pet_id, generationId: gen.id, prompt });
    } catch (e: any) {
      errors.push(`insight ${c.insight_id}: ${(e?.message || "failed").slice(0, 120)}`);
    }
  }

  return NextResponse.json({
    ok: true,
    dry,
    settled: { completed: settledCompleted, failed: settledFailed, processing: stillProcessing },
    candidates: rows.length,
    submitted,
    errors,
  });
}
