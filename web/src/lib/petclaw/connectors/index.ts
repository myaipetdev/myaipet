/**
 * PetClaw MCP Connectors
 * Bridges external MCP servers/services into PetClaw skill system
 *
 * Each connector:
 * 1. Defines PetClaw skills for the platform
 * 2. Handles auth/tokens
 * 3. Translates pet context into platform actions
 */

export { TelegramConnector } from "./telegram";
export { SlackConnector } from "./slack";
export { DiscordConnector } from "./discord";
export { TwitterConnector } from "./twitter";
export { WebSearchConnector } from "./web-search";
export { MemoryConnector } from "./memory-enhanced";

export interface ConnectorConfig {
  platform: string;
  token?: string;
  apiKey?: string;
  webhookUrl?: string;
  enabled: boolean;
}

export interface ConnectorResult {
  success: boolean;
  platform: string;
  data: unknown;
  error?: string;
}

// Registry of all connectors
export const AVAILABLE_CONNECTORS = [
  { id: "telegram", name: "Telegram", icon: "T", color: "#2AABEE", requiresToken: true },
  { id: "slack", name: "Slack", icon: "S", color: "#4A154B", requiresToken: true },
  { id: "discord", name: "Discord", icon: "D", color: "#5865F2", requiresToken: true },
  { id: "twitter", name: "Twitter/X", icon: "X", color: "#000000", requiresToken: true },
  { id: "web-search", name: "Web Search", icon: "🔍", color: "#4285F4", requiresToken: false },
  { id: "memory", name: "Enhanced Memory", icon: "🧠", color: "#8B5CF6", requiresToken: false },
] as const;
