/**
 * Stateless launch-demo chat.
 *
 * This deliberately does not import Prisma, the LLM router, or any memory
 * module. Anonymous visitors must never resolve a real pet, use an owner's
 * connected model, consume model budget, or persist conversation text.
 */

export interface SyntheticDemoReply {
  reply: string;
  petName: "Dordor";
  synthetic: true;
  persisted: false;
}

const GENERAL_REPLIES = [
  "I'm Dordor, a synthetic preview of PetClaw. A linked pet can build private memory and grow with you; this demo does not save messages.",
  "In the full app, your own pet can learn routines, use skills, and keep owner-controlled memory. I'm only the stateless launch preview.",
  "I can show the shape of a PetClaw conversation, but I don't access a real pet or account. Nothing from this demo is remembered.",
] as const;

function stableIndex(value: string, length: number): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % length;
}

/** Return a deterministic, local-only reply without echoing visitor input. */
export function buildSyntheticDemoReply(message: string): SyntheticDemoReply {
  const normalized = message.trim().toLowerCase();
  let reply: string;

  if (/\b(privacy|private|data|sovereign|sovereignty|memory|remember|save)\b/.test(normalized)) {
    reply = "Your real pet's memory belongs to your account and follows its consent settings. This synthetic demo has no pet ID, reads no account data, and saves nothing.";
  } else if (/\b(skill|skills|can you do|what do you do|capabilit)/.test(normalized)) {
    reply = "A linked PetClaw companion can chat, use installed skills, connect to approved services, and grow from owner-controlled memory. This preview is intentionally stateless.";
  } else if (/\b(hello|hey|hi|morning|afternoon|evening)\b/.test(normalized)) {
    reply = "Hey! I'm Dordor, the synthetic launch preview. We can say hello here, but I don't access a real pet and this message won't be saved. 🐾";
  } else if (/\b(wallet|connect|adopt|start|signup|sign up)\b/.test(normalized)) {
    reply = "Open the app to create or link your own pet. Only an authenticated owner session can use that pet's skills or memory; this preview stays separate.";
  } else {
    reply = GENERAL_REPLIES[stableIndex(normalized, GENERAL_REPLIES.length)];
  }

  return { reply, petName: "Dordor", synthetic: true, persisted: false };
}
