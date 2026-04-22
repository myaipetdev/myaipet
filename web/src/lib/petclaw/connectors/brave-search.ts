/**
 * Brave Search Connector for PetClaw
 * Privacy-focused search (sovereignty-aligned)
 */
import type { ConnectorResult } from "./index";

export class BraveSearchConnector {
  private apiKey: string;

  constructor(apiKey: string) { this.apiKey = apiKey; }

  async search(query: string, count = 5): Promise<ConnectorResult> {
    try {
      const res = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${count}`, {
        headers: { Accept: "application/json", "Accept-Encoding": "gzip", "X-Subscription-Token": this.apiKey },
      });
      const data = await res.json();
      return { success: true, platform: "brave-search", data: data.web?.results || [] };
    } catch (e: any) { return { success: false, platform: "brave-search", data: null, error: e.message }; }
  }

  async summarize(query: string): Promise<ConnectorResult> {
    try {
      const res = await fetch(`https://api.search.brave.com/res/v1/summarizer/search?key=${this.apiKey}&q=${encodeURIComponent(query)}`);
      return { success: true, platform: "brave-search", data: await res.json() };
    } catch (e: any) { return { success: false, platform: "brave-search", data: null, error: e.message }; }
  }
}
