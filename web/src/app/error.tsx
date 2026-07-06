"use client";

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div style={{ padding: 40, fontFamily: "var(--ed-m, ui-monospace, monospace)", background: "#211A12", color: "#FFF8EE", minHeight: "100vh" }}>
      <h1 style={{ color: "#BE4F28", marginBottom: 16 }}>Client Error</h1>
      <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-all", background: "#1E1710", padding: 20, borderRadius: 8, marginBottom: 16 }}>
        {error.message}
      </pre>
      <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-all", background: "#1E1710", padding: 20, borderRadius: 8, fontSize: 13, color: "#E8C77E", marginBottom: 16 }}>
        {error.stack}
      </pre>
      <button onClick={reset} style={{ padding: "10px 20px", background: "linear-gradient(180deg,#F49B2A,#E27D0C)", color: "#FFF8EE", border: "none", borderRadius: 8, cursor: "pointer" }}>
        Try Again
      </button>
    </div>
  );
}
