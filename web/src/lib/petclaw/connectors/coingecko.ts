/**
 * CoinGecko Connector for PetClaw
 * Crypto market data — free tier, no API key
 */
import type { ConnectorResult } from "./index";

export class CoinGeckoConnector {
  private baseUrl = "https://api.coingecko.com/api/v3";

  async getPrice(ids: string[], vsCurrencies = "usd"): Promise<ConnectorResult> {
    try {
      const res = await fetch(`${this.baseUrl}/simple/price?ids=${ids.join(",")}&vs_currencies=${vsCurrencies}&include_24hr_change=true&include_market_cap=true`);
      return { success: true, platform: "coingecko", data: await res.json() };
    } catch (e: any) { return { success: false, platform: "coingecko", data: null, error: e.message }; }
  }

  async search(query: string): Promise<ConnectorResult> {
    try {
      const res = await fetch(`${this.baseUrl}/search?query=${encodeURIComponent(query)}`);
      const data = await res.json();
      return { success: true, platform: "coingecko", data: data.coins?.slice(0, 10) || [] };
    } catch (e: any) { return { success: false, platform: "coingecko", data: null, error: e.message }; }
  }

  async trending(): Promise<ConnectorResult> {
    try {
      const res = await fetch(`${this.baseUrl}/search/trending`);
      return { success: true, platform: "coingecko", data: await res.json() };
    } catch (e: any) { return { success: false, platform: "coingecko", data: null, error: e.message }; }
  }

  async getCoinData(id: string): Promise<ConnectorResult> {
    try {
      const res = await fetch(`${this.baseUrl}/coins/${id}?localization=false&tickers=false&community_data=false&developer_data=false`);
      return { success: true, platform: "coingecko", data: await res.json() };
    } catch (e: any) { return { success: false, platform: "coingecko", data: null, error: e.message }; }
  }
}
