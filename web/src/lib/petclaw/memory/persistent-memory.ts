/**
 * PetClaw Persistent Memory System
 * VIGIL — agent-curated memory with sovereignty
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
import { callLLM } from "@/lib/llm/router";

// ── Constants ──
// SCRUM-74 §2-2: caps raised. 20-entry ledger risked "forgetting" for 6mo+
// users; bumped to 40 entries / 4KB. Beyond ~50 entries the VIGIL
// markdown-ledger pattern starts losing precision — at that point we fall
// back to an embedding layer (planned layer 6, see /architecture page).
const MEMORY_MD_MAX_CHARS = 4000;
const USER_MD_MAX_CHARS = 2400;
const MAX_MEMORY_ENTRIES = 40;
const MAX_USER_ENTRIES = 25;
const PREFETCH_LIMIT = 6;

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

  /**
   * Session-only logging — used when the LLM call failed and we have no reply
   * to extract from, but still want a record of what the user said. Cheaper
   * than retainFromConversation (no Grok call).
   */
  async logTurnOnly(userMessage: string, platform: string, sessionId: string, speakerId?: string | number): Promise<void> {
    await this.logMessage(userMessage, "user", platform, sessionId, speakerId);
  }

  async retainFromConversation(
    userMessage: string,
    petResponse: string,
    platform: string,
    sessionId: string,
    speakerId?: string | number
  ): Promise<{ memoriesAdded: number; profileUpdated: boolean }> {
    // Log session message
    await this.logMessage(userMessage, "user", platform, sessionId, speakerId);
    await this.logMessage(petResponse, "pet", platform, sessionId);

    // Extract facts and user info using LLM
    const extracted = await this.extractMemoryFromConversation(userMessage, petResponse);

    let memoriesAdded = 0;
    let profileUpdated = false;

    const { memories, userProfile } = await this.getMemoryData();
    const now = new Date().toISOString();

    // Add new memories — with contradiction supersede support
    for (const fact of extracted.facts) {
      // Same-key entries are updates (already supported)
      // The new `replacesKey` field lets the LLM mark "this contradicts X" so the
      // outdated entry gets archived (not silently kept alongside the new one).
      const replacesKey = (fact as any).replacesKey as string | undefined;
      if (replacesKey && replacesKey !== fact.key) {
        const stale = memories.findIndex(m => m.key === replacesKey);
        if (stale !== -1) memories.splice(stale, 1);
      }

      const existing = memories.find(m => m.key === fact.key);
      if (existing) {
        existing.content = fact.content;
        existing.updatedAt = now;
      } else {
        memories.push({ ...fact, createdAt: now, updatedAt: now });
        memoriesAdded++;
      }
    }

    // Add user profile entries — speaker_id keyed so concurrent speakers don't
    // overwrite each other. Identity claims are namespaced per speaker.
    for (const entry of extracted.userInfo) {
      // Namespace key by speaker so Alice's "I love sushi" doesn't overwrite Bob's preference
      const speakerKey = speakerId != null ? `s${speakerId}_${entry.key}` : entry.key;
      const namespacedEntry = { ...entry, key: speakerKey };
      const existing = userProfile.find(u => u.key === namespacedEntry.key);
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

    // Consolidate if over limit (decay-weighted)
    const consolidatedMemories = this.consolidateMemories(memories);
    const consolidatedProfile = this.consolidateUserProfile(userProfile);

    await this.saveMemoryData(consolidatedMemories, consolidatedProfile);

    // Reflection cycle — let the consolidator's gate decide whether to actually
    // run (cheap no-op if not enough new turns). Fire-and-forget; we never wait.
    import("./consolidate").then(({ consolidateMemory }) => {
      consolidateMemory(this.petId, false).catch(() => {});
    }).catch(() => {});

    return { memoriesAdded, profileUpdated };
  }

  // ── Extract facts from conversation ──
  private async extractMemoryFromConversation(
    userMessage: string,
    petResponse: string
  ): Promise<{ facts: MemoryEntry[]; userInfo: UserProfile[] }> {
    // POINTS-ECONOMY §2.3 knob #7: routed through callLLM (task:"extract") so this
    // memory fan-out counts against the LLM daily budget (consumeLLMBudget) instead
    // of hitting api.x.ai raw. On a budget breach callLLM throws LLMBudgetError,
    // which we swallow to a no-op extraction — memory is best-effort, never fatal.
    try {
      const out = await callLLM({
        task: "extract",
        petId: this.petId,
        messages: [
          {
            role: "system",
            content: `Extract useful information from this conversation to remember for future sessions. Return JSON only.

Output format:
{
  "facts": [
    {"key": "unique_id", "content": "what to remember", "category": "fact|preference|event|relationship|skill_learned", "importance": 1-5, "source": "chat", "replacesKey": "optional_old_key_this_contradicts"}
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
- If this fact contradicts/replaces an older one (e.g. user changed mind: "I love sushi" → "I hate sushi now"), set "replacesKey" to the old key so we drop the outdated entry
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
      });

      const content = out.text || "{}";
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
      // Any failure (incl. LLMBudgetError on a budget breach) → best-effort no-op.
      return { facts: [], userInfo: [] };
    }
  }

  // ── Memory Consolidation with decay ──
  // Score = importance * exp(-age_days / HALFLIFE). Old low-importance entries
  // fall off naturally even if we're below cap, giving us self-trimming noise.
  private decayScore(m: MemoryEntry): number {
    const HALFLIFE_DAYS = 30;
    const ageMs = Date.now() - new Date(m.updatedAt).getTime();
    const ageDays = Math.max(0, ageMs / 86_400_000);
    return m.importance * Math.exp(-ageDays / HALFLIFE_DAYS);
  }

  private consolidateMemories(memories: MemoryEntry[]): MemoryEntry[] {
    // Stage 1: prune entries with decayed score below floor (only kicks in for
    // importance:1 entries older than ~30 days)
    const PRUNE_FLOOR = 0.3;
    const live = memories.filter(m => this.decayScore(m) >= PRUNE_FLOOR);

    if (live.length <= MAX_MEMORY_ENTRIES) return live;

    // Stage 2: still over cap → keep top-N by decay score
    return live
      .sort((a, b) => this.decayScore(b) - this.decayScore(a))
      .slice(0, MAX_MEMORY_ENTRIES);
  }

  private consolidateUserProfile(profile: UserProfile[]): UserProfile[] {
    if (profile.length <= MAX_USER_ENTRIES) return profile;

    return profile
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, MAX_USER_ENTRIES);
  }

  // ── Search memories by relevance ──
  // Lexical retrieval with token overlap + bigram boost + importance + decay.
  // Beats pure substring matching: "had pasta" now retrieves "loves Italian food"
  // when the entry contains "pasta" as one of its tokens (e.g. via consolidation
  // it became "loves Italian food (pasta, pizza)").
  private searchMemories(memories: MemoryEntry[], query: string): MemoryEntry[] {
    const normalize = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
    const tokenize = (s: string) => normalize(s).split(" ").filter(w => w.length > 1);
    const bigrams = (toks: string[]) => toks.slice(0, -1).map((t, i) => `${t} ${toks[i + 1]}`);

    const qTokens = new Set(tokenize(query));
    const qBigrams = new Set(bigrams([...qTokens]));
    if (qTokens.size === 0) return [];

    return memories
      .map(m => {
        const mTokens = tokenize(m.content);
        const mBigrams = new Set(bigrams(mTokens));
        let score = 0;
        // Token overlap (1 point each)
        for (const t of mTokens) if (qTokens.has(t)) score += 1;
        // Bigram boost (2 points each — phrase matches are stronger signals)
        for (const b of mBigrams) if (qBigrams.has(b)) score += 2;
        // Importance bonus
        score += m.importance * 0.5;
        // Recency / decay bonus
        score *= 0.5 + 0.5 * Math.min(1, this.decayScore(m) / 3);
        return { ...m, _score: score };
      })
      .filter(m => (m as any)._score >= 1)
      .sort((a, b) => (b as any)._score - (a as any)._score)
      .slice(0, PREFETCH_LIMIT);
  }

  // ══════════════════════════════════
  // ── SESSION LOG (Cross-platform) ──
  // ══════════════════════════════════

  async logMessage(
    content: string,
    role: "user" | "pet",
    platform: string,
    sessionId: string,
    speakerId?: string | number
  ): Promise<void> {
    // Speaker tagging — `[user:42]` instead of plain `[user]` when we know who
    // is talking. Lets multi-speaker pets (shared Telegram/Discord) keep their
    // identity claims separate without a schema migration.
    const tag = role === "user" && speakerId != null ? `[user:${speakerId}]` : `[${role}]`;
    await prisma.petMemory.create({
      data: {
        pet_id: this.petId,
        memory_type: `session_${platform}`,
        content: `${tag} ${content}`,
        emotion: role === "pet" ? "neutral" : undefined,
        importance: 1,
      },
    });
  }

  async getRecentMessages(platform: string, limit: number = 10): Promise<SessionMessage[]> {
    const messages = await prisma.petMemory.findMany({
      where: {
        pet_id: this.petId,
        memory_type: { startsWith: "session_" },
      },
      orderBy: { created_at: "desc" },
      take: limit,
    });

    return messages.reverse().map(m => {
      const userMatch = m.content.match(/^\[user(?::([^\]]+))?\]\s*/);
      const role = userMatch ? "user" as const : "pet" as const;
      const content = m.content.replace(/^\[(user(?::[^\]]+)?|pet)\]\s*/, "");
      return {
        id: String(m.id),
        petId: this.petId,
        platform: m.memory_type.replace("session_", ""),
        role,
        content,
        emotion: m.emotion || undefined,
        timestamp: m.created_at.toISOString(),
        sessionId: "",
      };
    });
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
