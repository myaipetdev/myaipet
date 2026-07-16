import { getUser } from "@/lib/auth";
import { buildAvatarPrompt, generateGrokImage } from "@/lib/services/video";
import { rateLimit } from "@/lib/rateLimit";
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
    const imageUrl = await generateGrokImage(prompt);
    return NextResponse.json({ avatar_url: imageUrl, prompt_used: prompt });
  } catch (err: any) {
    console.error("Avatar generation error:", err);
    return NextResponse.json(
      { error: "Avatar generation failed", details: err.message },
      { status: 502 }
    );
  }
}
