/**
 * Weekly pet diary.
 *
 *   GET /api/pets/[petId]/diary
 *     → { entry: "<2-3 sentence first-person journal of the week>", weekOf, ... }
 *
 * The pet writes a short diary entry about its week with the owner, drawn from
 * the past 7 days of memories. This is the weekly diary rhythm beat — a
 * reason to come back, and content only we can make (it needs the memory
 * ledger). Cached per-pet for 7 days; personality-flavored fallback if Grok is
 * unavailable. Owner-gated because this reads private memory and writes state.
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
import { buildDiaryProviderMemory } from "@/lib/petclaw/memory/provider-context";

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const FALLBACKS: Record<string, string> = {
  friendly:    "A good week. We spent time together and I felt warm the whole way through. I hope next week is just as cozy.",
  playful:     "This week had so many games! I chased, I pounced, I won (mostly). Already plotting next week's adventures.",
  shy:         "A quiet week. Small moments, gentle ones. I kept them all safe inside where it's soft.",
  brave:       "I guarded our little world all week. Nothing got past me. I think we make a good team, you and I.",
  lazy:        "Mostly napped, honestly. But the best naps were the ones near you. 10/10 week, would snooze again.",
  curious:     "So many things to wonder about this week! I noticed a hundred small mysteries and saved them to ask you.",
  mischievous: "I may have caused a *little* chaos this week. For science. Mostly. I regret nothing.",
  gentle:      "The week moved slowly and kindly. I noticed the light, and you, and how nice it is to just be here.",
  adventurous: "We went further this week! Every day a little path I'd never walked. Next week, further still.",
  dramatic:    "What a WEEK it has been. Highs! Lows! A truly cinematic seven days. I shall remember it always.",
  wise:        "This week taught me small things that add up to big ones. Mostly that time with you is the part that matters.",
  sassy:       "Iconic week, frankly. I was charming, you were lucky, the vibes were immaculate. As usual.",
};

function pickFallback(personality: string): string {
  return FALLBACKS[personality] || FALLBACKS.friendly;
}

interface CachedDiary {
  text: string;
  weekOf: string;       // ISO date of generation
  generatedAt: string;
  memoryEpoch: number;
}

type DiaryMoment = {
  id: number;
  content: string;
  created_at: Date;
};

function diarySourceSnapshot(pet: any, recent: DiaryMoment[]): string {
  return JSON.stringify({
    name: pet.name,
    personality: pet.personality_type,
    level: pet.level,
    recent: recent.map((row) => [row.id, row.content, row.created_at.toISOString()]),
  });
}

async function generateWithLLM(pet: any, recent: DiaryMoment[]): Promise<string | null> {
  const lines = buildDiaryProviderMemory(recent);
  const providerPetName = isProviderSafeRetainedText(`pet_name ${pet.name}`)
    ? pet.name
    : "your pet";

  try {
    const result = await callLLM({
      task: "chat",
      petId: pet.id,
      temperature: 0.9,
      max_tokens: 160,
      messages: [
        {
          role: "system",
          content: `You are ${providerPetName}, a ${pet.personality_type} pet at Lv.${pet.level} writing this week's short diary entry about your life with your owner. 2-3 sentences, first person, warm and specific, casual not formal. Reference the moments below if any. No preamble, no date header, no quotes. Always write in English.`,
        },
        {
          role: "user",
          content: `This week's moments:\n${lines || "(a quiet week with not much logged)"}\n\nWrite your diary entry for the week:`,
        },
      ],
    });
    const text = generatedEnglishOrNull(result.text?.trim().replace(/^["']|["']$/g, ""));
    if (!text || text.length > 600) return null;
    return text;
  } catch {
    return null;
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ petId: string }> }
) {
  const rl = rateLimit(req, { key: "diary", limit: 60, windowMs: 60_000 });
  if (!rl.ok) return rl.response;

  const { petId } = await params;
  const pid = Number(petId);

  if (!(await ownsPet(req, pid))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const pet = await prisma.pet.findFirst({ where: { id: pid, is_active: true } });
  if (!pet) return NextResponse.json({ error: "Pet not found" }, { status: 404 });

  const mods = (pet.personality_modifiers as any) || {};
  const cached: CachedDiary | undefined = mods.weekly_diary;
  const now = Date.now();
  const isFresh = cached
    && cached.memoryEpoch === pet.memory_epoch
    && (now - new Date(cached.generatedAt).getTime()) < CACHE_TTL_MS;

  if (isFresh && cached) {
    return NextResponse.json({
      entry: generatedEnglishOrFallback(cached.text, pickFallback(pet.personality_type)),
      weekOf: cached.weekOf,
      cached: true,
    });
  }

  const weekAgo = new Date(Date.now() - CACHE_TTL_MS);
  const recent = await prisma.petMemory.findMany({
    where: {
      pet_id: pet.id,
      created_at: { gte: weekAgo },
      memory_type: { in: ["interaction", "conversation", "combo", "milestone"] },
    },
    orderBy: { created_at: "desc" },
    take: 14,
    select: { id: true, content: true, created_at: true },
  });
  const startEpoch = pet.memory_epoch;
  const sourceLedgerSnapshot = diarySourceSnapshot(pet, recent);
  const cacheSnapshot = JSON.stringify(mods.weekly_diary ?? null);

  const llmText = await generateWithLLM(pet, recent);
  const text = llmText || pickFallback(pet.personality_type);
  const weekOf = new Date().toISOString().slice(0, 10);

  const fresh: CachedDiary = {
    text,
    weekOf,
    generatedAt: new Date().toISOString(),
    memoryEpoch: startEpoch,
  };
  const commit = await withLockedPetModifiers(pet.id, async ({ tx, pet: lockedPet, modifiers }) => {
    const [currentPet, currentRecent] = await Promise.all([
      tx.pet.findUnique({ where: { id: pet.id } }),
      tx.petMemory.findMany({
        where: {
          pet_id: pet.id,
          created_at: { gte: weekAgo },
          memory_type: { in: ["interaction", "conversation", "combo", "milestone"] },
        },
        orderBy: { created_at: "desc" },
        take: 14,
        select: { id: true, content: true, created_at: true },
      }),
    ]);
    const currentCache = modifiers.weekly_diary as CachedDiary | undefined;
    if (
      !currentPet
      || lockedPet.memory_epoch !== startEpoch
      || diarySourceSnapshot(currentPet, currentRecent) !== sourceLedgerSnapshot
      || JSON.stringify(modifiers.weekly_diary ?? null) !== cacheSnapshot
    ) {
      return { committed: false as const, currentCache, currentEpoch: lockedPet.memory_epoch };
    }
    await tx.pet.update({
      where: { id: pet.id },
      data: { personality_modifiers: { ...modifiers, weekly_diary: fresh } as any },
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
        entry: generatedEnglishOrFallback(current.text, pickFallback(pet.personality_type)),
        weekOf: current.weekOf,
        cached: true,
      });
    }
    return NextResponse.json({
      entry: pickFallback(pet.personality_type),
      weekOf,
      cached: false,
      staleDiscarded: true,
    });
  }

  return NextResponse.json({ entry: text, weekOf, cached: false });
}
