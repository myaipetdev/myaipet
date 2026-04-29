import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { verifySignature } from "@/lib/signAction";
import { buildPetPrompt, generateGrokImage, generateGrokImageWithRef, describePetAvatar, submitGrokVideo, translatePromptIfNeeded } from "@/lib/services/video";
import { awardPoints } from "@/lib/airdrop";
import { triggerAgentReactions } from "@/lib/agents";
import { recordGenerationOnChain, mintContentNFT } from "@/lib/blockchain";
import { ethers } from "ethers";
import { NextRequest, NextResponse } from "next/server";

function getVideoCreditCost(duration: number): number {
  if (duration <= 3) return 15;
  if (duration <= 5) return 30;
  return 60;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ petId: string }> }
) {
  const user = await getUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { petId } = await params;
  const body = await req.json();
  const { style, duration, prompt, type, signedMessage, signature } = body;

  // Wallet signature optional during on-chain hold period.
  // If provided, still verify; if not, allow auth-only.
  if (signedMessage && signature) {
    const isValidSig = await verifySignature(signedMessage, signature, user.wallet_address);
    if (!isValidSig) {
      return NextResponse.json(
        { error: "Invalid wallet signature" },
        { status: 403 }
      );
    }
  }

  if (!type || !["image", "video"].includes(type)) {
    return NextResponse.json(
      { error: "type must be 'image' or 'video'" },
      { status: 400 }
    );
  }

  const pet = await prisma.pet.findFirst({
    where: { id: Number(petId), user_id: user.id, is_active: true },
  });

  if (!pet) {
    return NextResponse.json({ error: "Pet not found" }, { status: 404 });
  }

  const creditCost = 1; // Test mode: all generations cost 1 $PET

  if (user.credits < creditCost) {
    return NextResponse.json(
      { error: "Insufficient credits", required: creditCost, available: user.credits },
      { status: 400 }
    );
  }

  // Auto-analyze appearance if not yet described
  let appearanceDesc = pet.appearance_desc;
  if (pet.avatar_url && !appearanceDesc) {
    try {
      appearanceDesc = await describePetAvatar(pet.avatar_url);
      if (appearanceDesc) {
        await prisma.pet.update({
          where: { id: pet.id },
          data: { appearance_desc: appearanceDesc },
        });
      }
    } catch (e) {
      console.error("Auto-describe failed:", e);
    }
  }

  // Translate non-English prompts so image/video models can actually render the scene
  const translatedPrompt = prompt ? await translatePromptIfNeeded(prompt) : undefined;

  const personalizedPrompt = buildPetPrompt(
    pet.name,
    pet.species,
    pet.personality_type,
    style ?? 0,
    translatedPrompt,
    pet.avatar_url || undefined,
    appearanceDesc || undefined
  );

  try {
    if (type === "image") {
      // Style 0 = Original: use pet's avatar directly (no generation, no credit cost)
      const isOriginal = style === 0;
      let imageUrl: string;

      if (isOriginal && pet.avatar_url) {
        imageUrl = pet.avatar_url;
      } else {
        imageUrl = pet.avatar_url
          ? await generateGrokImageWithRef(personalizedPrompt, pet.avatar_url)
          : await generateGrokImage(personalizedPrompt);
      }

      const actualCost = isOriginal ? 0 : creditCost;

      const txOps = [];
      if (actualCost > 0) {
        txOps.push(
          prisma.user.update({
            where: { id: user.id },
            data: { credits: { decrement: actualCost } },
          })
        );
      }
      txOps.push(
        prisma.generation.create({
          data: {
            user_id: user.id,
            pet_type: pet.species,
            style: style ?? 0,
            prompt: isOriginal ? `Original photo of ${pet.name}` : personalizedPrompt,
            duration: 0,
            photo_path: imageUrl,
            status: "completed",
            credits_charged: actualCost,
            completed_at: new Date(),
          },
        })
      );
      txOps.push(
        prisma.petMemory.create({
          data: {
            pet_id: pet.id,
            memory_type: "generation",
            content: `An image was created of ${pet.name}: "${personalizedPrompt}"`,
            emotion: "happy",
            importance: 2,
          },
        })
      );

      const txResults = await prisma.$transaction(txOps);
      // generation is the last-but-one result (or first if no credit deduction)
      const generation = actualCost > 0 ? txResults[1] : txResults[0];

      // Fire-and-forget: trigger pet agent reactions + award points
      triggerAgentReactions([generation.id]);
      awardPoints(user.id, pet.id, "generate_image");

      // Fire-and-forget: record on-chain and mint NFT
      if (user.wallet_address && !isOriginal) {
        const contentHash = ethers.id(`${generation.id}:${imageUrl}:${Date.now()}`);
        const petTypeNum = typeof pet.species === "number" ? pet.species : 0;

        // Record generation on PetaGenTracker
        recordGenerationOnChain(user.wallet_address, petTypeNum, style ?? 0, contentHash)
          .then((result) => {
            if (result) {
              prisma.generation.update({
                where: { id: generation.id },
                data: { tx_hash: result.txHash, chain: result.chain, content_hash: contentHash },
              }).catch((e: unknown) => console.error("[blockchain] DB update failed:", e));
            }
          })
          .catch((e: unknown) => console.error("[blockchain] recordGeneration failed:", e));

        // Mint NFT on PETContent
        mintContentNFT(user.wallet_address, petTypeNum, style ?? 0, "image", contentHash)
          .then((result) => {
            if (result) {
              console.log(`[blockchain] NFT mint initiated for generation ${generation.id}, tx: ${result.txHash}`);
            }
          })
          .catch((e: unknown) => console.error("[blockchain] mintNFT failed:", e));
      }

      return NextResponse.json({
        id: generation.id,
        image_url: imageUrl,
        prompt_used: isOriginal ? `Original photo of ${pet.name}` : personalizedPrompt,
        pet_name: pet.name,
        gen_type: "image",
        credits_charged: actualCost,
      });
    }

    // Video generation: Grok image + Grok video
    const imageUrl = await generateGrokImage(personalizedPrompt);

    const { requestId } = await submitGrokVideo(
      personalizedPrompt,
      duration || 5,
      imageUrl,
    );

    const [, generation] = await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: { credits: { decrement: creditCost } },
      }),
      prisma.generation.create({
        data: {
          user_id: user.id,
          pet_type: pet.species,
          style: style ?? 0,
          prompt: personalizedPrompt,
          duration: duration || 5,
          photo_path: imageUrl,
          status: "processing",
          credits_charged: creditCost,
          fal_request_id: requestId,
        },
      }),
      prisma.petMemory.create({
        data: {
          pet_id: pet.id,
          memory_type: "generation",
          content: `A video is being created of ${pet.name}: "${personalizedPrompt}"`,
          emotion: "excited",
          importance: 2,
        },
      }),
    ]);

    // Fire-and-forget: record video generation on-chain and mint NFT
    if (user.wallet_address) {
      const contentHash = ethers.id(`${generation.id}:${imageUrl}:${Date.now()}`);
      const petTypeNum = typeof pet.species === "number" ? pet.species : 0;

      recordGenerationOnChain(user.wallet_address, petTypeNum, style ?? 0, contentHash)
        .then((result) => {
          if (result) {
            prisma.generation.update({
              where: { id: generation.id },
              data: { tx_hash: result.txHash, chain: result.chain, content_hash: contentHash },
            }).catch((e: unknown) => console.error("[blockchain] DB update failed:", e));
          }
        })
        .catch((e: unknown) => console.error("[blockchain] recordGeneration failed:", e));

      mintContentNFT(user.wallet_address, petTypeNum, style ?? 0, "video", contentHash)
        .then((result) => {
          if (result) {
            console.log(`[blockchain] NFT mint initiated for generation ${generation.id}, tx: ${result.txHash}`);
          }
        })
        .catch((e: unknown) => console.error("[blockchain] mintNFT failed:", e));
    }

    return NextResponse.json({
      id: generation.id,
      status: "processing",
      image_url: imageUrl,
      fal_request_id: requestId,
      gen_type: "video",
      credits_charged: creditCost,
    });
  } catch (err: any) {
    console.error("Generation error:", err);
    return NextResponse.json(
      { error: "Generation failed", details: err.message },
      { status: 502 }
    );
  }
}
