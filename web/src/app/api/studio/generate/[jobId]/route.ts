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

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { jobId } = await params;

  // jobId can be either a Generation.id (number) or fal_request_id (string)
  const gen = /^\d+$/.test(jobId)
    ? await prisma.generation.findFirst({ where: { id: Number(jobId), user_id: user.id } })
    : await prisma.generation.findFirst({ where: { fal_request_id: jobId, user_id: user.id } });

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

  // Need to know which model was used. We stored the upstream job id but not
  // the model row. Best-effort: try each backend model until one resolves.
  // For tighter coupling we could add a model_id column on generations —
  // future refactor.
  for (const model of MODELS) {
    const r = await pollBackend(model, gen.fal_request_id);
    if (r.status === "completed" && r.url) {
      await prisma.generation.update({
        where: { id: gen.id },
        data: {
          status: "completed",
          video_path: model.kind === "video" ? r.url : null,
          photo_path: model.kind === "image" ? r.url : gen.photo_path,
          completed_at: new Date(),
        },
      });
      return NextResponse.json({ status: "completed", url: r.url, generationId: gen.id });
    }
    if (r.status === "failed") continue; // try next model — might be a poll URL mismatch
    if (r.status === "running") {
      return NextResponse.json({ status: "running", progress: r.progress, generationId: gen.id });
    }
  }

  return NextResponse.json({ status: gen.status, generationId: gen.id });
}

// Suppress unused import warning for getModel — kept for future tighter coupling
void getModel;
