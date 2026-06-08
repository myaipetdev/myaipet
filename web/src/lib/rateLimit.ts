/**
 * Lightweight in-memory token bucket rate limiter.
 *
 * Good enough for a single-instance Next.js standalone server. For multi-instance
 * deployments swap the Map for Redis/Upstash with the same interface.
 *
 * Usage in a route handler:
 *   import { rateLimit } from "@/lib/rateLimit";
 *   const rl = rateLimit(req, { key: "chat", limit: 30, windowMs: 60_000 });
 *   if (!rl.ok) return rl.response;
 *   // ...
 */

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

type Bucket = { tokens: number; refilledAt: number };
const buckets = new Map<string, Bucket>();
const GC_INTERVAL_MS = 5 * 60_000;
let lastGc = 0;

function clientId(req: NextRequest): string {
  // audit H10: key on a hash of the FULL bearer token so distinct logged-in
  // users get distinct buckets. The previous `auth.slice(7, 32)` was the same
  // constant ("eyJhbGciOiJIUzI1NiJ9.eyJz") for every HS256 JWT, collapsing all
  // authenticated users into one shared bucket.
  const auth = req.headers.get("authorization");
  if (auth && auth.startsWith("Bearer ")) {
    const token = auth.slice(7);
    return "u:" + crypto.createHash("sha256").update(token).digest("hex").slice(0, 24);
  }
  // audit H11: do NOT trust the client-supplied leftmost X-Forwarded-For hop.
  // Prefer X-Real-IP (set by our nginx/edge proxy) and otherwise take the
  // RIGHTMOST XFF entry (appended by our own proxy), which an external attacker
  // cannot forge. NOTE: assumes a single trusted proxy in front of the app;
  // adjust the hop index if the proxy depth changes.
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return "ip:" + realIp.trim();
  const fwd = req.headers.get("x-forwarded-for") || "";
  const parts = fwd.split(",").map((s) => s.trim()).filter(Boolean);
  const ip = parts.length ? parts[parts.length - 1] : "unknown";
  return "ip:" + ip;
}

export interface RateLimitOptions {
  key: string;          // endpoint name, e.g. "chat", "upload"
  limit: number;        // max requests per window
  windowMs: number;     // window length in ms
}

export interface RateLimitResult {
  ok: boolean;
  response: NextResponse;
  remaining: number;
  resetMs: number;
}

export function rateLimit(req: NextRequest, opts: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  if (now - lastGc > GC_INTERVAL_MS) {
    lastGc = now;
    for (const [k, b] of buckets) {
      if (now - b.refilledAt > opts.windowMs * 4) buckets.delete(k);
    }
  }

  const cid = clientId(req);
  const bucketKey = `${opts.key}:${cid}`;
  let b = buckets.get(bucketKey);
  if (!b) {
    b = { tokens: opts.limit, refilledAt: now };
    buckets.set(bucketKey, b);
  }

  // Refill: full window elapsed → reset
  if (now - b.refilledAt >= opts.windowMs) {
    b.tokens = opts.limit;
    b.refilledAt = now;
  }

  if (b.tokens <= 0) {
    const retryAfterMs = opts.windowMs - (now - b.refilledAt);
    return {
      ok: false,
      remaining: 0,
      resetMs: retryAfterMs,
      response: NextResponse.json(
        { error: "Too many requests" },
        {
          status: 429,
          headers: {
            "Retry-After": String(Math.ceil(retryAfterMs / 1000)),
            "X-RateLimit-Limit": String(opts.limit),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": String(Math.ceil((now + retryAfterMs) / 1000)),
          },
        }
      ),
    };
  }

  b.tokens--;
  return {
    ok: true,
    remaining: b.tokens,
    resetMs: opts.windowMs - (now - b.refilledAt),
    response: NextResponse.json({}), // unused when ok=true
  };
}
