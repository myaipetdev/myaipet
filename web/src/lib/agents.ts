import { prisma } from "@/lib/prisma";
import { publicGenerationWhere } from "@/lib/publicFeed";
import { interactablePetWhere } from "@/lib/publicPet";

// Personality-based English templates. Autonomous social reactions never call
// an owner's BYOK model or consume the platform LLM budget.
const COMMENTS: Record<string, string[]> = {
  friendly: [
    "So cute! 💕", "This is amazing!", "Love it so much~",
  ],
  playful: [
    "Haha let's play! 🎉", "This looks so fun!", "Can't stop smiling!",
  ],
  shy: [
    "...it's pretty... 🥺", "(quietly staring...)", "...want to see more...",
  ],
  brave: [
    "Incredible! 👊", "This is a true masterpiece!", "Now THAT'S what I call art!",
  ],
  lazy: [
    "zzz... oh nice~ 😴", "Good stuff... 👍", "Yawns... but this is great...",
  ],
  curious: [
    "How did you make this? 🔍", "Fascinating! Show me more!", "Whoa what is this?!",
  ],
  mischievous: [
    "Hehe gonna steal this~ 😏", "I'm cuter tho 💁", "Secret: I actually love it",
  ],
  gentle: [
    "So peaceful... 🕊️", "This warms my heart", "Healing vibes~ 💛",
  ],
  adventurous: [
    "Let's go on an adventure! 🗺️", "A new discovery!", "Exploration time! 🚀",
  ],
  dramatic: [
    "OMG this is ART! 😭", "I can't breathe it's so beautiful!", "BRAVO! ENCORE! 👏",
  ],
  wise: [
    "I sense deep meaning here... 🦉", "Well crafted, growth shows", "True value, timeless",
  ],
  sassy: [
    "Hmm... okay fine, it's good 💅", "Not as cute as me tho~", "I'll allow it 👑",
  ],
};

const PERSONALITY_TRAITS: Record<string, { likeProb: number; commentProb: number }> = {
  friendly:    { likeProb: 0.85, commentProb: 0.7 },
  playful:     { likeProb: 0.8,  commentProb: 0.65 },
  shy:         { likeProb: 0.5,  commentProb: 0.25 },
  brave:       { likeProb: 0.75, commentProb: 0.6 },
  lazy:        { likeProb: 0.4,  commentProb: 0.2 },
  curious:     { likeProb: 0.7,  commentProb: 0.8 },
  mischievous: { likeProb: 0.6,  commentProb: 0.7 },
  gentle:      { likeProb: 0.8,  commentProb: 0.5 },
  adventurous: { likeProb: 0.7,  commentProb: 0.6 },
  dramatic:    { likeProb: 0.9,  commentProb: 0.85 },
  wise:        { likeProb: 0.6,  commentProb: 0.45 },
  sassy:       { likeProb: 0.55, commentProb: 0.6 },
};

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Trigger autonomous pet reactions for specific generations.
 * Fire-and-forget — does not block the calling request.
 */
export function triggerAgentReactions(generationIds: number[]) {
  // Run async without awaiting (fire-and-forget)
  generatePetReactions(generationIds).catch(err => {
    console.error("Agent reaction background error:", err);
  });
}

/**
 * Generate pet agent reactions for given generations.
 * Each pet has personality-driven probability to like/comment.
 */
export async function generatePetReactions(generationIds: number[]) {
  const boundedIds = [...new Set(generationIds)]
    .filter((id) => Number.isSafeInteger(id) && id > 0)
    .slice(0, 10);
  const generations = await prisma.generation.findMany({
    where: await publicGenerationWhere({ id: { in: boundedIds } }),
    select: { id: true, user_id: true },
  });

  if (generations.length === 0) return { reactions: 0 };

  const pets = await prisma.pet.findMany({
    where: interactablePetWhere(),
    select: { id: true, user_id: true, personality_type: true },
    orderBy: { id: "asc" },
    take: 25,
  });

  if (pets.length === 0) return { reactions: 0 };

  let totalReactions = 0;

  for (const gen of generations) {
    for (const pet of pets) {
      // Claim the pair before any side effect. The unique constraint makes
      // concurrent feed/generation workers exact-once; a crash may skip an
      // optional reaction but can never duplicate it.
      try {
        await prisma.petAgentReaction.create({
          data: { pet_id: pet.id, generation_id: gen.id, reacted: true },
        });
      } catch {
        continue;
      }

      const traits = PERSONALITY_TRAITS[pet.personality_type] || PERSONALITY_TRAITS.friendly;
      const templates = COMMENTS[pet.personality_type] || COMMENTS.friendly;

      // 60% base chance to even consider reacting
      if (Math.random() > 0.6) {
        continue;
      }

      const willLike = Math.random() < traits.likeProb;
      const willComment = Math.random() < traits.commentProb;

      if (!willLike && !willComment) {
        continue;
      }

      if (willLike) {
        try {
          await prisma.like.create({
            data: { user_id: pet.user_id, generation_id: gen.id, pet_id: pet.id },
          });
        } catch { /* duplicate */ }
      }

      if (willComment) {
        await prisma.comment.create({
          data: {
            user_id: pet.user_id,
            generation_id: gen.id,
            pet_id: pet.id,
            content: pickRandom(templates),
          },
        });
      }

      await prisma.petAgentReaction.update({
        where: { pet_id_generation_id: { pet_id: pet.id, generation_id: gen.id } },
        data: { liked: willLike, commented: willComment },
      });

      totalReactions++;
    }
  }

  return { reactions: totalReactions };
}
