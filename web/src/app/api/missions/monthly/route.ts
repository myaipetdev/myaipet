import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { getOrAssignMonthly } from "@/lib/missions/periodic";

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try { return NextResponse.json(await getOrAssignMonthly(user.id)); }
  catch (e) { console.error("monthly:", e); return NextResponse.json({ error: "internal" }, { status: 500 }); }
}
