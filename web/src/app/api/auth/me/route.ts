import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser, isCliToken, SESSION_COOKIE_NAME } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const user = await getUser(req);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const generationCount = await prisma.generation.count({
    where: { user_id: user.id },
  });

  const response = NextResponse.json({
    wallet_address: user.wallet_address,
    credits: user.credits,
    season_points: user.season_points ?? 0,
    generation_count: generationCount,
    created_at: user.created_at,
  });

  // Existing browser sessions predate the protected-media cookie. Mirror an
  // already-validated JWT when the app performs its normal /auth/me bootstrap
  // so private <img>/<video> requests work without forcing another wallet
  // signature. Personal/extension tokens are never put into browser cookies.
  const authorization = req.headers.get("authorization");
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (token && !isCliToken(token)) {
    response.cookies.set(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 8 * 60 * 60,
    });
  }
  return response;
}
