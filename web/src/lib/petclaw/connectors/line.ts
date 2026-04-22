/**
 * LINE Connector for PetClaw
 * Uses LINE Messaging API
 */
import type { ConnectorResult } from "./index";

export class LINEConnector {
  private token: string;
  private baseUrl = "https://api.line.me/v2/bot";

  constructor(channelAccessToken: string) { this.token = channelAccessToken; }

  private async call(endpoint: string, method = "GET", body?: any): Promise<any> {
    const res = await fetch(`${this.baseUrl}${endpoint}`, {
      method,
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      ...(body && { body: JSON.stringify(body) }),
    });
    if (!res.ok) throw new Error(`LINE API: ${res.status}`);
    return res.json().catch(() => ({}));
  }

  async pushMessage(to: string, text: string): Promise<ConnectorResult> {
    try {
      await this.call("/message/push", "POST", { to, messages: [{ type: "text", text }] });
      return { success: true, platform: "line", data: { to, text } };
    } catch (e: any) { return { success: false, platform: "line", data: null, error: e.message }; }
  }

  async replyMessage(replyToken: string, text: string): Promise<ConnectorResult> {
    try {
      await this.call("/message/reply", "POST", { replyToken, messages: [{ type: "text", text }] });
      return { success: true, platform: "line", data: { text } };
    } catch (e: any) { return { success: false, platform: "line", data: null, error: e.message }; }
  }

  async getProfile(userId: string): Promise<ConnectorResult> {
    try {
      const result = await this.call(`/profile/${userId}`);
      return { success: true, platform: "line", data: result };
    } catch (e: any) { return { success: false, platform: "line", data: null, error: e.message }; }
  }
}
