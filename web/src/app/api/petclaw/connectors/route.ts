import { NextRequest, NextResponse } from "next/server";
import { TelegramConnector } from "@/lib/petclaw/connectors/telegram";
import { SlackConnector } from "@/lib/petclaw/connectors/slack";
import { DiscordConnector } from "@/lib/petclaw/connectors/discord";
import { TwitterConnector } from "@/lib/petclaw/connectors/twitter";
import { WebSearchConnector } from "@/lib/petclaw/connectors/web-search";
import { MemoryConnector } from "@/lib/petclaw/connectors/memory-enhanced";
import { AVAILABLE_CONNECTORS } from "@/lib/petclaw/connectors";

// GET — List available connectors
export async function GET() {
  return NextResponse.json({
    connectors: AVAILABLE_CONNECTORS,
    total: AVAILABLE_CONNECTORS.length,
  });
}

// POST — Execute a connector action
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { connector, action, petId, token, params } = body;

  if (!connector || !action) {
    return NextResponse.json({ error: "connector and action required" }, { status: 400 });
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
        if (action === "search") return NextResponse.json(await ws.search(params.query, params.maxResults));
        if (action === "summarize") return NextResponse.json(await ws.summarize(params.url));
        break;
      }

      case "memory": {
        if (!petId) return NextResponse.json({ error: "petId required" }, { status: 400 });
        const mem = new MemoryConnector(Number(petId));
        if (action === "search") return NextResponse.json(await mem.search(params.query, params.limit));
        if (action === "timeline") return NextResponse.json(await mem.timeline(params.limit));
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
