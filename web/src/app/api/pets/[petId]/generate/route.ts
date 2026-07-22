import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { verifySignature } from "@/lib/signAction";
import { buildPetPrompt, generateGrokImage, generateGrokImageWithRef, describePetAvatar, submitGrokVideo, translatePromptIfNeeded } from "@/lib/services/video";
import { isCodexVariant, codexVariantDesc } from "@/lib/codex";
import { loraEnabled, getReadyPetLora, falLoraImage } from "@/lib/services/lora";
import { moderateGeneration } from "@/lib/moderation";
import { awardPoints } from "@/lib/seasonRewards";
import { checkVideoAllowed } from "@/lib/economyGuards";
import { triggerAgentReactions } from "@/lib/agents";
import { recordGenerationOnChain, mintContentNFT } from "@/lib/blockchain";
import { ethers } from "ethers";
import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rateLimit";
import { deleteStoredFile, saveRemoteFile } from "@/lib/storage";
import { enqueueMediaDeletionReference } from "@/lib/mediaDeletion";
import { getLLMBudgetFailureStatus } from "@/lib/llm/router";
import { readBoundedJsonBody } from "@/lib/petclaw/bounded-json-body";
import { providerSafeStoredText } from "@/lib/petclaw/provider-safe-text";
import {
  commitAgentCreditsWithDb,
  refundAgentCreditsOnce,
  reserveAgentCredits,
  type AgentCreditReservation,
} from "@/lib/agentCreditReservation";

function getVideoCreditCost(duration: number): number {
  if (duration <= 3) return 15;
  if (duration <= 5) return 30;
  return 60;
}

function visionBudgetResponse(error: unknown): NextResponse | null {
  const status = getLLMBudgetFailureStatus(error);
  if (!status) return null;
  return NextResponse.json({
    error: status === 429
      ? "Pet image analysis has reached today's limit. Please try again tomorrow."
      : "Pet image analysis is temporarily unavailable. Please try again later.",
  }, { status });
}

async function cleanupUncommittedGeneratedMedia(
  refs: string[],
  ownerUserId: number,
  sourcePetId: number,
): Promise<void> {
  for (const ref of refs) {
    try {
      await enqueueMediaDeletionReference(ref, {
        ownerUserId,
        sourcePetId,
        reason: "Pet generation storage succeeded but its DB transaction did not commit",
      });
    } catch (queueError) {
      // These refs are newly generated, random-name objects and the caller only
      // invokes this helper before its Generation transaction commits. If the
      // durable DB is unavailable, immediate deletion is the safe fallback.
      await deleteStoredFile(ref).catch(() => {
        console.error("[generate] media cleanup queue and direct delete both failed", queueError instanceof Error ? queueError.name : "unknown");
      });
    }
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ petId: string }> }
) {
  // Image/video generation + credit spend — tight per-caller limit.
  const rl = rateLimit(req, { key: "pet-generate", limit: 10, windowMs: 60_000 });
  if (!rl.ok) return rl.response;

  const user = await getUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { petId } = await params;
  const parsedBody = await readBoundedJsonBody(req, 8 * 1024);
  if (parsedBody.ok === false) {
    return NextResponse.json(
      { error: parsedBody.reason === "too_large" ? "Request body too large" : "Invalid JSON body" },
      { status: parsedBody.reason === "too_large" ? 413 : 400 },
    );
  }
  if (!parsedBody.value || typeof parsedBody.value !== "object" || Array.isArray(parsedBody.value)) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const body = parsedBody.value as Record<string, unknown>;
  const allowedFields = new Set([
    "style", "duration", "prompt", "type", "signedMessage", "signature", "codexVariant",
  ]);
  if (Object.keys(body).some((key) => !allowedFields.has(key))) {
    return NextResponse.json({ error: "Request contains unsupported fields" }, { status: 400 });
  }
  const {
    style: rawStyle,
    duration: rawDuration,
    prompt: rawPrompt,
    type,
    signedMessage: rawSignedMessage,
    signature: rawSignature,
    codexVariant: rawCodexVariant,
  } = body;
  if (type !== "image" && type !== "video") {
    return NextResponse.json({ error: "type must be 'image' or 'video'" }, { status: 400 });
  }
  if (!Number.isInteger(rawStyle) || (rawStyle as number) < 0 || (rawStyle as number) > 6) {
    return NextResponse.json({ error: "style must be an integer from 0 to 6" }, { status: 400 });
  }
  if (rawDuration !== undefined && (!Number.isInteger(rawDuration) || ![3, 5, 10].includes(rawDuration as number))) {
    return NextResponse.json({ error: "duration must be 3, 5, or 10 seconds" }, { status: 400 });
  }
  if (type === "video" && rawDuration === undefined) {
    return NextResponse.json({ error: "duration is required for video" }, { status: 400 });
  }
  if (rawPrompt !== undefined && (typeof rawPrompt !== "string" || rawPrompt.length > 1_000)) {
    return NextResponse.json({ error: "prompt must be a string of at most 1000 characters" }, { status: 400 });
  }
  if (rawCodexVariant !== undefined && (typeof rawCodexVariant !== "string" || !isCodexVariant(rawCodexVariant))) {
    return NextResponse.json({ error: "Invalid codexVariant" }, { status: 400 });
  }
  if (
    (rawSignedMessage !== undefined && (typeof rawSignedMessage !== "string" || rawSignedMessage.length > 2_000))
    || (rawSignature !== undefined && (typeof rawSignature !== "string" || rawSignature.length > 1_000))
    || ((rawSignedMessage === undefined) !== (rawSignature === undefined))
  ) {
    return NextResponse.json({ error: "signedMessage and signature must be supplied together as bounded strings" }, { status: 400 });
  }
  const style = rawStyle as number;
  const duration = rawDuration as number | undefined;
  const prompt = rawPrompt as string | undefined;
  const signedMessage = rawSignedMessage as string | undefined;
  const signature = rawSignature as string | undefined;
  const codexVariant = rawCodexVariant as string | undefined;

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

  const pet = await prisma.pet.findFirst({
    where: { id: Number(petId), user_id: user.id, is_active: true },
  });

  if (!pet) {
    return NextResponse.json({ error: "Pet not found" }, { status: 404 });
  }
  if (type === "image" && style === 0 && !pet.avatar_url) {
    return NextResponse.json({ error: "Original style requires an existing pet photo" }, { status: 400 });
  }

  // Pricing tiers (credits cost):
  //   Image: style 0 (Original/no-gen) = 0; otherwise = 5
  //   Video: 3s = 15, 5s = 30, 10s = 60
  const creditCost = type === "video"
    ? getVideoCreditCost(duration || 5)
    : (style === 0 ? 0 : 5);

  // Free-origin video gate (POINTS-ECONOMY §2.2/§2.5, knobs #4/#10): a never-paid
  // wallet can't generate video until day-2 of its lifetime, then it's metered by
  // a per-wallet 2/day + a GLOBAL 300/day free-origin budget. Paying wallets
  // bypass; images are never gated.
  if (type === "video") {
    const vg = await checkVideoAllowed(user);
    if (!vg.ok) {
      return NextResponse.json({ error: vg.error, videoGated: true }, { status: vg.status });
    }
  }

  // Auto-analyze appearance if not yet described
  let appearanceDesc = pet.appearance_desc;
  if (pet.avatar_url && !appearanceDesc) {
    try {
      appearanceDesc = await describePetAvatar(pet.avatar_url, user.id);
      if (appearanceDesc) {
        await prisma.pet.update({
          where: { id: pet.id },
          data: { appearance_desc: appearanceDesc },
        });
      }
    } catch (e) {
      const response = visionBudgetResponse(e);
      if (response) return response;
      console.error("Auto-describe failed:", e);
    }
  }

  // Content moderation — reject NSFW / violent / minor / public-figure prompts
  // BEFORE translation (so translated text doesn't bypass) and BEFORE building
  // the personalized prompt (since the pet's stored fields could also carry
  // adversarial content).
  const mods = (pet.personality_modifiers as Record<string, unknown> | null) || {};
  const rawCustomTraits = typeof mods.custom_traits === "string"
    ? mods.custom_traits
    : undefined;
  const modCheck = moderateGeneration({
    prompt: typeof prompt === "string" ? prompt : "",
    petName: pet.name,
    // Moderation stays local and deliberately sees the original owner-facing
    // metadata. Provider prompt filtering happens separately below.
    customTraits: [pet.personality_type, rawCustomTraits].filter(Boolean).join("; "),
    appearanceDesc: appearanceDesc || undefined,
  });
  if (!modCheck.ok) {
    console.warn("[generate] moderation reject:", modCheck.matched);
    return NextResponse.json({ error: modCheck.reason }, { status: 400 });
  }

  // Translate non-English prompts so image/video models can actually render the scene
  const translatedPrompt = prompt ? await translatePromptIfNeeded(prompt, pet.id) : undefined;

  // Second moderation pass on the translated form — a Korean/Chinese/Japanese
  // prompt could have hidden harmful content that only surfaces post-translation.
  if (translatedPrompt && translatedPrompt !== prompt) {
    const m2 = moderateGeneration({ prompt: translatedPrompt });
    if (!m2.ok) {
      console.warn("[generate] moderation reject (translated):", m2.matched);
      return NextResponse.json({ error: m2.reason }, { status: 400 });
    }
  }

  // Codex sticker (style 6): a validated variant swaps the style fragment so one
  // slot serves all collectible sticker looks (classic/chibi/holo/retro/pixel/pop).
  const codexOverride = style === 6 && isCodexVariant(codexVariant) ? codexVariantDesc(codexVariant) : undefined;

  // Never interpolate raw durable pet metadata into a provider-bound prompt.
  // Neutral English fallbacks preserve generation availability without
  // mutating the pet's owner-facing identity or stored source fields.
  const providerPetName = providerSafeStoredText(pet.name, "pet_name", 50) || "Pet";
  const providerPersonality = providerSafeStoredText(pet.personality_type, "personality", 20) || "friendly";
  const providerAppearance = providerSafeStoredText(appearanceDesc, "appearance", 2_000);
  const providerCustomTraits = providerSafeStoredText(rawCustomTraits, "custom_traits", 500);
  const providerAppearanceDesc = providerAppearance
    ? [providerAppearance, providerCustomTraits ? `distinctive traits: ${providerCustomTraits}` : null]
      .filter(Boolean)
      .join("; ")
    : providerCustomTraits
      ? `pet with these distinctive traits: ${providerCustomTraits}`
      : undefined;
  const personalizedPrompt = buildPetPrompt(
    providerPetName,
    pet.species,
    providerPersonality,
    style ?? 0,
    translatedPrompt,
    pet.avatar_url || undefined,
    providerAppearanceDesc,
    codexOverride
  );

  // audit H13/H18: durably reserve credits AFTER validation/moderation (so
  // rejects do not charge) but BEFORE expensive provider calls. The atomic
  // guarded debit cannot take the wallet negative under concurrency. Success
  // commits in the same transaction as Generation; failures refund by CAS.
  let creditReservation: AgentCreditReservation | null = null;
  if (creditCost > 0) {
    creditReservation = await reserveAgentCredits(user.id, pet.id, creditCost, "pet_generation");
    if (!creditReservation) {
      return NextResponse.json(
        { error: "Insufficient credits", required: creditCost, available: user.credits },
        { status: 402 }
      );
    }
  }

  const newlyPersistedRefs: string[] = [];
  let mediaTransactionCommitted = false;
  try {
    if (type === "image") {
      // Style 0 = Original: use pet's avatar directly (no generation, no credit cost)
      const isOriginal = style === 0;
      let imageUrl: string;

      if (isOriginal && pet.avatar_url) {
        imageUrl = pet.avatar_url;
      } else {
        // Pet-LoRA: when this pet has a trained identity checkpoint, render
        // with fal flux-lora (far stronger identity than prompt/ref anchoring).
        // Any failure falls through to the existing Grok path.
        let loraImage: string | null = null;
        if (loraEnabled()) {
          try {
            const lora = await getReadyPetLora(pet.id);
            if (lora?.lora_url) {
              loraImage = await falLoraImage(personalizedPrompt, lora.lora_url, lora.trigger_word, user.id);
            }
          } catch (e) {
            if (getLLMBudgetFailureStatus(e)) throw e;
            console.error("Pet-LoRA generation failed, falling back to Grok:", e);
          }
        }
        imageUrl = loraImage ?? (pet.avatar_url
          ? await generateGrokImageWithRef(personalizedPrompt, pet.avatar_url, user.id)
          : await generateGrokImage(personalizedPrompt, user.id));
        imageUrl = await saveRemoteFile(imageUrl, "generations");
        newlyPersistedRefs.push(imageUrl);
      }

      const actualCost = isOriginal ? 0 : creditCost;

      // Credits were already reserved atomically above (audit H13). Persist the
      // generation and its terminal reservation state together.
      const generation = await prisma.$transaction(async (tx) => {
        const lockedPet = await tx.$queryRaw<Array<{ id: number }>>`
          SELECT "id"
          FROM "pets"
          WHERE "id" = ${pet.id}
            AND "user_id" = ${user.id}
            AND "is_active" = TRUE
          FOR UPDATE
        `;
        if (!lockedPet[0]) throw new Error("Pet was deleted before generation could be saved");
        const created = await tx.generation.create({
          data: {
            user_id: user.id,
            pet_id: pet.id,
            pet_type: pet.species,
            style: style ?? 0,
            prompt: isOriginal ? `Original photo of ${pet.name}` : personalizedPrompt,
            duration: 0,
            photo_path: imageUrl,
            status: "completed",
            visibility: "private",
            source_kind: "user",
            credits_charged: actualCost,
            completed_at: new Date(),
          },
        });
        await tx.petMemory.create({
          data: {
            pet_id: pet.id,
            memory_type: "generation",
            content: `An image was created of ${pet.name}: "${personalizedPrompt}"`,
            emotion: "happy",
            importance: 2,
          },
        });
        if (creditReservation) {
          // Commit the debit in the same DB transaction as the durable
          // Generation row. A crash can leave only a reserved row, which the
          // recovery job refunds; it cannot leave a committed charge without
          // the generation record.
          await commitAgentCreditsWithDb(tx, creditReservation);
        }
        // Codex sticker (style 6): also pin it as the pet's collectible art so
        // the card + My Pet hero switch to the illustration. Never touches
        // avatar_url (the real photo). Latest codex generation wins.
        if (style === 6 && !isOriginal) {
          await tx.pet.update({ where: { id: pet.id }, data: { codex_url: imageUrl } });
        }
        return created;
      });
      mediaTransactionCommitted = true;

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
    const providerImageUrl = await generateGrokImage(personalizedPrompt, user.id);

    const { requestId } = await submitGrokVideo(
      personalizedPrompt,
      duration || 5,
      providerImageUrl,
    );
    const imageUrl = await saveRemoteFile(providerImageUrl, "generations");
    newlyPersistedRefs.push(imageUrl);

    // Credits already reserved before the paid Grok image+video calls (audit H18).
    const generation = await prisma.$transaction(async (tx) => {
      const lockedPet = await tx.$queryRaw<Array<{ id: number }>>`
        SELECT "id"
        FROM "pets"
        WHERE "id" = ${pet.id}
          AND "user_id" = ${user.id}
          AND "is_active" = TRUE
        FOR UPDATE
      `;
      if (!lockedPet[0]) throw new Error("Pet was deleted before generation could be saved");
      const created = await tx.generation.create({
        data: {
          user_id: user.id,
          pet_id: pet.id,
          pet_type: pet.species,
          style: style ?? 0,
          prompt: personalizedPrompt,
          duration: duration || 5,
          photo_path: imageUrl,
          status: "processing",
          visibility: "private",
          source_kind: "user",
          credits_charged: creditCost,
          fal_request_id: requestId,
        },
      });
      await tx.petMemory.create({
        data: {
          pet_id: pet.id,
          memory_type: "generation",
          content: `A video is being created of ${pet.name}: "${personalizedPrompt}"`,
          emotion: "excited",
          importance: 2,
        },
      });
      if (creditReservation) {
        await commitAgentCreditsWithDb(tx, creditReservation);
      }
      return created;
    });
    mediaTransactionCommitted = true;

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
    if (!mediaTransactionCommitted && newlyPersistedRefs.length > 0) {
      await cleanupUncommittedGeneratedMedia(newlyPersistedRefs, user.id, pet.id);
    }
    // audit H18: refund the reserved credits if generation failed after reserving.
    if (creditReservation && !mediaTransactionCommitted) {
      await refundAgentCreditsOnce(creditReservation)
        .catch((e: unknown) => console.error("[generate] durable credit refund failed:", e));
    }
    // SCRUM-61/63: log full error server-side, never echo to client.
    // Previous behavior leaked xAI team UUID and Grok internals.
    console.error("Generation error:", err?.message);
    const budgetStatus = getLLMBudgetFailureStatus(err);
    if (budgetStatus) {
      return NextResponse.json({
        error: budgetStatus === 429
          ? "Image generation has reached today's limit. Please try again tomorrow."
          : "Image generation is temporarily unavailable. Please try again later.",
      }, { status: budgetStatus });
    }
    const isQuotaError = /credit|quota|exhaust|429/i.test(err?.message || "");
    return NextResponse.json(
      { error: isQuotaError ? "Generation service is at capacity — try again later" : "Generation failed" },
      { status: isQuotaError ? 503 : 500 }
    );
  }
}
