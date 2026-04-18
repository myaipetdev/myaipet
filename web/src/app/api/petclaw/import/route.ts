import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { importSoulData } from "@/lib/petclaw/data-sovereignty";
import type { SoulExport } from "@/lib/petclaw/petclaw";

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json() as SoulExport;

  if (!body.protocol || !body.pet || !body.integrityHash) {
    return NextResponse.json({ error: "Invalid SOUL export format" }, { status: 400 });
  }

  try {
    const result = await importSoulData(user.id, body);
    return NextResponse.json({
      success: true,
      ...result,
      message: `Pet "${body.pet.name}" imported successfully`,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
