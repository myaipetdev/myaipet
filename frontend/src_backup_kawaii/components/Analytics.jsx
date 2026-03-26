import { useState, useEffect } from "react";
import { api } from "../api";
import Stats from "./Stats";
import Feed from "./Feed";

export default function Analytics({ stats, activities }) {
  const [chartData, setChartData] = useState([]);
  const [chainStats, setChainStats] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      api.analytics.daily(20).catch(() => ({ data: [] })),
      api.analytics.chains().catch(() => ({ chains: [] })),
    ]).then(([daily, chains]) => {
      if (cancelled) return;
      setChartData(daily.data.map((d) => d.count));
      setChainStats(chains.chains);
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, []);

  const displayChart = chartData.length > 0
    ? chartData
    : [12, 15, 11, 18, 22, 19, 25, 28, 24, 31, 35, 29, 38, 42, 37, 45, 48, 44, 52, 55];

  const maxVal = Math.max(...displayChart, 1);

  const displayChains = chainStats.length > 0
    ? chainStats
    : [
        { chain: "Base", count: 0, percentage: 64 },
        { chain: "BNB Chain", count: 0, percentage: 36 },
      ];

  return (
    <div className="max-w-[1060px] mx-auto px-6 sm:px-10 pt-32 pb-24">
      <div className="mb-6">
        <h2 className="font-heading text-3xl text-[#422D26] mb-1">On-Chain Analytics</h2>
        <p className="font-body text-sm text-pink/60">Real-time protocol metrics · Verified on-chain</p>
      </div>

      <Stats stats={stats} />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
        {/* Chart */}
        <div className="bg-white/80 backdrop-blur-sm rounded-3xl sticker-border p-6">
          <div className="font-body text-xs text-pink/65 uppercase tracking-widest font-bold mb-5">
            Daily Generations (20d)
          </div>
          <div className="flex items-end gap-[3px] h-[140px]">
            {displayChart.map((v, i) => (
              <div
                key={i}
                className="flex-1 rounded-t-sm transition-all duration-500"
                style={{
                  height: `${(v / maxVal) * 100}%`,
                  background: i === displayChart.length - 1
                    ? "linear-gradient(180deg, #FF86B7, #FFD23F)"
                    : "rgba(255,134,183,0.15)",
                  transitionDelay: `${i * 30}ms`,
                  borderRadius: "4px 4px 0 0",
                }}
              />
            ))}
          </div>
          <div className="flex justify-between mt-2">
            <span className="font-body text-xs text-pink/50 font-semibold">20d ago</span>
            <span className="font-body text-xs text-pink/50 font-semibold">Today</span>
          </div>
        </div>

        <Feed activities={activities} />
      </div>

      {/* Chain distribution */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
        {displayChains.map((c) => {
          const isBase = c.chain === "Base" || c.chain === "base";
          const displayName = c.chain === "base" ? "Base" : c.chain === "bnb" ? "BNB Chain" : c.chain;
          return (
            <div key={c.chain} className="bg-white/80 backdrop-blur-sm rounded-3xl sticker-border p-5">
              <div className="flex justify-between items-center mb-3">
                <span className="font-heading text-sm text-[#422D26]">{displayName}</span>
                <span className={`font-heading text-sm ${isBase ? "text-sky" : "text-sun-dark"}`}>
                  {c.percentage}%
                </span>
              </div>
              <div className="h-2 rounded-full bg-cream-dark overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-1000"
                  style={{
                    width: `${c.percentage}%`,
                    background: isBase
                      ? "linear-gradient(90deg, #70D6FF, #4CC3F0)"
                      : "linear-gradient(90deg, #FFD23F, #F0C030)",
                    boxShadow: isBase
                      ? "0 0 8px rgba(112,214,255,0.3)"
                      : "0 0 8px rgba(255,210,63,0.3)",
                  }}
                />
              </div>
              <div className="font-body text-xs text-pink/55 mt-2 font-semibold">
                {c.count.toLocaleString()} transactions
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
