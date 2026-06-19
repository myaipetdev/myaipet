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
import { rateLimit } from "@/lib/rateLimit";
import { getModel } from "@/lib/studio/providers";
import { getTemplate } from "@/lib/studio/templates";
import { submitToBackend } from "@/lib/studio/backend";
import { getCurrentSubscription, gateModel, incrementUsage } from "@/lib/studio/subscription";
import { moderateText } from "@/lib/moderation";
import { saveRemoteFile } from "@/lib/storage";

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
    finalPrompt = tpl.buildPrompt(ctx, String(customDirection || ""));
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

  // ── Credits gate ──
  const cost = model.creditsPerRun;
  if ((user.credits ?? 0) < cost) {
    return NextResponse.json(
      { error: "Insufficient credits", credits: user.credits ?? 0, required: cost },
      { status: 402 },
    );
  }

  // ── Pet reference image (if model supports it and we have one) ──
  const refUrl = model.supportsImageRef && pet?.avatar_url ? pet.avatar_url : undefined;

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

  // ── Submit to backend (outside transaction — may take seconds) ──
  const result = await submitToBackend(model, finalPrompt, refUrl, safeAspect);
  if (!result.ok) {
    // Refund + mark failed
    await prisma.$transaction([
      prisma.user.update({ where: { id: user.id }, data: { credits: { increment: cost } } }),
      prisma.generation.update({
        where: { id: created.gen.id },
        data: { status: "failed", error_message: result.error || "submit failed" },
      }),
    ]);
    return NextResponse.json({ error: result.error || "Generation failed" }, { status: 502 });
  }

  // Some backends return synchronously (Grok image). Mark completed immediately.
  if (result.immediateUrl) {
    // Upstream xAI/fal URLs expire within hours — persist to permanent storage
    // BEFORE saving so History + public /c/<id> share links don't rot. Fall
    // back to the raw URL only if the copy fails (better a short-lived link
    // than a failed generation the user already paid for).
    let persistedUrl = result.immediateUrl;
    try {
      persistedUrl = await saveRemoteFile(result.immediateUrl, "generations");
    } catch (e) {
      console.error("studio: saveRemoteFile (immediate) failed, using raw URL:", e);
    }
    await prisma.generation.update({
      where: { id: created.gen.id },
      data: {
        status: "completed",
        video_path: model.kind === "video" ? persistedUrl : null,
        photo_path: model.kind === "image" ? persistedUrl : created.gen.photo_path,
        completed_at: new Date(),
      },
    });
    await incrementUsage(user.id, model.kind);
    return NextResponse.json({
      ok: true,
      generationId: created.gen.id,
      status: "completed",
      url: persistedUrl,
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
