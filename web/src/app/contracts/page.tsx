import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Contracts — MY AI PET",
  description: "On-chain contract addresses, audit status, and verification links.",
};

const CONTRACTS = [
  { name: "PETContent (NFT)",       addr: "0xB31B656D3790bFB3b3331D6A6BF0abf3dd6b0d9c", status: "Deployed (paused)", note: "ERC-721 for AI-generated content NFTs + memory anchors — on BSC, migrating to Base" },
  { name: "PetaGenTracker",         addr: "0x590D3b2CD0AB9aEE0e0d7Fd48E8810b20ec8Ac0a", status: "Deployed (paused)", note: "Records generation events on-chain — on BSC, migrating to Base" },
  { name: "PETActivity",            addr: "TBD",                                          status: "Planned",    note: "Per-user activity recorder (gasless, roadmap)" },
  { name: "PETSoul",                addr: "TBD",                                          status: "Planned",    note: "Pet identity registry + successor inheritance (roadmap)" },
];

export default function ContractsPage() {
  return (
    <div style={{
      minHeight: "100vh",
      background: "#ECE4D4",
      fontFamily: "var(--ed-body, sans-serif)",
      color: "#211A12",
      padding: "80px 24px",
    }}>
      <div style={{ maxWidth: 880, margin: "0 auto" }}>
        <a href="/" style={{
          display: "inline-block", marginBottom: 24,
          fontSize: 13, color: "rgba(33,26,18,0.55)", textDecoration: "none",
        }}>← Back to landing</a>

        <h1 style={{ fontSize: 38, fontWeight: 800, letterSpacing: "-0.02em", marginBottom: 6 }}>
          Smart Contracts
        </h1>
        <p style={{ fontSize: 15, color: "rgba(33,26,18,0.65)", marginBottom: 32, lineHeight: 1.6 }}>
          Two production contracts were deployed on <strong>BNB Smart Chain (chain id 56)</strong>{" "}
          during the build (BSCScan-verified at deploy time); the deployment is being migrated to{" "}
          <strong>Base</strong> ahead of go-live, and further contracts are prepared. On-chain
          features are currently <strong>paused (holding period)</strong> and will be anchored on
          Base at go-live. An external audit is planned pre-launch — announcements published here
          once finalized. See the disclosure below.
        </p>

        <div style={{
          padding: "14px 18px", borderRadius: 12,
          background: "rgba(190,79,40,0.10)",
          border: "1px solid rgba(190,79,40,0.25)",
          fontSize: 13, color: "#9A4E1E", marginBottom: 32, lineHeight: 1.6,
        }}>
          <strong>Holding period notice (2026-Q2)</strong><br/>
          Server-side on-chain recording and NFT minting are temporarily paused while we
          (a) finalize relayer wallet operations, (b) complete the external security audit,
          and (c) deploy the remaining contracts above. The application remains fully usable;
          on-chain features will resume publicly as each milestone clears.
        </div>

        <div style={{ display: "grid", gap: 12, marginBottom: 40 }}>
          {CONTRACTS.map((c) => (
            <div key={c.name} style={{
              padding: 16, borderRadius: 14,
              background: "#FBF6EC", border: "1px solid rgba(33,26,18,0.13)",
              display: "grid", gridTemplateColumns: "1fr auto", gap: 16, alignItems: "center",
            }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{c.name}</div>
                <div style={{
                  fontFamily: "var(--ed-m, ui-monospace, monospace)", fontSize: 13, color: "rgba(33,26,18,0.55)",
                  wordBreak: "break-all", marginBottom: 4,
                }}>
                  {c.addr === "TBD" ? "— address pending —" : c.addr}
                </div>
                <div style={{ fontSize: 13, color: "rgba(33,26,18,0.65)" }}>{c.note}</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
                <span style={{
                  fontSize: 13, padding: "3px 10px", borderRadius: 999,
                  background: c.status.startsWith("Deployed") ? "rgba(190,79,40,0.12)" : "rgba(33,26,18,0.06)",
                  color: c.status.startsWith("Deployed") ? "#9A4E1E" : "rgba(33,26,18,0.65)",
                  fontWeight: 700, letterSpacing: "0.06em",
                }}>{c.status.toUpperCase()}</span>
                {c.addr !== "TBD" && (
                  <a
                    href={`https://bscscan.com/address/${c.addr}`}
                    target="_blank" rel="noopener noreferrer"
                    style={{
                      fontSize: 13, padding: "5px 12px", borderRadius: 8,
                      background: "rgba(33,26,18,0.04)", color: "#211A12",
                      textDecoration: "none", fontWeight: 600,
                      border: "1px solid rgba(33,26,18,0.13)",
                    }}
                  >BSCScan (build) ↗</a>
                )}
              </div>
            </div>
          ))}
        </div>

        <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 12, marginTop: 32 }}>
          Audits
        </h2>
        <div style={{ padding: 16, borderRadius: 14, background: "#FBF6EC", border: "1px solid rgba(33,26,18,0.13)" }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Internal review — In progress</div>
          <div style={{ fontSize: 13, color: "rgba(33,26,18,0.55)", lineHeight: 1.55 }}>
            Core team review of the two deployed contracts. External audit firm announcements
            will be published here once finalized — not before.
          </div>
        </div>

        <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 12, marginTop: 32 }}>
          Ownership
        </h2>
        <ul style={{ fontSize: 14, lineHeight: 1.8, color: "rgba(33,26,18,0.75)", paddingLeft: 18 }}>
          <li>Deployer wallet: <code style={{ fontSize: 13 }}>0x872d5f7F03894EE5c8b84D22868009B58b927357</code></li>
          <li>Upgradeability: deployed contracts are <strong>non-upgradeable</strong>.</li>
          <li>Current status: team-controlled owner / relayer operations while on-chain features are paused.</li>
          <li>Owner privileges: pause/unpause where supported, relayer and admin operations for deployed provenance contracts.</li>
          <li>Legacy PETToken/PETShop contracts are not part of the live user flow; their owner controls include minter management, tier changes, pause, and USDT withdrawal until formally deprecated or transferred to multisig.</li>
        </ul>
      </div>
    </div>
  );
}
