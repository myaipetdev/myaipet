import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { analyzeChatHistory, saveChatAnalysis } from "@/lib/services/persona";

/**
 * POST /api/pets/[petId]/persona/analyze
 * Upload chat history text, analyze with Grok, and save extracted patterns.
 *
 * Body: { chat_text: string } (max 50000 chars)
 * Returns: extracted patterns, sample messages, detected style
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ petId: string }> },
) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { petId } = await params;
  const pid = Number(petId);

  const pet = await prisma.pet.findFirst({
    where: { id: pid, user_id: user.id, is_active: true },
  });
  if (!pet) return NextResponse.json({ error: "Pet not found" }, { status: 404 });

  const body = await req.json();
  const chatText = body.chat_text;

  if (!chatText || typeof chatText !== "string") {
    return NextResponse.json({ error: "chat_text is required" }, { status: 400 });
  }

  if (chatText.length < 50) {
    return NextResponse.json(
      { error: "Chat text too short. Provide at least 50 characters for meaningful analysis." },
      { status: 400 },
    );
  }

  if (chatText.length > 50000) {
    return NextResponse.json(
      { error: "Chat text exceeds 50000 character limit." },
      { status: 400 },
    );
  }

  try {
    // Analyze chat history with LLM
    const analysis = await analyzeChatHistory(chatText);

    // Save analysis results to persona
    const persona = await saveChatAnalysis(pid, analysis);

    // Record Web4 checkpoint
    try {
      const { recordCheckpoint } = await import("@/lib/services/soul");
      await recordCheckpoint(pid, "chat_analysis");
    } catch (e) {
      console.error("Checkpoint error:", e);
    }

    return NextResponse.json({
      ok: true,
      analysis: {
        patterns: analysis.patterns,
        sample_messages: analysis.sampleMessages,
        vocabulary_style: analysis.vocabularyStyle,
        detected_tone: analysis.detectedTone,
        detected_language: analysis.detectedLanguage,
        interests: analysis.interests,
      },
      persona,
    });
  } catch (err: any) {
    console.error("[persona/analyze] Error:", err);
    return NextResponse.json(
      { error: err.message || "Analysis failed" },
      { status: 500 },
    );
  }
}
