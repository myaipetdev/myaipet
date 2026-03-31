import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { checkGrokVideoStatus } from "@/lib/services/video";
import { triggerAgentReactions } from "@/lib/agents";
import { NextRequest, NextResponse } from "next/server";

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
      generation.status === "processing" &&
      new Date().getTime() - new Date(generation.created_at).getTime() > twentyFourHours
    ) {
      const updated = await prisma.generation.update({
        where: { id: generation.id },
        data: {
          status: "failed",
          error_message: "Generation timed out",
        },
      });
      return NextResponse.json({
        id: updated.id,
        status: "failed",
        error_message: updated.error_message,
        pet_type: updated.pet_type,
        style: updated.style,
        created_at: updated.created_at,
      });
    }

    // If video is still processing and we have a FAL request ID, check FAL.ai
    if (generation.status === "processing" && generation.fal_request_id) {
      const falResult = await checkGrokVideoStatus(generation.fal_request_id);

      if (falResult.status === "completed" && falResult.videoUrl) {
        const updated = await prisma.generation.update({
          where: { id: generation.id },
          data: {
            status: "completed",
            video_path: falResult.videoUrl,
            completed_at: new Date(),
          },
        });

        // Fire-and-forget: trigger pet agent reactions
        triggerAgentReactions([updated.id]);

        return NextResponse.json({
          id: updated.id,
          status: "completed",
          video_path: updated.video_path,
          photo_path: updated.photo_path,
          pet_type: updated.pet_type,
          style: updated.style,
          created_at: updated.created_at,
          completed_at: updated.completed_at,
        });
      }

      if (falResult.status === "failed") {
        const updated = await prisma.generation.update({
          where: { id: generation.id },
          data: {
            status: "failed",
            error_message: falResult.error || "Video generation failed",
          },
        });
        return NextResponse.json({
          id: updated.id,
          status: "failed",
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
