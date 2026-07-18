import { NextResponse } from "next/server";

export const OAUTH_UNAVAILABLE_CODE = "CHANNEL_SUBSCRIPTIONS_UNAVAILABLE";

/**
 * Channel subscriptions are a launch kill-switch. They stay fail-closed unless
 * an operator explicitly opts in after the credential-format migration and
 * the per-purpose connection schema have both been signed off.
 */
export function oauthConnectionsEnabled(): boolean {
  return process.env.OAUTH_CONNECTIONS_ENABLED === "true";
}

/** Legacy bot-token channels have a separate credential purpose and webhook. */
export function agentChannelsEnabled(): boolean {
  return process.env.AGENT_CHANNELS_ENABLED === "true";
}

export function oauthUnavailableResponse(): NextResponse {
  return NextResponse.json(
    {
      error: "Channel subscriptions are temporarily unavailable.",
      code: OAUTH_UNAVAILABLE_CODE,
      available: false,
    },
    {
      status: 503,
      headers: {
        "Cache-Control": "no-store, max-age=0",
        "Retry-After": "86400",
      },
    },
  );
}

export function agentChannelsUnavailableResponse(): NextResponse {
  return NextResponse.json(
    {
      error: "Agent platform connections are temporarily unavailable.",
      code: "AGENT_CHANNELS_UNAVAILABLE",
      available: false,
    },
    {
      status: 503,
      headers: { "Cache-Control": "no-store, max-age=0", "Retry-After": "86400" },
    },
  );
}
