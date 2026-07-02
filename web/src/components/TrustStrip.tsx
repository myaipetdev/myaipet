"use client";

/**
 * Trust strip — sits above the footer on every page. Two columns:
 *   • On-chain (verifiable contract addresses linking to BscScan)
 *   • Your data (links to sovereignty / SOUL export)
 *
 * The point is to plant proof in front of every user who scrolls past
 * the fold without having to read a paragraph. Designed to feel like
 * a "fine print but actually load-bearing" zone — the line between
 * marketing and proof.
 */

export default function TrustStrip() {
  return (
    <div className="mp-enter" style={{
      maxWidth: 1180, margin: "60px auto 0", padding: "0 24px",
    }}>
      <div className="mp-lift" style={{
        background: "white", borderRadius: 18,
        border: "1px solid rgba(0,0,0,0.06)",
        padding: "28px 28px",
        boxShadow: "0 2px 14px rgba(15,23,42,0.04)",
        cursor: "default",
      }}>
        <div style={{
          fontSize: 12, fontFamily: "'JetBrains Mono', monospace",
          letterSpacing: "0.18em", color: "rgba(26,26,46,0.55)",
          textAlign: "center", marginBottom: 22,
        }}>
          ON-CHAIN · YOUR DATA
        </div>

        <div style={{
          display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 18,
        }}>
          <TrustColumn
            emoji="⛓"
            title="On-chain at go-live"
            sub="Your pet's soul + activity anchor on-chain at go-live — non-upgradeable, owner-minimized."
            rows={[
              { label: "Contracts & roadmap", value: "View →", href: "/contracts" },
            ]}
          />
          <TrustColumn
            emoji="🔐"
            title="Your pet, your data"
            sub="SOUL export ships your full memory ledger off-platform."
            rows={[
              { label: "Sovereignty controls", value: "Open →", href: "/sovereignty" },
            ]}
            accent="#7c3aed"
          />
        </div>
      </div>
    </div>
  );
}

function TrustColumn({
  emoji, title, sub, rows, accent,
}: {
  emoji: string; title: string; sub: string;
  rows: { label: string; value: string; href: string }[];
  accent?: string;
}) {
  return (
    <div>
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        marginBottom: 8,
      }}>
        <div style={{
          width: 38, height: 38, borderRadius: 12,
          background: accent ? `${accent}1A` : "rgba(245,158,11,0.12)",
          color: accent || "#b45309",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 20, flexShrink: 0,
        }}>{emoji}</div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: "-0.01em", color: "#1a1a2e" }}>
            {title}
          </div>
          <div style={{ fontSize: 12, color: "rgba(26,26,46,0.55)", marginTop: 2 }}>
            {sub}
          </div>
        </div>
      </div>
      <div style={{
        marginTop: 10, padding: "12px 14px",
        background: "rgba(0,0,0,0.025)", borderRadius: 12,
        display: "flex", flexDirection: "column", gap: 8,
      }}>
        {rows.map((r, i) => (
          <a key={i} href={r.href} target={r.href.startsWith("http") ? "_blank" : undefined}
             rel={r.href.startsWith("http") ? "noopener noreferrer" : undefined}
             className="mp-lift"
             style={{
               display: "flex", alignItems: "center", justifyContent: "space-between",
               padding: "8px 12px", borderRadius: 8,
               background: "white", border: "1px solid rgba(0,0,0,0.05)",
               textDecoration: "none",
             }}>
            <span style={{ fontSize: 12, color: "rgba(26,26,46,0.65)", fontWeight: 500 }}>
              {r.label}
            </span>
            <span style={{
              fontSize: 12, fontFamily: "'JetBrains Mono', monospace",
              color: accent || "#b45309", fontWeight: 700,
            }}>{r.value}</span>
          </a>
        ))}
      </div>
    </div>
  );
}
