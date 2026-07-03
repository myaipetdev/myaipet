"use client";

/**
 * Home pitch — "why raise, why create, why climb the Season Rewards board".
 *
 * Three live elements stacked:
 *   1. PERSONAL standing bar — current Season Rewards points + free ways to earn
 *      this week. For signed-in users it shows their weekly standing; anonymous:
 *      show pool + top-3 preview to bait the sign-in. (Points are non-financial
 *      loyalty — no payout tied to spend.)
 *
 *   2. LIVE TICKER — last few events (AI creations / NFT mints / pool closes).
 *      Social proof of an active community.
 *
 *   3. PET THOUGHT — a 1-sentence current inner monologue from the user's
 *      pet (or top-rank pet for anons). Refreshes every 4h server-side.
 *      Reminds you the pet is alive and worth checking on.
 *
 * Below: same 4-card How grid as before but with explicit cost/reward.
 */

import { useEffect, useMemo, useState, useRef } from "react";
import { getAuthHeaders } from "@/lib/api";
import { seasonTier } from "@/lib/season";
import Icon from "@/components/Icon";
import Reveal, { MaskedTitle, useInvert } from "@/components/Reveal";

// Two stacked arrows in a 1em mask — parent button/link hover slides the
// second one up (.ed-arrow-swap in globals.css). Presentation only.
function ArrowSwap() {
  return (
    <span className="ed-arrow-swap" aria-hidden>
      <span>
        <span style={{ display: "block", height: "1em", lineHeight: 1 }}>→</span>
        <span style={{ display: "block", height: "1em", lineHeight: 1 }}>→</span>
      </span>
    </span>
  );
}

interface ProjectionData {
  signedIn: boolean;
  started: boolean;
  pool: { points: number; participants: number; closesAtIso: string };
  me?: {
    rank: number; points: number; petId: number | null; petName: string;
    petAvatar: string | null; petLevel: number; pointsToNextRank: number; inTop100: boolean;
  };
  topThree: Array<{ rank: number; petId: number | null; name: string; level: number; avatar: string | null; points: number }>;
}

interface TickerEvent { at: string; kind: string; text: string; accent: string; }

export default function RaisePitch({ onNavigate }: { onNavigate?: (section: string) => void }) {
  const [data, setData] = useState<ProjectionData | null>(null);
  const [ticker, setTicker] = useState<TickerEvent[]>([]);
  const [thought, setThought] = useState<{ text: string; emotion: string; petName: string } | null>(null);
  const [now, setNow] = useState(Date.now());

  const fetchReqRef = useRef(0);
  useEffect(() => {
    // Re-fetch projection + ticker every 60s so the "LIVE · LAST 7 DAYS" strip
    // and pool actually update on a long-open tab instead of being frozen at
    // mount. Request token drops out-of-order/superseded responses.
    const load = () => {
      const reqId = ++fetchReqRef.current;
      fetch("/api/dashboard/projection", { headers: getAuthHeaders(), credentials: "include" })
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (reqId === fetchReqRef.current) setData(d); }).catch(() => {});
      fetch("/api/dashboard/ticker?limit=15")
        .then(r => r.ok ? r.json() : { events: [] })
        .then(d => { if (reqId === fetchReqRef.current) setTicker(d.events || []); }).catch(() => {});
    };
    load();
    const refresh = setInterval(load, 60000);
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => { clearInterval(refresh); clearInterval(id); };
  }, []);

  // Once we know the user's primary pet, fetch its thought
  useEffect(() => {
    const petId = data?.me?.petId ?? data?.topThree?.[0]?.petId;
    const petName = data?.me?.petName ?? data?.topThree?.[0]?.name;
    if (!petId || !petName) return;
    fetch(`/api/pets/${petId}/thought`)
      .then(r => r.ok ? r.json() : null)
      .then(d => d?.thought && setThought({ text: d.thought, emotion: d.emotion, petName }))
      .catch(() => {});
  }, [data]);

  // Countdown — before Season 1 opens this targets the START, once running the END.
  const closesAt = data ? new Date(data.pool.closesAtIso).getTime() : 0;
  const remaining = Math.max(0, closesAt - now);
  const cdDays = Math.floor(remaining / 86_400_000);
  const cdHours = Math.floor((remaining % 86_400_000) / 3_600_000);
  const cdMins = Math.floor((remaining % 3_600_000) / 60_000);
  const seasonStarted = data?.started ?? false;
  const cdLabel = seasonStarted ? "SEASON 1 CLOSES IN" : "SEASON 1 STARTS IN";
  const cdWhen = seasonStarted ? "Aug 1 00:00 UTC" : "Jul 1 00:00 UTC";

  // Show a placeholder until the pool data loads — otherwise the countdown
  // renders a zeroed "00d 00h 00m" for a frame and then jumps to real values.
  const countdownEl = data ? (
    <>{String(cdDays).padStart(2, "0")}<span style={{ color: "rgba(255,255,255,0.4)" }}>d</span> {String(cdHours).padStart(2, "0")}<span style={{ color: "rgba(255,255,255,0.4)" }}>h</span> {String(cdMins).padStart(2, "0")}<span style={{ color: "rgba(255,255,255,0.4)" }}>m</span></>
  ) : (
    <span style={{ color: "rgba(255,255,255,0.5)" }}>—</span>
  );

  const me = data?.me;
  const st = me ? seasonTier(me.points) : null;

  // The page's ONE inversion (E06) — the closing adopt band flips field →
  // terracotta at 60% visibility, and back on scroll-out.
  const invertRef = useInvert();

  return (
    <section style={{ padding: "60px 40px", maxWidth: 1060, margin: "0 auto" }}>
      {/* Headline */}
      <div style={{ textAlign: "center", marginBottom: 30 }}>
        <Reveal dir="fade"><span style={pill}>RAISE TO EARN</span></Reveal>
        <MaskedTitle as="h2" lines={["Your pet earns Season Rewards."]} style={headline} />
        <Reveal dir="fade" delay={120}>
        <p style={sub}>
          Every interaction stacks loyalty points. Raise &amp; create to climb the
          Season 1 leaderboard before it closes.
        </p>
        </Reveal>
      </div>

      {/* ── 1. PERSONAL PROJECTION (the punch) ── */}
      <Reveal dir="pop">
      <div style={{
        background: "linear-gradient(135deg, #1A130C 0%, #211A12 100%)",
        borderRadius: 18, padding: "28px 32px", marginBottom: 18,
        boxShadow: "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))",
        position: "relative", overflow: "hidden",
      }} className="pitch-prize-bar">
        {me ? (
          // ── SIGNED IN: personal Season Rewards standing (by loyalty points) ──
          <div style={{ position: "relative" }}>
            <div style={{
              fontFamily: "var(--ed-m)", fontSize: 13,
              color: "rgba(255,255,255,0.5)", letterSpacing: "0.16em", marginBottom: 6,
            }}>
              {me.petName.toUpperCase()} · RANK #{me.rank} · LV.{me.petLevel}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr", gap: 24, alignItems: "center" }} className="pitch-projection-grid">
              {/* Your real Season Rewards points + rank */}
              <div>
                <div style={miniLabel}>YOUR SEASON 1 POINTS</div>
                <div style={{ ...bigNumber, color: "#F49B2A" }}>
                  {me.points.toLocaleString()}
                  <span style={{ fontSize: 18, color: "rgba(255,255,255,0.55)", marginLeft: 6 }}>pts</span>
                </div>
                <div style={{ ...mini, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <span style={{ color: st ? st.tier.color : "#fff", fontWeight: 700 }}>{st?.tier.emoji} {st?.tier.name}</span>
                  <span style={{ opacity: 0.7 }}>· rank #{me.rank}{me.inTop100 ? " · Top 100" : ""}</span>
                  {st?.next && <span style={{ opacity: 0.7 }}>· {st.toNext.toLocaleString()} to {st.next.name}</span>}
                </div>
              </div>

              {/* How to earn — free, no purchase */}
              <div style={{ borderLeft: "1px solid rgba(255,255,255,0.1)", paddingLeft: 24 }}>
                <div style={miniLabel}>EARN MORE</div>
                <div style={{ ...bigNumber, color: "#7FB069", fontSize: 22 }}>
                  Free
                </div>
                <div style={mini}>
                  care +5 · create +10 · evolve +200
                </div>
              </div>

              {/* Countdown to Season 1 start/close */}
              <div style={{ borderLeft: "1px solid rgba(255,255,255,0.1)", paddingLeft: 24 }}>
                <div style={miniLabel}>{cdLabel}</div>
                <div style={{ ...bigNumber, fontSize: 22, color: "white" }}>
                  {countdownEl}
                </div>
                <div style={mini}>{cdWhen}</div>
              </div>
            </div>

            {/* Next-rank call-out */}
            {me.pointsToNextRank > 0 && (
              <div style={{
                marginTop: 18, padding: "10px 14px", borderRadius: 10,
                background: "rgba(244,155,42,0.08)", border: "1px solid rgba(244,155,42,0.18)",
                display: "flex", alignItems: "center", gap: 12, position: "relative",
              }}>
                <span style={{ fontSize: 18, display: "inline-flex" }}><Icon name="compass" size={18} /></span>
                <div style={{ flex: 1, fontSize: 13, color: "rgba(255,255,255,0.85)", fontFamily: "var(--ed-body)" }}>
                  Just <strong style={{ color: "#F49B2A" }}>{me.pointsToNextRank.toLocaleString()} pts</strong> to rank #{me.rank - 1}. One care session is +5. Keep climbing.
                </div>
                <button onClick={() => onNavigate?.("my pet")} style={{
                  padding: "6px 14px", borderRadius: 8, border: "none",
                  background: "linear-gradient(180deg,#F49B2A,#E27D0C)", color: "#FFF8EE", fontWeight: 700, fontSize: 13, cursor: "pointer",
                  fontFamily: "var(--ed-disp)",
                }}>Raise <ArrowSwap /></button>
              </div>
            )}
          </div>
        ) : (
          // ── ANON: pool + top-3 sneak peek ──
          <div style={{ position: "relative", display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr", gap: 24, alignItems: "center" }} className="pitch-projection-grid">
            <div>
              <div style={miniLabel}>{seasonStarted ? "SEASON 1 · POINTS IN PLAY" : "SEASON 1 · OPENS JUL 1"}</div>
              {seasonStarted ? (
                <>
                  <div style={{ ...bigNumber, color: "#F49B2A" }}>
                    {(data?.pool.points ?? 0).toLocaleString()}
                    <span style={{ fontSize: 18, color: "rgba(255,255,255,0.55)", marginLeft: 6 }}>pts</span>
                  </div>
                  <div style={mini}>{data?.pool.participants ?? 0} raising · grows as players raise &amp; create</div>
                </>
              ) : (
                <>
                  <div style={{ ...bigNumber, color: "#F49B2A", fontSize: 30 }}>Get ready</div>
                  <div style={mini}>Adopt now — every care &amp; creation banks points the moment Season 1 opens.</div>
                </>
              )}
            </div>
            <div style={{ borderLeft: "1px solid rgba(255,255,255,0.1)", paddingLeft: 24 }}>
              <div style={miniLabel}>{cdLabel}</div>
              <div style={{ ...bigNumber, fontSize: 22, color: "white" }}>
                {String(cdDays).padStart(2, "0")}<span style={{ color: "rgba(255,255,255,0.4)" }}>d</span> {String(cdHours).padStart(2, "0")}<span style={{ color: "rgba(255,255,255,0.4)" }}>h</span> {String(cdMins).padStart(2, "0")}<span style={{ color: "rgba(255,255,255,0.4)" }}>m</span>
              </div>
              <div style={mini}>{cdWhen}</div>
            </div>
            <div style={{ borderLeft: "1px solid rgba(255,255,255,0.1)", paddingLeft: 24, textAlign: "right" }}>
              <button onClick={() => onNavigate?.("my pet")} style={{
                padding: "12px 22px", borderRadius: 12, border: "none",
                background: "linear-gradient(180deg,#F49B2A,#E27D0C)", color: "#FFF8EE",
                fontWeight: 700, fontSize: 14, cursor: "pointer",
                fontFamily: "var(--ed-disp)",
                boxShadow: "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))",
              }}>Adopt → Start earning</button>
            </div>
          </div>
        )}
      </div>
      </Reveal>

      {/* ── 2. LIVE TICKER + 3. PET THOUGHT — two-column row: left in from left, right in from right ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 14, marginBottom: 38 }} className="pitch-twin-row">
        {/* Ticker */}
        <Reveal dir="left">
        <div style={{
          background: "#FBF6EC", borderRadius: 14, padding: "16px 18px",
          border: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
          maxHeight: 180, height: "100%", overflow: "hidden", position: "relative",
        }}>
          <div style={{ ...miniLabel, color: "#7A6E5A", marginBottom: 8 }}>LIVE · LAST 7 DAYS</div>
          {ticker.length === 0 ? (
            <div style={{ fontSize: 13, color: "#9A7B4E", fontStyle: "italic", padding: 8 }}>
              Be the first to create with your pet and climb this week&apos;s board.
            </div>
          ) : (
            <div style={{ display: "grid", gap: 6 }}>
              {ticker.slice(0, 5).map((e, i) => (
                <div key={i} style={{
                  display: "flex", alignItems: "center", gap: 10, fontSize: 13,
                  fontFamily: "var(--ed-body)", color: "#211A12",
                }}>
                  <span style={{
                    width: 6, height: 6, borderRadius: 99,
                    background: e.accent, flexShrink: 0,
                  }} />
                  <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {e.text}
                  </span>
                  <span style={{ fontSize: 13, color: "#9A7B4E", fontFamily: "var(--ed-m)" }}>
                    {timeAgo(e.at, now)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
        </Reveal>

        {/* Pet thought */}
        <Reveal dir="right" delay={90}>
        <div style={{
          background: "#F5EFE2",
          borderRadius: 14, padding: "16px 18px", height: "100%",
          border: "1px solid rgba(190,79,40,0.18)",
        }}>
          <div style={{ ...miniLabel, color: "#9A4E1E", marginBottom: 8 }}>
            {thought ? `${thought.petName.toUpperCase()} IS THINKING` : "PET THOUGHTS"}
          </div>
          {thought ? (
            <>
              <div style={{
                fontSize: 14, color: "#211A12", lineHeight: 1.5,
                fontStyle: "italic", fontFamily: "var(--ed-body)",
              }}>
                "{thought.text}"
              </div>
              <button className="ed-wipe" onClick={() => onNavigate?.("my pet")} style={{
                marginTop: 12, padding: "6px 12px", borderRadius: 8,
                border: "1px solid rgba(190,79,40,0.3)", background: "#FBF6EC",
                color: "#9A4E1E", fontSize: 13, fontWeight: 700, cursor: "pointer",
                fontFamily: "var(--ed-disp)",
              }}>Reply <ArrowSwap /></button>
            </>
          ) : (
            <div style={{ fontSize: 13, color: "#9A7B4E", fontStyle: "italic" }}>
              Adopt a pet and it'll share what it's thinking.
            </div>
          )}
        </div>
        </Reveal>
      </div>

      {/* ── HOW grid (content unchanged; cards fly up with a 90ms stagger) ── */}
      <Reveal dir="fade">
      <div style={{ textAlign: "center", marginBottom: 14 }}>
        <span style={{ ...miniLabel, color: "#7A6E5A" }}>HOW TO CLIMB</span>
      </div>
      </Reveal>
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14,
      }} className="pitch-how-grid">
        <Reveal dir="up" delay={0}>
        <PathCard step="01" icon="paw" title="Care daily"
          body="Feed, play, talk. 5 free / day. A 7-day streak earns a Memory NFT (mints at on-chain go-live)."
          earn="+5 pts per care" cta="Start raising"
          onClick={() => onNavigate?.("my pet")} accent="#5C8A4E" />
        </Reveal>
        <Reveal dir="up" delay={90}>
        <PathCard step="02" icon="fire" title="Keep your streak"
          body="Show up daily. A 7-day streak pays a bonus, 30 days pays more — and earns a Memory NFT at on-chain go-live."
          earn="+100 (7d) · +500 (30d)" cta="Check in"
          onClick={() => onNavigate?.("my pet")} accent="#A8432B" />
        </Reveal>
        <Reveal dir="up" delay={180}>
        <PathCard step="03" icon="film-reel" title="Create together"
          body="Generate AI images & videos starring your pet. Every creation stacks Season Rewards points."
          earn="+10 image · +25 video" cta="Create"
          onClick={() => onNavigate?.("create")} accent="#BE4F28" />
        </Reveal>
        <Reveal dir="up" delay={270}>
        <PathCard step="04" icon="trophy" title="Climb leaderboard"
          body="Rank by Season Rewards points. Top raisers earn rewards when Season 1 closes."
          earn="Top 100 = rewards" cta="See ranks"
          onClick={() => onNavigate?.("leaderboard")} accent="#9A4E1E" />
        </Reveal>
      </div>

      {/* ── CLOSING ADOPT PUSH — the page's ONE inversion (E06): field → terracotta
          at 60% visibility, chips flip cream. Copy reuses the real earn values above. ── */}
      <Reveal dir="pop">
      <div
        ref={invertRef}
        className="ed-invert"
        style={{
          marginTop: 34, borderRadius: 22, padding: "46px 30px", textAlign: "center",
          background: "#FBF6EC", color: "#211A12",
          border: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
          boxShadow: "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))",
        }}
      >
        <div style={{
          fontFamily: "var(--ed-m)", fontSize: 13, fontWeight: 700,
          letterSpacing: "0.18em", textTransform: "uppercase", opacity: 0.75, marginBottom: 12,
        }}>
          Season 1 · Raise to Earn
        </div>
        <div style={{
          fontFamily: "var(--ed-disp)", fontSize: "clamp(30px,4.5vw,48px)", fontWeight: 800,
          letterSpacing: "-0.03em", lineHeight: 1.05, marginBottom: 18,
        }}>
          Raise. Create. Climb.
        </div>
        <div style={{ display: "flex", justifyContent: "center", gap: 8, flexWrap: "wrap", marginBottom: 26 }}>
          {["care +5", "create +10", "evolve +200"].map((c) => (
            <span key={c} className="ed-invert-chip" style={{
              fontFamily: "var(--ed-m)", fontSize: 13, fontWeight: 700,
              padding: "6px 14px", borderRadius: 999,
              background: "rgba(190,79,40,0.10)", color: "#9A4E1E",
              border: "1px solid rgba(190,79,40,0.2)",
            }}>{c}</span>
          ))}
        </div>
        <button
          className="ed-invert-chip"
          onClick={() => onNavigate?.("my pet")}
          style={{
            padding: "14px 34px", borderRadius: 12, border: "1px solid transparent", cursor: "pointer",
            background: "#BE4F28", color: "#FCE9CF",
            fontFamily: "var(--ed-disp)", fontSize: 15, fontWeight: 800, letterSpacing: "-0.01em",
          }}
        >
          Adopt <ArrowSwap /> Start earning
        </button>
      </div>
      </Reveal>

      <div style={{
        marginTop: 26, fontSize: 13, color: "#5C5140",
        textAlign: "center", lineHeight: 1.65, fontFamily: "var(--ed-m)",
      }}>
        Points are a non-financial loyalty currency — earned by raising &amp; creating, not bought.
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

function PathCard({ step, icon, title, body, earn, cta, onClick, accent }: {
  step: string; icon: string; title: string; body: string;
  earn: string; cta: string; onClick?: () => void; accent: string;
}) {
  return (
    <div style={{
      padding: "20px 18px", borderRadius: 16, background: "#FBF6EC",
      border: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
      boxShadow: "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))",
      display: "flex", flexDirection: "column", gap: 8, height: "100%",
      transition: "transform 160ms ease, box-shadow 160ms ease",
      cursor: onClick ? "pointer" : "default",
    }}
      onMouseEnter={(e) => { if (onClick) { (e.currentTarget as HTMLDivElement).style.transform = "translateY(-2px)"; (e.currentTarget as HTMLDivElement).style.boxShadow = "var(--ed-shadow-card-hover, 0 26px 50px -24px rgba(80,55,20,.55))"; } }}
      onMouseLeave={(e) => { if (onClick) { (e.currentTarget as HTMLDivElement).style.transform = ""; (e.currentTarget as HTMLDivElement).style.boxShadow = "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))"; } }}
      onClick={onClick}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontFamily: "var(--ed-m)", fontSize: 13, fontWeight: 700, color: "#9A7B4E", letterSpacing: "0.08em" }}>{step}</span>
        <span style={{ fontSize: 22, display: "inline-flex" }}><Icon name={icon} size={22} /></span>
      </div>
      <div style={{ fontSize: 17, fontWeight: 800, color: "#211A12", letterSpacing: "-0.02em", fontFamily: "var(--ed-disp)" }}>{title}</div>
      <div style={{ fontSize: 13, color: "#5C5140", lineHeight: 1.55, fontFamily: "var(--ed-body)" }}>{body}</div>
      <div style={{
        marginTop: 4, padding: "4px 10px", borderRadius: 6,
        background: `${accent}10`, color: accent,
        fontSize: 13, fontFamily: "var(--ed-m)", fontWeight: 700,
        alignSelf: "flex-start", letterSpacing: "0.04em",
      }}>{earn}</div>
      {onClick && (
        <div style={{ marginTop: 6, fontSize: 13, fontWeight: 700, color: accent, display: "flex", alignItems: "center", gap: 4 }}>
          {cta} →
        </div>
      )}
    </div>
  );
}

// ── shared styles ──
const pill: React.CSSProperties = {
  display: "inline-block", padding: "5px 14px", borderRadius: 999,
  background: "rgba(190,79,40,0.10)", color: "#9A4E1E",
  fontSize: 13, fontWeight: 700, letterSpacing: "0.16em",
  textTransform: "uppercase", marginBottom: 14,
  fontFamily: "var(--ed-m)",
};
const headline: React.CSSProperties = {
  fontSize: 42, fontWeight: 800, letterSpacing: "-0.03em",
  margin: "0 0 10px", lineHeight: 1.1, color: "#211A12",
  fontFamily: "var(--ed-disp)",
};
const sub: React.CSSProperties = {
  fontSize: 17, color: "#5C5140", lineHeight: 1.6,
  maxWidth: 580, margin: "0 auto", fontWeight: 500,
  fontFamily: "var(--ed-body)",
};
const miniLabel: React.CSSProperties = {
  fontFamily: "var(--ed-m)", fontSize: 13,
  color: "rgba(255,255,255,0.55)", letterSpacing: "0.16em",
  marginBottom: 6, fontWeight: 700,
};
const mini: React.CSSProperties = {
  fontSize: 13, color: "rgba(255,255,255,0.5)", marginTop: 6,
  fontFamily: "var(--ed-m)",
};
const bigNumber: React.CSSProperties = {
  fontFamily: "var(--ed-disp)",
  fontSize: 38, fontWeight: 800, lineHeight: 1,
};
