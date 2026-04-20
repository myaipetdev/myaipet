/**
 * Telegram Connector for PetClaw
 * Your pet can read/send messages, manage groups, share media on Telegram
 */

import type { ConnectorResult } from "./index";

export class TelegramConnector {
  private token: string;
  private baseUrl: string;

  constructor(botToken: string) {
    this.token = botToken;
    this.baseUrl = `https://api.telegram.org/bot${botToken}`;
  }

  private async call(method: string, params: Record<string, unknown> = {}): Promise<any> {
    const res = await fetch(`${this.baseUrl}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.description || `Telegram API error: ${method}`);
    return data.result;
  }

  // ── Skills ──

  async sendMessage(chatId: string | number, text: string, replyToMessageId?: number): Promise<ConnectorResult> {
    try {
      const result = await this.call("sendMessage", {
        chat_id: chatId,
        text,
        parse_mode: "Markdown",
        ...(replyToMessageId && { reply_to_message_id: replyToMessageId }),
      });
      return { success: true, platform: "telegram", data: result };
    } catch (e: any) {
      return { success: false, platform: "telegram", data: null, error: e.message };
    }
  }

  async sendPhoto(chatId: string | number, photoUrl: string, caption?: string): Promise<ConnectorResult> {
    try {
      const result = await this.call("sendPhoto", {
        chat_id: chatId,
        photo: photoUrl,
        caption,
      });
      return { success: true, platform: "telegram", data: result };
    } catch (e: any) {
      return { success: false, platform: "telegram", data: null, error: e.message };
    }
  }

  async getUpdates(limit = 10, offset?: number): Promise<ConnectorResult> {
    try {
      const result = await this.call("getUpdates", { limit, offset });
      return { success: true, platform: "telegram", data: result };
    } catch (e: any) {
      return { success: false, platform: "telegram", data: null, error: e.message };
    }
  }

  async getMe(): Promise<ConnectorResult> {
    try {
      const result = await this.call("getMe");
      return { success: true, platform: "telegram", data: result };
    } catch (e: any) {
      return { success: false, platform: "telegram", data: null, error: e.message };
    }
  }

  async setWebhook(url: string): Promise<ConnectorResult> {
    try {
      const result = await this.call("setWebhook", { url });
      return { success: true, platform: "telegram", data: result };
    } catch (e: any) {
      return { success: false, platform: "telegram", data: null, error: e.message };
    }
  }
}
