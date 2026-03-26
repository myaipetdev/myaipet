import { useState } from "react";
import { useAccount } from "wagmi";
import { api } from "../api";

export default function Pricing({ isAuthenticated, onCreditsChange }) {
  const { isConnected } = useAccount();
  const [purchasing, setPurchasing] = useState(null);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const plans = [
    { name: "Starter", key: "starter", credits: 100, price: 5, videos: "~10", pop: false, emoji: "🌱" },
    { name: "Creator", key: "creator", credits: 500, price: 20, videos: "~50", pop: true, emoji: "🌟" },
    { name: "Pro", key: "pro", credits: 2000, price: 50, videos: "~200", pop: false, emoji: "👑" },
  ];

  const handlePurchase = async (plan) => {
    if (!isAuthenticated) {
      setError("Connect wallet and sign in first");
      return;
    }
    setPurchasing(plan.key);
    setError(null);
    setSuccess(null);
    try {
      const res = await api.credits.purchase(plan.key);
      setSuccess(`Purchased ${res.credits} credits!`);
      onCreditsChange?.();
    } catch (err) {
      setError(err.message || "Purchase failed");
    } finally {
      setPurchasing(null);
    }
  };

  return (
    <div className="max-w-3xl mx-auto text-center px-4 sm:px-6 py-16">
      <h2 className="font-heading text-3xl text-[#422D26] mb-2">Credits</h2>
      <p className="font-body text-sm text-[#422D26]/65 mb-10">
        Pay with crypto · Recorded on-chain
      </p>

      {error && (
        <div className="mb-4 px-4 py-2 rounded-2xl bg-pink/8 font-body text-sm text-pink sticker-border">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 px-4 py-2 rounded-2xl bg-mint/10 font-body text-sm text-[#4ade80] sticker-border">
          {success}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        {plans.map((p) => (
          <div key={p.name}
            className={`squishy relative rounded-3xl pt-8 pb-6 px-6 transition-all
              ${p.pop
                ? "bg-white/90 shadow-lg ring-2 ring-pink/20"
                : "bg-white/60 hover:bg-white/80"
              } sticker-border`}>

            {/* POPULAR badge - inside card, not overlapping */}
            {p.pop && (
              <div className="mb-3">
                <span className="inline-block bg-pink text-white font-body text-xs font-bold px-3 py-1 rounded-full">
                  POPULAR
                </span>
              </div>
            )}

            <div className="text-3xl mb-3">{p.emoji}</div>
            <div className="font-body text-xs text-[#422D26]/60 font-bold uppercase tracking-widest mb-2">
              {p.name}
            </div>
            <div className="font-heading text-4xl text-[#422D26] mb-1">${p.price}</div>
            <div className="font-body text-sm text-pink font-bold mb-6">
              {p.credits} credits · {p.videos} videos
            </div>
            <button
              onClick={() => handlePurchase(p)}
              disabled={purchasing === p.key}
              className="squishy w-full py-3 rounded-full font-heading text-sm transition-all
                bg-pink text-white hover:bg-pink-dark"
              style={{ boxShadow: p.pop ? "0 4px 16px rgba(255,134,183,0.25)" : "none" }}>
              {purchasing === p.key ? "Processing..." : "Purchase →"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
