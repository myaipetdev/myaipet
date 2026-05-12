import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createToken } from "@/lib/auth";
import { verifyMessage } from "viem";

/**
 * Normalize an ECDSA signature so viem accepts it.
 *
 * Wallets in the wild produce three v formats:
 *   1) 27 / 28              ← canonical Ethereum
 *   2) 0  / 1               ← EIP-2098 / some mobile wallets
 *   3) 35 + 2·chainId + p   ← EIP-155 encoded
 *
 * viem (>=2) throws "Invalid yParityOrV value" for #2 and high values of #3.
 * We rewrite the last byte to 27/28 so verifyMessage(personal_sign) succeeds.
 */
function normalizeSignature(sig: string): `0x${string}` {
  const hex = sig.startsWith("0x") ? sig.slice(2) : sig;
  if (hex.length !== 130) return sig as `0x${string}`; // not the canonical 65-byte shape — leave it
  const v = parseInt(hex.slice(128, 130), 16);
  let normalizedV = v;
  if (v === 0 || v === 1) normalizedV = v + 27;
  else if (v >= 35) normalizedV = ((v - 35) % 2) + 27;
  // 27/28 stays as-is
  const vHex = normalizedV.toString(16).padStart(2, "0");
  return ("0x" + hex.slice(0, 128) + vHex) as `0x${string}`;
}

/** Fallback verification via ethers — more permissive about signature encoding. */
async function ethersVerify(message: string, signature: string, expected: string): Promise<boolean> {
  try {
    const { ethers } = await import("ethers");
    const recovered = ethers.verifyMessage(message, signature);
    return recovered.toLowerCase() === expected.toLowerCase();
  } catch {
    return false;
  }
}

function parseSiweMessage(message: string) {
  const lines = message.split("\n");
  let address = "";
  let nonce = "";

  for (const line of lines) {
    // Address is on the second line (after "domain wants you to sign in...")
    if (/^0x[0-9a-fA-F]{40}$/.test(line.trim())) {
      address = line.trim();
    }
    if (line.startsWith("Nonce: ")) {
      nonce = line.replace("Nonce: ", "").trim();
    }
  }

  return { address, nonce };
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { message, signature } = body;

  if (!message || !signature) {
    return NextResponse.json(
      { error: "Message and signature are required" },
      { status: 400 }
    );
  }

  try {
    const { address, nonce } = parseSiweMessage(message);

    if (!address || !nonce) {
      return NextResponse.json(
        { error: "Invalid SIWE message format" },
        { status: 400 }
      );
    }

    // Verify the signature — try viem first with normalized v byte,
    // fall back to ethers (more lenient) for edge-case wallet formats.
    let valid = false;
    try {
      valid = await verifyMessage({
        address: address as `0x${string}`,
        message,
        signature: normalizeSignature(signature),
      });
    } catch {
      // viem throws on Invalid yParityOrV / malformed sig — try ethers instead
      valid = await ethersVerify(message, signature, address);
    }
    if (!valid) {
      valid = await ethersVerify(message, signature, address);
    }

    if (!valid) {
      return NextResponse.json(
        { error: "Invalid signature" },
        { status: 401 }
      );
    }

    const walletAddress = address.toLowerCase();

    const user = await prisma.user.findUnique({
      where: { wallet_address: walletAddress },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 401 });
    }

    if (user.nonce !== nonce) {
      // Rotate nonce on failure to prevent replay attacks
      const failNonce = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
      await prisma.user.update({
        where: { id: user.id },
        data: { nonce: failNonce },
      });
      return NextResponse.json({ error: "Invalid nonce" }, { status: 401 });
    }

    // Rotate nonce after successful verification
    const newNonce = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
    await prisma.user.update({
      where: { id: user.id },
      data: { nonce: newNonce },
    });

    const token = await createToken(user.id, user.wallet_address);

    return NextResponse.json({
      token,
      wallet_address: user.wallet_address,
      credits: user.credits,
    });
  } catch (error: any) {
    console.error("Verify error:", error);
    return NextResponse.json(
      { error: "Signature verification failed", details: error.message },
      { status: 401 }
    );
  }
}
