/**
 * Cat Catch vision referee — the anti-cheat heart of the game.
 *
 * Players must photograph a REAL, LIVE cat with their camera. This asks Grok
 * vision to (a) confirm a real cat is present and (b) reject screenshots, photos
 * of screens, printed photos, drawings/illustrations, memes, and AI images — so
 * you can't cheat by snapping a picture off the internet.
 *
 * Reuses the x.ai chat/completions image_url pattern (see services/video.ts).
 */

export interface CatVerdict {
  isCat: boolean;
  /** anti-cheat: a genuine real-world photo, NOT a screen/print/drawing/meme/AI */
  isLivePhoto: boolean;
  confidence: number; // 0..1
  breed: string;
  furColor: string;
  mood: string;
  reason: string;
}

const VISION_MODELS = ["grok-4-1-fast-non-reasoning", "grok-4-fast-non-reasoning", "grok-3"];

const PROMPT = `You are the strict referee of a game where players must photograph a REAL, LIVE cat in the real world with their phone camera. Inspect the image and decide.

Return STRICT JSON only (no markdown), with these fields:
- "isCat": true only if a real cat is clearly the subject.
- "isLivePhoto": true only if this is a genuine photo of a real cat in the real world. Set FALSE if it is any of: a screenshot, a photo of a screen/monitor/phone/TV (look for moiré, pixel grid, bezels, glare, UI), a printed photo (paper/halftone texture), a drawing/illustration/cartoon/painting (flat shading, outlines), a meme, or an AI-generated image.
- "confidence": 0..1 — how sure a real live cat is present.
- "breed": best guess breed, else "Domestic Shorthair".
- "furColor": short color/markings description (e.g. "orange tabby", "black and white tuxedo").
- "mood": ONE word from calm, playful, grumpy, curious, sleepy, fierce, shy.
- "reason": one short sentence; if rejecting, say why (e.g. "looks like a photo of a computer screen").

Output ONLY the JSON object.`;

function getKey(): string {
  return process.env.GROK_API_KEY || process.env.XAI_API_KEY || "";
}

function parseVerdict(raw: string): CatVerdict | null {
  try {
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return null;
    const j = JSON.parse(m[0]);
    return {
      isCat: !!j.isCat,
      isLivePhoto: !!j.isLivePhoto,
      confidence: typeof j.confidence === "number" ? Math.max(0, Math.min(1, j.confidence)) : 0.5,
      breed: String(j.breed || "Domestic Shorthair").slice(0, 40),
      furColor: String(j.furColor || "").slice(0, 60),
      mood: String(j.mood || "calm").toLowerCase().slice(0, 12),
      reason: String(j.reason || "").slice(0, 200),
    };
  } catch {
    return null;
  }
}

/** Verify + describe a cat photo via Grok vision. Returns null on total failure. */
export async function verifyAndDescribeCat(imageUrl: string): Promise<CatVerdict | null> {
  const key = getKey();
  if (!key) return null;

  for (const model of VISION_MODELS) {
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
