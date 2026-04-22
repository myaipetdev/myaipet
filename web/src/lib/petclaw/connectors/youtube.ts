/**
 * YouTube Connector for PetClaw
 * Video search, summarize, recommend
 */
import type { ConnectorResult } from "./index";

export class YouTubeConnector {
  private apiKey: string;
  private baseUrl = "https://www.googleapis.com/youtube/v3";

  constructor(apiKey: string) { this.apiKey = apiKey; }

  async search(query: string, maxResults = 5): Promise<ConnectorResult> {
    try {
      const res = await fetch(`${this.baseUrl}/search?part=snippet&q=${encodeURIComponent(query)}&maxResults=${maxResults}&type=video&key=${this.apiKey}`);
      const data = await res.json();
      return { success: true, platform: "youtube", data: data.items || [] };
    } catch (e: any) { return { success: false, platform: "youtube", data: null, error: e.message }; }
  }

  async getVideo(videoId: string): Promise<ConnectorResult> {
    try {
      const res = await fetch(`${this.baseUrl}/videos?part=snippet,statistics&id=${videoId}&key=${this.apiKey}`);
      return { success: true, platform: "youtube", data: await res.json() };
    } catch (e: any) { return { success: false, platform: "youtube", data: null, error: e.message }; }
  }

  async trending(regionCode = "KR", maxResults = 10): Promise<ConnectorResult> {
    try {
      const res = await fetch(`${this.baseUrl}/videos?part=snippet&chart=mostPopular&regionCode=${regionCode}&maxResults=${maxResults}&key=${this.apiKey}`);
      return { success: true, platform: "youtube", data: await res.json() };
    } catch (e: any) { return { success: false, platform: "youtube", data: null, error: e.message }; }
  }
}
