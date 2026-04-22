/**
 * PetClaw Connectors Registry
 * 21 platform integrations across 5 categories
 */

// ── Messaging ──
export { TelegramConnector } from "./telegram";
export { SlackConnector } from "./slack";
export { DiscordConnector } from "./discord";
export { TwitterConnector } from "./twitter";
export { WhatsAppConnector } from "./whatsapp";
export { LINEConnector } from "./line";
export { InstagramConnector } from "./instagram";
export { EmailConnector } from "./email";

// ── Productivity ──
export { NotionConnector } from "./notion";
export { GoogleCalendarConnector } from "./google-calendar";
export { GitHubConnector } from "./github";

// ── Media ──
export { SpotifyConnector } from "./spotify";
export { YouTubeConnector } from "./youtube";

// ── Knowledge ──
export { WebSearchConnector } from "./web-search";
export { BraveSearchConnector } from "./brave-search";
export { WikipediaConnector } from "./wikipedia";
export { MemoryConnector } from "./memory-enhanced";

// ── Crypto ──
export { CoinGeckoConnector } from "./coingecko";
export { BscScanConnector } from "./bscscan";

// ── Types ──
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

// ── Full Registry ──
export const AVAILABLE_CONNECTORS = [
  // Messaging (8)
  { id: "telegram", name: "Telegram", icon: "T", color: "#2AABEE", category: "messaging", requiresToken: true },
  { id: "twitter", name: "Twitter/X", icon: "𝕏", color: "#000000", category: "messaging", requiresToken: true },
  { id: "discord", name: "Discord", icon: "D", color: "#5865F2", category: "messaging", requiresToken: true },
  { id: "slack", name: "Slack", icon: "S", color: "#4A154B", category: "messaging", requiresToken: true },
  { id: "whatsapp", name: "WhatsApp", icon: "W", color: "#25D366", category: "messaging", requiresToken: true },
  { id: "line", name: "LINE", icon: "L", color: "#06C755", category: "messaging", requiresToken: true },
  { id: "instagram", name: "Instagram", icon: "I", color: "#E4405F", category: "messaging", requiresToken: true },
  { id: "email", name: "Gmail", icon: "✉", color: "#EA4335", category: "messaging", requiresToken: true },

  // Productivity (3)
  { id: "notion", name: "Notion", icon: "N", color: "#000000", category: "productivity", requiresToken: true },
  { id: "google-calendar", name: "Google Calendar", icon: "📅", color: "#4285F4", category: "productivity", requiresToken: true },
  { id: "github", name: "GitHub", icon: "G", color: "#181717", category: "productivity", requiresToken: true },

  // Media (2)
  { id: "spotify", name: "Spotify", icon: "♫", color: "#1DB954", category: "media", requiresToken: true },
  { id: "youtube", name: "YouTube", icon: "▶", color: "#FF0000", category: "media", requiresToken: true },

  // Knowledge (4)
  { id: "web-search", name: "Web Search", icon: "🔍", color: "#4285F4", category: "knowledge", requiresToken: false },
  { id: "brave-search", name: "Brave Search", icon: "🦁", color: "#FB542B", category: "knowledge", requiresToken: true },
  { id: "wikipedia", name: "Wikipedia", icon: "W", color: "#000000", category: "knowledge", requiresToken: false },
  { id: "memory", name: "Enhanced Memory", icon: "🧠", color: "#8B5CF6", category: "knowledge", requiresToken: false },

  // Crypto (2)
  { id: "coingecko", name: "CoinGecko", icon: "🦎", color: "#8BC53F", category: "crypto", requiresToken: false },
  { id: "bscscan", name: "BscScan", icon: "⛓", color: "#F0B90B", category: "crypto", requiresToken: true },
] as const;

export const CONNECTOR_CATEGORIES = [
  { id: "messaging", name: "Messaging", icon: "💬", count: 8 },
  { id: "productivity", name: "Productivity", icon: "⚡", count: 3 },
  { id: "media", name: "Media", icon: "🎵", count: 2 },
  { id: "knowledge", name: "Knowledge", icon: "📚", count: 4 },
  { id: "crypto", name: "Crypto", icon: "⛓", count: 2 },
] as const;
