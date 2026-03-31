"use client";

import { useState, useEffect } from "react";

function Counter({ end, duration = 2000, prefix = "", suffix = "" }: any) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    let start = 0;
    const step = end / (duration / 16);
    const t = setInterval(() => {
      start += step;
      if (start >= end) { setVal(end); clearInterval(t); }
      else setVal(Math.floor(start));
    }, 16);
    return () => clearInterval(t);
  }, [end, duration]);
  return <>{prefix}{val.toLocaleString()}{suffix}</>;
}

export default function Stats({ stats }: any) {
  return (
    <div style={{
      display: "flex", gap: 1, background: "rgba(255,255,255,0.7)",
      borderRadius: 14, overflow: "hidden", border: "1px solid rgba(0,0,0,0.06)",
      boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
    }}>
      {stats.map((s: any, i: number) => (
        <div key={i} style={{
          flex: 1, padding: "18px 22px", background: "rgba(255,255,255,0.5)",
          borderRight: i < stats.length - 1 ? "1px solid rgba(0,0,0,0.06)" : "none",
        }}>
          <div style={{
            fontFamily: "mono", fontSize: 10, color: "rgba(26,26,46,0.45)",
            textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6,
          }}>
            {s.label}
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
            <span style={{
              fontFamily: "'Space Grotesk',sans-serif", fontSize: 24, fontWeight: 700,
              color: "#1a1a2e", letterSpacing: "-0.02em",
            }}>
              {s.animated
                ? <Counter end={s.raw} prefix={s.prefix || ""} suffix={s.suffix || ""} />
                : s.value}
            </span>
            {s.change != null && s.change !== 0 && (
              <span style={{
                fontFamily: "mono", fontSize: 11, fontWeight: 500,
                color: String(s.change).startsWith("+") || Number(s.change) > 0 ? "#4ade80" : "#f87171",
              }}>
                {typeof s.change === "number" ? (s.change > 0 ? `+${s.change}%` : `${s.change}%`) : s.change}
              </span>
            )}
          </div>
          {s.sub && (
            <div style={{ fontFamily: "mono", fontSize: 10, color: "rgba(26,26,46,0.35)", marginTop: 3 }}>
              {s.sub}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
