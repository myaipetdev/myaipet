/**
 * WhatsApp Connector for PetClaw
 * Uses WhatsApp Business Cloud API
 */
import type { ConnectorResult } from "./index";

export class WhatsAppConnector {
  private token: string;
  private phoneNumberId: string;
  private baseUrl = "https://graph.facebook.com/v21.0";

  constructor(token: string, phoneNumberId: string) {
    this.token = token;
    this.phoneNumberId = phoneNumberId;
  }

  private async call(endpoint: string, method = "GET", body?: any): Promise<any> {
    const res = await fetch(`${this.baseUrl}/${this.phoneNumberId}${endpoint}`, {
      method,
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      ...(body && { body: JSON.stringify(body) }),
    });
    if (!res.ok) throw new Error(`WhatsApp API: ${res.status}`);
    return res.json();
  }

  async sendMessage(to: string, text: string): Promise<ConnectorResult> {
    try {
      const result = await this.call("/messages", "POST", {
        messaging_product: "whatsapp", to, type: "text", text: { body: text },
      });
      return { success: true, platform: "whatsapp", data: result };
    } catch (e: any) { return { success: false, platform: "whatsapp", data: null, error: e.message }; }
  }

  async sendImage(to: string, imageUrl: string, caption?: string): Promise<ConnectorResult> {
    try {
      const result = await this.call("/messages", "POST", {
        messaging_product: "whatsapp", to, type: "image",
        image: { link: imageUrl, caption },
      });
      return { success: true, platform: "whatsapp", data: result };
    } catch (e: any) { return { success: false, platform: "whatsapp", data: null, error: e.message }; }
  }

  async getProfile(): Promise<ConnectorResult> {
    try {
      const result = await this.call("", "GET");
      return { success: true, platform: "whatsapp", data: result };
    } catch (e: any) { return { success: false, platform: "whatsapp", data: null, error: e.message }; }
  }
}
