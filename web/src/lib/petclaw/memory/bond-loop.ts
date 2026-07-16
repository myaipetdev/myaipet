/**
 * Bond Feedback Loop — adapted from the agentic-harness-playbook
 * memory-feedback-pattern. Where the playbook writes a one-line retro after
 * each work cycle so the agent gets cumulatively sharper, here the pet writes
 * a one-line reflection on the *relationship* after meaningful exchanges, and
 * those reflections flow into the next conversation's context.
 *
 * The effect: the pet doesn't just remember facts about you (that's the memory
 * ledger) — it forms an evolving read on HOW to be a good companion to you
 * specifically. "Owner deflects with jokes when stressed — don't push." That
 * read compounds. The pet gets better at *you* over time.
 *
 * Storage: pet.personality_modifiers.bond_reflections — a capped ring of the
 * most recent N one-liners. Injected into the chat system prompt as
 * RELATIONSHIP NOTES.
 */

import { prisma } from "@/lib/prisma";
import { callLLM } from "@/lib/llm/router";

const MAX_REFLECTIONS = 12;       // keep the most recent dozen
const REFLECT_EVERY_TURNS = 8;    // generate one roughly every 8 exchanges

export interface BondReflection {
  date: string;       // YYYY-MM-DD
  note: string;       // <= 160 chars, second-person, actionable
}

function ymd(d = new Date()) { return d.toISOString().slice(0, 10); }

/** Inject-ready block of recent relationship notes for the chat system prompt. */
export async function getBondNotesBlock(petId: number): Promise<string> {
  const pet = await prisma.pet.findUnique({ where: { id: petId }, select: { personality_modifiers: true } });
  const mods = (pet?.personality_modifiers as Record<string, unknown>) || {};
  const refs = (mods.bond_reflections as BondReflection[]) || [];
  if (refs.length === 0) return "";
  const recent = refs.slice(-6).map(r => `- ${r.note}`).join("\n");
  return `\nRELATIONSHIP NOTES (how to be a good companion to THIS owner — honor these):\n${recent}`;
}

/**
 * Decide whether to generate a reflection this turn, and if so, do it. Cheap
 * gate first (turn counter), then one Grok call. Fire-and-forget from the
 * chat route — never blocks the reply.
 */
export async function maybeReflectOnBond(
  petId: number,
  ownerMessage: string,
  petReply: string,
): Promise<void> {
  const pet = await prisma.pet.findUnique({
    where: { id: petId },
    select: { name: true, personality_type: true, bond_level: true, total_interactions: true, personality_modifiers: true },
  });
  if (!pet) return;

  // Gate: only every Nth interaction.
  if ((pet.total_interactions || 0) % REFLECT_EVERY_TURNS !== 0) return;

  const mods = (pet.personality_modifiers as Record<string, unknown>) || {};
  const existing = (mods.bond_reflections as BondReflection[]) || [];
  const priorNotes = existing.slice(-4).map(r => `- ${r.note}`).join("\n") || "(none yet)";

  const system =
    `You are ${pet.name}'s inner sense of the relationship with their owner. ` +
    `After this exchange, write ONE short note (<=160 chars, second person, ` +
    `addressed to your future self) about HOW to be a better companion to this ` +
    `specific owner — their emotional patterns, what helps, what to avoid. Not a ` +
    `fact about them (that's separate), a relationship cue.\n\n` +
    `Bond level: ${pet.bond_level}/100. Prior notes:\n${priorNotes}\n\n` +
    `Rules: actionable, specific, no sycophancy. If this exchange revealed nothing ` +
    `new about how to treat them, output exactly "SKIP". Otherwise output only the note.`;

  try {
    // POINTS-ECONOMY §2.3 knob #7: routed through callLLM (task:"persona") so this
    // bond-reflection fan-out counts against the LLM daily budget instead of hitting
    // api.x.ai raw. On a budget breach callLLM throws; the catch below no-ops.
    const out = await callLLM({
      task: "persona",
      petId,
      messages: [
        { role: "system", content: system },
        { role: "user", content: `Owner: ${ownerMessage.slice(0, 300)}\n${pet.name}: ${petReply.slice(0, 300)}` },
      ],
      max_tokens: 80,
      temperature: 0.7,
    });
    const note = (out.text || "").trim();
    if (!note || note.toUpperCase().startsWith("SKIP") || note.length < 8) return;

    const next = [...existing, { date: ymd(), note: note.slice(0, 160) }].slice(-MAX_REFLECTIONS);
    await prisma.pet.update({
      where: { id: petId },
      data: { personality_modifiers: { ...mods, bond_reflections: next } as any },
    });
  } catch { /* non-fatal */ }
}
