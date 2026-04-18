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

    const schedule = await prisma.petAgentSchedule.findUnique({
      where: { pet_id: pet.id },
    });

    if (!schedule) {
      return NextResponse.json({
        is_enabled: false,
        daily_credit_limit: 50,
        credits_used_today: 0,
        posting_frequency: "medium",
        quiet_hours_start: null,
        quiet_hours_end: null,
      });
    }

    return NextResponse.json({
      is_enabled: schedule.is_enabled,
      daily_credit_limit: schedule.daily_credit_limit,
      credits_used_today: schedule.credits_used_today,
      last_reset_at: schedule.last_reset_at,
      posting_frequency: schedule.posting_frequency,
      quiet_hours_start: schedule.quiet_hours_start,
      quiet_hours_end: schedule.quiet_hours_end,
    });
  } catch (error: any) {
    console.error("Agent config GET error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

interface UpdateConfigBody {
  is_enabled?: boolean;
  daily_credit_limit?: number;
  posting_frequency?: string;
  quiet_hours_start?: number | null;
  quiet_hours_end?: number | null;
}

const VALID_FREQUENCIES = ["low", "medium", "high"];

export async function PUT(
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

    const body: UpdateConfigBody = await req.json();

    // Validate fields
    const updateData: Record<string, any> = {};

    if (typeof body.is_enabled === "boolean") {
      updateData.is_enabled = body.is_enabled;
    }

    if (typeof body.daily_credit_limit === "number") {
      if (body.daily_credit_limit < 1 || body.daily_credit_limit > 1000) {
        return NextResponse.json(
          { error: "daily_credit_limit must be between 1 and 1000" },
          { status: 400 }
        );
      }
      updateData.daily_credit_limit = Math.floor(body.daily_credit_limit);
    }

    if (typeof body.posting_frequency === "string") {
      if (!VALID_FREQUENCIES.includes(body.posting_frequency)) {
        return NextResponse.json(
          { error: `posting_frequency must be one of: ${VALID_FREQUENCIES.join(", ")}` },
          { status: 400 }
        );
      }
      updateData.posting_frequency = body.posting_frequency;
    }

    if (body.quiet_hours_start !== undefined) {
      if (body.quiet_hours_start !== null) {
        if (typeof body.quiet_hours_start !== "number" || body.quiet_hours_start < 0 || body.quiet_hours_start > 23) {
          return NextResponse.json(
            { error: "quiet_hours_start must be 0-23 or null" },
            { status: 400 }
          );
        }
        updateData.quiet_hours_start = Math.floor(body.quiet_hours_start);
      } else {
        updateData.quiet_hours_start = null;
      }
    }

    if (body.quiet_hours_end !== undefined) {
      if (body.quiet_hours_end !== null) {
        if (typeof body.quiet_hours_end !== "number" || body.quiet_hours_end < 0 || body.quiet_hours_end > 23) {
          return NextResponse.json(
            { error: "quiet_hours_end must be 0-23 or null" },
            { status: 400 }
          );
        }
        updateData.quiet_hours_end = Math.floor(body.quiet_hours_end);
      } else {
        updateData.quiet_hours_end = null;
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const schedule = await prisma.petAgentSchedule.upsert({
      where: { pet_id: pet.id },
      create: {
        pet_id: pet.id,
        ...updateData,
      },
      update: updateData,
    });

    return NextResponse.json({
      is_enabled: schedule.is_enabled,
      daily_credit_limit: schedule.daily_credit_limit,
      credits_used_today: schedule.credits_used_today,
      last_reset_at: schedule.last_reset_at,
      posting_frequency: schedule.posting_frequency,
      quiet_hours_start: schedule.quiet_hours_start,
      quiet_hours_end: schedule.quiet_hours_end,
    });
  } catch (error: any) {
    console.error("Agent config PUT error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
