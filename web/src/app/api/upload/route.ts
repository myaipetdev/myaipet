import { getUser } from "@/lib/auth";
import { detectImageMime } from "@/lib/sanitize";
import { newAvatarFilename, persistPendingAvatarMedia } from "@/lib/avatarMedia";
import {
  AvatarUploadQuotaExceededError,
  AvatarUploadQuotaStoreError,
  consumeAvatarUploadQuota,
} from "@/lib/avatarUploadQuota";
import {
  consumeVisionBudget,
  isLLMBudgetError,
  isLLMBudgetStoreError,
} from "@/lib/llm/router";
import { callVisionTextWithFallback } from "@/lib/llm/vision-fallback";
import { NextRequest, NextResponse } from "next/server";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

/**
 * Verify the upload is a photo of an actual animal/pet (not a person, screenshot,
 * landscape, food, etc.).
 *
 * SECURITY POSTURE — fail-CLOSED:
 *   When the vision model is unavailable (no key / 4xx / 5xx / timeout) the
 *   previous version returned { ok: true }, which meant during a Grok outage
 *   (current state today) literally any image — including humans, NSFW
 *   screenshots, etc. — could be adopted as a pet. We now reject with a
 *   "try again later" message instead.
 *
 * Vision-model fallback chain so a single provider outage doesn't block
 * legitimate adoptions for long.
 */
async function isPetPhoto(
  base64: string,
  mimeType: string,
  authenticatedUserId: number,
): Promise<{ ok: boolean; reason?: string }> {
  const dataUrl = `data:${mimeType};base64,${base64}`;
  const question = "Look at this image carefully. Is the MAIN subject an animal or pet? " +
    "Reply 'YES' only if the central, intentional focus is an animal/pet/creature. " +
    "Reply 'NO' if the main subject is a human, screenshot, document, landscape, " +
    "food, building, product, anime/cartoon character, or anything else. " +
    "Reply with ONLY 'YES' or 'NO'.";

  const rawAnswer = await callVisionTextWithFallback(
    { imageUrl: dataUrl, prompt: question, maxTokens: 5 },
    { reserveAttempt: async () => consumeVisionBudget(authenticatedUserId) },
  );
  const answer = rawAnswer?.toUpperCase() || null;
  if (answer?.startsWith("NO")) {
    return { ok: false, reason: "This doesn't look like a pet photo. Please upload a clear photo of an animal." };
  }
  if (answer?.startsWith("YES")) return { ok: true };
  if (answer !== null) {
    return { ok: false, reason: "We couldn't confirm this is a pet photo. Please try a clearer image." };
  }

  // No configured provider could answer — fail CLOSED (was previously open).
  return {
    ok: false,
    reason: "Pet photo verification is temporarily unavailable. Please try again in a few minutes.",
  };
}

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // SCRUM-67: limit uploads to 10/min per user
  const { rateLimit } = await import("@/lib/rateLimit");
  const rl = rateLimit(req, { key: "upload", limit: 10, windowMs: 60_000 });
  if (!rl.ok) return rl.response;

  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: "Invalid file type. Allowed: JPEG, PNG, WebP, GIF" },
      { status: 400 }
    );
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: "File too large. Max 5MB" },
      { status: 400 }
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  // SCRUM-54: verify actual file bytes — client-supplied MIME / extension is
  // untrusted (attacker can label a .exe as image/png). Use magic bytes.
  const realMime = detectImageMime(buffer);
  if (!realMime) {
    return NextResponse.json(
      { error: "File is not a valid image. Allowed: JPEG, PNG, WebP, GIF" },
      { status: 400 }
    );
  }
  // Also reject if claimed MIME disagrees with sniffed MIME (defense in depth)
  if (file.type && file.type !== realMime) {
    return NextResponse.json(
      { error: "File contents do not match declared type" },
      { status: 400 }
    );
  }

  // Durable PostgreSQL quota is the authoritative abuse boundary. It is
  // reserved before paid vision work, shared by every app instance, and fails
  // closed when the counter store cannot be reached.
  try {
    await consumeAvatarUploadQuota(user.id);
  } catch (error) {
    if (error instanceof AvatarUploadQuotaExceededError) {
      return NextResponse.json(
        { error: "Avatar upload limit reached for today. Please try again tomorrow." },
        { status: 429 },
      );
    }
    if (error instanceof AvatarUploadQuotaStoreError) {
      return NextResponse.json(
        { error: "Avatar uploads are temporarily unavailable. Please try again later." },
        { status: 503 },
      );
    }
    throw error;
  }

  // This endpoint is avatar-only. Client flags must never bypass pet-photo
  // verification; non-image editor exports need a separate owner-private route.
  const base64 = buffer.toString("base64");
  let check: { ok: boolean; reason?: string };
  try {
    check = await isPetPhoto(base64, realMime, user.id);
  } catch (error) {
    if (isLLMBudgetError(error)) {
      return NextResponse.json({ error: "Pet photo verification has reached today's limit. Please try again tomorrow." }, { status: 429 });
    }
    if (isLLMBudgetStoreError(error)) {
      return NextResponse.json({ error: "Pet photo verification is temporarily unavailable. Please try again later." }, { status: 503 });
    }
    throw error;
  }
  if (!check.ok) {
    return NextResponse.json({ error: check.reason }, { status: 400 });
  }

  try {
    // Force extension to match the sniffed MIME, never trust client filename
    const extByMime: Record<string, "jpg" | "png" | "webp" | "gif"> = {
      "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif",
    };
    const ext = extByMime[realMime] || "png";
    const filename = newAvatarFilename(user.id, ext);

    const result = await persistPendingAvatarMedia({
      ownerUserId: user.id,
      filename,
      data: buffer,
      contentType: realMime,
    });

    return NextResponse.json({ url: result.url });
  } catch (err: any) {
    console.error("Upload error:", err?.message);
    // SCRUM-39/61: do NOT echo err.message — strip details to client
    return NextResponse.json(
      { error: "Upload failed" },
      { status: 500 }
    );
  }
}
