import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

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

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ petId: string }> }
) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { petId } = await params;
  const { message } = await req.json();

  if (!message || typeof message !== "string" || message.trim().length === 0) {
    return NextResponse.json({ error: "Message required" }, { status: 400 });
  }

  const pet = await prisma.pet.findFirst({
    where: { id: Number(petId), user_id: user.id, is_active: true },
  });
  if (!pet) return NextResponse.json({ error: "Pet not found" }, { status: 404 });

  // Get recent memories for context
  const recentMemories = await prisma.petMemory.findMany({
    where: { pet_id: pet.id },
    orderBy: { created_at: "desc" },
    take: 5,
    select: { content: true, emotion: true },
  });

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

${recentMemories.length > 0 ? `RECENT MEMORIES:\n${recentMemories.map(m => `- ${m.content} (feeling: ${m.emotion})`).join("\n")}` : ""}

RULES:
- You ARE the pet. Respond in first person as ${pet.name}.
- Keep responses SHORT (1-3 sentences max).
- Show your personality and current mood in every response.
- React to your stats naturally (if hungry, mention food; if tired, yawn).
- Higher bond level = more affectionate responses.
- Level ${pet.level}: ${pet.level < 5 ? "You speak simply, like a baby." : pet.level < 10 ? "You're learning to express yourself better." : pet.level < 20 ? "You communicate clearly and have opinions." : "You're wise and articulate, with deep thoughts."}
- Use emojis sparingly but naturally.
- NEVER break character. You are a pet, not an AI.`;

  try {
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
          { role: "user", content: message.trim().slice(0, 500) },
        ],
        max_tokens: 150,
        temperature: 0.9,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("Grok chat error:", text);
      throw new Error("Chat failed");
    }

    const data = await res.json();
    const reply = data.choices?.[0]?.message?.content || `*${pet.name} tilts head curiously*`;

    // Save as interaction + memory
    await prisma.petInteraction.create({
      data: {
        pet_id: pet.id,
        user_id: user.id,
        interaction_type: "talk",
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

    return NextResponse.json({
      reply,
      mood,
      effects: { happiness: 8, energy: -3, hunger: 2, experience: 8, bond: 2 },
    });
  } catch (error: any) {
    console.error("Pet chat error:", error);
    // Fallback response based on personality
    const fallbacks: Record<string, string[]> = {
      friendly: ["I love talking to you! 💕", "You're the best owner ever!", "Hehe, tell me more!"],
      playful: ["Ooh ooh! Let's play instead! 🎾", "Hehe, you're funny!", "Tag, you're it!"],
      shy: ["O-oh... hi... 👉👈", "That's nice...", "*hides behind paw*"],
      lazy: ["*yawns* ...huh? Oh, hi... 😴", "Can we nap instead?", "Mmm... five more minutes..."],
      default: [`*${pet.name} looks at you happily*`, `*wags tail*`, "Woof! 🐾"],
    };
    const opts = fallbacks[pet.personality_type] || fallbacks.default;
    const reply = opts[Math.floor(Math.random() * opts.length)];

    return NextResponse.json({ reply, mood, effects: {} });
  }
}
