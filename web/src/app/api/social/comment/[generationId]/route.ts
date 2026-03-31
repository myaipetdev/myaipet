import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ generationId: string }> }
) {
  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { generationId } = await params;

    const generation = await prisma.generation.findUnique({
      where: { id: Number(generationId) },
    });

    if (!generation) {
      return NextResponse.json({ error: "Generation not found" }, { status: 404 });
    }

    const body = await req.json();
    const { content, parent_id } = body;

    if (!content || typeof content !== "string" || content.trim().length === 0) {
      return NextResponse.json({ error: "Content is required" }, { status: 400 });
    }

    if (parent_id !== undefined && parent_id !== null) {
      if (!Number.isInteger(parent_id) || parent_id <= 0) {
        return NextResponse.json({ error: "Invalid parent_id" }, { status: 400 });
      }
      const parentComment = await prisma.comment.findUnique({
        where: { id: parent_id },
      });
      if (!parentComment || parentComment.generation_id !== Number(generationId)) {
        return NextResponse.json({ error: "Parent comment not found" }, { status: 404 });
      }
    }

    const comment = await prisma.comment.create({
      data: {
        user_id: user.id,
        generation_id: Number(generationId),
        content: content.trim(),
        parent_id: parent_id || null,
      },
    });

    return NextResponse.json(comment, { status: 201 });
  } catch (error) {
    console.error("Comment create error:", error);
    return NextResponse.json({ error: "Failed to create comment" }, { status: 500 });
  }
}
