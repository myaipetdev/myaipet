/**
 * Video & Image Generation Service
 * Full Grok API pipeline (image + video)
 */

import {
  callLLM,
  consumeImageBudget,
  consumeVisionBudget,
  isLLMBudgetError,
  isLLMBudgetStoreError,
} from "@/lib/llm/router";
import { generatedEnglishOrNull } from "@/lib/generatedLanguage";
import { callVisionTextWithFallback } from "@/lib/llm/vision-fallback";
import { prepareVisionImageInput } from "@/lib/services/vision-image";

const PERSONALITY_PROMPTS: Record<string, string> = {
  friendly: "warm and approachable expression, gentle eyes, relaxed posture",
  playful: "energetic pose, bright curious eyes, mid-action, dynamic movement",
  shy: "slightly tucked posture, peeking curiously, soft gentle expression",
  brave: "confident stance, proud posture, alert ears, bold gaze",
  lazy: "relaxed and cozy, half-lidded eyes, comfortable lounging position",
  curious: "wide-eyed wonder, head tilted, exploring something new with fascination",
  mischievous: "sly grin, sneaky pose, one paw raised, playful troublemaker energy",
  gentle: "serene expression, soft gaze, calm and peaceful demeanor, tender",
  adventurous: "explorer outfit vibes, determined look, ready for a journey",
  dramatic: "over-the-top expression, theatrical pose, main character energy",
  wise: "thoughtful gaze, mature composure, knowing expression, sage-like",
  sassy: "confident smirk, one eyebrow raised, fashionable attitude, diva pose",
};

const STYLE_DESCRIPTORS: Record<number, string> = {
  0: "original photo, unmodified", // Original — won't actually be used for generation
  1: "cinematic style, dramatic lighting, shallow depth of field, film grain, warm color grading",
  2: "anime style, cel-shaded, vibrant colors, expressive eyes, Japanese animation aesthetic",
  3: "watercolor painting style, soft washes of color, delicate brushstrokes, artistic, dreamy",
  4: "3D rendered, Pixar-like quality, detailed fur textures, volumetric lighting",
  5: "pencil sketch style, hand-drawn line art, crosshatching, monochrome",
  // Codex sticker — our own ©-free collectible-creature look. NO franchise refs.
  // The UI stamps the dex number/name/badge as real text, so we ask for a clean
  // die-cut illustration on a plain background (buildPetPrompt already appends a
  // hard "no text/letters/watermarks" instruction, which is exactly what we want).
  6: "1990s collectible creature-sticker illustration: a single stylized cartoon version of this animal in a lively dynamic action pose, bold thick uniform black outline, flat two-tone cel shading, bright saturated colors, clean crisp vector-like finish, glossy die-cut sticker with a thin white cut border, centered on a plain solid soft-pastel background, cute iconic mascot design, full body",
};

const SPECIES_NAMES: Record<number, string> = {
  0: "cat", 1: "dog", 2: "parrot", 3: "turtle",
  4: "hamster", 5: "rabbit", 6: "fox", 7: "pomeranian",
};

// Translate non-ASCII prompts (Korean, Japanese, Chinese, etc.) through the
// owner-safe text router so image models understand the scene description.
export async function translatePromptIfNeeded(prompt: string, petId?: number): Promise<string> {
  if (!prompt) return prompt;
  // Pure ASCII — pass through unchanged
  if (/^[\x00-\x7F]*$/.test(prompt)) return prompt;

  try {
    const result = await callLLM({
      task: "chat",
      petId,
      messages: [
        {
          role: "system",
          content:
            "Translate the user's scene description into vivid, concrete English suitable for an image/video generation prompt. Preserve the visual specifics (camera angle, action, environment, mood). Output ONLY the translation, no explanation, no quotes.",
        },
        { role: "user", content: prompt },
      ],
      max_tokens: 240,
      temperature: 0.2,
    });
    const out = generatedEnglishOrNull(result.text);
    if (out) return out;
  } catch (e) {
    console.error("translatePromptIfNeeded failed:", e);
  }
  // Fallback: strip non-ASCII
  return prompt.replace(/[^\x00-\x7F]/g, " ").replace(/\s+/g, " ").trim();
}

export function buildPetPrompt(
  petName: string,
  species: number,
  personality: string,
  style: number,
  userPrompt?: string,
  avatarUrl?: string,
  appearanceDesc?: string,
  styleDescOverride?: string,
): string {
  const personalityDesc = PERSONALITY_PROMPTS[personality] || PERSONALITY_PROMPTS.friendly;
  // styleDescOverride lets callers (e.g. Codex sticker variants) swap the style
  // fragment without a fixed STYLE_DESCRIPTORS slot per variant.
  const styleDesc = styleDescOverride || STYLE_DESCRIPTORS[style] || STYLE_DESCRIPTORS[0];

  // userPrompt is expected to be already translated to English (callers should run translatePromptIfNeeded)
  const cleanPrompt = userPrompt ? userPrompt.replace(/\s+/g, " ").trim() : undefined;
  const scenePrompt = cleanPrompt ? `scene: ${cleanPrompt}` : undefined;

  const parts: string[] = [];
  if (appearanceDesc) {
    if (scenePrompt) {
      parts.push(`A ${appearanceDesc}, ${scenePrompt}`);
    } else {
      parts.push(`A ${appearanceDesc}, ${personalityDesc}`);
    }
  } else {
    const speciesName = SPECIES_NAMES[species] || "pet";
    if (scenePrompt) {
      parts.push(`A cute ${speciesName} named ${petName}, ${scenePrompt}`);
    } else {
      parts.push(`A charming ${speciesName} named ${petName}, ${personalityDesc}`);
    }
  }
  parts.push(styleDesc);
  parts.push("high quality, detailed, beautiful composition");
  parts.push("DO NOT include any text, words, letters, watermarks, or writing in the image");

  return parts.join(", ");
}

// Describe a pet through the metered xAI → OpenAI vision chain.
export async function describePetAvatar(avatarUrl: string, authenticatedUserId: number): Promise<string> {
  const visionImage = await prepareVisionImageInput(avatarUrl);
  try {
    const description = await callVisionTextWithFallback(
      {
        imageUrl: visionImage,
        prompt: "Describe this pet's appearance for image generation. Include: species/breed, color, markings, fur type, distinctive features. Output ONLY the description. Example: 'small black and tan chihuahua with large pointed ears, short smooth fur, big round dark eyes'",
        maxTokens: 150,
      },
      { reserveAttempt: async () => consumeVisionBudget(authenticatedUserId) },
    );
    return generatedEnglishOrNull(description) || "";
  } catch (error) {
    if (isLLMBudgetError(error) || isLLMBudgetStoreError(error)) throw error;
    return "";
  }
}

// Generate image with reference pet photo — sends image directly to Grok
export async function generateGrokImageWithRef(
  prompt: string,
  referenceUrl: string,
  userId: number,
): Promise<string> {
  // Local private media and inline data are verified directly. External URLs
  // are SSRF-checked on every redirect, streamed with an 8MB ceiling, and
  // magic-byte verified before any bytes are sent to the image provider.
  const referenceImage = await prepareVisionImageInput(referenceUrl, { materializeExternal: true });

  const editPrompt = `Create a new image of this EXACT same pet (same breed, colors, markings, features). New scene: ${prompt}`;
  const key = getGrokKey();

  // Count the actual reference-image provider submission. If the provider
  // rejects that request and we retry text-only below, that second submission
  // reserves its own attempt as well.
  await consumeImageBudget(userId, "xai");
  const res = await fetch("https://api.x.ai/v1/images/generations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: "grok-imagine-image",
      prompt: editPrompt,
      n: 1,
      response_format: "url",
      image: referenceImage,
    }),
  });

  if (res.ok) {
    const data = await res.json().catch(() => null);
    const url = data?.data?.[0]?.url;
    if (url) return url;
  }

  // If image param not supported, log and try without
  console.error("Image ref attempt failed:", res.status);

  // Retry with just the prompt (appearance_desc should be in the prompt already)
  return generateGrokImage(editPrompt, userId);
}

export function buildAvatarPrompt(
  species: number,
  personality: string,
  speciesName?: string,
  customTraits?: string,
): string {
  const name = speciesName || SPECIES_NAMES[species] || "pet";
  const personalityDesc = PERSONALITY_PROMPTS[personality] || PERSONALITY_PROMPTS.friendly;
  const traitsDesc = customTraits ? `, with special traits: ${customTraits}` : "";

  return `A ${name}${traitsDesc}, ${personalityDesc}, character portrait, expressive eyes, detailed fur/skin texture, warm cinematic lighting, clean gradient background, professional digital illustration, high quality rendering, centered portrait composition, 4K ultra detailed`;
}

function getGrokKey(): string {
  const key = process.env.GROK_API_KEY;
  if (!key) throw new Error("GROK_API_KEY not configured");
  return key;
}

export type GrokImageModel = "grok-imagine-image" | "grok-2-image";

/** Return the ephemeral upstream URL. The owning route persists it exactly once. */
export async function generateGrokImage(
  prompt: string,
  userId: number,
  model: GrokImageModel = "grok-imagine-image",
): Promise<string> {
  const key = getGrokKey();
  await consumeImageBudget(userId, "xai");
  const res = await fetch("https://api.x.ai/v1/images/generations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      prompt,
      n: 1,
      response_format: "url",
    }),
  });

  if (!res.ok) {
    throw new Error(`Grok image API failed: HTTP ${res.status}`);
  }

  const data = await res.json().catch(() => null);
  const url = data?.data?.[0]?.url;
  if (!url) throw new Error("No image URL returned from Grok");
  return url;
}

export async function submitGrokVideo(
  prompt: string,
  duration: number,
  imageUrl?: string,
): Promise<{ requestId: string }> {
  const body: any = {
    model: "grok-imagine-video",
    prompt,
    duration: Math.min(15, Math.max(1, duration)),
    aspect_ratio: "16:9",
    resolution: "720p",
  };

  if (imageUrl) {
    // Never hand a private /uploads path (or a third-party URL that can follow
    // redirects into private networks) to xAI. Materialise verified bytes into
    // a bounded data URI before the provider request.
    body.image_url = await prepareVisionImageInput(imageUrl, { materializeExternal: true });
  }

  const res = await fetch("https://api.x.ai/v1/videos/generations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getGrokKey()}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`Grok video API failed: HTTP ${res.status}`);
  }

  const data = await res.json();
  const requestId = data.request_id || data.id;
  if (!requestId) throw new Error("No request_id returned from Grok video API");
  return { requestId };
}

export async function checkGrokVideoStatus(requestId: string): Promise<{
  status: string;
  videoUrl?: string;
  error?: string;
}> {
  const res = await fetch(
    `https://api.x.ai/v1/videos/${requestId}`,
    {
      headers: { Authorization: `Bearer ${getGrokKey()}` },
    }
  );

  if (!res.ok) {
    if (res.status === 408 || res.status === 429 || res.status >= 500) {
      return { status: "processing" };
    }
    return { status: "failed", error: `Status check failed: ${res.status}` };
  }

  const data = await res.json();

  if (data.status === "done" || data.status === "complete" || data.status === "completed") {
    const rawVideoUrl = data.video?.url || data.url || data.data?.[0]?.url;
    if (rawVideoUrl) {
      // Status checks are read-only. The owning Generation caller atomically
      // claims and persists this ephemeral URL exactly once.
      return { status: "completed", videoUrl: rawVideoUrl };
    }
    return { status: "failed", error: "Video completed but no URL found" };
  }

  if (data.status === "failed" || data.status === "expired") {
    return {
      status: "failed",
      error: typeof data.error === "string"
        ? data.error.slice(0, 500)
        : `Video generation ${data.status}`,
    };
  }

  // Still processing (status: "pending", "in_progress", "queued", etc.)
  return { status: "processing" };
}
