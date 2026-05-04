/**
 * Public runtime config — exposes safe-to-share env values to the client.
 * Returned values are public by design (treasury address, contract addresses).
 */

import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    treasury: (process.env.TREASURY_WALLET || "").trim(),
    chain_id: 56,
    contracts: {
      pet_content: "0xB31B656D3790bFB3b3331D6A6BF0abf3dd6b0d9c",
      pet_tracker: "0x590D3b2CD0AB9aEE0e0d7Fd48E8810b20ec8Ac0a",
    },
    blockchain_enabled: process.env.BLOCKCHAIN_ENABLED === "true",
  });
}
