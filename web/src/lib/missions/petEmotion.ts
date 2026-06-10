/**
 * Pet emotional memory — the differentiator vs Duolingo's owl.
 *
 * When a user breaks their streak, their UserStreak row stores
 * pending_apology = true plus the number of days missed. The next time the
 * user opens a chat with their pet, we inject a one-shot system note that
 * tells the LLM the gap is real, so the pet can naturally open with
 * "Where were you?". After surfacing the note we clear the flag so the
 * pet doesn't keep harping on it.
 */

import { prisma } from "@/lib/prisma";

export async function checkPendingApology(userId: number): Promise<{ note: string }> {
  const s = await prisma.userStreak.findUnique({ where: { user_id: userId } });
  if (!s || !s.pending_apology) return { note: "" };

  // One-shot: clear the flag now so the pet doesn't repeat themselves
  await prisma.userStreak.update({
    where: { user_id: userId },
    data: { pending_apology: false, pending_apology_days: 0 },
  }).catch(() => { /* non-fatal */ });

  const days = s.pending_apology_days;
  const phrase = days === 1
    ? "missed a day yesterday"
    : days === 2
      ? "missed two days"
      : `was gone for ${days} days`;

  return {
    note:
      `- IMPORTANT EMOTIONAL CONTEXT: The owner ${phrase}. ` +
      `Notice their return naturally in your opening line. Express that you ` +
      `noticed, but don't lecture or guilt-trip — be warm and a little ` +
      `relieved. Then continue the conversation normally.`,
  };
}
