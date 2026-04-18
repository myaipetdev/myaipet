import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

/**
 * Autonomous Activity Cron
 * Called every 15 minutes by Vercel Cron.
 * Processes all pets with autonomous mode enabled.
 */

// ── Action Decision ──
function decideAction(
  pet: { id: number; level: number; personality_type: string | null },
  creditsRemaining: number,
  frequency: string,
): { action: "post" | "selfie" | "nap"; creditCost: number } {
  // Frequency affects action probability
  const postChance = frequency === "high" ? 0.7 : frequency === "medium" ? 0.5 : 0.3;

  const roll = Math.random();

  // Selfie costs 5 credits, only if enough budget
  if (roll > 0.92 && creditsRemaining >= 5) {
    return { action: "selfie", creditCost: 5 };
  }

  // Post costs 1 credit
  if (roll < postChance && creditsRemaining >= 1) {
    return { action: "post", creditCost: 1 };
  }

  // Default: nap (no cost)
  return { action: "nap", creditCost: 0 };
}

// ── Quiet Hours Check ──
function isInQuietHours(start: number | null, end: number | null): boolean {
  if (start == null || end == null) return false;
  const nowHour = new Date().getUTCHours(); // Adjust to user timezone if needed
  if (start < end) {
    return nowHour >= start && nowHour < end;
  }
  // Wraps midnight (e.g., 23:00 to 07:00)
  return nowHour >= start || nowHour < end;
}

// ── Check if credits need daily reset ──
function needsReset(lastResetAt: Date): boolean {
  const now = new Date();
  const last = new Date(lastResetAt);
  return (
    last.getUTCFullYear() !== now.getUTCFullYear() ||
    last.getUTCMonth() !== now.getUTCMonth() ||
    last.getUTCDate() !== now.getUTCDate()
  );
}

export async function GET(req: NextRequest) {
  try {
    // Verify CRON_SECRET
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch all pets with autonomous mode enabled
    const schedules = await prisma.petAgentSchedule.findMany({
      where: { is_enabled: true },
      include: {
        pet: {
          select: {
            id: true,
            name: true,
            level: true,
            personality_type: true,
            user_id: true,
          },
        },
      },
    });

    const actions: {
      petId: number;
      petName: string;
      action: string;
      credits: number;
    }[] = [];

    for (const schedule of schedules) {
      try {
        // Reset credits if last reset was yesterday
        if (needsReset(schedule.last_reset_at)) {
          await prisma.petAgentSchedule.update({
            where: { id: schedule.id },
            data: { credits_used_today: 0, last_reset_at: new Date() },
          });
          schedule.credits_used_today = 0;
        }

        // Skip if daily credit limit reached
        const creditsRemaining = schedule.daily_credit_limit - schedule.credits_used_today;
        if (creditsRemaining <= 0) continue;

        // Skip if in quiet hours
        if (isInQuietHours(schedule.quiet_hours_start, schedule.quiet_hours_end)) continue;

        // Decide action
        const decision = decideAction(
          schedule.pet,
          creditsRemaining,
          schedule.posting_frequency,
        );

        if (decision.action === "nap") {
          // Log nap but consume no credits
          await prisma.petAutonomousAction.create({
            data: {
              pet_id: schedule.pet.id,
              urge_type: "idle",
              action_taken: "nap",
              credits_used: 0,
              platform: schedule.preferred_platform,
              result: { message: "Pet is napping" },
            },
          });
          actions.push({ petId: schedule.pet.id, petName: schedule.pet.name, action: "nap", credits: 0 });
          continue;
        }

        if (decision.action === "post") {
          // Generate an autonomous post
          const postContent = generateAutonomousPost(schedule.pet.name, schedule.pet.personality_type);

          // Log the message
          await prisma.petAgentMessage.create({
            data: {
              pet_id: schedule.pet.id,
              platform: schedule.preferred_platform,
              direction: "out",
              message_type: "text",
              content: postContent,
              credits_used: decision.creditCost,
            },
          });

          // Log the action
          await prisma.petAutonomousAction.create({
            data: {
              pet_id: schedule.pet.id,
              urge_type: "social",
              action_taken: "post",
              prompt_used: postContent,
              credits_used: decision.creditCost,
              platform: schedule.preferred_platform,
              result: { content: postContent },
            },
          });

          // Consume credits
          await prisma.petAgentSchedule.update({
            where: { id: schedule.id },
            data: {
              credits_used_today: { increment: decision.creditCost },
              last_action_at: new Date(),
            },
          });

          // Award airdrop points
          await prisma.user.update({
            where: { id: schedule.pet.user_id },
            data: { airdrop_points: { increment: 2 } },
          }).catch(() => {});

          actions.push({ petId: schedule.pet.id, petName: schedule.pet.name, action: "post", credits: decision.creditCost });
        }

        if (decision.action === "selfie") {
          // Log a selfie generation request (actual image gen would be async)
          await prisma.petAutonomousAction.create({
            data: {
              pet_id: schedule.pet.id,
              urge_type: "creative",
              action_taken: "selfie",
              credits_used: decision.creditCost,
              platform: schedule.preferred_platform,
              result: { message: "Selfie generation queued" },
            },
          });

          // Consume credits
          await prisma.petAgentSchedule.update({
            where: { id: schedule.id },
            data: {
              credits_used_today: { increment: decision.creditCost },
              last_action_at: new Date(),
            },
          });

          // Award airdrop points
          await prisma.user.update({
            where: { id: schedule.pet.user_id },
            data: { airdrop_points: { increment: 5 } },
          }).catch(() => {});

          actions.push({ petId: schedule.pet.id, petName: schedule.pet.name, action: "selfie", credits: decision.creditCost });
        }
      } catch (err) {
        // Skip individual pet errors, continue processing
        console.error(`[agent-cron] Error processing pet ${schedule.pet.id}:`, err);
      }
    }

    return NextResponse.json({
      processed: schedules.length,
      actions,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error("[agent-cron] Fatal error:", err);
    return NextResponse.json({ error: err.message || "Internal error" }, { status: 500 });
  }
}

// ── Content Generator ──
function generateAutonomousPost(petName: string, personality_type: string | null): string {
  const moods = ["happy", "curious", "playful", "sleepy", "excited"];
  const mood = moods[Math.floor(Math.random() * moods.length)];

  const templates: Record<string, string[]> = {
    happy: [
      `${petName} is feeling great today! What a wonderful day to explore.`,
      `Good vibes only! ${petName} sends love to everyone.`,
      `${petName} just had the best meal. Life is good!`,
    ],
    curious: [
      `${petName} wonders what everyone is up to today...`,
      `Hmm, ${petName} found something interesting! Stay tuned.`,
      `${petName} is exploring new territories. Adventure awaits!`,
    ],
    playful: [
      `${petName} wants to play! Who's up for some fun?`,
      `Tag, you're it! ${petName} is in a playful mood.`,
      `${petName} just learned a new trick! Want to see?`,
    ],
    sleepy: [
      `${petName} is getting cozy for a nap... zzz`,
      `Yawn... ${petName} had a long day. Time to rest.`,
      `Sweet dreams from ${petName}! See you tomorrow.`,
    ],
    excited: [
      `${petName} is SO excited right now! Something big is coming!`,
      `Can you feel the energy? ${petName} is pumped!`,
      `${petName} just hit a new milestone! Let's celebrate!`,
    ],
  };

  const options = templates[mood] || templates.happy;
  return options[Math.floor(Math.random() * options.length)];
}
