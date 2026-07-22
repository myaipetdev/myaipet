/**
 * Unified Studio generate endpoint.
 *
 *   POST /api/studio/generate
 *   { modelId: "kling-image-to-video", petId?: number,
 *     templateId?: string, prompt?: string, customDirection?: string }
 *
 * One of `templateId` or `prompt` is required.
 *
 * Flow:
 *   1. Authenticate + verify pet ownership (if petId given)
 *   2. Build the prompt — template + petCtx OR raw prompt
 *   3. Resolve reference image — pet.avatar_url if model.supportsImageRef
 *   4. Charge credits (atomic decrement; reject if insufficient)
 *   5. Submit to backend (FAL / Grok via abstraction)
 *   6. Create `generations` row with status = pending/completed
 *   7. Return { jobId, status, ... }
 *
 * Polling status: GET /api/studio/generate/[jobId]
 *
 * Editor / sharing / NFT mint hooks fire off the resulting URL — same as the
 * existing Generation pipeline so memory + likes + auto-mint continue to work.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { awardPointsCapped, DAILY_POINT_CAPS } from "@/lib/seasonRewards";
import { rateLimit } from "@/lib/rateLimit";
import { getModel } from "@/lib/studio/providers";
import { getTemplate } from "@/lib/studio/templates";
import { submitToBackend } from "@/lib/studio/backend";
import { getCurrentSubscription, gateModel, incrementUsage } from "@/lib/studio/subscription";
import { moderateText } from "@/lib/moderation";
import { checkVideoAllowed } from "@/lib/economyGuards";
import { prepareVisionImageInput } from "@/lib/services/vision-image";
import { getLLMBudgetFailureStatus } from "@/lib/llm/router";
import { persistGenerationMediaExactlyOnce } from "@/lib/services/generation-media";
import { failGenerationAndRefund } from "@/lib/generationSettlement";

export async function POST(req: NextRequest) {
  const rl = rateLimit(req, { key: "studio-generate", limit: 30, windowMs: 60_000 });
  if (!rl.ok) return rl.response;

  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { modelId, petId, templateId, prompt: rawPrompt, customDirection, aspect } = body;
  const safeAspect = ["16:9", "9:16", "1:1"].includes(aspect) ? aspect : undefined;

  const model = getModel(String(modelId || ""));
  if (!model) return NextResponse.json({ error: "Unknown modelId" }, { status: 400 });
  if (model.comingSoon) {
    return NextResponse.json({
      error: `${model.displayName} is coming soon (${model.comingSoonEta || "TBA"}). Pick a different engine.`,
      comingSoon: true,
    }, { status: 400 });
  }

  // ── Resolve pet (optional but required for image_ref + template personalization) ──
  let pet: any = null;
  if (petId) {
    pet = await prisma.pet.findFirst({
      where: { id: Number(petId), user_id: user.id, is_active: true },
      select: { id: true, name: true, species: true, personality_type: true, appearance_desc: true, avatar_url: true },
    });
    if (!pet) return NextResponse.json({ error: "Pet not found or not yours" }, { status: 404 });
  }

  // ── Build prompt ──
  let finalPrompt = "";
  if (templateId) {
    const tpl = getTemplate(String(templateId));
    if (!tpl) return NextResponse.json({ error: "Unknown templateId" }, { status: 400 });
    const ctx = pet ? {
      name: pet.name,
      species: ["cat", "dog", "parrot", "turtle", "hamster", "rabbit", "fox", "pomeranian"][pet.species] || undefined,
      personalityType: pet.personality_type,
      appearanceDesc: pet.appearance_desc || undefined,
      avatarUrl: pet.avatar_url || undefined,
    } : { name: "the pet" };
    finalPrompt = tpl.buildPrompt(ctx, String(customDirection || "").slice(0, 500));
  } else if (rawPrompt) {
    finalPrompt = String(rawPrompt).slice(0, 2000);
  } else {
    return NextResponse.json({ error: "Provide templateId or prompt" }, { status: 400 });
  }

  // audit M14: moderate the final prompt before sending it to fal.ai/Grok —
  // rejects NSFW / violent / minor / public-figure content.
  const mod = moderateText(finalPrompt, "prompt");
  if (!mod.ok) {
    return NextResponse.json({ error: mod.reason }, { status: 400 });
  }

  // ── Subscription tier + monthly quota gate ──
  const sub = await getCurrentSubscription(user.id);
  const gate = gateModel(sub, model.tier, model.kind);
  if (!gate.ok) {
    if (gate.reason === "tier_required") {
      return NextResponse.json({
        error: `${model.displayName} requires ${gate.requiredTier?.toUpperCase()} subscription. You're on ${gate.currentTier?.toUpperCase()}.`,
        upsell: { requiredTier: gate.requiredTier, currentTier: gate.currentTier },
      }, { status: 403 });
    }
    if (gate.reason === "video_quota" || gate.reason === "image_quota") {
      const kind = gate.reason === "video_quota" ? "videos" : "images";
      const limit = gate.reason === "video_quota" ? sub.limits.monthlyVideoLimit : sub.limits.monthlyImageLimit;
      return NextResponse.json({
        error: `Monthly ${kind} limit reached (${limit}). Upgrade your tier to keep generating.`,
        upsell: { currentTier: gate.currentTier },
      }, { status: 403 });
    }
  }

  // ── Free-origin video gate (POINTS-ECONOMY §2.2/§2.5, knobs #4/#10) ──
  // Video-kind generation by a never-paid wallet is pacing-gated: unlocks on
  // day-2 of the wallet's lifetime, then metered by a per-wallet 2/day + a
  // GLOBAL 300/day free-origin budget. Paying wallets bypass entirely. Images
  // are never gated here.
  if (model.kind === "video") {
    const vg = await checkVideoAllowed(user);
    if (!vg.ok) {
      return NextResponse.json({ error: vg.error, videoGated: true }, { status: vg.status });
    }
  }

  // ── Credits gate ──
  const cost = model.creditsPerRun;
  if ((user.credits ?? 0) < cost) {
    return NextResponse.json(
      { error: "Insufficient credits", credits: user.credits ?? 0, required: cost },
      { status: 402 },
    );
  }

  // ── Pet reference image (if model supports it and we have one) ──
  let refUrl: string | undefined;
  if (model.supportsImageRef && pet?.avatar_url) {
    try {
      // Private owner media is never made public for a provider. Both xAI and
      // fal accept bounded base64 data URIs for image/file inputs.
      refUrl = await prepareVisionImageInput(pet.avatar_url, { materializeExternal: true });
    } catch {
      return NextResponse.json({ error: "The pet reference image is unavailable or invalid" }, { status: 422 });
    }
  }

  // ── Atomic credit deduction + generation row ──
  // audit H17: guarded conditional decrement — concurrent requests that read the
  // same pre-deduction balance can't both pass and drive credits negative.
  const created = await prisma.$transaction(async (tx) => {
    const dec = await tx.user.updateMany({
      where: { id: user.id, credits: { gte: cost } },
      data: { credits: { decrement: cost } },
    });
    if (dec.count === 0) return null; // insufficient credits (lost the race)
    const u = await tx.user.findUnique({ where: { id: user.id }, select: { credits: true } });
    const g = await tx.generation.create({
      data: {
        user_id: user.id,
        pet_id: pet?.id,
        visibility: "private",
        source_kind: "user",
        pet_type: pet?.species ?? 0,
        style: 0,
        prompt: finalPrompt,
        duration: model.maxDurationSec,
        photo_path: pet?.avatar_url || "",
        credits_charged: cost,
        status: "pending",
      },
    });
    return { user: u, gen: g };
  });

  if (!created) {
    return NextResponse.json(
      { error: "Insufficient credits", required: cost },
      { status: 402 },
    );
  }

  const failAndRefund = async (message: string) => {
    await failGenerationAndRefund({
      generationId: created.gen.id,
      ownerUserId: user.id,
      fromStatuses: ["pending", "running", "persisting"],
      errorMessage: message,
    });
  };

  // ── Submit to backend (outside transaction — may take seconds) ──
  // Image backends reserve the persistent per-user/global attempt budget
  // immediately before their real network submission. Budget/store failures
  // deliberately propagate so credits can be refunded here.
  let result: Awaited<ReturnType<typeof submitToBackend>>;
  try {
    result = await submitToBackend(model, finalPrompt, user.id, refUrl, safeAspect);
  } catch (error) {
    const budgetStatus = getLLMBudgetFailureStatus(error);
    await failAndRefund(
      budgetStatus === 429
        ? "image daily budget exceeded"
        : budgetStatus === 503
          ? "image spend guard unavailable"
          : "backend submission failed",
    );
    if (budgetStatus) {
      return NextResponse.json({
        error: budgetStatus === 429
          ? "Image generation has reached today's limit. Please try again tomorrow."
          : "Image generation is temporarily unavailable. Please try again later.",
      }, { status: budgetStatus });
    }
    console.error("studio: backend submission threw:", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({ error: "Generation failed" }, { status: 502 });
  }
  if (!result.ok) {
    await failAndRefund(result.error || "submit failed");
    return NextResponse.json({ error: result.error || "Generation failed" }, { status: 502 });
  }

  // Some backends return synchronously (Grok image). Mark completed immediately.
  if (result.immediateUrl) {
    // Never store an upstream public URL for a private-by-default creation.
    let persisted;
    try {
      persisted = await persistGenerationMediaExactlyOnce({
        generationId: created.gen.id,
        upstreamUrl: result.immediateUrl,
        kind: model.kind,
        claimableStatuses: ["pending"],
        retryStatus: "pending",
        prefix: model.kind === "video" ? "videos" : "generations",
      });
    } catch (e) {
      console.error("studio: private media persistence failed:", e);
      await failAndRefund("media persistence failed");
      return NextResponse.json({ error: "Generation storage is temporarily unavailable" }, { status: 503 });
    }
    if (persisted.status !== "completed" || !persisted.url) {
      return NextResponse.json({
        ok: true,
        generationId: created.gen.id,
        status: "running",
        creditsRemaining: created.user?.credits ?? 0,
        model: { id: model.id, displayName: model.displayName, provider: model.provider },
      }, { status: 202 });
    }
    const persistedUrl = persisted.url;
    await incrementUsage(user.id, model.kind);
    const genPts = await awardPointsCapped(user.id, "studio_gen", model.kind === "video" ? 20 : 10, DAILY_POINT_CAPS.studio_gen);
    return NextResponse.json({
      ok: true,
      generationId: created.gen.id,
      status: "completed",
      url: persistedUrl,
      pointsAwarded: genPts.points || 0,
      creditsRemaining: created.user?.credits ?? 0,
      model: { id: model.id, displayName: model.displayName, provider: model.provider },
    });
  }

  // Queued — store jobId for polling + count toward monthly quota now (we
  // already charged credits and submitted to upstream).
  //
  // No model_id column exists on `generations` and we can't add a migration,
  // so we encode the model id onto fal_request_id as "<modelId>::<jobId>".
  // The poll route splits this back out to poll ONLY the originating provider
  // instead of brute-forcing every model. The bare jobId is still recoverable
  // for any legacy rows that lack the prefix.
  const taggedJobId = result.jobId ? `${model.id}::${result.jobId}` : null;
  await prisma.generation.update({
    where: { id: created.gen.id },
    data: { status: "running", fal_request_id: taggedJobId },
  });
  await incrementUsage(user.id, model.kind);

  return NextResponse.json({
    ok: true,
    generationId: created.gen.id,
    status: "running",
    // Return the tagged id so a poll by jobId resolves the same row (the poll
    // route also accepts the bare numeric generationId, which the UI uses).
    jobId: taggedJobId,
    creditsRemaining: created.user.credits,
    model: { id: model.id, displayName: model.displayName, provider: model.provider },
  });
}

// ── GET: history (latest generations for caller) ──
export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limit = Math.min(50, Number(req.nextUrl.searchParams.get("limit")) || 20);
  const rows = await prisma.generation.findMany({
    where: { user_id: user.id },
    orderBy: { created_at: "desc" },
    take: limit,
    select: {
      id: true, status: true, prompt: true, duration: true,
      photo_path: true, video_path: true, error_message: true,
      created_at: true, completed_at: true, credits_charged: true,
    },
  });
  return NextResponse.json({ generations: rows, credits: user.credits ?? 0 });
}
