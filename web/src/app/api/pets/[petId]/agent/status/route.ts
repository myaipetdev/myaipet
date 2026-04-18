import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ petId: string }> }
) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { petId } = await params;
    const pet = await prisma.pet.findFirst({
      where: { id: Number(petId), user_id: user.id, is_active: true },
    });
    if (!pet) return NextResponse.json({ error: "Pet not found" }, { status: 404 });

    // Fetch connections (exclude encrypted credentials)
    const connections = await prisma.petPlatformConnection.findMany({
      where: { pet_id: pet.id },
      select: {
        platform: true,
        is_active: true,
        config: true,
        platform_chat_id: true,
        connected_at: true,
        last_active_at: true,
      },
    });

    const formattedConnections = connections.map((c) => {
      const config = c.config as Record<string, any> | null;
      return {
        platform: c.platform,
        is_active: c.is_active,
        bot_username: config?.bot_username || null,
        bot_name: config?.bot_name || null,
        connected_at: c.connected_at,
        last_active_at: c.last_active_at,
      };
    });

    // Fetch schedule
    const schedule = await prisma.petAgentSchedule.findUnique({
      where: { pet_id: pet.id },
    });

    const scheduleData = schedule
      ? {
          is_enabled: schedule.is_enabled,
          daily_credit_limit: schedule.daily_credit_limit,
          credits_used_today: schedule.credits_used_today,
          last_reset_at: schedule.last_reset_at,
          posting_frequency: schedule.posting_frequency,
          quiet_hours_start: schedule.quiet_hours_start,
          quiet_hours_end: schedule.quiet_hours_end,
        }
      : null;

    // Compute stats
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [totalMessages, messagesToday] = await Promise.all([
      prisma.petAgentMessage.count({
        where: { pet_id: pet.id },
      }),
      prisma.petAgentMessage.count({
        where: {
          pet_id: pet.id,
          created_at: { gte: todayStart },
        },
      }),
    ]);

    const platformsActive = connections.filter((c) => c.is_active).length;

    return NextResponse.json({
      connections: formattedConnections,
      schedule: scheduleData,
      stats: {
        total_messages: totalMessages,
        messages_today: messagesToday,
        platforms_active: platformsActive,
      },
    });
  } catch (error: any) {
    console.error("Agent status error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
