"use client";

/**
 * Home pitch — "why raise, why create, why climb the Season 1 board".
 *
 * One composed Collectible Editorial spread:
 *   1. FOUNDING STANDING panel (dark) — real pool points / raisers / top raisers.
 *      Season 1 opens WITH the public launch: until the founder schedules it
 *      (SEASON_SCHEDULED === false) the phase cell says "STARTING SOON" and NO
 *      date/countdown is ever rendered (the sentinel window would fabricate one).
 *      Once scheduled: countdown TO THE START while upcoming, to the close while
 *      live, frozen standings after. Points earned pre-start are honest
 *      pre-season points that carry into Season 1 — said wherever they show.
 *   2. LIVE TICKER + PET THOUGHT — proof the world is alive.
 *   3. Four CLIMB TILES — one glyph + one big point number each, minimal prose.
 *   4. Raise. Create. Climb. band (the page's one inversion) + printed
 *      compliance footnote (non-financial loyalty score — verbatim, ≥12px).
 */

import { useEffect, useState, useRef } from "react";
import { getAuthHeaders } from "@/lib/api";
import { seasonTier, seasonPhase, SEASON_SCHEDULED, SEASON_START_MS, SEASON_END_MS } from "@/lib/season";
import { pluralize } from "@/lib/pluralize";
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
  seasonClosed: boolean;
  final?: boolean;
  pool: { points: number; participants: number; closesAtIso: string };
  me?: {
    rank: number; points: number; petId: number | null; petName: string;
    petAvatar: string | null; petLevel: number; pointsToNextRank: number; inTop100: boolean;
  };
  topThree: Array<{ rank: number; petId: number | null; name: string; level: number; avatar: string | null; points: number }>;
}

interface TickerEvent { at: string; kind: string; text: string; accent: string; }

/** "Aug 1 · 00:00 UTC" from epoch ms — only ever called when SEASON_SCHEDULED. */
function fmtUtc(ms: number): string {
  const d = new Date(ms);
  const mon = d.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${mon} ${d.getUTCDate()} · ${hh}:${mm} UTC`;
}

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

  // Once we know the user's primary pet, fetch its thought.
  // Owner-only endpoint: only fetch for a signed-in user's own pet — guests
  // (and the top-rank preview pet) would 403 + log a console error otherwise.
  useEffect(() => {
    if (!data?.signedIn) return;
    const petId = data?.me?.petId;
    const petName = data?.me?.petName;
    if (!petId || !petName) return;
    fetch(`/api/pets/${petId}/thought`, { headers: getAuthHeaders() })
      .then(r => r.ok ? r.json() : null)
      .then(d => d?.thought && setThought({ text: d.thought, emotion: d.emotion, petName }))
      .catch(() => {});
  }, [data]);

  // ── Season phase — derived from lib/season constants (same NEXT_PUBLIC env
  // the server reads), never from the sentinel-tainted pool.closesAtIso.
  // UI LAW: while SEASON_SCHEDULED is false, NO date and NO countdown exist.
  const phase = seasonPhase(now);
  const preSeason = phase === "upcoming"; // includes the unscheduled state
  const seasonClosed = phase === "ended";

  // Real countdown — TO THE START while upcoming, to the close while live.
  const cdTarget = preSeason ? SEASON_START_MS : SEASON_END_MS;
  const remaining = Math.max(0, cdTarget - now);
  const cdDays = Math.floor(remaining / 86_400_000);
  const cdHours = Math.floor((remaining % 86_400_000) / 3_600_000);
  const cdMins = Math.floor((remaining % 3_600_000) / 60_000);

  // Phase cell for the dark panel — replaces the old "SEASON 1 CLOSES IN" cell.
  // While unscheduled it is a STARTING SOON badge (no numbers to fabricate).
  const phaseCell = seasonClosed ? (
    <>
      <div style={miniLabel}>SEASON 1 STATUS</div>
      <div style={{ ...bigNumber, fontSize: 22, color: "#E8C77E" }}>FINAL</div>
      <div style={mini}>{data?.final ? "Final standings frozen" : "Final standings being confirmed"}</div>
    </>
  ) : !SEASON_SCHEDULED ? (
    <>
      <div style={miniLabel}>SEASON 1</div>
      <div style={{
        fontFamily: "var(--ed-m)", fontSize: 18, fontWeight: 700,
        letterSpacing: "0.12em", color: "#E8C77E", lineHeight: 1.2,
      }}>STARTING<br />SOON</div>
      <div style={mini}>Opens with launch · points carry over</div>
    </>
  ) : (
    <>
      <div style={miniLabel}>{preSeason ? "SEASON 1 OPENS IN" : "SEASON 1 CLOSES IN"}</div>
      <div style={{ ...bigNumber, fontSize: 22, color: "white" }}>
        {String(cdDays).padStart(2, "0")}<span style={{ color: "rgba(255,255,255,0.4)" }}>d</span>{" "}
        {String(cdHours).padStart(2, "0")}<span style={{ color: "rgba(255,255,255,0.4)" }}>h</span>{" "}
        {String(cdMins).padStart(2, "0")}<span style={{ color: "rgba(255,255,255,0.4)" }}>m</span>
      </div>
      <div style={mini}>{fmtUtc(cdTarget)}</div>
    </>
  );

  const me = data?.me;
  const st = me ? seasonTier(me.points) : null;
  const participants = data?.pool.participants ?? 0;

  // The page's ONE inversion (E06) — the closing adopt band flips field →
  // terracotta at 60% visibility, and back on scroll-out.
  const invertRef = useInvert();

  return (
    <section style={{ padding: "52px 40px", maxWidth: 1060, margin: "0 auto" }}>
      {/* Headline */}
      <div style={{ textAlign: "center", marginBottom: 22 }}>
        <Reveal dir="fade">
          <span style={pill}>
            {seasonClosed ? "SEASON 1 · FINAL" : preSeason ? "SEASON 1 · STARTING SOON" : "SEASON 1 · LIVE"}
          </span>
        </Reveal>
        <MaskedTitle as="h2" lines={[
          seasonClosed ? "Season 1 final standings."
            : preSeason ? "Get on the board before Season 1 opens."
            : "Your pet climbs the Season 1 board.",
        ]} style={headline} />
        <Reveal dir="fade" delay={120}>
        <p style={sub}>
          {seasonClosed
            ? "Season 1 is closed. Results are recognition only — no token, cash value, or payout."
            : preSeason
            ? "Every point you earn now is a pre-season point — it carries straight into Season 1."
            : "Care, create, level up — every action stacks points on the Season 1 board."}
        </p>
        </Reveal>
      </div>

      {/* ── 1. FOUNDING STANDING panel (the punch) ── */}
      <Reveal dir="pop">
      <div style={{
        background: "linear-gradient(135deg, #1A130C 0%, #211A12 100%)",
        borderRadius: 18, padding: "26px 30px", marginBottom: 10,
        boxShadow: "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))",
        position: "relative", overflow: "hidden",
      }} className="pitch-prize-bar">
        {me ? (
          // ── SIGNED IN: personal standing (real loyalty points) ──
          <div style={{ position: "relative" }}>
            <div style={{
              display: "flex", alignItems: "center", gap: 10, marginBottom: 8,
            }}>
              {me.petAvatar && (
                <img src={me.petAvatar} alt={me.petName} width={34} height={34} style={{
                  borderRadius: 10, objectFit: "cover", border: "1px solid rgba(255,255,255,0.2)",
                }} />
              )}
              <div style={{
                fontFamily: "var(--ed-m)", fontSize: 13,
                color: "rgba(255,255,255,0.5)", letterSpacing: "0.16em",
              }}>
                {me.petName.toUpperCase()} · {preSeason ? "FOUNDING RAISER" : "RANK"} #{me.rank} · LV.{me.petLevel}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr", gap: 24, alignItems: "center" }} className="pitch-projection-grid">
              {/* Your real points — pre-start they are pre-season, carrying over */}
              <div>
                <div style={miniLabel}>
                  {seasonClosed ? "YOUR FINAL SEASON 1 POINTS" : preSeason ? "YOUR PRE-SEASON POINTS" : "YOUR SEASON 1 POINTS"}
                </div>
                <div style={{ ...bigNumber, color: "#F49B2A" }}>
                  {me.points.toLocaleString()}
                  <span style={{ fontSize: 18, color: "rgba(255,255,255,0.55)", marginLeft: 6 }}>pts</span>
                </div>
                <div style={{ ...mini, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <span style={{ color: st ? st.tier.color : "#fff", fontWeight: 700 }}>{st?.tier.emoji} {st?.tier.name}</span>
                  {preSeason
                    ? <span style={{ opacity: 0.7 }}>· carry into Season 1</span>
                    : <span style={{ opacity: 0.7 }}>· rank #{me.rank}{me.inTop100 ? " · Top 100" : ""}</span>}
                  {st?.next && <span style={{ opacity: 0.7 }}>· {st.toNext.toLocaleString()} to {st.next.name}</span>}
                </div>
              </div>

              {/* How to climb — free, no purchase */}
              <div style={{ borderLeft: "1px solid rgba(255,255,255,0.1)", paddingLeft: 24 }}>
                <div style={miniLabel}>CLIMB FASTER</div>
                <div style={{ ...bigNumber, color: "#7FB069", fontSize: 22 }}>
                  Free
                </div>
                <div style={mini}>+5 care · +10–20 create · +50 level</div>
              </div>

              {/* Season phase — STARTING SOON badge or a real countdown */}
              <div style={{ borderLeft: "1px solid rgba(255,255,255,0.1)", paddingLeft: 24 }}>
                {phaseCell}
              </div>
            </div>

            {/* Next-rank call-out */}
            {!seasonClosed && me.pointsToNextRank > 0 && (
              <div style={{
                marginTop: 16, padding: "10px 14px", borderRadius: 10,
                background: "rgba(244,155,42,0.08)", border: "1px solid rgba(244,155,42,0.18)",
                display: "flex", alignItems: "center", gap: 12, position: "relative",
              }}>
                <span style={{ fontSize: 18, display: "inline-flex" }}><Icon name="compass" size={18} /></span>
                <div style={{ flex: 1, fontSize: 13, color: "rgba(255,255,255,0.85)", fontFamily: "var(--ed-body)" }}>
                  Just <strong style={{ color: "#F49B2A" }}>{me.pointsToNextRank.toLocaleString()} pts</strong> to rank #{me.rank - 1}. One care session is +5. Keep climbing.
                </div>
                <button onClick={() => onNavigate?.("my pet")} style={{
                  padding: "6px 14px", borderRadius: 8, border: "none",
                  background: "linear-gradient(180deg,#F49B2A,#E27D0C)", color: "#211A12", fontWeight: 700, fontSize: 13, cursor: "pointer",
                  fontFamily: "var(--ed-disp)",
                }}>Raise <ArrowSwap /></button>
              </div>
            )}
          </div>
        ) : (
          // ── ANON: real pool + founding raisers + top-3 sneak peek ──
          <div style={{ position: "relative", display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr", gap: 24, alignItems: "center" }} className="pitch-projection-grid">
            <div>
              <div style={miniLabel}>
                {seasonClosed ? "SEASON 1 · FINAL POINTS" : preSeason ? "FOUNDING RAISERS · PRE-SEASON POOL" : "SEASON 1 · POINTS IN PLAY"}
              </div>
              {data ? (
                <>
                  <div style={{ ...bigNumber, color: "#F49B2A" }}>
                    {(data.pool.points ?? 0).toLocaleString()}
                    <span style={{ fontSize: 18, color: "rgba(255,255,255,0.55)", marginLeft: 6 }}>pts</span>
                  </div>
                  <div style={mini}>
                    {participants} {pluralize(participants, "raiser")} ·{" "}
                    {seasonClosed ? "season total"
                      : preSeason ? "on the board before Season 1 opens — points carry in"
                      : "grows as players raise & create"}
                  </div>
                </>
              ) : (
                // Pool still loading — placeholder, never a fake/zeroed total.
                <>
                  <div style={{ ...bigNumber, color: "rgba(255,255,255,0.35)" }}>—</div>
                  <div style={mini}>Loading the live pool…</div>
                </>
              )}
            </div>
            <div style={{ borderLeft: "1px solid rgba(255,255,255,0.1)", paddingLeft: 24 }}>
              {phaseCell}
            </div>
            <div style={{ borderLeft: "1px solid rgba(255,255,255,0.1)", paddingLeft: 24 }}>
              <div style={miniLabel}>
                {seasonClosed ? "FINAL TOP RAISERS" : preSeason ? "FOUNDING RAISERS" : "TOP RAISERS"}
              </div>
              {(data?.topThree?.length ? data.topThree.slice(0, 3) : []).map((t) => (
                <div key={t.rank} style={{ display: "flex", alignItems: "baseline", gap: 8, fontFamily: "var(--ed-m)", fontSize: 13, color: "rgba(255,255,255,0.8)", marginTop: 4 }}>
                  <span style={{ color: "#F49B2A", fontWeight: 700 }}>#{t.rank}</span>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 120 }}>{t.name}</span>
                  <span style={{ marginLeft: "auto", color: "rgba(255,255,255,0.55)" }}>{t.points.toLocaleString()} pts</span>
                </div>
              ))}
              {!data?.topThree?.length && (
                <div style={mini}>Adopt below — be founding raiser #1.</div>
              )}
            </div>
          </div>
        )}
      </div>
      </Reveal>

      {/* ── 2. LIVE TICKER + 3. PET THOUGHT — two-column row ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 10, marginBottom: 26 }} className="pitch-twin-row">
        {/* Ticker */}
        <Reveal dir="left">
        <div style={{
          background: "#FBF6EC", borderRadius: 14, padding: "14px 18px",
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
          borderRadius: 14, padding: "14px 18px", height: "100%",
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

      {seasonClosed ? (
        <Reveal dir="pop">
          <div style={{
            marginTop: 10, borderRadius: 18, padding: "30px 26px", textAlign: "center",
            background: "#FBF6EC", border: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
            boxShadow: "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))",
          }}>
            <div style={{ ...miniLabel, color: "#9A4E1E", marginBottom: 10 }}>SEASON 1 · CLOSED</div>
            <div style={{ fontFamily: "var(--ed-disp)", fontSize: 26, fontWeight: 800, color: "#211A12", marginBottom: 8 }}>
              The board is final.
            </div>
            <p style={{ ...sub, fontSize: 14, marginBottom: 18 }}>
              New care and creations no longer change Season 1 standings. You can keep raising your pet while the next season is prepared.
            </p>
            <button onClick={() => onNavigate?.("season")} style={{
              padding: "11px 20px", borderRadius: 10, border: "none", cursor: "pointer",
              background: "#BE4F28", color: "#FFF8EE", fontFamily: "var(--ed-disp)", fontWeight: 800,
            }}>
              View final standings <ArrowSwap />
            </button>
          </div>
        </Reveal>
      ) : (
      <>
      {/* ── CLIMB TILES — one glyph, one big point number, one line ── */}
      <Reveal dir="fade">
      <div style={{ textAlign: "center", marginBottom: 12 }}>
        <span style={{ ...miniLabel, color: "#7A6E5A" }}>HOW TO CLIMB</span>
      </div>
      </Reveal>
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12,
      }} className="pitch-how-grid">
        <Reveal dir="up" delay={0}>
        <ClimbTile step="01" icon="paw" value="+5" unit="pts per care" title="Care daily"
          line="Feed, play, talk — 5 free a day." cta="Start raising"
          onClick={() => onNavigate?.("my pet")} accent="#5C8A4E" />
        </Reveal>
        <Reveal dir="up" delay={90}>
        <ClimbTile step="02" icon="fire" value="+5→+50" unit="daily streak ladder" title="Keep the streak"
          line="Show up daily — the bonus climbs." cta="Check in"
          onClick={() => document.getElementById("daily-checkin")?.scrollIntoView({ behavior: "smooth", block: "center" })} accent="#A8432B" />
        </Reveal>
        <Reveal dir="up" delay={180}>
        <ClimbTile step="03" icon="film-reel" value="+10·+20" unit="image · video" title="Create together"
          line="AI scenes starring your pet." cta="Create"
          onClick={() => onNavigate?.("create")} accent="#BE4F28" />
        </Reveal>
        <Reveal dir="up" delay={270}>
        <ClimbTile step="04" icon="trophy" value="TOP 100" unit="final board" title="Climb the board"
          line="Standings freeze when Season 1 closes." cta="See ranks"
          onClick={() => onNavigate?.("season")} accent="#9A4E1E" />
        </Reveal>
      </div>

      {/* ── CLOSING ADOPT PUSH — the page's ONE inversion (E06): field → terracotta
          at 60% visibility, chips flip cream. Chips reuse the real earn values. ── */}
      <Reveal dir="pop">
      <div
        ref={invertRef}
        className="ed-invert"
        style={{
          marginTop: 26, borderRadius: 22, padding: "40px 30px", textAlign: "center",
          background: "#FBF6EC", color: "#211A12",
          border: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
          boxShadow: "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))",
        }}
      >
        <div style={{
          fontFamily: "var(--ed-m)", fontSize: 13, fontWeight: 700,
          letterSpacing: "0.18em", textTransform: "uppercase", opacity: 0.75, marginBottom: 12,
        }}>
          {preSeason ? "Season 1 · Founding Raisers" : "Season 1 · Raise & Climb"}
        </div>
        <div style={{
          fontFamily: "var(--ed-disp)", fontSize: "clamp(30px,4.5vw,48px)", fontWeight: 800,
          letterSpacing: "-0.03em", lineHeight: 1.05, marginBottom: 20,
        }}>
          Raise. Create. Climb.
        </div>
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 24 }}>
          {[
            { icon: "paw", label: "CARE", val: "+5", tilt: -2 },
            { icon: "film-reel", label: "CREATE", val: "+10–20", tilt: 1.5 },
            { icon: "sparkling", label: "LEVEL UP", val: "+50", tilt: -1 },
          ].map((c) => (
            <span key={c.label} className="ed-invert-chip" style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              fontFamily: "var(--ed-m)", fontSize: 13, fontWeight: 700,
              padding: "8px 16px", borderRadius: 999,
              background: "rgba(190,79,40,0.10)", color: "#9A4E1E",
              border: "1px solid rgba(190,79,40,0.2)",
              transform: `rotate(${c.tilt}deg)`,
            }}>
              <Icon name={c.icon} size={18} />
              <span style={{ letterSpacing: "0.08em" }}>{c.label}</span>
              <span style={{ fontSize: 16 }}>{c.val}</span>
            </span>
          ))}
        </div>
        {preSeason && (
          <div style={{ fontSize: 14, fontFamily: "var(--ed-body)", opacity: 0.85, marginBottom: 18 }}>
            Adopt now — every point you earn carries into Season 1.
          </div>
        )}
        <button
          className="ed-invert-chip"
          onClick={() => onNavigate?.("my pet")}
          style={{
            padding: "14px 34px", borderRadius: 12, border: "1px solid transparent", cursor: "pointer",
            background: "#BE4F28", color: "#FCE9CF",
            fontFamily: "var(--ed-disp)", fontSize: 15, fontWeight: 800, letterSpacing: "-0.01em",
          }}
        >
          Adopt <ArrowSwap /> Start raising
        </button>
      </div>
      </Reveal>
      </>
      )}

      {/* Printed compliance footnote — verbatim posture, ≥12px, never buried */}
      <div style={{
        marginTop: 20, paddingTop: 14,
        borderTop: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
        textAlign: "center",
      }}>
        <p style={{
          margin: "0 auto", maxWidth: 640, fontSize: 13, color: "#5C5140",
          lineHeight: 1.65, fontFamily: "var(--ed-m)",
        }}>
          Points are a non-financial loyalty score — gained by raising &amp; creating, never bought.
          No token, no cash value, no redemption — recognition only.
        </p>
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

// Visual climb tile — the point value is the hero: big mono numerals on a
// die-cut sticker chip (hard offset shadow in the tile's accent). One glyph,
// one line of prose, nothing else.
function ClimbTile({ step, icon, value, unit, title, line, cta, onClick, accent }: {
  step: string; icon: string; value: string; unit: string; title: string;
  line: string; cta: string; onClick?: () => void; accent: string;
}) {
  return (
    <div style={{
      padding: "18px 18px 16px", borderRadius: 16, background: "#FBF6EC",
      border: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
      boxShadow: "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))",
      display: "flex", flexDirection: "column", gap: 10, height: "100%",
      transition: "transform 160ms ease, box-shadow 160ms ease",
      cursor: onClick ? "pointer" : "default",
    }}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={onClick ? `${cta}: ${title}` : undefined}
      onKeyDown={onClick ? (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        onClick();
      } : undefined}
      onMouseEnter={(e) => { if (onClick) { (e.currentTarget as HTMLDivElement).style.transform = "translateY(-2px)"; (e.currentTarget as HTMLDivElement).style.boxShadow = "var(--ed-shadow-card-hover, 0 26px 50px -24px rgba(80,55,20,.55))"; } }}
      onMouseLeave={(e) => { if (onClick) { (e.currentTarget as HTMLDivElement).style.transform = ""; (e.currentTarget as HTMLDivElement).style.boxShadow = "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))"; } }}
      onClick={onClick}
    >
      {/* Glyph + step */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{
          width: 46, height: 46, borderRadius: 12, background: "#F5EFE2",
          border: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
          display: "inline-flex", alignItems: "center", justifyContent: "center",
        }}>
          <Icon name={icon} size={28} />
        </span>
        <span style={{ fontFamily: "var(--ed-m)", fontSize: 12, fontWeight: 700, color: "#9A7B4E", letterSpacing: "0.12em" }}>{step}</span>
      </div>

      {/* The hero: big point number on a sticker chip */}
      <span style={{
        alignSelf: "flex-start",
        fontFamily: "var(--ed-m)", fontSize: 28, fontWeight: 700, lineHeight: 1.1,
        letterSpacing: "-0.02em", color: "#211A12",
        background: "#FFFDF6", padding: "3px 12px",
        border: "2px solid #211A12", borderRadius: 10,
        boxShadow: `4px 4px 0 ${accent}`,
      }}>{value}</span>
      <span style={{
        fontFamily: "var(--ed-m)", fontSize: 12, fontWeight: 700, color: "#7A6E5A",
        letterSpacing: "0.12em", textTransform: "uppercase", marginTop: 2,
      }}>{unit}</span>

      <div style={{ fontSize: 16, fontWeight: 800, color: "#211A12", letterSpacing: "-0.02em", fontFamily: "var(--ed-disp)" }}>{title}</div>
      <div style={{ fontSize: 13, color: "#5C5140", lineHeight: 1.5, fontFamily: "var(--ed-body)" }}>{line}</div>
      {onClick && (
        <div style={{ marginTop: "auto", fontSize: 13, fontWeight: 700, color: accent, display: "flex", alignItems: "center", gap: 4 }}>
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
