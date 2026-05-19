"use client";

/**
 * Telegram Login Widget host page.
 *
 * Telegram doesn't do classic OAuth — it uses a Login Widget that calls a
 * window function with HMAC-signed user data. The widget is injected as a
 * script tag. After the user authorizes, the callback `onTelegramAuth(user)`
 * POSTs the data to /api/auth/oauth/telegram/callback for verification.
 *
 * For full activation, server admin must:
 *   1. Create a bot via @BotFather
 *   2. Set TELEGRAM_BOT_USERNAME + TELEGRAM_BOT_TOKEN env
 *   3. Configure the bot domain to point to this site
 */

import { useEffect, useState } from "react";

export default function TelegramWidget() {
  const [state, setState] = useState<string | null>(null);
  const [bot, setBot] = useState<string | null>(null);

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    setState(sp.get("state"));
    setBot(sp.get("bot"));
  }, []);

  useEffect(() => {
    if (!bot) return;
    (window as any).onTelegramAuth = async (user: any) => {
      // Send signed data to callback for HMAC verification + persist
      const res = await fetch(`/api/auth/oauth/telegram/callback?state=${encodeURIComponent(state || "")}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(user),
      });
      const d = await res.json().catch(() => ({}));
      if (d?.ok) {
        window.location.href = "/sovereignty?connected=telegram";
      } else {
        window.location.href = `/sovereignty?oauth_error=${encodeURIComponent(d?.error || "telegram_failed")}`;
      }
    };
    // Inject Telegram Login Widget
    const s = document.createElement("script");
    s.src = "https://telegram.org/js/telegram-widget.js?22";
    s.async = true;
    s.setAttribute("data-telegram-login", bot);
    s.setAttribute("data-size", "large");
    s.setAttribute("data-onauth", "onTelegramAuth(user)");
    s.setAttribute("data-request-access", "write");
    document.getElementById("tg-mount")?.appendChild(s);
  }, [bot, state]);

  if (!bot) {
    return (
      <Wrap>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: "#1a1a2e" }}>Telegram OAuth not configured</h2>
        <p style={{ color: "rgba(26,26,46,0.65)", fontSize: 14, marginTop: 8, lineHeight: 1.6 }}>
          Server admin must set TELEGRAM_BOT_USERNAME (and TELEGRAM_BOT_TOKEN
          for callback verification). Once configured, the Login Widget
          appears here automatically.
        </p>
      </Wrap>
    );
  }

  return (
    <Wrap>
      <h2 style={{ fontSize: 22, fontWeight: 700, color: "#1a1a2e", marginBottom: 6 }}>
        Connect Telegram
      </h2>
      <p style={{ color: "rgba(26,26,46,0.65)", fontSize: 14, marginBottom: 18, lineHeight: 1.55 }}>
        Tap below — Telegram will ask once, then your pet can DM you.
      </p>
      <div id="tg-mount" style={{ minHeight: 60 }} />
      <a href="/sovereignty" style={{
        display: "inline-block", marginTop: 24, fontSize: 13,
        color: "rgba(26,26,46,0.55)", textDecoration: "none",
      }}>← Cancel</a>
    </Wrap>
  );
}

function Wrap({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      minHeight: "100vh", background: "#faf7f2",
      fontFamily: "'Space Grotesk',sans-serif",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
    }}>
      <div style={{
        maxWidth: 440, width: "100%",
        padding: 36, borderRadius: 24,
        background: "white", border: "1px solid rgba(0,0,0,0.06)",
        boxShadow: "0 20px 50px rgba(0,0,0,0.08)",
        textAlign: "center",
      }}>{children}</div>
    </div>
  );
}
