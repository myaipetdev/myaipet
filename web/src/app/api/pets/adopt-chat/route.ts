import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { verifySignature } from "@/lib/signAction";
import { NextRequest, NextResponse } from "next/server";

const PERSONALITIES = [
  "friendly", "playful", "shy", "brave", "lazy", "curious",
  "mischievous", "gentle", "adventurous", "dramatic", "wise", "sassy",
] as const;

const SYSTEM_PROMPT = `You are a friendly pet adoption counselor at MY AI PET. Help the user describe their dream pet companion!

Your job:
1. Ask what they'd like to name their pet
2. Ask what kind of creature/species (cat, dog, dragon, phoenix, anything!)
3. Ask about personality (friendly, brave, shy, playful, etc.)
4. Ask about any special traits or quirks

Be warm, fun, and encouraging. Use emojis. Keep responses SHORT (2-3 sentences).
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

  const body = await req.json();
  const { messages, action, petData, signedMessage, signature } = body;

  // === CREATE ACTION: actually create the pet in DB ===
  if (action === "create") {
    if (!petData || !petData.name) {
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

    const activePetCount = await prisma.pet.count({
      where: { user_id: user.id, is_active: true },
    });

    if (activePetCount >= user.pet_slots) {
      return NextResponse.json(
        { error: `You need to unlock more pet slots. Current: ${user.pet_slots}` },
        { status: 400 }
      );
    }

    const finalPersonality =
      petData.personality && PERSONALITIES.includes(petData.personality as any)
        ? petData.personality
        : PERSONALITIES[Math.floor(Math.random() * PERSONALITIES.length)];

    const pet = await prisma.pet.create({
      data: {
        user_id: user.id,
        name: petData.name,
        species: 0,
        personality_type: finalPersonality,
        ...(petData.species_name || petData.custom_traits
          ? {
              personality_modifiers: {
                ...(petData.species_name ? { species_name: petData.species_name } : {}),
                ...(petData.custom_traits ? { custom_traits: petData.custom_traits } : {}),
              },
            }
          : {}),
      },
    });

    await prisma.petMemory.create({
      data: {
        pet_id: pet.id,
        memory_type: "birth",
        content: `${petData.name} was born! A new adventure begins.`,
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
    const grokKey = process.env.GROK_API_KEY;
    if (!grokKey) throw new Error("GROK_API_KEY not configured");

    const chatMessages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...messages.map((m: { role: string; content?: string; text?: string }) => ({
        role: m.role === "ai" ? "assistant" : m.role,
        content: (m.content || m.text || "").slice(0, 500),
      })),
    ];

    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${grokKey}`,
      },
      body: JSON.stringify({
        model: "grok-3-mini",
        messages: chatMessages,
        max_tokens: 300,
        temperature: 0.9,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("Grok adopt-chat error:", text);
      throw new Error("Chat failed");
    }

    const data = await res.json();
    const rawReply = data.choices?.[0]?.message?.content || "Hmm, I didn't catch that. Could you tell me more about your dream pet?";

    const result = parsePetReady(rawReply);
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Adopt chat error:", error);
    return NextResponse.json(
      { error: "Failed to chat. Please try again." },
      { status: 500 }
    );
  }
}
