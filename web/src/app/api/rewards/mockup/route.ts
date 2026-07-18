import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { rateLimit } from "@/lib/rateLimit";
import { getLLMBudgetFailureStatus } from "@/lib/llm/router";
import { generateGrokImage } from "@/lib/services/video";
import { deleteStoredFile, saveRemoteFile } from "@/lib/storage";
import { enqueueMediaDeletionReference } from "@/lib/mediaDeletion";
import { NextRequest, NextResponse } from "next/server";

const MOCKUP_CREDIT_COST = 5; // paid Grok image generation

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

  // audit L7: bound abuse of this paid Grok image endpoint.
  const rl = rateLimit(req, { key: "rewards-mockup", limit: 10, windowMs: 60_000 });
  if (!rl.ok) return rl.response;

  const { product_type, pet_id } = await req.json();

  if (!product_type || !PRODUCT_PROMPTS[product_type]) {
    return NextResponse.json({ error: "Invalid product type" }, { status: 400 });
  }

  // Get pet appearance description
  const pet = await prisma.pet.findFirst({
    where: { id: Number(pet_id), user_id: user.id, is_active: true },
    select: { id: true, species: true, appearance_desc: true, name: true, avatar_url: true },
  });

  if (!pet) return NextResponse.json({ error: "Pet not found" }, { status: 404 });

  const charDesc = pet.appearance_desc || `cute pet named ${pet.name}`;
  const prompt = PRODUCT_PROMPTS[product_type].replace("CHARACTER_DESC", charDesc) + ". DO NOT include any text, words, letters, or watermarks.";

  // audit L7: charge credits atomically before the paid generation; refund on failure.
  const dec = await prisma.user.updateMany({
    where: { id: user.id, credits: { gte: MOCKUP_CREDIT_COST } },
    data: { credits: { decrement: MOCKUP_CREDIT_COST } },
  });
  if (dec.count === 0) {
    return NextResponse.json({ error: "Insufficient credits", required: MOCKUP_CREDIT_COST }, { status: 402 });
  }

  let storedUrl: string | null = null;
  let ownerReferenceCommitted = false;
  try {
    const upstreamUrl = await generateGrokImage(prompt, user.id, "grok-2-image");
    storedUrl = await saveRemoteFile(upstreamUrl, `reward-mockups/${user.id}`);
    const imageUrl = storedUrl;

    await prisma.$transaction(async (tx) => {
      const lockedPet = await tx.$queryRaw<Array<{ id: number }>>`
        SELECT "id"
        FROM "pets"
        WHERE "id" = ${pet.id}
          AND "user_id" = ${user.id}
          AND "is_active" = TRUE
        FOR UPDATE
      `;
      if (!lockedPet[0]) throw new Error("Pet was deleted before mockup ownership could be saved");
      await tx.generation.create({
        data: {
          user_id: user.id,
          pet_id: pet.id,
          pet_type: pet.species,
          style: 0,
          prompt,
          duration: 0,
          photo_path: imageUrl,
          status: "completed",
          visibility: "private",
          credits_charged: MOCKUP_CREDIT_COST,
          completed_at: new Date(),
        },
      });
    });
    ownerReferenceCommitted = true;

    return NextResponse.json({ image_url: imageUrl, product_type });
  } catch (error: unknown) {
    if (storedUrl && !ownerReferenceCommitted) {
      await enqueueMediaDeletionReference(storedUrl, {
        ownerUserId: user.id,
        sourcePetId: pet.id,
        reason: "Reward mockup storage succeeded but owner reference creation failed",
      }).catch(async () => deleteStoredFile(storedUrl).catch(() => {}));
    }
    // Refund the credits charged up-front if generation failed.
    if (!ownerReferenceCommitted) {
      await prisma.user.update({
        where: { id: user.id },
        data: { credits: { increment: MOCKUP_CREDIT_COST } },
      }).catch(() => {});
    }
    console.error("Mockup generation error:", error instanceof Error ? error.name : "unknown");
    const budgetStatus = getLLMBudgetFailureStatus(error);
    if (budgetStatus) {
      return NextResponse.json({
        error: budgetStatus === 429
          ? "Image generation has reached today's limit."
          : "Image generation is temporarily unavailable.",
      }, { status: budgetStatus });
    }
    return NextResponse.json({ error: "Generation failed" }, { status: 502 });
  }
}
