export default function Feed({ activities }) {
  return (
    <div className="bg-white/50 backdrop-blur-sm rounded-3xl sticker-border overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5"
        style={{ borderBottom: "1px solid rgba(255,134,183,0.06)" }}>
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-2 h-2 rounded-full bg-[#4ade80] shrink-0"
            style={{ boxShadow: "0 0 8px rgba(74,222,128,0.5)", animation: "pulse 2s infinite" }} />
          <span className="font-body text-sm text-[#422D26]/65 font-bold uppercase tracking-widest">
            Live On-Chain Activity
          </span>
        </div>
        <span className="font-body text-xs text-[#422D26]/55 font-bold shrink-0 ml-2">Multi-chain</span>
      </div>

      {/* Activity list - scrollable */}
      <div style={{ maxHeight: 380, overflowY: "auto" }}>
        {activities.map((a, i) => (
          <div key={i}
            className="flex items-center gap-3 px-5 py-3 transition-all"
            style={{
              borderBottom: "1px solid rgba(255,134,183,0.04)",
              opacity: 1 - i * 0.04,
              animation: i === 0 ? "slideIn 0.4s ease-out" : "none",
            }}>
            <span className="text-sm w-6 text-center shrink-0">{a.icon}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="font-body text-xs text-pink font-bold truncate">
                  {a.wallet}
                </span>
                <span className={`shrink-0 font-body text-xs font-bold px-2 py-0.5 rounded-full
                  ${a.chain === "Base"
                    ? "bg-sky/10 text-sky-dark"
                    : "bg-sun/10 text-sun-dark"
                  }`}>
                  {a.chain}
                </span>
              </div>
              <span className="font-body text-xs text-[#422D26]/55 block truncate">
                {a.text}
              </span>
            </div>
            <span className="font-body text-xs text-[#422D26]/55 whitespace-nowrap font-semibold shrink-0">
              {a.time}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
