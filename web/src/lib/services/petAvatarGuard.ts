/**
 * Pet avatars must depict an animal/creature, not a human. Unlike the Catch
 * game's vision.ts (which demands a REAL live photo and rejects illustrations as
 * anti-cheat), this is permissive on style — real photo, illustration, or
 * AI-generated art are all fine — and only screens out confident humans.
 *
 * Fail-OPEN on vision API error/outage: a Grok hiccup must never block a
 * legitimate adoption. We only block on a clear, confident "human" verdict.
 *
 * Shared by the pet-create (POST /api/pets) and pet-edit (PATCH
 * /api/pets/[petId]) paths — both accept a client-supplied avatar_url that
 * feeds the public Community showcase, so both must gate it.
 */
export async function isHumanAvatar(imageUrl: string): Promise<boolean> {
  const key = process.env.GROK_API_KEY || process.env.XAI_API_KEY;
  if (!key) return false; // fail open — no vision configured

  const question =
    "Look at this image. It will be used as a pet/creature avatar. " +
    "Reply 'HUMAN' only if the main, clear subject is a real or illustrated human " +
    "person / human portrait / human face, with no animal or creature present. " +
    "Reply 'OK' if the main subject is an animal, a pet, a creature, an animal-like " +
    "character, or anything that is not a clear human portrait (real photo, " +
    "illustration, or AI-generated art all count as OK). Reply with ONLY 'HUMAN' or 'OK'.";

  try {
    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "grok-4-1-fast-non-reasoning",
        messages: [{
          role: "user",
          content: [
            { type: "image_url", image_url: { url: imageUrl } },
            { type: "text", text: question },
          ],
        }],
        max_tokens: 5,
        temperature: 0,
      }),
    });
    if (!res.ok) return false; // fail open on API error
    const data = await res.json();
    const answer = (data.choices?.[0]?.message?.content || "").trim().toUpperCase();
    return answer.startsWith("HUMAN");
  } catch (e) {
    console.error("[petAvatarGuard] avatar human-check failed, failing open:", e);
    return false; // fail open on network/timeout error
  }
}
