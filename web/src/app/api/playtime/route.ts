import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import {
  DAILY_PLAY_REWARD_MINUTES,
  PLAY_TIME_REWARD_EXP,
  PLAY_TIME_REWARD_CREDITS,
} from "@/lib/skills";
import { NextRequest, NextResponse } from "next/server";

// POST /api/playtime — Heartbeat: track play minutes + claim daily reward
export async function POST(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { minutes, pet_id } = await req.json();
    const addMinutes = Math.min(Math.max(0, Math.floor(minutes || 1)), 10); // max 10 min per heartbeat

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Use a transaction to atomically upsert session and claim reward
    const result = await prisma.$transaction(async (tx) => {
      const session = await tx.playSession.upsert({
        where: { user_id_date: { user_id: user.id, date: today } },
        create: { user_id: user.id, date: today, minutes: addMinutes },
        update: { minutes: { increment: addMinutes } },
      });

      let rewardClaimed = false;

      if (session.minutes >= DAILY_PLAY_REWARD_MINUTES && !session.rewarded) {
        // Use updateMany with rewarded: false condition to prevent double-claim
        const updated = await tx.playSession.updateMany({
          where: { id: session.id, rewarded: false },
          data: { rewarded: true },
        });

        if (updated.count > 0) {
          await tx.user.update({
            where: { id: user.id },
            data: { credits: { increment: PLAY_TIME_REWARD_CREDITS } },
          });

          if (pet_id) {
            await tx.pet.updateMany({
              where: { id: pet_id, user_id: user.id, is_active: true },
              data: { experience: { increment: PLAY_TIME_REWARD_EXP } },
            });
          }

          rewardClaimed = true;
        }
      }

      return { session, rewardClaimed };
    });

    return NextResponse.json({
      today_minutes: result.session.minutes,
      reward_threshold: DAILY_PLAY_REWARD_MINUTES,
      reward_claimed: result.rewardClaimed,
      already_rewarded: result.session.rewarded,
      ...(result.rewardClaimed && {
        reward: {
          credits: PLAY_TIME_REWARD_CREDITS,
          exp: pet_id ? PLAY_TIME_REWARD_EXP : 0,
        },
      }),
    });
  } catch (error) {
    console.error("Playtime error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// GET /api/playtime — Get today's play session status
export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const session = await prisma.playSession.findUnique({
      where: { user_id_date: { user_id: user.id, date: today } },
    });

    return NextResponse.json({
      today_minutes: session?.minutes || 0,
      reward_threshold: DAILY_PLAY_REWARD_MINUTES,
      rewarded: session?.rewarded || false,
    });
  } catch (error) {
    console.error("Playtime GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
