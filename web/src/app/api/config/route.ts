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

export async function GET(req: NextRequest) {
  const rl = rateLimit(req, { key: "config", limit: 30, windowMs: 60_000 });
  if (!rl.ok) return rl.response;

  return NextResponse.json({
    treasury: (process.env.TREASURY_WALLET || "").trim(),
    chain_id: Number(process.env.SIWE_CHAIN_ID || 56),
    contracts: {
      pet_content: "0xB31B656D3790bFB3b3331D6A6BF0abf3dd6b0d9c",
      pet_tracker: "0x590D3b2CD0AB9aEE0e0d7Fd48E8810b20ec8Ac0a",
    },
    blockchain_enabled: process.env.BLOCKCHAIN_ENABLED === "true",
    // Why this is public: see https://app.myaipet.ai/contracts and /stats — same values.
  }, {
    headers: {
      "Cache-Control": "public, max-age=300, s-maxage=300",
    },
  });
}
