import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { deletePetData } from "@/lib/petclaw/data-sovereignty";

export async function DELETE(req: NextRequest) {
  const petId = req.nextUrl.searchParams.get("petId");
  if (!petId) {
    return NextResponse.json({ error: "petId required" }, { status: 400 });
  }

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
    const result = await deletePetData(Number(petId), userId);
    return NextResponse.json({
      success: true,
      ...result,
      message: "All pet data has been permanently deleted",
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 403 });
  }
}
