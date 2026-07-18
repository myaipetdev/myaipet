import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { TelegramAdapter } from "@/lib/services/platforms/telegram";
import { respondToMessage, consumeAgentCredits } from "@/lib/services/pet-agent";
import { agentChannelsEnabled } from "@/lib/oauth/availability";
import { decodeTelegramAgentBotToken } from "@/lib/agentCredentials";
import { claimTelegramInboundMessageWithDb } from "@/lib/agentWebhookDelivery";

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
  // Acknowledge while paused so Telegram cannot retry-flood. Do not parse the
  // body, touch credentials/credits, load memory, or call an LLM.
  if (!agentChannelsEnabled()) {
    return NextResponse.json({ ok: true, disabled: true }, {
      headers: { "Cache-Control": "no-store" },
    });
  }
  const { petId } = await params;
  const petIdNum = Number(petId);

  if (!Number.isSafeInteger(petIdNum) || petIdNum <= 0) {
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
    const botToken = decodeTelegramAgentBotToken(connection.credentials);
    if (!botToken) {
      console.error(`[telegram-webhook] Invalid credential envelope for pet ${petId}`);
      return NextResponse.json({ ok: true });
    }

    const adapter = new TelegramAdapter(botToken);

    // 6. Claim the Telegram delivery before typing, charging, or calling an
    // LLM. Telegram message ids are unique per chat, so the DB key includes
    // pet+platform+chat+message. Concurrent retries get an immediate 200.
    const claimed = await claimTelegramInboundMessageWithDb(prisma, {
      petId: petIdNum,
      chatId: message.chatId,
      messageId: message.messageId || "",
      text: message.text,
      metadata: {
        user_id: message.userId,
        user_name: message.userName,
        is_group: message.isGroupChat,
      },
    });
    if (!claimed) return NextResponse.json({ ok: true, duplicate: true });

    // 7. Send typing indicator immediately (Telegram expects response within 30s)
    await adapter.sendTypingAction(message.chatId).catch(() => {
      // Non-critical, don't fail the request
    });

    // 7b. audit H19: charge the owner's agent credits BEFORE the paid Grok call.
    // Any Telegram user can DM a public bot; without this, a script could run up
    // unbounded LLM cost (denial-of-wallet). consumeAgentCredits enforces the
    // per-pet daily_credit_limit and the owner's credit balance.
    const charged = await consumeAgentCredits(petIdNum, 1);
    if (!charged) {
      await adapter
        .sendText(message.chatId, "💤 I'm out of energy for now — check back later!")
        .catch(() => {});
      return NextResponse.json({ ok: true });
    }

    // 8. Generate the pet's response
    const result = await respondToMessage(
      petIdNum,
      message.text,
      "telegram",
      message.chatId,
      message.isGroupChat,
      { incomingAlreadyLogged: true },
    );

    // 9. Send the reply
    await adapter.sendText(message.chatId, result.reply);

    // 10. Update the connection's last active timestamp
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
