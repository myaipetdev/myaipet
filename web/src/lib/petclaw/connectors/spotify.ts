/**
 * Spotify Connector for PetClaw
 * Pet recommends music based on mood: "Play something happy!"
 */
import type { ConnectorResult } from "./index";

export class SpotifyConnector {
  private token: string;
  private baseUrl = "https://api.spotify.com/v1";

  constructor(oauthToken: string) { this.token = oauthToken; }

  private async call(endpoint: string, method = "GET", body?: any): Promise<any> {
    const res = await fetch(`${this.baseUrl}${endpoint}`, {
      method,
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      ...(body && { body: JSON.stringify(body) }),
    });
    if (!res.ok) throw new Error(`Spotify API: ${res.status}`);
    return res.json();
  }

  async search(query: string, type = "track", limit = 5): Promise<ConnectorResult> {
    try { return { success: true, platform: "spotify", data: await this.call(`/search?q=${encodeURIComponent(query)}&type=${type}&limit=${limit}`) }; }
    catch (e: any) { return { success: false, platform: "spotify", data: null, error: e.message }; }
  }

  async getRecommendations(seedGenres: string[], limit = 10): Promise<ConnectorResult> {
    try { return { success: true, platform: "spotify", data: await this.call(`/recommendations?seed_genres=${seedGenres.join(",")}&limit=${limit}`) }; }
    catch (e: any) { return { success: false, platform: "spotify", data: null, error: e.message }; }
  }

  async getCurrentlyPlaying(): Promise<ConnectorResult> {
    try { return { success: true, platform: "spotify", data: await this.call("/me/player/currently-playing") }; }
    catch (e: any) { return { success: false, platform: "spotify", data: null, error: e.message }; }
  }

  async getTopTracks(timeRange = "short_term", limit = 10): Promise<ConnectorResult> {
    try { return { success: true, platform: "spotify", data: await this.call(`/me/top/tracks?time_range=${timeRange}&limit=${limit}`) }; }
    catch (e: any) { return { success: false, platform: "spotify", data: null, error: e.message }; }
  }

  async play(uri?: string): Promise<ConnectorResult> {
    try { return { success: true, platform: "spotify", data: await this.call("/me/player/play", "PUT", uri ? { uris: [uri] } : undefined) }; }
    catch (e: any) { return { success: false, platform: "spotify", data: null, error: e.message }; }
  }
}
