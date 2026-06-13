"use client";

/**
 * Home pitch — "why spend, why raise, why care about the airdrop".
 *
 * Three live elements stacked:
 *   1. PERSONAL projection bar — "YOU'd earn X pts now · +1 USDT = N ranks"
 *      For signed-in users this is the punch in the face that turns abstract
 *      pool into a concrete payout for THEIR pet. Anonymous: show pool + top-3
 *      preview to bait the sign-in.
 *
 *   2. LIVE TICKER — last few events (upgrades / battle wins / NFT mints).
 *      "0xabc…def trained ATK +5" rolls past. Social proof + FOMO.
 *
 *   3. PET THOUGHT — a 1-sentence current inner monologue from the user's
 *      pet (or top-rank pet for anons). Refreshes every 4h server-side.
 *      Reminds you the pet is alive and worth checking on.
 *
 * Below: same 4-card How grid as before but with explicit cost/reward.
 */

import { useEffect, useMemo, useState } from "react";
import { getAuthHeaders } from "@/lib/api";

interface PetProjection {
  petId: number; name: string; level: number; avatar: string | null;
  combinedPower: number; rank: number; projectedShare: number;
  afterOneUpgrade: { ranksGained: number; newRank: number; newProjectedShare: number; shareDelta: number };
  rival: { name: string; combinedPower: number; powerGap: number; avatar?: string | null } | null;
}

interface ProjectionData {
  signedIn: boolean;
  pool: { points: number; livePoints: number; entries: number; closesAtIso: string };
  pets?: PetProjection[];
  topThree: Array<{ rank: number; name: string; level: number; combinedPower: number; avatar: string | null; projectedShare: number }>;
}

interface TickerEvent { at: string; kind: string; text: string; accent: string; }

export default function RaisePitch({ onNavigate }: { onNavigate?: (section: string) => void }) {
  const [data, setData] = useState<ProjectionData | null>(null);
  const [ticker, setTicker] = useState<TickerEvent[]>([]);
  const [thought, setThought] = useState<{ text: string; emotion: string; petName: string } | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    fetch("/api/dashboard/projection", { headers: getAuthHeaders(), credentials: "include" })
      .then(r => r.ok ? r.json() : null).then(setData).catch(() => {});
    fetch("/api/dashboard/ticker?limit=15")
      .then(r => r.ok ? r.json() : { events: [] }).then(d => setTicker(d.events || [])).catch(() => {});

    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Once we know the user's primary pet, fetch its thought
  useEffect(() => {
    const pet = data?.pets?.[0] ?? data?.topThree?.[0];
    if (!pet) return;
    fetch(`/api/pets/${(pet as any).petId}/thought`)
      .then(r => r.ok ? r.json() : null)
      .then(d => d?.thought && setThought({ text: d.thought, emotion: d.emotion, petName: pet.name }))
      .catch(() => {});
  }, [data]);

  // Countdown
  const closesAt = data ? new Date(data.pool.closesAtIso).getTime() : 0;
  const remaining = Math.max(0, closesAt - now);
  const cdDays = Math.floor(remaining / 86_400_000);
  const cdHours = Math.floor((remaining % 86_400_000) / 3_600_000);
  const cdMins = Math.floor((remaining % 3_600_000) / 60_000);

  const myPet = data?.pets?.[0];

  return (
    <section style={{ padding: "60px 40px", maxWidth: 1060, margin: "0 auto" }}>
      {/* Headline */}
      <div style={{ textAlign: "center", marginBottom: 30 }}>
        <span style={pill}>RAISE TO EARN</span>
        <h2 style={headline}>Your pet earns Season Rewards.</h2>
        <p style={sub}>
          Every interaction stacks loyalty points. Raise &amp; create to climb the
          weekly leaderboard. Top-100 split the pool every Sunday.
        </p>
      </div>

      {/* ── 1. PERSONAL PROJECTION (the punch) ── */}
      <div style={{
        background: "linear-gradient(135deg, #0f0f1a 0%, #1a1a2e 100%)",
        borderRadius: 18, padding: "28px 32px", marginBottom: 18,
        boxShadow: "0 8px 32px rgba(15,15,26,0.22)",
        position: "relative", overflow: "hidden",
      }} className="pitch-prize-bar">
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none",
          background: "radial-gradient(circle at 85% 25%, rgba(251,191,36,0.18) 0%, transparent 55%)",
        }} />

        {myPet ? (
          // ── SIGNED IN: personal projection ──
          <div style={{ position: "relative" }}>
            <div style={{
              fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
              color: "rgba(255,255,255,0.5)", letterSpacing: "0.16em", marginBottom: 6,
            }}>
              {myPet.name.toUpperCase()} · RANK #{myPet.rank} · LV.{myPet.level}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr", gap: 24, alignItems: "center" }} className="pitch-projection-grid">
              {/* Projected share */}
              <div>
                <div style={miniLabel}>YOU'D EARN NOW</div>
                <div style={{ ...bigNumber, color: "#fbbf24" }}>
                  {myPet.projectedShare.toLocaleString()}
                  <span style={{ fontSize: 18, color: "rgba(255,255,255,0.55)", marginLeft: 6 }}>pts</span>
                </div>
                <div style={mini}>
                  if the pool closed at this second
                </div>
              </div>

              {/* +1 USDT effect */}
              <div style={{ borderLeft: "1px solid rgba(255,255,255,0.1)", paddingLeft: 24 }}>
                <div style={miniLabel}>+1 USDT TRAINING</div>
                <div style={{ ...bigNumber, color: "#34d399", fontSize: 22 }}>
                  {myPet.afterOneUpgrade.shareDelta > 0 ? `+${myPet.afterOneUpgrade.shareDelta.toLocaleString()}` : "+0"}
                  <span style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginLeft: 6 }}>pts</span>
                </div>
                <div style={mini}>
                  jumps {myPet.afterOneUpgrade.ranksGained} rank{myPet.afterOneUpgrade.ranksGained === 1 ? "" : "s"} → #{myPet.afterOneUpgrade.newRank}
                </div>
              </div>

              {/* Countdown */}
              <div style={{ borderLeft: "1px solid rgba(255,255,255,0.1)", paddingLeft: 24 }}>
                <div style={miniLabel}>POOL CLOSES IN</div>
                <div style={{ ...bigNumber, fontSize: 22, color: "white" }}>
                  {String(cdDays).padStart(2, "0")}<span style={{ color: "rgba(255,255,255,0.4)" }}>d</span> {String(cdHours).padStart(2, "0")}<span style={{ color: "rgba(255,255,255,0.4)" }}>h</span> {String(cdMins).padStart(2, "0")}<span style={{ color: "rgba(255,255,255,0.4)" }}>m</span>
                </div>
                <div style={mini}>Sunday 00:00 UTC</div>
              </div>
            </div>

            {/* Rival call-out */}
            {myPet.rival && (
              <div style={{
                marginTop: 18, padding: "10px 14px", borderRadius: 10,
                background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.18)",
                display: "flex", alignItems: "center", gap: 12, position: "relative",
              }}>
                <span style={{ fontSize: 18 }}>🎯</span>
                <div style={{ flex: 1, fontSize: 13, color: "rgba(255,255,255,0.85)", fontFamily: "'Space Grotesk',sans-serif" }}>
                  <strong style={{ color: "#fbbf24" }}>{myPet.rival.name}</strong> is just {myPet.rival.powerGap} power ahead. Train {Math.ceil(myPet.rival.powerGap / 5)} time{myPet.rival.powerGap > 5 ? "s" : ""} to overtake.
                </div>
                <button onClick={() => onNavigate?.("my pet")} style={{
                  padding: "6px 14px", borderRadius: 8, border: "none",
                  background: "#fbbf24", color: "#1a1a2e", fontWeight: 700, fontSize: 12, cursor: "pointer",
                  fontFamily: "'Space Grotesk',sans-serif",
                }}>Train →</button>
              </div>
            )}
          </div>
        ) : (
          // ── ANON: pool + top-3 sneak peek ──
          <div style={{ position: "relative", display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr", gap: 24, alignItems: "center" }} className="pitch-projection-grid">
            <div>
              <div style={miniLabel}>WEEKLY REWARD POOL</div>
              <div style={{ ...bigNumber, color: "#fbbf24" }}>
                {(data?.pool.points ?? 100_000).toLocaleString()}
                <span style={{ fontSize: 18, color: "rgba(255,255,255,0.55)", marginLeft: 6 }}>pts</span>
              </div>
              <div style={mini}>{data?.pool.entries ?? 0} entries · grows as players raise &amp; create</div>
            </div>
            <div style={{ borderLeft: "1px solid rgba(255,255,255,0.1)", paddingLeft: 24 }}>
              <div style={miniLabel}>CLOSES IN</div>
              <div style={{ ...bigNumber, fontSize: 22, color: "white" }}>
                {String(cdDays).padStart(2, "0")}<span style={{ color: "rgba(255,255,255,0.4)" }}>d</span> {String(cdHours).padStart(2, "0")}<span style={{ color: "rgba(255,255,255,0.4)" }}>h</span> {String(cdMins).padStart(2, "0")}<span style={{ color: "rgba(255,255,255,0.4)" }}>m</span>
              </div>
              <div style={mini}>Sunday 00:00 UTC</div>
            </div>
            <div style={{ borderLeft: "1px solid rgba(255,255,255,0.1)", paddingLeft: 24, textAlign: "right" }}>
              <button onClick={() => onNavigate?.("my pet")} style={{
                padding: "12px 22px", borderRadius: 12, border: "none",
                background: "linear-gradient(135deg,#fbbf24,#f59e0b)", color: "white",
                fontWeight: 700, fontSize: 14, cursor: "pointer",
                boxShadow: "0 4px 16px rgba(245,158,11,0.32)",
              }}>Adopt → Start earning</button>
            </div>
          </div>
        )}
      </div>

      {/* ── 2. LIVE TICKER + 3. PET THOUGHT ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 14, marginBottom: 38 }} className="pitch-twin-row">
        {/* Ticker */}
        <div style={{
          background: "white", borderRadius: 14, padding: "16px 18px",
          border: "1px solid rgba(0,0,0,0.06)",
          maxHeight: 180, overflow: "hidden", position: "relative",
        }}>
          <div style={{ ...miniLabel, color: "rgba(26,26,46,0.5)", marginBottom: 8 }}>LIVE · LAST 7 DAYS</div>
          {ticker.length === 0 ? (
            <div style={{ fontSize: 13, color: "rgba(26,26,46,0.45)", fontStyle: "italic", padding: 8 }}>
              No activity yet — be the first to train, create, or mint a streak.
            </div>
          ) : (
            <div style={{ display: "grid", gap: 6 }}>
              {ticker.slice(0, 5).map((e, i) => (
                <div key={i} style={{
                  display: "flex", alignItems: "center", gap: 10, fontSize: 12,
                  fontFamily: "'Space Grotesk',sans-serif", color: "#1a1a2e",
                }}>
                  <span style={{
                    width: 6, height: 6, borderRadius: 99,
                    background: e.accent, flexShrink: 0,
                  }} />
                  <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {e.text}
                  </span>
                  <span style={{ fontSize: 10, color: "rgba(26,26,46,0.4)", fontFamily: "'JetBrains Mono', monospace" }}>
                    {timeAgo(e.at, now)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pet thought */}
        <div style={{
          background: "linear-gradient(135deg, rgba(245,158,11,0.06), rgba(168,85,247,0.04))",
          borderRadius: 14, padding: "16px 18px",
          border: "1px solid rgba(245,158,11,0.18)",
        }}>
          <div style={{ ...miniLabel, color: "rgba(26,26,46,0.5)", marginBottom: 8 }}>
            {thought ? `${thought.petName.toUpperCase()} IS THINKING` : "PET THOUGHTS"}
          </div>
          {thought ? (
            <>
              <div style={{
                fontSize: 14, color: "#1a1a2e", lineHeight: 1.5,
                fontStyle: "italic", fontFamily: "'Space Grotesk',sans-serif",
              }}>
                "{thought.text}"
              </div>
              <button onClick={() => onNavigate?.("my pet")} style={{
                marginTop: 12, padding: "6px 12px", borderRadius: 8,
                border: "1px solid rgba(245,158,11,0.3)", background: "white",
                color: "#b45309", fontSize: 11, fontWeight: 700, cursor: "pointer",
                fontFamily: "'Space Grotesk',sans-serif",
              }}>Reply →</button>
            </>
          ) : (
            <div style={{ fontSize: 13, color: "rgba(26,26,46,0.45)", fontStyle: "italic" }}>
              Adopt a pet and it'll share what it's thinking.
            </div>
          )}
        </div>
      </div>

      {/* ── HOW grid (unchanged, kept tight) ── */}
      <div style={{ textAlign: "center", marginBottom: 14 }}>
        <span style={{ ...miniLabel, color: "rgba(26,26,46,0.55)" }}>HOW TO CLIMB</span>
      </div>
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14,
      }} className="pitch-how-grid">
        <PathCard step="01" emoji="🐾" title="Care daily"
          body="Feed, play, talk. 5 free / day. 7-day streak auto-mints a Memory NFT."
          earn="+1–3 pts per click" cta="Start raising"
          onClick={() => onNavigate?.("my pet")} accent="#16a34a" />
        <PathCard step="02" emoji="💪" title="Train stats"
          body="Power Training: +5 ATK / DEF / SPD per 1 USDT. Combined power decides rank."
          earn="+0 pts (cost = climb)" cta="Train"
          onClick={() => onNavigate?.("my pet")} accent="#dc2626" />
        <PathCard step="03" emoji="🎬" title="Create together"
          body="Generate AI images & videos starring your pet. Every creation stacks Season Rewards points."
          earn="+10 image · +25 video" cta="Create"
          onClick={() => onNavigate?.("create")} accent="#f59e0b" />
        <PathCard step="04" emoji="🏆" title="Climb leaderboard"
          body="Top-100 by combined power share the pool every Sunday. #1 takes the largest slice."
          earn="Top share = #1 pool" cta="See ranks"
          onClick={() => onNavigate?.("leaderboard")} accent="#b45309" />
      </div>

      <div style={{
        marginTop: 26, fontSize: 12, color: "rgba(26,26,46,0.5)",
        textAlign: "center", lineHeight: 1.65, fontFamily: "'JetBrains Mono', monospace",
      }}>
        Points are a non-financial loyalty currency. Pool sized relative to weekly USDT credit spend.
      </div>

      <style>{`
        @media (max-width: 760px) {
          .pitch-prize-bar { padding: 22px 20px !important; }
          .pitch-projection-grid { grid-template-columns: 1fr !important; gap: 16px !important; }
          .pitch-projection-grid > div { border-left: none !important; padding-left: 0 !important; text-align: left !important; }
          .pitch-twin-row { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </section>
  );
}

// ── helpers ──

function timeAgo(iso: string, nowMs: number): string {
  const diff = nowMs - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
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
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 700, color: "rgba(26,26,46,0.4)", letterSpacing: "0.08em" }}>{step}</span>
        <span style={{ fontSize: 22 }}>{emoji}</span>
      </div>
      <div style={{ fontSize: 17, fontWeight: 800, color: "#1a1a2e", letterSpacing: "-0.02em" }}>{title}</div>
      <div style={{ fontSize: 13, color: "rgba(26,26,46,0.6)", lineHeight: 1.55 }}>{body}</div>
      <div style={{
        marginTop: 4, padding: "4px 10px", borderRadius: 6,
        background: `${accent}10`, color: accent,
        fontSize: 10, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700,
        alignSelf: "flex-start", letterSpacing: "0.04em",
      }}>{earn}</div>
      {onClick && (
        <div style={{ marginTop: 6, fontSize: 12, fontWeight: 700, color: accent, display: "flex", alignItems: "center", gap: 4 }}>
          {cta} →
        </div>
      )}
    </div>
  );
}

// ── shared styles ──
const pill: React.CSSProperties = {
  display: "inline-block", padding: "5px 14px", borderRadius: 999,
  background: "rgba(245,158,11,0.10)", color: "#b45309",
  fontSize: 11, fontWeight: 700, letterSpacing: "0.16em",
  textTransform: "uppercase", marginBottom: 14,
  fontFamily: "'JetBrains Mono', monospace",
};
const headline: React.CSSProperties = {
  fontSize: 42, fontWeight: 800, letterSpacing: "-0.03em",
  margin: "0 0 10px", lineHeight: 1.1, color: "#1a1a2e",
};
const sub: React.CSSProperties = {
  fontSize: 17, color: "rgba(26,26,46,0.65)", lineHeight: 1.6,
  maxWidth: 580, margin: "0 auto", fontWeight: 500,
};
const miniLabel: React.CSSProperties = {
  fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
  color: "rgba(255,255,255,0.55)", letterSpacing: "0.16em",
  marginBottom: 6, fontWeight: 700,
};
const mini: React.CSSProperties = {
  fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 6,
  fontFamily: "'JetBrains Mono', monospace",
};
const bigNumber: React.CSSProperties = {
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: 38, fontWeight: 800, lineHeight: 1,
};
