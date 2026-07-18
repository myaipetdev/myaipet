import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import {
  DAILY_PLAY_REWARD_MINUTES,
  PLAY_TIME_REWARD_EXP,
  PLAY_TIME_REWARD_CREDITS,
} from "@/lib/skills";
import { rateLimit } from "@/lib/rateLimit";
import { NextRequest, NextResponse } from "next/server";

// POST /api/playtime — Heartbeat: track play minutes + claim daily reward
export async function POST(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // The DB elapsed-time check below is authoritative. This is an additional
    // abuse/noise guard, not the source of truth (IP limits alone are bypassable).
    const rl = rateLimit(req, { key: "playtime", limit: 6, windowMs: 60_000 });
    if (!rl.ok) return rl.response;

    const { minutes, pet_id } = await req.json();
    const requested = Number(minutes);
    const requestedMinutes = Number.isFinite(requested)
      ? Math.min(Math.max(0, Math.floor(requested)), 30)
      : 0;

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const now = new Date();

    // Use a transaction to atomically upsert session and claim reward
    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.playSession.findUnique({
        where: { user_id_date: { user_id: user.id, date: today } },
      });

      // A client may request only wall-clock time that has actually elapsed
      // since the last accepted heartbeat. The first non-zero call earns at most
      // one minute; a zero-minute call starts the server-side clock. Rapid or
      // concurrent replay therefore adds zero instead of minting 30 minutes.
      const elapsedMinutes = existing
        ? Math.max(0, Math.floor((now.getTime() - existing.updated_at.getTime()) / 60_000))
        : 0;
      let acceptedMinutes = existing
        ? Math.min(requestedMinutes, elapsedMinutes)
        : Math.min(requestedMinutes, 1);

      let session;
      if (!existing) {
        session = await tx.playSession.create({
          data: { user_id: user.id, date: today, minutes: acceptedMinutes },
        });
      } else if (requestedMinutes === 0) {
        // A zero-minute heartbeat is an explicit session-start marker. Advance
        // the server clock without granting time so a fresh focus session
        // cannot inherit hours elapsed since an older session.
        const updated = await tx.playSession.updateMany({
          where: { id: existing.id, updated_at: existing.updated_at },
          data: { updated_at: now },
        });
        session = updated.count > 0
          ? { ...existing, updated_at: now }
          : await tx.playSession.findUniqueOrThrow({ where: { id: existing.id } });
      } else if (acceptedMinutes > 0) {
        // Optimistic timestamp condition prevents two concurrent requests from
        // both claiming the same elapsed interval.
        const updated = await tx.playSession.updateMany({
          where: { id: existing.id, updated_at: existing.updated_at },
          data: { minutes: { increment: acceptedMinutes } },
        });
        if (updated.count === 0) acceptedMinutes = 0;
        session = await tx.playSession.findUniqueOrThrow({ where: { id: existing.id } });
      } else {
        session = existing;
      }

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
          session = { ...session, rewarded: true };
        }
      }

      return { session, rewardClaimed, acceptedMinutes };
    });

    return NextResponse.json({
      today_minutes: result.session.minutes,
      accepted_minutes: result.acceptedMinutes,
      requested_minutes: requestedMinutes,
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
    today.setUTCHours(0, 0, 0, 0);

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
