/**
 * GET /api/card/[petId] — public JSON of a pet's trading-card data (real stats
 * + rarity + Top N%). Powers the client-rendered <PetCard> in the deck/page.
 * Owner-agnostic, card-appropriate fields only (same as the OG image).
 */
import { NextRequest, NextResponse } from "next/server";
import { getCardData } from "@/lib/tcg/card";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ petId: string }> }) {
  const { petId } = await params;
  const card = await getCardData(parseInt(petId, 10));
  if (!card) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ card });
}
