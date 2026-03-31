import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createToken } from "@/lib/auth";
import { verifyMessage } from "viem";

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

    // Verify the signature using viem
    const valid = await verifyMessage({
      address: address as `0x${string}`,
      message,
      signature: signature as `0x${string}`,
    });

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
