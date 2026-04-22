/**
 * GitHub Connector for PetClaw
 * Developer pet: manages repos, issues, PRs
 */
import type { ConnectorResult } from "./index";

export class GitHubConnector {
  private token: string;
  private baseUrl = "https://api.github.com";

  constructor(personalAccessToken: string) { this.token = personalAccessToken; }

  private async call(endpoint: string, method = "GET", body?: any): Promise<any> {
    const res = await fetch(`${this.baseUrl}${endpoint}`, {
      method,
      headers: { Authorization: `Bearer ${this.token}`, Accept: "application/vnd.github+json", "Content-Type": "application/json" },
      ...(body && { body: JSON.stringify(body) }),
    });
    if (!res.ok) throw new Error(`GitHub API: ${res.status}`);
    return res.json();
  }

  async listRepos(limit = 10): Promise<ConnectorResult> {
    try { return { success: true, platform: "github", data: await this.call(`/user/repos?per_page=${limit}&sort=updated`) }; }
    catch (e: any) { return { success: false, platform: "github", data: null, error: e.message }; }
  }

  async listIssues(owner: string, repo: string): Promise<ConnectorResult> {
    try { return { success: true, platform: "github", data: await this.call(`/repos/${owner}/${repo}/issues?state=open&per_page=10`) }; }
    catch (e: any) { return { success: false, platform: "github", data: null, error: e.message }; }
  }

  async createIssue(owner: string, repo: string, title: string, body: string): Promise<ConnectorResult> {
    try { return { success: true, platform: "github", data: await this.call(`/repos/${owner}/${repo}/issues`, "POST", { title, body }) }; }
    catch (e: any) { return { success: false, platform: "github", data: null, error: e.message }; }
  }

  async searchCode(query: string): Promise<ConnectorResult> {
    try { return { success: true, platform: "github", data: await this.call(`/search/code?q=${encodeURIComponent(query)}`) }; }
    catch (e: any) { return { success: false, platform: "github", data: null, error: e.message }; }
  }

  async getUser(): Promise<ConnectorResult> {
    try { return { success: true, platform: "github", data: await this.call("/user") }; }
    catch (e: any) { return { success: false, platform: "github", data: null, error: e.message }; }
  }
}
