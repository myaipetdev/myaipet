/**
 * Discord Connector for PetClaw
 * Your pet can post messages, react, manage servers on Discord
 */

import type { ConnectorResult } from "./index";

export class DiscordConnector {
  private token: string;
  private baseUrl = "https://discord.com/api/v10";

  constructor(botToken: string) {
    this.token = botToken;
  }

  private async call(endpoint: string, method = "GET", body?: Record<string, unknown>): Promise<any> {
    const res = await fetch(`${this.baseUrl}${endpoint}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bot ${this.token}`,
      },
      ...(body && { body: JSON.stringify(body) }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `Discord API error: ${res.status}`);
    }
    return res.json();
  }

  async sendMessage(channelId: string, content: string): Promise<ConnectorResult> {
    try {
      const result = await this.call(`/channels/${channelId}/messages`, "POST", { content });
      return { success: true, platform: "discord", data: result };
    } catch (e: any) {
      return { success: false, platform: "discord", data: null, error: e.message };
    }
  }

  async addReaction(channelId: string, messageId: string, emoji: string): Promise<ConnectorResult> {
    try {
      await this.call(`/channels/${channelId}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}/@me`, "PUT");
      return { success: true, platform: "discord", data: { emoji } };
    } catch (e: any) {
      return { success: false, platform: "discord", data: null, error: e.message };
    }
  }

  async getChannelMessages(channelId: string, limit = 10): Promise<ConnectorResult> {
    try {
      const result = await this.call(`/channels/${channelId}/messages?limit=${limit}`);
      return { success: true, platform: "discord", data: result };
    } catch (e: any) {
      return { success: false, platform: "discord", data: null, error: e.message };
    }
  }

  async getGuilds(): Promise<ConnectorResult> {
    try {
      const result = await this.call("/users/@me/guilds");
      return { success: true, platform: "discord", data: result };
    } catch (e: any) {
      return { success: false, platform: "discord", data: null, error: e.message };
    }
  }

  async getBotUser(): Promise<ConnectorResult> {
    try {
      const result = await this.call("/users/@me");
      return { success: true, platform: "discord", data: result };
    } catch (e: any) {
      return { success: false, platform: "discord", data: null, error: e.message };
    }
  }
}
