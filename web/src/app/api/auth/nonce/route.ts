import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rateLimit";
import {
  buildSiweMessage,
  createSiweNonce,
  getTrustedSiweConfig,
  hashSiweMessage,
} from "@/lib/siweLogin";

export async function GET(req: NextRequest) {
  // SCRUM-67: rate-limit nonce generation
  const rl = rateLimit(req, { key: "auth-nonce", limit: 20, windowMs: 60_000 });
  if (!rl.ok) return rl.response;

  try {
    const rawAddress = req.nextUrl.searchParams.get("address") || "";
    if (!/^0x[0-9a-fA-F]{40}$/.test(rawAddress)) {
      return NextResponse.json({ error: "Invalid wallet address" }, { status: 400 });
    }

    // Always lowercase — no mixed-case duplicate accounts. This is challenge
    // metadata only; requesting it proves no key control.
    const address = rawAddress.toLowerCase();
    const config = getTrustedSiweConfig(req.nextUrl, req.headers.get("host"));
    const nonce = createSiweNonce();
    const issuedAt = new Date();
    const expiresAt = new Date(issuedAt.getTime() + config.challengeTtlMs);
    const message = buildSiweMessage({ address, nonce, issuedAt, expiresAt, config });

    // LoginChallenge is intentionally independent of User.nonce. This endpoint
    // is unauthenticated, so it must not create users or invalidate sessions.
    // Separate rows allow multiple tabs/devices to hold concurrent challenges.
    await prisma.$transaction([
      prisma.loginChallenge.deleteMany({
        where: { expires_at: { lt: issuedAt } },
      }),
      prisma.loginChallenge.create({
        data: {
          nonce,
          wallet_address: address,
          message_hash: hashSiweMessage(message),
          domain: config.domain,
          uri: config.uri,
          chain_id: config.chainId,
          issued_at: issuedAt,
          expires_at: expiresAt,
        },
      }),
    ]);

    const response = NextResponse.json({
      nonce,
      message,
      chainId: config.chainId,
      expiresAt: expiresAt.toISOString(),
    });
    response.headers.set("Cache-Control", "no-store, max-age=0");
    response.headers.set("Pragma", "no-cache");
    return response;
  } catch (error: unknown) {
    console.error("Nonce error:", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ error: "Failed to generate nonce" }, { status: 500 });
  }
}
