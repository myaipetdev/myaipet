"use client";

export default function Feed({ activities }: any) {
  return (
    <div style={{
      background: "#FBF6EC", borderRadius: 14,
      border: "1px solid var(--ed-hair, rgba(33,26,18,.13))", overflow: "hidden",
      boxShadow: "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))",
    }}>
      <div style={{
        padding: "14px 18px", borderBottom: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <div style={{
            width: 7, height: 7, borderRadius: "50%", background: "#1A7E68",
            animation: "pulse 2s infinite",
          }} />
          <span style={{
            fontFamily: "var(--ed-m)", fontSize: 12, color: "#7A6E5A",
            fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.12em",
          }}>
            Recent Activity
          </span>
        </div>
        <span style={{ fontFamily: "var(--ed-m)", fontSize: 12, color: "#9A7B4E" }}>
          Multi-chain
        </span>
      </div>
      <div style={{ maxHeight: 340, overflow: "hidden" }}>
        {activities.map((a: any, i: number) => (
          <div key={i} style={{
            display: "flex", alignItems: "center", gap: 10, padding: "10px 18px",
            borderBottom: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
            opacity: 1 - i * 0.07,
            animation: i === 0 ? "slideIn 0.4s ease-out" : "none",
          }}>
            <span style={{ fontSize: 14, width: 22, textAlign: "center" }}>{a.icon}</span>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontFamily: "var(--ed-m)", fontSize: 13, color: "#9A4E1E", fontWeight: 700 }}>
                  {a.wallet}
                </span>
{a.tx_hash && a.chain && (
                <span style={{
                  fontSize: 12, lineHeight: 1, padding: "2px 6px", borderRadius: 6,
                  background: a.chain === "Base" ? "rgba(62,143,224,0.10)" : "rgba(190,79,40,0.10)",
                  color: a.chain === "Base" ? "#3E8FE0" : "#9A4E1E",
                  fontFamily: "var(--ed-m)", fontWeight: 500,
                }}>
                  {a.chain}
                </span>
                )}
              </div>
              <span style={{ fontFamily: "var(--ed-m)", fontSize: 12, color: "#5C5140" }}>
                {a.text}
              </span>
            </div>
            <span style={{
              fontFamily: "var(--ed-m)", fontSize: 12, color: "#9A7B4E", whiteSpace: "nowrap",
            }}>
              {a.time}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
