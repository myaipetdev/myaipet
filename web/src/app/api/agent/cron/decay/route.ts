import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

/**
 * Daily Reset Cron
 * Called at midnight by Vercel Cron.
 * Resets credits_used_today for all PetAgentSchedules.
 */

export async function GET(req: NextRequest) {
  try {
    // Verify CRON_SECRET
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Reset all credits_used_today to 0
    const result = await prisma.petAgentSchedule.updateMany({
      data: {
        credits_used_today: 0,
        last_reset_at: new Date(),
      },
    });

    return NextResponse.json({
      reset: result.count,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error("[agent-decay-cron] Error:", err);
    return NextResponse.json({ error: err.message || "Internal error" }, { status: 500 });
  }
}
