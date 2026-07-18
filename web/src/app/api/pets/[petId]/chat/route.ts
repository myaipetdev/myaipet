import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { awardPointsCapped, DAILY_POINT_CAPS } from "@/lib/seasonRewards";
import { NextRequest, NextResponse } from "next/server";
import { createMemoryManager } from "@/lib/petclaw/memory/persistent-memory";
import { getRelevantMemories } from "@/lib/petclaw/memory/retrieval";
import { checkPendingApology } from "@/lib/missions/petEmotion";
import { getBondNotesBlock, maybeReflectOnBond } from "@/lib/petclaw/memory/bond-loop";
import { createSelfLearner, learnedPatternsBlock } from "@/lib/petclaw/memory/self-learning";
import { getPersona, buildPersonaContext } from "@/lib/services/persona";
import { rateLimit } from "@/lib/rateLimit";
import { sanitizeText } from "@/lib/sanitize";
import { estimateHelpfulness } from "@/lib/petclaw/memory/feedback";
import { BEST_OF_N_ENABLED, pickBest, pickBestLLM } from "@/lib/petclaw/memory/best-of-n";
import { callLLM } from "@/lib/llm/router";
import { generatedEnglishOrFallback } from "@/lib/generatedLanguage";

const GENERATED_REPLY_FALLBACK = "I'm happy to see you! Tell me more. 🐾";
const LEGACY_REPLY_FALLBACK = "A previous pet reply is unavailable in this English-only release.";

const PERSONALITY_VOICES: Record<string, string> = {
  friendly: "You speak warmly, use lots of exclamation marks, and are always encouraging. You love your owner.",
  playful: "You're energetic, use fun expressions, joke around, and always want to play. You add 'hehe' sometimes.",
  shy: "You speak softly, use '...' often, are hesitant but sweet. You blush easily and are easily embarrassed.",
  brave: "You speak confidently, are protective of your owner, and use bold statements. You're fearless.",
  lazy: "You speak slowly, yawn often, prefer napping. Everything is 'too much effort' but you still care.",
  curious: "You ask lots of questions, notice everything, and are fascinated by the world. 'Ooh what's that?!'",
  mischievous: "You're cheeky, love pranks, and tease your owner playfully. You're a little troublemaker.",
  gentle: "You speak calmly, are very caring and peaceful. You comfort your owner and speak poetically.",
  adventurous: "You're always excited about exploring, use travel metaphors, and dream of far-off places.",
  dramatic: "You're theatrical, exaggerate everything, use dramatic pauses... and always make scenes about small things.",
  wise: "You speak thoughtfully, offer little life lessons, and sometimes quote proverbs. You're an old soul.",
  sassy: "You have attitude, use sarcasm lovingly, and always have a witty comeback. You're fabulous.",
};

const MOOD_CONTEXT: Record<string, string> = {
  ecstatic: "You are EXTREMELY happy right now, practically bouncing with joy!",
  happy: "You're in a great mood, content and cheerful.",
  neutral: "You're feeling okay, nothing special.",
  sad: "You're feeling a bit down and would love some attention.",
  exhausted: "You're very tired and low on energy. You yawn and want to rest.",
  starving: "You're SO hungry, you can barely think about anything else. Please feed me!",
  grumpy: "You're irritable and a bit grumpy. Things aren't going your way.",
  tired: "You're sleepy and low energy. You respond slowly.",
  hungry: "You're getting hungry and it's starting to affect your mood.",
};

// GET — hydrate the chat thread from the pet's own memory ledger so a returning
// owner sees continuity, not a blank thread (the whole point of a pet that
// "remembers"). Returns the last ~20 turns as {role:"user"|"ai", text}.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ petId: string }> }
) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { petId } = await params;
  const pet = await prisma.pet.findFirst({
    where: { id: Number(petId), user_id: user.id, is_active: true },
    select: { id: true },
  });
  if (!pet) return NextResponse.json({ error: "Pet not found" }, { status: 404 });
  const memory = createMemoryManager(pet.id);
  const recent = await memory.getRecentMessages("all", 20).catch(() => []);
  // Preserve owner-authored text exactly. Only assistant/generated turns cross
  // the English-only display boundary.
  const messages = recent.map((m) => ({
    role: m.role === "user" ? "user" : "pet",
    text: m.role === "user"
      ? m.content
      : generatedEnglishOrFallback(m.content, LEGACY_REPLY_FALLBACK),
  }));
  return NextResponse.json({ messages });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ petId: string }> }
) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // SCRUM-67: limit chat to 30 turns/minute per user
  const rl = rateLimit(req, { key: "pet-chat", limit: 30, windowMs: 60_000 });
  if (!rl.ok) return rl.response;

  const { petId } = await params;
  const body = await req.json();
  const message = sanitizeText(body.message, 500);

  if (!message || message.trim().length === 0) {
    return NextResponse.json({ error: "Message required" }, { status: 400 });
  }

  const pet = await prisma.pet.findFirst({
    where: { id: Number(petId), user_id: user.id, is_active: true },
  });
  if (!pet) return NextResponse.json({ error: "Pet not found" }, { status: 404 });

  // Determine mood
  const mood = pet.happiness >= 80 ? "ecstatic"
    : pet.happiness >= 60 ? "happy"
    : pet.energy < 20 ? "exhausted"
    : pet.hunger > 80 ? "starving"
    : pet.hunger > 60 ? "hungry"
    : pet.happiness < 30 ? "sad"
    : pet.energy < 40 ? "tired"
    : "neutral";

  const personalityVoice = PERSONALITY_VOICES[pet.personality_type] || PERSONALITY_VOICES.friendly;
  const moodContext = MOOD_CONTEXT[mood] || MOOD_CONTEXT.neutral;
  const customTraits = (pet.personality_modifiers as any)?.custom_traits || "";

  // ── Persistent memory + persona context ──
  // PetMemoryManager pulls MEMORY.md, USER.md, recent cross-platform messages,
  // and runs lexical prefetch over stored memories. Onboarding answers seeded via
  // saveOnboarding() flow into pet.personality_modifiers.user_profile so they
  // appear here automatically.
  const memory = createMemoryManager(pet.id);
  const memCtx = await memory.buildContext(message.trim(), "web").catch(() => null);
  // GBrain-style full-corpus recall: rank the top-K relevant rows over the
  // ENTIRE pet_memories table (not just the 40-entry capped ledger memCtx uses).
  // Lets the pet recall an old conversation/milestone that fell out of the ledger.
  const recalled = await getRelevantMemories(pet.id, message.trim(), 5).catch(() => []);
  const persona = await getPersona(pet.id).catch(() => null);
  const personaCtx = buildPersonaContext(persona);

  // Estimate how the LAST pet reply landed — feeds back into self-learning
  // successRate so good patterns rise and bad ones fade.
  const helpfulnessSignal = await estimateHelpfulness(pet.id, message.trim(), "web").catch(() => null);

  const systemPrompt = `You are ${pet.name}, a Level ${pet.level} pet companion.

PERSONALITY: ${pet.personality_type}
${personalityVoice}
${customTraits ? `CUSTOM TRAITS: ${customTraits}` : ""}

CURRENT STATE:
${moodContext}
- Happiness: ${pet.happiness}/100
- Energy: ${pet.energy}/100
- Hunger: ${pet.hunger}/100
- Bond with owner: ${pet.bond_level}/100
- Total interactions: ${pet.total_interactions}
${personaCtx ? `\nOWNER PROFILE (from onboarding):\n${personaCtx}` : ""}
${memCtx?.userMd ? `\n${memCtx.userMd}` : ""}
${memCtx?.memoryMd ? `\n${memCtx.memoryMd}` : ""}
${(() => {
  // Merge ledger-relevant (curated, capped) + full-corpus recall (GBrain-style),
  // dedup by content, cap at 8 lines so the prompt stays bounded.
  const ledger = (memCtx?.relevantMemories || []).map(m => m.content);
  const corpus = recalled.map(m => m.content);
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const c of [...ledger, ...corpus]) {
    const key = c.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(c);
    if (merged.length >= 8) break;
  }
  return merged.length ? `\nRELEVANT TO THIS MESSAGE:\n${merged.map(c => `- ${c}`).join("\n")}` : "";
})()}
${memCtx?.recentMessages?.length ? `\nRECENT CONVERSATION:\n${memCtx.recentMessages.slice(-6).map(m => `${m.role === "user" ? "Owner" : pet.name}${m.platform !== "web" ? ` [${m.platform}]` : ""}: ${m.content}`).join("\n")}` : ""}

RULES:
- ALWAYS respond in English. This is an English-language product; reply in English even if the owner writes in another language.
- You ARE the pet. Respond in first person as ${pet.name}.
- Keep responses SHORT (1-3 sentences max).
- Show your personality and current mood in every response.
- React to your stats naturally (if hungry, mention food; if tired, yawn).
- Higher bond level = more affectionate responses.
- Level ${pet.level}: ${pet.level < 5 ? "You speak simply, like a baby." : pet.level < 10 ? "You're learning to express yourself better." : pet.level < 20 ? "You communicate clearly and have opinions." : "You're wise and articulate, with deep thoughts."}
- Reference past memories naturally when relevant — don't list them.
- NEVER address the owner by a specific name unless they tell you their name in this conversation.
${(await checkPendingApology(pet.user_id)).note}
${await getBondNotesBlock(pet.id)}
${learnedPatternsBlock(pet)}
- Use emojis sparingly but naturally.
- NEVER break character. You are a pet, not an AI.`;

  try {
    const callCandidate = (temperature: number) => callLLM({
      task: "chat",
      petId: pet.id,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: message.trim().slice(0, 500) },
      ],
      max_tokens: 150,
      temperature,
    });

    let reply: string;
    if (BEST_OF_N_ENABLED) {
      // Two routed candidates preserve owner BYOK and gain the same bounded
      // platform-provider fallback as the normal single-candidate path.
      const results = await Promise.allSettled([callCandidate(0.75), callCandidate(1.0)]);
      const temperatures = [0.75, 1.0];
      const candidates = results
        .map((result, i) => ({
          text: result.status === "fulfilled" ? result.value.text : "",
          temperature: temperatures[i],
        }))
        .filter((candidate) => candidate.text);
      if (candidates.length === 0) throw new Error("Chat failed");
      const learnedPatterns: any[] = ((pet.personality_modifiers as any)?.learned_patterns) || [];
      // CHORUS v2: an independent LLM judge picks the best candidate; on any
      // failure (no key / error / bad output) it returns null and we fall back
      // to the cheap keyword heuristic — no behavior regression.
      const judged = await pickBestLLM(candidates, { userMessage: message.trim(), systemPrompt }, pet.id);
      reply = judged
        ? judged.chosen.text
        : pickBest(candidates, {
            userMessage: message.trim(),
            personalityType: pet.personality_type,
            targetMaxChars: 200,
            learnedPatterns,
          }).text;
    } else {
      // Main reply path — routed through the model router (task:'chat'), so the
      // pet-owner's connected model (BYOK) answers if they've connected one for
      // chat, else the env-selected platform route (xAI, then OpenAI by default).
      const out = await callCandidate(0.9);
      reply = out.text || GENERATED_REPLY_FALLBACK;
    }

    // Provider and BYOK models can ignore prompt language. Enforce the invariant
    // once, immediately before any DB write or API response, without a second
    // paid model call.
    reply = generatedEnglishOrFallback(reply, GENERATED_REPLY_FALLBACK);

    // Save as interaction + memory.
    // interaction_type MUST be "chat" (not "talk") — this row is the ledger the
    // Season Rewards conversation missions count off. The daily missions
    // say_hi / chat_5 / chat_10 (catalog.ts) and the weekly/monthly
    // week_chats_30 / month_conversationalist (periodic.ts) all query
    // petInteraction rows with interaction_type === "chat". Writing "talk" here
    // (the value the manual /interact talk-button uses) meant not a single chat
    // turn ever counted, so those missions were permanently stuck at 0 and their
    // points never awarded (SCRUM-101). "talk" from the /interact route is a
    // separate, deliberate affordance and is unaffected.
    await prisma.petInteraction.create({
      data: {
        pet_id: pet.id,
        user_id: user.id,
        interaction_type: "chat",
        response_text: reply,
        happiness_change: 8,
        energy_change: -3,
        hunger_change: 2,
        experience_gained: 8,
      },
    });

    // Apply talk effects
    await prisma.pet.update({
      where: { id: pet.id },
      data: {
        happiness: Math.min(100, pet.happiness + 8),
        energy: Math.max(0, pet.energy - 3),
        hunger: Math.min(100, pet.hunger + 2),
        experience: pet.experience + 8,
        bond_level: Math.min(100, pet.bond_level + 2),
        total_interactions: pet.total_interactions + 1,
        last_interaction_at: new Date(),
      },
    });

    await prisma.petMemory.create({
      data: {
        pet_id: pet.id,
        memory_type: "conversation",
        content: `Owner said: "${message.trim().slice(0, 100)}" — I replied: "${reply.slice(0, 100)}"`,
        emotion: mood,
        importance: 2,
      },
    });

    // Persistent memory retention — extract durable facts + user-profile updates.
    // Fire-and-forget (Grok call ~1s); we don't block the chat response on it.
    memory.retainFromConversation(message.trim(), reply, "web", `web-${user.id}`, user.id)
      .catch((e: any) => console.error("memory.retain failed:", e?.message));

    // Self-learning observer — topic detection + skill auto-promotion at 3 hits.
    // Uses the prev-turn helpfulness signal so successRate reflects real reactions.
    const helpfulness = helpfulnessSignal?.score ?? 0.5;
    createSelfLearner(pet.id)
      .observeConversation(message.trim(), reply, helpfulness)
      .catch((e: any) => console.error("self-learning failed:", e?.message));

    // Bond Feedback Loop — every ~8 turns, the pet writes a one-line note on
    // HOW to be a better companion to this owner, which flows into future
    // system prompts. Fire-and-forget.
    maybeReflectOnBond(pet.id, message.trim(), reply)
      .catch((e: any) => console.error("bond-loop failed:", e?.message));

    // Record Web4 heartbeat + user activity (fire-and-forget)
    try {
      const { recordHeartbeat } = await import("@/lib/services/soul");
      await recordHeartbeat(pet.id);
    } catch {}
    await prisma.user
      .update({ where: { id: user.id }, data: { last_active_at: new Date() } })
      .catch(() => {});

    // Talking to your pet feeds the season (web + Chrome extension), capped.
    const sp = await awardPointsCapped(user.id, "pet_chat", 2, DAILY_POINT_CAPS.pet_chat).catch(() => ({ points: 0 }));

    return NextResponse.json({
      reply,
      mood,
      effects: { happiness: 8, energy: -3, hunger: 2, experience: 8, bond: 2 },
      pointsAwarded: sp.points || 0,
    });
  } catch (error: any) {
    console.error("Pet chat error:", error);
    // Fallback response based on personality
    const fallbacks: Record<string, string[]> = {
      friendly: ["I love talking to you! 💕", "You're the best owner ever!", "Hehe, tell me more!"],
      playful: ["Ooh ooh! Let's play instead! 🎾", "Hehe, you're funny!", "Tag, you're it!"],
      shy: ["O-oh... hi... 👉👈", "That's nice...", "*hides behind paw*"],
      lazy: ["*yawns* ...huh? Oh, hi... 😴", "Can we nap instead?", "Mmm... five more minutes..."],
      default: [GENERATED_REPLY_FALLBACK, "*wags tail*", "Woof! 🐾"],
    };
    const opts = fallbacks[pet.personality_type] || fallbacks.default;
    const reply = generatedEnglishOrFallback(
      opts[Math.floor(Math.random() * opts.length)],
      GENERATED_REPLY_FALLBACK,
    );

    // Even on LLM failure, log the user's turn so cross-platform timeline doesn't
    // get holes. We skip extraction (no real reply to extract from).
    memory.logTurnOnly(message.trim(), "web", `web-${user.id}`, user.id).catch(() => {});

    return NextResponse.json({ reply, mood, effects: {} });
  }
}
