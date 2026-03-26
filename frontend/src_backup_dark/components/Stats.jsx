import { useState, useEffect } from "react";

function Counter({ end, duration = 2000, prefix = "", suffix = "" }) {
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

export default function Stats({ stats }) {
  return (
    <div style={{
      display: "flex", gap: 1, background: "rgba(255,255,255,0.02)",
      borderRadius: 14, overflow: "hidden", border: "1px solid rgba(255,255,255,0.05)",
    }}>
      {stats.map((s, i) => (
        <div key={i} style={{
          flex: 1, padding: "18px 22px", background: "rgba(255,255,255,0.015)",
          borderRight: i < stats.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
        }}>
          <div style={{
            fontFamily: "mono", fontSize: 10, color: "rgba(255,255,255,0.3)",
            textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6,
          }}>
            {s.label}
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
            <span style={{
              fontFamily: "'Space Grotesk',sans-serif", fontSize: 24, fontWeight: 700,
              color: "white", letterSpacing: "-0.02em",
            }}>
              {s.animated
                ? <Counter end={s.raw} prefix={s.prefix || ""} suffix={s.suffix || ""} />
                : s.value}
            </span>
            {s.change && (
              <span style={{
                fontFamily: "mono", fontSize: 11, fontWeight: 500,
                color: s.change.startsWith("+") ? "#4ade80" : "#f87171",
              }}>
                {s.change}
              </span>
            )}
          </div>
          {s.sub && (
            <div style={{ fontFamily: "mono", fontSize: 10, color: "rgba(255,255,255,0.2)", marginTop: 3 }}>
              {s.sub}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
