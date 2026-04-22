/**
 * Notion Connector for PetClaw
 * Pet accesses owner's knowledge base for context-aware responses
 */
import type { ConnectorResult } from "./index";

export class NotionConnector {
  private token: string;
  private baseUrl = "https://api.notion.com/v1";
  private headers: Record<string, string>;

  constructor(integrationToken: string) {
    this.token = integrationToken;
    this.headers = {
      Authorization: `Bearer ${this.token}`,
      "Content-Type": "application/json",
      "Notion-Version": "2022-06-28",
    };
  }

  async search(query: string, limit = 5): Promise<ConnectorResult> {
    try {
      const res = await fetch(`${this.baseUrl}/search`, {
        method: "POST", headers: this.headers,
        body: JSON.stringify({ query, page_size: limit }),
      });
      const data = await res.json();
      return { success: true, platform: "notion", data: data.results || [] };
    } catch (e: any) { return { success: false, platform: "notion", data: null, error: e.message }; }
  }

  async getPage(pageId: string): Promise<ConnectorResult> {
    try {
      const res = await fetch(`${this.baseUrl}/pages/${pageId}`, { headers: this.headers });
      return { success: true, platform: "notion", data: await res.json() };
    } catch (e: any) { return { success: false, platform: "notion", data: null, error: e.message }; }
  }

  async queryDatabase(dbId: string, filter?: any): Promise<ConnectorResult> {
    try {
      const res = await fetch(`${this.baseUrl}/databases/${dbId}/query`, {
        method: "POST", headers: this.headers,
        body: JSON.stringify({ ...(filter && { filter }), page_size: 20 }),
      });
      return { success: true, platform: "notion", data: await res.json() };
    } catch (e: any) { return { success: false, platform: "notion", data: null, error: e.message }; }
  }

  async createPage(parentDbId: string, properties: any): Promise<ConnectorResult> {
    try {
      const res = await fetch(`${this.baseUrl}/pages`, {
        method: "POST", headers: this.headers,
        body: JSON.stringify({ parent: { database_id: parentDbId }, properties }),
      });
      return { success: true, platform: "notion", data: await res.json() };
    } catch (e: any) { return { success: false, platform: "notion", data: null, error: e.message }; }
  }
}
