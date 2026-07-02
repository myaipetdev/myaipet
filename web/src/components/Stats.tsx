"use client";

import useCountUp from "@/hooks/useCountUp";

// Animates from the value currently on screen to the new one (up OR down) so
// a 15s stats refresh doesn't flash back to 0, and a shrink isn't left stale.
// Tween itself lives in the shared useCountUp hook (Nav credits, SeasonBanner
// points use the same one); this keeps the 2s duration + prefix/suffix render.
function Counter({ end, duration = 2000, prefix = "", suffix = "" }: any) {
  const val = useCountUp(end, duration);
  return <>{prefix}{val.toLocaleString()}{suffix}</>;
}

export default function Stats({ stats }: any) {
  return (
    <div className="mp-enter" style={{
      display: "flex", gap: 1, background: "#FBF6EC",
      borderRadius: 18, overflow: "hidden", border: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
      boxShadow: "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))",
    }}>
      {stats.map((s: any, i: number) => (
        <div key={i} style={{
          flex: 1, padding: "22px 26px", background: "#FBF6EC",
          borderRight: i < stats.length - 1 ? "1px solid var(--ed-hair, rgba(33,26,18,.13))" : "none",
          transition: "background 200ms ease",
        }}
        onMouseEnter={e => (e.currentTarget.style.background = "rgba(190,79,40,0.05)")}
        onMouseLeave={e => (e.currentTarget.style.background = "#FBF6EC")}
        >
          <div style={{
            fontFamily: "var(--ed-m)", fontSize: 12,
            color: "#7A6E5A",
            textTransform: "uppercase", letterSpacing: "0.14em", marginBottom: 8,
            fontWeight: 700,
          }}>
            {s.label}
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
            <span style={{
              fontFamily: "var(--ed-disp)", fontSize: 28, fontWeight: 800,
              color: "#211A12", letterSpacing: "-0.025em",
            }}>
              {s.animated
                ? <Counter end={s.raw} prefix={s.prefix || ""} suffix={s.suffix || ""} />
                : s.value}
            </span>
            {s.change != null && s.change !== 0 && (
              <span style={{
                fontFamily: "var(--ed-m)", fontSize: 12, fontWeight: 500,
                color: String(s.change).startsWith("+") || Number(s.change) > 0 ? "#5C8A4E" : "#C0492B",
              }}>
                {typeof s.change === "number" ? (s.change > 0 ? `+${s.change}%` : `${s.change}%`) : s.change}
              </span>
            )}
          </div>
          {s.sub && (
            <div style={{ fontFamily: "var(--ed-m)", fontSize: 12, color: "#9A7B4E", marginTop: 3 }}>
              {s.sub}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
