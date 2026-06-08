/**
 * Public runtime config — exposes intentionally-public protocol values.
 *
 * SCRUM-70 note: yes, this is unauthenticated by design. The treasury wallet
 * + contract addresses are already on BSCScan and on /contracts /stats pages —
 * pretending they're secret would be security theatre. We rate-limit instead
 * to prevent enumeration / scraping abuse.
 */

import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rateLimit";
import { ONCHAIN } from "@/lib/onchain";

export async function GET(req: NextRequest) {
  const rl = rateLimit(req, { key: "config", limit: 30, windowMs: 60_000 });
  if (!rl.ok) return rl.response;

  return NextResponse.json({
    treasury: ONCHAIN.treasuryWallet,
    chain_id: ONCHAIN.chainId,
    usdt: ONCHAIN.usdt.address,
    contracts: {
      pet_content: ONCHAIN.contracts.petContent,
      pet_tracker: ONCHAIN.contracts.petaGenTracker,
    },
    blockchain_enabled: process.env.BLOCKCHAIN_ENABLED === "true",
    // Why this is public: see https://app.myaipet.ai/contracts and /stats — same values.
  }, {
    headers: {
      "Cache-Control": "public, max-age=300, s-maxage=300",
    },
  });
}
