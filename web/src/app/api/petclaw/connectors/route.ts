import { NextRequest, NextResponse } from "next/server";
import { TelegramConnector } from "@/lib/petclaw/connectors/telegram";
import { SlackConnector } from "@/lib/petclaw/connectors/slack";
import { DiscordConnector } from "@/lib/petclaw/connectors/discord";
import { TwitterConnector } from "@/lib/petclaw/connectors/twitter";
import { WebSearchConnector } from "@/lib/petclaw/connectors/web-search";
import { WikipediaConnector } from "@/lib/petclaw/connectors/wikipedia";
import { MemoryConnector } from "@/lib/petclaw/connectors/memory-enhanced";
import { AVAILABLE_CONNECTORS } from "@/lib/petclaw/connectors";
import { getUser } from "@/lib/auth";
import { ownsPet } from "@/lib/authz";
import { rateLimit } from "@/lib/rateLimit";
import {
  agentChannelsEnabled,
  agentChannelsUnavailableResponse,
} from "@/lib/oauth/availability";

// GET — List available connectors
export async function GET() {
  return NextResponse.json({
    connectors: AVAILABLE_CONNECTORS,
    total: AVAILABLE_CONNECTORS.length,
  });
}

// POST — Execute a connector action
export async function POST(req: NextRequest) {
  // SECURITY (audit C1): this route proxies arbitrary outbound calls (with a
  // client-supplied token) and exposes petId-scoped memory export/clear. It
  // MUST be authenticated, and memory actions MUST verify pet ownership.
  const user = await getUser(req).catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = rateLimit(req, { key: "petclaw-connectors", limit: 30, windowMs: 60_000 });
  if (!rl.ok) return rl.response;

  const declaredLength = Number(req.headers.get("content-length") || 0);
  if (Number.isFinite(declaredLength) && declaredLength > 32 * 1024) {
    return NextResponse.json({ error: "Request body too large" }, { status: 413 });
  }
  const rawBody = await req.text();
  if (new TextEncoder().encode(rawBody).byteLength > 32 * 1024) {
    return NextResponse.json({ error: "Request body too large" }, { status: 413 });
  }
  let body: any = null;
  try { body = JSON.parse(rawBody); } catch { /* handled below */ }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { connector, action, petId, token, params } = body;
  const safeParams = params && typeof params === "object" && !Array.isArray(params) ? params : {};

  if (!connector || !action) {
    return NextResponse.json({ error: "connector and action required" }, { status: 400 });
  }

  // Raw-token channel execution is part of the same launch-paused surface as
  // stored agent connections. Do not let this generic connector endpoint
  // bypass AGENT_CHANNELS_ENABLED while public messaging is advertised as off.
  if (["telegram", "slack", "discord", "twitter"].includes(connector)
    && !agentChannelsEnabled()) {
    return agentChannelsUnavailableResponse();
  }

  // Memory connector reads/writes a specific pet's private store — require ownership.
  if (connector === "memory") {
    if (!petId) return NextResponse.json({ error: "petId required" }, { status: 400 });
    if (!(await ownsPet(req, Number(petId)))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  try {
    switch (connector) {
      case "telegram": {
        if (!token) return NextResponse.json({ error: "Bot token required" }, { status: 400 });
        const tg = new TelegramConnector(token);
        if (action === "sendMessage") return NextResponse.json(await tg.sendMessage(params.chatId, params.text));
        if (action === "sendPhoto") return NextResponse.json(await tg.sendPhoto(params.chatId, params.photoUrl, params.caption));
        if (action === "getUpdates") return NextResponse.json(await tg.getUpdates(params.limit));
        if (action === "getMe") return NextResponse.json(await tg.getMe());
        if (action === "setWebhook") return NextResponse.json(await tg.setWebhook(params.url));
        break;
      }

      case "slack": {
        if (!token) return NextResponse.json({ error: "Bot token required" }, { status: 400 });
        const slack = new SlackConnector(token);
        if (action === "sendMessage") return NextResponse.json(await slack.sendMessage(params.channel, params.text, params.threadTs));
        if (action === "addReaction") return NextResponse.json(await slack.addReaction(params.channel, params.timestamp, params.emoji));
        if (action === "getHistory") return NextResponse.json(await slack.getChannelHistory(params.channel, params.limit));
        if (action === "listChannels") return NextResponse.json(await slack.listChannels());
        break;
      }

      case "discord": {
        if (!token) return NextResponse.json({ error: "Bot token required" }, { status: 400 });
        const dc = new DiscordConnector(token);
        if (action === "sendMessage") return NextResponse.json(await dc.sendMessage(params.channelId, params.content));
        if (action === "addReaction") return NextResponse.json(await dc.addReaction(params.channelId, params.messageId, params.emoji));
        if (action === "getMessages") return NextResponse.json(await dc.getChannelMessages(params.channelId, params.limit));
        if (action === "getGuilds") return NextResponse.json(await dc.getGuilds());
        if (action === "getMe") return NextResponse.json(await dc.getBotUser());
        break;
      }

      case "twitter": {
        if (!token) return NextResponse.json({ error: "Bearer token required" }, { status: 400 });
        const tw = new TwitterConnector(token);
        if (action === "postTweet") return NextResponse.json(await tw.postTweet(params.text, params.replyToId));
        if (action === "getTimeline") return NextResponse.json(await tw.getTimeline(params.userId, params.maxResults));
        if (action === "search") return NextResponse.json(await tw.searchTweets(params.query, params.maxResults));
        if (action === "like") return NextResponse.json(await tw.likeTweet(params.userId, params.tweetId));
        if (action === "getMe") return NextResponse.json(await tw.getMe());
        break;
      }

      case "web-search": {
        const ws = new WebSearchConnector();
        if (action === "search") return NextResponse.json(await ws.search(safeParams.query, safeParams.maxResults));
        if (action === "summarize") {
          // Server-side arbitrary-page fetch is disabled for launch. A URL
          // guard on only the first hop is insufficient because redirects and
          // DNS rebinding can reach loopback, RFC1918, or cloud metadata.
          return NextResponse.json(
            { error: "Server-side page summarization is not available. Use the extension's approved text excerpt instead." },
            { status: 503, headers: { "Cache-Control": "no-store" } },
          );
        }
        break;
      }

      case "wikipedia": {
        const wiki = new WikipediaConnector();
        if (action === "search") {
          return NextResponse.json(await wiki.search(String(safeParams.query || "").slice(0, 300), Number(safeParams.limit) || 5));
        }
        if (action === "summary") {
          return NextResponse.json(await wiki.getSummary(String(safeParams.title || "").slice(0, 300)));
        }
        break;
      }

      case "memory": {
        if (!petId) return NextResponse.json({ error: "petId required" }, { status: 400 });
        const mem = new MemoryConnector(Number(petId));
        if (action === "search") return NextResponse.json(await mem.search(safeParams.query, safeParams.limit));
        if (action === "timeline") return NextResponse.json(await mem.timeline(safeParams.limit));
        if (action === "export") return NextResponse.json(await mem.exportAll());
        if (action === "clear") return NextResponse.json(await mem.clear());
        break;
      }

      default:
        return NextResponse.json({ error: `Unknown connector: ${connector}` }, { status: 400 });
    }

    return NextResponse.json({ error: `Unknown action: ${action} for ${connector}` }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
