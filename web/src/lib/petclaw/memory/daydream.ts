/**
 * Pet Daydream — default-mode-network for companionship.
 *
 * Adapted from the agentic-harness-playbook "daydream" skill (which mines an
 * Obsidian vault for non-obvious cross-note connections). Here the "vault" is
 * the pet's own memory ledger about its owner, and the output isn't a research
 * insight — it's a *caring observation* the pet surfaces proactively.
 *
 * The pipeline mirrors the playbook:
 *   1. Pull the pet's memories + owner profile (the "notes")
 *   2. Generate recency-weighted random pairs (the brain idling)
 *   3. Synthesize a connection per pair (Grok — the "synthesizer")
 *   4. Score each for genuine insight vs generic filler (the "critic")
 *   5. Keep only high-scoring ones
 *
 * Why it matters: this is the one thing a centralized companion app can't copy
 * without our memory ledger. The pet that *thinks about you while you're gone*
 * and comes back with "you've seemed tense — you once told me the ocean calms
 * you, maybe a weekend trip?" is a different product from a chatbot.
 */

import { prisma } from "@/lib/prisma";
import {
  isProviderSafeRetainedText,
  type MemoryEntry,
  type UserProfile,
} from "./persistent-memory";
import { callLLM, type LLMTask } from "@/lib/llm/router";
import { generatedEnglishOrNull } from "@/lib/generatedLanguage";
import { withLockedPetModifiers } from "@/lib/petclaw/modifier-store";

const MIN_NOTES = 4;          // need at least this many memories to daydream
const MAX_PAIRS = 6;          // synthesize at most this many connections per run
const KEEP_SCORE = 6;         // 0-10 critic threshold to surface an insight

export interface DaydreamInsight {
  insight: string;            // the caring observation, 1-2 sentences, 1st person
  rationale: string;          // why the pet connected these (for transparency)
  score: number;              // 0-10 critic score
  sourceKeys: string[];       // memory keys that fed it
  mood: string;               // "tender" | "playful" | "concerned" | "hopeful"
}

export interface DaydreamPersistResult {
  created: number;
  discarded: boolean;
}

export interface DaydreamProviderNote { key: string; text: string; importance: number; ageDays: number; }

export function buildDaydreamProviderNotes(
  memories: MemoryEntry[],
  profile: UserProfile[],
): DaydreamProviderNote[] {
  const now = Date.now();
  const fromMem: DaydreamProviderNote[] = (memories || []).map(m => ({
    key: m.key,
    text: m.content,
    importance: m.importance || 1,
    ageDays: Math.max(0, (now - new Date(m.updatedAt || m.createdAt).getTime()) / 86_400_000),
  }));
  const fromProfile: DaydreamProviderNote[] = (profile || [])
    .filter((entry) => entry.category !== "identity")
    .map(p => ({
    key: `user:${p.key}`,
    text: p.content,
    importance: 3,             // owner-profile facts are inherently relevant
    ageDays: Math.max(0, (now - new Date(p.updatedAt).getTime()) / 86_400_000),
  }));
  return [...fromMem, ...fromProfile].filter(
    (note) => note.text
      && note.text.length > 4
      && isProviderSafeRetainedText(`${note.key}: ${note.text}`),
  );
}

/** Recency + importance weighted random pairing (the "idle brain"). */
function makePairs(notes: DaydreamProviderNote[], count: number): [DaydreamProviderNote, DaydreamProviderNote][] {
  if (notes.length < 2) return [];
  const weight = (n: DaydreamProviderNote) => (n.importance) * Math.exp(-n.ageDays / 45) + 0.15;
  const pick = (): DaydreamProviderNote => {
    const total = notes.reduce((s, n) => s + weight(n), 0);
    let r = Math.random() * total;
    for (const n of notes) { r -= weight(n); if (r <= 0) return n; }
    return notes[notes.length - 1];
  };
  const pairs: [DaydreamProviderNote, DaydreamProviderNote][] = [];
  const seen = new Set<string>();
  let guard = 0;
  while (pairs.length < count && guard++ < count * 8) {
    const a = pick(); const b = pick();
    if (a.key === b.key) continue;
    const id = [a.key, b.key].sort().join("|");
    if (seen.has(id)) continue;
    seen.add(id);
    pairs.push([a, b]);
  }
  return pairs;
}

async function callPetText(petId: number, task: LLMTask, system: string, user: string, maxTokens = 400): Promise<string | null> {
  try {
    const out = await callLLM({
      task,
      petId,
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
      max_tokens: maxTokens,
      temperature: 0.9,
    });
    return out.text || null;
  } catch { return null; }
}

/**
 * Run one daydream cycle for a pet. Returns the surfaced insights (already
 * filtered by the critic). Caller persists them.
 */
export async function daydream(
  petId: number,
  expectedMemoryEpoch: number,
): Promise<DaydreamInsight[]> {
  const pet = await prisma.pet.findUnique({ where: { id: petId } });
  if (!pet) return [];

  // Deletion/correction is a request fence, not merely a database cleanup.
  // Refuse to send retained context to a provider when the request already
  // belongs to an older memory generation. A second epoch check under the
  // shared modifier lock protects the eventual write after inference.
  if (pet.memory_epoch !== expectedMemoryEpoch) return [];

  const mods = (pet.personality_modifiers as Record<string, unknown>) || {};
  const memories = (mods.persistent_memories as MemoryEntry[]) || [];
  const profile = (mods.user_profile as UserProfile[]) || [];

  const notes = buildDaydreamProviderNotes(memories, profile);
  if (notes.length < MIN_NOTES) return [];

  const pairs = makePairs(notes, MAX_PAIRS);
  if (pairs.length === 0) return [];

  const petName = isProviderSafeRetainedText(`pet_name ${pet.name}`)
    ? pet.name
    : "your pet";
  const personality = pet.personality_type;

  // ── Synthesizer: one caring connection per pair ──
  const synthSystem =
    `You are ${petName}, a ${personality} pet, daydreaming about your owner while ` +
    `they're away. You are given two things you remember about them. Find a ` +
    `genuine, non-obvious connection and turn it into ONE caring thought you ` +
    `might share when they return.\n\n` +
    `Rules:\n` +
    `- Write every JSON string in English only. Never output Hangul, even if a name or memory uses another language.\n` +
    `- 1-2 sentences, first person, warm, in-character for a ${personality} pet.\n` +
    `- Must connect BOTH memories, not just restate one.\n` +
    `- No generic filler ("I love you so much!"). Specific to these memories.\n` +
    `- Output strict JSON: {"insight":"...","rationale":"why you connected them","mood":"tender|playful|concerned|hopeful"}`;

  const raw = await Promise.all(pairs.map(([a, b]) =>
    callPetText(petId, "persona", synthSystem, `Memory 1: ${a.text}\nMemory 2: ${b.text}`)
      .then(out => ({ a, b, out }))
  ));

  const candidates: { insight: string; rationale: string; mood: string; sourceKeys: string[] }[] = [];
  for (const { a, b, out } of raw) {
    if (!out) continue;
    const m = out.match(/\{[\s\S]*\}/);
    if (!m) continue;
    try {
      const p = JSON.parse(m[0]);
      const insight = generatedEnglishOrNull(p.insight);
      const rationale = generatedEnglishOrNull(p.rationale);
      if (insight && rationale) {
        candidates.push({
          insight: insight.slice(0, 280),
          rationale: rationale.slice(0, 200),
          mood: ["tender", "playful", "concerned", "hopeful"].includes(p.mood) ? p.mood : "tender",
          sourceKeys: [a.key, b.key],
        });
      }
    } catch { /* skip malformed */ }
  }
  if (candidates.length === 0) return [];

  // ── Critic: score each candidate 0-10 for genuine insight ──
  const criticSystem =
    `You are a discerning critic. Score each pet "daydream" 0-10 on whether it's ` +
    `a genuinely insightful, specific, caring observation (10) versus generic ` +
    `filler or a non-sequitur (0). Work in English only and never output Hangul. Reward: specificity, a real connection between ` +
    `two facts, emotional attunement. Penalize: vagueness, sycophancy, restating ` +
    `one fact. Output strict JSON array: [{"i":<index>,"score":<0-10>}].`;

  const criticInput = candidates.map((c, i) => `[${i}] ${c.insight}`).join("\n");
  const criticOut = await callPetText(petId, "judge", criticSystem, criticInput, 300);

  const scores: Record<number, number> = {};
  if (criticOut) {
    const m = criticOut.match(/\[[\s\S]*\]/);
    if (m) {
      try {
        const arr = JSON.parse(m[0]);
        for (const row of arr) if (typeof row.i === "number") scores[row.i] = Number(row.score) || 0;
      } catch { /* fall through to default scoring */ }
    }
  }

  return candidates
    .map((c, i) => ({ ...c, score: scores[i] ?? 5 }))
    .filter(c => c.score >= KEEP_SCORE)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(c => ({
      insight: c.insight,
      rationale: c.rationale,
      score: c.score,
      sourceKeys: c.sourceKeys,
      mood: c.mood,
    }));
}

/**
 * Persist one completed daydream only if no owner deletion/correction happened
 * since the caller captured `expectedMemoryEpoch`. The shared modifier lock
 * serializes this decision with clearMemory() and correction writers.
 */
export async function persistDaydreamInsights(
  petId: number,
  expectedMemoryEpoch: number,
  insights: DaydreamInsight[],
): Promise<DaydreamPersistResult> {
  return withLockedPetModifiers(petId, async ({ tx, pet }) => {
    if (pet.memory_epoch !== expectedMemoryEpoch) {
      return { created: 0, discarded: true };
    }
    if (insights.length === 0) {
      return { created: 0, discarded: false };
    }

    const result = await tx.petInsight.createMany({
      data: insights.map((ins) => ({
        pet_id: petId,
        insight: ins.insight,
        rationale: ins.rationale,
        mood: ins.mood,
        score: Math.round(ins.score),
        source_keys: ins.sourceKeys as any,
      })),
    });
    return { created: result.count, discarded: false };
  });
}
