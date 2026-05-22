"use client";

/**
 * Admin analytics dashboard — gated client-side by API 403 from /api/admin/analytics.
 *
 * Pulls JSON, renders headline tiles + revenue table + DAU sparkline-ish
 * bar chart + paywall conversion rates + top spenders. PetClaw-tone.
 */

import { useEffect, useState } from "react";
import { getAuthHeaders } from "@/lib/api";

interface AnalyticsData {
  windowDays: number;
  since: string;
  headline: {
    totalUsers: number; totalActivePets: number;
    interactionsInWindow: number; memoriesInWindow: number;
    battlesInWindow: number; revenueUsd: number; burnEarmarkUsd: number;
  };
  revenueByAction: Array<{ actionKey: string; txCount: number; revenueUsd: number; burnEarmarkUsd: number }>;
  paywallConversion: Array<{ actionKey: string; capExhausted: number; converted: number; conversionRate: number }>;
  dailyActiveUsers: Array<{ day: string; dau: number }>;
  topSpenders: Array<{ userId: number; wallet: string; totalSpentUsd: number; txCount: number }>;
  battlePool: { entriesInWindow: number; grossUsd: number; projectedPayoutUsd: number };
}

export default function AdminAnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(7);

  useEffect(() => {
    setError(null);
    fetch(`/api/admin/analytics?days=${days}`, { headers: getAuthHeaders() })
      .then(r => r.ok ? r.json() : r.json().then(j => Promise.reject(j.error || `${r.status}`)))
      .then(setData)
      .catch(e => setError(typeof e === "string" ? e : "Failed to load"));
  }, [days]);

  if (error) {
    return (
      <main style={pageStyle}>
        <div style={{ maxWidth: 720, margin: "60px auto", padding: 32, textAlign: "center" }}>
          <div style={{ fontSize: 14, color: "#dc2626", fontFamily: "'JetBrains Mono', monospace" }}>{error}</div>
          {error.toLowerCase().includes("forbid") && (
            <p style={{ fontSize: 12, color: "rgba(26,26,46,0.6)", marginTop: 14 }}>
              Set <code>ADMIN_WALLETS</code> on the server with your wallet to gain access.
            </p>
          )}
        </div>
      </main>
    );
  }

  if (!data) return <main style={pageStyle}><div style={{ padding: 40, textAlign: "center", color: "rgba(26,26,46,0.5)" }}>Loading…</div></main>;

  const maxDau = Math.max(1, ...data.dailyActiveUsers.map(d => d.dau));

  return (
    <main style={pageStyle}>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "40px 20px 80px" }}>
        <a href="/" style={backLinkStyle}>← Back to MY AI PET</a>

        {/* Header */}
        <div style={{ marginTop: 18, marginBottom: 26 }}>
          <span style={badgeStyle}>ADMIN · ANALYTICS</span>
          <h1 style={{ fontSize: 36, fontWeight: 800, margin: "10px 0 6px", letterSpacing: "-0.03em" }}>
            BM Health Dashboard
          </h1>
          <p style={{ fontSize: 14, color: "rgba(26,26,46,0.6)" }}>
            Window: last {data.windowDays} days · since {new Date(data.since).toLocaleDateString()}
          </p>

          {/* Window selector */}
          <div style={{ marginTop: 14, display: "flex", gap: 6 }}>
            {[1, 7, 30, 90].map(d => (
              <button key={d} onClick={() => setDays(d)} style={{
                padding: "6px 14px", borderRadius: 8, border: "none", cursor: "pointer",
                fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 700,
                background: days === d ? "#1a1a2e" : "white",
                color: days === d ? "white" : "#1a1a2e",
                boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
              }}>{d}d</button>
            ))}
          </div>
        </div>

        {/* Headline tiles */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 26 }}>
          <Tile label="Revenue (USDT)" value={data.headline.revenueUsd.toFixed(2)} accent="#fbbf24" />
          <Tile label="Burn earmark" value={data.headline.burnEarmarkUsd.toFixed(2)} accent="#dc2626" />
          <Tile label="Total users" value={data.headline.totalUsers} />
          <Tile label="Active pets" value={data.headline.totalActivePets} />
          <Tile label="Interactions" value={data.headline.interactionsInWindow} />
          <Tile label="Battles" value={data.headline.battlesInWindow} />
          <Tile label="Memories created" value={data.headline.memoriesInWindow} />
          <Tile label="Battle pool" value={`${data.battlePool.projectedPayoutUsd.toFixed(2)} USDT`} accent="#16a34a" />
        </div>

        {/* DAU bar chart (text-based, PetClaw tone) */}
        <Section title="DAU (daily active users)">
          {data.dailyActiveUsers.length === 0 ? (
            <Empty text="No activity yet." />
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${data.dailyActiveUsers.length}, 1fr)`, gap: 4, alignItems: "end", height: 80 }}>
              {data.dailyActiveUsers.slice().reverse().map(d => (
                <div key={d.day} title={`${d.day}: ${d.dau} users`} style={{
                  background: "linear-gradient(180deg, #fbbf24, #f59e0b)",
                  borderRadius: "4px 4px 0 0",
                  height: `${(d.dau / maxDau) * 100}%`,
                  minHeight: 2,
                  position: "relative",
                }}>
                  <div style={{ position: "absolute", bottom: -16, left: 0, right: 0, textAlign: "center", fontSize: 9, fontFamily: "'JetBrains Mono', monospace", color: "rgba(26,26,46,0.5)" }}>
                    {d.day.slice(5)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* Revenue table */}
        <Section title="Revenue by action">
          {data.revenueByAction.length === 0 ? (
            <Empty text="No paid actions yet. Free-tier caps generate the conversion funnel — kick the tires." />
          ) : (
            <div style={{ display: "grid", gap: 6 }}>
              <Row cells={["ACTION", "TX", "REV (USDT)", "BURN EARMARK"]} header />
              {data.revenueByAction.map(r => (
                <Row key={r.actionKey} cells={[
                  r.actionKey,
                  String(r.txCount),
                  r.revenueUsd.toFixed(4),
                  r.burnEarmarkUsd.toFixed(4),
                ]} />
              ))}
            </div>
          )}
        </Section>

        {/* Paywall conversion */}
        <Section title="Paywall conversion (cap-exhausted → paid)">
          {data.paywallConversion.length === 0 ? (
            <Empty text="No paywall hits yet." />
          ) : (
            <div style={{ display: "grid", gap: 6 }}>
              <Row cells={["ACTION", "HIT CAP", "PAID", "CONV %"]} header />
              {data.paywallConversion.map(p => (
                <Row key={p.actionKey} cells={[
                  p.actionKey,
                  String(p.capExhausted),
                  String(p.converted),
                  `${(p.conversionRate * 100).toFixed(1)}%`,
                ]} />
              ))}
            </div>
          )}
        </Section>

        {/* Top spenders */}
        <Section title="Top spenders">
          {data.topSpenders.length === 0 ? (
            <Empty text="No spenders yet." />
          ) : (
            <div style={{ display: "grid", gap: 6 }}>
              <Row cells={["WALLET", "TX", "TOTAL (USDT)"]} header />
              {data.topSpenders.map(s => (
                <Row key={s.userId} cells={[
                  s.wallet,
                  String(s.txCount),
                  s.totalSpentUsd.toFixed(4),
                ]} />
              ))}
            </div>
          )}
        </Section>
      </div>
    </main>
  );
}

const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  background: "linear-gradient(180deg, #faf7f2 0%, #fff8eb 50%, #faf7f2 100%)",
  color: "#1a1a2e",
  fontFamily: "'Space Grotesk', sans-serif",
};

const backLinkStyle: React.CSSProperties = {
  display: "inline-block", fontSize: 13, color: "rgba(26,26,46,0.55)",
  textDecoration: "none", marginBottom: 4,
};

const badgeStyle: React.CSSProperties = {
  display: "inline-block", padding: "5px 14px", borderRadius: 999,
  background: "rgba(220,38,38,0.10)", color: "#dc2626",
  fontSize: 11, fontWeight: 700, letterSpacing: "0.16em",
  textTransform: "uppercase", fontFamily: "'JetBrains Mono', monospace",
};

function Tile({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  return (
    <div style={{
      padding: "14px 16px", borderRadius: 12, background: "white",
      border: "1px solid rgba(0,0,0,0.06)",
    }}>
      <div style={{
        fontSize: 9, color: "rgba(26,26,46,0.5)", letterSpacing: "0.1em",
        fontFamily: "'JetBrains Mono', monospace", marginBottom: 6,
      }}>{label.toUpperCase()}</div>
      <div style={{
        fontSize: 22, fontWeight: 800, color: accent || "#1a1a2e",
        fontFamily: "'JetBrains Mono', monospace",
      }}>{value}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      padding: 18, borderRadius: 14, background: "white",
      border: "1px solid rgba(0,0,0,0.06)", marginBottom: 18,
    }}>
      <h3 style={{
        fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase",
        color: "rgba(26,26,46,0.6)", margin: "0 0 14px",
        fontFamily: "'JetBrains Mono', monospace",
      }}>{title}</h3>
      {children}
    </div>
  );
}

function Row({ cells, header }: { cells: string[]; header?: boolean }) {
  return (
    <div style={{
      display: "grid", gridTemplateColumns: `1.5fr repeat(${cells.length - 1}, 1fr)`, gap: 12,
      padding: "8px 10px", borderRadius: 8,
      background: header ? "rgba(0,0,0,0.03)" : "transparent",
      fontFamily: "'JetBrains Mono', monospace", fontSize: 12,
      color: header ? "rgba(26,26,46,0.55)" : "#1a1a2e",
      fontWeight: header ? 700 : 500,
    }}>
      {cells.map((c, i) => (
        <div key={i} style={{ textAlign: i === 0 ? "left" : "right" }}>{c}</div>
      ))}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div style={{ fontSize: 12, color: "rgba(26,26,46,0.45)", padding: "8px 0", fontStyle: "italic" }}>{text}</div>;
}
