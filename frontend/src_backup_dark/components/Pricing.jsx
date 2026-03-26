import { useState } from "react";
import { useAccount } from "wagmi";
import { api } from "../api";

export default function Pricing({ isAuthenticated, onCreditsChange }) {
  const { isConnected } = useAccount();
  const [purchasing, setPurchasing] = useState(null);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const plans = [
    { name: "Starter", key: "starter", credits: 100, price: 5, videos: "~10", pop: false },
    { name: "Creator", key: "creator", credits: 500, price: 20, videos: "~50", pop: true },
    { name: "Pro", key: "pro", credits: 2000, price: 50, videos: "~200", pop: false },
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
      // For now: create a pending purchase
      // In production: integrate with on-chain payment
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
    <div style={{ padding: "50px 40px", maxWidth: 860, margin: "0 auto", textAlign: "center" }}>
      <h2 style={{
        fontFamily: "'Space Grotesk',sans-serif", fontSize: 26, fontWeight: 700,
        color: "white", marginBottom: 6,
      }}>
        Credits
      </h2>
      <p style={{ fontFamily: "mono", fontSize: 12, color: "rgba(255,255,255,0.3)", marginBottom: 36 }}>
        Pay with crypto · Recorded on-chain
      </p>

      {error && (
        <div style={{
          marginBottom: 16, padding: "8px 16px", borderRadius: 8,
          background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.15)",
          fontFamily: "mono", fontSize: 11, color: "#ef4444",
        }}>
          {error}
        </div>
      )}

      {success && (
        <div style={{
          marginBottom: 16, padding: "8px 16px", borderRadius: 8,
          background: "rgba(74,222,128,0.06)", border: "1px solid rgba(74,222,128,0.15)",
          fontFamily: "mono", fontSize: 11, color: "#4ade80",
        }}>
          {success}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14 }}>
        {plans.map((p) => (
          <div key={p.name} style={{
            background: p.pop ? "rgba(251,191,36,0.04)" : "rgba(255,255,255,0.015)",
            borderRadius: 14,
            border: p.pop ? "1px solid rgba(251,191,36,0.15)" : "1px solid rgba(255,255,255,0.05)",
            padding: 24, position: "relative",
          }}>
            {p.pop && (
              <div style={{
                position: "absolute", top: -9, left: "50%", transform: "translateX(-50%)",
                background: "linear-gradient(135deg,#f59e0b,#d97706)",
                padding: "3px 14px", borderRadius: 16,
                fontFamily: "mono", fontSize: 9, color: "white", fontWeight: 600,
              }}>
                POPULAR
              </div>
            )}
            <div style={{ fontFamily: "mono", fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 10 }}>
              {p.name}
            </div>
            <div style={{
              fontFamily: "'Space Grotesk',sans-serif", fontSize: 36, fontWeight: 700,
              color: "white", marginBottom: 3,
            }}>
              ${p.price}
            </div>
            <div style={{ fontFamily: "mono", fontSize: 11, color: "#fbbf24", marginBottom: 18 }}>
              {p.credits} credits · {p.videos} videos
            </div>
            <button
              onClick={() => handlePurchase(p)}
              disabled={purchasing === p.key}
              style={{
                width: "100%",
                background: p.pop ? "linear-gradient(135deg,#f59e0b,#d97706)" : "rgba(255,255,255,0.04)",
                border: p.pop ? "none" : "1px solid rgba(255,255,255,0.06)",
                borderRadius: 9, padding: "11px",
                fontFamily: "mono", fontSize: 12,
                color: p.pop ? "white" : "rgba(255,255,255,0.45)",
                cursor: purchasing === p.key ? "wait" : "pointer", fontWeight: 600,
              }}
            >
              {purchasing === p.key ? "Processing..." : "Purchase →"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
