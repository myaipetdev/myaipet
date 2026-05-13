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

type Bucket = { tokens: number; refilledAt: number };
const buckets = new Map<string, Bucket>();
const GC_INTERVAL_MS = 5 * 60_000;
let lastGc = 0;

function clientId(req: NextRequest): string {
  // Auth header → use the (truncated) token so distinct logged-in users get
  // separate quotas. Fall back to forwarded IP.
  const auth = req.headers.get("authorization");
  if (auth) return "u:" + auth.slice(7, 32);
  const fwd = req.headers.get("x-forwarded-for") || "";
  const ip = fwd.split(",")[0].trim() || req.headers.get("x-real-ip") || "ip:unknown";
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
