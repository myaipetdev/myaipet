import { NextRequest, NextResponse } from "next/server";

export function middleware(req: NextRequest) {
  // CORS for PetClaw APIs (Chrome Extension + external agents)
  if (req.nextUrl.pathname.startsWith("/api/petclaw") || req.nextUrl.pathname.startsWith("/.well-known/")) {
    if (req.method === "OPTIONS") {
      return new NextResponse(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
          "Access-Control-Max-Age": "86400",
        },
      });
    }

    const res = NextResponse.next();
    res.headers.set("Access-Control-Allow-Origin", "*");
    res.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    return res;
  }

  // Also allow CORS for /api/pets (extension fetches pet list)
  if (req.nextUrl.pathname.startsWith("/api/pets")) {
    if (req.method === "OPTIONS") {
      return new NextResponse(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
      });
    }

    const res = NextResponse.next();
    res.headers.set("Access-Control-Allow-Origin", "*");
    return res;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/petclaw/:path*", "/.well-known/:path*", "/api/pets/:path*"],
};
