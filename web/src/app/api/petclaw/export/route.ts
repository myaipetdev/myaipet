import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { exportPetData } from "@/lib/petclaw/data-sovereignty";

export async function GET(req: NextRequest) {
  // SCRUM-36: authentication is REQUIRED. Previously a "dev/extension fallback"
  // resolved the pet's actual owner from the DB, letting anyone export any pet.
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const petId = req.nextUrl.searchParams.get("petId");
  if (!petId || !/^\d+$/.test(petId)) {
    return NextResponse.json({ error: "petId required" }, { status: 400 });
  }

  try {
    // exportPetData internally verifies ownership against userId
    const soulExport = await exportPetData(Number(petId), user.id);
    return NextResponse.json(soulExport);
  } catch (e: any) {
    // Generic 403 — don't leak whether the pet exists
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
}
