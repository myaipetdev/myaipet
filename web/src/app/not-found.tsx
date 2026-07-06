// On-design 404 — the default white page offered no way back.
export default function NotFound() {
  return (
    <div style={{
      minHeight: "100vh", background: "#ECE4D4", color: "#211A12",
      fontFamily: "var(--ed-body, ui-sans-serif, sans-serif)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
    }}>
      <div style={{
        maxWidth: 420, width: "100%", textAlign: "center",
        background: "#FBF6EC", borderRadius: 20, padding: "36px 30px",
        border: "1px solid rgba(33,26,18,.13)",
        boxShadow: "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))",
      }}>
        <img src="/mascot.jpg" alt="" style={{ width: 64, height: 64, borderRadius: "50%", objectFit: "cover", border: "1px solid rgba(33,26,18,.13)", marginBottom: 14 }} />
        <div style={{ fontFamily: "var(--ed-m, ui-monospace, monospace)", fontSize: 13, fontWeight: 700, letterSpacing: "0.16em", color: "#9A4E1E", marginBottom: 6 }}>
          404 · PAGE NOT FOUND
        </div>
        <h1 style={{ fontFamily: "var(--ed-disp, sans-serif)", fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em", margin: "0 0 8px" }}>
          This page wandered off
        </h1>
        <p style={{ fontSize: 14, color: "#5C5140", lineHeight: 1.6, margin: "0 0 20px" }}>
          The page you&apos;re looking for doesn&apos;t exist — but your pet is waiting.
        </p>
        <a href="/" style={{
          display: "inline-block", padding: "11px 24px", borderRadius: 12, textDecoration: "none",
          background: "linear-gradient(180deg,#F49B2A,#E27D0C)", color: "#FFF8EE",
          fontFamily: "var(--ed-disp, sans-serif)", fontWeight: 700, fontSize: 14,
        }}>
          Back to MY AI PET →
        </a>
      </div>
    </div>
  );
}
