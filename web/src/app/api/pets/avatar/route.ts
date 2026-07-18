import { getUser } from "@/lib/auth";
import { buildAvatarPrompt, generateGrokImage } from "@/lib/services/video";
import { persistRemoteAvatarPreview } from "@/lib/avatarMedia";
import { rateLimit } from "@/lib/rateLimit";
import { getLLMBudgetFailureStatus } from "@/lib/llm/router";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  // Image generation on the platform key — tight per-caller limit.
  const rl = rateLimit(req, { key: "pet-avatar", limit: 10, windowMs: 60_000 });
  if (!rl.ok) return rl.response;

  const user = await getUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { species, personality } = body;
  // Cap free-text fields before they reach the image-model prompt.
  const species_name =
    typeof body.species_name === "string" ? body.species_name.slice(0, 50) : undefined;
  const custom_traits =
    typeof body.custom_traits === "string" ? body.custom_traits.slice(0, 300) : undefined;

  if (!personality) {
    return NextResponse.json(
      { error: "personality is required" },
      { status: 400 }
    );
  }

  try {
    const prompt = buildAvatarPrompt(species ?? 0, personality, species_name, custom_traits);
    const providerUrl = await generateGrokImage(prompt, user.id);
    // Provider URLs are temporary and outside our privacy boundary. Persist the
    // bytes under a durable, expiring ownership row before returning the
    // owner-protected application media path.
    const imageUrl = await persistRemoteAvatarPreview(providerUrl, user.id);
    return NextResponse.json({ avatar_url: imageUrl, prompt_used: prompt });
  } catch (err: unknown) {
    console.error("Avatar generation error:", err);
    const budgetStatus = getLLMBudgetFailureStatus(err);
    if (budgetStatus) {
      return NextResponse.json({
        error: budgetStatus === 429
          ? "Image generation has reached today's limit. Please try again tomorrow."
          : "Image generation is temporarily unavailable. Please try again later.",
      }, { status: budgetStatus });
    }
    return NextResponse.json({ error: "Avatar generation failed" }, { status: 502 });
  }
}
