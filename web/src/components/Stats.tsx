"use client";

import { useState, useEffect, useRef } from "react";

function Counter({ end, duration = 2000, prefix = "", suffix = "" }: any) {
  const [val, setVal] = useState(0);
  const valRef = useRef(0);
  valRef.current = val;
  useEffect(() => {
    // Animate from the value currently on screen to the new one (up OR down) so
    // a 15s stats refresh doesn't flash back to 0, and a shrink isn't left stale.
    let current = valRef.current;
    const diff = end - current;
    if (diff === 0) return;
    const step = diff / Math.max(1, Math.floor(duration / 16));
    const t = setInterval(() => {
      current += step;
      if ((step >= 0 && current >= end) || (step < 0 && current <= end)) { setVal(end); clearInterval(t); }
      else setVal(Math.floor(current));
    }, 16);
    return () => clearInterval(t);
  }, [end, duration]);
  return <>{prefix}{val.toLocaleString()}{suffix}</>;
}

export default function Stats({ stats }: any) {
  return (
    <div className="mp-enter" style={{
      display: "flex", gap: 1, background: "rgba(255,255,255,0.7)",
      borderRadius: 18, overflow: "hidden", border: "1px solid rgba(0,0,0,0.06)",
      boxShadow: "0 2px 12px rgba(15,23,42,0.04)",
    }}>
      {stats.map((s: any, i: number) => (
        <div key={i} style={{
          flex: 1, padding: "22px 26px", background: "rgba(255,255,255,0.5)",
          borderRight: i < stats.length - 1 ? "1px solid rgba(0,0,0,0.06)" : "none",
          transition: "background 200ms ease",
        }}
        onMouseEnter={e => (e.currentTarget.style.background = "rgba(245,158,11,0.04)")}
        onMouseLeave={e => (e.currentTarget.style.background = "rgba(255,255,255,0.5)")}
        >
          <div style={{
            fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
            color: "rgba(26,26,46,0.55)",
            textTransform: "uppercase", letterSpacing: "0.14em", marginBottom: 8,
            fontWeight: 700,
          }}>
            {s.label}
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
            <span style={{
              fontFamily: "'Space Grotesk',sans-serif", fontSize: 28, fontWeight: 800,
              color: "#1a1a2e", letterSpacing: "-0.025em",
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
