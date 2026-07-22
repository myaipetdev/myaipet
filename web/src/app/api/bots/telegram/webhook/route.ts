/**
 * Telegram bot webhook receiver.
 *
 *   POST /api/bots/telegram/webhook
 *
 * Telegram POSTs every incoming message here. Flow:
 *   1. Verify the X-Telegram-Bot-Api-Secret-Token header (set on setWebhook)
 *   2. Look up the user via pet_platform_connections (credentials.access_token =
 *      stringified telegram user_id at OAuth time — see /api/auth/oauth/telegram/callback)
 *   3. Run pethub.executeSkill(petId, "companion-chat", { message, surface: "telegram" })
 *      — if delivery is enabled, canonical chat can use selected owner-scoped
 *        retained context and records Telegram session metadata
 *   4. Reply via Telegram sendMessage API
 *
 * To activate (one-time, ops):
 *   curl -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
 *        -d "url=https://app.myaipet.ai/api/bots/telegram/webhook" \
 *        -d "secret_token=$TELEGRAM_WEBHOOK_SECRET"
 *
 * To deactivate: same URL with empty `url` param.
 *
 * Why webhook (not long-polling): single-instance EC2, low message volume.
 * Webhook avoids a separate worker process + keeps everything in one PM2 app.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rateLimit";
import { oauthConnectionsEnabled } from "@/lib/oauth/availability";
import { decodeOAuthCredentials } from "@/lib/oauth/credentials";
import { claimTelegramInboundMessageWithDb } from "@/lib/agentWebhookDelivery";
import { consumeAgentCredits } from "@/lib/agentCredits";

interface TgMessage {
  message_id: number;
  from?: { id: number; first_name?: string; username?: string };
  chat: { id: number };
  text?: string;
  date: number;
}

interface TgUpdate {
  update_id: number;
  message?: TgMessage;
  edited_message?: TgMessage;
}

const MAX_TEXT_LEN = 1000;

async function sendTelegram(chatId: number, text: string, botToken: string): Promise<void> {
  try {
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: text.slice(0, 4000),
        parse_mode: "Markdown",
      }),
    });
  } catch (e: any) {
    console.error("[telegram] sendMessage failed:", e?.message);
  }
}

export async function POST(req: NextRequest) {
  if (!oauthConnectionsEnabled()) {
    return NextResponse.json({ ok: true, disabled: true }, {
      headers: { "Cache-Control": "no-store" },
    });
  }
  // Telegram-side spam protection: reject if we get too many updates from
  // the same IP. Telegram's edge sends from a known IP range — this is a
  // belt-and-suspenders check.
  const rl = rateLimit(req, { key: "telegram-webhook", limit: 120, windowMs: 60_000 });
  if (!rl.ok) return rl.response;

  // Verify Telegram's secret token (set via setWebhook). Fail CLOSED: if the
  // secret isn't configured, reject — otherwise activating the bot (setting
  // TELEGRAM_BOT_TOKEN) without also setting TELEGRAM_WEBHOOK_SECRET would leave
  // the webhook forgeable by anyone who knows the URL. (Mirrors verifyCron H12.)
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  const got = req.headers.get("x-telegram-bot-api-secret-token");
  if (!expected || got !== expected) {
    console.warn("[telegram] webhook rejected — missing/bad secret");
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    console.warn("[telegram] TELEGRAM_BOT_TOKEN not set");
    return NextResponse.json({ ok: true });   // Don't 5xx — Telegram retries
  }

  let update: TgUpdate;
  try {
    update = await req.json();
  } catch {
    return NextResponse.json({ ok: true });
  }

  const msg = update.message || update.edited_message;
  if (!msg || !msg.from || !msg.text) {
    return NextResponse.json({ ok: true });
  }

  const text = msg.text.trim().slice(0, MAX_TEXT_LEN);
  if (!text) return NextResponse.json({ ok: true });

  // Special commands
  if (text === "/start") {
    await sendTelegram(msg.chat.id,
      "🐾 *MY AI PET* — your owner-controlled AI companion.\n\nTelegram delivery is launch-paused. When it is enabled, link your pet from the [Sovereignty Dashboard](https://app.myaipet.ai/?section=sovereignty); selected retained context may support replies under the same owner controls.",
      botToken);
    return NextResponse.json({ ok: true });
  }
  if (text === "/help") {
    await sendTelegram(msg.chat.id,
      "Telegram delivery is launch-paused in this release. Use the web app or approved Chrome sites today; retained context is selected and owner-controlled.",
      botToken);
    return NextResponse.json({ ok: true });
  }

  // Find a pet connected to this Telegram user. We stored their telegram
  // user_id in credentials.access_token at OAuth time (see widget callback).
  const tgUserId = String(msg.from.id);
  const connections = await prisma.petPlatformConnection.findMany({
    where: { platform: "telegram", is_active: true },
    include: { pet: true },
  });

  // Decode only the purpose-bound encrypted OAuth envelope.
  const match = connections.find(c => {
    const creds = decodeOAuthCredentials(c.credentials);
    return creds?.access_token === tgUserId;
  });

  if (!match) {
    await sendTelegram(msg.chat.id,
      "I don't recognise you yet. Connect this Telegram to a pet at https://app.myaipet.ai/?section=sovereignty",
      botToken);
    return NextResponse.json({ ok: true });
  }

  const claimed = await claimTelegramInboundMessageWithDb(prisma, {
    petId: match.pet_id,
    chatId: String(msg.chat.id),
    messageId: String(msg.message_id),
    text,
    metadata: { telegram_user_id: tgUserId, oauth_channel: true },
  });
  if (!claimed) return NextResponse.json({ ok: true, duplicate: true });

  const charged = await consumeAgentCredits(match.pet_id, 1);
  if (!charged) {
    await sendTelegram(msg.chat.id, "💤 I'm out of energy for now — check back later!", botToken);
    return NextResponse.json({ ok: true });
  }

  // Talk to the pet via pethub — bounded retained context on companion-chat.
  try {
    const { executeSkill } = await import("@/lib/petclaw/pethub");
    const result = await executeSkill(match.pet_id, "companion-chat", {
      message: text,
      surface: "telegram",
      sessionId: `telegram-${String(msg.chat.id).slice(0, 100)}`,
    });
    const reply = (result.output as any)?.reply || `*${match.pet.name} tilts head*`;
    await sendTelegram(msg.chat.id, reply, botToken);

    // Touch last_active_at on the connection
    await prisma.petPlatformConnection.update({
      where: { pet_id_platform: { pet_id: match.pet_id, platform: "telegram" } },
      data: { last_active_at: new Date() },
    });
  } catch (e: any) {
    console.error("[telegram] pethub error:", e?.message);
    await sendTelegram(msg.chat.id,
      `*${match.pet.name} seems a bit distracted right now* — try again in a moment.`,
      botToken);
  }

  return NextResponse.json({ ok: true });
}
