"use client";

import { useState, useEffect } from "react";
import { useAccount, useSwitchChain } from "wagmi";
import { CONTRACTS } from "@/lib/contracts";
import {
  usePETBalance,
  useUSDTBalance,
  useUSDTAllowance,
  useApproveUSDT,
  usePurchasePET,
  TIER_USDT,
  TIER_PET,
  formatEther,
} from "@/hooks/useContracts";
import { useCoinbaseOnramp } from "@/hooks/useCoinbaseOnramp";
import { useDirectUsdtPay } from "@/hooks/useDirectUsdtPay";
import { getAuthHeaders } from "@/lib/api";

const EARN_METHODS = [
  { icon: "🐾", label: "Daily Check-in", desc: "Care for your pet daily", reward: "+10 $PET/day" },
  { icon: "🎬", label: "Create Content", desc: "Generate AI videos & images", reward: "+5 $PET/post" },
  { icon: "💬", label: "Social Engagement", desc: "Like, comment, share", reward: "+2 $PET/action" },
  { icon: "🏆", label: "Arena Wins", desc: "Win prediction rounds", reward: "1.85x payout" },
  { icon: "🧬", label: "Pet Evolution", desc: "Evolve your companion to unlock new traits", reward: "+50 $PET/level" },
  { icon: "📢", label: "Referrals", desc: "Invite friends to join", reward: "+100 $PET/ref" },
];

const BSC_CHAIN_ID = 56;

export default function Pricing({ isAuthenticated, onCreditsChange }: any) {
  const { address, isConnected, chainId } = useAccount();
  const { switchChain } = useSwitchChain();
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [step, setStep] = useState<"idle" | "approve" | "purchase" | "confirm">("idle");
  const { openOnramp, isAvailable: onrampAvailable } = useCoinbaseOnramp();

  const contractsDeployed = !!CONTRACTS.petShop && !!CONTRACTS.petToken;

  const { data: petBalance, refetch: refetchPET } = usePETBalance(address);
  const { data: usdtBalance } = useUSDTBalance(address);
  const { data: usdtAllowance, refetch: refetchAllowance } = useUSDTAllowance(address);
  const {
    approve,
    isPending: approveLoading,
    isSuccess: approveSuccess,
    error: approveError,
  } = useApproveUSDT();
  const {
    purchase: purchaseOnChain,
    isPending: purchaseLoading,
    isSuccess: purchaseSuccess,
    hash: purchaseHash,
    error: purchaseError,
  } = usePurchasePET();

  // After approve success, do the purchase
  useEffect(() => {
    if (approveSuccess && step === "approve" && purchasing) {
      setStep("purchase");
      refetchAllowance();
      purchaseOnChain(purchasing, TIER_USDT[purchasing] || BigInt(0), TIER_PET[purchasing] || BigInt(0));
    }
  }, [approveSuccess]);

  // After purchase success
  useEffect(() => {
    if (purchaseSuccess && step === "purchase") {
      setStep("idle");
      setPurchasing(null);
      setSuccess(`$PET purchased on-chain! TX: ${purchaseHash?.slice(0, 10)}...`);
      refetchPET();
      onCreditsChange?.();
    }
  }, [purchaseSuccess]);

  // Handle errors
  useEffect(() => {
    if (approveError) {
      setError(`Approve failed: ${approveError.message?.slice(0, 100)}`);
      setStep("idle");
      setPurchasing(null);
    }
  }, [approveError]);

  useEffect(() => {
    if (purchaseError) {
      setError(`Purchase failed: ${purchaseError.message?.slice(0, 100)}`);
      setStep("idle");
      setPurchasing(null);
    }
  }, [purchaseError]);

  const plans = [
    { name: "Explorer", key: "starter", cookies: 500, price: 5, usdtPrice: "5 USDT", pop: false, desc: "Try the ecosystem", emoji: "🌱" },
    { name: "Companion", key: "creator", cookies: 2500, price: 20, usdtPrice: "20 USDT", pop: true, desc: "Full Raise-to-Earn", emoji: "🐾" },
    { name: "Breeder", key: "pro", cookies: 10000, price: 50, usdtPrice: "50 USDT", pop: false, desc: "Power user tier", emoji: "👑" },
  ];

  // Direct USDT pay (BSC-USD → treasury → server verifies → grants credits)
  const directPay = useDirectUsdtPay();

  const handlePurchase = async (plan: any) => {
    setError(null);
    setSuccess(null);

    if (!isConnected || !address) {
      setError("Connect wallet first");
      return;
    }
    if (!isAuthenticated) {
      setError("Sign in with wallet first");
      return;
    }
    if (chainId !== BSC_CHAIN_ID) {
      try {
        switchChain({ chainId: BSC_CHAIN_ID });
      } catch {
        setError("Please switch to BNB Chain (BSC)");
        return;
      }
    }
    if (!directPay.treasuryConfigured) {
      setError("Payments are temporarily paused. Contact support.");
      return;
    }

    setPurchasing(plan.key);
    setStep("purchase");

    // 1) Send USDT to treasury
    const result = await directPay.pay(plan.price);
    if ("error" in result) {
      const msg = result.error.toLowerCase().includes("user rejected")
        ? "Transaction cancelled"
        : result.error;
      setError(msg);
      setPurchasing(null);
      setStep("idle");
      return;
    }

    // 2) Wait for confirmation, then post hash to server for verification
    setStep("confirm");
    try {
      // Poll receipt until confirmed (server-side will also verify via RPC)
      // We send the tx hash immediately; server retries reading the receipt.
      const res = await fetch("/api/credits/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ plan: plan.key, payment_tx_hash: result.hash }),
      });
      const data = await res.json();
      if (!res.ok) {
        // Receipt may not be available yet — retry once after 5s
        await new Promise(r => setTimeout(r, 5000));
        const res2 = await fetch("/api/credits/purchase", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...getAuthHeaders() },
          body: JSON.stringify({ plan: plan.key, payment_tx_hash: result.hash }),
        });
        const data2 = await res2.json();
        if (!res2.ok) throw new Error(data2.error || data.error || "Verification failed");
        setSuccess(`Got ${data2.purchased} credits! ✨`);
        onCreditsChange?.();
      } else {
        setSuccess(`Got ${data.purchased} credits! ✨`);
        onCreditsChange?.();
      }
    } catch (err: any) {
      setError(`Payment sent but credit grant failed: ${err.message}. TX: ${result.hash.slice(0, 10)}... — contact support with this hash.`);
    } finally {
      setPurchasing(null);
      setStep("idle");
    }
  };

  const getButtonLabel = (planKey: string) => {
    if (purchasing !== planKey) return "Pay with USDT →";
    if (step === "purchase") return "Confirm in wallet...";
    if (step === "confirm") return "Verifying tx...";
    return "Processing...";
  };

  return (
    <div className="pricing-root" style={{ padding: "60px 40px", maxWidth: 1060, margin: "0 auto" }}>
      <style>{`
        @media (max-width: 768px) {
          .pricing-root { padding: 40px 16px !important; }
          .pricing-earn-grid { grid-template-columns: repeat(2, 1fr) !important; }
        .pricing-earn-grid > div { padding: 12px 10px !important; }
        .pricing-earn-grid > div span:first-child { font-size: 16px !important; }
        .pricing-earn-grid > div div > div:first-child { font-size: 11px !important; }
        .pricing-earn-grid > div div > div:nth-child(2) { font-size: 9px !important; }
          .pricing-cards-grid { grid-template-columns: 1fr !important; max-width: 400px !important; margin-left: auto !important; margin-right: auto !important; }
        }
        @media (max-width: 480px) {
          .pricing-root { padding: 32px 12px !important; }
          .pricing-earn-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
      {/* Section: Raise to Earn */}
      <div style={{ textAlign: "center", marginBottom: 48 }}>
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 14px",
          borderRadius: 20, background: "rgba(251,191,36,0.06)",
          border: "1px solid rgba(251,191,36,0.12)", marginBottom: 16,
        }}>
          <span style={{ fontSize: 12 }}>💡</span>
          <span style={{ fontFamily: "mono", fontSize: 10, color: "#b45309", fontWeight: 600 }}>
            CARE TO EARN
          </span>
        </div>
        <h2 style={{
          fontFamily: "'Space Grotesk',sans-serif", fontSize: 28, fontWeight: 700,
          color: "#1a1a2e", marginBottom: 8,
        }}>
          The $PET Economy
        </h2>
        <p style={{
          fontFamily: "mono", fontSize: 16, color: "rgba(26,26,46,0.45)",
          maxWidth: 560, margin: "0 auto", lineHeight: 1.7,
        }}>
          Earn $PET through companionship, then spend them on evolution, content creation,
          and marketplace items. The bond you build becomes a source of income.
        </p>
      </div>

      {/* Earn methods grid */}
      <div className="pricing-earn-grid" style={{
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
              <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 16, fontWeight: 600, color: "#1a1a2e", marginBottom: 3 }}>
                {m.label}
              </div>
              <div style={{ fontFamily: "mono", fontSize: 13, color: "rgba(26,26,46,0.45)", marginBottom: 6 }}>
                {m.desc}
              </div>
              <span style={{
                fontFamily: "mono", fontSize: 12, color: "#16a34a", fontWeight: 600,
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
        <p style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 14, color: "rgba(26,26,46,0.5)", marginBottom: 10 }}>
          Pay with USDT on BNB Chain · Verified on-chain · Credits delivered instantly
        </p>
        {contractsDeployed && (
          <div style={{
            display: "inline-flex", gap: 12, alignItems: "center",
            padding: "6px 16px", borderRadius: 10,
            background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.12)",
            fontFamily: "mono", fontSize: 13,
          }}>
            {address && usdtBalance !== undefined && (
              <span style={{ color: "rgba(26,26,46,0.5)" }}>
                USDT: <span style={{ color: "#1a1a2e", fontWeight: 600 }}>
                  {Number(formatEther(usdtBalance as bigint)).toFixed(2)}
                </span>
              </span>
            )}
            {address && petBalance !== undefined && (
              <span style={{ color: "rgba(26,26,46,0.5)" }}>
                $PET: <span style={{ color: "#b45309", fontWeight: 600 }}>
                  {Number(formatEther(petBalance as bigint)).toLocaleString()}
                </span>
              </span>
            )}
            <span style={{
              fontSize: 9, padding: "2px 8px", borderRadius: 8,
              background: "rgba(22,163,74,0.1)", color: "#16a34a", fontWeight: 600,
            }}>
              BSC
            </span>
          </div>
        )}
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
          {purchaseHash && contractsDeployed && (
            <a
              href={`https://bscscan.com/tx/${purchaseHash}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "#16a34a", marginLeft: 8, textDecoration: "underline" }}
            >
              View on BscScan
            </a>
          )}
        </div>
      )}

      <style>{`
        .pricing-card {
          border-radius: 16px;
          padding: 28px 22px; position: relative; text-align: center;
          box-shadow: 0 1px 4px rgba(0,0,0,0.06);
          transition: all 0.3s cubic-bezier(0.4,0,0.2,1);
        }
        .pricing-cards-grid:hover .pricing-card {
          opacity: 0.5;
          filter: saturate(0.6);
        }
        .pricing-cards-grid:hover .pricing-card:hover {
          opacity: 1;
          filter: saturate(1);
          transform: translateY(-6px);
          box-shadow: 0 16px 40px rgba(0,0,0,0.08);
        }
        .pricing-card:hover {
          transform: translateY(-6px);
          box-shadow: 0 16px 40px rgba(0,0,0,0.08);
        }
        .pricing-card.popular {
          background: rgba(251,191,36,0.06);
          border: 1px solid rgba(251,191,36,0.15);
        }
        .pricing-card.popular:hover {
          border-color: rgba(251,191,36,0.35);
          box-shadow: 0 16px 40px rgba(245,158,11,0.15);
        }
        .pricing-card:not(.popular) {
          background: rgba(255,255,255,0.8);
          border: 1px solid rgba(0,0,0,0.06);
        }
        .pricing-card:not(.popular):hover {
          border-color: rgba(251,191,36,0.2);
          background: rgba(251,191,36,0.03);
        }
        .pricing-card:hover .pricing-btn-default {
          background: linear-gradient(135deg,#f59e0b,#d97706) !important;
          color: white !important;
          border-color: transparent !important;
          box-shadow: 0 0 20px rgba(245,158,11,0.2);
        }
      `}</style>
      <div className="pricing-cards-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14, maxWidth: 860, margin: "0 auto" }}>
        {plans.map((p) => (
          <div key={p.name} className={`pricing-card${p.pop ? " popular" : ""}`}>
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
            <div style={{ fontFamily: "mono", fontSize: 13, color: "rgba(26,26,46,0.5)", marginBottom: 8, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              {p.name}
            </div>
            <div style={{
              fontFamily: "'Space Grotesk',sans-serif", fontSize: 36, fontWeight: 700,
              color: "#1a1a2e", marginBottom: 3,
            }}>
              {p.usdtPrice}
            </div>
            <div style={{ fontFamily: "mono", fontSize: 14, color: "#b45309", marginBottom: 4, fontWeight: 600 }}>
              🪙 {p.cookies.toLocaleString()} $PET
            </div>
            <div style={{ fontFamily: "mono", fontSize: 13, color: "rgba(26,26,46,0.4)", marginBottom: 18 }}>
              {p.desc}
            </div>
            <button
              onClick={() => handlePurchase(p)}
              disabled={!!purchasing}
              className={p.pop ? "" : "pricing-btn-default"}
              style={{
                width: "100%",
                background: purchasing === p.key
                  ? "rgba(245,158,11,0.5)"
                  : p.pop ? "linear-gradient(135deg,#f59e0b,#d97706)" : "#1a1a2e",
                border: "none",
                borderRadius: 10, padding: "13px",
                fontFamily: "'Space Grotesk',sans-serif", fontSize: 14,
                color: "white",
                cursor: purchasing ? "wait" : "pointer", fontWeight: 700,
                transition: "all 0.3s ease",
                boxShadow: p.pop ? "0 4px 12px rgba(245,158,11,0.3)" : "none",
                opacity: purchasing && purchasing !== p.key ? 0.5 : 1,
              }}
            >
              {getButtonLabel(p.key)}
            </button>
            {onrampAvailable && isConnected && (
              <button
                onClick={() => openOnramp(p.price)}
                style={{
                  width: "100%",
                  marginTop: 8,
                  background: "linear-gradient(135deg, #0052FF, #1673FF)",
                  border: "none",
                  borderRadius: 12,
                  padding: "12px 24px",
                  fontFamily: "'Space Grotesk',sans-serif",
                  fontSize: 13,
                  color: "white",
                  cursor: "pointer",
                  fontWeight: 700,
                  transition: "all 0.3s ease",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  flexDirection: "column",
                }}
                onMouseEnter={e => { e.currentTarget.style.opacity = "0.9"; e.currentTarget.style.transform = "translateY(-1px)"; }}
                onMouseLeave={e => { e.currentTarget.style.opacity = "1"; e.currentTarget.style.transform = "translateY(0)"; }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span>{"💳"}</span> Buy with Card
                </span>
                <span style={{ fontSize: 9, opacity: 0.7, fontWeight: 500 }}>
                  Powered by Coinbase
                </span>
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Spacer */}
      <div style={{ height: 20 }} />
    </div>
  );
}
