/**
 * /stats — public live-metrics page.
 *
 * DD report flagged this as a transparency liability at the current stage
 * (very low absolute numbers visible to anyone). Replaced with a gated
 * landing: admin wallets get sent to /admin/analytics, everyone else sees
 * a neutral disclosure about private-phase visibility.
 */

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Metrics — MY AI PET",
  description: "On-chain protocol metrics.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function StatsPage() {
  return (
    <div style={{
      minHeight: "100vh", background: "#faf7f2",
      fontFamily: "'Space Grotesk', sans-serif", color: "#1a1a2e",
      padding: "80px 24px",
    }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <a href="/" style={{
          display: "inline-block", marginBottom: 24,
          fontSize: 13, color: "rgba(26,26,46,0.55)", textDecoration: "none",
        }}>← Back</a>

        <h1 style={{ fontSize: 32, fontWeight: 800, letterSpacing: "-0.02em", margin: "0 0 14px" }}>
          Protocol Metrics
        </h1>

        <div style={{
          padding: "20px 24px", borderRadius: 14,
          background: "white", border: "1px solid rgba(0,0,0,0.06)",
          fontSize: 14, color: "rgba(26,26,46,0.75)", lineHeight: 1.7,
          marginBottom: 18,
        }}>
          Live metrics are available to verified team members and backers in the
          private admin dashboard. We don't publish absolute counts during the
          private build phase — the surface is reserved for parties under NDA.
        </div>

        <div style={{
          padding: "16px 20px", borderRadius: 10,
          background: "rgba(245,158,11,0.06)",
          border: "1px solid rgba(245,158,11,0.18)",
          fontSize: 12, color: "rgba(26,26,46,0.7)", lineHeight: 1.6,
          fontFamily: "'JetBrains Mono', monospace",
        }}>
          What's publicly verifiable today: deployed contracts at{" "}
          <a href="/contracts" style={{ color: "#b45309", fontWeight: 700 }}>/contracts</a> (on BscScan),
          the open{" "}
          <a href="/.well-known/pet-card.json" style={{ color: "#b45309", fontWeight: 700 }}>petclaw protocol manifest</a>,
          and the skill registry at{" "}
          <a href="/skills" style={{ color: "#b45309", fontWeight: 700 }}>/skills</a>.
        </div>

        <div style={{
          marginTop: 22, padding: 14, borderRadius: 10,
          background: "white", border: "1px solid rgba(0,0,0,0.06)",
          fontSize: 12, color: "rgba(26,26,46,0.5)",
        }}>
          Admin / backer access:{" "}
          <a href="/admin/analytics" style={{ color: "#b45309", fontWeight: 700, textDecoration: "underline" }}>
            /admin/analytics
          </a>{" "}
          (wallet-gated)
        </div>
      </div>
    </div>
  );
}
