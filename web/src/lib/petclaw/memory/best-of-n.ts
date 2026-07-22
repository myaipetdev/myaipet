/**
 * Best-of-N reply selection (opt-in via PETCLAW_BEST_OF_N=true).
 *
 * Generates N candidate replies (different temperatures) and picks the one
 * that best matches the pet's learned style and the in-character voice for
 * the current mood. Cost is N× the base chat call, so it's gated by env flag
 * and only enabled for high-value paths.
 *
 * The normal selector is a separate LLM judge. If that judge is unavailable,
 * the following deterministic scoring fallback selects a candidate:
 *   - In-character: matches personality_voice keywords for pet.personality_type
 *   - Length-fit: closer to target_length (Twitter=≤280, default=80) wins
 *   - Pattern-match: if any learned pattern's exemplars share token overlap
 *   - Repetition penalty: avoid replies that mirror the user's message verbatim
 */

import type { LearnedPattern } from "./self-learning";
import { callLLM } from "@/lib/llm/router";
import { isProviderSafeRetainedText } from "./persistent-memory";

export interface ReplyCandidate {
  text: string;
  temperature: number;
}

export interface ScoredReply extends ReplyCandidate {
  score: number;
  reasons: string[];
}

const PERSONALITY_KEYWORDS: Record<string, string[]> = {
  friendly: ["love", "warm", "💕", "great", "best"],
  playful: ["hehe", "lol", "fun", "play", "🎾"],
  shy: ["…", "👉👈", "…hi", "*blush*"],
  brave: ["fearless", "strong", "courage"],
  lazy: ["yawn", "nap", "sleep", "😴", "later"],
  curious: ["?", "what", "why", "how", "tell me"],
  mischievous: ["hehe", "sneak", "tease"],
  gentle: ["calm", "peace", "soft", "gentle"],
  adventurous: ["explore", "travel", "where"],
  dramatic: ["!", "oh", "*gasps*"],
  wise: ["perhaps", "remember", "old"],
  sassy: ["hmph", "fabulous", "obviously"],
};

export function scoreReply(
  candidate: ReplyCandidate,
  ctx: {
    userMessage: string;
    personalityType: string;
    targetMaxChars: number;
    learnedPatterns: LearnedPattern[];
  }
): ScoredReply {
  const reasons: string[] = [];
  let score = 1;
  const text = candidate.text.trim();
  if (!text) return { ...candidate, score: 0, reasons: ["empty"] };

  // In-character bonus
  const keywords = PERSONALITY_KEYWORDS[ctx.personalityType] || [];
  const lower = text.toLowerCase();
  const hits = keywords.filter(k => lower.includes(k.toLowerCase())).length;
  if (hits > 0) {
    score += hits * 0.3;
    reasons.push(`character:${hits}`);
  }

  // Length-fit
  const overshoot = Math.max(0, text.length - ctx.targetMaxChars);
  if (overshoot > 0) {
    const penalty = Math.min(2, overshoot / 50);
    score -= penalty;
    reasons.push(`overlong:-${penalty.toFixed(2)}`);
  } else if (text.length < 10) {
    score -= 0.5;
    reasons.push("too_short");
  }

  // Pattern match against learned exemplars
  const userTokens = new Set(ctx.userMessage.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  for (const p of ctx.learnedPatterns) {
    const hit = p.examples.some(ex => {
      const exTokens = new Set(ex.toLowerCase().split(/\s+/));
      const overlap = [...userTokens].filter(t => exTokens.has(t)).length;
      return overlap >= 2;
    });
    if (hit && p.successRate > 0.5) {
      score += 0.4;
      reasons.push(`pattern:${p.topic}`);
      break;
    }
  }

  // Penalize echoing
  const userLower = ctx.userMessage.toLowerCase();
  if (lower.includes(userLower) && userLower.length > 20) {
    score -= 1;
    reasons.push("echo");
  }

  return { ...candidate, score, reasons };
}

export function pickBest(candidates: ReplyCandidate[], ctx: {
  userMessage: string;
  personalityType: string;
  targetMaxChars: number;
  learnedPatterns: LearnedPattern[];
}): ScoredReply {
  const scored = candidates.map(c => scoreReply(c, ctx));
  scored.sort((a, b) => b.score - a.score);
  return scored[0];
}

export const BEST_OF_N_ENABLED = process.env.PETCLAW_BEST_OF_N === "true";

export function isProviderSafeBestOfNContext(
  candidates: ReplyCandidate[],
  ctx: { userMessage: string; systemPrompt: string },
): boolean {
  return isProviderSafeRetainedText(`judge_system ${ctx.systemPrompt}`)
    && isProviderSafeRetainedText(`judge_owner_turn ${ctx.userMessage}`)
    && candidates.every((candidate) =>
      isProviderSafeRetainedText(`judge_candidate ${candidate.text}`),
    );
}

/**
 * CHORUS v2 — LLM-judge selection.
 *
 * The keyword heuristic (scoreReply/pickBest above) can't reliably tell a better
 * reply from a worse one, so best-of-N spends N× tokens for no defensible gain.
 * An independent judge over the full candidate set is the actual mechanism by
 * which best-of-N beats single-shot — the same generate-many-then-select idea, at
 * the model level; here we do it at the sampling level.
 *
 * Same GROK_API_KEY / x.ai endpoint / temperature-0 / json_object contract as
 * consolidate.ts and self-learning.ts — no new dependency, key, or capability.
 * Returns null on any failure so the caller falls back to the heuristic pickBest.
 */
export async function pickBestLLM(
  candidates: ReplyCandidate[],
  ctx: { userMessage: string; systemPrompt: string },
  petId?: number,
): Promise<{ chosen: ReplyCandidate; reason: string } | null> {
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return { chosen: candidates[0], reason: "only candidate" };
  // Judging can route to a provider different from chat. Never fan out a
  // credential-bearing/non-English current turn, retained context, or echoed
  // candidate to that secondary task.
  if (!isProviderSafeBestOfNContext(candidates, ctx)) return null;
  const labeled = candidates.map((c, i) => `[${i}]: ${c.text}`).join("\n\n");
  try {
    // Routed via the model router (task:"judge") so a pet-owner's connected model
    // can serve the judge step; falls back to the platform Grok default.
    const out = await callLLM({
      task: "judge",
      petId,
      messages: [
        { role: "system", content: 'You are a strict reply judge. Given a pet companion\'s character brief, the owner\'s message, and N candidate replies, pick the ONE candidate that best stays in character, fits the owner\'s message, and reads naturally. Reply with ONLY a JSON object: {"index": <number>, "reason": "<short>"}. No prose.' },
        { role: "user", content: `CHARACTER BRIEF:\n${ctx.systemPrompt.slice(0, 1200)}\n\nOWNER MESSAGE:\n${ctx.userMessage.slice(0, 500)}\n\nCANDIDATES:\n${labeled}` },
      ],
      max_tokens: 60,
      temperature: 0,
      response_format: { type: "json_object" },
    });
    const raw = out.text?.trim();
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const idx = Number(parsed.index);
    if (!Number.isInteger(idx) || idx < 0 || idx >= candidates.length) return null;
    return { chosen: candidates[idx], reason: String(parsed.reason || "llm-judge") };
  } catch {
    return null;
  }
}
