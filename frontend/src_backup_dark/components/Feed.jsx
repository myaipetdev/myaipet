export default function Feed({ activities }) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.015)", borderRadius: 14,
      border: "1px solid rgba(255,255,255,0.05)", overflow: "hidden",
    }}>
      <div style={{
        padding: "14px 18px", borderBottom: "1px solid rgba(255,255,255,0.04)",
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <div style={{
            width: 7, height: 7, borderRadius: "50%", background: "#4ade80",
            boxShadow: "0 0 10px rgba(74,222,128,0.5)", animation: "pulse 2s infinite",
          }} />
          <span style={{
            fontFamily: "mono", fontSize: 11, color: "rgba(255,255,255,0.45)",
            fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em",
          }}>
            Live On-Chain Activity
          </span>
        </div>
        <span style={{ fontFamily: "mono", fontSize: 10, color: "rgba(255,255,255,0.2)" }}>
          Multi-chain
        </span>
      </div>
      <div style={{ maxHeight: 340, overflow: "hidden" }}>
        {activities.map((a, i) => (
          <div key={i} style={{
            display: "flex", alignItems: "center", gap: 10, padding: "10px 18px",
            borderBottom: "1px solid rgba(255,255,255,0.025)",
            opacity: 1 - i * 0.07,
            animation: i === 0 ? "slideIn 0.4s ease-out" : "none",
          }}>
            <span style={{ fontSize: 14, width: 22, textAlign: "center" }}>{a.icon}</span>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontFamily: "mono", fontSize: 11, color: "#fbbf24", fontWeight: 600 }}>
                  {a.wallet}
                </span>
                <span style={{
                  fontSize: 9, padding: "1px 5px", borderRadius: 3,
                  background: a.chain === "Base" ? "rgba(59,130,246,0.08)" : "rgba(234,179,8,0.08)",
                  color: a.chain === "Base" ? "#60a5fa" : "#facc15",
                  fontFamily: "mono", fontWeight: 500,
                }}>
                  {a.chain}
                </span>
              </div>
              <span style={{ fontFamily: "mono", fontSize: 11, color: "rgba(255,255,255,0.35)" }}>
                {a.text}
              </span>
            </div>
            <span style={{
              fontFamily: "mono", fontSize: 10, color: "rgba(255,255,255,0.15)", whiteSpace: "nowrap",
            }}>
              {a.time}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
