import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { deletePetData } from "@/lib/petclaw/data-sovereignty";

export async function DELETE(req: NextRequest) {
  // SCRUM-37: authentication is REQUIRED. Same IDOR fallback removed.
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const petId = req.nextUrl.searchParams.get("petId");
  if (!petId || !/^\d+$/.test(petId)) {
    return NextResponse.json({ error: "petId required" }, { status: 400 });
  }

  try {
    const result = await deletePetData(Number(petId), user.id);
    return NextResponse.json({
      success: true,
      ...result,
      message: "All pet data has been permanently deleted",
    });
  } catch (e: any) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
}
