import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { getOrAssignWeekly } from "@/lib/missions/periodic";

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try { return NextResponse.json(await getOrAssignWeekly(user.id)); }
  catch (e) { console.error("weekly:", e); return NextResponse.json({ error: "internal" }, { status: 500 }); }
}
