/**
 * Implicit feedback signal for self-learning.
 *
 * Self-learning needs `wasHelpful` to decide whether to promote a pattern to a
 * skill. Without explicit thumbs-up, we estimate it from user behavior:
 *
 *   +1.0  user replied within 60s with ≥30 chars AND mentioned pet by name
 *   +0.6  user replied within 60s with ≥30 chars
 *   +0.3  user replied with positive lexicon (haha/lol/❤️/ㅋㅋ/감사/thanks)
 *   +0.0  default (insufficient signal)
 *   -0.5  user replied with negative lexicon (no/wrong/틀려/별로)
 *   -1.0  user abandoned (>24h silence since last reply, this is current turn)
 *
 * The signal is computed BEFORE the new reply happens, based on what the user
 * did AFTER the previous reply. That's the only way to get honest feedback.
 */

import { prisma } from "@/lib/prisma";

// Note: \b doesn't work for Korean (it's keyed off [a-zA-Z0-9_]), so we use
// ASCII patterns with word boundaries AND Korean/emoji patterns without them.
// We match if EITHER hits.
const POSITIVE_ASCII = /\b(thanks|thank you|love it|perfect|great|nice|awesome|haha|hehe|lol|love this)\b/i;
const POSITIVE_RAW = /(ㅋㅋ|ㅎㅎ|좋아|좋네|감사|❤️|😊|😍|🥰|👍|👏)/;
const NEGATIVE_ASCII = /\b(no|nope|wrong|incorrect|bad|stop|hate it)\b/i;
const NEGATIVE_RAW = /(틀려|아니야|아니라|별로|싫어|이상해|👎)/;

export interface HelpfulnessSignal {
  score: number;       // -1.0 .. +1.0
  confidence: number;  // 0..1 — low when we have little data
  reason: string;      // for debugging
}

/**
 * Compute helpfulness of the LAST pet response, given the current user message.
 * Call this BEFORE generating the new reply.
 */
export async function estimateHelpfulness(
  petId: number,
  currentUserMessage: string,
  platform: string
): Promise<HelpfulnessSignal> {
  // Find the most recent pet turn so we can score the user's reaction to it
  const recent = await prisma.petMemory.findMany({
    where: {
      pet_id: petId,
      memory_type: { startsWith: "session_" },
    },
    orderBy: { created_at: "desc" },
    take: 4,
  });

  // Most recent should be a pet turn; if not, no signal yet
  const lastPetTurn = recent.find(r => !r.content.match(/^\[user(?::[^\]]+)?\]/));
  if (!lastPetTurn) {
    return { score: 0, confidence: 0, reason: "no_prior_pet_turn" };
  }

  const ageMs = Date.now() - new Date(lastPetTurn.created_at).getTime();
  const ageMin = ageMs / 60_000;

  // Abandonment — user came back after 24h+
  if (ageMin > 24 * 60) {
    return { score: -0.5, confidence: 0.6, reason: `abandonment_${Math.round(ageMin/60)}h` };
  }

  // Lexical signals — check ASCII patterns AND Korean/emoji patterns
  if (NEGATIVE_ASCII.test(currentUserMessage) || NEGATIVE_RAW.test(currentUserMessage)) {
    return { score: -0.8, confidence: 0.8, reason: "negative_lexicon" };
  }
  if (POSITIVE_ASCII.test(currentUserMessage) || POSITIVE_RAW.test(currentUserMessage)) {
    return { score: 0.7, confidence: 0.8, reason: "positive_lexicon" };
  }

  // Engagement signals — fast reply with substance is a soft positive
  if (ageMin < 1 && currentUserMessage.length >= 30) {
    return { score: 0.6, confidence: 0.5, reason: "engaged_reply" };
  }
  if (ageMin < 5 && currentUserMessage.length >= 15) {
    return { score: 0.3, confidence: 0.4, reason: "quick_reply" };
  }

  return { score: 0, confidence: 0.2, reason: "neutral" };
}
