/**
 * Email (Gmail) Connector for PetClaw
 * Uses Gmail API via OAuth
 */
import type { ConnectorResult } from "./index";

export class EmailConnector {
  private token: string;
  private baseUrl = "https://gmail.googleapis.com/gmail/v1/users/me";

  constructor(oauthToken: string) { this.token = oauthToken; }

  private async call(endpoint: string, method = "GET", body?: any): Promise<any> {
    const res = await fetch(`${this.baseUrl}${endpoint}`, {
      method,
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      ...(body && { body: JSON.stringify(body) }),
    });
    if (!res.ok) throw new Error(`Gmail API: ${res.status}`);
    return res.json();
  }

  async listMessages(query = "", maxResults = 10): Promise<ConnectorResult> {
    try {
      const result = await this.call(`/messages?q=${encodeURIComponent(query)}&maxResults=${maxResults}`);
      return { success: true, platform: "email", data: result };
    } catch (e: any) { return { success: false, platform: "email", data: null, error: e.message }; }
  }

  async getMessage(messageId: string): Promise<ConnectorResult> {
    try {
      const result = await this.call(`/messages/${messageId}?format=full`);
      return { success: true, platform: "email", data: result };
    } catch (e: any) { return { success: false, platform: "email", data: null, error: e.message }; }
  }

  async sendEmail(to: string, subject: string, body: string): Promise<ConnectorResult> {
    try {
      const raw = btoa(`To: ${to}\r\nSubject: ${subject}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${body}`)
        .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
      const result = await this.call("/messages/send", "POST", { raw });
      return { success: true, platform: "email", data: result };
    } catch (e: any) { return { success: false, platform: "email", data: null, error: e.message }; }
  }

  async getLabels(): Promise<ConnectorResult> {
    try {
      const result = await this.call("/labels");
      return { success: true, platform: "email", data: result };
    } catch (e: any) { return { success: false, platform: "email", data: null, error: e.message }; }
  }
}
