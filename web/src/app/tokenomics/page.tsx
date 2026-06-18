import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Points Economy — MY AI PET",
  description: "MY AI PET runs on a points-based loyalty economy. Future token redemption is on the roadmap.",
};

export default function TokenomicsPage() {
  return (
    <div style={{
      minHeight: "100vh",
      background: "#faf7f2",
      fontFamily: "'Space Grotesk', sans-serif",
      color: "#1a1a2e",
      padding: "80px 24px",
    }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <a href="/" style={{
          display: "inline-block", marginBottom: 24,
          fontSize: 13, color: "rgba(26,26,46,0.55)", textDecoration: "none",
        }}>← Back to landing</a>

        <h1 style={{ fontSize: 38, fontWeight: 800, letterSpacing: "-0.02em", marginBottom: 6 }}>
          Points Economy
        </h1>
        <div style={{ fontSize: 13, color: "rgba(26,26,46,0.65)", marginBottom: 28, fontWeight: 600 }}>
          Status: <span style={{ color: "#16a34a" }}>Live — points only, no token</span>
        </div>

        <div style={{
          padding: "16px 20px", borderRadius: 14,
          background: "rgba(74,222,128,0.08)",
          border: "1px solid rgba(74,222,128,0.25)",
          fontSize: 13, color: "#166534", marginBottom: 32, lineHeight: 1.65,
        }}>
          <strong style={{ display: "block", marginBottom: 6 }}>What runs today</strong>
          MY AI PET uses a non-financial Points system as the reward currency. Points are
          earned through gameplay (interactions, AI creations, evolutions, daily streaks, weekly
          leaderboard standing) and spent on in-game items, slot unlocks, and premium actions.
          Points are <strong>not</strong> a token, security, equity, or transferable claim.
        </div>

        <h2 style={{ fontSize: 20, fontWeight: 800, margin: "0 0 12px" }}>How points flow</h2>
        <div style={{
          padding: "18px 22px", borderRadius: 12, background: "white",
          border: "1px solid rgba(0,0,0,0.06)", marginBottom: 18,
          fontSize: 14, lineHeight: 1.8, color: "rgba(26,26,46,0.8)",
        }}>
          <strong>Earn:</strong> daily care · AI creations · level-ups · evolutions ·
          weekly Top-100 Season Rewards points · 7-day care streak earns a Memory NFT
          (mints at on-chain go-live).<br /><br />
          <strong>Spend:</strong> shop items · pet slot unlocks · equipment · premium actions
          (overflow Feed/Play after the daily free cap).
        </div>

        <h2 style={{ fontSize: 20, fontWeight: 800, margin: "24px 0 12px" }}>Revenue lines (USDT)</h2>
        <div style={{
          padding: "18px 22px", borderRadius: 12, background: "white",
          border: "1px solid rgba(0,0,0,0.06)", marginBottom: 18,
          fontSize: 14, lineHeight: 1.8, color: "rgba(26,26,46,0.8)",
        }}>
          The product will accept USDT for credit purchases, power upgrades, extra feeds/plays,
          skill installs, and premium items (purchases are currently paused). All revenue flows to the project treasury and
          funds AI inference, engineering, and ops. No token is created from this revenue.
          A future token + redemption path may be introduced — see <a href="/architecture"
          style={{ color: "#b45309", fontWeight: 700 }}>/architecture</a>.
        </div>

        <h2 style={{ fontSize: 20, fontWeight: 800, margin: "24px 0 12px" }}>Live metrics</h2>
        <div style={{
          padding: "18px 22px", borderRadius: 12, background: "white",
          border: "1px solid rgba(0,0,0,0.06)", marginBottom: 18,
          fontSize: 14, lineHeight: 1.8, color: "rgba(26,26,46,0.8)",
        }}>
          Operational metrics are available to verified team members and backers
          under NDA in the admin dashboard. Public surfaces during the private
          phase: contracts at <a href="/contracts" style={{ color: "#b45309", fontWeight: 700 }}>/contracts</a>{" "}
          and the protocol manifest.
        </div>

        <div style={{
          marginTop: 28, padding: "14px 18px", borderRadius: 10,
          background: "rgba(0,0,0,0.03)", fontSize: 12, color: "rgba(26,26,46,0.65)",
          lineHeight: 1.7, fontFamily: "'JetBrains Mono', monospace",
        }}>
          ⚠ This page replaces the prior tokenomics document. No token mint, no buyback-and-burn,
          no airdrop of a financial instrument is active or scheduled at this time. Anything you
          read elsewhere about "$PET token" reflects an earlier draft and is not the current
          operating model.
        </div>
      </div>
    </div>
  );
}
