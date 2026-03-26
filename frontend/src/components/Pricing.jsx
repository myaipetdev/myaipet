import { useState } from "react";
import { useAccount } from "wagmi";
import { api } from "../api";

const EARN_METHODS = [
  { icon: "🐾", label: "Daily Check-in", desc: "Care for your pet daily", reward: "+10 $PET/day" },
  { icon: "🎬", label: "Create Content", desc: "Generate AI videos & images", reward: "+5 $PET/post" },
  { icon: "💬", label: "Social Engagement", desc: "Like, comment, share", reward: "+2 $PET/action" },
  { icon: "🏆", label: "Arena Wins", desc: "Win prediction rounds", reward: "1.85x payout" },
  { icon: "🧬", label: "Pet Evolution", desc: "Level up your companion", reward: "+50 $PET/level" },
  { icon: "📢", label: "Referrals", desc: "Invite friends to join", reward: "+100 $PET/ref" },
];

export default function Pricing({ isAuthenticated, onCreditsChange }) {
  const { isConnected } = useAccount();
  const [purchasing, setPurchasing] = useState(null);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const plans = [
    { name: "Explorer", key: "starter", cookies: 500, price: 5, usdtPrice: "5 USDT", pop: false, desc: "Try the ecosystem", emoji: "🌱" },
    { name: "Companion", key: "creator", cookies: 2500, price: 20, usdtPrice: "20 USDT", pop: true, desc: "Full Raise-to-Earn", emoji: "🐾" },
    { name: "Breeder", key: "pro", cookies: 10000, price: 50, usdtPrice: "50 USDT", pop: false, desc: "Power user tier", emoji: "👑" },
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
      setSuccess(`Purchased ${res.credits} $PET!`);
      onCreditsChange?.();
    } catch (err) {
      setError(err.message || "Purchase failed");
    } finally {
      setPurchasing(null);
    }
  };

  return (
    <div style={{ padding: "60px 40px", maxWidth: 1060, margin: "0 auto" }}>
      {/* Section: Raise to Earn */}
      <div style={{ textAlign: "center", marginBottom: 48 }}>
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 14px",
          borderRadius: 20, background: "rgba(251,191,36,0.06)",
          border: "1px solid rgba(251,191,36,0.12)", marginBottom: 16,
        }}>
          <span style={{ fontSize: 12 }}>💡</span>
          <span style={{ fontFamily: "mono", fontSize: 10, color: "#b45309", fontWeight: 600 }}>
            RAISE TO EARN
          </span>
        </div>
        <h2 style={{
          fontFamily: "'Space Grotesk',sans-serif", fontSize: 28, fontWeight: 700,
          color: "#1a1a2e", marginBottom: 8,
        }}>
          The $PET Economy
        </h2>
        <p style={{
          fontFamily: "mono", fontSize: 12, color: "rgba(26,26,46,0.45)",
          maxWidth: 520, margin: "0 auto", lineHeight: 1.7,
        }}>
          Earn $PET through companionship, then spend them on evolution, content creation,
          and marketplace items. The bond you build becomes a source of income.
        </p>
      </div>

      {/* Earn methods grid */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 48,
      }}>
        {EARN_METHODS.map((m) => (
          <div key={m.label} style={{
            background: "rgba(255,255,255,0.7)", borderRadius: 14,
            border: "1px solid rgba(0,0,0,0.06)", padding: "18px 16px",
            display: "flex", alignItems: "flex-start", gap: 12,
          }}>
            <span style={{ fontSize: 22, flexShrink: 0 }}>{m.icon}</span>
            <div>
              <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 13, fontWeight: 600, color: "#1a1a2e", marginBottom: 3 }}>
                {m.label}
              </div>
              <div style={{ fontFamily: "mono", fontSize: 10, color: "rgba(26,26,46,0.45)", marginBottom: 6 }}>
                {m.desc}
              </div>
              <span style={{
                fontFamily: "mono", fontSize: 10, color: "#16a34a", fontWeight: 600,
                padding: "2px 8px", borderRadius: 6,
                background: "rgba(22,163,74,0.06)", border: "1px solid rgba(22,163,74,0.12)",
              }}>
                {m.reward}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Purchase section */}
      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <h3 style={{
          fontFamily: "'Space Grotesk',sans-serif", fontSize: 22, fontWeight: 700,
          color: "#1a1a2e", marginBottom: 6,
        }}>
          Get $PET
        </h3>
        <p style={{ fontFamily: "mono", fontSize: 11, color: "rgba(26,26,46,0.4)", marginBottom: 24 }}>
          Pay with USDT · Recorded on-chain · Instant delivery
        </p>
      </div>

      {error && (
        <div style={{
          marginBottom: 16, padding: "8px 16px", borderRadius: 8,
          background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.15)",
          fontFamily: "mono", fontSize: 11, color: "#dc2626", textAlign: "center",
        }}>
          {error}
        </div>
      )}
      {success && (
        <div style={{
          marginBottom: 16, padding: "8px 16px", borderRadius: 8,
          background: "rgba(22,163,74,0.06)", border: "1px solid rgba(22,163,74,0.15)",
          fontFamily: "mono", fontSize: 11, color: "#16a34a", textAlign: "center",
        }}>
          {success}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14, maxWidth: 860, margin: "0 auto" }}>
        {plans.map((p) => (
          <div key={p.name} style={{
            background: p.pop ? "rgba(251,191,36,0.06)" : "rgba(255,255,255,0.8)",
            borderRadius: 16,
            border: p.pop ? "1px solid rgba(251,191,36,0.15)" : "1px solid rgba(0,0,0,0.06)",
            padding: "28px 22px", position: "relative", textAlign: "center",
            boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
          }}>
            {p.pop && (
              <div style={{
                position: "absolute", top: -9, left: "50%", transform: "translateX(-50%)",
                background: "linear-gradient(135deg,#f59e0b,#d97706)",
                padding: "3px 14px", borderRadius: 16,
                fontFamily: "mono", fontSize: 9, color: "white", fontWeight: 600,
              }}>
                MOST POPULAR
              </div>
            )}
            <div style={{ fontSize: 32, marginBottom: 8 }}>{p.emoji}</div>
            <div style={{ fontFamily: "mono", fontSize: 11, color: "rgba(26,26,46,0.5)", marginBottom: 8, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              {p.name}
            </div>
            <div style={{
              fontFamily: "'Space Grotesk',sans-serif", fontSize: 36, fontWeight: 700,
              color: "#1a1a2e", marginBottom: 3,
            }}>
              {p.usdtPrice}
            </div>
            <div style={{ fontFamily: "mono", fontSize: 12, color: "#b45309", marginBottom: 4, fontWeight: 600 }}>
              🪙 {p.cookies.toLocaleString()} $PET
            </div>
            <div style={{ fontFamily: "mono", fontSize: 10, color: "rgba(26,26,46,0.4)", marginBottom: 18 }}>
              {p.desc}
            </div>
            <button
              onClick={() => handlePurchase(p)}
              disabled={purchasing === p.key}
              style={{
                width: "100%",
                background: p.pop ? "linear-gradient(135deg,#f59e0b,#d97706)" : "rgba(0,0,0,0.04)",
                border: p.pop ? "none" : "1px solid rgba(0,0,0,0.08)",
                borderRadius: 10, padding: "12px",
                fontFamily: "'Space Grotesk',sans-serif", fontSize: 13,
                color: p.pop ? "white" : "rgba(26,26,46,0.5)",
                cursor: purchasing === p.key ? "wait" : "pointer", fontWeight: 600,
                boxShadow: p.pop ? "0 0 20px rgba(245,158,11,0.2)" : "none",
              }}
            >
              {purchasing === p.key ? "Processing..." : "Purchase with USDT →"}
            </button>
          </div>
        ))}
      </div>

      {/* Deflationary note */}
      <div style={{
        marginTop: 28, textAlign: "center",
        padding: "14px 20px", borderRadius: 12,
        background: "rgba(255,255,255,0.5)", border: "1px solid rgba(0,0,0,0.06)",
        maxWidth: 600, margin: "28px auto 0",
      }}>
        <span style={{ fontFamily: "mono", fontSize: 11, color: "rgba(26,26,46,0.45)", lineHeight: 1.7 }}>
          🔥 <span style={{ color: "#b45309" }}>Deflationary model:</span> $PET are burned on content creation,
          marketplace purchases, and premium features — ensuring long-term value appreciation.
        </span>
      </div>
    </div>
  );
}
