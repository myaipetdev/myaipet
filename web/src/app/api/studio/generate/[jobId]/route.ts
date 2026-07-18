/**
 * Poll a Studio generation by job ID (FAL request_id) or generation row ID.
 *
 *   GET /api/studio/generate/[jobId]
 *
 * Returns the current status + final URL when ready. If the job is owned by
 * a different user, returns 403. Updates the generations row on transition
 * so the next poll is cached.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { getModel } from "@/lib/studio/providers";
import { pollBackend } from "@/lib/studio/backend";
import { MODELS } from "@/lib/studio/providers";
import { persistGenerationMediaExactlyOnce } from "@/lib/services/generation-media";
import { failGenerationAndRefund } from "@/lib/generationSettlement";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { jobId } = await params;

  // jobId can be either a Generation.id (number) or fal_request_id (string).
  // The fal_request_id is stored as "<modelId>::<upstreamId>" (see generate
  // route); the caller may pass either the tagged form or a bare upstream id.
  const gen = /^\d+$/.test(jobId)
    ? await prisma.generation.findFirst({ where: { id: Number(jobId), user_id: user.id } })
    : await prisma.generation.findFirst({
        where: {
          user_id: user.id,
          OR: [
            { fal_request_id: jobId },
            // bare upstream id passed by a client that dropped the tag
            { fal_request_id: { endsWith: `::${jobId}` } },
          ],
        },
      });

  if (!gen) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Already done — return cached
  if (gen.status === "completed") {
    return NextResponse.json({
      status: "completed",
      url: gen.video_path || gen.photo_path,
      generationId: gen.id,
    });
  }
  if (gen.status === "failed") {
    return NextResponse.json({
      status: "failed",
      error: gen.error_message,
      generationId: gen.id,
    });
  }
  if (
    gen.status === "persisting" &&
    gen.completed_at &&
    Date.now() - gen.completed_at.getTime() < 2 * 60_000
  ) {
    return NextResponse.json({ status: "running", generationId: gen.id });
  }
  if (!gen.fal_request_id) {
    return NextResponse.json({ status: gen.status, generationId: gen.id });
  }

  // The model id is encoded onto fal_request_id as "<modelId>::<upstreamId>"
  // (no model_id column exists and we can't add a migration). Decode it so we
  // poll ONLY the originating provider instead of brute-forcing every model.
  const sepIdx = gen.fal_request_id.indexOf("::");
  const taggedModelId = sepIdx > 0 ? gen.fal_request_id.slice(0, sepIdx) : null;
  const upstreamId = sepIdx > 0 ? gen.fal_request_id.slice(sepIdx + 2) : gen.fal_request_id;
  const taggedModel = taggedModelId ? getModel(taggedModelId) : null;

  // Targeted poll when we know the model; otherwise (legacy untagged rows)
  // fall back to a DETERMINISTIC scan that short-circuits on first success.
  const candidates = taggedModel ? [taggedModel] : MODELS;

  for (const model of candidates) {
    const r = await pollBackend(model, upstreamId);
    if (r.status === "completed" && r.url) {
      // Never store an upstream public URL for a private-by-default creation.
      let persisted;
      try {
        persisted = await persistGenerationMediaExactlyOnce({
          generationId: gen.id,
          upstreamUrl: r.url,
          kind: model.kind,
          claimableStatuses: ["pending", "running"],
          retryStatus: "running",
          prefix: model.kind === "video" ? "videos" : "generations",
        });
      } catch (e) {
        console.error("studio: private media persistence failed:", e);
        await failGenerationAndRefund({
          generationId: gen.id,
          ownerUserId: user.id,
          fromStatuses: ["pending", "running", "persisting"],
          errorMessage: "media persistence failed",
        });
        return NextResponse.json({ status: "failed", error: "Generation storage is temporarily unavailable", generationId: gen.id }, { status: 503 });
      }
      if (persisted.status === "busy") {
        return NextResponse.json({ status: "running", generationId: gen.id });
      }
      return NextResponse.json({ status: "completed", url: persisted.url, generationId: gen.id });
    }
    if (r.status === "failed") {
      // Legacy untagged rows scan every model — a "failed" there may just be
      // a poll URL mismatch, so keep trying the next candidate.
      if (!taggedModel) continue;
      // Tagged single-candidate job: the originating provider says it failed.
      // Without this the row stays "running" forever and the paying user polls
      // an eternal spinner. Mirror the POST route's submit-failure semantics:
      // mark failed + store the reason + refund the charged credits. The
      // status-guarded updateMany makes the transition (and refund) run exactly
      // once even if two polls race.
      const errMsg = r.error || "Generation failed upstream";
      await failGenerationAndRefund({
        generationId: gen.id,
        ownerUserId: user.id,
        fromStatuses: ["pending", "running", "persisting"],
        errorMessage: errMsg,
      });
      return NextResponse.json({ status: "failed", error: errMsg, generationId: gen.id });
    }
    if (r.status === "running") {
      return NextResponse.json({ status: "running", progress: r.progress, generationId: gen.id });
    }
  }

  return NextResponse.json({ status: gen.status, generationId: gen.id });
}
