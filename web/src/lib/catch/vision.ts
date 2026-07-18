/**
 * Catch vision referee — the anti-cheat heart of the game.
 *
 * Players must photograph a REAL, LIVE animal with their camera — most often a
 * cat or dog, but ANY real animal counts (bird, squirrel, rabbit, duck, etc.).
 * Grok vision (a) confirms a real live animal is present and (b) rejects
 * screenshots, photos of screens, printed photos, drawings/illustrations,
 * memes, and AI images — so you can't cheat by snapping a picture off a screen.
 *
 * Reuses the x.ai chat/completions image_url pattern (see services/video.ts).
 */

import {
  generatedEnglishOrFallback,
  generatedEnglishOrNull,
} from "@/lib/generatedLanguage";

export interface AnimalVerdict {
  /** a real, live animal is clearly the subject (cat/dog or otherwise) */
  isAnimal: boolean;
  /** the animal type, lowercased — e.g. "cat", "dog", "bird", "squirrel",
   *  "rabbit", "duck", "fox"; "other" if a real animal but unidentifiable */
  kind: string;
  /** anti-cheat: a genuine real-world photo, NOT a screen/print/drawing/meme/AI */
  isLivePhoto: boolean;
  confidence: number; // 0..1
  breed: string;
  furColor: string;
  mood: string;
  reason: string;
}

const VISION_MODELS = ["grok-4-1-fast-non-reasoning", "grok-4-fast-non-reasoning", "grok-3"];

const PROMPT = `You are the strict referee of a game where players must photograph a REAL, LIVE animal in the real world with their phone camera. It is usually a cat or a dog, but ANY real animal counts (bird, squirrel, rabbit, duck, pigeon, fox, etc.). Inspect the image and decide.

Return STRICT JSON only (no markdown), with these fields:
- "isAnimal": true only if a real, live animal is clearly the subject.
- "kind": the animal type as ONE lowercase word — e.g. "cat", "dog", "bird", "squirrel", "rabbit", "duck", "pigeon", "fox", "horse". Use "other" only if it's clearly a real animal you can't name.
- "isLivePhoto": true only if this is a genuine photo of a real animal in the real world. Set FALSE if it is any of: a screenshot, a photo of a screen/monitor/phone/TV (look for moiré, pixel grid, bezels, glare, UI), a printed photo (paper/halftone texture), a drawing/illustration/cartoon/painting (flat shading, outlines), a plush toy/figurine, a meme, or an AI-generated image.
- "confidence": 0..1 — how sure a real live animal is present.
- "breed": best-guess breed/species (e.g. "Domestic Shorthair", "Golden Retriever", "House Sparrow"); else a sensible default for the kind.
- "furColor": short color/markings description (e.g. "orange tabby", "black and white").
- "mood": ONE word from calm, playful, grumpy, curious, sleepy, fierce, shy.
- "reason": one short sentence; if rejecting, say why (e.g. "looks like a photo of a computer screen").

Output ONLY the JSON object.`;

function getKey(): string {
  return process.env.GROK_API_KEY || process.env.XAI_API_KEY || "";
}

function sanitizeKind(raw: any): string {
  const k = String(raw || "other").toLowerCase().trim().replace(/[^a-z]/g, "").slice(0, 16);
  return k || "other";
}

function parseVerdict(raw: string): AnimalVerdict | null {
  try {
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return null;
    const j = JSON.parse(m[0]);
    const kind = sanitizeKind(j.kind);
    // Back-compat: older prompt used "isPet".
    const isAnimal = !!(j.isAnimal ?? j.isPet);
    const isDog = kind === "dog";
    const fallbackBreed = isDog ? "Mixed Breed" : kind === "cat" ? "Domestic Shorthair" : "Wild";
    const allowedMoods = new Set(["calm", "playful", "grumpy", "curious", "sleepy", "fierce", "shy"]);
    const mood = String(j.mood || "calm").toLowerCase().trim();
    return {
      isAnimal,
      kind,
      isLivePhoto: !!j.isLivePhoto,
      confidence: typeof j.confidence === "number" ? Math.max(0, Math.min(1, j.confidence)) : 0.5,
      breed: generatedEnglishOrFallback(j.breed, fallbackBreed).slice(0, 40),
      furColor: (generatedEnglishOrNull(j.furColor) || "").slice(0, 60),
      mood: allowedMoods.has(mood) ? mood : "calm",
      reason: generatedEnglishOrFallback(
        j.reason,
        "The image did not pass the live-animal check.",
      ).slice(0, 200),
    };
  } catch {
    return null;
  }
}

/** Verify + describe an animal photo via Grok vision. Returns null on total failure. */
export async function verifyAndDescribeAnimal(
  imageUrl: string,
  reserveAttempt: () => Promise<void>,
): Promise<AnimalVerdict | null> {
  const key = getKey();
  if (!key) return null;

  for (const model of VISION_MODELS) {
    // The model fallback loop can make up to three real provider requests; each
    // one needs its own durable global + authenticated-owner reservation.
    await reserveAttempt();
    try {
      const res = await fetch("https://api.x.ai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model,
          messages: [{
            role: "user",
            content: [
              { type: "image_url", image_url: { url: imageUrl } },
              { type: "text", text: PROMPT },
            ],
          }],
          max_tokens: 220,
          temperature: 0,
        }),
      });
      if (!res.ok) continue;
      const data = await res.json();
      const content = data.choices?.[0]?.message?.content?.trim();
      const verdict = content ? parseVerdict(content) : null;
      if (verdict) return verdict;
    } catch {
      continue;
    }
  }
  return null;
}
