import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { setSuccessor } from "@/lib/services/soul";

const WALLET_RE = /^0x[a-fA-F0-9]{40}$/;

/**
 * POST /api/pets/[petId]/soul/successor
 * Body: { successor_wallet: "0x..." }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ petId: string }> },
) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { petId } = await params;
  const pid = Number(petId);
  if (!pid || Number.isNaN(pid)) {
    return NextResponse.json({ error: "Invalid petId" }, { status: 400 });
  }

  const pet = await prisma.pet.findFirst({
    where: { id: pid, user_id: user.id, is_active: true },
  });
  if (!pet) return NextResponse.json({ error: "Pet not found" }, { status: 404 });

  let body: { successor_wallet?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const successor = body.successor_wallet;
  if (!successor || typeof successor !== "string" || !WALLET_RE.test(successor)) {
    return NextResponse.json(
      { error: "successor_wallet must be a valid 0x-prefixed 40-hex-char address" },
      { status: 400 },
    );
  }

  if (successor.toLowerCase() === user.wallet_address.toLowerCase()) {
    return NextResponse.json(
      { error: "Successor wallet cannot be the current owner" },
      { status: 400 },
    );
  }

  try {
    await setSuccessor(pid, successor);
    return NextResponse.json({ ok: true, successor_wallet: successor });
  } catch (err: any) {
    console.error("[soul/successor] POST error:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to set successor" },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/pets/[petId]/soul/successor
 * Clears successor (sets to null).
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ petId: string }> },
) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { petId } = await params;
  const pid = Number(petId);
  if (!pid || Number.isNaN(pid)) {
    return NextResponse.json({ error: "Invalid petId" }, { status: 400 });
  }

  const pet = await prisma.pet.findFirst({
    where: { id: pid, user_id: user.id, is_active: true },
  });
  if (!pet) return NextResponse.json({ error: "Pet not found" }, { status: 404 });

  try {
    await setSuccessor(pid, null as any);
    return NextResponse.json({ ok: true, successor_wallet: null });
  } catch (err: any) {
    console.error("[soul/successor] DELETE error:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to remove successor" },
      { status: 500 },
    );
  }
}
