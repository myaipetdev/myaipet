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

const STAT_ICONS = ["👥", "🎬", "🔥", "⚡"];

export default function Stats({ stats }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {stats.map((s, i) => (
        <div key={i}
          className="bg-white/60 backdrop-blur-sm rounded-3xl sticker-border p-4 text-center squishy hover:bg-white/80 transition-all">
          <div className="text-2xl mb-2">{STAT_ICONS[i] || "📊"}</div>
          <div className="font-body text-xs text-[#422D26]/60 uppercase tracking-widest font-bold mb-1.5" style={{ letterSpacing: "0.08em" }}>
            {s.label}
          </div>
          <div className="flex items-baseline justify-center gap-1.5">
            <span className="font-heading text-2xl text-[#422D26]">
              {s.animated
                ? <Counter end={s.raw} prefix={s.prefix || ""} suffix={s.suffix || ""} />
                : s.value}
            </span>
            {s.change && (
              <span className={`font-body text-xs font-bold
                ${s.change.startsWith("+") ? "text-[#4ade80]" : "text-pink"}`}>
                {s.change}
              </span>
            )}
          </div>
          {s.sub && (
            <div className="font-body text-xs text-[#422D26]/55 mt-1.5">{s.sub}</div>
          )}
        </div>
      ))}
    </div>
  );
}
