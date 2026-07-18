/**
 * Memory Consolidation / Reflection Cycle
 *
 * Periodic LLM pass that re-reads recent session log + existing MEMORY.md and
 * rewrites a compressed canonical form. This is the second half of the VIGIL
 * loop: per-turn extraction collects raw facts, consolidation merges duplicates,
 * drops contradictions, and condenses noisy entries.
 *
 * Triggers:
 *   - `POST /api/petclaw/memory/consolidate?petId=X` (manual / cron)
 *   - Automatically inside retainFromConversation every N=20 turns (cheap path)
 *
 * Cost: one Grok call per pet per consolidation. We only run when there's been
 * meaningful new activity since the last run, so cost is bounded.
 */

import { prisma } from "@/lib/prisma";
import type { MemoryEntry, UserProfile } from "./persistent-memory";
import { callLLM } from "@/lib/llm/router";
import { containsHangul } from "@/lib/generatedLanguage";

interface ConsolidationResult {
  petId: number;
  before: { memories: number; userProfile: number };
  after: { memories: number; userProfile: number };
  ranAt: string;
  reason: string;
}

const MIN_TURNS_BETWEEN_RUNS = 20;       // skip if log hasn't grown enough
const MAX_HOURS_BETWEEN_RUNS = 7 * 24;   // …unless it's been a week

export async function consolidateMemory(petId: number, force = false): Promise<ConsolidationResult | null> {
  const pet = await prisma.pet.findUnique({ where: { id: petId } });
  if (!pet) return null;

  const mods = (pet.personality_modifiers as any) || {};
  const memories: MemoryEntry[] = mods.persistent_memories || [];
  const userProfile: UserProfile[] = mods.user_profile || [];
  const lastRunIso = mods.last_consolidation_at as string | undefined;
  const lastRunCount = mods.last_consolidation_turn_count as number | undefined;

  // Count session turns since last run
  const currentTurnCount = await prisma.petMemory.count({
    where: { pet_id: petId, memory_type: { startsWith: "session_" } },
  });
  const turnsSinceLast = currentTurnCount - (lastRunCount || 0);

  // Gate: don't run if nothing changed and not forced
  if (!force) {
    const ageHours = lastRunIso
      ? (Date.now() - new Date(lastRunIso).getTime()) / 3_600_000
      : Infinity;
    if (turnsSinceLast < MIN_TURNS_BETWEEN_RUNS && ageHours < MAX_HOURS_BETWEEN_RUNS) {
      return null;  // not enough new activity
    }
  }

  // Pull recent session log to give the LLM real data to consolidate from
  const recentTurns = await prisma.petMemory.findMany({
    where: { pet_id: petId, memory_type: { startsWith: "session_" } },
    orderBy: { created_at: "desc" },
    take: 80,
    select: { content: true, memory_type: true, created_at: true },
  });
  const turnsText = recentTurns
    .reverse()
    .map(t => t.content)
    .join("\n")
    .slice(0, 6000);   // safety cap

  const before = { memories: memories.length, userProfile: userProfile.length };
  const memoryText = memories.map(m => `[${m.key}] (${m.category}, imp:${m.importance}) ${m.content}`).join("\n").slice(0, 3000);
  const profileText = userProfile.map(u => `[${u.key}] (${u.category}) ${u.content}`).join("\n").slice(0, 2000);

  let consolidated: { memories: MemoryEntry[]; userProfile: UserProfile[] } | null = null;

  try {
    const out = await callLLM({
      task: "summarize",
      petId,
      temperature: 0.1,
      max_tokens: 1500,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are a memory consolidator. Given a pet's current memory ledger and recent conversation log, rewrite the ledger to be:
- Deduplicated (merge entries about the same fact)
- Free of contradictions (when two entries conflict, keep the more recent / specific one)
- Compressed (shorter content with same meaning)
- Importance-recalibrated (rare/critical info → 5, trivia → 1)
- Free of noise (drop entries that look like one-off small talk)
- Written in English (translate any non-English memory content to English); never output Hangul

Return ONLY JSON with exact shape:
{
  "memories": [{"key": "...", "content": "...", "category": "fact|preference|event|relationship|skill_learned", "importance": 1-5, "source": "consolidated", "createdAt": "...", "updatedAt": "..."}],
  "userProfile": [{"key": "...", "content": "...", "category": "identity|preference|communication|interest|context", "source": "consolidated", "updatedAt": "..."}]
}

Preserve createdAt from input when possible. Set updatedAt to NOW.
Keep at most 35 memories and 20 user profile entries — drop the lowest value.
Never invent new facts not present in the input.`,
        },
        {
          role: "user",
          content: `CURRENT MEMORY LEDGER:
${memoryText || "(empty)"}

CURRENT USER PROFILE:
${profileText || "(empty)"}

RECENT SESSION LOG (newest last):
${turnsText || "(empty)"}

Rewrite the ledger.`,
        },
      ],
    });
    const parsed = JSON.parse(out.text || "{}");
    if (containsHangul(parsed)) {
      console.error("[consolidate] rejected non-English generated memory");
      return null;
    }
    if (!Array.isArray(parsed.memories) || !Array.isArray(parsed.userProfile)) {
      console.error("[consolidate] malformed response");
      return null;
    }
    const now = new Date().toISOString();
    consolidated = {
      memories: parsed.memories.map((m: any) => ({
        key: String(m.key || `consolidated_${Math.random().toString(36).slice(2, 8)}`),
        content: String(m.content || "").slice(0, 400),
        category: m.category || "fact",
        importance: Math.max(1, Math.min(5, Number(m.importance) || 2)),
        source: "consolidated",
        createdAt: m.createdAt || now,
        updatedAt: now,
      })),
      userProfile: parsed.userProfile.map((u: any) => ({
        key: String(u.key || `consolidated_${Math.random().toString(36).slice(2, 8)}`),
        content: String(u.content || "").slice(0, 400),
        category: u.category || "context",
        source: "consolidated",
        updatedAt: now,
      })),
    };
  } catch (e: any) {
    console.error("[consolidate] error:", e?.message);
    return null;
  }

  if (!consolidated) return null;

  await prisma.pet.update({
    where: { id: petId },
    data: {
      personality_modifiers: {
        ...mods,
        persistent_memories: consolidated.memories,
        user_profile: consolidated.userProfile,
        last_consolidation_at: new Date().toISOString(),
        last_consolidation_turn_count: currentTurnCount,
      } as any,
    },
  });

  // Anchor the new state as a checkpoint. Off-chain always; on-chain if the
  // relayer is enabled + funded. Failures are non-fatal.
  try {
    const { anchorMemory } = await import("./anchor");
    // Pass real before/after counts so the Persona Evolution timeline shows a
    // meaningful per-row summary instead of a repeated generic sentence.
    await anchorMemory(petId, "post_consolidation", {
      memoriesBefore: before.memories,
      memoriesAfter: consolidated.memories.length,
      profileItems: consolidated.userProfile.length,
      reason: force ? "forced" : `${turnsSinceLast} new turns`,
    });
  } catch (e: any) {
    console.warn("[consolidate] anchor failed:", e?.message);
  }

  return {
    petId,
    before,
    after: { memories: consolidated.memories.length, userProfile: consolidated.userProfile.length },
    ranAt: new Date().toISOString(),
    reason: force ? "forced" : `${turnsSinceLast}_new_turns`,
  };
}
