"use client";

/**
 * /account — the member's "my page": PLAN / CREDITS / USAGE / SEASON /
 * BILLING, every number straight from /api/account/overview (owner-scoped,
 * real DB reads only — no fabricated figures anywhere on this surface).
 *
 * Collectible Editorial: cream paper cards, hard offset shadows, mono
 * eyebrows, a wax CURRENT seal on the plan card. Scannable, not texty.
 */

import { useEffect, useState } from "react";
import { getAuthHeaders } from "@/lib/api";
import { MODELS } from "@/lib/studio/providers";
import { forgetPendingAgentRun } from "@/lib/petclaw/agent-run-client";

// ── Types mirror the /api/account/overview payload ──
interface PurchaseRow {
  id: number;
  credits: number;
  amount_usd: number;
  status: string;
  chain: string | null;
  created_at: string;
}
interface GenerationRow {
  id: number;
  status: string;
  credits_charged: number;
  duration: number;
  created_at: string;
}
interface AgentRunRow {
  run_id: string;
  pet_id: number;
  pet_deleted: boolean;
  pet_name: string | null;
  goal: string | null;
  state: "reserved" | "running" | "terminal";
  completed: boolean | null;
  stopped_reason: string | null;
  billing: { outcome?: string; creditsCharged?: number; usageKnown?: boolean; modelCalls?: number | null } | null;
  credits_remaining: number | null;
  created_at: string;
  started_at: string | null;
  terminal_at: string | null;
  updated_at: string;
}
interface Overview {
  plan: string;
  member_since: string | null;
  credits: number;
  payments_enabled: boolean;
  purchases: PurchaseRow[];
  usage: { total: number; recent: GenerationRow[] };
  agent_runs: AgentRunRow[];
  season: {
    points: number;
    tier: { key: string; name: string; min: number; color: string; emoji: string };
    next: { key: string; name: string; min: number; color: string; emoji: string } | null;
    to_next: number;
    progress: number;
  };
}

// ── "What a credit makes" — computed from the REAL studio catalog (never a
// hand-typed price that can drift from providers.ts). comingSoon models are
// not purchasable today, so they are excluded. ──
const live = MODELS.filter((m) => !m.comingSoon);
const cheapestOf = (rows: typeof live) =>
  rows.length ? rows.reduce((a, b) => (b.creditsPerRun < a.creditsPerRun ? b : a)) : null;
const exImage = cheapestOf(live.filter((m) => m.kind === "image"));
const exAnchor = cheapestOf(live.filter((m) => m.kind === "image" && m.supportsImageRef));
const exVideo = cheapestOf(live.filter((m) => m.kind === "video"));
const CREDIT_EXAMPLES = [
  exImage && { label: `${exImage.displayName} image`, cr: exImage.creditsPerRun },
  exAnchor &&
    exAnchor.id !== exImage?.id && {
      label: `${exAnchor.displayName} (your pet's face)`,
      cr: exAnchor.creditsPerRun,
    },
  exVideo && {
    label: `${exVideo.displayName} clip · ${exVideo.maxDurationSec}s`,
    cr: exVideo.creditsPerRun,
  },
].filter(Boolean) as { label: string; cr: number }[];

const fmtDate = (s: string | null) =>
  s ? new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";

const STATUS_COLORS: Record<string, string> = {
  completed: "#5C8A4E",
  confirmed: "#5C8A4E",
  done: "#5C8A4E",
  pending: "#C8932F",
  processing: "#C8932F",
  failed: "#B3402A",
};
const statusColor = (s: string) => STATUS_COLORS[s?.toLowerCase()] ?? "#7A6E5A";

// ── Shared editorial atoms ──
const eyebrow: React.CSSProperties = {
  fontFamily: "var(--ed-m)",
  fontSize: 13,
  fontWeight: 700,
  letterSpacing: "0.16em",
  textTransform: "uppercase",
  color: "#9A7B4E",
  marginBottom: 14,
};
const card: React.CSSProperties = {
  position: "relative",
  background: "var(--ed-paper, #FBF6EC)",
  border: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
  borderRadius: 18,
  boxShadow: "6px 7px 0 rgba(33,26,18,.08)",
  padding: "22px 24px 24px",
};
const bigNum: React.CSSProperties = {
  fontFamily: "var(--ed-disp)",
  fontWeight: 800,
  color: "#211A12",
  letterSpacing: "-0.03em",
  lineHeight: 1,
  fontVariantNumeric: "tabular-nums",
};

// Wax "CURRENT" seal — pressed terracotta wax, hard offset shadow, no glow.
function WaxSeal() {
  return (
    <div
      aria-label="Current plan"
      style={{
        position: "absolute",
        top: -16,
        right: 14,
        width: 78,
        height: 78,
        borderRadius: "50%",
        background: "radial-gradient(circle at 32% 28%, #D66A41, #BE4F28 52%, #8F3418)",
        border: "2px solid #7E2F16",
        boxShadow: "4px 5px 0 rgba(33,26,18,.22)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transform: "rotate(-9deg)",
      }}
    >
      <div
        style={{
          width: 62,
          height: 62,
          borderRadius: "50%",
          border: "1.5px dashed rgba(252,233,207,.65)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "var(--ed-m)",
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: "0.04em",
          color: "#FCE9CF",
        }}
      >
        CURRENT
      </div>
    </div>
  );
}

export default function AccountOverview({
  onCreditsChange,
}: {
  onCreditsChange?: (credits: number) => void;
}) {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    fetch("/api/account/overview", { headers: getAuthHeaders() })
      .then(async (r) => {
        if (!r.ok) {
          const err = await r.json().catch(() => null);
          throw Object.assign(new Error(err?.error || `HTTP ${r.status}`), { status: r.status });
        }
        return r.json();
      })
      .then((d: Overview) => {
        if (cancelled) return;
        for (const run of d.agent_runs || []) {
          if (run.state === "terminal") {
            try { forgetPendingAgentRun(run.run_id); } catch { /* storage unavailable */ }
          }
        }
        setData(d);
        onCreditsChange?.(d.credits);
      })
      .catch((e: any) => {
        if (cancelled) return;
        setError(
          e?.status === 401
            ? "Session expired — sign in again to view your account."
            : "Couldn't load your account right now."
        );
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadKey]);

  if (error) {
    return (
      <div style={{ maxWidth: 480, margin: "0 auto", padding: "110px 24px 80px", textAlign: "center" }}>
        <h2 style={{ fontFamily: "var(--ed-disp)", fontSize: 26, fontWeight: 800, color: "#211A12", marginBottom: 10 }}>
          Account
        </h2>
        <p style={{ fontFamily: "var(--ed-body)", fontSize: 15, color: "#7A6E5A", lineHeight: 1.7, marginBottom: 22 }}>
          {error}
        </p>
        <button
          onClick={() => setReloadKey((k) => k + 1)}
          style={{
            padding: "12px 28px",
            borderRadius: 12,
            border: "none",
            background: "linear-gradient(180deg,#F49B2A,#E27D0C)",
            color: "#211A12",
            fontFamily: "var(--ed-disp)",
            fontSize: 14,
            fontWeight: 800,
            cursor: "pointer",
            boxShadow: "3px 4px 0 rgba(33,26,18,.18)",
          }}
        >
          Try again
        </button>
      </div>
    );
  }

  if (!data) {
    return (
      <div style={{ maxWidth: 480, margin: "0 auto", padding: "130px 24px 80px", textAlign: "center" }}>
        <div style={{ ...eyebrow, marginBottom: 10 }}>My Account</div>
        <p style={{ fontFamily: "var(--ed-body)", fontSize: 15, color: "#7A6E5A" }}>Loading your account…</p>
      </div>
    );
  }

  const { credits, purchases, usage, season, agent_runs: agentRuns } = data;
  const videosAffordable = exVideo ? Math.floor(credits / exVideo.creditsPerRun) : 0;
  const imagesAffordable = exImage ? Math.floor(credits / exImage.creditsPerRun) : 0;

  return (
    <div style={{ maxWidth: 1060, margin: "0 auto", padding: "38px 22px 90px" }}>
      <style>{`
        .acct-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
        .acct-span2 { grid-column: 1 / -1; }
        @media (max-width: 780px) { .acct-grid { grid-template-columns: 1fr; } .acct-span2 { grid-column: auto; } }
        .acct-link { color: #9A4E1E; font-weight: 700; text-decoration: none; }
        .acct-link:hover { text-decoration: underline; }
        .acct-table { width: 100%; border-collapse: collapse; font-family: var(--ed-body); font-size: 13.5px; color: #211A12; }
        .acct-table th { font-family: var(--ed-m); font-size: 13px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: #9A7B4E; text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--ed-hair, rgba(33,26,18,.13)); white-space: nowrap; }
        .acct-table td { padding: 10px; border-bottom: 1px solid var(--ed-hair, rgba(33,26,18,.13)); white-space: nowrap; font-variant-numeric: tabular-nums; }
        .acct-table tr:last-child td { border-bottom: none; }
      `}</style>

      {/* ── Masthead ── */}
      <header style={{ marginBottom: 26 }}>
        <div style={{ ...eyebrow, marginBottom: 8 }}>Membership · Usage · Billing</div>
        <h1
          style={{
            fontFamily: "var(--ed-disp)",
            fontSize: 40,
            fontWeight: 800,
            color: "#211A12",
            letterSpacing: "-0.02em",
            lineHeight: 1.05,
            margin: 0,
          }}
        >
          Account
        </h1>
        {data.member_since && (
          <div style={{ fontFamily: "var(--ed-body)", fontSize: 13.5, color: "#7A6E5A", marginTop: 8 }}>
            Member since {fmtDate(data.member_since)}
          </div>
        )}
      </header>

      <div className="acct-grid">
        {/* ── PLAN ── */}
        <section style={card} aria-labelledby="acct-plan">
          <WaxSeal />
          <div id="acct-plan" style={eyebrow}>
            Plan
          </div>
          <div style={{ ...bigNum, fontSize: 34 }}>Companion</div>
          <div
            style={{
              display: "inline-block",
              marginTop: 10,
              fontFamily: "var(--ed-m)",
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: "0.1em",
              color: "#3D5C33",
              background: "rgba(92,138,78,.14)",
              border: "1px solid rgba(92,138,78,.4)",
              borderRadius: 8,
              padding: "4px 10px",
            }}
          >
            CURRENT PLAN · $0
          </div>
          <p style={{ fontFamily: "var(--ed-body)", fontSize: 14, color: "#5C5140", lineHeight: 1.6, margin: "12px 0 0" }}>
            Raise your pet, catch, battle, and earn season points — all included.
          </p>
          <div style={{ height: 1, background: "var(--ed-hair, rgba(33,26,18,.13))", margin: "16px 0 12px" }} />
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontFamily: "var(--ed-m)", fontSize: 13, fontWeight: 700, letterSpacing: "0.12em", color: "#9A4E1E" }}>
              COMPANION+
            </span>
            <span style={{ fontFamily: "var(--ed-body)", fontSize: 13.5, color: "#7A6E5A" }}>
              On the roadmap — not for sale yet.
            </span>
          </div>
        </section>

        {/* ── CREDITS ── */}
        <section style={card} aria-labelledby="acct-credits">
          <div id="acct-credits" style={eyebrow}>
            Credits
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span style={{ ...bigNum, fontSize: 52 }}>{credits.toLocaleString()}</span>
            <span style={{ fontFamily: "var(--ed-m)", fontSize: 14, fontWeight: 700, color: "#9A4E1E", letterSpacing: "0.06em" }}>
              cr
            </span>
          </div>
          {(videosAffordable > 0 || imagesAffordable > 0) && exVideo && exImage && (
            <div style={{ fontFamily: "var(--ed-body)", fontSize: 13, color: "#7A6E5A", marginTop: 6 }}>
              Enough for {videosAffordable.toLocaleString()} video clip{videosAffordable === 1 ? "" : "s"} or{" "}
              {imagesAffordable.toLocaleString()} image{imagesAffordable === 1 ? "" : "s"} at today&apos;s rates.
            </div>
          )}
          {CREDIT_EXAMPLES.length > 0 && (
            <>
              <div style={{ ...eyebrow, fontSize: 13, margin: "16px 0 8px" }}>What a credit makes</div>
              <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {CREDIT_EXAMPLES.map((ex) => (
                  <li
                    key={ex.label}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "baseline",
                      gap: 12,
                      padding: "6px 0",
                      borderBottom: "1px dashed var(--ed-hair, rgba(33,26,18,.13))",
                      fontFamily: "var(--ed-body)",
                      fontSize: 13.5,
                      color: "#3A3024",
                    }}
                  >
                    <span style={{ minWidth: 0 }}>{ex.label}</span>
                    <span style={{ fontFamily: "var(--ed-m)", fontSize: 13, fontWeight: 700, color: "#9A4E1E", whiteSpace: "nowrap" }}>
                      {ex.cr} cr
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
            {data.payments_enabled ? (
              <a
                href="/?section=home"
                style={{
                  display: "inline-block",
                  padding: "11px 22px",
                  borderRadius: 12,
                  background: "linear-gradient(180deg,#F49B2A,#E27D0C)",
                  color: "#211A12",
                  fontFamily: "var(--ed-disp)",
                  fontSize: 14,
                  fontWeight: 800,
                  textDecoration: "none",
                  boxShadow: "3px 4px 0 rgba(33,26,18,.18)",
                }}
              >
                Buy credits
              </a>
            ) : (
              <>
                <button
                  disabled
                  aria-disabled="true"
                  style={{
                    padding: "11px 22px",
                    borderRadius: 12,
                    border: "1px dashed rgba(154,78,30,.45)",
                    background: "var(--ed-inset, #F5EFE2)",
                    color: "#9A4E1E",
                    fontFamily: "var(--ed-disp)",
                    fontSize: 14,
                    fontWeight: 800,
                    cursor: "not-allowed",
                  }}
                >
                  Buy credits
                </button>
                <span
                  style={{
                    fontFamily: "var(--ed-m)",
                    fontSize: 13,
                    fontWeight: 700,
                    letterSpacing: "0.1em",
                    color: "#BE4F28",
                    background: "#FCE9CF",
                    borderRadius: 7,
                    padding: "4px 9px",
                  }}
                >
                  PAUSED
                </span>
                <span style={{ fontFamily: "var(--ed-body)", fontSize: 13, color: "#7A6E5A" }}>
                  Purchases open at launch.
                </span>
              </>
            )}
          </div>
        </section>

        {/* ── USAGE ── */}
        <section style={card} aria-labelledby="acct-usage">
          <div id="acct-usage" style={eyebrow}>
            Usage
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
            <span style={{ ...bigNum, fontSize: 40 }}>{usage.total.toLocaleString()}</span>
            <span style={{ fontFamily: "var(--ed-body)", fontSize: 14, color: "#7A6E5A" }}>
              creation{usage.total === 1 ? "" : "s"} all-time
            </span>
          </div>
          {usage.recent.length === 0 ? (
            <p style={{ fontFamily: "var(--ed-body)", fontSize: 14, color: "#7A6E5A", lineHeight: 1.6, margin: "14px 0 0" }}>
              No creations yet —{" "}
              <a className="acct-link" href="/studio">
                open the Studio
              </a>{" "}
              to make your first.
            </p>
          ) : (
            <ul style={{ listStyle: "none", margin: "14px 0 0", padding: 0 }}>
              {usage.recent.map((g) => (
                <li
                  key={g.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "8px 0",
                    borderBottom: "1px dashed var(--ed-hair, rgba(33,26,18,.13))",
                    fontFamily: "var(--ed-body)",
                    fontSize: 13.5,
                    color: "#3A3024",
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{ width: 8, height: 8, borderRadius: "50%", background: statusColor(g.status), flexShrink: 0 }}
                  />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    {/* duration is the real discriminator: every image path
                        writes duration 0, every video path writes its clip
                        length — don't call an image a "Pet video". */}
                    {g.duration > 0 ? `Pet video · ${g.duration}s` : "Pet image"}
                    <span style={{ color: "#7A6E5A" }}> · {g.status}</span>
                  </span>
                  <span style={{ fontFamily: "var(--ed-m)", fontSize: 13, fontWeight: 700, color: "#9A4E1E", whiteSpace: "nowrap" }}>
                    −{g.credits_charged} cr
                  </span>
                  <span style={{ fontFamily: "var(--ed-m)", fontSize: 13, color: "#9A7B4E", whiteSpace: "nowrap" }}>
                    {fmtDate(g.created_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ── SEASON ── */}
        <section style={card} aria-labelledby="acct-season">
          <div id="acct-season" style={eyebrow}>
            Season
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
            <span style={{ ...bigNum, fontSize: 40 }}>{season.points.toLocaleString()}</span>
            <span style={{ fontFamily: "var(--ed-body)", fontSize: 14, color: "#7A6E5A" }}>season points</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontFamily: "var(--ed-m)",
                fontSize: 13,
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: season.tier.color,
                border: `1.5px solid ${season.tier.color}`,
                borderRadius: 9,
                padding: "5px 11px",
                background: "var(--ed-paper, #FBF6EC)",
                boxShadow: "2px 3px 0 rgba(33,26,18,.12)",
              }}
            >
              <span aria-hidden="true">{season.tier.emoji}</span> {season.tier.name}
            </span>
            {season.next && (
              <span style={{ fontFamily: "var(--ed-body)", fontSize: 13, color: "#7A6E5A" }}>
                {season.to_next.toLocaleString()} pts to {season.next.name}
              </span>
            )}
          </div>
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(season.progress * 100)}
            aria-label={season.next ? `Progress toward ${season.next.name}` : "Top tier reached"}
            style={{
              height: 9,
              borderRadius: 6,
              background: "var(--ed-inset, #F5EFE2)",
              border: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
              marginTop: 14,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${Math.round(season.progress * 100)}%`,
                height: "100%",
                background: season.tier.color,
                transition: "width 400ms ease",
              }}
            />
          </div>
          <div style={{ marginTop: 14 }}>
            <a className="acct-link" style={{ fontFamily: "var(--ed-body)", fontSize: 13.5 }} href="/?section=season">
              Season Rewards hub →
            </a>
          </div>
        </section>

        {/* ── BILLING ── */}
        <section style={{ ...card, gridColumn: undefined }} className="acct-span2" aria-labelledby="acct-agent-runs">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div id="acct-agent-runs" style={{ ...eyebrow, marginBottom: 0 }}>
              Agent run receipts
            </div>
            <button
              type="button"
              onClick={() => setReloadKey((key) => key + 1)}
              style={{ border: "1px solid rgba(154,78,30,.35)", borderRadius: 9, background: "#FBF6EC", color: "#9A4E1E", padding: "7px 11px", fontFamily: "var(--ed-m)", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
            >
              Refresh receipts
            </button>
          </div>
          <p style={{ fontFamily: "var(--ed-body)", fontSize: 13.5, color: "#7A6E5A", lineHeight: 1.55, margin: "10px 0 14px" }}>
            Every paid PetClaw run has a client run ID. If a connection closes early, match that ID here before starting another run. Pet deletion waits for an active run to settle; after deletion, this owner-only table keeps only the minimal billing receipt and removes the pet name, goal, answer, and steps.
          </p>
          {agentRuns.length === 0 ? (
            <p style={{ fontFamily: "var(--ed-body)", fontSize: 14, color: "#7A6E5A", margin: 0 }}>
              No paid agent runs yet.
            </p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className="acct-table">
                <thead>
                  <tr>
                    <th scope="col">Run ID</th>
                    <th scope="col">Run context</th>
                    <th scope="col">State</th>
                    <th scope="col">Receipt</th>
                    <th scope="col">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {agentRuns.map((run) => {
                    const charged = run.billing?.outcome === "charged";
                    const terminal = run.state === "terminal";
                    return (
                      <tr key={run.run_id}>
                        <td title={run.run_id} style={{ fontFamily: "var(--ed-m)" }}>{run.run_id.slice(0, 8)}…</td>
                        <td
                          style={{ maxWidth: 330, overflow: "hidden", textOverflow: "ellipsis" }}
                          title={run.pet_deleted ? "Private run content removed with pet deletion" : run.goal || undefined}
                        >
                          {run.pet_deleted
                            ? <><b>Deleted pet</b> · private run content removed</>
                            : <><b>{run.pet_name || "Pet"}</b> · {run.goal || "—"}</>}
                        </td>
                        <td>
                          <span style={{ color: terminal ? statusColor(run.completed ? "completed" : "failed") : statusColor("pending"), fontFamily: "var(--ed-m)", fontWeight: 700, textTransform: "uppercase" }}>
                            {terminal ? (run.completed ? "completed" : run.stopped_reason || "stopped") : run.state}
                          </span>
                        </td>
                        <td>
                          {terminal && run.billing
                            ? charged
                              ? `${run.billing.creditsCharged ?? 0} cr charged`
                              : "refunded"
                            : "Pending reconciliation"}
                          {terminal && typeof run.credits_remaining === "number" ? ` · ${run.credits_remaining} left` : ""}
                        </td>
                        <td>{fmtDate(run.terminal_at || run.updated_at)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ── BILLING ── */}
        <section style={{ ...card, gridColumn: undefined }} className="acct-span2" aria-labelledby="acct-billing">
          <div id="acct-billing" style={eyebrow}>
            Billing
          </div>
          {purchases.length === 0 ? (
            <p style={{ fontFamily: "var(--ed-body)", fontSize: 14, color: "#7A6E5A", lineHeight: 1.6, margin: 0 }}>
              No purchases yet — packs open at launch.
            </p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className="acct-table">
                <thead>
                  <tr>
                    <th scope="col">Date</th>
                    <th scope="col">Pack</th>
                    <th scope="col">Amount</th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {purchases.map((p) => (
                    <tr key={p.id}>
                      <td>{fmtDate(p.created_at)}</td>
                      <td>
                        {p.credits.toLocaleString()} cr
                        {p.chain ? (
                          <span style={{ fontFamily: "var(--ed-m)", fontSize: 13, color: "#9A7B4E" }}> · {p.chain}</span>
                        ) : null}
                      </td>
                      <td>${p.amount_usd.toFixed(2)}</td>
                      <td>
                        <span
                          style={{
                            fontFamily: "var(--ed-m)",
                            fontSize: 13,
                            fontWeight: 700,
                            letterSpacing: "0.08em",
                            textTransform: "uppercase",
                            color: statusColor(p.status),
                          }}
                        >
                          {p.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!data.payments_enabled && (
            <p style={{ fontFamily: "var(--ed-body)", fontSize: 13, color: "#9A7B4E", margin: "14px 0 0" }}>
              Payment rails are paused pre-launch — this ledger only ever shows real recorded purchases.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
