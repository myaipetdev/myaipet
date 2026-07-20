"use client";

/**
 * Owner-only ops dashboard — /admin (UNLISTED: no nav links anywhere).
 *
 * Server gate lives in /api/admin/overview: the signed-in wallet must be in the
 * ADMIN_WALLETS env var (comma-separated, case-insensitive). Everyone else gets
 * a 404 from the API and this page renders a plain "Nothing here" — visually a
 * dead end, indistinguishable from a missing route.
 *
 * Design: Collectible Editorial tokens (globals.css) — paper --ed-paper #FBF6EC,
 * ink --ed-ink #211A12, terracotta --ed-terra, Space Mono var(--ed-m), hard
 * offset shadows (no blur). All numbers are real DB aggregates; zeros are
 * honest zeros. Auto-refreshes every 30s.
 */

import { useCallback, useEffect, useState } from "react";
import { getAuthHeaders } from "@/lib/api";

interface Overview {
  generatedAt: string;
  todayStartsAt: string;
  users: { total: number; new7d: number };
  pets: { total: number; active: number };
  creditsSpent: { today: number; last7d: number; breakdown7d: Record<string, number> };
  purchases7d: { count: number; usdtSum: number };
  studioGenerations: { today: number; last7d: number };
  agentRunsToday: number;
  caughtAnimals7d: number;
  seasonPointsIssued7d: { cappedLedger: number };
  llmToday: { date: string; platformCalls: number; distinctCallers: number; callCap: number; perUserCap: number };
  visionToday: { date: string; visionCalls: number; cap: number };
  imageToday: { date: string; imageCalls: number; distinctCallers: number; cap: number; perUserCap: number; providers: Record<string, number> };
  recentPurchases: Array<{ id: number; wallet: string; purpose: string; usd: number; at: string }>;
  recentRuns: Array<{ id: number; pet: string; urge: string; action: string; credits: number; platform: string | null; at: string }>;
}

const INK = "var(--ed-ink, #211A12)";
const PAPER = "var(--ed-paper, #FBF6EC)";
const INSET = "var(--ed-inset, #F5EFE2)";
const TERRA = "var(--ed-terra, #BE4F28)";
const MUTED = "var(--ed-muted, #7A6E5A)";
const HAIR = "var(--ed-hair, rgba(33,26,18,.13))";
const MONO = "var(--ed-m, 'Space Mono', ui-monospace, monospace)";
const HARD = `4px 4px 0 ${INK}`; // hard offset shadow — no blur, ever
const HARD_SM = `3px 3px 0 ${INK}`;

export default function AdminOpsPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [gone, setGone] = useState(false); // API said 404 → render "Nothing here"
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/overview", { headers: getAuthHeaders(), cache: "no-store" });
      if (res.status === 404) { setGone(true); return; }
      if (!res.ok) { setError(`HTTP ${res.status}`); return; }
      setData(await res.json());
      setError(null);
    } catch {
      setError("network");
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000); // auto-refresh every 30s
    return () => clearInterval(t);
  }, [load]);

  // ── 404 posture: plain dead end, no hints that anything lives here ──
  if (gone) {
    return (
      <main style={{ minHeight: "100vh", background: PAPER, color: INK, display: "grid", placeItems: "center" }}>
        <div style={{ textAlign: "center", fontFamily: MONO }}>
          <div style={{ fontSize: 44, fontWeight: 700 }}>404</div>
          <div style={{ fontSize: 13, color: MUTED, marginTop: 8 }}>Nothing here.</div>
        </div>
      </main>
    );
  }

  if (!data) {
    return (
      <main style={{ minHeight: "100vh", background: PAPER, color: INK, display: "grid", placeItems: "center" }}>
        <div style={{ fontFamily: MONO, fontSize: 12, color: MUTED }}>{error ? `retrying… (${error})` : "loading…"}</div>
      </main>
    );
  }

  const bd = data.creditsSpent.breakdown7d;
  const stats: Array<{ label: string; value: string; sub?: string }> = [
    { label: "USERS", value: fmt(data.users.total), sub: `+${fmt(data.users.new7d)} / 7d` },
    { label: "PETS", value: fmt(data.pets.total), sub: `${fmt(data.pets.active)} active` },
    { label: "CREDITS TODAY", value: fmt(data.creditsSpent.today), sub: `${fmt(data.creditsSpent.last7d)} / 7d` },
    { label: "USDT 7D", value: `$${data.purchases7d.usdtSum.toFixed(2)}`, sub: `${fmt(data.purchases7d.count)} payments` },
    { label: "STUDIO TODAY", value: fmt(data.studioGenerations.today), sub: `${fmt(data.studioGenerations.last7d)} / 7d` },
    { label: "AGENT RUNS TODAY", value: fmt(data.agentRunsToday) },
    { label: "CAUGHT 7D", value: fmt(data.caughtAnimals7d) },
    { label: "SEASON PTS 7D", value: fmt(data.seasonPointsIssued7d.cappedLedger), sub: "capped ledger" },
    {
      label: "LLM CALLS TODAY",
      value: `${fmt(data.llmToday.platformCalls)}/${fmt(data.llmToday.callCap)}`,
      sub: `${fmt(data.llmToday.distinctCallers)} owner-scoped callers · cluster-wide`,
    },
    {
      label: "VISION CALLS TODAY",
      value: `${fmt(data.visionToday.visionCalls)}/${fmt(data.visionToday.cap)}`,
      sub: "cluster-wide",
    },
    {
      label: "IMAGE ATTEMPTS TODAY",
      value: `${fmt(data.imageToday.imageCalls)}/${fmt(data.imageToday.cap)}`,
      sub: `${fmt(data.imageToday.distinctCallers)} callers · ${fmt(data.imageToday.perUserCap)}/user/day`,
    },
  ];

  return (
    <main style={{ minHeight: "100vh", background: PAPER, color: INK, fontFamily: "var(--ed-body, system-ui)" }}>
      <div style={{ maxWidth: 1080, margin: "0 auto", padding: "36px 20px 90px" }}>
        {/* masthead */}
        <header style={{ display: "flex", alignItems: "baseline", gap: 12, borderBottom: `2px solid ${INK}`, paddingBottom: 14 }}>
          <span style={{
            fontFamily: MONO, fontSize: 11, fontWeight: 700, letterSpacing: "0.14em",
            background: TERRA, color: PAPER, padding: "4px 10px", boxShadow: HARD_SM,
          }}>OPS</span>
          <h1 style={{ fontFamily: "var(--ed-disp, inherit)", fontSize: 30, fontWeight: 800, letterSpacing: "-0.02em", margin: 0 }}>
            Owner Console
          </h1>
          <span style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 11, color: MUTED }}>
            refreshed {new Date(data.generatedAt).toLocaleTimeString("en-US")} · every 30s{error ? ` · last poll failed (${error})` : ""}
          </span>
        </header>

        {/* stat cards */}
        <section style={{
          display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
          gap: 16, marginTop: 26,
        }}>
          {stats.map((s) => (
            <div key={s.label} style={{
              background: PAPER, border: `2px solid ${INK}`, boxShadow: HARD,
              padding: "14px 16px",
            }}>
              <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", color: TERRA }}>{s.label}</div>
              <div style={{ fontFamily: MONO, fontSize: 26, fontWeight: 700, marginTop: 6, lineHeight: 1 }}>{s.value}</div>
              {s.sub && <div style={{ fontFamily: MONO, fontSize: 11, color: MUTED, marginTop: 6 }}>{s.sub}</div>}
            </div>
          ))}
        </section>

        {/* credit breakdown strip */}
        <section style={{ marginTop: 18, fontFamily: MONO, fontSize: 11, color: MUTED }}>
          <span style={{ color: INK, fontWeight: 700 }}>credits 7d · </span>
          {Object.entries(bd).map(([k, v]) => `${k} ${fmt(v)}`).join(" · ")}
          <span> · today = UTC day from {new Date(data.todayStartsAt).toLocaleTimeString("en-US")}</span>
        </section>

        {/* two lists */}
        <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 20, marginTop: 28 }}>
          <ListCard title="RECENT PURCHASES" empty={data.recentPurchases.length === 0}>
            {data.recentPurchases.map((p) => (
              <Row key={p.id}
                left={<><b style={{ fontWeight: 700 }}>${p.usd.toFixed(2)}</b> · {p.purpose}</>}
                mid={p.wallet}
                right={ago(p.at)}
              />
            ))}
          </ListCard>

          <ListCard title="RECENT AGENT RUNS" empty={data.recentRuns.length === 0}>
            {data.recentRuns.map((r) => (
              <Row key={r.id}
                left={<><b style={{ fontWeight: 700 }}>{r.pet}</b> · {r.urge} → {r.action}{r.platform ? ` @${r.platform}` : ""}</>}
                mid={r.credits ? `${r.credits}cr` : ""}
                right={ago(r.at)}
              />
            ))}
          </ListCard>
        </section>

        <footer style={{ marginTop: 40, fontFamily: MONO, fontSize: 10, color: MUTED }}>
          real aggregates only — zeros are honest zeros. llm counter is per-process (resets on deploy).
        </footer>
      </div>
    </main>
  );
}

function ListCard({ title, empty, children }: { title: string; empty: boolean; children: React.ReactNode }) {
  return (
    <div style={{ background: INSET, border: `2px solid ${INK}`, boxShadow: HARD }}>
      <div style={{
        fontFamily: MONO, fontSize: 11, fontWeight: 700, letterSpacing: "0.12em",
        padding: "10px 14px", borderBottom: `2px solid ${INK}`, background: PAPER,
      }}>{title}</div>
      <div>
        {empty
          ? <div style={{ padding: "18px 14px", fontFamily: MONO, fontSize: 12, color: MUTED }}>none yet — honest zero.</div>
          : children}
      </div>
    </div>
  );
}

function Row({ left, mid, right }: { left: React.ReactNode; mid: React.ReactNode; right: React.ReactNode }) {
  return (
    <div style={{
      display: "flex", gap: 10, alignItems: "baseline", padding: "9px 14px",
      borderBottom: `1px solid ${HAIR}`, fontSize: 12.5,
    }}>
      <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{left}</span>
      <span style={{ fontFamily: MONO, fontSize: 11, color: MUTED, flexShrink: 0 }}>{mid}</span>
      <span style={{ fontFamily: MONO, fontSize: 11, color: MUTED, flexShrink: 0 }}>{right}</span>
    </div>
  );
}

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

function ago(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${Math.floor(s)}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}
