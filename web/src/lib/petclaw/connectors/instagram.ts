/**
 * Instagram DM Connector for PetClaw
 * Uses Instagram Graph API (Business accounts)
 */
import type { ConnectorResult } from "./index";

export class InstagramConnector {
  private token: string;
  private igUserId: string;
  private baseUrl = "https://graph.facebook.com/v21.0";

  constructor(token: string, igUserId: string) { this.token = token; this.igUserId = igUserId; }

  async sendMessage(recipientId: string, text: string): Promise<ConnectorResult> {
    try {
      const res = await fetch(`${this.baseUrl}/${this.igUserId}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ recipient: { id: recipientId }, message: { text } }),
      });
      return { success: true, platform: "instagram", data: await res.json() };
    } catch (e: any) { return { success: false, platform: "instagram", data: null, error: e.message }; }
  }

  async getConversations(limit = 10): Promise<ConnectorResult> {
    try {
      const res = await fetch(`${this.baseUrl}/${this.igUserId}/conversations?limit=${limit}`, {
        headers: { Authorization: `Bearer ${this.token}` },
      });
      return { success: true, platform: "instagram", data: await res.json() };
    } catch (e: any) { return { success: false, platform: "instagram", data: null, error: e.message }; }
  }

  async getProfile(): Promise<ConnectorResult> {
    try {
      const res = await fetch(`${this.baseUrl}/${this.igUserId}?fields=name,username,profile_picture_url,followers_count`, {
        headers: { Authorization: `Bearer ${this.token}` },
      });
      return { success: true, platform: "instagram", data: await res.json() };
    } catch (e: any) { return { success: false, platform: "instagram", data: null, error: e.message }; }
  }
}
