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
import { ownsPet, PUBLIC_DEMO_PET_ID } from "@/lib/authz";

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
}

async function generateWithLLM(pet: any): Promise<string | null> {
  const grokKey = process.env.GROK_API_KEY;
  if (!grokKey) return null;

  // Pull a few last memories for context (cheap — already loaded by memory infra)
  const recent = await prisma.petMemory.findMany({
    where: { pet_id: pet.id, memory_type: { in: ["interaction", "conversation", "combo", "milestone"] } },
    orderBy: { created_at: "desc" }, take: 5,
    select: { content: true, emotion: true },
  });
  const recentLines = recent.map(r => `- ${r.content}`).join("\n").slice(0, 600);

  const mood = pet.happiness >= 70 ? "happy" : pet.hunger > 60 ? "hungry"
    : pet.energy < 30 ? "sleepy" : pet.happiness < 30 ? "wistful" : "calm";

  try {
    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${grokKey}` },
      body: JSON.stringify({
        model: "grok-3-mini-fast",
        temperature: 0.95,
        max_tokens: 80,
        messages: [
          {
            role: "system",
            content: `You are ${pet.name}, a ${pet.personality_type} ${mood} pet at Lv.${pet.level}. Output ONE sentence (max 18 words) of an inner thought you're having right now. First person. Casual, not formal. No quotes, no preamble. No emoji unless 1 fits. Always write in English.`,
          },
          {
            role: "user",
            content: `Recent moments in your memory:\n${recentLines || "(nothing notable yet)"}\n\nWrite one inner thought, right now:`,
          },
        ],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content?.trim()?.replace(/^["']|["']$/g, "");
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

  // SECURITY (audit M2): generating a thought triggers a paid LLM call and
  // writes to the pet. Restrict to the pet's owner — except the public demo pet.
  if (pid !== PUBLIC_DEMO_PET_ID && !(await ownsPet(req, pid))) {
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
  const isFresh = cached && (now - cachedAt) < CACHE_TTL_MS;

  if (isFresh && cached) {
    return NextResponse.json({
      thought: cached.text,
      emotion: cached.emotion,
      generatedAt: cached.generatedAt,
      cached: true,
    });
  }

  // Generate fresh — LLM or fallback
  const llmText = await generateWithLLM(pet);
  const text = llmText || pickFallback(pet.personality_type);
  const emotion = pet.happiness >= 70 ? "happy"
    : pet.hunger > 60 ? "hungry"
    : pet.energy < 30 ? "sleepy"
    : "calm";

  const fresh: CachedThought = { text, emotion, generatedAt: new Date().toISOString() };
  await prisma.pet.update({
    where: { id: pet.id },
    data: { personality_modifiers: { ...mods, thought_of_day: fresh } as any },
  });

  return NextResponse.json({ thought: text, emotion, generatedAt: fresh.generatedAt, cached: false });
}
