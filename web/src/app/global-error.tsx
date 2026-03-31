"use client";

export default function GlobalError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <html>
      <body style={{ padding: 40, fontFamily: "monospace", background: "#1a1a2e", color: "#fff" }}>
        <h1 style={{ color: "#ff6b6b", marginBottom: 16 }}>Global Error</h1>
        <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-all", background: "#111", padding: 20, borderRadius: 8, marginBottom: 16 }}>
          {error.message}
        </pre>
        <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-all", background: "#111", padding: 20, borderRadius: 8, fontSize: 11, color: "#888", marginBottom: 16 }}>
          {error.stack}
        </pre>
        <button onClick={reset} style={{ padding: "10px 20px", background: "#fbbf24", color: "#000", border: "none", borderRadius: 8, cursor: "pointer" }}>
          Try Again
        </button>
      </body>
    </html>
  );
}
