/**
 * Twitter/X Connector for PetClaw
 * Your pet can post tweets, reply, like, and monitor feeds
 */

import type { ConnectorResult } from "./index";

export class TwitterConnector {
  private bearerToken: string;
  private baseUrl = "https://api.twitter.com/2";

  constructor(bearerToken: string) {
    this.bearerToken = bearerToken;
  }

  private async call(endpoint: string, method = "GET", body?: Record<string, unknown>): Promise<any> {
    const res = await fetch(`${this.baseUrl}${endpoint}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.bearerToken}`,
      },
      ...(body && { body: JSON.stringify(body) }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || err.title || `Twitter API error: ${res.status}`);
    }
    return res.json();
  }

  async postTweet(text: string, replyToId?: string): Promise<ConnectorResult> {
    try {
      const body: any = { text };
      if (replyToId) body.reply = { in_reply_to_tweet_id: replyToId };
      const result = await this.call("/tweets", "POST", body);
      return { success: true, platform: "twitter", data: result };
    } catch (e: any) {
      return { success: false, platform: "twitter", data: null, error: e.message };
    }
  }

  async getTimeline(userId: string, maxResults = 10): Promise<ConnectorResult> {
    try {
      const result = await this.call(`/users/${userId}/tweets?max_results=${maxResults}&tweet.fields=created_at,public_metrics`);
      return { success: true, platform: "twitter", data: result.data || [] };
    } catch (e: any) {
      return { success: false, platform: "twitter", data: null, error: e.message };
    }
  }

  async searchTweets(query: string, maxResults = 10): Promise<ConnectorResult> {
    try {
      const result = await this.call(`/tweets/search/recent?query=${encodeURIComponent(query)}&max_results=${maxResults}&tweet.fields=created_at,public_metrics`);
      return { success: true, platform: "twitter", data: result.data || [] };
    } catch (e: any) {
      return { success: false, platform: "twitter", data: null, error: e.message };
    }
  }

  async likeTweet(userId: string, tweetId: string): Promise<ConnectorResult> {
    try {
      const result = await this.call(`/users/${userId}/likes`, "POST", { tweet_id: tweetId });
      return { success: true, platform: "twitter", data: result };
    } catch (e: any) {
      return { success: false, platform: "twitter", data: null, error: e.message };
    }
  }

  async getMe(): Promise<ConnectorResult> {
    try {
      const result = await this.call("/users/me?user.fields=profile_image_url,description,public_metrics");
      return { success: true, platform: "twitter", data: result.data };
    } catch (e: any) {
      return { success: false, platform: "twitter", data: null, error: e.message };
    }
  }
}
