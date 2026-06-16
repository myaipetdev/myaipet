import { NextRequest, NextResponse } from "next/server";
import { verifyPetOwnership } from "@/lib/petclaw/data-sovereignty";
import { rateLimit } from "@/lib/rateLimit";

// Public protocol endpoint (advertised in .well-known/pet-card.json + the SDK):
// anyone can ask "does wallet X own pet N". Intentionally unauthenticated, so
// throttle per-IP to stop it being used as a free ownership-scanning oracle.
export async function POST(req: NextRequest) {
  const rl = rateLimit(req, { key: "petclaw-verify", limit: 30, windowMs: 60_000 });
  if (!rl.ok) return rl.response;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { petId, walletAddress } = body;

  if (!petId || !walletAddress) {
    return NextResponse.json({ error: "petId and walletAddress required" }, { status: 400 });
  }

  if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
    return NextResponse.json({ error: "Invalid wallet address" }, { status: 400 });
  }

  const result = await verifyPetOwnership(Number(petId), walletAddress);

  return NextResponse.json({
    petId: Number(petId),
    walletAddress,
    ...result,
  });
}
