/**
 * BscScan Connector for PetClaw
 * On-chain activity lookup for BSC wallets
 */
import type { ConnectorResult } from "./index";

export class BscScanConnector {
  private apiKey: string;
  private baseUrl = "https://api.bscscan.com/api";

  constructor(apiKey: string) { this.apiKey = apiKey; }

  async getBalance(address: string): Promise<ConnectorResult> {
    try {
      const res = await fetch(`${this.baseUrl}?module=account&action=balance&address=${address}&apikey=${this.apiKey}`);
      const data = await res.json();
      const bnb = parseInt(data.result) / 1e18;
      return { success: true, platform: "bscscan", data: { address, balanceBNB: bnb.toFixed(4) } };
    } catch (e: any) { return { success: false, platform: "bscscan", data: null, error: e.message }; }
  }

  async getTransactions(address: string, limit = 10): Promise<ConnectorResult> {
    try {
      const res = await fetch(`${this.baseUrl}?module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&page=1&offset=${limit}&sort=desc&apikey=${this.apiKey}`);
      const data = await res.json();
      return { success: true, platform: "bscscan", data: data.result || [] };
    } catch (e: any) { return { success: false, platform: "bscscan", data: null, error: e.message }; }
  }

  async getTokenBalance(address: string, contractAddress: string): Promise<ConnectorResult> {
    try {
      const res = await fetch(`${this.baseUrl}?module=account&action=tokenbalance&contractaddress=${contractAddress}&address=${address}&apikey=${this.apiKey}`);
      return { success: true, platform: "bscscan", data: await res.json() };
    } catch (e: any) { return { success: false, platform: "bscscan", data: null, error: e.message }; }
  }

  async getGasPrice(): Promise<ConnectorResult> {
    try {
      const res = await fetch(`${this.baseUrl}?module=gastracker&action=gasoracle&apikey=${this.apiKey}`);
      return { success: true, platform: "bscscan", data: await res.json() };
    } catch (e: any) { return { success: false, platform: "bscscan", data: null, error: e.message }; }
  }
}
