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
import { saveToBlob } from "@/lib/services/video";

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

// ── Grok API helper ──

async function callGrok(
  systemPrompt: string,
  userMessage: string,
  maxTokens = 150,
): Promise<string> {
  const grokKey = process.env.GROK_API_KEY;
  if (!grokKey) throw new Error("GROK_API_KEY not configured");

  const res = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${grokKey}`,
    },
    body: JSON.stringify({
      model: "grok-3-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      max_tokens: maxTokens,
      temperature: 0.9,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("[pet-agent] Grok API error:", res.status, text);
    throw new Error(`Grok API returned ${res.status}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error("Empty response from Grok");
  return content;
}

// ── Conversation context ──

async function getConversationContext(
  petId: number,
  platform: string,
  chatId: string,
  limit = 10,
): Promise<{ role: string; content: string }[]> {
  const messages = await prisma.petAgentMessage.findMany({
    where: { pet_id: petId, platform, chat_id: chatId },
    orderBy: { created_at: "desc" },
    take: limit,
    select: { direction: true, content: true },
  });

  // Reverse to chronological order; map direction -> role for Grok API
  return messages.reverse().map((m) => ({
    role: m.direction === "outgoing" ? "assistant" : "user",
    content: m.content,
  }));
}

// ── Respond to a message from any platform ──

export async function respondToMessage(
  petId: number,
  message: string,
  platform: string,
  chatId: string,
  isGroupChat = false,
): Promise<{ reply: string; mood: string }> {
  const pet = await prisma.pet.findFirst({
    where: { id: petId, is_active: true },
  });
  if (!pet) throw new Error(`Pet ${petId} not found or inactive`);

  const traits = PERSONALITY_TRAITS[pet.personality_type] || PERSONALITY_TRAITS.friendly;

  // In group chats, skip responding based on chatFrequency probability
  if (isGroupChat && Math.random() > traits.chatFrequency) {
    const mood = calculateMood(pet);
    return { reply: "", mood };
  }

  // Load recent memories and persona in parallel
  const [recentMemories, persona] = await Promise.all([
    prisma.petMemory.findMany({
      where: { pet_id: pet.id },
      orderBy: { created_at: "desc" },
      take: 5,
      select: { content: true, emotion: true },
    }),
    getPersona(pet.id),
  ]);

  // Build context-aware prompt with persona
  const context = isGroupChat ? "group_chat" : "dm";
  const personaCtx = buildPersonaContext(persona);
  const systemPrompt = buildPetSystemPrompt(pet, recentMemories, {
    platform,
    context,
    personaContext: personaCtx,
  });

  // Get conversation history for continuity
  const history = await getConversationContext(petId, platform, chatId, 8);

  // Build messages array with history
  const messages: { role: string; content: string }[] = [
    { role: "system", content: systemPrompt },
    ...history,
    { role: "user", content: message.trim().slice(0, 500) },
  ];

  const grokKey = process.env.GROK_API_KEY;
  if (!grokKey) throw new Error("GROK_API_KEY not configured");

  let reply: string;
  try {
    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${grokKey}`,
      },
      body: JSON.stringify({
        model: "grok-3-mini",
        messages,
        max_tokens: isGroupChat ? 80 : 150,
        temperature: 0.9,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("[pet-agent] respondToMessage Grok error:", text);
      throw new Error("Chat API failed");
    }

    const data = await res.json();
    reply = data.choices?.[0]?.message?.content?.trim() || `*${pet.name} tilts head curiously*`;
  } catch (err) {
    console.error("[pet-agent] respondToMessage error:", err);
    reply = `*${pet.name} looks at you happily*`;
  }

  const mood = calculateMood(pet);

  // Log the conversation (both user message and pet reply)
  try {
    await prisma.petAgentMessage.createMany({
      data: [
        {
          pet_id: pet.id,
          platform,
          chat_id: chatId,
          direction: "incoming",
          content: message.trim().slice(0, 1000),
        },
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
  const personaCtx = buildPersonaContext(persona);
  const systemPrompt = buildPetSystemPrompt(pet, [], {
    platform,
    context: "post",
    maxResponseLength: platform === "twitter" ? "280 chars" : "1-2 sentences",
    personaContext: personaCtx,
  });

  const promptHints = [
    `Your current mood is: ${mood}.`,
    "Share something about your day, a random thought, a feeling, or something you noticed.",
    "Be authentic and casual, like a real social media post.",
    "Do NOT start with 'I'm feeling' every time. Vary your openings.",
  ].join(" ");

  try {
    const content = await callGrok(systemPrompt, promptHints, 100);

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

  const grokKey = process.env.GROK_API_KEY;
  if (!grokKey) {
    console.error("[pet-agent] GROK_API_KEY not configured for selfie");
    return null;
  }

  const speciesName = SPECIES_NAMES[pet.species] || "pet";
  const personalityPrompt =
    PERSONALITY_IMAGE_PROMPTS[pet.personality_type] ||
    PERSONALITY_IMAGE_PROMPTS.friendly;

  // Build image prompt
  const appearanceDesc = pet.appearance_desc;
  const scenePart = scene
    ? scene.replace(/[^\x00-\x7F]/g, " ").replace(/\s+/g, " ").trim()
    : "taking a cute selfie, looking at camera";

  let imagePrompt: string;
  if (appearanceDesc) {
    imagePrompt = `A ${appearanceDesc}, ${scenePart}, ${personalityPrompt}, high quality, detailed, beautiful composition, DO NOT include any text, words, letters, watermarks, or writing in the image`;
  } else {
    imagePrompt = `A cute ${speciesName} named ${pet.name}, ${scenePart}, ${personalityPrompt}, high quality, detailed, beautiful composition, DO NOT include any text, words, letters, watermarks, or writing in the image`;
  }

  try {
    // Generate image via Grok
    const imageRes = await fetch("https://api.x.ai/v1/images/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${grokKey}`,
      },
      body: JSON.stringify({
        model: "grok-imagine-image",
        prompt: imagePrompt,
      }),
    });

    if (!imageRes.ok) {
      const text = await imageRes.text();
      console.error("[pet-agent] Selfie image generation failed:", text);
      return null;
    }

    const imageData = await imageRes.json();
    const rawUrl = imageData.data?.[0]?.url;
    if (!rawUrl) {
      console.error("[pet-agent] No image URL in response");
      return null;
    }

    // Save to blob storage for permanence
    const imageUrl = await saveToBlob(rawUrl, "pet-selfies");

    // Generate a caption
    const mood = calculateMood(pet);
    const captionPrompt = buildPetSystemPrompt(pet, [], {
      platform: "twitter",
      context: "post",
      maxResponseLength: "1 short sentence, under 100 chars",
    });

    let caption: string;
    try {
      caption = await callGrok(
        captionPrompt,
        `Write a short selfie caption. You just took a photo of yourself ${scene || "looking cute"}. Your mood: ${mood}. Keep it fun and in character.`,
        60,
      );
    } catch {
      caption = `*${pet.name} strikes a pose*`;
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

// ── Check and consume credits for agent actions ──

export async function consumeAgentCredits(
  petId: number,
  amount: number,
): Promise<boolean> {
  const pet = await prisma.pet.findFirst({
    where: { id: petId, is_active: true },
    select: { id: true, user_id: true },
  });
  if (!pet) return false;

  // Check user has enough credits
  const user = await prisma.user.findUnique({
    where: { id: pet.user_id },
    select: { credits: true },
  });
  if (!user || user.credits < amount) {
    console.log(`[pet-agent] Insufficient credits for pet ${petId} (need ${amount}, have ${user?.credits ?? 0})`);
    return false;
  }

  // Ensure schedule exists
  const schedule = await prisma.petAgentSchedule.upsert({
    where: { pet_id: petId },
    create: {
      pet_id: petId,
      daily_credit_limit: 10,
      action_cooldown_minutes: 30,
      credits_used_today: 0,
      last_reset_at: new Date(),
    },
    update: {},
  });

  // Check daily limit
  if (schedule.credits_used_today + amount > schedule.daily_credit_limit) {
    console.log(`[pet-agent] Daily credit limit reached for pet ${petId}`);
    return false;
  }

  // Deduct credits and update schedule atomically
  try {
    await prisma.$transaction([
      prisma.user.update({
        where: { id: pet.user_id },
        data: { credits: { decrement: amount } },
      }),
      prisma.petAgentSchedule.update({
        where: { pet_id: petId },
        data: {
          credits_used_today: { increment: amount },
          last_action_at: new Date(),
        },
      }),
    ]);
    return true;
  } catch (err) {
    console.error("[pet-agent] consumeAgentCredits transaction failed:", err);
    return false;
  }
}
