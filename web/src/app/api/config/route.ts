/**
 * Public runtime config — exposes intentionally-public protocol values.
 *
 * SCRUM-70 note: yes, this is unauthenticated by design. The treasury wallet
 * + contract addresses are already on BSCScan and the /contracts page —
 * pretending they're secret would be security theatre. We rate-limit instead
 * to prevent enumeration / scraping abuse.
 */

import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rateLimit";
import { blockchainEnabled, ONCHAIN, treasuryConfigured } from "@/lib/onchain";
import { agentChannelsEnabled, oauthConnectionsEnabled } from "@/lib/oauth/availability";

export async function GET(req: NextRequest) {
  const rl = rateLimit(req, { key: "config", limit: 30, windowMs: 60_000 });
  if (!rl.ok) return rl.response;

  // Unless payments are explicitly enabled (PAYMENTS_ENABLED=true), stop exposing the
  // treasury + token + on-chain contract addresses, so the client shows
  // "payments paused" and nothing advertises a chain we're migrating off.
  const paid = treasuryConfigured();
  return NextResponse.json({
    treasury: paid ? ONCHAIN.treasuryWallet : "",
    chain_id: ONCHAIN.chainId,
    usdt: paid ? ONCHAIN.usdt.address : "",
    contracts: paid ? {
      pet_content: ONCHAIN.contracts.petContent,
      pet_tracker: ONCHAIN.contracts.petaGenTracker,
    } : {},
    blockchain_enabled: blockchainEnabled(),
    payments_enabled: paid,
    oauth_connections_enabled: oauthConnectionsEnabled(),
    agent_channels_enabled: agentChannelsEnabled(),
  }, {
    headers: {
      // Payment enablement is a safety gate, not cacheable product metadata.
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
