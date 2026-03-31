import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { SignJWT, importPKCS8 } from "jose";

const COINBASE_API_KEY_NAME = process.env.COINBASE_API_KEY_NAME || "";
const COINBASE_API_KEY_SECRET = process.env.COINBASE_API_KEY_SECRET || "";

async function createCDPJWT() {
  // Secret is base64-encoded PEM
  const pem = Buffer.from(COINBASE_API_KEY_SECRET, "base64").toString("utf-8");
  const ecKey = crypto.createPrivateKey(pem);
  const pkcs8Pem = ecKey.export({ type: "pkcs8", format: "pem" }) as string;
  const key = await importPKCS8(pkcs8Pem, "ES256");

  const now = Math.floor(Date.now() / 1000);

  const jwt = await new SignJWT({
    sub: COINBASE_API_KEY_NAME,
    iss: "cdp",
    aud: ["cdp_service"],
    iat: now,
    nbf: now,
    exp: now + 120,
    uris: ["POST api.developer.coinbase.com/onramp/v1/token"],
  })
    .setProtectedHeader({
      alg: "ES256",
      kid: COINBASE_API_KEY_NAME,
      nonce: String(Math.floor(Math.random() * 1e16)),
      typ: "JWT",
    })
    .sign(key);

  return jwt;
}

export async function POST(req: NextRequest) {
  if (!COINBASE_API_KEY_NAME || !COINBASE_API_KEY_SECRET) {
    return NextResponse.json({ error: "Coinbase not configured" }, { status: 500 });
  }

  try {
    const { walletAddress } = await req.json();
    if (!walletAddress || !/^0x[0-9a-fA-F]{40}$/i.test(walletAddress)) {
      return NextResponse.json({ error: "Valid wallet address required" }, { status: 400 });
    }

    const jwt = await createCDPJWT();

    const response = await fetch("https://api.developer.coinbase.com/onramp/v1/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${jwt}`,
      },
      body: JSON.stringify({
        destination_wallets: [{ address: walletAddress, blockchains: ["base"] }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return NextResponse.json({ error: "Failed to create session", details: err }, { status: 500 });
    }

    const data = await response.json();
    return NextResponse.json({ token: data.token });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
