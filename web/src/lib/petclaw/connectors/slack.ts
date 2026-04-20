/**
 * Slack Connector for PetClaw
 * Your pet can post messages, react, manage channels on Slack
 */

import type { ConnectorResult } from "./index";

export class SlackConnector {
  private token: string;

  constructor(botToken: string) {
    this.token = botToken;
  }

  private async call(method: string, body: Record<string, unknown> = {}): Promise<any> {
    const res = await fetch(`https://slack.com/api/${method}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.token}`,
      },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || `Slack API error: ${method}`);
    return data;
  }

  async sendMessage(channel: string, text: string, threadTs?: string): Promise<ConnectorResult> {
    try {
      const result = await this.call("chat.postMessage", {
        channel,
        text,
        ...(threadTs && { thread_ts: threadTs }),
      });
      return { success: true, platform: "slack", data: result };
    } catch (e: any) {
      return { success: false, platform: "slack", data: null, error: e.message };
    }
  }

  async addReaction(channel: string, timestamp: string, emoji: string): Promise<ConnectorResult> {
    try {
      const result = await this.call("reactions.add", { channel, timestamp, name: emoji });
      return { success: true, platform: "slack", data: result };
    } catch (e: any) {
      return { success: false, platform: "slack", data: null, error: e.message };
    }
  }

  async getChannelHistory(channel: string, limit = 10): Promise<ConnectorResult> {
    try {
      const result = await this.call("conversations.history", { channel, limit });
      return { success: true, platform: "slack", data: result.messages || [] };
    } catch (e: any) {
      return { success: false, platform: "slack", data: null, error: e.message };
    }
  }

  async listChannels(limit = 50): Promise<ConnectorResult> {
    try {
      const result = await this.call("conversations.list", { limit, types: "public_channel,private_channel" });
      return { success: true, platform: "slack", data: result.channels || [] };
    } catch (e: any) {
      return { success: false, platform: "slack", data: null, error: e.message };
    }
  }
}
