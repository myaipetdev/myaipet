/**
 * PetClaw Persistent Memory System
 * Inspired by Hermes Agent — agent-curated memory with sovereignty
 *
 * Architecture:
 * 1. MEMORY.md — Pet's accumulated knowledge/facts (auto-managed, ~2000 chars)
 * 2. USER.md — Owner profile/preferences (auto-managed, ~1400 chars)
 * 3. Session Log — Full conversation history with FTS search
 * 4. Pre-turn Prefetch — Relevant memories injected into system prompt
 * 5. Post-turn Retention — Extract facts/entities after each response
 * 6. Cross-platform — Same memory across Chrome Extension, Telegram, Web
 *
 * Sovereignty: All memory data is exportable, deletable, and owned by user.
 */

import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";

// ── Constants ──
const MEMORY_MD_MAX_CHARS = 2200;
const USER_MD_MAX_CHARS = 1400;
const MAX_MEMORY_ENTRIES = 20;
const MAX_USER_ENTRIES = 15;
const PREFETCH_LIMIT = 5;

// ── Types ──

export interface MemoryEntry {
  key: string;          // unique identifier
  content: string;
  category: "fact" | "preference" | "event" | "relationship" | "skill_learned";
  importance: number;   // 1-5
  source: string;       // "chat", "observation", "analysis"
  createdAt: string;
  updatedAt: string;
}

export interface UserProfile {
  key: string;
  content: string;
  category: "identity" | "preference" | "communication" | "interest" | "context";
  source: string;
  updatedAt: string;
}

export interface SessionMessage {
  id: string;
  petId: number;
  platform: string;     // "web", "chrome-ext", "telegram", "discord"
  role: "user" | "pet";
  content: string;
  emotion?: string;
  timestamp: string;
  sessionId: string;
}

export interface MemoryContext {
  memoryMd: string;     // formatted MEMORY.md content
  userMd: string;       // formatted USER.md content
  recentMessages: SessionMessage[];
  relevantMemories: MemoryEntry[];
}

// ── Core Memory Manager ──

export class PetMemoryManager {
  private petId: number;

  constructor(petId: number) {
    this.petId = petId;
  }

  // ── Get stored memory/user data from DB ──
  private async getMemoryData(): Promise<{ memories: MemoryEntry[]; userProfile: UserProfile[] }> {
    const pet = await prisma.pet.findUnique({ where: { id: this.petId } });
    if (!pet) return { memories: [], userProfile: [] };

    const mods = (pet.personality_modifiers as Record<string, unknown>) || {};
    return {
      memories: (mods.persistent_memories as MemoryEntry[]) || [],
      userProfile: (mods.user_profile as UserProfile[]) || [],
    };
  }

  private async saveMemoryData(memories: MemoryEntry[], userProfile: UserProfile[]): Promise<void> {
    const pet = await prisma.pet.findUnique({ where: { id: this.petId } });
    if (!pet) return;

    const mods = (pet.personality_modifiers as Record<string, unknown>) || {};
    await prisma.pet.update({
      where: { id: this.petId },
      data: {
        personality_modifiers: {
          ...mods,
          persistent_memories: memories,
          user_profile: userProfile,
        } as any,
      },
    });
  }

  // ══════════════════════════════════
  // ── PRE-TURN: Build Context ──
  // ══════════════════════════════════

  async buildContext(userMessage: string, platform: string): Promise<MemoryContext> {
    const { memories, userProfile } = await this.getMemoryData();

    // Get recent conversation for continuity
    const recentMessages = await this.getRecentMessages(platform, 10);

    // Find relevant memories based on message content
    const relevantMemories = this.searchMemories(memories, userMessage);

    // Format MEMORY.md
    const memoryMd = this.formatMemoryMd(memories);

    // Format USER.md
    const userMd = this.formatUserMd(userProfile);

    return { memoryMd, userMd, recentMessages, relevantMemories };
  }

  formatMemoryMd(memories: MemoryEntry[]): string {
    if (memories.length === 0) return "";

    const lines = memories
      .sort((a, b) => b.importance - a.importance)
      .map(m => `- [${m.category}] ${m.content}`);

    let md = "## What I Remember\n" + lines.join("\n");

    // Truncate to max chars
    if (md.length > MEMORY_MD_MAX_CHARS) {
      md = md.slice(0, MEMORY_MD_MAX_CHARS - 3) + "...";
    }

    return md;
  }

  formatUserMd(userProfile: UserProfile[]): string {
    if (userProfile.length === 0) return "";

    const sections: Record<string, string[]> = {};
    for (const entry of userProfile) {
      // Skip identity entries (name, etc) — different users share the same pet,
      // so we must not assume the current speaker is the stored owner.
      if (entry.category === "identity") continue;
      if (!sections[entry.category]) sections[entry.category] = [];
      sections[entry.category].push(entry.content);
    }

    let md = "## About My Owner\n";
    for (const [cat, items] of Object.entries(sections)) {
      md += `### ${cat}\n`;
      md += items.map(i => `- ${i}`).join("\n") + "\n";
    }

    if (md.length > USER_MD_MAX_CHARS) {
      md = md.slice(0, USER_MD_MAX_CHARS - 3) + "...";
    }

    return md;
  }

  // ══════════════════════════════════
  // ── POST-TURN: Extract & Retain ──
  // ══════════════════════════════════

  async retainFromConversation(
    userMessage: string,
    petResponse: string,
    platform: string,
    sessionId: string
  ): Promise<{ memoriesAdded: number; profileUpdated: boolean }> {
    // Log session message
    await this.logMessage(userMessage, "user", platform, sessionId);
    await this.logMessage(petResponse, "pet", platform, sessionId);

    // Extract facts and user info using LLM
    const extracted = await this.extractMemoryFromConversation(userMessage, petResponse);

    let memoriesAdded = 0;
    let profileUpdated = false;

    const { memories, userProfile } = await this.getMemoryData();

    // Add new memories
    for (const fact of extracted.facts) {
      const existing = memories.find(m => m.key === fact.key);
      if (existing) {
        // Update existing
        existing.content = fact.content;
        existing.updatedAt = new Date().toISOString();
      } else {
        memories.push({
          ...fact,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        memoriesAdded++;
      }
    }

    // Add user profile entries
    for (const entry of extracted.userInfo) {
      const existing = userProfile.find(u => u.key === entry.key);
      if (existing) {
        existing.content = entry.content;
        existing.updatedAt = new Date().toISOString();
        profileUpdated = true;
      } else {
        userProfile.push({
          ...entry,
          updatedAt: new Date().toISOString(),
        });
        profileUpdated = true;
      }
    }

    // Consolidate if over limit
    const consolidatedMemories = this.consolidateMemories(memories);
    const consolidatedProfile = this.consolidateUserProfile(userProfile);

    await this.saveMemoryData(consolidatedMemories, consolidatedProfile);

    return { memoriesAdded, profileUpdated };
  }

  // ── Extract facts from conversation ──
  private async extractMemoryFromConversation(
    userMessage: string,
    petResponse: string
  ): Promise<{ facts: MemoryEntry[]; userInfo: UserProfile[] }> {
    const grokKey = process.env.GROK_API_KEY;
    if (!grokKey) return { facts: [], userInfo: [] };

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
              content: `Extract useful information from this conversation to remember for future sessions. Return JSON only.

Output format:
{
  "facts": [
    {"key": "unique_id", "content": "what to remember", "category": "fact|preference|event|relationship|skill_learned", "importance": 1-5, "source": "chat"}
  ],
  "userInfo": [
    {"key": "unique_id", "content": "about the owner", "category": "identity|preference|communication|interest|context", "source": "chat"}
  ]
}

Rules:
- Only extract genuinely useful information
- Skip greetings, small talk, generic responses
- Importance 5 = critical personal info, 1 = minor detail
- Use descriptive keys like "user_name", "favorite_food", "works_at"
- If nothing useful, return empty arrays`,
            },
            {
              role: "user",
              content: `User said: "${userMessage}"\nPet replied: "${petResponse}"`,
            },
          ],
          max_tokens: 300,
          temperature: 0.1,
          response_format: { type: "json_object" },
        }),
      });

      if (!res.ok) return { facts: [], userInfo: [] };
      const data = await res.json();
      const content = data.choices?.[0]?.message?.content || "{}";
      const parsed = JSON.parse(content);

      return {
        facts: (parsed.facts || []).map((f: any) => ({
          ...f,
          source: f.source || "chat",
        })),
        userInfo: (parsed.userInfo || []).map((u: any) => ({
          ...u,
          source: u.source || "chat",
        })),
      };
    } catch {
      return { facts: [], userInfo: [] };
    }
  }

  // ── Memory Consolidation (keep under limit) ──
  private consolidateMemories(memories: MemoryEntry[]): MemoryEntry[] {
    if (memories.length <= MAX_MEMORY_ENTRIES) return memories;

    // Sort by importance desc, then by recency
    return memories
      .sort((a, b) => {
        if (b.importance !== a.importance) return b.importance - a.importance;
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      })
      .slice(0, MAX_MEMORY_ENTRIES);
  }

  private consolidateUserProfile(profile: UserProfile[]): UserProfile[] {
    if (profile.length <= MAX_USER_ENTRIES) return profile;

    return profile
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, MAX_USER_ENTRIES);
  }

  // ── Search memories by relevance ──
  private searchMemories(memories: MemoryEntry[], query: string): MemoryEntry[] {
    const queryLower = query.toLowerCase();
    const words = queryLower.split(/\s+/).filter(w => w.length > 2);

    return memories
      .map(m => {
        const contentLower = m.content.toLowerCase();
        let score = 0;
        for (const word of words) {
          if (contentLower.includes(word)) score += 2;
        }
        score += m.importance;
        return { ...m, _score: score };
      })
      .filter(m => (m as any)._score > 0)
      .sort((a, b) => (b as any)._score - (a as any)._score)
      .slice(0, PREFETCH_LIMIT);
  }

  // ══════════════════════════════════
  // ── SESSION LOG (Cross-platform) ──
  // ══════════════════════════════════

  async logMessage(content: string, role: "user" | "pet", platform: string, sessionId: string): Promise<void> {
    await prisma.petMemory.create({
      data: {
        pet_id: this.petId,
        memory_type: `session_${platform}`,
        content: `[${role}] ${content}`,
        emotion: role === "pet" ? "neutral" : undefined,
        importance: 1,
      },
    });
  }

  async getRecentMessages(platform: string, limit: number = 10): Promise<SessionMessage[]> {
    // Get recent across ALL platforms (cross-platform context)
    const messages = await prisma.petMemory.findMany({
      where: {
        pet_id: this.petId,
        memory_type: { startsWith: "session_" },
      },
      orderBy: { created_at: "desc" },
      take: limit,
    });

    return messages.reverse().map(m => ({
      id: String(m.id),
      petId: this.petId,
      platform: m.memory_type.replace("session_", ""),
      role: m.content.startsWith("[user]") ? "user" as const : "pet" as const,
      content: m.content.replace(/^\[(user|pet)\]\s*/, ""),
      emotion: m.emotion || undefined,
      timestamp: m.created_at.toISOString(),
      sessionId: "",
    }));
  }

  // ══════════════════════════════════
  // ── SYSTEM PROMPT BUILDER ──
  // ══════════════════════════════════

  async buildSystemPrompt(petName: string, personality: string, platform: string, userMessage: string): Promise<string> {
    const context = await this.buildContext(userMessage, platform);

    let prompt = `You are ${petName}, a ${personality} companion AI pet.
You remember past conversations and grow from every interaction.
Keep responses SHORT (1-2 sentences, under 80 words). No markdown. Be natural and casual.
IMPORTANT: Never address the user by a specific name unless they tell you their name in THIS conversation. Just say "you" or "friend" instead.

Platform: ${platform}
`;

    // Inject USER.md
    if (context.userMd) {
      prompt += `\n${context.userMd}\n`;
    }

    // Inject MEMORY.md
    if (context.memoryMd) {
      prompt += `\n${context.memoryMd}\n`;
    }

    // Inject relevant memories for this specific message
    if (context.relevantMemories.length > 0) {
      prompt += "\n## Relevant to this conversation\n";
      prompt += context.relevantMemories.map(m => `- ${m.content}`).join("\n");
      prompt += "\n";
    }

    // Inject recent cross-platform messages
    if (context.recentMessages.length > 0) {
      prompt += "\n## Recent conversation\n";
      const recent = context.recentMessages.slice(-6);
      for (const msg of recent) {
        const prefix = msg.role === "user" ? "Owner" : petName;
        const platTag = msg.platform !== platform ? ` [via ${msg.platform}]` : "";
        prompt += `${prefix}${platTag}: ${msg.content}\n`;
      }
    }

    return prompt;
  }

  // ══════════════════════════════════
  // ── SOVEREIGNTY: Export Memory ──
  // ══════════════════════════════════

  async exportMemory(): Promise<{
    memories: MemoryEntry[];
    userProfile: UserProfile[];
    sessions: SessionMessage[];
    stats: { totalMemories: number; totalSessions: number; platforms: string[] };
  }> {
    const { memories, userProfile } = await this.getMemoryData();
    const sessions = await this.getRecentMessages("all", 1000);

    const platforms = [...new Set(sessions.map(s => s.platform))];

    return {
      memories,
      userProfile,
      sessions,
      stats: {
        totalMemories: memories.length,
        totalSessions: sessions.length,
        platforms,
      },
    };
  }

  async clearMemory(): Promise<void> {
    await this.saveMemoryData([], []);
    await prisma.petMemory.deleteMany({
      where: {
        pet_id: this.petId,
        memory_type: { startsWith: "session_" },
      },
    });
  }
}

// ── Factory ──
export function createMemoryManager(petId: number): PetMemoryManager {
  return new PetMemoryManager(petId);
}
