/**
 * PetClaw Self-Learning System
 * Pet records feedback-derived patterns and prompt hints
 *
 * VIGIL pattern loop:
 * 1. Repeated topics can become owner-inspectable learned patterns
 * 2. Pattern scores incorporate later positive/negative feedback
 * 3. Promoted records remain prompt metadata, not executable registry skills
 */

import { prisma } from "@/lib/prisma";
import { callLLM } from "@/lib/llm/router";
import { withLockedPetModifiers } from "@/lib/petclaw/modifier-store";
import { isProviderSafeRetainedText } from "./persistent-memory";

export interface LearnedPattern {
  id: string;
  topic: string;
  description: string;
  frequency: number;       // how many times this topic came up
  successRate: number;      // user satisfaction (0-1)
  examples: string[];       // sample responses that worked well
  createdAt: string;
  lastUsedAt: string;
  promotedToSkill: boolean;
}

const PATTERN_THRESHOLD = 3;  // promote to skill after 3 occurrences

/**
 * Surface the pet's strongest learned patterns as a chat-prompt block, so what
 * Selected high-confidence patterns can shape the prompt, rather than remaining
 * display-only. This is bounded prompt adaptation, not executable self-modifying
 * code. Picks the top patterns by successRate × frequency.
 * Returns "" when there's nothing learned yet.
 */
export function learnedPatternsBlock(pet: any): string {
  const patterns: LearnedPattern[] = (pet?.personality_modifiers?.learned_patterns) || [];
  const strong = patterns
    // Legacy non-English patterns remain owner-visible/deletable in the
    // inspector, but are quarantined from prompts until the owner reviews them.
    .filter((pattern) =>
      pattern
      && isProviderSafeRetainedText(
        `${pattern.id} ${pattern.topic} ${pattern.description}`,
      )
      && pattern.successRate > 0.5
      && pattern.frequency >= 2,
    )
    .sort((a, b) => b.successRate * b.frequency - a.successRate * a.frequency)
    .slice(0, 3);
  if (!strong.length) return "";
  return `\nLEARNED ABOUT THIS OWNER (from past chats — lean into what works):\n` +
    strong.map((p) => `- On "${p.topic}": ${p.description}`).join("\n");
}

export class SelfLearner {
  private petId: number;

  constructor(petId: number) {
    this.petId = petId;
  }

  private async getPatterns(): Promise<LearnedPattern[]> {
    const pet = await prisma.pet.findUnique({ where: { id: this.petId } });
    if (!pet) return [];
    const mods = (pet.personality_modifiers as Record<string, unknown>) || {};
    return (mods.learned_patterns as LearnedPattern[]) || [];
  }

  /**
   * Observe a conversation and detect patterns.
   * @param helpfulness  -1..+1 continuous score from feedback.ts (boolean
   *                     legacy callers still work: true→0.8, false→-0.5)
   */
  async observeConversation(
    userMessage: string,
    petResponse: string,
    helpfulness: boolean | number = 0.5,
    expectedEpoch?: number,
    onProviderAttempt?: () => void,
    signal?: AbortSignal,
  ): Promise<{ patternDetected: boolean; skillCreated: boolean; pattern?: LearnedPattern }> {
    signal?.throwIfAborted();
    // Capture the deletion/edit generation before topic classification. The
    // classifier may call an LLM, so an owner mutation can finish while it runs.
    const initialPet = await prisma.pet.findUnique({
      where: { id: this.petId },
      select: { memory_epoch: true },
    });
    signal?.throwIfAborted();
    if (!initialPet) return { patternDetected: false, skillCreated: false };
    const startEpoch = expectedEpoch ?? initialPet.memory_epoch;
    if (initialPet.memory_epoch !== startEpoch) {
      return { patternDetected: false, skillCreated: false };
    }
    // Topic classification is a secondary provider call. Never fan out a
    // credential-bearing/non-English turn, and never retain its reply as a
    // learned exemplar. Owner-local conversation history remains untouched.
    if (
      !isProviderSafeRetainedText(`owner_turn ${userMessage}`)
      || !isProviderSafeRetainedText(`pet_turn ${petResponse}`)
    ) {
      return { patternDetected: false, skillCreated: false };
    }

    const score = typeof helpfulness === "boolean"
      ? (helpfulness ? 0.8 : -0.5)
      : Math.max(-1, Math.min(1, helpfulness));
    // Normalize -1..+1 → 0..1 for successRate math
    const success01 = (score + 1) / 2;

    const topic = await this.detectTopic(userMessage, onProviderAttempt, signal);
    signal?.throwIfAborted();
    if (!topic) return { patternDetected: false, skillCreated: false };

    const outcome = await withLockedPetModifiers(this.petId, async ({ tx, pet, modifiers }) => {
      // Full/partial owner memory mutation completed during topic detection.
      // Discard this pre-mutation observation rather than recreating learned data.
      if (pet.memory_epoch !== startEpoch) return null;
      if (signal?.aborted) return null;

      const patterns: LearnedPattern[] = Array.isArray(modifiers.learned_patterns)
        ? (modifiers.learned_patterns as LearnedPattern[]).map((pattern) => ({
            ...pattern,
            examples: Array.isArray(pattern.examples) ? [...pattern.examples] : [],
          }))
        : [];
      let existing = patterns.find((pattern) => pattern.topic === topic);
      const now = new Date().toISOString();

      if (existing) {
        existing.frequency++;
        existing.lastUsedAt = now;
        // Only collect as exemplar when score is clearly positive (>= 0.4 of the
        // 0..1 normalized scale, i.e. score >= -0.2). Negative reactions don't
        // pollute the example pool.
        if (success01 >= 0.4 && petResponse.length > 10) {
          existing.examples.push(petResponse.slice(0, 200));
          if (existing.examples.length > 5) existing.examples = existing.examples.slice(-5);
        }
        // Running average — every turn contributes its actual score.
        existing.successRate = (existing.successRate * (existing.frequency - 1) + success01) / existing.frequency;
      } else {
        existing = {
          id: `pattern_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          topic,
          description: `Learned from conversations about: ${topic}`,
          frequency: 1,
          successRate: success01,
          examples: success01 >= 0.4 ? [petResponse.slice(0, 200)] : [],
          createdAt: now,
          lastUsedAt: now,
          promotedToSkill: false,
        };
        patterns.push(existing);
      }

      // `promotedToSkill` is a legacy serialized field. It now means only that
      // the pattern crossed the prompt-adaptation threshold; no executable code
      // or unregistered skill is created from private conversation examples.
      const installedSkills = Array.isArray(modifiers.installed_skills)
        ? (modifiers.installed_skills as any[]).filter((skill) => skill?.isLearned !== true)
        : [];
      if (existing.frequency >= PATTERN_THRESHOLD && !existing.promotedToSkill && existing.successRate > 0.5) {
        existing.promotedToSkill = true;
      }

      const trimmed = patterns
        .sort((a, b) => b.frequency - a.frequency)
        .slice(0, 30);
      await tx.pet.update({
        where: { id: this.petId },
        data: {
          // Merge only learning-owned fields into the current modifier document.
          personality_modifiers: {
            ...modifiers,
            learned_patterns: trimmed,
            installed_skills: installedSkills,
          } as any,
        },
      });

      return { patternDetected: true, skillCreated: false, pattern: existing };
    });

    return outcome || { patternDetected: false, skillCreated: false };
  }

  // ── Detect conversation topic ──
  private async detectTopic(
    message: string,
    onProviderAttempt?: () => void,
    signal?: AbortSignal,
  ): Promise<string | null> {
    // Simple keyword-based topic detection (fast, no API call)
    const msgLower = message.toLowerCase();

    const topicMap: Record<string, string[]> = {
      "emotional_support": ["sad", "stressed", "anxious", "worried", "lonely", "depressed", "tired", "upset", "angry", "frustrated"],
      "daily_planning": ["schedule", "plan", "tomorrow", "today", "todo", "task", "meeting", "deadline"],
      "creative_writing": ["write", "story", "poem", "creative", "imagine", "fiction"],
      "advice_giving": ["should i", "what do you think", "advice", "recommend", "suggest", "opinion"],
      "knowledge_sharing": ["explain", "how does", "what is", "why does", "tell me about", "teach"],
      "casual_chat": ["how are you", "what's up", "hey", "hello", "good morning", "good night"],
      "humor": ["joke", "funny", "laugh", "haha", "lol", "meme"],
      "motivation": ["motivate", "inspire", "encourage", "believe", "give up", "can't do"],
    };

    for (const [topic, keywords] of Object.entries(topicMap)) {
      if (keywords.some(k => msgLower.includes(k))) {
        return topic;
      }
    }

    // Only call LLM for longer, ambiguous messages
    if (message.length > 50) {
      return this.detectTopicWithLLM(message, onProviderAttempt, signal);
    }

    return null;
  }

  private async detectTopicWithLLM(
    message: string,
    onProviderAttempt?: () => void,
    signal?: AbortSignal,
  ): Promise<string | null> {
    // POINTS-ECONOMY §2.3 knob #7: routed through callLLM (task:"extract") so this
    // classification fan-out counts against the LLM daily budget instead of hitting
    // api.x.ai raw. On a budget breach callLLM throws; we swallow it (best-effort).
    try {
      const out = await callLLM({
        task: "extract",
        petId: this.petId,
        messages: [
          {
            role: "system",
            content: 'Classify this message into ONE topic. Reply with ONLY the topic slug (snake_case, max 3 words). Examples: emotional_support, daily_planning, creative_writing, tech_help, relationship_advice, health_wellness, career_guidance, learning_request',
          },
          { role: "user", content: message },
        ],
        max_tokens: 20,
        temperature: 0,
        onProviderAttempt,
        signal,
      });
      const topic = out.text?.trim().toLowerCase().replace(/[^a-z_]/g, "");
      return topic || null;
    } catch (error) {
      if (signal?.aborted) throw error;
      return null;
    }
  }

  // ── Get all learned patterns ──
  async getLearnedPatterns(): Promise<LearnedPattern[]> {
    return this.getPatterns();
  }

  // ── Export for sovereignty ──
  async exportLearning(): Promise<{
    patterns: LearnedPattern[];
    stats: { totalPatterns: number; thresholdPatterns: number; topTopics: string[] };
  }> {
    const patterns = await this.getPatterns();
    const thresholdPatterns = patterns.filter(p => p.promotedToSkill).length;
    const topTopics = patterns
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 5)
      .map(p => p.topic);

    return {
      patterns,
      stats: { totalPatterns: patterns.length, thresholdPatterns, topTopics },
    };
  }
}

export function createSelfLearner(petId: number): SelfLearner {
  return new SelfLearner(petId);
}
