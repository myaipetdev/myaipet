/**
 * POST /api/pet-date — Body: { myPetId, theirPetId }
 *
 * Sets up an AI-generated chat between two pets (no graphics — text only).
 * Uses each pet's persona + recent memories to inform tone. Returns a
 * 6–10 line log + a friendship delta. Stored for the "Pet Date" feed.
 *
 * Costs 20 credits (small, encourages experimentation).
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";

const COST_CREDITS = 20;
const MODEL = "grok-3-mini";

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const grokKey = process.env.GROK_API_KEY;
  if (!grokKey) return NextResponse.json({ error: "AI provider not configured" }, { status: 500 });

  const { myPetId, theirPetId } = await req.json().catch(() => ({}));
  if (!myPetId || !theirPetId) return NextResponse.json({ error: "myPetId + theirPetId required" }, { status: 400 });
  if (myPetId === theirPetId) return NextResponse.json({ error: "Pick a different pet" }, { status: 400 });

  const mine = await prisma.pet.findFirst({
    where: { id: Number(myPetId), user_id: user.id, is_active: true },
  });
  if (!mine) return NextResponse.json({ error: "Your pet not found" }, { status: 404 });

  const theirs = await prisma.pet.findFirst({
    where: { id: Number(theirPetId), is_active: true },
    include: { user: true },
  });
  if (!theirs) return NextResponse.json({ error: "Their pet not found" }, { status: 404 });

  const u = await prisma.user.findUnique({ where: { id: user.id }, select: { credits: true } });
  if (!u || u.credits < COST_CREDITS) {
    return NextResponse.json({ error: "Not enough credits", needed: COST_CREDITS }, { status: 402 });
  }

  // Build a compact system prompt for the LLM
  const system = `You are simulating a short, natural conversation between two pets meeting. Always write the dialogue in English.

PET A: ${mine.name}
  - personality: ${mine.personality_type}
  - level: ${mine.level} · element: ${mine.element || "normal"}

PET B: ${theirs.name}
  - personality: ${theirs.personality_type}
  - level: ${theirs.level} · element: ${theirs.element || "normal"}

OUTPUT FORMAT (strict):
A short JSON object:
  {"log":[{"speaker":"A","text":"..."}, {"speaker":"B","text":"..."}, …],
   "vibe":"playful|deep|rivalry|shy",
   "friendship": <integer -20 to +30>}

RULES:
- Exactly 6 to 10 lines, alternating A and B
- Each line ≤ 80 chars
- Stay in character. Personalities should clash or sync believably.
- "friendship" reflects how the date went: hostile = negative, fine = small positive, great = high positive.
- Output JSON only, nothing else.`;

  try {
    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${grokKey}` },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: "system", content: system }, { role: "user", content: "Begin the date." }],
        max_tokens: 500,
        temperature: 0.85,
      }),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => "");
      console.error("grok pet-date failure:", res.status, err.slice(0, 200));
      return NextResponse.json({ error: "AI provider failed" }, { status: 502 });
    }
    const data = await res.json();
    const raw = data?.choices?.[0]?.message?.content || "";
    const match = raw.match(/\{[\s\S]+\}/);
    if (!match) return NextResponse.json({ error: "Bad AI output" }, { status: 502 });

    let parsed: { log: { speaker: string; text: string }[]; vibe: string; friendship: number };
    try { parsed = JSON.parse(match[0]); }
    catch { return NextResponse.json({ error: "AI output not JSON" }, { status: 502 }); }

    if (!Array.isArray(parsed.log) || parsed.log.length < 4) {
      return NextResponse.json({ error: "AI output too short" }, { status: 502 });
    }

    // Debit + persist atomically. Guarded decrement (audit H17): the early
    // balance check above is advisory only — concurrent requests could both
    // pass it, so the debit itself re-checks the balance atomically.
    const friendship = Math.max(-30, Math.min(50, Math.round(parsed.friendship || 0)));
    const vibe = String(parsed.vibe || "playful").slice(0, 40);

    const row = await prisma.$transaction(async (tx) => {
      const dec = await tx.user.updateMany({
        where: { id: user.id, credits: { gte: COST_CREDITS } },
        data: { credits: { decrement: COST_CREDITS } },
      });
      if (dec.count === 0) return null;
      return tx.petDate.create({
        data: {
          pet_a_id: mine.id,
          pet_b_id: theirs.id,
          initiator_id: user.id,
          log: JSON.stringify(parsed.log),
          vibe, friendship,
        },
      });
    });
    if (!row) {
      return NextResponse.json({ error: "Not enough credits", needed: COST_CREDITS }, { status: 402 });
    }

    return NextResponse.json({
      ok: true, id: row.id,
      pet_a: { name: mine.name, avatar_url: mine.avatar_url },
      pet_b: { name: theirs.name, avatar_url: theirs.avatar_url },
      log: parsed.log, vibe, friendship,
      creditsRemaining: u.credits - COST_CREDITS,
    });
  } catch (e: any) {
    console.error("pet-date threw:", e?.message || e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
