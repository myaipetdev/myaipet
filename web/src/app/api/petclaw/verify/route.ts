import { NextRequest, NextResponse } from "next/server";
import { verifyPetOwnership } from "@/lib/petclaw/data-sovereignty";

export async function POST(req: NextRequest) {
  const body = await req.json();
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
