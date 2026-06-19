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
import { saveRemoteFile } from "@/lib/storage";

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
      // Upstream URLs expire within hours — persist to permanent storage BEFORE
      // saving so History + public /c/<id> share links don't rot. Fall back to
      // the raw URL only if the copy fails.
      let persistedUrl = r.url;
      try {
        persistedUrl = await saveRemoteFile(r.url, "generations");
      } catch (e) {
        console.error("studio: saveRemoteFile (poll) failed, using raw URL:", e);
      }
      await prisma.generation.update({
        where: { id: gen.id },
        data: {
          status: "completed",
          video_path: model.kind === "video" ? persistedUrl : null,
          photo_path: model.kind === "image" ? persistedUrl : gen.photo_path,
          completed_at: new Date(),
        },
      });
      return NextResponse.json({ status: "completed", url: persistedUrl, generationId: gen.id });
    }
    if (r.status === "failed") continue; // try next model — might be a poll URL mismatch
    if (r.status === "running") {
      return NextResponse.json({ status: "running", progress: r.progress, generationId: gen.id });
    }
  }

  return NextResponse.json({ status: gen.status, generationId: gen.id });
}
