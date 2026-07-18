import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { verifySignature } from "@/lib/signAction";
import { sanitizeName, sanitizeText } from "@/lib/sanitize";
import { moderateText } from "@/lib/moderation";
import { rateLimit } from "@/lib/rateLimit";
import { callLLM, type LLMMessage } from "@/lib/llm/router";
import { NextRequest, NextResponse } from "next/server";
import { lockAvailablePetSlot, PetSlotLimitError } from "@/lib/petSlots";
import type { Pet, Prisma } from "@/generated/prisma/client";
import { generatedEnglishOrFallback } from "@/lib/generatedLanguage";

const PERSONALITIES = [
  "friendly", "playful", "shy", "brave", "lazy", "curious",
  "mischievous", "gentle", "adventurous", "dramatic", "wise", "sassy",
] as const;
const ADOPTION_REPLY_FALLBACK = "Tell me a little more about your dream pet! 🐾";

const SYSTEM_PROMPT = `You are a friendly pet adoption counselor at MY AI PET. Help the user describe their dream pet companion!

Your job:
1. Ask what they'd like to name their pet
2. Ask what kind of creature/species (cat, dog, dragon, phoenix, anything!)
3. Ask about personality (friendly, brave, shy, playful, etc.)
4. Ask about any special traits or quirks

Be warm, fun, and encouraging. Use emojis. Keep responses SHORT (2-3 sentences). Always respond in English.
Ask ONE question at a time. Don't rush - make it feel like a fun conversation.

Available personalities: friendly, playful, shy, brave, lazy, curious, mischievous, gentle, adventurous, dramatic, wise, sassy

When you have ALL of these: name, species/type, personality, and at least one trait:
- Summarize the pet excitedly
- Add this EXACT tag at the end of your message (the user won't see it):
[PET_READY]{"name":"...","species_name":"...","personality":"...","custom_traits":"..."}[/PET_READY]`;

function parsePetReady(text: string): {
  reply: string;
  petReady: boolean;
  petData?: { name: string; species_name: string; personality: string; custom_traits: string };
} {
  const match = text.match(/\[PET_READY\]([\s\S]*?)\[\/PET_READY\]/);
  if (!match) {
    return { reply: text, petReady: false };
  }

  try {
    const petData = JSON.parse(match[1]);
    const reply = text.replace(/\[PET_READY\][\s\S]*?\[\/PET_READY\]/, "").trim();
    return { reply, petReady: true, petData };
  } catch {
    return { reply: text, petReady: false };
  }
}

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // audit M8: this route spends paid Grok credits per request — rate limit it.
  const rl = rateLimit(req, { key: "adopt-chat", limit: 20, windowMs: 60_000 });
  if (!rl.ok) return rl.response;

  const body = await req.json();
  const { messages, action, petData, signedMessage, signature, manual } = body;

  // === CREATE ACTION: actually create the pet in DB ===
  if (action === "create") {
    // MANUAL fallback: if the user hits "Just create my pet" before the LLM ever
    // emitted [PET_READY] (Grok slow / down / never tagged), we must NOT dead-end
    // them. Backfill sensible defaults from whatever fields were gathered so the
    // create can proceed instead of 400-ing on a missing name.
    const effectivePetData = manual
      ? {
          name: petData?.name || "Buddy",
          species_name: petData?.species_name || "",
          personality: petData?.personality || "",
          custom_traits: petData?.custom_traits || "",
        }
      : petData;

    if (!effectivePetData || !effectivePetData.name) {
      return NextResponse.json({ error: "petData with name is required" }, { status: 400 });
    }

    // Verify wallet signature
    if (!signedMessage || !signature) {
      return NextResponse.json({ error: "Wallet signature is required to adopt a pet" }, { status: 400 });
    }
    const isValidSig = await verifySignature(signedMessage, signature, user.wallet_address);
    if (!isValidSig) {
      return NextResponse.json({ error: "Invalid wallet signature" }, { status: 403 });
    }

    // Fast preflight for a friendly response. The final create transaction
    // repeats this check under the shared user-row lock.
    const activePetCount = await prisma.pet.count({
      where: { user_id: user.id, is_active: true },
    });

    if (activePetCount >= user.pet_slots) {
      return NextResponse.json(
        { error: `You need to unlock more pet slots. Current: ${user.pet_slots}` },
        { status: 400 }
      );
    }

    // audit M7: sanitize + moderate the LLM-supplied pet fields with the SAME
    // gate /api/pets enforces — they flow into the DB, prompts, and social feed.
    const name = sanitizeName(effectivePetData.name, 50);
    const species_name = sanitizeName(effectivePetData.species_name, 50);
    const custom_traits = sanitizeText(effectivePetData.custom_traits, 500);
    if (!name) {
      return NextResponse.json({ error: "A valid pet name is required" }, { status: 400 });
    }
    for (const [field, value] of [
      ["name", name], ["species_name", species_name], ["custom_traits", custom_traits],
    ] as const) {
      const r = moderateText(value, field);
      if (!r.ok) {
        return NextResponse.json({ error: r.reason }, { status: 400 });
      }
    }

    const finalPersonality =
      effectivePetData.personality && PERSONALITIES.includes(effectivePetData.personality as any)
        ? effectivePetData.personality
        : PERSONALITIES[Math.floor(Math.random() * PERSONALITIES.length)];

    let pet: Pet;
    try {
      pet = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        await lockAvailablePetSlot(tx, user.id);
        return tx.pet.create({
          data: {
            user_id: user.id,
            name,
            species: 0,
            personality_type: finalPersonality,
            ...(species_name || custom_traits
              ? {
                  personality_modifiers: {
                    ...(species_name ? { species_name } : {}),
                    ...(custom_traits ? { custom_traits } : {}),
                  },
                }
              : {}),
          },
        });
      });
    } catch (error) {
      if (error instanceof PetSlotLimitError) {
        return NextResponse.json(
          { error: `You need to unlock more pet slots. Current: ${error.petSlots}` },
          { status: 400 },
        );
      }
      throw error;
    }

    await prisma.petMemory.create({
      data: {
        pet_id: pet.id,
        memory_type: "birth",
        content: `${name} was born! A new adventure begins.`,
        emotion: "happy",
        importance: 5,
      },
    });

    // Update user last_active_at
    await prisma.user
      .update({
        where: { id: user.id },
        data: { last_active_at: new Date() },
      })
      .catch(() => {});

    // Initialize Web4 Soul NFT (fire-and-forget on-chain mint)
    try {
      const { initializeSoul } = await import("@/lib/services/soul");
      await initializeSoul(pet.id, user.wallet_address);
    } catch (e) {
      console.error("Soul initialization error:", e);
      // Don't block adoption
    }

    return NextResponse.json(pet, { status: 201 });
  }

  // === CHAT FLOW: converse with the user to gather pet info ===
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: "messages array is required" }, { status: 400 });
  }

  try {
    const chatMessages: LLMMessage[] = [
      { role: "system", content: SYSTEM_PROMPT },
      // Cap the history LENGTH too (each entry is already capped at 500 chars) so
      // an oversized client payload can't balloon the upstream LLM request.
      ...messages.slice(-30).map((m: { role: string; content?: string; text?: string }) => ({
        // Only conversation roles are accepted from the client. In particular,
        // a client-supplied "system" role must not override the adoption rules.
        role: (m.role === "ai" || m.role === "assistant" ? "assistant" : "user") as "assistant" | "user",
        content: (m.content || m.text || "").slice(0, 500),
      })),
    ];

    const out = await callLLM({
      task: "chat",
      budgetUserId: user.id,
      messages: chatMessages,
      max_tokens: 300,
      temperature: 0.9,
    });
    const rawReply = out.text || "Hmm, I didn't catch that. Could you tell me more about your dream pet?";

    const result = parsePetReady(rawReply);
    // Keep user-derived structured pet data (including a name the owner chose),
    // but never expose a model-generated non-English assistant message.
    return NextResponse.json({
      ...result,
      reply: generatedEnglishOrFallback(result.reply, ADOPTION_REPLY_FALLBACK),
    });
  } catch (error: any) {
    console.error("Adopt chat error:", error);
    return NextResponse.json(
      { error: "Failed to chat. Please try again." },
      { status: 500 }
    );
  }
}
