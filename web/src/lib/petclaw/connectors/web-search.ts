/**
 * Web Search Connector for PetClaw
 * Your pet can search the web and share findings
 * Uses DuckDuckGo (free, no API key needed)
 */

import type { ConnectorResult } from "./index";

export class WebSearchConnector {
  async search(query: string, maxResults = 5): Promise<ConnectorResult> {
    try {
      // DuckDuckGo instant answer API (free, no key)
      const res = await fetch(
        `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`
      );
      const data = await res.json();

      const results = [];

      // Abstract (main answer)
      if (data.Abstract) {
        results.push({
          title: data.Heading || query,
          snippet: data.Abstract,
          url: data.AbstractURL,
          source: data.AbstractSource,
        });
      }

      // Related topics
      for (const topic of (data.RelatedTopics || []).slice(0, maxResults)) {
        if (topic.Text) {
          results.push({
            title: topic.Text.slice(0, 80),
            snippet: topic.Text,
            url: topic.FirstURL,
          });
        }
      }

      return { success: true, platform: "web-search", data: { query, results } };
    } catch (e: any) {
      return { success: false, platform: "web-search", data: null, error: e.message };
    }
  }

  async summarize(url: string): Promise<ConnectorResult> {
    try {
      // Fetch page and extract text (basic)
      const res = await fetch(url, {
        headers: { "User-Agent": "PetClaw/1.0" },
      });
      const html = await res.text();

      // Simple text extraction (strip HTML tags)
      const text = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 2000);

      return { success: true, platform: "web-search", data: { url, text } };
    } catch (e: any) {
      return { success: false, platform: "web-search", data: null, error: e.message };
    }
  }
}
