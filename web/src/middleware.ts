import { NextRequest, NextResponse } from "next/server";

const FIRST_PARTY_ORIGINS = new Set([
  "https://myaipet.ai",
  "https://www.myaipet.ai",
  "https://app.myaipet.ai",
]);

/**
 * Extra exact origins (not URL patterns), e.g. a stable Chrome Web Store id:
 * PETCLAW_CORS_ORIGINS=chrome-extension://abcdefghijklmnop...
 */
function configuredOrigins(): Set<string> {
  return new Set(
    (process.env.PETCLAW_CORS_ORIGINS || "")
      .split(",")
      .map((value) => value.trim().replace(/\/$/, ""))
      .filter(Boolean),
  );
}

export function isAllowedCorsOrigin(origin: string | null): boolean {
  if (!origin) return false;
  const normalized = origin.replace(/\/$/, "");
  if (FIRST_PARTY_ORIGINS.has(normalized) || configuredOrigins().has(normalized)) return true;

  // Keep local development usable without adding localhost to production's
  // browser trust boundary.
  if (process.env.NODE_ENV !== "production") {
    try {
      const url = new URL(normalized);
      return url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    } catch {
      return false;
    }
  }
  return false;
}

function privateApiCors(req: NextRequest, methods: string): NextResponse {
  const origin = req.headers.get("origin");
  const allowed = isAllowedCorsOrigin(origin);

  // A browser preflight from an unapproved page must stop here. Server-to-
  // server clients do not send browser preflights and remain unaffected.
  if (req.method === "OPTIONS" && !allowed) {
    return NextResponse.json(
      { error: "Origin not allowed" },
      { status: 403, headers: { Vary: "Origin", "Cache-Control": "no-store" } },
    );
  }

  const res = req.method === "OPTIONS"
    ? new NextResponse(null, { status: 204 })
    : NextResponse.next();
  res.headers.set("Vary", "Origin");
  if (allowed && origin) res.headers.set("Access-Control-Allow-Origin", origin);
  res.headers.set("Access-Control-Allow-Methods", methods);
  res.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.headers.set("Access-Control-Max-Age", "86400");
  return res;
}

export function middleware(req: NextRequest) {
  // Stateful/authenticated PetClaw APIs are readable from approved browser
  // origins only. Chrome extension host permissions continue to support its
  // background requests; a stable store origin can be added via the env list.
  if (req.nextUrl.pathname.startsWith("/api/petclaw")) {
    return privateApiCors(req, "GET, POST, PUT, DELETE, OPTIONS");
  }

  // The extension fetches the authenticated pet list through this namespace.
  if (req.nextUrl.pathname.startsWith("/api/pets")) {
    return privateApiCors(req, "GET, POST, OPTIONS");
  }

  // Protocol/security discovery documents are intentionally public and have no
  // state or credentials, so wildcard read access remains appropriate here.
  if (req.nextUrl.pathname.startsWith("/.well-known/")) {
    const res = req.method === "OPTIONS"
      ? new NextResponse(null, { status: 204 })
      : NextResponse.next();
    res.headers.set("Access-Control-Allow-Origin", "*");
    res.headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.headers.set("Access-Control-Allow-Headers", "Content-Type");
    res.headers.set("Access-Control-Max-Age", "86400");
    return res;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/petclaw/:path*", "/.well-known/:path*", "/api/pets/:path*"],
};
