import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { decrypt } from "@/lib/crypto";
import { TelegramAdapter } from "@/lib/telegram";
import { NextRequest, NextResponse } from "next/server";

interface DisconnectBody {
  platform: "telegram" | "twitter";
}

export async function POST(
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

    const body: DisconnectBody = await req.json();
    const { platform } = body;

    if (!platform || !["telegram", "twitter"].includes(platform)) {
      return NextResponse.json({ error: "Invalid platform" }, { status: 400 });
    }

    // Find the active connection
    const connection = await prisma.petPlatformConnection.findUnique({
      where: {
        pet_id_platform: { pet_id: pet.id, platform },
      },
    });

    if (!connection) {
      return NextResponse.json({ error: "No connection found" }, { status: 404 });
    }

    if (!connection.is_active) {
      return NextResponse.json({ error: "Connection already inactive" }, { status: 400 });
    }

    // Platform-specific cleanup
    if (platform === "telegram" && connection.credentials) {
      try {
        const creds = JSON.parse(decrypt(connection.credentials));
        if (creds.bot_token) {
          await TelegramAdapter.deleteWebhook(creds.bot_token);
        }
      } catch (err: any) {
        console.error("Failed to delete Telegram webhook:", err.message);
        // Continue with disconnection even if webhook deletion fails
      }
    }

    // Soft delete: set is_active = false to keep history
    await prisma.petPlatformConnection.update({
      where: { id: connection.id },
      data: {
        is_active: false,
        last_active_at: new Date(),
      },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Agent disconnect error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
