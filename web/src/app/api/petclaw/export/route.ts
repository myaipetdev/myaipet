import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { exportPetData } from "@/lib/petclaw/data-sovereignty";

export async function GET(req: NextRequest) {
  const petId = req.nextUrl.searchParams.get("petId");
  if (!petId) {
    return NextResponse.json({ error: "petId required" }, { status: 400 });
  }

  // Try auth, fallback to pet owner lookup for dev/extension access
  let userId: number;
  const user = await getUser(req).catch(() => null);
  if (user) {
    userId = user.id;
  } else {
    const pet = await prisma.pet.findUnique({ where: { id: Number(petId) }, select: { user_id: true } });
    if (!pet) return NextResponse.json({ error: "Pet not found" }, { status: 404 });
    userId = pet.user_id;
  }

  try {
    const soulExport = await exportPetData(Number(petId), userId);
    return NextResponse.json(soulExport);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 403 });
  }
}
