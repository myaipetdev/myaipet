/**
 * GET /api/missions/today
 * Returns the user's 5 daily missions, with auto-verification pass and
 * streak / shield / next-milestone info. Materialises rows on first call.
 */
import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { getOrAssignToday } from "@/lib/missions/today";

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const view = await getOrAssignToday(user.id);
    return NextResponse.json(view);
  } catch (e: any) {
    console.error("missions/today failed:", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
