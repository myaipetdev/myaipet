"use client";

/**
 * "Why raise a pet? How to earn." — home-page pitch section.
 *
 * Closes the gap that the home page currently has zero copy explaining the
 * BM loop. Sits between Feed and Pricing. Two halves:
 *
 *   1. Big number: weekly Airdrop Points pool — gives users a concrete prize
 *      to chase. Pulled live from /api/cron/distribute-pool (recent week).
 *   2. 4-card "how to earn" grid: Care daily / Train ATK·DEF·SPD / Battle
 *      wins / Climb leaderboard. Each card has a CTA that routes to the
 *      relevant section so the path from "I see the prize" → "here's how" is
 *      one click.
 *
 * Tone matches /dashboard + /architecture: cream, amber accents, JetBrains
 * Mono for protocol-y labels, Space Grotesk for headline copy.
 */

import { useEffect, useState } from "react";

interface PoolSnapshot {
  totalEntries: number;
  poolPoints: number;
  closesAtIso: string;
}

export default function RaisePitch({ onNavigate }: { onNavigate?: (section: string) => void }) {
  const [pool, setPool] = useState<PoolSnapshot | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    // Pull the latest projected pool live from the leaderboard endpoint
    // (battle-pool projection is part of dashboard analytics). Fallback
    // to neutral copy if it fails.
    fetch("/api/dashboard/leaderboard?limit=1")
      .then(r => r.ok ? r.json() : null)
      .catch(() => null);

    // We don't yet expose a single "current pool projection" public endpoint
    // — but admin analytics has it. For the public hero, we compute a
    // friendly approximation client-side from a separate non-auth endpoint
    // below if/when added. For now we show the structural mechanic.
    fetch("/api/cron/distribute-pool")
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        const recent = d?.weeks?.[0];
        if (recent) {
          setPool({
            totalEntries: recent.total_entries || 0,
            poolPoints: recent.pool_usd
              ? Math.round(recent.pool_usd * 1000)
              : Array.isArray(recent.payouts)
                ? recent.payouts.reduce((s: number, p: any) => s + (p.pointsPayout || 0), 0)
                : 0,
            closesAtIso: recent.closed_at,
          });
        }
      })
      .catch(() => {});

    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Countdown to next Sunday 00:00 UTC (when pool closes + new one starts)
  const nextClose = new Date(now);
  const day = nextClose.getUTCDay();
  const daysUntilSunday = (7 - day) % 7 || 7;
  nextClose.setUTCDate(nextClose.getUTCDate() + daysUntilSunday);
  nextClose.setUTCHours(0, 0, 0, 0);
  const remaining = nextClose.getTime() - now;
  const cdDays = Math.max(0, Math.floor(remaining / 86_400_000));
  const cdHours = Math.max(0, Math.floor((remaining % 86_400_000) / 3_600_000));
  const cdMins = Math.max(0, Math.floor((remaining % 3_600_000) / 60_000));

  return (
    <section style={{
      padding: "60px 40px",
      maxWidth: 1060,
      margin: "0 auto",
    }}>
      {/* ─── HEADLINE: Why ─── */}
      <div style={{ textAlign: "center", marginBottom: 38 }}>
        <span style={{
          display: "inline-block", padding: "5px 14px", borderRadius: 999,
          background: "rgba(245,158,11,0.10)", color: "#b45309",
          fontSize: 11, fontWeight: 700, letterSpacing: "0.16em",
          textTransform: "uppercase", marginBottom: 14,
          fontFamily: "'JetBrains Mono', monospace",
        }}>RAISE TO EARN</span>
        <h2 style={{
          fontSize: 42, fontWeight: 800, letterSpacing: "-0.03em",
          margin: "0 0 10px", lineHeight: 1.1, color: "#1a1a2e",
        }}>
          Your pet earns the airdrop.
        </h2>
        <p style={{
          fontSize: 17, color: "rgba(26,26,46,0.65)", lineHeight: 1.6,
          maxWidth: 580, margin: "0 auto", fontWeight: 500,
        }}>
          Every interaction stacks Airdrop Points. Train stats to climb the
          weekly leaderboard. Top-100 pets split the pool every Sunday.
        </p>
      </div>

      {/* ─── PRIZE BAR: Pool + Countdown ─── */}
      <div style={{
        background: "linear-gradient(135deg, #0f0f1a 0%, #1a1a2e 100%)",
        borderRadius: 18,
        padding: "26px 32px",
        marginBottom: 40,
        display: "grid",
        gridTemplateColumns: "1.5fr 1fr 1fr",
        gap: 24,
        alignItems: "center",
        boxShadow: "0 8px 32px rgba(15,15,26,0.18)",
        position: "relative",
        overflow: "hidden",
      }} className="pitch-prize-bar">
        {/* Shimmer */}
        <div style={{
          position: "absolute", inset: 0,
          background: "radial-gradient(circle at 80% 30%, rgba(251,191,36,0.18) 0%, transparent 60%)",
          pointerEvents: "none",
        }} />

        <div style={{ zIndex: 1 }}>
          <div style={{
            fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
            color: "rgba(255,255,255,0.55)", letterSpacing: "0.16em", marginBottom: 6,
          }}>WEEKLY AIRDROP POOL</div>
          <div style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 38, fontWeight: 800, color: "#fbbf24", lineHeight: 1,
          }}>
            {(pool?.poolPoints ?? 100_000).toLocaleString()}
            <span style={{ fontSize: 18, color: "rgba(255,255,255,0.55)", marginLeft: 8 }}>pts</span>
          </div>
          <div style={{
            fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 6,
            fontFamily: "'JetBrains Mono', monospace",
          }}>
            {pool?.totalEntries ?? 0} entries · grows with battle activity
          </div>
        </div>

        <div style={{ zIndex: 1, textAlign: "center" }}>
          <div style={{
            fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
            color: "rgba(255,255,255,0.55)", letterSpacing: "0.16em", marginBottom: 6,
          }}>CLOSES IN</div>
          <div style={{
            fontFamily: "'JetBrains Mono', monospace", fontSize: 24,
            fontWeight: 800, color: "white",
          }}>
            {String(cdDays).padStart(2, "0")}<span style={{ color: "rgba(255,255,255,0.4)" }}>d</span>{" "}
            {String(cdHours).padStart(2, "0")}<span style={{ color: "rgba(255,255,255,0.4)" }}>h</span>{" "}
            {String(cdMins).padStart(2, "0")}<span style={{ color: "rgba(255,255,255,0.4)" }}>m</span>
          </div>
          <div style={{
            fontSize: 10, color: "rgba(255,255,255,0.45)", marginTop: 6,
            fontFamily: "'JetBrains Mono', monospace",
          }}>Sunday 00:00 UTC</div>
        </div>

        <div style={{ zIndex: 1, textAlign: "right" }}>
          <button
            onClick={() => onNavigate?.("leaderboard")}
            style={{
              padding: "12px 22px", borderRadius: 12, border: "none",
              background: "linear-gradient(135deg,#fbbf24,#f59e0b)",
              color: "white", fontWeight: 700, fontSize: 14,
              cursor: "pointer", boxShadow: "0 4px 16px rgba(245,158,11,0.32)",
              fontFamily: "'Space Grotesk',sans-serif",
            }}
          >
            See the Leaderboard →
          </button>
        </div>
      </div>

      {/* ─── HOW: 4-card grid ─── */}
      <div style={{ textAlign: "center", marginBottom: 18 }}>
        <span style={{
          fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
          color: "rgba(26,26,46,0.55)", letterSpacing: "0.16em",
          textTransform: "uppercase", fontWeight: 700,
        }}>HOW TO CLIMB</span>
      </div>

      <div style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        gap: 14,
      }} className="pitch-how-grid">
        <PathCard
          step="01" emoji="🐾" title="Care daily"
          body="Feed, play, talk. 5 free / day. 7-day streak auto-mints a Memory NFT."
          earn="+1–3 pts per click"
          cta="Start raising"
          onClick={() => onNavigate?.("my pet")}
          accent="#16a34a"
        />
        <PathCard
          step="02" emoji="💪" title="Train stats"
          body="Power Training: +5 ATK / DEF / SPD per 1 USDT. Combined power decides rank."
          earn="+0 pts (cost = climb)"
          cta="Train"
          onClick={() => onNavigate?.("my pet")}
          accent="#dc2626"
        />
        <PathCard
          step="03" emoji="⚔️" title="Battle wins"
          body="Deterministic, on-chain seeded combat. 1 free battle / day. Winner takes XP + points."
          earn="+100 pts per win"
          cta="Enter battle"
          onClick={() => onNavigate?.("my pet")}
          accent="#f59e0b"
        />
        <PathCard
          step="04" emoji="🏆" title="Climb leaderboard"
          body="Top-100 by combined power share the pool every Sunday. #1 takes the largest slice."
          earn="Top share = #1 pool"
          cta="See ranks"
          onClick={() => onNavigate?.("leaderboard")}
          accent="#b45309"
        />
      </div>

      {/* Footnote */}
      <div style={{
        marginTop: 26, fontSize: 12, color: "rgba(26,26,46,0.5)",
        textAlign: "center", lineHeight: 1.65,
        fontFamily: "'JetBrains Mono', monospace",
      }}>
        Points are a non-financial loyalty currency. No token mint. Pool sized
        as 1,000 pts per 1 USDT of battle entries in the week.
      </div>

      <style>{`
        @media (max-width: 760px) {
          .pitch-prize-bar { grid-template-columns: 1fr !important; padding: 22px 20px !important; text-align: left !important; }
          .pitch-prize-bar > div { text-align: left !important; }
          .pitch-prize-bar button { width: 100%; }
        }
      `}</style>
    </section>
  );
}

function PathCard({ step, emoji, title, body, earn, cta, onClick, accent }: {
  step: string; emoji: string; title: string; body: string;
  earn: string; cta: string; onClick?: () => void; accent: string;
}) {
  return (
    <div style={{
      padding: "20px 18px", borderRadius: 16, background: "white",
      border: "1px solid rgba(0,0,0,0.06)",
      boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
      display: "flex", flexDirection: "column", gap: 8,
      transition: "transform 160ms ease, box-shadow 160ms ease",
      cursor: onClick ? "pointer" : "default",
    }}
      onMouseEnter={(e) => { if (onClick) { (e.currentTarget as HTMLDivElement).style.transform = "translateY(-2px)"; (e.currentTarget as HTMLDivElement).style.boxShadow = "0 12px 28px rgba(0,0,0,0.10)"; } }}
      onMouseLeave={(e) => { if (onClick) { (e.currentTarget as HTMLDivElement).style.transform = ""; (e.currentTarget as HTMLDivElement).style.boxShadow = "0 2px 8px rgba(0,0,0,0.04)"; } }}
      onClick={onClick}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{
          fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 700,
          color: "rgba(26,26,46,0.4)", letterSpacing: "0.08em",
        }}>{step}</span>
        <span style={{ fontSize: 22 }}>{emoji}</span>
      </div>
      <div style={{
        fontSize: 17, fontWeight: 800, color: "#1a1a2e", letterSpacing: "-0.02em",
      }}>{title}</div>
      <div style={{
        fontSize: 13, color: "rgba(26,26,46,0.6)", lineHeight: 1.55,
      }}>{body}</div>
      <div style={{
        marginTop: 4, padding: "4px 10px", borderRadius: 6,
        background: `${accent}10`, color: accent,
        fontSize: 10, fontFamily: "'JetBrains Mono', monospace",
        fontWeight: 700, alignSelf: "flex-start", letterSpacing: "0.04em",
      }}>{earn}</div>
      {onClick && (
        <div style={{
          marginTop: 6, fontSize: 12, fontWeight: 700, color: accent,
          display: "flex", alignItems: "center", gap: 4,
        }}>
          {cta} <span style={{ transition: "transform 160ms ease" }}>→</span>
        </div>
      )}
    </div>
  );
}
