/**
 * Telegram Login Widget callback.
 *
 * Telegram doesn't use OAuth 2.0 — the Login Widget calls our window callback
 * with HMAC-signed user data. The widget host page (/oauth/telegram/widget)
 * POSTs that payload here for verification and persistence.
 *
 * Verification per Telegram docs:
 *   secret_key = SHA256(bot_token)
 *   data_check_string = sorted fields (excluding `hash`) joined by `\n` as `key=value`
 *   computed_hash = HMAC_SHA256(data_check_string, secret_key)
 *   reject if computed_hash !== received hash, or auth_date older than 24h
 */

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { verifyState } from "@/lib/oauth/state";
import { saveConnection, StoredCredentials } from "@/lib/oauth/store";
import { rateLimit } from "@/lib/rateLimit";

interface TelegramUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

const MAX_AUTH_AGE_SEC = 24 * 60 * 60; // 24 hours

function verifyTelegramHash(user: TelegramUser, botToken: string): boolean {
  const { hash, ...fields } = user;
  if (!hash) return false;

  const dataCheckString = Object.entries(fields)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join("\n");

  const secretKey = crypto.createHash("sha256").update(botToken).digest();
  const computed = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  // timing-safe compare
  const a = Buffer.from(computed, "hex");
  const b = Buffer.from(hash, "hex");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  const rl = rateLimit(req, { key: "oauth-telegram-cb", limit: 20, windowMs: 60_000 });
  if (!rl.ok) return rl.response;

  const stateToken = req.nextUrl.searchParams.get("state");
  if (!stateToken) return NextResponse.json({ ok: false, error: "missing_state" }, { status: 400 });

  const state = await verifyState(stateToken);
  if (!state || state.provider !== "telegram") {
    return NextResponse.json({ ok: false, error: "invalid_state" }, { status: 400 });
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    return NextResponse.json({ ok: false, error: "bot_not_configured" }, { status: 503 });
  }

  let user: TelegramUser;
  try {
    user = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_payload" }, { status: 400 });
  }
  if (!user?.id || !user?.hash || !user?.auth_date) {
    return NextResponse.json({ ok: false, error: "incomplete_payload" }, { status: 400 });
  }

  // Reject stale auth_date (replay protection)
  const ageSec = Math.floor(Date.now() / 1000) - Number(user.auth_date);
  if (ageSec < 0 || ageSec > MAX_AUTH_AGE_SEC) {
    return NextResponse.json({ ok: false, error: "stale_auth_date" }, { status: 400 });
  }

  if (!verifyTelegramHash(user, botToken)) {
    return NextResponse.json({ ok: false, error: "invalid_hash" }, { status: 400 });
  }

  const displayName = [user.first_name, user.last_name].filter(Boolean).join(" ").trim() || undefined;
  const stored: StoredCredentials = {
    // Telegram has no access_token concept for the Login Widget — store the user id
    // as the credential so downstream code can DM the user via the bot.
    access_token: String(user.id),
    profile: {
      id: String(user.id),
      username: user.username,
      displayName,
      avatarUrl: user.photo_url,
    },
  };

  try {
    await saveConnection(state.petId, "telegram", stored, {
      telegramUserId: user.id,
      authDate: user.auth_date,
    });
  } catch (e: any) {
    console.error("[oauth/telegram] save failed:", e?.message);
    return NextResponse.json({ ok: false, error: "save_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
