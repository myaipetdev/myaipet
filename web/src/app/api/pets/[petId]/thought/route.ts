/**
 * Pet thought-of-the-day.
 *
 *   GET /api/pets/[petId]/thought
 *     → { thought: "<1-2 sentence inner monologue>", emotion, ... }
 *
 * Generates a short 1st-person snippet of "what the pet is thinking" right
 * now, drawing from:
 *   - Current stat (hungry, sleepy, ecstatic, etc.)
 *   - Recent memory (last 3 session messages via VIGIL memory)
 *   - Personality archetype
 *
 * Caches per-pet for 4 hours so we don't burn LLM budget per page-view.
 * Falls back to a personality-flavored canned snippet if Grok is unavailable.
 *
 * Why this matters: the home/my-pet screen finally has a *living* element
 * that gives users a reason to come back and check on their pet.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rateLimit";
import { ownsPet } from "@/lib/authz";
import { callLLM } from "@/lib/llm/router";
import {
  generatedEnglishOrFallback,
  generatedEnglishOrNull,
} from "@/lib/generatedLanguage";
import { withLockedPetModifiers } from "@/lib/petclaw/modifier-store";
import { isProviderSafeRetainedText } from "@/lib/petclaw/memory/persistent-memory";
import { buildThoughtProviderMemory } from "@/lib/petclaw/memory/provider-context";

const CACHE_TTL_MS = 4 * 60 * 60 * 1000;

// Personality-flavored fallbacks if the LLM call fails — never leave the UI blank.
const FALLBACKS: Record<string, string[]> = {
  friendly:    ["I just remembered something nice — wish you were here!", "Today felt warm, like a good blanket."],
  playful:     ["I tried to bite my tail. Spoiler: it won.", "What if we played the spinny game again?"],
  shy:         ["…I made a small drawing in my head. Just for me.", "Soft day. Soft thoughts."],
  brave:       ["I think I could fight a small mountain today.", "I scoped the perimeter. All safe."],
  lazy:        ["Mmmm… five more minutes…", "If I tilt my head this way the world is comfier."],
  curious:     ["Why does light bounce that way? Have you noticed?", "What's behind the fridge, do you think?"],
  mischievous: ["I might have hidden a sock. You'll never find it.", "Plan B is still in motion."],
  gentle:      ["A leaf fell. I noticed.", "Everything is breathing slowly today."],
  adventurous: ["Charted a new path on the rug today.", "Tomorrow we go further."],
  dramatic:    ["Today was a SAGA. Where do I even start?", "My nose itched at the WORST moment."],
  wise:        ["The morning teaches what the evening forgets.", "A small loop completes a big circle."],
  sassy:       ["Iconic. Just iconic.", "You're lucky I'm so charming."],
};

function pickFallback(personality: string): string {
  const list = FALLBACKS[personality] || FALLBACKS.friendly;
  return list[Math.floor(Math.random() * list.length)];
}

interface CachedThought {
  text: string;
  emotion: string;
  generatedAt: string;
  memoryEpoch: number;
}

type ThoughtMoment = {
  id: number;
  content: string;
  emotion: string;
  created_at: Date;
};

function thoughtSourceSnapshot(pet: any, recent: ThoughtMoment[]): string {
  return JSON.stringify({
    name: pet.name,
    personality: pet.personality_type,
    level: pet.level,
    happiness: pet.happiness,
    hunger: pet.hunger,
    energy: pet.energy,
    recent: recent.map((row) => [row.id, row.content, row.emotion, row.created_at.toISOString()]),
  });
}

async function generateWithLLM(pet: any, recent: ThoughtMoment[]): Promise<string | null> {
  const recentLines = buildThoughtProviderMemory(recent);
  const providerPetName = isProviderSafeRetainedText(`pet_name ${pet.name}`)
    ? pet.name
    : "your pet";

  const mood = pet.happiness >= 70 ? "happy" : pet.hunger > 60 ? "hungry"
    : pet.energy < 30 ? "sleepy" : pet.happiness < 30 ? "wistful" : "calm";

  try {
    const result = await callLLM({
      task: "chat",
      petId: pet.id,
      temperature: 0.95,
      max_tokens: 80,
      messages: [
        {
          role: "system",
          content: `You are ${providerPetName}, a ${pet.personality_type} ${mood} pet at Lv.${pet.level}. Output ONE sentence (max 18 words) of an inner thought you're having right now. First person. Casual, not formal. No quotes, no preamble. No emoji unless 1 fits. Always write in English.`,
        },
        {
          role: "user",
          content: `Recent moments in your memory:\n${recentLines || "(nothing notable yet)"}\n\nWrite one inner thought, right now:`,
        },
      ],
    });
    const text = generatedEnglishOrNull(result.text?.trim().replace(/^["']|["']$/g, ""));
    if (!text || text.length > 200) return null;
    return text;
  } catch {
    return null;
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ petId: string }> }
) {
  const rl = rateLimit(req, { key: "thought", limit: 60, windowMs: 60_000 });
  if (!rl.ok) return rl.response;

  const { petId } = await params;
  const pid = Number(petId);

  // Generating a thought can read private memory, spend model budget, and write
  // cached state. It is always restricted to the pet's owner.
  if (!(await ownsPet(req, pid))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const pet = await prisma.pet.findFirst({
    where: { id: pid, is_active: true },
  });
  if (!pet) return NextResponse.json({ error: "Pet not found" }, { status: 404 });

  const mods = (pet.personality_modifiers as any) || {};
  const cached: CachedThought | undefined = mods.thought_of_day;
  const now = Date.now();
  const cachedAt = cached ? new Date(cached.generatedAt).getTime() : 0;
  const isFresh = cached
    && cached.memoryEpoch === pet.memory_epoch
    && (now - cachedAt) < CACHE_TTL_MS;

  if (isFresh && cached) {
    return NextResponse.json({
      thought: generatedEnglishOrFallback(cached.text, pickFallback(pet.personality_type)),
      emotion: cached.emotion,
      generatedAt: cached.generatedAt,
      cached: true,
    });
  }

  // Capture every source that can affect the generated text before the long
  // model call. A clear/edit advances memory_epoch; a new interaction changes
  // the source ledger snapshot. Either condition makes the result stale.
  const recent = await prisma.petMemory.findMany({
    where: { pet_id: pet.id, memory_type: { in: ["interaction", "conversation", "combo", "milestone"] } },
    orderBy: { created_at: "desc" },
    take: 5,
    select: { id: true, content: true, emotion: true, created_at: true },
  });
  const startEpoch = pet.memory_epoch;
  const sourceLedgerSnapshot = thoughtSourceSnapshot(pet, recent);
  const cacheSnapshot = JSON.stringify(mods.thought_of_day ?? null);

  // Generate fresh — LLM or fallback
  const llmText = await generateWithLLM(pet, recent);
  const text = llmText || pickFallback(pet.personality_type);
  const emotion = pet.happiness >= 70 ? "happy"
    : pet.hunger > 60 ? "hungry"
    : pet.energy < 30 ? "sleepy"
    : "calm";

  const fresh: CachedThought = {
    text,
    emotion,
    generatedAt: new Date().toISOString(),
    memoryEpoch: startEpoch,
  };
  const commit = await withLockedPetModifiers(pet.id, async ({ tx, pet: lockedPet, modifiers }) => {
    const [currentPet, currentRecent] = await Promise.all([
      tx.pet.findUnique({ where: { id: pet.id } }),
      tx.petMemory.findMany({
        where: { pet_id: pet.id, memory_type: { in: ["interaction", "conversation", "combo", "milestone"] } },
        orderBy: { created_at: "desc" },
        take: 5,
        select: { id: true, content: true, emotion: true, created_at: true },
      }),
    ]);
    const currentCache = modifiers.thought_of_day as CachedThought | undefined;
    if (
      !currentPet
      || lockedPet.memory_epoch !== startEpoch
      || thoughtSourceSnapshot(currentPet, currentRecent) !== sourceLedgerSnapshot
      || JSON.stringify(modifiers.thought_of_day ?? null) !== cacheSnapshot
    ) {
      return { committed: false as const, currentCache, currentEpoch: lockedPet.memory_epoch };
    }
    await tx.pet.update({
      where: { id: pet.id },
      data: { personality_modifiers: { ...modifiers, thought_of_day: fresh } as any },
    });
    return { committed: true as const, currentCache: fresh, currentEpoch: startEpoch };
  });

  if (!commit.committed) {
    const current = commit.currentCache;
    const currentAt = current ? new Date(current.generatedAt).getTime() : 0;
    if (
      current?.text
      && current.memoryEpoch === commit.currentEpoch
      && Date.now() - currentAt < CACHE_TTL_MS
    ) {
      return NextResponse.json({
        thought: generatedEnglishOrFallback(current.text, pickFallback(pet.personality_type)),
        emotion: current.emotion,
        generatedAt: current.generatedAt,
        cached: true,
      });
    }
    const safeFallback = pickFallback(pet.personality_type);
    return NextResponse.json({
      thought: safeFallback,
      emotion,
      generatedAt: new Date().toISOString(),
      cached: false,
      staleDiscarded: true,
    });
  }

  return NextResponse.json({ thought: text, emotion, generatedAt: fresh.generatedAt, cached: false });
}
