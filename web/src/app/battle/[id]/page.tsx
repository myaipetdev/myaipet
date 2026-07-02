/**
 * Battle pages were the wrong direction — the streak/mission loop is the
 * product. Routes are preserved so old share-links don't 404, but they
 * render a polite "this is archived" panel instead of the old simulator.
 */

export const metadata = {
  title: "Archived — MY AI PET",
  robots: { index: false, follow: false },
};

export default function BattleArchivedPage() {
  return (
    <div style={{
      minHeight: "100vh", background: "#faf7f2", color: "#1a1a2e",
      fontFamily: "'Space Grotesk', sans-serif",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "40px 24px",
    }}>
      <div style={{
        maxWidth: 540, width: "100%",
        background: "white", borderRadius: 22,
        border: "1px solid rgba(0,0,0,0.06)",
        padding: "44px 36px", textAlign: "center",
        boxShadow: "0 4px 24px rgba(0,0,0,0.04)",
      }}>
        <div style={{ marginBottom: 20, lineHeight: 0 }}>
          <svg
            width={60} height={60} viewBox="0 0 60 60"
            fill="none" xmlns="http://www.w3.org/2000/svg"
            role="img" aria-label="Archived"
            style={{ display: "inline-block" }}
          >
            {/* peaceful dove — retirement / archived */}
            <path
              d="M11 38c0-9.4 7.6-17 17-17 4.7 0 9 1.9 12.1 5l8.4-3.2-3.6 7.7c.7 1.8 1.1 3.7 1.1 5.7"
              stroke="#f59e0b" strokeWidth={2.6}
              strokeLinecap="round" strokeLinejoin="round"
            />
            <path
              d="M28 21c-1.4-4.2-5-7.2-9.4-7.6M28 21l-9.5 9.5c-2.5 2.5-6.1 3.6-9.6 2.9"
              stroke="#1a1a2e" strokeWidth={2.6}
              strokeLinecap="round" strokeLinejoin="round"
            />
            <path
              d="M28 38c2.6 4.4 7.4 7.2 12.6 7.2"
              stroke="#1a1a2e" strokeWidth={2.6}
              strokeLinecap="round" strokeLinejoin="round"
            />
            <circle cx={40.5} cy={26} r={1.6} fill="#1a1a2e" />
          </svg>
        </div>
        <div style={{
          fontSize: 13, fontFamily: "'JetBrains Mono', monospace",
          letterSpacing: "0.18em", color: "rgba(26,26,46,0.55)",
          marginBottom: 10,
        }}>BATTLE · ARCHIVED</div>
        <h1 style={{
          fontSize: 28, fontWeight: 800, margin: "0 0 12px",
          letterSpacing: "-0.02em",
        }}>
          We retired battles
        </h1>
        <p style={{
          fontSize: 16, color: "rgba(26,26,46,0.65)", lineHeight: 1.6,
          margin: "0 auto 24px", maxWidth: 420,
        }}>
          MY AI PET is the streak, memory ledger, and daily-mission loop now —
          not on-chain combat. Your pet still has every stat and every memory.
          We just gave the combat sim the day off.
        </p>
        <a href="/?section=airdrop" style={{
          display: "inline-block",
          padding: "14px 26px", borderRadius: 14, border: "none",
          background: "linear-gradient(135deg,#fbbf24,#f59e0b)",
          color: "white", fontWeight: 800, fontSize: 16,
          textDecoration: "none",
          boxShadow: "0 6px 18px rgba(245,158,11,0.30)",
          fontFamily: "'Space Grotesk', sans-serif",
        }}>Go to today's missions →</a>
      </div>
    </div>
  );
}
