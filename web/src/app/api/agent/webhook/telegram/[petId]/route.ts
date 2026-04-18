import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { TelegramAdapter } from "@/lib/services/platforms/telegram";
import { respondToMessage } from "@/lib/services/pet-agent";
import { decrypt } from "@/lib/crypto";

/**
 * Telegram webhook handler for a specific pet.
 *
 * URL: /api/agent/webhook/telegram/[petId]
 *
 * Telegram sends updates here when users message the bot.
 * IMPORTANT: Always return 200 to Telegram to prevent retry spam.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ petId: string }> }
) {
  const { petId } = await params;
  const petIdNum = Number(petId);

  if (!petId || isNaN(petIdNum)) {
    // Still return 200 to Telegram
    return NextResponse.json({ ok: true });
  }

  try {
    // 1. Look up the active Telegram connection for this pet
    const connection = await prisma.petPlatformConnection.findFirst({
      where: {
        pet_id: petIdNum,
        platform: "telegram",
        is_active: true,
      },
    });

    if (!connection || !connection.credentials || !connection.webhook_secret) {
      console.error(`[telegram-webhook] No active connection for pet ${petId}`);
      return NextResponse.json({ ok: true });
    }

    // 2. Verify the webhook secret from Telegram header
    const secretHeader = req.headers.get("x-telegram-bot-api-secret-token");
    if (secretHeader !== connection.webhook_secret) {
      console.error(`[telegram-webhook] Secret mismatch for pet ${petId}`);
      return NextResponse.json({ ok: true });
    }

    // 3. Parse the incoming update
    const body = await req.json();
    const message = TelegramAdapter.parseUpdate(body);

    if (!message) {
      // Not a text message (could be sticker, photo, etc.) -- ignore
      return NextResponse.json({ ok: true });
    }

    // 4. In group chats, only respond if the bot was @mentioned
    if (message.isGroupChat && !message.isMention) {
      return NextResponse.json({ ok: true });
    }

    // 5. Decrypt the bot token
    let botToken: string;
    try {
      botToken = decrypt(connection.credentials);
    } catch (err) {
      console.error(`[telegram-webhook] Failed to decrypt credentials for pet ${petId}:`, err);
      return NextResponse.json({ ok: true });
    }

    const adapter = new TelegramAdapter(botToken);

    // 6. Send typing indicator immediately (Telegram expects response within 30s)
    await adapter.sendTypingAction(message.chatId).catch(() => {
      // Non-critical, don't fail the request
    });

    // 7. Log the inbound message
    await prisma.petAgentMessage.create({
      data: {
        pet_id: petIdNum,
        platform: "telegram",
        direction: "inbound",
        message_type: "text",
        content: message.text.slice(0, 2000),
        platform_msg_id: message.messageId ?? null,
        chat_id: message.chatId,
        metadata: {
          user_id: message.userId,
          user_name: message.userName,
          is_group: message.isGroupChat,
        },
      },
    });

    // 8. Generate the pet's response
    const result = await respondToMessage(
      petIdNum,
      message.text,
      "telegram",
      message.chatId,
      message.isGroupChat
    );

    // 9. Send the reply
    await adapter.sendText(message.chatId, result.reply);

    // 10. Log the outbound message
    await prisma.petAgentMessage.create({
      data: {
        pet_id: petIdNum,
        platform: "telegram",
        direction: "outbound",
        message_type: "text",
        content: result.reply.slice(0, 2000),
        chat_id: message.chatId,
        metadata: {
          in_reply_to: message.messageId,
        },
      },
    });

    // 11. Update the connection's last active timestamp
    await prisma.petPlatformConnection.update({
      where: { id: connection.id },
      data: { last_active_at: new Date() },
    }).catch(() => {
      // Non-critical
    });

    // Record Web4 heartbeat (fire-and-forget)
    try {
      const { recordHeartbeat } = await import("@/lib/services/soul");
      await recordHeartbeat(petIdNum);
    } catch {}

    return NextResponse.json({ ok: true });
  } catch (error) {
    // ALWAYS return 200 to Telegram to prevent retry floods
    console.error(`[telegram-webhook] Error processing update for pet ${petId}:`, error);
    return NextResponse.json({ ok: true });
  }
}
