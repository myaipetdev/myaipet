/**
 * PetClaw Persistent Memory System
 * VIGIL — agent-curated memory with sovereignty
 *
 * Architecture (honest bounds — this is a CAPPED durable ledger, not "∞"):
 * 1. MEMORY.md — pet's distilled facts (auto-managed, decay-weighted cap:
 *    40 entries / ~4000 chars — see MAX_MEMORY_ENTRIES)
 * 2. USER.md — owner profile/preferences (cap: 25 entries / ~2400 chars)
 * 3. Session Log — per-turn chat rows in pet_memories (uncapped growth;
 *    export returns the most recent 1000)
 * 4. Pre-turn Prefetch — direct lexical relevance retrieval (token/bigram
 *    overlap, with importance/recency used only as tie-breakers; no FTS index)
 * 5. Post-turn Retention — best-effort extraction of selected useful facts
 * 6. Cross-surface lineage — opted-in surfaces write to one owner-scoped
 *    ledger while retaining platform/session/speaker metadata
 *
 * Sovereignty: the owner can inspect/correct/delete active recall-bearing data;
 * export and backup/public-record bounds are documented separately.
 */

import { prisma } from "@/lib/prisma";
import { callLLM } from "@/lib/llm/router";
import { containsHangul } from "@/lib/generatedLanguage";
import type { Prisma } from "@/generated/prisma/client";
import { readPetMemoryEpoch, withLockedPetModifiers } from "@/lib/petclaw/modifier-store";
import { containsStrongAgentOfficeSecret } from "../agent/office-task-contract";
import {
  invalidateDerivedMemoryModifiers,
  redactUnprovenancedRecallStores,
} from "./invalidation";

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
const PROFILE_PREFETCH_LIMIT = 4;
const RECENT_CONTEXT_LIMIT = 6;

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
  speakerId: string | null;
  content: string;
  emotion?: string;
  timestamp: string;
  // Legacy rows have no recoverable session id, so they return null rather
  // than a fabricated identifier that could merge unrelated conversations.
  sessionId: string | null;
}

export interface MemoryContext {
  memoryMd: string;     // formatted query-selected MEMORY.md content
  userMd: string;       // formatted query-selected, provider-safe USER.md content
  recentMessages: SessionMessage[];
  relevantMemories: MemoryEntry[];
  relevantUserProfile: UserProfile[];
}

export interface SelectedRetainedContext {
  memoryMd: string;
  userMd: string;
  relevantMemories: MemoryEntry[];
  relevantUserProfile: UserProfile[];
}

const RETRIEVAL_STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "been", "but", "by", "can",
  "could", "did", "do", "does", "for", "from", "had", "has", "have", "he",
  "her", "hers", "him", "his", "how", "i", "if", "in", "is", "it", "its",
  "me", "my", "of", "on", "or", "our", "ours", "please", "she", "should",
  "tell", "that", "the", "their", "them", "there", "these", "they", "this",
  "to", "us", "was", "we", "were", "what", "when", "where", "which", "who",
  "why", "will", "with", "would", "you", "your", "yours",
]);

// Retained ledgers may contain owner-authored credentials despite extraction
// instructions. They remain available to owner inspect/export controls, but are
// never copied into a model-provider prompt or recall-tool result.
//
// Generic words such as "token", "secret", and "credential" are legitimate
// product/security vocabulary. Reject them only when they label a concrete,
// token-shaped value. Specific credential formats and sensitive field labels
// share the stricter Office-task detector so the two provider boundaries do
// not drift apart.
const EXPLICIT_RETAINED_SECRET_PATTERN =
  /(?:^|[^A-Za-z0-9])(?:api[\s_-]*key|access[\s_-]*token|auth(?:entication)?[\s_-]*token|bearer[\s_-]*token|client[\s_-]*secret|password|passcode|private[\s_-]*key|recovery[\s_-]*(?:code|phrase)|refresh[\s_-]*token|seed[\s_-]*phrase|session[\s_-]*(?:cookie|token)|credential|mnemonic|secret|token|jwt)\s*(?:=|:|\bis\b)\s*["']?[A-Za-z0-9._~+/=%:@-]{8,}/i;

function normalizeForRetrieval(value: string): string {
  return value
    .slice(0, 4000)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Small, deterministic English morphology layer for private-memory recall.
 * It is intentionally narrower than fuzzy search: enough for common plural
 * questions ("priorities") to match retained keys ("launch_priority"),
 * without manufacturing relevance between unrelated memories.
 */
export function canonicalRetainedRetrievalToken(word: string): string {
  const value = word.toLowerCase();
  if (value.length > 4 && value.endsWith("ies")) return `${value.slice(0, -3)}y`;
  if (
    value.length > 4
    && value.endsWith("s")
    && !value.endsWith("ss")
    && !value.endsWith("us")
    && !value.endsWith("is")
  ) {
    return value.slice(0, -1);
  }
  return value;
}

function retrievalTokens(value: string): string[] {
  return normalizeForRetrieval(value)
    .split(" ")
    .map(canonicalRetainedRetrievalToken)
    .filter((word) => word.length > 1 && !RETRIEVAL_STOP_WORDS.has(word));
}

function retrievalBigrams(tokens: string[]): Set<string> {
  return new Set(tokens.slice(0, -1).map((token, index) => `${token} ${tokens[index + 1]}`));
}

function lexicalRelevanceScore(candidate: string, query: string): number | null {
  const queryTokens = [...new Set(retrievalTokens(query))];
  if (queryTokens.length === 0) return null;

  const candidateTokens = retrievalTokens(candidate);
  const queryTokenSet = new Set(queryTokens);
  const candidateTokenSet = new Set(candidateTokens);
  let tokenOverlap = 0;
  for (const token of candidateTokenSet) {
    if (queryTokenSet.has(token)) tokenOverlap += 1;
  }
  // Importance or recency may rank a direct match, but can never manufacture
  // relevance when there is no lexical intersection.
  if (tokenOverlap === 0) return null;

  const queryBigrams = retrievalBigrams(queryTokens);
  const candidateBigrams = retrievalBigrams(candidateTokens);
  let bigramOverlap = 0;
  for (const bigram of candidateBigrams) {
    if (queryBigrams.has(bigram)) bigramOverlap += 1;
  }
  return tokenOverlap * 2 + bigramOverlap * 3;
}

export function isProviderSafeRetainedText(value: string): boolean {
  return (
    !containsHangul(value)
    && !containsStrongAgentOfficeSecret(value)
    // Stored ledger keys commonly use snake_case. Match their separator
    // directly instead of replacing every underscore/hyphen in the complete
    // value, which can destroy the very credential signature being checked.
    && !EXPLICIT_RETAINED_SECRET_PATTERN.test(value)
  );
}

/**
 * Provider-bound historical context must be both safe and directly relevant to
 * the current request. This is deliberately lexical and fail-closed: owner
 * inspect/export remains the complete source of truth, while inference gets a
 * bounded subset only.
 */
export function isProviderRelevantRetainedText(value: string, query: string): boolean {
  return isProviderSafeRetainedText(value) && lexicalRelevanceScore(value, query) !== null;
}

export function selectRelevantMemories(
  memories: MemoryEntry[],
  query: string,
  limit = PREFETCH_LIMIT,
): MemoryEntry[] {
  const boundedLimit = Math.max(0, Math.min(PREFETCH_LIMIT, Math.trunc(limit) || 0));
  if (boundedLimit === 0) return [];

  return memories
    // The separator makes a sensitive ledger key (for example
    // `deployment_password`) an explicit label without treating normal prose
    // such as "API token rotation policy" as a credential.
    .filter((memory) => isProviderSafeRetainedText(`${memory.key}: ${memory.content}`))
    .map((memory) => ({
      memory,
      score: lexicalRelevanceScore(`${memory.key} ${memory.category} ${memory.content}`, query),
    }))
    .filter((candidate): candidate is { memory: MemoryEntry; score: number } => candidate.score !== null)
    .sort((left, right) => {
      const scoreDelta = right.score - left.score;
      if (scoreDelta !== 0) return scoreDelta;
      const importanceDelta = right.memory.importance - left.memory.importance;
      if (importanceDelta !== 0) return importanceDelta;
      return new Date(right.memory.updatedAt).getTime() - new Date(left.memory.updatedAt).getTime();
    })
    .slice(0, boundedLimit)
    .map(({ memory }) => memory);
}

export function selectRelevantUserProfile(
  userProfile: UserProfile[],
  query: string,
  limit = PROFILE_PREFETCH_LIMIT,
): UserProfile[] {
  const boundedLimit = Math.max(0, Math.min(PROFILE_PREFETCH_LIMIT, Math.trunc(limit) || 0));
  if (boundedLimit === 0) return [];

  return userProfile
    .filter((entry) => (
      entry.category !== "identity"
      && isProviderSafeRetainedText(`${entry.key}: ${entry.content}`)
    ))
    .map((entry) => ({
      entry,
      score: lexicalRelevanceScore(`${entry.key} ${entry.category} ${entry.content}`, query),
    }))
    .filter((candidate): candidate is { entry: UserProfile; score: number } => candidate.score !== null)
    .sort((left, right) => {
      const scoreDelta = right.score - left.score;
      if (scoreDelta !== 0) return scoreDelta;
      return new Date(right.entry.updatedAt).getTime() - new Date(left.entry.updatedAt).getTime();
    })
    .slice(0, boundedLimit)
    .map(({ entry }) => entry);
}

export function formatSelectedMemoryMd(memories: MemoryEntry[]): string {
  if (memories.length === 0) return "";

  const lines = [...memories]
    .sort((left, right) => right.importance - left.importance)
    .map((memory) => `- [${memory.category}] ${memory.content}`);
  const md = `## Selected relevant memories\n${lines.join("\n")}`;
  return md.length > MEMORY_MD_MAX_CHARS
    ? `${md.slice(0, MEMORY_MD_MAX_CHARS - 3)}...`
    : md;
}

export function formatSelectedUserMd(userProfile: UserProfile[]): string {
  if (userProfile.length === 0) return "";

  const sections: Record<string, string[]> = {};
  for (const entry of userProfile) {
    if (!sections[entry.category]) sections[entry.category] = [];
    sections[entry.category].push(entry.content);
  }

  let md = "## Selected owner context\n";
  for (const [category, items] of Object.entries(sections)) {
    md += `### ${category}\n`;
    md += `${items.map((item) => `- ${item}`).join("\n")}\n`;
  }
  return md.length > USER_MD_MAX_CHARS
    ? `${md.slice(0, USER_MD_MAX_CHARS - 3)}...`
    : md;
}

export function selectRetainedContext(
  memories: MemoryEntry[],
  userProfile: UserProfile[],
  query: string,
): SelectedRetainedContext {
  const relevantMemories = selectRelevantMemories(memories, query);
  const relevantUserProfile = selectRelevantUserProfile(userProfile, query);
  return {
    memoryMd: formatSelectedMemoryMd(relevantMemories),
    userMd: formatSelectedUserMd(relevantUserProfile),
    relevantMemories,
    relevantUserProfile,
  };
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

  // ══════════════════════════════════
  // ── PRE-TURN: Build Context ──
  // ══════════════════════════════════

  async buildContext(userMessage: string, platform: string, sessionId?: string): Promise<MemoryContext> {
    const { memories, userProfile } = await this.getMemoryData();
    const selected = selectRetainedContext(memories, userProfile, userMessage);

    // Conversation continuity is session-local. A caller without an explicit
    // session gets no raw turns: falling back to every conversation on a
    // surface can disclose one browser tab/user's text in another session.
    const requestedSession = sessionId?.trim().slice(0, 128) || null;
    const requestedPlatform = platform
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 20) || "unknown";
    const recentMessages = requestedSession
      ? (await this.getRecentMessages(requestedPlatform, RECENT_CONTEXT_LIMIT, requestedSession))
          .filter((message) => (
            message.platform === requestedPlatform
            && message.sessionId === requestedSession
            && isProviderSafeRetainedText(message.content)
          ))
          .slice(-RECENT_CONTEXT_LIMIT)
      : [];

    return { ...selected, recentMessages };
  }

  formatMemoryMd(memories: MemoryEntry[]): string {
    return formatSelectedMemoryMd(memories);
  }

  formatUserMd(userProfile: UserProfile[]): string {
    return formatSelectedUserMd(userProfile);
  }

  // ══════════════════════════════════
  // ── POST-TURN: Extract & Retain ──
  // ══════════════════════════════════

  /**
   * Session-only logging — used when the LLM call failed and we have no reply
   * to extract from, but still want a record of what the user said. Cheaper
   * than retainFromConversation (no Grok call).
   */
  async logTurnOnly(
    userMessage: string,
    platform: string,
    sessionId: string,
    speakerId?: string | number,
    expectedEpoch?: number,
  ): Promise<boolean> {
    // Route-level callers pass the epoch captured before inference. Legacy
    // callers that do not yet have a request fence still get a narrow local
    // fence, but must pass expectedEpoch to cover their full request lifetime.
    const startEpoch = expectedEpoch ?? await readPetMemoryEpoch(this.petId);
    return withLockedPetModifiers(this.petId, async ({ tx, pet }) => {
      if (pet.memory_epoch !== startEpoch) return false;
      await tx.petMemory.create({
        data: this.messageData(userMessage, "user", platform, sessionId, speakerId),
      });
      return true;
    });
  }

  async retainFromConversation(
    userMessage: string,
    petResponse: string,
    platform: string,
    sessionId: string,
    speakerId?: string | number,
    expectedEpoch?: number,
    onProviderAttempt?: () => void,
    signal?: AbortSignal,
  ): Promise<{ memoriesAdded: number; profileUpdated: boolean; retained: boolean; fenced: boolean; aborted?: boolean }> {
    signal?.throwIfAborted();
    // Capture the deletion generation before any write. The two session rows are
    // inserted under the same pet lock so a completed clear either removes both
    // or causes this pre-clear turn to be discarded.
    const startEpoch = expectedEpoch ?? await readPetMemoryEpoch(this.petId);
    signal?.throwIfAborted();
    const logged = await withLockedPetModifiers(this.petId, async ({ tx, pet }) => {
      if (pet.memory_epoch !== startEpoch) return "fenced" as const;
      if (signal?.aborted) return "cancelled" as const;
      await tx.petMemory.createMany({
        data: [
          this.messageData(userMessage, "user", platform, sessionId, speakerId),
          this.messageData(petResponse, "pet", platform, sessionId),
        ],
      });
      return "logged" as const;
    });
    if (logged === "fenced") {
      return { memoriesAdded: 0, profileUpdated: false, retained: false, fenced: true };
    }
    if (logged === "cancelled") {
      signal?.throwIfAborted();
      return { memoriesAdded: 0, profileUpdated: false, retained: false, fenced: false };
    }
    if (signal?.aborted) {
      return { memoriesAdded: 0, profileUpdated: false, retained: true, fenced: false, aborted: true };
    }

    // Session continuity is owner-local, but fact extraction is a separate
    // provider task that may route differently from chat. Never fan out a
    // credential-bearing or non-English turn to that secondary provider. The
    // complete local rows remain available to owner inspect/export.
    if (
      !isProviderSafeRetainedText(`owner_turn ${userMessage}`)
      || !isProviderSafeRetainedText(`pet_turn ${petResponse}`)
    ) {
      return { memoriesAdded: 0, profileUpdated: false, retained: true, fenced: false };
    }

    // Extract facts and user info using LLM
    let extracted: { facts: MemoryEntry[]; userInfo: UserProfile[] };
    try {
      extracted = await this.extractMemoryFromConversation(
        userMessage,
        petResponse,
        onProviderAttempt,
        signal,
      );
    } catch (error) {
      if (signal?.aborted) {
        return { memoriesAdded: 0, profileUpdated: false, retained: true, fenced: false, aborted: true };
      }
      throw error;
    }
    if (signal?.aborted) {
      return { memoriesAdded: 0, profileUpdated: false, retained: true, fenced: false, aborted: true };
    }

    const now = new Date().toISOString();
    // Serialize each pet's JSON-ledger merge inside Postgres. Without this lock,
    // simultaneous web/extension/MCP turns could both read the same JSON value
    // and the later update would silently erase the other turn's facts.
    const mergeResult = await withLockedPetModifiers(this.petId, async ({ tx, pet, modifiers: mods }) => {
      // Owner deletion won while extraction was in flight: never resurrect the
      // pre-delete turn or any fact/profile derived from it.
      if (pet.memory_epoch !== startEpoch) {
        return { memoriesAdded: 0, profileUpdated: false, retained: false, fenced: true };
      }
      if (signal?.aborted) {
        return { memoriesAdded: 0, profileUpdated: false, retained: true, fenced: false, aborted: true };
      }
      const memories = [...((mods.persistent_memories as MemoryEntry[]) || [])];
      const userProfile = [...((mods.user_profile as UserProfile[]) || [])];
      let memoriesAdded = 0;
      let profileUpdated = false;

      for (const fact of extracted.facts) {
        const replacesKey = (fact as any).replacesKey as string | undefined;
        if (replacesKey && replacesKey !== fact.key) {
          const stale = memories.findIndex((memory) => memory.key === replacesKey);
          if (stale !== -1) memories.splice(stale, 1);
        }
        const existing = memories.find((memory) => memory.key === fact.key);
        if (existing) {
          existing.content = fact.content;
          existing.updatedAt = now;
        } else {
          memories.push({ ...fact, createdAt: now, updatedAt: now });
          memoriesAdded++;
        }
      }

      for (const entry of extracted.userInfo) {
        const speakerKey = speakerId != null ? `s${speakerId}_${entry.key}` : entry.key;
        const namespacedEntry = { ...entry, key: speakerKey };
        const existing = userProfile.find((profile) => profile.key === namespacedEntry.key);
        if (existing) {
          existing.content = entry.content;
          existing.updatedAt = now;
        } else {
          userProfile.push({ ...namespacedEntry, updatedAt: now });
        }
        profileUpdated = true;
      }

      await tx.pet.update({
        where: { id: this.petId },
        data: {
          personality_modifiers: {
            ...mods,
            persistent_memories: this.consolidateMemories(memories),
            user_profile: this.consolidateUserProfile(userProfile),
          } as any,
        },
      });
      return {
        memoriesAdded,
        profileUpdated,
        retained: true,
        fenced: false,
        aborted: signal?.aborted || undefined,
      };
    });

    // Reflection cycle — let the consolidator's gate decide whether to actually
    // run (cheap no-op if not enough new turns). Ordinary chat remains
    // fire-and-forget. A metered agent run supplies an attempt observer, so it
    // awaits the gated cycle and can report every provider attempt before its
    // billing receipt is finalized.
    if (mergeResult.retained && !signal?.aborted) {
      if (onProviderAttempt) {
        await import("./consolidate")
          .then(({ consolidateMemory }) =>
            consolidateMemory(this.petId, false, startEpoch, onProviderAttempt, signal),
          )
          .catch(() => null);
      } else {
        import("./consolidate").then(({ consolidateMemory }) => {
          consolidateMemory(this.petId, false, startEpoch).catch(() => {});
        }).catch(() => {});
      }
    }

    return mergeResult;
  }

  // ── Extract facts from conversation ──
  private async extractMemoryFromConversation(
    userMessage: string,
    petResponse: string,
    onProviderAttempt?: () => void,
    signal?: AbortSignal,
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
Write every key and content value in English only, even when the user wrote in another language. Never output Hangul.

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
        onProviderAttempt,
        signal,
      });

      const content = out.text || "{}";
      const parsed = JSON.parse(content);
      // A provider/BYOK model can ignore the prompt. Memory extraction is
      // best-effort, so reject the whole generated batch instead of persisting
      // mixed-language facts or spending on a retry.
      if (containsHangul(parsed)) return { facts: [], userInfo: [] };

      const facts = (parsed.facts || []).map((f: any) => ({
          ...f,
          source: f.source || "chat",
        }))
        .filter((fact: MemoryEntry) =>
          isProviderSafeRetainedText(`${fact.key}: ${fact.content}`),
        );
      const userInfo = (parsed.userInfo || []).map((u: any) => ({
          ...u,
          source: u.source || "chat",
        }))
        .filter((entry: UserProfile) =>
          isProviderSafeRetainedText(`${entry.key}: ${entry.content}`),
        );
      return { facts, userInfo };
    } catch (error) {
      if (signal?.aborted) throw error;
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

  // ══════════════════════════════════
  // ── SESSION LOG (Cross-platform) ──
  // ══════════════════════════════════

  async logMessage(
    content: string,
    role: "user" | "pet",
    platform: string,
    sessionId: string,
    speakerId?: string | number,
    expectedEpoch?: number,
  ): Promise<boolean> {
    const startEpoch = expectedEpoch ?? await readPetMemoryEpoch(this.petId);
    return withLockedPetModifiers(this.petId, async ({ tx, pet }) => {
      if (pet.memory_epoch !== startEpoch) return false;
      await tx.petMemory.create({
        data: this.messageData(content, role, platform, sessionId, speakerId),
      });
      return true;
    });
  }

  private messageData(
    content: string,
    role: "user" | "pet",
    platform: string,
    sessionId: string,
    speakerId?: string | number,
  ): Prisma.PetMemoryCreateManyInput {
    const normalizedPlatform = platform
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 20) || "unknown";
    const normalizedSessionId = sessionId.trim().slice(0, 128) || null;
    const normalizedSpeakerId = speakerId == null
      ? null
      : String(speakerId).trim().slice(0, 100) || null;

    // Keep the original tags for portable exports and old readers while also
    // writing normalized metadata for exact filtering and multi-speaker safety.
    const tag = role === "user" && normalizedSpeakerId != null
      ? `[user:${normalizedSpeakerId}]`
      : `[${role}]`;
    return {
      pet_id: this.petId,
      // memory_type is limited to 20 chars; the normalized platform column is
      // authoritative and retains up to 20 chars without the legacy prefix.
      memory_type: `session_${normalizedPlatform.slice(0, 12)}`,
      session_id: normalizedSessionId,
      platform: normalizedPlatform,
      speaker_id: normalizedSpeakerId,
      role,
      content: `${tag} ${content}`,
      emotion: role === "pet" ? "neutral" : undefined,
      importance: 1,
    };
  }

  async getRecentMessages(
    platform: string,
    limit: number = 10,
    sessionId?: string,
  ): Promise<SessionMessage[]> {
    const normalizedPlatform = platform === "all"
      ? null
      : platform
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9_-]+/g, "-")
          .replace(/^-+|-+$/g, "")
          .slice(0, 20) || "unknown";
    const normalizedSessionId = sessionId?.trim().slice(0, 128) || null;
    const filters: Prisma.PetMemoryWhereInput[] = [{ memory_type: { startsWith: "session_" } }];

    if (normalizedPlatform) {
      filters.push({
        OR: [
          { platform: normalizedPlatform },
          // Backward-compatible fallback for rows written before normalized
          // metadata existed. Their real platform only lived in memory_type.
          {
            AND: [
              { session_id: null },
              { memory_type: `session_${normalizedPlatform.slice(0, 12)}` },
            ],
          },
        ],
      });
    }
    if (normalizedSessionId) filters.push({ session_id: normalizedSessionId });

    const messages = await prisma.petMemory.findMany({
      where: {
        pet_id: this.petId,
        AND: filters,
      },
      orderBy: { created_at: "desc" },
      take: Math.max(1, Math.min(1000, Math.trunc(limit) || 10)),
    });

    return messages.reverse().map(m => {
      const userMatch = m.content.match(/^\[user(?::([^\]]+))?\]\s*/);
      const role = m.role === "user" || m.role === "pet"
        ? m.role
        : userMatch
          ? "user" as const
          : "pet" as const;
      const content = m.content.replace(/^\[(user(?::[^\]]+)?|pet)\]\s*/, "");
      return {
        id: String(m.id),
        petId: this.petId,
        platform: m.platform || m.memory_type.replace("session_", ""),
        role,
        speakerId: m.speaker_id || userMatch?.[1] || null,
        content,
        emotion: m.emotion || undefined,
        timestamp: m.created_at.toISOString(),
        sessionId: m.session_id || null,
      };
    });
  }

  // ══════════════════════════════════
  // ── SYSTEM PROMPT BUILDER ──
  // ══════════════════════════════════

  async buildSystemPrompt(
    petName: string,
    personality: string,
    platform: string,
    userMessage: string,
    sessionId?: string,
    signal?: AbortSignal,
  ): Promise<string> {
    signal?.throwIfAborted();
    const context = await this.buildContext(userMessage, platform, sessionId);
    signal?.throwIfAborted();
    const providerPetName = isProviderSafeRetainedText(`pet_name ${petName}`)
      ? petName
      : "your pet";
    const providerPersonality = isProviderSafeRetainedText(`pet_personality ${personality}`)
      ? personality
      : "friendly";

    let prompt = `You are ${providerPetName}, a ${providerPersonality} companion AI pet.
You may use the selected retained context below; do not claim perfect or complete recall.
Keep responses SHORT (1-2 sentences, under 80 words). No markdown. Be natural and casual.
Always respond in English, even if the owner's input or stored profile uses another language. Never output Hangul.
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

    // memoryMd is already the selected relevant set. Do not append the same
    // rows again through relevantMemories.

    // Inject recent messages from this exact surface/session only.
    if (context.recentMessages.length > 0) {
      prompt += "\n## Recent conversation\n";
      const recent = context.recentMessages.slice(-6);
      for (const msg of recent) {
        const prefix = msg.role === "user" ? "Owner" : providerPetName;
        prompt += `${prefix}: ${msg.content}\n`;
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

  async clearMemory(): Promise<{
    memoryRows: number;
    agentMessages: number;
    conversations: number;
    learnedSkills: number;
    personaRows: number;
    insightsSanitized: number;
    daydreamClaimsRevoked: number;
  }> {
    return withLockedPetModifiers(this.petId, async ({ tx, modifiers: mods }) => {
      const invalidatedModifiers = invalidateDerivedMemoryModifiers(mods);
      const nextMods = invalidatedModifiers.modifiers;

      const recallStores = await redactUnprovenancedRecallStores(tx, this.petId, {
        revocationReason: "Owner cleared retained memory; derived insight was revoked.",
      });
      await tx.pet.update({
        where: { id: this.petId },
        data: {
          personality_modifiers: nextMods as any,
          memory_epoch: { increment: 1 },
        },
      });

      return {
        memoryRows: recallStores.memoryRows,
        agentMessages: recallStores.agentMessages,
        conversations: recallStores.conversations,
        learnedSkills: invalidatedModifiers.learnedSkillsRemoved,
        personaRows: recallStores.personaRows,
        insightsSanitized: recallStores.insightsSanitized,
        daydreamClaimsRevoked: recallStores.daydreamClaimsRevoked,
      };
    });
  }
}

// ── Factory ──
export function createMemoryManager(petId: number): PetMemoryManager {
  return new PetMemoryManager(petId);
}
