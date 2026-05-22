"use client";

/**
 * Universal paywall modal — handles every paid action in the BM grid.
 *
 * Usage:
 *   const [paywall, setPaywall] = useState<PaywallInfo | null>(null);
 *
 *   const callAction = async () => {
 *     const res = await fetch(`/api/pets/${id}/interact`, { method: "POST", body: JSON.stringify({ interaction_type: "feed" }) });
 *     if (res.status === 402) {
 *       const { paywall } = await res.json();
 *       setPaywall({ ...paywall, onPaid: async (txHash) => {
 *         await fetch(`/api/pets/${id}/interact?tx_hash=${txHash}`, { method: "POST", body: ... });
 *         setPaywall(null);
 *       }});
 *       return;
 *     }
 *     ...
 *   };
 *
 *   <PaywallModal info={paywall} onClose={() => setPaywall(null)} />
 */

import { useState } from "react";
import { useDirectUsdtPay } from "@/hooks/useDirectUsdtPay";

export interface PaywallInfo {
  actionKey: string;
  priceUsd: number;
  description: string;
  treasury: string;
  reason: "free_cap_exhausted" | "no_free_tier";
  /** Called after on-chain tx confirmed. Should re-run the original action with ?tx_hash=… */
  onPaid: (txHash: string) => Promise<void> | void;
}

export default function PaywallModal({ info, onClose }: { info: PaywallInfo | null; onClose: () => void }) {
  const { pay, isPending, isConfirming, treasuryConfigured } = useDirectUsdtPay();
  const [step, setStep] = useState<"idle" | "signing" | "confirming" | "registering" | "done" | "error">("idle");
  const [errMsg, setErrMsg] = useState<string | null>(null);

  if (!info) return null;

  const handlePay = async () => {
    setErrMsg(null);
    setStep("signing");
    const result = await pay(info.priceUsd);
    if ("error" in result) {
      setStep("error");
      setErrMsg(result.error);
      return;
    }
    setStep("confirming");
    const txHash = result.hash;

    // Wait a few seconds for confirmation, then register receipt
    // (BSC ~3s/block, 1 confirmation usually enough for our level of trust)
    await new Promise(r => setTimeout(r, 4000));

    setStep("registering");
    try {
      const reg = await fetch("/api/payments/action-pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ actionKey: info.actionKey, txHash }),
      });
      if (!reg.ok) {
        const j = await reg.json().catch(() => ({}));
        throw new Error(j.error || `Receipt registration failed (${reg.status})`);
      }
    } catch (e: any) {
      setStep("error");
      setErrMsg(e.message);
      return;
    }

    // Receipt registered — trigger the original action
    setStep("done");
    await info.onPaid(txHash);
    onClose();
  };

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 9999,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        maxWidth: 420, width: "100%", background: "white", borderRadius: 20,
        padding: 28, boxShadow: "0 20px 60px rgba(0,0,0,0.18)",
        fontFamily: "'Space Grotesk',sans-serif", color: "#1a1a2e",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <span style={{ fontSize: 26 }}>💎</span>
          <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0, letterSpacing: "-0.02em" }}>
            {info.reason === "free_cap_exhausted" ? "Daily free cap reached" : "Premium action"}
          </h2>
        </div>

        <p style={{ fontSize: 14, color: "rgba(26,26,46,0.7)", lineHeight: 1.6, margin: "0 0 18px" }}>
          {info.description}
        </p>

        <div style={{
          padding: "14px 18px", borderRadius: 12, marginBottom: 16,
          background: "linear-gradient(135deg, rgba(245,158,11,0.08), rgba(245,158,11,0.04))",
          border: "1px solid rgba(245,158,11,0.2)",
        }}>
          <div style={{ fontSize: 11, color: "rgba(26,26,46,0.55)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Price</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: "#b45309", marginTop: 4 }}>
            {info.priceUsd.toFixed(2)} USDT
          </div>
          <div style={{ fontSize: 11, color: "rgba(26,26,46,0.5)", marginTop: 4, fontFamily: "mono" }}>
            BSC (BEP-20) USDT · payment goes to project treasury
          </div>
        </div>

        {!treasuryConfigured && (
          <div style={{
            padding: 10, borderRadius: 8, marginBottom: 12,
            background: "rgba(220,38,38,0.08)", color: "#dc2626",
            fontSize: 12, fontFamily: "mono",
          }}>
            ⚠️ Treasury wallet not configured — contact support.
          </div>
        )}

        {errMsg && (
          <div style={{
            padding: 10, borderRadius: 8, marginBottom: 12,
            background: "rgba(220,38,38,0.08)", color: "#dc2626", fontSize: 12,
          }}>{errMsg}</div>
        )}

        {step === "idle" || step === "error" ? (
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={handlePay} disabled={!treasuryConfigured} style={{
              flex: 2, padding: "12px", borderRadius: 12, border: "none",
              background: treasuryConfigured ? "linear-gradient(135deg,#fbbf24,#f59e0b)" : "#ccc",
              color: "white", fontWeight: 700, fontSize: 14, cursor: treasuryConfigured ? "pointer" : "not-allowed",
            }}>
              Pay {info.priceUsd.toFixed(2)} USDT
            </button>
            <button onClick={onClose} style={{
              flex: 1, padding: "12px", borderRadius: 12,
              border: "1px solid rgba(0,0,0,0.12)", background: "white",
              color: "#1a1a2e", fontWeight: 600, fontSize: 14, cursor: "pointer",
            }}>
              Cancel
            </button>
          </div>
        ) : (
          <div style={{
            padding: 14, borderRadius: 12, textAlign: "center",
            background: "rgba(245,158,11,0.06)", fontSize: 13, color: "#92400e",
          }}>
            {step === "signing" && "Sign the USDT transfer in your wallet…"}
            {step === "confirming" && "Waiting for BSC confirmation…"}
            {step === "registering" && "Registering receipt with server…"}
            {step === "done" && "✅ Done! Applying action…"}
          </div>
        )}
      </div>
    </div>
  );
}
