"use client";

import { useEffect } from "react";

// Friendly production error boundary — never dump error.message/stack to users
// (internal paths + provider details leaked). Diagnostics go to the console;
// the stack renders only in development.
export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    console.error("[app-error]", error);
  }, [error]);

  const dev = process.env.NODE_ENV === "development";

  return (
    <div style={{
      minHeight: "100vh", background: "#ECE4D4", color: "#211A12",
      fontFamily: "var(--ed-body, ui-sans-serif, sans-serif)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
    }}>
      <div style={{
        maxWidth: 460, width: "100%", textAlign: "center",
        background: "#FBF6EC", borderRadius: 20, padding: "36px 30px",
        border: "1px solid rgba(33,26,18,.13)",
        boxShadow: "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))",
      }}>
        <img src="/mascot.jpg" alt="" style={{ width: 64, height: 64, borderRadius: "50%", objectFit: "cover", border: "1px solid rgba(33,26,18,.13)", marginBottom: 14 }} />
        <h1 style={{ fontFamily: "var(--ed-disp, sans-serif)", fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em", margin: "0 0 8px" }}>
          Something went wrong
        </h1>
        <p style={{ fontSize: 14, color: "#5C5140", lineHeight: 1.6, margin: "0 0 20px" }}>
          Your pet is fine — this page just hiccuped. Try again, or head home.
        </p>
        <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
          <button onClick={reset} style={{
            padding: "11px 22px", borderRadius: 12, border: "none", cursor: "pointer",
            background: "linear-gradient(180deg,#F49B2A,#E27D0C)", color: "#FFF8EE",
            fontFamily: "var(--ed-disp, sans-serif)", fontWeight: 700, fontSize: 14,
          }}>
            Try again
          </button>
          <a href="/" style={{
            padding: "11px 22px", borderRadius: 12, textDecoration: "none",
            border: "1px solid rgba(33,26,18,.13)", background: "#F5EFE2",
            color: "#211A12", fontFamily: "var(--ed-disp, sans-serif)", fontWeight: 700, fontSize: 14,
          }}>
            Back home
          </a>
        </div>
        {dev && (
          <pre style={{
            marginTop: 20, textAlign: "left", whiteSpace: "pre-wrap", wordBreak: "break-all",
            background: "#1E1710", color: "#E8C77E", padding: 14, borderRadius: 10,
            fontSize: 13, fontFamily: "var(--ed-m, ui-monospace, monospace)",
          }}>
            {error.message}
            {"\n\n"}
            {error.stack}
          </pre>
        )}
      </div>
    </div>
  );
}
