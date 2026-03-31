import { getUser } from "@/lib/auth";
import { buildAvatarPrompt, generateGrokImage } from "@/lib/services/video";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { species, personality, species_name, custom_traits } = body;

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
