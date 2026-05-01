"use client";

import { useEffect, useState } from "react";

interface ProtocolStats {
  generated_at: string;
  users: { total: number; with_active_pet: number };
  content: {
    generations_total: number;
    generations_video: number;
    generations_image: number;
    generations_24h: number;
    generations_7d: number;
  };
  revenue: {
    credit_purchases: number;
    credit_revenue_usdt: number;
    item_purchases: number;
    currency: string;
  };
  onchain: {
    total_transactions: number;
    unique_onchain_users: number;
    memory_nfts: number;
    pet_soul_nfts: number;
    chain: string;
  };
  contracts: Record<string, string | null>;
}

export default function StatsPage() {
  const [data, setData] = useState<ProtocolStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/analytics/protocol")
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setErr(e.message); setLoading(false); });
  }, []);

  return (
    <div style={{
      minHeight: "100vh", background: "#faf7f2",
      fontFamily: "'Space Grotesk', sans-serif", color: "#1a1a2e",
      padding: "60px 24px",
    }}>
      <div style={{ maxWidth: 1000, margin: "0 auto" }}>
        <a href="/landing/" style={{
          display: "inline-block", marginBottom: 20,
          fontSize: 13, color: "rgba(26,26,46,0.55)", textDecoration: "none",
        }}>← Back to landing</a>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12, marginBottom: 8 }}>
          <h1 style={{ fontSize: 38, fontWeight: 800, letterSpacing: "-0.02em", margin: 0 }}>
            Protocol Stats
          </h1>
          <span style={{
            fontSize: 11, padding: "4px 10px", borderRadius: 999,
            background: "rgba(74,222,128,0.15)", color: "#16a34a",
            fontWeight: 700, letterSpacing: "0.06em",
          }}>● LIVE FROM DB</span>
        </div>
        <p style={{ fontSize: 14, color: "rgba(26,26,46,0.6)", marginBottom: 36 }}>
          Real, unfiltered numbers — pulled from production Postgres + BSC. No marketing inflation.
          {data?.generated_at && (
            <span style={{ marginLeft: 8, fontFamily: "monospace", fontSize: 11, color: "rgba(26,26,46,0.4)" }}>
              · refreshed {new Date(data.generated_at).toUTCString()}
            </span>
          )}
        </p>

        {loading && <div style={{ padding: 40, textAlign: "center", color: "rgba(26,26,46,0.5)" }}>Loading…</div>}
        {err && <div style={{ padding: 40, color: "#dc2626" }}>Error: {err}</div>}

        {data && (
          <>
            <SectionTitle>Users & Pets</SectionTitle>
            <Grid>
              <Stat label="Registered users" value={data.users.total} />
              <Stat label="With active pet" value={data.users.with_active_pet} accent="#f59e0b" />
              <Stat label="Conversion" value={data.users.total === 0 ? "0%" : `${Math.round(data.users.with_active_pet / data.users.total * 100)}%`} muted />
            </Grid>

            <SectionTitle>Content Generation (real Grok/FAL calls)</SectionTitle>
            <Grid>
              <Stat label="Total generations" value={data.content.generations_total} accent="#8b5cf6" />
              <Stat label="— videos" value={data.content.generations_video} muted />
              <Stat label="— images" value={data.content.generations_image} muted />
              <Stat label="Last 24h" value={data.content.generations_24h} />
              <Stat label="Last 7d" value={data.content.generations_7d} />
            </Grid>

            <SectionTitle>Revenue (USDT, on-chain verified)</SectionTitle>
            <Grid>
              <Stat label="Credit purchases" value={data.revenue.credit_purchases} accent="#16a34a" />
              <Stat label="Premium item buys" value={data.revenue.item_purchases} accent="#16a34a" />
              <Stat label="Total revenue (USDT)" value={`$${data.revenue.credit_revenue_usdt.toFixed(2)}`} accent="#16a34a" big />
            </Grid>
            {data.revenue.credit_revenue_usdt === 0 && (
              <div style={{
                padding: "12px 16px", borderRadius: 12, marginTop: -8, marginBottom: 28,
                background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.2)",
                fontSize: 13, color: "#92400e", lineHeight: 1.55,
              }}>
                Pre-revenue. Direct USDT-on-BSC purchase flow went live with this build —
                first paying customer not yet recorded. This page will update automatically.
              </div>
            )}

            <SectionTitle>On-chain Activity ({data.onchain.chain})</SectionTitle>
            <Grid>
              <Stat label="Recorded transactions" value={data.onchain.total_transactions} />
              <Stat label="Unique on-chain users" value={data.onchain.unique_onchain_users} />
              <Stat label="Memory NFTs" value={data.onchain.memory_nfts} muted />
              <Stat label="Soul NFTs" value={data.onchain.pet_soul_nfts} muted />
            </Grid>

            <SectionTitle>Contracts</SectionTitle>
            <div style={{ display: "grid", gap: 8 }}>
              {Object.entries(data.contracts).map(([key, addr]) => (
                <div key={key} style={{
                  display: "grid", gridTemplateColumns: "180px 1fr auto", gap: 14, alignItems: "center",
                  padding: "12px 16px", background: "white", borderRadius: 10,
                  border: "1px solid rgba(0,0,0,0.06)",
                }}>
                  <div style={{ fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "rgba(26,26,46,0.65)" }}>
                    {key.replace(/_/g, " ")}
                  </div>
                  <code style={{ fontSize: 12, color: addr ? "#1a1a2e" : "rgba(26,26,46,0.35)", wordBreak: "break-all" }}>
                    {addr || "— pre-TGE —"}
                  </code>
                  {addr && (
                    <a href={`https://bscscan.com/address/${addr}`} target="_blank" rel="noopener noreferrer"
                       style={{ fontSize: 11, padding: "4px 10px", borderRadius: 8, background: "rgba(0,0,0,0.04)", color: "#1a1a2e", textDecoration: "none", fontWeight: 600 }}>
                      BSCScan ↗
                    </a>
                  )}
                </div>
              ))}
            </div>

            <div style={{
              marginTop: 36, padding: "14px 18px", borderRadius: 12,
              background: "rgba(0,0,0,0.04)", fontSize: 12, color: "rgba(26,26,46,0.6)", lineHeight: 1.6,
            }}>
              Source: <code style={{ fontSize: 11 }}>GET /api/analytics/protocol</code> — public,
              uncached, served direct from production Postgres. Anyone reproducing DD numbers can hit
              this endpoint and verify against BSCScan.
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(26,26,46,0.5)", marginTop: 36, marginBottom: 14 }}>
      {children}
    </h2>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
      gap: 12, marginBottom: 8,
    }}>{children}</div>
  );
}

function Stat({ label, value, accent, muted, big }: { label: string; value: any; accent?: string; muted?: boolean; big?: boolean }) {
  return (
    <div style={{
      padding: 18, borderRadius: 14,
      background: "white", border: "1px solid rgba(0,0,0,0.06)",
      gridColumn: big ? "span 2" : undefined,
    }}>
      <div style={{ fontSize: 11, color: "rgba(26,26,46,0.5)", marginBottom: 6, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase" }}>
        {label}
      </div>
      <div style={{
        fontSize: big ? 36 : 28, fontWeight: 800, letterSpacing: "-0.02em",
        color: muted ? "rgba(26,26,46,0.5)" : (accent || "#1a1a2e"),
      }}>
        {value}
      </div>
    </div>
  );
}
