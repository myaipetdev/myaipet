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
import { rateLimit } from "@/lib/rateLimit";
import { callLLM } from "@/lib/llm/router";
import { interactablePetWhere } from "@/lib/publicPet";
import { providerSafeStoredText } from "@/lib/petclaw/provider-safe-text";
import { readBoundedJsonBody } from "@/lib/petclaw/bounded-json-body";
import {
  commitAgentCreditsWithDb,
  refundAgentCreditsOnce,
  reserveAgentCredits,
  type AgentCreditReservation,
} from "@/lib/agentCreditReservation";
import { runReservedPetDate } from "@/lib/petDateContract";

const COST_CREDITS = 20;

export async function POST(req: NextRequest) {
  // LLM call + credit spend — tight per-caller limit.
  const rl = rateLimit(req, { key: "pet-date", limit: 10, windowMs: 60_000 });
  if (!rl.ok) return rl.response;

  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsedBody = await readBoundedJsonBody(req, 2 * 1024);
  if (parsedBody.ok === false) {
    return NextResponse.json(
      { error: parsedBody.reason === "too_large" ? "Request body too large" : "Invalid JSON body" },
      { status: parsedBody.reason === "too_large" ? 413 : 400 },
    );
  }
  const body = parsedBody.value && typeof parsedBody.value === "object" && !Array.isArray(parsedBody.value)
    ? parsedBody.value as Record<string, unknown>
    : {};
  const { myPetId, theirPetId } = body;
  const myPetIdNumber = Number(myPetId);
  const theirPetIdNumber = Number(theirPetId);
  if ((typeof myPetId !== "number" && typeof myPetId !== "string")
    || (typeof theirPetId !== "number" && typeof theirPetId !== "string")
    || !Number.isSafeInteger(myPetIdNumber) || myPetIdNumber <= 0
    || !Number.isSafeInteger(theirPetIdNumber) || theirPetIdNumber <= 0) {
    return NextResponse.json({ error: "myPetId + theirPetId must be positive integers" }, { status: 400 });
  }
  if (myPetIdNumber === theirPetIdNumber) {
    return NextResponse.json({ error: "Pick a different pet" }, { status: 400 });
  }

  const mine = await prisma.pet.findFirst({
    where: { id: myPetIdNumber, user_id: user.id, is_active: true },
  });
  if (!mine) return NextResponse.json({ error: "Your pet not found" }, { status: 404 });

  const theirs = await prisma.pet.findFirst({
    where: {
      id: theirPetIdNumber,
      OR: [
        { user_id: user.id, is_active: true },
        interactablePetWhere(),
      ],
    },
    include: { user: true },
  });
  if (!theirs) return NextResponse.json({ error: "Their pet not found" }, { status: 404 });

  // Stored identity metadata remains visible to its owners, but untrusted
  // legacy text that resembles secrets or violates the provider language
  // boundary is never copied into a third-party model prompt.
  const providerMineName = providerSafeStoredText(mine.name, "pet_name", 50) || "Pet A";
  const providerTheirName = providerSafeStoredText(theirs.name, "pet_name", 50) || "Pet B";
  const providerMinePersonality = providerSafeStoredText(mine.personality_type, "personality", 20) || "friendly";
  const providerTheirPersonality = providerSafeStoredText(theirs.personality_type, "personality", 20) || "friendly";
  const providerMineElement = providerSafeStoredText(mine.element, "element", 10) || "normal";
  const providerTheirElement = providerSafeStoredText(theirs.element, "element", 10) || "normal";

  // Build a compact system prompt for the LLM
  const system = `You are simulating a short, natural conversation between two pets meeting. Always write the dialogue in English.

PET A: ${providerMineName}
  - personality: ${providerMinePersonality}
  - level: ${mine.level} · element: ${providerMineElement}

PET B: ${providerTheirName}
  - personality: ${providerTheirPersonality}
  - level: ${theirs.level} · element: ${providerTheirElement}

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

  const run = await runReservedPetDate<
    AgentCreditReservation,
    { row: { id: number }; creditsRemaining: number }
  >({
    // Reservation and guarded debit commit together before the provider call,
    // so concurrent requests cannot spend an already-exhausted wallet on LLMs.
    reserve: () => reserveAgentCredits(user.id, mine.id, COST_CREDITS, "pet_date"),
    invokeProvider: async () => {
      const out = await callLLM({
        task: "chat",
        petId: mine.id,
        messages: [{ role: "system", content: system }, { role: "user", content: "Begin the date." }],
        max_tokens: 500,
        temperature: 0.85,
        response_format: { type: "json_object" },
      });
      return out.text;
    },
    // PetDate creation and reserved → committed are one DB transaction. A
    // failed insert cannot leave a charge, and a commit cannot lack its row.
    settle: (reservation, output) => prisma.$transaction(async (tx) => {
      const row = await tx.petDate.create({
        data: {
          pet_a_id: mine.id,
          pet_b_id: theirs.id,
          initiator_id: user.id,
          log: JSON.stringify(output.log),
          vibe: output.vibe,
          friendship: output.friendship,
        },
      });
      const creditsRemaining = await commitAgentCreditsWithDb(tx, reservation);
      return { row, creditsRemaining };
    }),
    refund: refundAgentCreditsOnce,
  });

  if (run.kind === "insufficient") {
    return NextResponse.json({ error: "Not enough credits", needed: COST_CREDITS }, { status: 402 });
  }
  if (run.kind === "invalid_output") {
    return NextResponse.json({ error: "AI output did not match the Pet Date contract" }, { status: 502 });
  }
  if (run.kind === "failed") {
    const original = run.originalError ?? run.error;
    if (run.phase === "settlement"
      && typeof original === "object"
      && original !== null
      && "code" in original
      && original.code === "P2003") {
      return NextResponse.json({ error: "One of these pets is no longer available" }, { status: 409 });
    }
    console.error("pet-date failed:", run.phase, original instanceof Error ? original.message : "unknown");
    const status = run.phase === "provider" ? 502 : 503;
    return NextResponse.json({ error: run.phase === "provider" ? "Pet Date generation failed" : "Pet Date settlement failed" }, { status });
  }

  return NextResponse.json({
    ok: true,
    id: run.settlement.row.id,
    pet_a: { name: mine.name, avatar_url: mine.avatar_url },
    pet_b: { name: theirs.name, avatar_url: theirs.avatar_url },
    log: run.output.log,
    vibe: run.output.vibe,
    friendship: run.output.friendship,
    creditsRemaining: run.settlement.creditsRemaining,
  });
}
