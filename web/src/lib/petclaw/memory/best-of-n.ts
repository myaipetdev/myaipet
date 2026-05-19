/**
 * Best-of-N reply selection (opt-in via PETCLAW_BEST_OF_N=true).
 *
 * Generates N candidate replies (different temperatures) and picks the one
 * that best matches the pet's learned style and the in-character voice for
 * the current mood. Cost is N× the base chat call, so it's gated by env flag
 * and only enabled for high-value paths.
 *
 * Scoring (heuristic, no second LLM call to keep cost ≤N):
 *   - In-character: matches personality_voice keywords for pet.personality_type
 *   - Length-fit: closer to target_length (Twitter=≤280, default=80) wins
 *   - Pattern-match: if any learned pattern's exemplars share token overlap
 *   - Repetition penalty: avoid replies that mirror the user's message verbatim
 */

import type { LearnedPattern } from "./self-learning";

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
