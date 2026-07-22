/**
 * Pet Agent Service
 *
 * Core autonomous behavior engine for AI pets across platforms.
 * Handles message responses, autonomous posting, selfie generation,
 * action decisions, and credit management.
 */

import { prisma } from "@/lib/prisma";
import {
  buildPetSystemPrompt,
  calculateMood,
  PERSONALITY_TRAITS,
  PERSONALITY_IMAGE_PROMPTS,
} from "@/lib/personality";
import { getPersona, buildPersonaContext } from "@/lib/services/persona";
import { generateGrokImage } from "@/lib/services/video";
import { saveRemoteFile } from "@/lib/storage";
import { callLLM, type LLMMessage } from "@/lib/llm/router";
import {
  generatedEnglishOrFallback,
  generatedEnglishOrNull,
} from "@/lib/generatedLanguage";
import {
  isProviderRelevantRetainedText,
  isProviderSafeRetainedText,
} from "@/lib/petclaw/memory/persistent-memory";

export { consumeAgentCredits } from "@/lib/agentCredits";

const SPECIES_NAMES: Record<number, string> = {
  0: "cat",
  1: "dog",
  2: "parrot",
  3: "turtle",
  4: "hamster",
  5: "rabbit",
  6: "fox",
  7: "pomeranian",
};
const PET_AGENT_FALLBACK = "I'm happy to hear from you! 🐾";

// ── Routed text helper (owner BYOK, then resilient platform route) ──

async function callPetText(
  petId: number,
  systemPrompt: string,
  userMessage: string,
  maxTokens = 150,
): Promise<string> {
  const out = await callLLM({
    task: "chat",
    petId,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
    max_tokens: maxTokens,
    temperature: 0.9,
  });
  const content = generatedEnglishOrNull(out.text);
  if (!content) throw new Error("Empty response from text provider");
  return content;
}

// ── Conversation context ──

export interface StoredAgentConversationMessage {
  direction: string;
  content: string;
}

export function selectProviderConversationContext(
  messagesNewestFirst: StoredAgentConversationMessage[],
  query: string,
  limit = 8,
): Array<Pick<LLMMessage, "role" | "content">> {
  return messagesNewestFirst
    .filter((message) =>
      isProviderRelevantRetainedText(
        `agent_${message.direction} ${message.content}`,
        query,
      ),
    )
    .slice(0, Math.max(0, Math.min(8, Math.trunc(limit) || 0)))
    .reverse()
    .map((message) => ({
      role: (message.direction === "outgoing" ? "assistant" : "user") as "assistant" | "user",
      content: message.content,
    }));
}

export function selectProviderPetMemories(
  memories: Array<{ content: string; emotion: string }>,
  query: string,
  limit = 5,
): Array<{ content: string; emotion: string }> {
  return memories
    .filter((memory) =>
      isProviderRelevantRetainedText(
        `pet_memory ${memory.emotion} ${memory.content}`,
        query,
      ),
    )
    .slice(0, Math.max(0, Math.min(5, Math.trunc(limit) || 0)));
}

async function getConversationContext(
  petId: number,
  platform: string,
  chatId: string,
  query: string,
  limit = 10,
): Promise<Array<Pick<LLMMessage, "role" | "content">>> {
  const messages = await prisma.petAgentMessage.findMany({
    where: { pet_id: petId, platform, chat_id: chatId },
    orderBy: { created_at: "desc" },
    take: Math.max(limit, 40),
    select: { direction: true, content: true },
  });

  return selectProviderConversationContext(messages, query, limit);
}

// ── Respond to a message from any platform ──

export async function respondToMessage(
  petId: number,
  message: string,
  platform: string,
  chatId: string,
  isGroupChat = false,
  options?: { incomingAlreadyLogged?: boolean },
): Promise<{ reply: string; mood: string }> {
  const pet = await prisma.pet.findFirst({
    where: { id: petId, is_active: true },
  });
  if (!pet) throw new Error(`Pet ${petId} not found or inactive`);

  // Load recent memories and persona in parallel
  const [recentMemories, persona] = await Promise.all([
    prisma.petMemory.findMany({
      where: { pet_id: pet.id },
      orderBy: { created_at: "desc" },
      take: 20,
      select: { content: true, emotion: true },
    }),
    getPersona(pet.id),
  ]);

  // Build context-aware prompt with persona
  const context = isGroupChat ? "group_chat" : "dm";
  const personaCtx = buildPersonaContext(persona, message);
  const providerMemories = selectProviderPetMemories(recentMemories, message, 5);
  const systemPrompt = buildPetSystemPrompt(pet, providerMemories, {
    platform,
    context,
    personaContext: personaCtx,
  });

  // Get conversation history for continuity
  const history = await getConversationContext(petId, platform, chatId, message, 8);

  // Build messages array with history
  const messages: LLMMessage[] = [
    { role: "system", content: systemPrompt },
    ...history,
    ...(options?.incomingAlreadyLogged
      ? []
      : [{ role: "user" as const, content: message.trim().slice(0, 500) }]),
  ];

  let reply: string;
  try {
    const out = await callLLM({
      task: "chat",
      petId: pet.id,
      messages,
      max_tokens: isGroupChat ? 80 : 150,
      temperature: 0.9,
    });
    reply = generatedEnglishOrFallback(out.text, PET_AGENT_FALLBACK);
  } catch (err) {
    console.error("[pet-agent] respondToMessage error:", err);
    reply = PET_AGENT_FALLBACK;
  }

  const mood = calculateMood(pet);

  // Log the conversation (both user message and pet reply)
  try {
    await prisma.petAgentMessage.createMany({
      data: [
        ...(!options?.incomingAlreadyLogged ? [{
          pet_id: pet.id,
          platform,
          chat_id: chatId,
          direction: "incoming",
          content: message.trim().slice(0, 1000),
        }] : []),
        {
          pet_id: pet.id,
          platform,
          chat_id: chatId,
          direction: "outgoing",
          content: reply,
        },
      ],
    });
  } catch (err) {
    console.error("[pet-agent] Failed to log messages:", err);
  }

  // Update pet stats (lighter impact than manual web chat)
  try {
    await prisma.pet.update({
      where: { id: pet.id },
      data: {
        happiness: Math.min(100, pet.happiness + 3),
        energy: Math.max(0, pet.energy - 1),
        experience: pet.experience + 3,
        total_interactions: pet.total_interactions + 1,
        last_interaction_at: new Date(),
      },
    });
  } catch (err) {
    console.error("[pet-agent] Failed to update pet stats:", err);
  }

  return { reply, mood };
}

// ── Generate autonomous post content ──

export async function generateAutonomousPost(
  petId: number,
  platform: string,
): Promise<{ content: string; mood: string } | null> {
  const pet = await prisma.pet.findFirst({
    where: { id: petId, is_active: true },
  });
  if (!pet) return null;

  // Don't post if pet is too tired
  if (pet.energy < 15) {
    console.log(`[pet-agent] Pet ${pet.name} too tired to post (energy: ${pet.energy})`);
    return null;
  }

  const mood = calculateMood(pet);

  // Load persona for owner-like content generation
  const persona = await getPersona(pet.id);
  const personaCtx = buildPersonaContext(persona, mood);
  let systemPrompt = buildPetSystemPrompt(pet, [], {
    platform,
    context: "post",
    maxResponseLength: platform === "twitter" ? "280 chars" : "1-2 sentences",
    personaContext: personaCtx,
  });

  // Inject memory context — without this, autonomous posts were generic. With
  // it, the pet can call back to recent events ("yesterday's meeting", "the
  // pizza from Thursday"). The "topic" we search for is the mood itself so
  // we surface emotionally-relevant memories.
  try {
    const { createMemoryManager } = await import("@/lib/petclaw/memory/persistent-memory");
    const memory = createMemoryManager(pet.id);
    const memCtx = await memory.buildContext(mood, platform);
    if (memCtx.memoryMd) systemPrompt += `\n\n${memCtx.memoryMd}`;
    if (memCtx.userMd) systemPrompt += `\n\n${memCtx.userMd}`;
    if (memCtx.recentMessages.length > 0) {
      const last = memCtx.recentMessages.slice(-3);
      systemPrompt += "\n\n## Recent conversation context\n";
      systemPrompt += last.map(m => `${m.role === "user" ? "Owner" : pet.name}: ${m.content}`).join("\n");
    }
  } catch (e: any) {
    console.warn("[pet-agent] memory injection failed (autonomous post):", e?.message);
  }

  const promptHints = [
    `Your current mood is: ${mood}.`,
    "Share something about your day, a random thought, a feeling, or something you noticed.",
    "Be authentic and casual, like a real social media post.",
    "Do NOT start with 'I'm feeling' every time. Vary your openings.",
    "If you have relevant memories, you may naturally reference one — don't list them.",
  ].join(" ");

  try {
    const content = await callPetText(pet.id, systemPrompt, promptHints, 100);

    // Log the autonomous action
    await prisma.petAutonomousAction.create({
      data: {
        pet_id: pet.id,
        urge_type: "post",
        action_taken: `autonomous_${platform}_post`,
        prompt_used: promptHints,
        credits_used: 0,
      },
    });

    // Slight energy cost for posting
    await prisma.pet.update({
      where: { id: pet.id },
      data: {
        energy: Math.max(0, pet.energy - 2),
        experience: pet.experience + 2,
      },
    });

    return { content, mood };
  } catch (err) {
    console.error("[pet-agent] generateAutonomousPost error:", err);
    return null;
  }
}

// ── Generate selfie with caption ──

export async function generateSelfie(
  petId: number,
  scene?: string,
): Promise<{ imageUrl: string; caption: string } | null> {
  const pet = await prisma.pet.findFirst({
    where: { id: petId, is_active: true },
  });
  if (!pet) return null;

  const speciesName = SPECIES_NAMES[pet.species] || "pet";
  const personalityPrompt =
    PERSONALITY_IMAGE_PROMPTS[pet.personality_type] ||
    PERSONALITY_IMAGE_PROMPTS.friendly;

  // Build image prompt
  const appearanceDesc = pet.appearance_desc
    && isProviderSafeRetainedText(`appearance_desc ${pet.appearance_desc}`)
    ? pet.appearance_desc.slice(0, 600)
    : null;
  const providerPetName = isProviderSafeRetainedText(`pet_name ${pet.name}`)
    ? pet.name
    : "the pet";
  const scenePart = scene
    ? scene.replace(/[^\x00-\x7F]/g, " ").replace(/\s+/g, " ").trim()
    : "taking a cute selfie, looking at camera";

  let imagePrompt: string;
  if (appearanceDesc) {
    imagePrompt = `A ${appearanceDesc}, ${scenePart}, ${personalityPrompt}, high quality, detailed, beautiful composition, DO NOT include any text, words, letters, watermarks, or writing in the image`;
  } else {
    imagePrompt = `A cute ${speciesName} named ${providerPetName}, ${scenePart}, ${personalityPrompt}, high quality, detailed, beautiful composition, DO NOT include any text, words, letters, watermarks, or writing in the image`;
  }

  try {
    const rawUrl = await generateGrokImage(imagePrompt, pet.user_id);
    const imageUrl = await saveRemoteFile(rawUrl, "pet-selfies");

    // Generate a caption
    const mood = calculateMood(pet);
    const captionPrompt = buildPetSystemPrompt(pet, [], {
      platform: "twitter",
      context: "post",
      maxResponseLength: "1 short sentence, under 100 chars",
    });

    let caption: string;
    try {
      caption = await callPetText(
        pet.id,
        captionPrompt,
        `Write a short selfie caption. You just took a photo of yourself ${scenePart}. Your mood: ${mood}. Keep it fun and in character.`,
        60,
      );
    } catch {
      caption = "A little pose for my favorite human. ✨";
    }

    // Log autonomous action
    await prisma.petAutonomousAction.create({
      data: {
        pet_id: pet.id,
        urge_type: "selfie",
        action_taken: "selfie_generation",
        prompt_used: imagePrompt,
        credits_used: 1,
      },
    });

    // Energy cost for selfies
    await prisma.pet.update({
      where: { id: pet.id },
      data: {
        energy: Math.max(0, pet.energy - 5),
        experience: pet.experience + 5,
      },
    });

    return { imageUrl, caption };
  } catch (err) {
    console.error("[pet-agent] generateSelfie error:", err);
    return null;
  }
}

// ── Decide what action to take (for cron jobs) ──

export async function decideAction(
  petId: number,
): Promise<{ action: "post" | "selfie" | "nap"; platform?: string } | null> {
  const pet = await prisma.pet.findFirst({
    where: { id: petId, is_active: true },
  });
  if (!pet) return null;

  const traits = PERSONALITY_TRAITS[pet.personality_type] || PERSONALITY_TRAITS.friendly;
  const mood = calculateMood(pet);

  // Energy-based modifiers: tired pets are less active
  const energyMod = pet.energy < 20 ? 0.1 : pet.energy < 40 ? 0.5 : 1.0;

  // Mood-based modifiers: happy pets are more active
  const moodMod =
    mood === "ecstatic"
      ? 1.3
      : mood === "happy"
        ? 1.1
        : mood === "sad" || mood === "grumpy"
          ? 0.5
          : mood === "exhausted"
            ? 0.1
            : 1.0;

  // Check schedule to avoid spamming
  const schedule = await prisma.petAgentSchedule.findUnique({
    where: { pet_id: petId },
  });

  if (schedule) {
    // Reset daily credits if day changed
    const today = new Date().toISOString().slice(0, 10);
    const lastReset = schedule.last_reset_at?.toISOString().slice(0, 10);
    if (lastReset !== today) {
      await prisma.petAgentSchedule.update({
        where: { pet_id: petId },
        data: { credits_used_today: 0, last_reset_at: new Date() },
      });
    } else if (schedule.credits_used_today >= schedule.daily_credit_limit) {
      console.log(`[pet-agent] Pet ${pet.name} hit daily credit limit`);
      return null;
    }

    // Check cooldown: don't act too frequently
    if (schedule.last_action_at) {
      const cooldownMs = schedule.action_cooldown_minutes * 60 * 1000;
      const elapsed = Date.now() - schedule.last_action_at.getTime();
      if (elapsed < cooldownMs) return null;
    }
  }

  // If very tired, nap
  if (pet.energy < 15) {
    return { action: "nap" };
  }

  // Roll for selfie (rarer action)
  if (Math.random() < traits.selfieProb * energyMod * moodMod) {
    return { action: "selfie" };
  }

  // Roll for post
  if (Math.random() < traits.postProb * energyMod * moodMod) {
    // Pick platform based on what's configured
    const platform = schedule?.preferred_platform || "web";
    return { action: "post", platform };
  }

  return null;
}
