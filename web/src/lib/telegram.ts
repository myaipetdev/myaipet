const TELEGRAM_API = "https://api.telegram.org";

export interface TelegramBotInfo {
  id: number;
  is_bot: boolean;
  first_name: string;
  username: string;
}

export interface TelegramResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
}

export class TelegramAdapter {
  /**
   * Validate a bot token by calling getMe.
   * Returns bot info if valid, throws on invalid token.
   */
  static async validateToken(token: string): Promise<TelegramBotInfo> {
    const res = await fetch(`${TELEGRAM_API}/bot${token}/getMe`);
    const data: TelegramResponse<TelegramBotInfo> = await res.json();

    if (!data.ok || !data.result) {
      throw new Error(data.description || "Invalid bot token");
    }

    return data.result;
  }

  /**
   * Set webhook URL for a bot.
   */
  static async setWebhook(
    token: string,
    url: string,
    secret: string
  ): Promise<void> {
    const res = await fetch(`${TELEGRAM_API}/bot${token}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url,
        secret_token: secret,
        allowed_updates: ["message", "callback_query"],
        drop_pending_updates: true,
      }),
    });

    const data: TelegramResponse<boolean> = await res.json();
    if (!data.ok) {
      throw new Error(data.description || "Failed to set webhook");
    }
  }

  /**
   * Remove webhook for a bot.
   */
  static async deleteWebhook(token: string): Promise<void> {
    const res = await fetch(`${TELEGRAM_API}/bot${token}/deleteWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ drop_pending_updates: true }),
    });

    const data: TelegramResponse<boolean> = await res.json();
    if (!data.ok) {
      throw new Error(data.description || "Failed to delete webhook");
    }
  }

  /**
   * Send a text message to a chat.
   */
  static async sendMessage(
    token: string,
    chatId: string,
    text: string,
    options?: { parse_mode?: "HTML" | "Markdown" | "MarkdownV2"; reply_to_message_id?: number }
  ): Promise<void> {
    const res = await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        ...options,
      }),
    });

    const data: TelegramResponse<unknown> = await res.json();
    if (!data.ok) {
      throw new Error(data.description || "Failed to send message");
    }
  }

  /**
   * Get current webhook info.
   */
  static async getWebhookInfo(
    token: string
  ): Promise<{ url: string; has_custom_certificate: boolean; pending_update_count: number }> {
    const res = await fetch(`${TELEGRAM_API}/bot${token}/getWebhookInfo`);
    const data: TelegramResponse<{
      url: string;
      has_custom_certificate: boolean;
      pending_update_count: number;
    }> = await res.json();

    if (!data.ok || !data.result) {
      throw new Error(data.description || "Failed to get webhook info");
    }

    return data.result;
  }
}
