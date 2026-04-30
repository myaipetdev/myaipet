import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Contracts — MY AI PET",
  description: "On-chain contract addresses, audit status, and verification links.",
};

const CONTRACTS = [
  { name: "PETContent (NFT)",       addr: "0xB31B656D3790bFB3b3331D6A6BF0abf3dd6b0d9c", status: "Deployed", note: "ERC-721 for AI-generated content NFTs" },
  { name: "PetaGenTracker",         addr: "0x590D3b2CD0AB9aEE0e0d7Fd48E8810b20ec8Ac0a", status: "Deployed", note: "Records generation events on-chain" },
  { name: "PETToken ($PET)",        addr: "TBD",                                          status: "Pending TGE", note: "Utility token — not yet deployed" },
  { name: "PETShop",                addr: "TBD",                                          status: "Pending",    note: "USDT → $PET swap + premium catalog" },
  { name: "PETActivity",            addr: "TBD",                                          status: "Pending",    note: "Per-user activity recorder (gasless)" },
  { name: "PETSoul",                addr: "TBD",                                          status: "Pending",    note: "Pet identity registry + inheritance" },
];

export default function ContractsPage() {
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
          Smart Contracts
        </h1>
        <p style={{ fontSize: 15, color: "rgba(26,26,46,0.65)", marginBottom: 32, lineHeight: 1.6 }}>
          All contracts deployed on <strong>BNB Smart Chain (chain id 56)</strong>. Verification on
          BSCScan and third-party audits roll out as each contract goes live. On-chain features are
          currently in <strong>holding period</strong> — see the disclosure below.
        </p>

        <div style={{
          padding: "14px 18px", borderRadius: 12,
          background: "rgba(245,158,11,0.08)",
          border: "1px solid rgba(245,158,11,0.25)",
          fontSize: 13, color: "#92400e", marginBottom: 32, lineHeight: 1.6,
        }}>
          <strong>Holding period notice (2026-Q2)</strong><br/>
          Server-side on-chain recording and NFT minting are temporarily paused while we
          (a) finalize relayer wallet operations, (b) complete the second security audit,
          and (c) deploy the remaining contracts above. The application remains fully usable;
          on-chain features will resume publicly as each milestone clears.
        </div>

        <div style={{ display: "grid", gap: 12, marginBottom: 40 }}>
          {CONTRACTS.map((c) => (
            <div key={c.name} style={{
              padding: 16, borderRadius: 14,
              background: "white", border: "1px solid rgba(0,0,0,0.06)",
              display: "grid", gridTemplateColumns: "1fr auto", gap: 16, alignItems: "center",
            }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{c.name}</div>
                <div style={{
                  fontFamily: "monospace", fontSize: 12, color: "rgba(26,26,46,0.55)",
                  wordBreak: "break-all", marginBottom: 4,
                }}>
                  {c.addr === "TBD" ? "— address pending —" : c.addr}
                </div>
                <div style={{ fontSize: 12, color: "rgba(26,26,46,0.5)" }}>{c.note}</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
                <span style={{
                  fontSize: 10, padding: "3px 10px", borderRadius: 999,
                  background: c.status === "Deployed" ? "rgba(74,222,128,0.15)" : "rgba(0,0,0,0.06)",
                  color: c.status === "Deployed" ? "#16a34a" : "rgba(26,26,46,0.5)",
                  fontWeight: 700, letterSpacing: "0.06em",
                }}>{c.status.toUpperCase()}</span>
                {c.addr !== "TBD" && (
                  <a
                    href={`https://bscscan.com/address/${c.addr}`}
                    target="_blank" rel="noopener noreferrer"
                    style={{
                      fontSize: 11, padding: "5px 12px", borderRadius: 8,
                      background: "rgba(0,0,0,0.04)", color: "#1a1a2e",
                      textDecoration: "none", fontWeight: 600,
                      border: "1px solid rgba(0,0,0,0.08)",
                    }}
                  >BSCScan ↗</a>
                )}
              </div>
            </div>
          ))}
        </div>

        <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 12, marginTop: 32 }}>
          Audits
        </h2>
        <div style={{ padding: 16, borderRadius: 14, background: "white", border: "1px solid rgba(0,0,0,0.06)", marginBottom: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Audit #1 — In Progress</div>
          <div style={{ fontSize: 13, color: "rgba(26,26,46,0.55)", lineHeight: 1.55 }}>
            First-party review by the core team and an independent reviewer. Report and findings
            tracker will be published here once contracts are finalized for TGE.
          </div>
        </div>
        <div style={{ padding: 16, borderRadius: 14, background: "white", border: "1px solid rgba(0,0,0,0.06)" }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Audit #2 — Pending</div>
          <div style={{ fontSize: 13, color: "rgba(26,26,46,0.55)", lineHeight: 1.55 }}>
            Engagement with a recognized firm (e.g. CertiK, PeckShield, SlowMist) to be announced
            ahead of TGE. The full report will be linked here including any remediated findings.
          </div>
        </div>

        <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 12, marginTop: 32 }}>
          Ownership & Upgradeability
        </h2>
        <ul style={{ fontSize: 14, lineHeight: 1.8, color: "rgba(26,26,46,0.75)", paddingLeft: 18 }}>
          <li>Deployer wallet: <code style={{ fontSize: 12 }}>0x872d5f7F03894EE5c8b84D22868009B58b927357</code></li>
          <li>Multisig migration: planned before token launch (3-of-5 Gnosis Safe)</li>
          <li>Upgradeability: deployed contracts are non-upgradeable. Future contracts may use
            Transparent Proxy with a 48h timelock — disclosed per-contract.</li>
          <li>Owner privileges: minimal — limited to administrative emergency pause (where applicable).</li>
        </ul>
      </div>
    </div>
  );
}
