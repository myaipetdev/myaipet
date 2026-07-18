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
    // Keep every caller fail-closed, including internal tool-agent call sites.
    // The Chrome extension supplies an owner-previewed text excerpt to the
    // normal summarize skill; the server must not dereference arbitrary URLs.
    return {
      success: false,
      platform: "web-search",
      data: null,
      error: "Server-side URL summarization is disabled; provide an approved text excerpt instead.",
    };
  }
}
