import { PlatformAdapter, IncomingMessage } from "./types";

interface TelegramApiResponse {
  ok: boolean;
  result?: any;
  description?: string;
}

interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
}

interface TelegramChat {
  id: number;
  type: "private" | "group" | "supergroup" | "channel";
}

interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  text?: string;
  entities?: Array<{
    type: string;
    offset: number;
    length: number;
  }>;
}

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}

export class TelegramAdapter implements PlatformAdapter {
  private baseUrl: string;

  constructor(private botToken: string) {
    this.baseUrl = `https://api.telegram.org/bot${botToken}`;
  }

  private async callApi(method: string, body?: Record<string, unknown>): Promise<TelegramApiResponse> {
    const res = await fetch(`${this.baseUrl}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });

    const data: TelegramApiResponse = await res.json();

    if (!data.ok) {
      console.error(`Telegram API error [${method}]:`, data.description);
      throw new Error(`Telegram API error: ${data.description || "Unknown error"}`);
    }

    return data;
  }

  async sendText(chatId: string, text: string): Promise<void> {
    // Telegram has a 4096 character limit per message
    const maxLen = 4096;
    if (text.length <= maxLen) {
      await this.callApi("sendMessage", {
        chat_id: chatId,
        text,
        parse_mode: "Markdown",
      });
      return;
    }

    // Split long messages
    for (let i = 0; i < text.length; i += maxLen) {
      await this.callApi("sendMessage", {
        chat_id: chatId,
        text: text.slice(i, i + maxLen),
        parse_mode: "Markdown",
      });
    }
  }

  async sendImage(chatId: string, imageUrl: string, caption?: string): Promise<void> {
    await this.callApi("sendPhoto", {
      chat_id: chatId,
      photo: imageUrl,
      ...(caption ? { caption, parse_mode: "Markdown" } : {}),
    });
  }

  async sendTypingAction(chatId: string): Promise<void> {
    await this.callApi("sendChatAction", {
      chat_id: chatId,
      action: "typing",
    });
  }

  /**
   * Register a webhook URL for this bot.
   */
  static async setWebhook(botToken: string, webhookUrl: string, secret: string): Promise<boolean> {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: webhookUrl,
        secret_token: secret,
        allowed_updates: ["message"],
        max_connections: 40,
      }),
    });

    const data: TelegramApiResponse = await res.json();
    if (!data.ok) {
      console.error("Telegram setWebhook error:", data.description);
    }
    return data.ok;
  }

  /**
   * Remove the webhook for this bot.
   */
  static async deleteWebhook(botToken: string): Promise<boolean> {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/deleteWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    const data: TelegramApiResponse = await res.json();
    if (!data.ok) {
      console.error("Telegram deleteWebhook error:", data.description);
    }
    return data.ok;
  }

  /**
   * Validate a bot token by calling getMe.
   */
  static async validateToken(
    botToken: string
  ): Promise<{ ok: boolean; botName?: string; botUsername?: string }> {
    try {
      const res = await fetch(`https://api.telegram.org/bot${botToken}/getMe`, {
        method: "GET",
      });

      const data: TelegramApiResponse = await res.json();
      if (!data.ok || !data.result) {
        return { ok: false };
      }

      return {
        ok: true,
        botName: data.result.first_name,
        botUsername: data.result.username,
      };
    } catch {
      return { ok: false };
    }
  }

  /**
   * Parse an incoming Telegram update into a normalized IncomingMessage.
   * Returns null if the update does not contain a usable text message.
   */
  static parseUpdate(update: TelegramUpdate): IncomingMessage | null {
    const message = update.message;
    if (!message || !message.text || !message.from) {
      return null;
    }

    const isGroupChat = message.chat.type === "group" || message.chat.type === "supergroup";

    // Check if the bot was @mentioned in the text
    const isMention =
      isGroupChat &&
      (message.entities?.some((e) => e.type === "mention" || e.type === "bot_command") ?? false);

    // Build display name
    const userName = [message.from.first_name, message.from.last_name]
      .filter(Boolean)
      .join(" ");

    return {
      platform: "telegram",
      chatId: String(message.chat.id),
      userId: String(message.from.id),
      userName: userName || undefined,
      text: message.text,
      isGroupChat,
      isMention,
      messageId: String(message.message_id),
    };
  }
}
