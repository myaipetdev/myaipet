import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { encrypt } from "@/lib/crypto";
import { TelegramAdapter } from "@/lib/telegram";
import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";

type Platform = "telegram" | "twitter";

interface ConnectBody {
  platform: Platform;
  bot_token?: string;
  api_key?: string;
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

    const body: ConnectBody = await req.json();
    const { platform, bot_token, api_key } = body;

    if (!platform || !["telegram", "twitter"].includes(platform)) {
      return NextResponse.json({ error: "Invalid platform" }, { status: 400 });
    }

    if (platform === "telegram") {
      if (!bot_token) {
        return NextResponse.json({ error: "bot_token is required for Telegram" }, { status: 400 });
      }

      // 1. Validate the bot token
      let botInfo;
      try {
        botInfo = await TelegramAdapter.validateToken(bot_token);
      } catch (err: any) {
        return NextResponse.json(
          { error: `Invalid bot token: ${err.message}` },
          { status: 400 }
        );
      }

      // 2. Generate webhook secret
      const webhookSecret = randomBytes(16).toString("hex"); // 32 hex chars

      // 3. Set webhook
      const baseUrl =
        process.env.NEXT_PUBLIC_APP_URL ||
        (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);

      if (!baseUrl) {
        return NextResponse.json(
          { error: "Server URL not configured" },
          { status: 500 }
        );
      }

      const webhookUrl = `${baseUrl}/api/agent/webhook/telegram/${pet.id}`;

      try {
        await TelegramAdapter.setWebhook(bot_token, webhookUrl, webhookSecret);
      } catch (err: any) {
        return NextResponse.json(
          { error: `Failed to set webhook: ${err.message}` },
          { status: 500 }
        );
      }

      // 4. Encrypt bot token
      const encryptedCredentials = encrypt(
        JSON.stringify({ bot_token })
      );

      // 5. Upsert platform connection
      await prisma.petPlatformConnection.upsert({
        where: {
          pet_id_platform: { pet_id: pet.id, platform: "telegram" },
        },
        create: {
          pet_id: pet.id,
          platform: "telegram",
          is_active: true,
          credentials: encryptedCredentials,
          webhook_secret: webhookSecret,
          platform_chat_id: String(botInfo.id),
          config: {
            bot_name: botInfo.first_name,
            bot_username: botInfo.username,
          },
        },
        update: {
          is_active: true,
          credentials: encryptedCredentials,
          webhook_secret: webhookSecret,
          platform_chat_id: String(botInfo.id),
          config: {
            bot_name: botInfo.first_name,
            bot_username: botInfo.username,
          },
          connected_at: new Date(),
        },
      });

      // 6. Create agent schedule if not exists
      await prisma.petAgentSchedule.upsert({
        where: { pet_id: pet.id },
        create: {
          pet_id: pet.id,
          is_enabled: false,
          daily_credit_limit: 50,
          credits_used_today: 0,
          posting_frequency: "medium",
        },
        update: {},
      });

      return NextResponse.json({
        success: true,
        platform: "telegram",
        bot_name: botInfo.first_name,
        bot_username: botInfo.username,
      });
    }

    if (platform === "twitter") {
      if (!api_key) {
        return NextResponse.json({ error: "api_key is required for Twitter" }, { status: 400 });
      }

      // Twitter integration - encrypt and store credentials
      const encryptedCredentials = encrypt(
        JSON.stringify({ api_key })
      );

      await prisma.petPlatformConnection.upsert({
        where: {
          pet_id_platform: { pet_id: pet.id, platform: "twitter" },
        },
        create: {
          pet_id: pet.id,
          platform: "twitter",
          is_active: true,
          credentials: encryptedCredentials,
          config: {},
        },
        update: {
          is_active: true,
          credentials: encryptedCredentials,
          connected_at: new Date(),
        },
      });

      // Create agent schedule if not exists
      await prisma.petAgentSchedule.upsert({
        where: { pet_id: pet.id },
        create: {
          pet_id: pet.id,
          is_enabled: false,
          daily_credit_limit: 50,
          credits_used_today: 0,
          posting_frequency: "medium",
        },
        update: {},
      });

      return NextResponse.json({
        success: true,
        platform: "twitter",
      });
    }

    return NextResponse.json({ error: "Unsupported platform" }, { status: 400 });
  } catch (error: any) {
    console.error("Agent connect error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
