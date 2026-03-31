/**
 * Video & Image Generation Service
 * Full Grok API pipeline (image + video)
 */

import { put } from "@vercel/blob";

// Save a remote image/video to Vercel Blob for permanent storage
export async function saveToBlob(remoteUrl: string, prefix = "generations"): Promise<string> {
  const maxRetries = 2;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(remoteUrl);
      if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);
      const blob = await res.blob();
      const contentType = blob.type || "image/jpeg";
      const ext = contentType.includes("mp4") ? "mp4"
        : contentType.includes("webm") ? "webm"
        : contentType.includes("png") ? "png"
        : "jpg";
      const filename = `${prefix}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const result = await put(filename, blob, { access: "public", addRandomSuffix: false });
      return result.url;
    } catch (e) {
      console.error(`saveToBlob attempt ${attempt + 1} failed:`, e);
      if (attempt === maxRetries) {
        throw new Error(`saveToBlob failed after ${maxRetries + 1} attempts: ${e}`);
      }
      await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
  throw new Error("saveToBlob unreachable");
}

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
};

const SPECIES_NAMES: Record<number, string> = {
  0: "cat", 1: "dog", 2: "parrot", 3: "turtle",
  4: "hamster", 5: "rabbit", 6: "fox", 7: "pomeranian",
};

export function buildPetPrompt(
  petName: string,
  species: number,
  personality: string,
  style: number,
  userPrompt?: string,
  avatarUrl?: string,
  appearanceDesc?: string,
): string {
  const personalityDesc = PERSONALITY_PROMPTS[personality] || PERSONALITY_PROMPTS.friendly;
  const styleDesc = STYLE_DESCRIPTORS[style] || STYLE_DESCRIPTORS[0];

  // Strip non-ASCII characters (Korean, Japanese, Chinese, etc.) to prevent text rendering in images
  const cleanPrompt = userPrompt
    ? userPrompt.replace(/[^\x00-\x7F]/g, " ").replace(/\s+/g, " ").trim()
    : undefined;
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

// Use Grok to describe a pet's appearance from their avatar
export async function describePetAvatar(avatarUrl: string): Promise<string> {
  const models = ["grok-4-1-fast-non-reasoning", "grok-4-fast-non-reasoning", "grok-3"];

  for (const model of models) {
    try {
      const res = await fetch("https://api.x.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getGrokKey()}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: "user",
              content: [
                { type: "image_url", image_url: { url: avatarUrl } },
                {
                  type: "text",
                  text: "Describe this pet's appearance for image generation. Include: species/breed, color, markings, fur type, distinctive features. Output ONLY the description. Example: 'small black and tan chihuahua with large pointed ears, short smooth fur, big round dark eyes'",
                },
              ],
            },
          ],
          max_tokens: 150,
        }),
      });

      if (!res.ok) {
        console.error(`Vision model ${model} failed:`, res.status);
        continue;
      }

      const data = await res.json();
      const desc = data.choices?.[0]?.message?.content?.trim();
      if (desc) return desc;
    } catch (e) {
      console.error(`describePetAvatar ${model} error:`, e);
    }
  }
  return "";
}

// Generate image with reference pet photo — sends image directly to Grok
export async function generateGrokImageWithRef(prompt: string, referenceUrl: string): Promise<string> {
  // Download reference image and convert to base64
  const imgRes = await fetch(referenceUrl);
  if (!imgRes.ok) throw new Error("Failed to fetch reference image");
  const imgBuffer = await imgRes.arrayBuffer();
  const base64 = Buffer.from(imgBuffer).toString("base64");
  const mimeType = imgRes.headers.get("content-type") || "image/jpeg";

  const editPrompt = `Create a new image of this EXACT same pet (same breed, colors, markings, features). New scene: ${prompt}`;

  // Try sending reference image via grok-imagine-image
  const res = await fetch("https://api.x.ai/v1/images/generations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getGrokKey()}`,
    },
    body: JSON.stringify({
      model: "grok-imagine-image",
      prompt: editPrompt,
      n: 1,
      response_format: "url",
      image: `data:${mimeType};base64,${base64}`,
    }),
  });

  if (res.ok) {
    const data = await res.json();
    const url = data.data?.[0]?.url;
    if (url) return saveToBlob(url, "generations");
  }

  // If image param not supported, log and try without
  const errText = await res.text().catch(() => "");
  console.error("Image ref attempt failed:", res.status, errText);

  // Retry with just the prompt (appearance_desc should be in the prompt already)
  return generateGrokImage(editPrompt);
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

export async function generateGrokImage(prompt: string): Promise<string> {
  const res = await fetch("https://api.x.ai/v1/images/generations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getGrokKey()}`,
    },
    body: JSON.stringify({
      model: "grok-imagine-image",
      prompt,
      n: 1,
      response_format: "url",
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Grok image API failed: ${res.status} ${text}`);
  }

  const data = await res.json();
  const url = data.data?.[0]?.url;
  if (!url) throw new Error("No image URL returned from Grok");
  // Save to Vercel Blob for permanent storage
  return saveToBlob(url, "generations");
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
    body.image_url = imageUrl;
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
    const text = await res.text();
    throw new Error(`Grok video API failed: ${res.status} ${text}`);
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
    return { status: "failed", error: `Status check failed: ${res.status}` };
  }

  const data = await res.json();

  if (data.status === "done" || data.status === "complete" || data.status === "completed") {
    const rawVideoUrl = data.video?.url || data.url || data.data?.[0]?.url;
    if (rawVideoUrl) {
      // Save video to Vercel Blob for permanent storage
      try {
        const permanentUrl = await saveToBlob(rawVideoUrl, "videos");
        return { status: "completed", videoUrl: permanentUrl };
      } catch (e) {
        console.error("Video saveToBlob failed:", e);
        return { status: "completed", videoUrl: rawVideoUrl };
      }
    }
    return { status: "failed", error: "Video completed but no URL found" };
  }

  if (data.status === "failed" || data.status === "expired") {
    return { status: "failed", error: data.error || `Video generation ${data.status}` };
  }

  // Still processing (status: "pending", "in_progress", "queued", etc.)
  return { status: "processing" };
}
