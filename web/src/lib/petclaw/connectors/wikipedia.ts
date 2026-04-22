/**
 * Wikipedia Connector for PetClaw
 * Knowledge retrieval — no API key needed
 */
import type { ConnectorResult } from "./index";

export class WikipediaConnector {
  async search(query: string, limit = 5): Promise<ConnectorResult> {
    try {
      const res = await fetch(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=${limit}&format=json&origin=*`);
      const data = await res.json();
      return { success: true, platform: "wikipedia", data: data.query?.search || [] };
    } catch (e: any) { return { success: false, platform: "wikipedia", data: null, error: e.message }; }
  }

  async getSummary(title: string): Promise<ConnectorResult> {
    try {
      const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`);
      const data = await res.json();
      return { success: true, platform: "wikipedia", data: { title: data.title, extract: data.extract, thumbnail: data.thumbnail?.source } };
    } catch (e: any) { return { success: false, platform: "wikipedia", data: null, error: e.message }; }
  }
}
