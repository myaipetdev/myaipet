import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { checkGrokVideoStatus } from "@/lib/services/video";
import { persistGenerationMediaExactlyOnce } from "@/lib/services/generation-media";
import { triggerAgentReactions } from "@/lib/agents";
import { NextRequest, NextResponse } from "next/server";
import { failGenerationAndRefund } from "@/lib/generationSettlement";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const generation = await prisma.generation.findUnique({
      where: { id: Number(id), user_id: user.id },
    });

    if (!generation) {
      return NextResponse.json({ error: "Generation not found" }, { status: 404 });
    }

    // Timeout: fail generations stuck processing for over 24 hours
    const twentyFourHours = 24 * 60 * 60 * 1000;
    if (
      ["processing", "persisting"].includes(generation.status) &&
      !(
        generation.status === "persisting" &&
        generation.completed_at &&
        Date.now() - generation.completed_at.getTime() < 2 * 60_000
      ) &&
      new Date().getTime() - new Date(generation.created_at).getTime() > twentyFourHours
    ) {
      await failGenerationAndRefund({
        generationId: generation.id,
        ownerUserId: user.id,
        fromStatuses: ["processing", "persisting"],
        errorMessage: "Generation timed out",
      });
      const updated = await prisma.generation.findUnique({ where: { id: generation.id } });
      if (!updated) return NextResponse.json({ error: "Generation not found" }, { status: 404 });
      return NextResponse.json({
        id: updated.id,
        status: updated.status,
        video_path: updated.video_path,
        photo_path: updated.photo_path,
        error_message: updated.error_message,
        pet_type: updated.pet_type,
        style: updated.style,
        created_at: updated.created_at,
      });
    }

    // Another poller currently owns the persistence lease. Do not re-poll the
    // provider or risk racing its terminal transition; stale leases are retried
    // below after two minutes.
    if (
      generation.status === "persisting" &&
      generation.completed_at &&
      Date.now() - generation.completed_at.getTime() < 2 * 60_000
    ) {
      return NextResponse.json({
        id: generation.id,
        status: "processing",
        photo_path: generation.photo_path,
        pet_type: generation.pet_type,
        style: generation.style,
        created_at: generation.created_at,
      });
    }

    // Poll Grok while processing. `persisting` is a short DB-backed lease used
    // to keep concurrent browser/cron polls from storing the same result twice.
    if (["processing", "persisting"].includes(generation.status) && generation.fal_request_id) {
      const falResult = await checkGrokVideoStatus(generation.fal_request_id);

      if (falResult.status === "completed" && falResult.videoUrl) {
        let persisted;
        try {
          persisted = await persistGenerationMediaExactlyOnce({
            generationId: generation.id,
            upstreamUrl: falResult.videoUrl,
            kind: "video",
            claimableStatuses: ["processing"],
            retryStatus: "processing",
            prefix: "videos",
          });
        } catch (error) {
          console.error("Generation completed but private persistence failed:", error);
          return NextResponse.json({ error: "Media persistence temporarily unavailable" }, { status: 503 });
        }

        if (persisted.status === "busy") {
          return NextResponse.json({
            id: generation.id,
            status: "processing",
            photo_path: generation.photo_path,
            pet_type: generation.pet_type,
            style: generation.style,
            created_at: generation.created_at,
          });
        }

        if (persisted.newlyCompleted) triggerAgentReactions([generation.id]);

        return NextResponse.json({
          id: generation.id,
          status: "completed",
          video_path: persisted.url,
          photo_path: generation.photo_path,
          pet_type: generation.pet_type,
          style: generation.style,
          created_at: generation.created_at,
          completed_at: new Date(),
        });
      }

      if (falResult.status === "failed") {
        await failGenerationAndRefund({
          generationId: generation.id,
          ownerUserId: user.id,
          fromStatuses: ["processing", "persisting"],
          errorMessage: falResult.error || "Video generation failed",
        });
        const updated = await prisma.generation.findUnique({ where: { id: generation.id } });
        if (!updated) return NextResponse.json({ error: "Generation not found" }, { status: 404 });
        return NextResponse.json({
          id: updated.id,
          status: updated.status,
          video_path: updated.video_path,
          error_message: updated.error_message,
          pet_type: updated.pet_type,
          style: updated.style,
          created_at: updated.created_at,
        });
      }

      // Still processing
      return NextResponse.json({
        id: generation.id,
        status: "processing",
        photo_path: generation.photo_path,
        pet_type: generation.pet_type,
        style: generation.style,
        created_at: generation.created_at,
      });
    }

    return NextResponse.json({
      id: generation.id,
      status: generation.status,
      video_path: generation.video_path,
      photo_path: generation.photo_path,
      error_message: generation.error_message,
      pet_type: generation.pet_type,
      style: generation.style,
      created_at: generation.created_at,
      completed_at: generation.completed_at,
    });
  } catch (error) {
    console.error("Generation status error:", error);
    return NextResponse.json({ error: "Failed to fetch generation status" }, { status: 500 });
  }
}
