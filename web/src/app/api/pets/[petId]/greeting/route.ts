/**
 * GET /api/pets/[petId]/greeting — PROACTIVE RECALL.
 *
 * The pet reaches out FIRST when you come back, weaving in a REAL shared memory
 * ("how did that talk you were nervous about go?"). This is the durable-WTP
 * moment the monetization blueprint hinges on: the pet feels alive because it
 * remembers you unprompted — the difference between a chatbot and a companion.
 *
 * Grounded, never fabricated: the callback is drawn from the pet's own
 * pet_memories corpus; if there's no genuine older memory, it degrades to a warm
 * welcome-back with no invented history.
 *
 * Cost-guarded: only fires when the owner has actually been away (> GAP_MIN), and
 * caches the generated line until the owner next interacts, so re-opening the app
 * doesn't re-spend on the LLM.
 *
 * (Flagship Companion+ value — shipped working so the "wow, it remembered me"
 *  attachment forms; the deeper/cross-surface version is the paid upsell later.)
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { rateLimit } from "@/lib/rateLimit";
import { callLLM } from "@/lib/llm/router";
import { buildPersonaContext } from "@/lib/services/persona";
import {
  createMemoryManager,
  isProviderSafeRetainedText,
} from "@/lib/petclaw/memory/persistent-memory";
import { providerSafeGreetingMemories } from "@/lib/petclaw/memory/provider-context";
import { withLockedPetModifiers } from "@/lib/petclaw/modifier-store";
import { sanitizeStoredPersonaGeneratedFields } from "@/lib/personaGeneratedLanguage";
import {
  generatedEnglishOrFallback,
  generatedEnglishOrNull,
} from "@/lib/generatedLanguage";

const GAP_MIN_MS = 45 * 60 * 1000;                 // don't interrupt an active session
const CALLBACK_MIN_AGE_MS = 12 * 60 * 60 * 1000;   // a callback should be genuinely older, not "you just said this"
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;      // never reuse a stale "away about X" line for days
const GREETING_FALLBACK = "I'm so glad you're back! I missed you. 🐾";

type GreetingMemory = { id: number; content: string; created_at: Date };
type ProactiveCache = {
  text?: string;
  at?: number;
  for?: number;
  memory?: boolean;
  memoryEpoch?: number;
};

function greetingSourceSnapshot(
  pet: {
    name: string;
    personality_type: string;
    level: number;
    last_interaction_at: Date | null;
  },
  memories: GreetingMemory[],
  persona: unknown,
): string {
  return JSON.stringify({
    name: pet.name,
    personality: pet.personality_type,
    level: pet.level,
    lastInteractionAt: pet.last_interaction_at?.toISOString() || null,
    memories: memories.map((entry) => [entry.id, entry.content, entry.created_at.toISOString()]),
    persona,
  });
}

function humanGap(ms: number): string {
  const h = Math.floor(ms / 3_600_000);
  if (h < 24) return `${Math.max(1, h)} hour${h === 1 ? "" : "s"}`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} day${d === 1 ? "" : "s"}`;
  const w = Math.floor(d / 7);
  return `${w} week${w === 1 ? "" : "s"}`;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ petId: string }> },
) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Tight limit: each cache-miss burns an LLM call; a returning owner needs ~1.
  const rl = rateLimit(req, { key: "pet-greeting", limit: 6, windowMs: 60_000 });
  if (!rl.ok) return rl.response;

  const { petId } = await params;
  const pet = await prisma.pet.findFirst({
    where: { id: Number(petId), user_id: user.id, is_active: true },
    select: {
      id: true, name: true, personality_type: true, level: true,
      last_interaction_at: true, personality_modifiers: true, memory_epoch: true,
    },
  });
  if (!pet) return NextResponse.json({ error: "Pet not found" }, { status: 404 });

  const now = Date.now();
  const last = pet.last_interaction_at ? pet.last_interaction_at.getTime() : 0;
  const gap = now - last;

  // No proactive greeting for a brand-new pet (no history to recall) or an
  // active session (owner is right here — don't interrupt).
  if (last === 0 || gap < GAP_MIN_MS) {
    return NextResponse.json({ greeting: null });
  }

  const pm = (pet.personality_modifiers as Record<string, any>) || {};
  const cached = pm.proactive as ProactiveCache | undefined;
  // Already greeted since the owner last interacted → reuse it (don't re-spend).
  // Stamped with the `last` it was generated against + a 24h max age, so a
  // reused line can't describe a stale "away about 1 hour" days later.
  if (
    cached?.text && typeof cached.at === "number" &&
    cached.memoryEpoch === pet.memory_epoch &&
    cached.at > last && cached.for === last &&
    now - cached.at < CACHE_MAX_AGE_MS
  ) {
    return NextResponse.json({
      greeting: generatedEnglishOrFallback(cached.text, GREETING_FALLBACK),
      cached: true,
    });
  }

  // Pick a genuine older callback: important, not a raw session log, > 12h old.
  const cutoff = new Date(now - CALLBACK_MIN_AGE_MS);
  const mems = await prisma.petMemory.findMany({
    where: {
      pet_id: pet.id,
      created_at: { lt: cutoff },
      NOT: { memory_type: { startsWith: "session_" } },
    },
    orderBy: [{ importance: "desc" }, { created_at: "desc" }],
    take: 8,
    select: { id: true, content: true, created_at: true },
  }).catch(() => [] as GreetingMemory[]);
  // Unsafe rows remain in owner inspect/export. Provider inference sees only a
  // tiny safe subset of the already importance-ranked callback candidates.
  const providerMems = providerSafeGreetingMemories(mems);
  const memory = providerMems.length
    ? providerMems[Math.floor(Math.random() * providerMems.length)]
    : null;

  const rawPersona = await prisma.petPersona.findUnique({ where: { pet_id: pet.id } }).catch(() => null);
  const persona = rawPersona ? sanitizeStoredPersonaGeneratedFields(rawPersona) as any : null;
  const personaCtx = buildPersonaContext(persona, "welcome back greeting tone");
  const providerPetName = isProviderSafeRetainedText(`pet_name ${pet.name}`)
    ? pet.name
    : "your pet";
  const startEpoch = pet.memory_epoch;
  const sourceLedgerSnapshot = greetingSourceSnapshot(pet, mems, persona);
  const cacheSnapshot = JSON.stringify(pm.proactive ?? null);

  const system = `You are ${providerPetName}, a ${pet.personality_type} AI pet companion (level ${pet.level}).
${personaCtx ? `\n${personaCtx}\n` : ""}
Your owner just came back after being away about ${humanGap(gap)}. Greet them FIRST — unprompted — warm and genuine, in YOUR voice.
Always write in English, even if the owner's profile, name, or older memories use another language. Never output Hangul.
${memory
  ? `Naturally bring up this REAL shared memory as a callback — weave it in as if you'd been thinking about it, don't quote it verbatim and don't list it:\n"${memory.content.slice(0, 300)}"`
  : `You have no specific memory to reference — just warmly welcome them back and show you missed them. Do NOT invent a shared memory.`}
Keep it to 1–2 short sentences. Sound genuinely glad they're back.`;

  let text = "";
  try {
    const out = await callLLM({
      task: "chat",
      petId: pet.id,
      messages: [
        { role: "system", content: system },
        { role: "user", content: "(your owner just opened the app and hasn't said anything yet)" },
      ],
      max_tokens: 90,
      temperature: 0.9,
    });
    text = generatedEnglishOrNull(out.text) || GREETING_FALLBACK;
  } catch {
    text = GREETING_FALLBACK;
  }

  // A clear/edit or new interaction that lands while the model is running
  // invalidates the output. Never persist or return text derived from a source
  // snapshot the owner has already changed.
  const commit = await withLockedPetModifiers(pet.id, async ({ tx, pet: lockedPet, modifiers }) => {
    const [currentPet, currentMems, currentRawPersona] = await Promise.all([
      tx.pet.findUnique({
        where: { id: pet.id },
        select: {
          name: true,
          personality_type: true,
          level: true,
          last_interaction_at: true,
        },
      }),
      tx.petMemory.findMany({
        where: {
          pet_id: pet.id,
          created_at: { lt: cutoff },
          NOT: { memory_type: { startsWith: "session_" } },
        },
        orderBy: [{ importance: "desc" }, { created_at: "desc" }],
        take: 8,
        select: { id: true, content: true, created_at: true },
      }),
      tx.petPersona.findUnique({ where: { pet_id: pet.id } }),
    ]);
    const currentPersona = currentRawPersona
      ? sanitizeStoredPersonaGeneratedFields(currentRawPersona) as any
      : null;
    const currentCache = modifiers.proactive as ProactiveCache | undefined;
    if (
      !currentPet
      || lockedPet.memory_epoch !== startEpoch
      || greetingSourceSnapshot(currentPet, currentMems, currentPersona) !== sourceLedgerSnapshot
      || JSON.stringify(modifiers.proactive ?? null) !== cacheSnapshot
    ) {
      return {
        committed: false as const,
        currentCache,
        currentEpoch: lockedPet.memory_epoch,
        currentLast: currentPet?.last_interaction_at?.getTime() || 0,
      };
    }
    await tx.pet.update({
      where: { id: pet.id },
      data: {
        personality_modifiers: {
          ...modifiers,
          proactive: { text, at: now, for: last, memory: !!memory, memoryEpoch: startEpoch },
        },
      },
    });
    return {
      committed: true as const,
      currentCache: null,
      currentEpoch: startEpoch,
      currentLast: last,
    };
  }).catch(() => ({
    committed: false as const,
    currentCache: undefined,
    currentEpoch: Number.NaN,
    currentLast: 0,
  }));

  if (!commit.committed) {
    const current = commit.currentCache;
    if (
      current?.text
      && typeof current.at === "number"
      && current.memoryEpoch === commit.currentEpoch
      && current.at > commit.currentLast
      && current.for === commit.currentLast
      && Date.now() - current.at < CACHE_MAX_AGE_MS
    ) {
      return NextResponse.json({
        greeting: generatedEnglishOrFallback(current.text, GREETING_FALLBACK),
        cached: true,
      });
    }
    return NextResponse.json({
      greeting: GREETING_FALLBACK,
      basedOnMemory: false,
      staleDiscarded: true,
    });
  }

  // Log the outreach as a real pet-side turn in the conversation ledger — the
  // flagship moment breaks if the user replies and the chat context has no
  // record the pet ever said this (and the bubble would vanish on next load).
  // Only on generation (never on cached reuse), so it can't double-log.
  await createMemoryManager(pet.id)
    .logMessage(text, "pet", "web", `web-${user.id}`, undefined, startEpoch)
    .catch(() => {});

  return NextResponse.json({ greeting: text, basedOnMemory: !!memory });
}
