import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rateLimit";

// SCRUM-72: SIWE chainId is server-pinned to BNB Smart Chain (56)
const DEFAULT_CHAIN_ID = Number(process.env.SIWE_CHAIN_ID || 56);

export async function GET(req: NextRequest) {
  // SCRUM-67: rate-limit nonce generation
  const rl = rateLimit(req, { key: "auth-nonce", limit: 20, windowMs: 60_000 });
  if (!rl.ok) return rl.response;

  try {
    const rawAddress = req.nextUrl.searchParams.get("address") || "";
    if (!/^0x[0-9a-fA-F]{40}$/.test(rawAddress)) {
      return NextResponse.json({ error: "Invalid wallet address" }, { status: 400 });
    }

    // SCRUM-68: always lowercase — no mixed-case duplicate accounts
    const address = rawAddress.toLowerCase();
    const nonce = crypto.randomUUID().replace(/-/g, "").slice(0, 16);

    await prisma.user.upsert({
      where: { wallet_address: address },
      create: { wallet_address: address, nonce, credits: 100 },
      update: { nonce },
    });

    // SCRUM-72: pin chainId server-side; client value is ignored unless it matches
    const clientChainId = Number(req.nextUrl.searchParams.get("chainId"));
    const chainId = clientChainId === DEFAULT_CHAIN_ID ? clientChainId : DEFAULT_CHAIN_ID;

    const host = req.headers.get("host") || "myaipet.ai";
    const origin = req.headers.get("origin") || `https://${host}`;

    const message = [
      `${host} wants you to sign in with your Ethereum account:`,
      address,
      "",
      "Sign in to MY AI PET",
      "",
      `URI: ${origin}`,
      `Version: 1`,
      `Chain ID: ${chainId}`,
      `Nonce: ${nonce}`,
      `Issued At: ${new Date().toISOString()}`,
    ].join("\n");

    return NextResponse.json({ nonce, message, chainId });
  } catch (error: any) {
    console.error("Nonce error:", error?.message);
    return NextResponse.json({ error: "Failed to generate nonce" }, { status: 500 });
  }
}
