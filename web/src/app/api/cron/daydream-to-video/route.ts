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
 * per-tick MAX_NEW + per-pet cooldown are the spending ceiling. ?dry=1 returns
 * a sanitized local eligibility preview: no retained text, provider request,
 * durable claim, or database mutation.
 *
 * Suggested cadence: every 4h (see deploy/crontab.example).
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyCron } from "@/lib/cronAuth";
import { callLLM } from "@/lib/llm/router";
import { generatedEnglishOrFallback } from "@/lib/generatedLanguage";
import { persistGenerationMediaExactlyOnce } from "@/lib/services/generation-media";
import { prepareVisionImageInput } from "@/lib/services/vision-image";
import { providerSafeStoredText } from "@/lib/petclaw/provider-safe-text";
import {
  claimNextDaydreamVideoCandidate,
  commitDaydreamVideoSubmission,
  DAYDREAM_VIDEO_SOURCE_KIND,
  expireStaleDaydreamVideoClaims,
  isDaydreamVideoClaimCurrent,
  listDaydreamVideoCandidateRefs,
  releaseDaydreamVideoClaim,
  type DaydreamVideoClaim,
} from "@/lib/petclaw/memory/daydream-video-claim";
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
const CLAIM_TTL_MS = 30 * 60 * 1000;

/** Insight (1st-person inner thought) → concrete third-person visual scene. */
async function insightToScene(c: DaydreamVideoClaim): Promise<string> {
  const fallback = `A beloved pet quietly reminiscing about their owner in a cozy familiar setting with warm, gentle lighting.`;
  const petName = providerSafeStoredText(c.petName, "pet_name", 50) || "the pet";
  const appearance = providerSafeStoredText(c.appearanceDesc, "appearance", 2_000) || "";
  const mood = providerSafeStoredText(c.mood, "mood", 40) || "reflective";
  const insight = providerSafeStoredText(c.insight, "retained_insight", 1_200);
  if (!insight) return fallback;
  try {
    const result = await callLLM({
      task: "chat",
      petId: c.petId,
      messages: [
        {
          role: "system",
          content:
            "You are a creative director for short heartwarming pet videos. " +
            "Convert the pet's inner thought about its owner into ONE concrete, filmable " +
            "third-person scene starring the pet (no human faces). Include setting, the pet's " +
            "action, mood and lighting. Write in English only and never output Hangul. Max 45 words. Output ONLY the scene description.",
        },
        {
          role: "user",
          content:
            `Pet: ${petName}${appearance ? ` (${appearance})` : ""}. ` +
            `Mood: ${mood}. Inner thought: "${insight}"`,
        },
      ],
      max_tokens: 120,
      temperature: 0.8,
    });
    return generatedEnglishOrFallback(result.text, fallback).slice(0, 400);
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
  let staleClaimsRecovered = 0;
  if (!dry) {
    staleClaimsRecovered = await expireStaleDaydreamVideoClaims(
      CLAIM_TTL_MS,
      SETTLE_LIMIT,
    );
    const inflight = await prisma.$queryRaw<Array<{ id: number; insight_id: number; fal_request_id: string; status: string; completed_at: Date | null }>>`
      SELECT g.id, pi.id AS insight_id, g.fal_request_id, g.status, g.completed_at
      FROM generations g
      JOIN pet_insights pi ON pi.video_generation_id = g.id
      WHERE g.status IN ('pending', 'processing', 'persisting')
        AND g.source_kind = ${DAYDREAM_VIDEO_SOURCE_KIND}
        AND pi.conversion_status = 'submitted'
        AND g.fal_request_id IS NOT NULL
      ORDER BY g.created_at ASC
      LIMIT ${SETTLE_LIMIT}`;

    for (const job of inflight) {
      try {
        if (
          job.status === "persisting" &&
          job.completed_at &&
          Date.now() - new Date(job.completed_at).getTime() < 2 * 60_000
        ) {
          stillProcessing++;
          continue;
        }
        const st = await checkGrokVideoStatus(job.fal_request_id);
        if (st.status === "completed" && st.videoUrl) {
          const persisted = await persistGenerationMediaExactlyOnce({
            generationId: job.id,
            upstreamUrl: st.videoUrl,
            kind: "video",
            claimableStatuses: ["pending", "processing"],
            retryStatus: "processing",
            prefix: "videos",
          });
          if (persisted.status === "completed") {
            await prisma.petInsight.updateMany({
              where: {
                id: job.insight_id,
                video_generation_id: job.id,
                conversion_status: "submitted",
              },
              data: {
                conversion_status: "converted",
                conversion_claimed_at: null,
                conversion_error: null,
              },
            });
            settledCompleted++;
          } else stillProcessing++;
        } else if (st.status === "failed") {
          await prisma.generation.updateMany({
            where: { id: job.id, status: { in: ["pending", "processing", "persisting"] } },
            data: { status: "failed", error_message: (st.error || "video failed").slice(0, 500) },
          });
          await prisma.petInsight.updateMany({
            where: {
              id: job.insight_id,
              video_generation_id: job.id,
              conversion_status: "submitted",
            },
            data: {
              conversion_status: "failed",
              conversion_claimed_at: null,
              conversion_error: (st.error || "video failed").slice(0, 500),
            },
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

  const claimOptions = { minScore: MIN_SCORE, windowStart, cooldownStart };
  if (dry) {
    const preview = await listDaydreamVideoCandidateRefs(claimOptions, MAX_NEW);
    return NextResponse.json({
      ok: true,
      dry: true,
      providerRequests: 0,
      mutations: 0,
      settled: { completed: 0, failed: 0, processing: 0 },
      staleClaimsRecovered: 0,
      candidates: preview.length,
      preview,
      submitted: [],
      errors: [],
    });
  }

  const submitted: Array<{
    insightId: number;
    petId: number;
    generationId: number;
    requestId: string;
  }> = [];
  const errors: string[] = [];
  let claimed = 0, discarded = 0;

  for (let slot = 0; slot < MAX_NEW; slot++) {
    const c = await claimNextDaydreamVideoCandidate(claimOptions);
    if (!c) break;
    claimed++;
    let videoSubmissionStarted = false;
    try {
      // A deletion/correction after the durable claim revokes it before any
      // retained insight reaches the scene LLM.
      if (!(await isDaydreamVideoClaimCurrent(c))) {
        await releaseDaydreamVideoClaim(c, "Memory changed before scene synthesis.", {
          beforeVideoSubmission: true,
        });
        discarded++;
        continue;
      }
      const scene = await insightToScene(c);
      const petName = providerSafeStoredText(c.petName, "pet_name", 50) || "the pet";
      const appearance = providerSafeStoredText(c.appearanceDesc, "appearance", 2_000) || undefined;
      const personality = providerSafeStoredText(c.personalityType, "personality", 20) || "friendly";
      const prompt = buildPetPrompt(
        petName, c.species, personality,
        /* style: cinematic */ 1,
        scene,
        c.avatarUrl || undefined,
        appearance,
      );

      // Re-check after the scene LLM. Clear/correction during inference must
      // stop the more expensive video provider submission.
      if (!(await isDaydreamVideoClaimCurrent(c))) {
        await releaseDaydreamVideoClaim(c, "Memory changed during scene synthesis.", {
          beforeVideoSubmission: true,
        });
        discarded++;
        continue;
      }

      // Identity anchor: materialise private /uploads media (and bounded,
      // redirect-checked external media) into an inline data URI. The provider
      // never receives a private application path.
      let anchor: string | undefined;
      if (c.avatarUrl) {
        try {
          anchor = await prepareVisionImageInput(c.avatarUrl, { materializeExternal: true });
        } catch {
          // A missing identity anchor should not discard an otherwise valid
          // daydream; submit a prompt-only video instead.
        }
      }

      // Materialising an identity anchor can take time and perform bounded
      // network I/O, so take the epoch/claim fence once more immediately before
      // the paid video call.
      if (!(await isDaydreamVideoClaimCurrent(c))) {
        await releaseDaydreamVideoClaim(c, "Memory changed before video submission.", {
          beforeVideoSubmission: true,
        });
        discarded++;
        continue;
      }

      videoSubmissionStarted = true;
      const { requestId } = await submitGrokVideo(prompt, DURATION_SEC, anchor);
      const committed = await commitDaydreamVideoSubmission(c, requestId, prompt);
      if (committed.discarded) {
        discarded++;
        continue;
      }
      submitted.push({
        insightId: c.insightId,
        petId: c.petId,
        generationId: c.generationId,
        requestId,
      });
    } catch (e: any) {
      const message = (e?.message || "failed").slice(0, 120);
      const released = await releaseDaydreamVideoClaim(c, message, {
        beforeVideoSubmission: !videoSubmissionStarted,
      }).catch(() => ({ retry: videoSubmissionStarted ? "manual" as const : "scheduled" as const }));
      errors.push(`insight ${c.insightId}: ${message} (retry: ${released.retry})`);
    }
  }

  return NextResponse.json({
    ok: true,
    dry,
    settled: { completed: settledCompleted, failed: settledFailed, processing: stillProcessing },
    staleClaimsRecovered,
    candidates: claimed,
    claimed,
    discarded,
    submitted,
    errors,
  });
}
