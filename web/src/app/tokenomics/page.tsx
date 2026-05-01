import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Tokenomics — MY AI PET",
  description: "$PET token allocation, vesting, utility, and disclosures.",
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
      <div style={{ maxWidth: 880, margin: "0 auto" }}>
        <a href="/landing/" style={{
          display: "inline-block", marginBottom: 24,
          fontSize: 13, color: "rgba(26,26,46,0.55)", textDecoration: "none",
        }}>← Back to landing</a>

        <h1 style={{ fontSize: 38, fontWeight: 800, letterSpacing: "-0.02em", marginBottom: 6 }}>
          Tokenomics
        </h1>
        <div style={{ fontSize: 13, color: "rgba(26,26,46,0.5)", marginBottom: 28, fontWeight: 600 }}>
          Status: <span style={{ color: "#92400e" }}>Pre-TGE</span>
        </div>

        <div style={{
          padding: "16px 20px", borderRadius: 14,
          background: "rgba(245,158,11,0.08)",
          border: "1px solid rgba(245,158,11,0.25)",
          fontSize: 13, color: "#7c2d12", marginBottom: 32, lineHeight: 1.65,
        }}>
          <strong style={{ display: "block", marginBottom: 6 }}>Disclosure</strong>
          The numbers below are the proposed model and may change before TGE based on market
          feedback, audit recommendations, and regulatory review. The current Points system is
          a non-financial loyalty mechanism and does not represent a security, equity, or
          guaranteed claim on any future token. Final tokenomics will be published with a
          standalone whitepaper and a legal opinion.
        </div>

        <Section title="Token Overview">
          <Row label="Symbol" value="$PET" />
          <Row label="Standard" value="ERC-20 / BEP-20" />
          <Row label="Chain" value="BNB Smart Chain (mainnet)" />
          <Row label="Total Supply" value="1,000,000,000 (proposed, fixed cap, no inflation)" />
          <Row label="Decimals" value="18" />
          <Row label="Contract" value="Deployed at TGE — see /contracts" />
        </Section>

        <Section title="Allocation (proposed)">
          <Row label="Community / Airdrop" value="30%" subtext="From points conversion + activity-weighted distribution" />
          <Row label="Treasury / Ecosystem" value="25%" subtext="Skill marketplace incentives, partner integrations" />
          <Row label="Team & Advisors" value="20%" subtext="12-month cliff, 36-month linear vest" />
          <Row label="Liquidity & Market Making" value="10%" subtext="Initial DEX/CEX liquidity provisioning" />
          <Row label="Private Sale / Strategic" value="10%" subtext="6-month cliff, 24-month linear vest" />
          <Row label="Public Sale / IDO" value="5%" subtext="Unlocked at TGE" />
        </Section>

        <Section title="Token Utility">
          <Bullet>Generation credits — pay for AI image/video generation</Bullet>
          <Bullet>Skill marketplace currency — buy/sell pet skills (planned)</Bullet>
          <Bullet>Premium features — slot unlocks, evolution boosts, custom traits</Bullet>
          <Bullet>Governance — protocol parameter votes (post-DAO formation)</Bullet>
          <Bullet>Staking — fee discounts, priority queue access, revenue share (under review)</Bullet>
        </Section>

        <Section title="Points → Token Conversion">
          <p style={{ fontSize: 14, lineHeight: 1.7, color: "rgba(26,26,46,0.75)", margin: 0 }}>
            Engagement points (daily login, streaks, adoptions, content shares) accumulate
            off-chain. At TGE, points become eligible for conversion into $PET at a fixed
            ratio determined by the activity allocation above. Conversion may be subject to
            jurisdictional eligibility checks, KYC where required, and anti-Sybil cleanup.
            Bots, multi-accounts, and fraudulent points will be excluded — final eligibility
            criteria published 30 days before TGE.
          </p>
        </Section>

        <Section title="Compliance Posture">
          <Bullet>$PET is positioned as a <strong>utility token</strong> for accessing platform features.</Bullet>
          <Bullet>No promise of profit, dividend, or revenue share is made or implied.</Bullet>
          <Bullet>Sale availability and KYC requirements vary by jurisdiction. Restricted territories will be announced before TGE.</Bullet>
          <Bullet>A jurisdiction-specific legal opinion (US Howey Test, EU MiCA, KR 가상자산이용자보호법) is being prepared with external counsel.</Bullet>
        </Section>

        <Section title="Revenue Model (Live Today)">
          <p style={{ fontSize: 14, lineHeight: 1.7, color: "rgba(26,26,46,0.75)", margin: "0 0 14px" }}>
            The protocol generates real cash revenue <em>before</em> token launch via four streams.
            All flows settle in BSC-USDT to the treasury wallet and are individually verified
            on-chain (no off-chain payment processor in the critical path).
          </p>
          <Row label="① Credit packs" value="$5 → 500 / $20 → 2,500 / $50 → 10,000 credits" subtext="Used for AI image/video generation. Margin = USDT inflow − Grok+FAL API cost." />
          <Row label="② Premium items" value="$0.50 – $10 per item" subtext="Skill scrolls, evolution catalysts, gacha boxes. Pure margin (no API cost)." />
          <Row label="③ Pet slot unlocks" value="50 / 100 / 200 / 500 $PET (or USDT eq.)" subtext="Per-account pet limit expansion. Recurring revenue per ARPU growth." />
          <Row label="④ Skill marketplace fee" value="10% protocol fee (planned)" subtext="On every user-to-user skill sale once marketplace launches." />
        </Section>

        <Section title="Treasury Use of Funds">
          <Bullet><strong>40%</strong> — AI inference cost (Grok / FAL / Anthropic)</Bullet>
          <Bullet><strong>20%</strong> — Engineering & ops</Bullet>
          <Bullet><strong>15%</strong> — Liquidity provisioning &amp; market making (post-TGE)</Bullet>
          <Bullet><strong>15%</strong> — $PET buyback &amp; burn from on-chain revenue (post-TGE)</Bullet>
          <Bullet><strong>10%</strong> — Audits, legal, security</Bullet>
        </Section>

        <Section title="Token Value Capture">
          <p style={{ fontSize: 14, lineHeight: 1.7, color: "rgba(26,26,46,0.75)", margin: 0 }}>
            Once $PET is live, the buyback-and-burn mechanism converts a fixed share of monthly
            USDT revenue into $PET on a public DEX, then burns it. Generation costs and premium
            items become payable in $PET at a discounted ratio — incentivizing token demand.
            Skill marketplace fees collected in $PET also burn. <strong>This is not a points-only
            economy: real cash inflows directly drive token value.</strong>
          </p>
        </Section>

        <Section title="Live Metrics">
          <p style={{ fontSize: 14, lineHeight: 1.7, color: "rgba(26,26,46,0.75)", margin: 0 }}>
            All revenue and on-chain activity is published in real time at{" "}
            <a href="/stats" style={{ color: "#b45309", fontWeight: 700, textDecoration: "underline" }}>/stats</a>{" "}
            — pulled live from production Postgres + BSC. No marketing inflation, no hidden numbers.
            DD verifiers can hit <code style={{ fontSize: 12 }}>GET /api/analytics/protocol</code> directly.
          </p>
        </Section>

        <Section title="Roadmap">
          <Row label="Q2 2026" value="Whitepaper v1 + first audit + revenue ramp" />
          <Row label="Q3 2026" value="Second audit + multisig migration + private sale" />
          <Row label="Q4 2026" value="TGE + public listing + points conversion live" />
          <Row label="2027+"   value="DAO formation, skill marketplace launch" />
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 32 }}>
      <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 14 }}>{title}</h2>
      <div style={{ padding: 18, borderRadius: 14, background: "white", border: "1px solid rgba(0,0,0,0.06)" }}>
        {children}
      </div>
    </section>
  );
}

function Row({ label, value, subtext }: { label: string; value: string; subtext?: string }) {
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "200px 1fr", gap: 14,
      padding: "10px 0", borderBottom: "1px dashed rgba(0,0,0,0.06)",
    }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: "rgba(26,26,46,0.6)", letterSpacing: "0.02em" }}>
        {label}
      </div>
      <div>
        <div style={{ fontSize: 14, color: "#1a1a2e", fontWeight: 600 }}>{value}</div>
        {subtext && <div style={{ fontSize: 12, color: "rgba(26,26,46,0.5)", marginTop: 3 }}>{subtext}</div>}
      </div>
    </div>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 14, lineHeight: 1.65, color: "rgba(26,26,46,0.75)", marginBottom: 8, paddingLeft: 18, position: "relative" }}>
      <span style={{ position: "absolute", left: 0, top: 8, width: 6, height: 6, borderRadius: "50%", background: "#f59e0b" }} />
      {children}
    </div>
  );
}
