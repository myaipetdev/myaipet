/**
 * Discord bot Interactions endpoint (slash commands + DMs).
 *
 *   POST /api/bots/discord/interactions
 *
 * Discord verifies via Ed25519 signature (X-Signature-Ed25519 + X-Signature-Timestamp).
 *
 * Supports:
 *   - PING (type 1) → PONG (Discord verification check)
 *   - APPLICATION_COMMAND (type 2) → /chat <message> command
 *   - MESSAGE_COMPONENT (type 3) → button clicks (unused for now)
 *
 * To activate:
 *   1. https://discord.com/developers/applications → your app
 *   2. Public Key → set DISCORD_PUBLIC_KEY env var
 *   3. Interactions Endpoint URL → https://app.myaipet.ai/api/bots/discord/interactions
 *   4. Register /chat command (one-time):
 *        POST https://discord.com/api/v10/applications/{APP_ID}/commands
 *        body: { name: "chat", description: "Chat with your pet", type: 1,
 *                options: [{ name: "message", description: "what to say", type: 3, required: true }] }
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rateLimit";
import nacl from "tweetnacl";
import { oauthConnectionsEnabled, oauthUnavailableResponse } from "@/lib/oauth/availability";
import { decodeOAuthCredentials } from "@/lib/oauth/credentials";

// Discord interaction types
const INT_TYPE_PING = 1;
const INT_TYPE_COMMAND = 2;

// Response types
const RESP_TYPE_PONG = 1;
const RESP_TYPE_CHANNEL_MESSAGE = 4;
const RESP_TYPE_DEFERRED = 5;

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return out;
}

async function verifySignature(req: NextRequest, rawBody: string): Promise<boolean> {
  const publicKey = process.env.DISCORD_PUBLIC_KEY;
  const signature = req.headers.get("x-signature-ed25519");
  const timestamp = req.headers.get("x-signature-timestamp");
  if (!publicKey || !signature || !timestamp) return false;
  try {
    return nacl.sign.detached.verify(
      new TextEncoder().encode(timestamp + rawBody),
      hexToBytes(signature),
      hexToBytes(publicKey),
    );
  } catch (e: any) {
    console.error("[discord] sig verify error:", e?.message);
    return false;
  }
}

export async function POST(req: NextRequest) {
  if (!oauthConnectionsEnabled()) return oauthUnavailableResponse();

  // Discord enforces signature verify on every call, but this also blunts
  // forged-sig DoS attempts by capping per-IP volume.
  const rl = rateLimit(req, { key: "discord-int", limit: 120, windowMs: 60_000 });
  if (!rl.ok) return rl.response;

  const rawBody = await req.text();
  if (!(await verifySignature(req, rawBody))) {
    return new NextResponse("Invalid signature", { status: 401 });
  }

  let interaction: any;
  try { interaction = JSON.parse(rawBody); } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  // Discord verification ping
  if (interaction.type === INT_TYPE_PING) {
    return NextResponse.json({ type: RESP_TYPE_PONG });
  }

  if (interaction.type === INT_TYPE_COMMAND) {
    const commandName = interaction.data?.name;
    const userId = interaction.member?.user?.id || interaction.user?.id;
    const messageArg = interaction.data?.options?.find((o: any) => o.name === "message")?.value;

    if (commandName === "chat" && userId && messageArg) {
      // Find the pet connected to this Discord user. We stored their discord
      // user id in credentials.profile.id at OAuth time.
      const connections = await prisma.petPlatformConnection.findMany({
        where: { platform: "discord", is_active: true },
      });
      const match = connections.find(c => {
        const creds = decodeOAuthCredentials(c.credentials);
        return creds?.profile?.id === userId;
      });

      if (!match) {
        return NextResponse.json({
          type: RESP_TYPE_CHANNEL_MESSAGE,
          data: {
            content: "I don't recognise you yet. Connect this Discord at https://app.myaipet.ai/?section=sovereignty",
            flags: 64,   // ephemeral (only the caller sees it)
          },
        });
      }

      // Discord requires a response within 3 seconds. Our LLM might take longer.
      // Strategy: respond with DEFERRED, then do the work in background, then
      // edit the original message via the followup endpoint. For simplicity in
      // this v1 we run synchronously and hope Grok responds < 3s.
      try {
        const { executeSkill } = await import("@/lib/petclaw/pethub");
        const result = await executeSkill(match.pet_id, "companion-chat", {
          message: String(messageArg).slice(0, 500),
          surface: "discord",
          sessionId: `discord-${String(interaction.channel_id || userId).slice(0, 100)}`,
        });
        const reply = (result.output as any)?.reply || "*The pet tilts its head*";
        return NextResponse.json({
          type: RESP_TYPE_CHANNEL_MESSAGE,
          data: { content: reply.slice(0, 2000) },
        });
      } catch (e: any) {
        console.error("[discord] pethub error:", e?.message);
        return NextResponse.json({
          type: RESP_TYPE_CHANNEL_MESSAGE,
          data: { content: "The pet seems distracted right now — try again.", flags: 64 },
        });
      }
    }
  }

  return NextResponse.json({
    type: RESP_TYPE_CHANNEL_MESSAGE,
    data: { content: "Unknown command.", flags: 64 },
  });
}
