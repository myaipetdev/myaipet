import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const address = req.nextUrl.searchParams.get("address");

    if (!address || !/^0x[0-9a-fA-F]{40}$/i.test(address)) {
      return NextResponse.json(
        { error: "Invalid wallet address" },
        { status: 400 }
      );
    }

    const nonce = crypto.randomUUID().replace(/-/g, "").slice(0, 16);

    await prisma.user.upsert({
      where: { wallet_address: address.toLowerCase() },
      create: { wallet_address: address.toLowerCase(), nonce, credits: 100 },
      update: { nonce },
    });

    const chainId = req.nextUrl.searchParams.get("chainId") || "1";
    const host = req.headers.get("host") || "localhost";
    const origin = req.headers.get("origin") || `https://${host}`;

    // Build SIWE message manually to avoid EIP-55 checksum issues
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

    return NextResponse.json({ nonce, message });
  } catch (error: any) {
    console.error("Nonce error:", error);
    return NextResponse.json(
      { error: "Failed to generate nonce", details: error.message },
      { status: 500 }
    );
  }
}
