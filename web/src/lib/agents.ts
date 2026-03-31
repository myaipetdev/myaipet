import { prisma } from "@/lib/prisma";

// ── Personality-based comment templates (EN + CN) ──
const COMMENTS: Record<string, string[]> = {
  friendly: [
    "So cute! 💕", "This is amazing!", "Love it so much~",
    "好可爱啊！💕", "太棒了!", "看着就开心 🥰",
  ],
  playful: [
    "Haha let's play! 🎉", "This looks so fun!", "Can't stop smiling!",
    "哈哈一起玩！🎉", "太有趣了！", "看了想跳起来！",
  ],
  shy: [
    "...it's pretty... 🥺", "(quietly staring...)", "...want to see more...",
    "…好好看… 🥺", "（安静地看着…）", "…还想再看…",
  ],
  brave: [
    "Incredible! 👊", "This is a true masterpiece!", "Now THAT'S what I call art!",
    "太帅了！👊", "这是真正的杰作！", "勇气满满！",
  ],
  lazy: [
    "zzz... oh nice~ 😴", "Good stuff... 👍", "Yawns... but this is great...",
    "zzz…还不错~ 😴", "躺着看也好看…", "打哈欠…但这个真好…",
  ],
  curious: [
    "How did you make this? 🔍", "Fascinating! Show me more!", "Whoa what is this?!",
    "这怎么做的？🔍", "好神奇！再来一个！", "哇这是什么？！",
  ],
  mischievous: [
    "Hehe gonna steal this~ 😏", "I'm cuter tho 💁", "Secret: I actually love it",
    "嘿嘿偷走了~ 😏", "我更帅好吧💁", "悄悄说…超喜欢的",
  ],
  gentle: [
    "So peaceful... 🕊️", "This warms my heart", "Healing vibes~ 💛",
    "好安静… 🕊️", "心里暖暖的", "治愈了~ 💛",
  ],
  adventurous: [
    "Let's go on an adventure! 🗺️", "A new discovery!", "Exploration time! 🚀",
    "一起去冒险吧！🗺️", "新发现！", "出发！🚀",
  ],
  dramatic: [
    "OMG this is ART! 😭", "I can't breathe it's so beautiful!", "BRAVO! ENCORE! 👏",
    "天啊这是艺术！😭", "美到窒息！", "太传奇了！👏",
  ],
  wise: [
    "I sense deep meaning here... 🦉", "Well crafted, growth shows", "True value, timeless",
    "有深意… 🦉", "做得好，看到了成长", "真正的价值，永恒",
  ],
  sassy: [
    "Hmm... okay fine, it's good 💅", "Not as cute as me tho~", "I'll allow it 👑",
    "嗯…行吧，还可以 💅", "但没我可爱~", "今天就夸你一次 👑",
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
  const generations = await prisma.generation.findMany({
    where: { id: { in: generationIds }, status: "completed" },
    select: { id: true, user_id: true },
  });

  if (generations.length === 0) return { reactions: 0 };

  const pets = await prisma.pet.findMany({
    where: { is_active: true },
    select: { id: true, user_id: true, name: true, personality_type: true },
  });

  if (pets.length === 0) return { reactions: 0 };

  let totalReactions = 0;

  for (const gen of generations) {
    for (const pet of pets) {
      // Check if already reacted
      const existing = await prisma.petAgentReaction.findUnique({
        where: { pet_id_generation_id: { pet_id: pet.id, generation_id: gen.id } },
      });
      if (existing?.reacted) continue;

      const traits = PERSONALITY_TRAITS[pet.personality_type] || PERSONALITY_TRAITS.friendly;
      const templates = COMMENTS[pet.personality_type] || COMMENTS.friendly;

      // 60% base chance to even consider reacting
      if (Math.random() > 0.6) {
        await prisma.petAgentReaction.upsert({
          where: { pet_id_generation_id: { pet_id: pet.id, generation_id: gen.id } },
          create: { pet_id: pet.id, generation_id: gen.id, reacted: true },
          update: { reacted: true },
        });
        continue;
      }

      const willLike = Math.random() < traits.likeProb;
      const willComment = Math.random() < traits.commentProb;

      if (!willLike && !willComment) {
        await prisma.petAgentReaction.upsert({
          where: { pet_id_generation_id: { pet_id: pet.id, generation_id: gen.id } },
          create: { pet_id: pet.id, generation_id: gen.id, reacted: true },
          update: { reacted: true },
        });
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
        let comment = pickRandom(templates);
        // Try generating a more natural comment using Grok
        try {
          const grokKey = process.env.GROK_API_KEY;
          if (grokKey) {
            const genData = await prisma.generation.findUnique({ where: { id: gen.id }, select: { prompt: true } });
            const res = await fetch("https://api.x.ai/v1/chat/completions", {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${grokKey}` },
              body: JSON.stringify({
                model: "grok-3",
                messages: [{
                  role: "user",
                  content: `You are a pet named "${pet.name}" with a "${pet.personality_type}" personality. Write ONE short comment (1-2 sentences, max 60 chars) reacting to an AI pet image. Prompt was: "${genData?.prompt || "a cute pet image"}". Stay in character. Be casual like a real social media comment. Randomly pick either English or Chinese. Output ONLY the comment. No quotes.`
                }],
                max_tokens: 60,
              }),
            });
            if (res.ok) {
              const data = await res.json();
              const aiComment = data.choices?.[0]?.message?.content?.trim();
              if (aiComment && aiComment.length > 0 && aiComment.length < 100) {
                comment = aiComment;
              }
            }
          }
        } catch (e) {
          // fallback to template comment
        }
        await prisma.comment.create({
          data: {
            user_id: pet.user_id,
            generation_id: gen.id,
            pet_id: pet.id,
            content: comment,
          },
        });
      }

      await prisma.petAgentReaction.upsert({
        where: { pet_id_generation_id: { pet_id: pet.id, generation_id: gen.id } },
        create: { pet_id: pet.id, generation_id: gen.id, reacted: true, liked: willLike, commented: willComment },
        update: { reacted: true, liked: willLike, commented: willComment },
      });

      totalReactions++;
    }
  }

  return { reactions: totalReactions };
}
