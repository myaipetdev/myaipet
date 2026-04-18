/**
 * PetClaw Self-Learning System
 * Pet learns from experience and creates new skills autonomously
 *
 * Inspired by Hermes Agent's learning loop:
 * 1. After N conversations on a topic → pet creates a skill for it
 * 2. Skills improve based on user feedback (positive/negative)
 * 3. Learned skills are exportable via SOUL export
 */

import { prisma } from "@/lib/prisma";
import type { MemoryEntry } from "./persistent-memory";

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

  private async savePatterns(patterns: LearnedPattern[]): Promise<void> {
    const pet = await prisma.pet.findUnique({ where: { id: this.petId } });
    if (!pet) return;
    const mods = (pet.personality_modifiers as Record<string, unknown>) || {};
    await prisma.pet.update({
      where: { id: this.petId },
      data: {
        personality_modifiers: { ...mods, learned_patterns: patterns } as any,
      },
    });
  }

  // ── Observe a conversation and detect patterns ──
  async observeConversation(
    userMessage: string,
    petResponse: string,
    wasHelpful: boolean = true
  ): Promise<{ patternDetected: boolean; skillCreated: boolean; pattern?: LearnedPattern }> {
    const topic = await this.detectTopic(userMessage);
    if (!topic) return { patternDetected: false, skillCreated: false };

    const patterns = await this.getPatterns();
    let existing = patterns.find(p => p.topic === topic);

    if (existing) {
      // Update existing pattern
      existing.frequency++;
      existing.lastUsedAt = new Date().toISOString();
      if (wasHelpful && petResponse.length > 10) {
        existing.examples.push(petResponse.slice(0, 200));
        if (existing.examples.length > 5) existing.examples = existing.examples.slice(-5);
        existing.successRate = (existing.successRate * (existing.frequency - 1) + 1) / existing.frequency;
      } else {
        existing.successRate = (existing.successRate * (existing.frequency - 1)) / existing.frequency;
      }
    } else {
      // New pattern
      existing = {
        id: `pattern_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        topic,
        description: `Learned from conversations about: ${topic}`,
        frequency: 1,
        successRate: wasHelpful ? 1 : 0,
        examples: wasHelpful ? [petResponse.slice(0, 200)] : [],
        createdAt: new Date().toISOString(),
        lastUsedAt: new Date().toISOString(),
        promotedToSkill: false,
      };
      patterns.push(existing);
    }

    // Check if should promote to skill
    let skillCreated = false;
    if (existing.frequency >= PATTERN_THRESHOLD && !existing.promotedToSkill && existing.successRate > 0.5) {
      existing.promotedToSkill = true;
      await this.createSkillFromPattern(existing);
      skillCreated = true;
    }

    // Keep max 30 patterns
    const trimmed = patterns
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 30);

    await this.savePatterns(trimmed);

    return { patternDetected: true, skillCreated, pattern: existing };
  }

  // ── Detect conversation topic ──
  private async detectTopic(message: string): Promise<string | null> {
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
      return this.detectTopicWithLLM(message);
    }

    return null;
  }

  private async detectTopicWithLLM(message: string): Promise<string | null> {
    const grokKey = process.env.GROK_API_KEY;
    if (!grokKey) return null;

    try {
      const res = await fetch("https://api.x.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${grokKey}`,
        },
        body: JSON.stringify({
          model: "grok-3-mini-fast",
          messages: [
            {
              role: "system",
              content: 'Classify this message into ONE topic. Reply with ONLY the topic slug (snake_case, max 3 words). Examples: emotional_support, daily_planning, creative_writing, tech_help, relationship_advice, health_wellness, career_guidance, learning_request',
            },
            { role: "user", content: message },
          ],
          max_tokens: 20,
          temperature: 0,
        }),
      });

      if (!res.ok) return null;
      const data = await res.json();
      const topic = data.choices?.[0]?.message?.content?.trim().toLowerCase().replace(/[^a-z_]/g, "");
      return topic || null;
    } catch {
      return null;
    }
  }

  // ── Create a skill from learned pattern ──
  private async createSkillFromPattern(pattern: LearnedPattern): Promise<void> {
    const pet = await prisma.pet.findUnique({ where: { id: this.petId } });
    if (!pet) return;

    const mods = (pet.personality_modifiers as Record<string, unknown>) || {};
    const installedSkills = (mods.installed_skills as any[]) || [];

    const skillId = `learned_${pattern.topic}`;

    // Don't duplicate
    if (installedSkills.some((s: any) => s.skillId === skillId)) return;

    const bestExamples = pattern.examples.slice(0, 3).join("\n---\n");

    installedSkills.push({
      skillId,
      petId: this.petId,
      installedAt: new Date().toISOString(),
      version: "1.0.0",
      isLearned: true,
      config: {
        topic: pattern.topic,
        description: pattern.description,
        systemPrompt: `You are ${pet.name}. You've learned to help with "${pattern.topic}" from past conversations. Here are examples of good responses you've given:\n\n${bestExamples}\n\nRespond in a similar helpful way.`,
        frequency: pattern.frequency,
        successRate: pattern.successRate,
      },
    });

    await prisma.pet.update({
      where: { id: this.petId },
      data: {
        personality_modifiers: { ...mods, installed_skills: installedSkills } as any,
      },
    });

    // Log as milestone memory
    await prisma.petMemory.create({
      data: {
        pet_id: this.petId,
        memory_type: "milestone",
        content: `I learned a new skill: "${pattern.topic}" after ${pattern.frequency} conversations! Success rate: ${Math.round(pattern.successRate * 100)}%`,
        emotion: "proud",
        importance: 4,
      },
    });
  }

  // ── Get all learned patterns ──
  async getLearnedPatterns(): Promise<LearnedPattern[]> {
    return this.getPatterns();
  }

  // ── Export for sovereignty ──
  async exportLearning(): Promise<{
    patterns: LearnedPattern[];
    stats: { totalPatterns: number; skillsCreated: number; topTopics: string[] };
  }> {
    const patterns = await this.getPatterns();
    const skillsCreated = patterns.filter(p => p.promotedToSkill).length;
    const topTopics = patterns
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 5)
      .map(p => p.topic);

    return {
      patterns,
      stats: { totalPatterns: patterns.length, skillsCreated, topTopics },
    };
  }
}

export function createSelfLearner(petId: number): SelfLearner {
  return new SelfLearner(petId);
}
