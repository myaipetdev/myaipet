import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

const PRODUCT_PROMPTS: Record<string, string> = {
  sticker: "Product photography of 5 die-cut glossy vinyl sticker sheets laid out on a clean white surface. Each sticker has a printed illustration of a CHARACTER_DESC character in different poses. The logo and character art is clearly visible on each sticker. Studio lighting, high-end e-commerce catalog style, 4K quality",
  clip: "Product photography of a translucent acrylic resin hair clip on pink velvet. The clip has a CHARACTER_DESC character design embedded inside the resin, clearly visible. The character logo is printed and sealed inside the clip. Studio lighting, jewelry e-commerce style, 4K",
  phone: "Product photography of a real iPhone 15 Pro clear phone case on a white marble surface, with a CHARACTER_DESC character artwork printed directly on the back of the case. The character logo is clearly visible and centered on the phone case. Premium TPU case, studio lighting, Apple-style product shot, 4K",
  mug: "Product photography of a white ceramic 11oz coffee mug on a wooden table. The mug has a large CHARACTER_DESC character portrait logo printed on the side, clearly visible facing the camera. The character art wraps around the mug surface. Steam rising, studio lighting, lifestyle e-commerce, 4K",
  notebook: "Product photography of a premium hardcover A5 notebook on a clean desk. The front cover has a large CHARACTER_DESC character artwork printed as the main cover illustration, with the character logo prominently displayed. Lay-flat binding visible, studio lighting, stationery catalog style, 4K",
  pen: "Product photography of a premium brass pen set in a gift box, with a small CHARACTER_DESC character charm keychain attached to each pen. The character is a miniature 3D charm dangling from the pen clip. Studio lighting, luxury stationery, 4K",
  tote: "Product photography of a natural canvas tote bag hanging on a wooden hook against a white wall. The bag has a large CHARACTER_DESC character illustration screen-printed on the front center, clearly visible. The character logo is bold and prominent on the fabric. Organic cotton, studio lighting, fashion e-commerce, 4K",
  hoodie: "Product photography of a premium cotton hoodie laid flat on white background. The hoodie has a CHARACTER_DESC character embroidered logo on the left chest area, clearly visible. High-quality embroidery detail showing the character art stitched into the fabric. Streetwear style, studio lighting, 4K",
  figure: "Product photography of a hand-painted 3D PVC collectible figure of a CHARACTER_DESC character standing on a display pedestal inside an open collector box. The figure accurately represents the character with detailed paint job. Studio lighting, toy collectible catalog, 4K",
};

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { product_type, pet_id } = await req.json();

  if (!product_type || !PRODUCT_PROMPTS[product_type]) {
    return NextResponse.json({ error: "Invalid product type" }, { status: 400 });
  }

  // Get pet appearance description
  const pet = await prisma.pet.findFirst({
    where: { id: Number(pet_id), user_id: user.id, is_active: true },
    select: { appearance_desc: true, name: true, avatar_url: true },
  });

  if (!pet) return NextResponse.json({ error: "Pet not found" }, { status: 404 });

  const charDesc = pet.appearance_desc || `cute pet named ${pet.name}`;
  const prompt = PRODUCT_PROMPTS[product_type].replace("CHARACTER_DESC", charDesc) + ". DO NOT include any text, words, letters, or watermarks.";

  try {
    const grokKey = process.env.GROK_API_KEY;
    if (!grokKey) throw new Error("GROK_API_KEY not configured");

    const res = await fetch("https://api.x.ai/v1/images/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${grokKey}`,
      },
      body: JSON.stringify({
        model: "grok-2-image",
        prompt,
        n: 1,
        response_format: "url",
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Grok API failed: ${res.status} ${text}`);
    }

    const data = await res.json();
    const imageUrl = data.data?.[0]?.url;
    if (!imageUrl) throw new Error("No image returned");

    return NextResponse.json({ image_url: imageUrl, product_type });
  } catch (error: any) {
    console.error("Mockup generation error:", error);
    return NextResponse.json({ error: error.message || "Generation failed" }, { status: 500 });
  }
}
