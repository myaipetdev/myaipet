import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { verifySignature } from "@/lib/signAction";
import { buildPetPrompt, generateGrokImage, generateGrokImageWithRef, describePetAvatar, submitGrokVideo, translatePromptIfNeeded } from "@/lib/services/video";
import { moderateGeneration } from "@/lib/moderation";
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

  // Pricing tiers (credits cost):
  //   Image: style 0 (Original/no-gen) = 0; otherwise = 5
  //   Video: 3s = 15, 5s = 30, 10s = 60
  const creditCost = type === "video"
    ? getVideoCreditCost(duration || 5)
    : (style === 0 ? 0 : 5);

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

  // Content moderation — reject NSFW / violent / minor / public-figure prompts
  // BEFORE translation (so translated text doesn't bypass) and BEFORE building
  // the personalized prompt (since the pet's stored fields could also carry
  // adversarial content).
  const mods = (pet.personality_modifiers as any) || {};
  const modCheck = moderateGeneration({
    prompt: typeof prompt === "string" ? prompt : "",
    petName: pet.name,
    customTraits: mods.custom_traits,
    appearanceDesc: appearanceDesc || undefined,
  });
  if (!modCheck.ok) {
    console.warn("[generate] moderation reject:", modCheck.matched);
    return NextResponse.json({ error: modCheck.reason }, { status: 400 });
  }

  // Translate non-English prompts so image/video models can actually render the scene
  const translatedPrompt = prompt ? await translatePromptIfNeeded(prompt) : undefined;

  // Second moderation pass on the translated form — a Korean/Chinese/Japanese
  // prompt could have hidden harmful content that only surfaces post-translation.
  if (translatedPrompt && translatedPrompt !== prompt) {
    const m2 = moderateGeneration({ prompt: translatedPrompt });
    if (!m2.ok) {
      console.warn("[generate] moderation reject (translated):", m2.matched);
      return NextResponse.json({ error: m2.reason }, { status: 400 });
    }
  }

  const personalizedPrompt = buildPetPrompt(
    pet.name,
    pet.species,
    pet.personality_type,
    style ?? 0,
    translatedPrompt,
    pet.avatar_url || undefined,
    appearanceDesc || undefined
  );

  // audit H13/H18: reserve credits with an atomic guarded decrement AFTER all
  // validation/moderation (so rejects don't charge) but BEFORE the expensive
  // image/video provider calls. `credits: { gte }` can't go negative under
  // concurrency; the catch block refunds `reserved` if generation fails.
  let reserved = 0;
  if (creditCost > 0) {
    const dec = await prisma.user.updateMany({
      where: { id: user.id, credits: { gte: creditCost } },
      data: { credits: { decrement: creditCost } },
    });
    if (dec.count === 0) {
      return NextResponse.json(
        { error: "Insufficient credits", required: creditCost, available: user.credits },
        { status: 402 }
      );
    }
    reserved = creditCost;
  }

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

      // Credits were already reserved atomically above (audit H13) — only
      // persist the generation + memory here.
      const txOps = [];
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
      const generation = txResults[0];

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

    // Credits already reserved before the paid Grok image+video calls (audit H18).
    const [generation] = await prisma.$transaction([
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
    // audit H18: refund the reserved credits if generation failed after reserving.
    if (reserved > 0) {
      await prisma.user.update({
        where: { id: user.id },
        data: { credits: { increment: reserved } },
      }).catch((e: unknown) => console.error("[generate] credit refund failed:", e));
    }
    // SCRUM-61/63: log full error server-side, never echo to client.
    // Previous behavior leaked xAI team UUID and Grok internals.
    console.error("Generation error:", err?.message);
    const isQuotaError = /credit|quota|exhaust|429/i.test(err?.message || "");
    return NextResponse.json(
      { error: isQuotaError ? "Generation service is at capacity — try again later" : "Generation failed" },
      { status: isQuotaError ? 503 : 500 }
    );
  }
}
