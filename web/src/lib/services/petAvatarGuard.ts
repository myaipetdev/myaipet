/**
 * Pet avatars must depict an animal/creature, not a human. Unlike the Catch
 * game's vision.ts (which demands a REAL live photo and rejects illustrations as
 * anti-cheat), this is permissive on style — real photo, illustration, or
 * AI-generated art are all fine — and only screens out confident humans.
 *
 * Fail-CLOSED on ordinary vendor/network errors: client-supplied avatar URLs
 * feed the public Community surface, so an unavailable classifier must not let
 * an unverified image through. Spend-cap and spend-store failures propagate so
 * callers receive their exact 429/503 boundary.
 *
 * Shared by the pet-create (POST /api/pets) and pet-edit (PATCH
 * /api/pets/[petId]) paths — both accept a client-supplied avatar_url that
 * feeds the public Community showcase, so both must gate it.
 */
import {
  consumeVisionBudget,
  isLLMBudgetError,
  isLLMBudgetStoreError,
} from "@/lib/llm/router";
import { callVisionTextWithFallback } from "@/lib/llm/vision-fallback";
import { prepareVisionImageInput } from "@/lib/services/vision-image";

export async function isHumanAvatar(imageUrl: string, authenticatedUserId: number): Promise<boolean> {
  const visionImage = await prepareVisionImageInput(imageUrl);

  const question =
    "Look at this image. It will be used as a pet/creature avatar. " +
    "Reply 'HUMAN' only if the main, clear subject is a real or illustrated human " +
    "person / human portrait / human face, with no animal or creature present. " +
    "Reply 'OK' if the main subject is an animal, a pet, a creature, an animal-like " +
    "character, or anything that is not a clear human portrait (real photo, " +
    "illustration, or AI-generated art all count as OK). Reply with ONLY 'HUMAN' or 'OK'.";

  try {
    const rawAnswer = await callVisionTextWithFallback(
      { imageUrl: visionImage, prompt: question, maxTokens: 5, temperature: 0 },
      { reserveAttempt: async () => consumeVisionBudget(authenticatedUserId) },
    );
    const answer = (rawAnswer || "").toUpperCase();
    return answer.startsWith("HUMAN");
  } catch (e) {
    if (isLLMBudgetError(e) || isLLMBudgetStoreError(e)) throw e;
    console.error("[petAvatarGuard] avatar human-check failed, failing closed:", e);
    return true;
  }
}
