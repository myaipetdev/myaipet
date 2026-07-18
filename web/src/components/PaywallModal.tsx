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
 *       }});
 *       return;
 *     }
 *     ...
 *   };
 *
 *   <PaywallModal info={paywall} onClose={() => setPaywall(null)} />
 */

import { useEffect, useId, useRef, useState } from "react";
import { useDirectUsdtPay } from "@/hooks/useDirectUsdtPay";
import { getAuthHeaders } from "@/lib/api";
import Icon from "@/components/Icon";

export interface PaywallInfo {
  actionKey: string;
  priceUsd: number;
  description: string;
  treasury: string;
  petId?: number;
  paymentsEnabled: boolean;
  reason: "free_cap_exhausted" | "no_free_tier" | "payments_paused";
  /** Called after on-chain tx confirmed. Should re-run the original action with ?tx_hash=… */
  onPaid: (txHash: string) => Promise<void> | void;
}

export default function PaywallModal({ info, onClose }: { info: PaywallInfo | null; onClose: () => void }) {
  const { pay, treasuryConfigured } = useDirectUsdtPay();
  const [step, setStep] = useState<"idle" | "signing" | "confirming" | "registering" | "done" | "error">("idle");
  const [errMsg, setErrMsg] = useState<string | null>(null);
  // Once the on-chain transfer succeeds, the tx hash is held here so an error
  // retry re-runs RECEIPT REGISTRATION — it must NEVER re-sign a second
  // transfer for money that already left the wallet.
  const [paidTxHash, setPaidTxHash] = useState<string | null>(null);
  const [receiptRegistered, setReceiptRegistered] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();
  const openKey = info ? `${info.actionKey}:${info.petId ?? "none"}` : null;
  const pendingStorageKey = openKey ? `petclaw:pending-paid-action:${openKey}` : null;
  const canClose = step === "idle" || step === "error";
  const paymentsAvailable = Boolean(info?.paymentsEnabled && treasuryConfigured);
  const canSubmit = Boolean(paidTxHash) || paymentsAvailable;

  useEffect(() => {
    if (!openKey) return;
    setStep("idle");
    setErrMsg(null);
    try {
      const raw = pendingStorageKey ? window.localStorage.getItem(pendingStorageKey) : null;
      const pending = raw ? JSON.parse(raw) : null;
      const valid = pending
        && pending.actionKey === info?.actionKey
        && pending.petId === (info?.petId ?? null)
        && typeof pending.txHash === "string"
        && /^0x[0-9a-fA-F]{64}$/.test(pending.txHash);
      setPaidTxHash(valid ? pending.txHash : null);
      setReceiptRegistered(Boolean(valid && pending.receiptRegistered));
      if (valid) {
        setErrMsg("A previous payment is ready to recover. Retrying uses the same receipt and will not charge again.");
      }
    } catch {
      setPaidTxHash(null);
      setReceiptRegistered(false);
    }
  }, [info?.actionKey, info?.petId, openKey, pendingStorageKey]);

  useEffect(() => {
    if (!openKey) return;
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusTimer = window.setTimeout(() => {
      panelRef.current?.querySelector<HTMLElement>('button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')?.focus();
    }, 0);
    return () => {
      window.clearTimeout(focusTimer);
      document.body.style.overflow = previousOverflow;
      const target = returnFocusRef.current;
      requestAnimationFrame(() => target?.focus());
    };
  }, [openKey]);

  useEffect(() => {
    if (!openKey) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && canClose) {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canClose, onClose, openKey]);

  if (!info) return null;

  const persistPending = (txHash: string, registered: boolean) => {
    if (!pendingStorageKey) return;
    window.localStorage.setItem(pendingStorageKey, JSON.stringify({
      actionKey: info.actionKey,
      petId: info.petId ?? null,
      txHash,
      receiptRegistered: registered,
    }));
  };

  const clearPending = () => {
    if (pendingStorageKey) window.localStorage.removeItem(pendingStorageKey);
  };

  const applyPaidAction = async (txHash: string) => {
    setStep("done");
    try {
      await info.onPaid(txHash);
      clearPending();
      setPaidTxHash(null);
      setReceiptRegistered(false);
      onClose();
      return true;
    } catch (error: any) {
      setStep("error");
      setErrMsg(`${error?.message || "The paid action could not be applied"} — your receipt is registered; retrying will NOT charge you again.`);
      return false;
    }
  };

  const registerReceipt = async (txHash: string) => {
    setStep("registering");
    try {
      // Auth is Bearer-token based (lib/auth reads the Authorization header) —
      // cookies alone 401 here, which used to strand every paid receipt.
      const reg = await fetch("/api/payments/action-pay", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        credentials: "include",
        body: JSON.stringify({ actionKey: info.actionKey, txHash, petId: info.petId }),
      });
      if (!reg.ok) {
        const j = await reg.json().catch(() => ({}));
        throw new Error(j.error || `Receipt registration failed (${reg.status})`);
      }
      setReceiptRegistered(true);
      persistPending(txHash, true);
    } catch (e: any) {
      setStep("error");
      setErrMsg(`${e.message} — your payment is on-chain; tap "Retry registering receipt" (you will NOT be charged again).`);
      return false;
    }
    return applyPaidAction(txHash);
  };

  const handlePay = async () => {
    setErrMsg(null);
    // Money already sent → only retry the registration step.
    if (paidTxHash) {
      if (receiptRegistered) await applyPaidAction(paidTxHash);
      else await registerReceipt(paidTxHash);
      return;
    }

    try {
      setStep("signing");
      const result = await pay(info.priceUsd);
      if ("error" in result) {
        setStep("error");
        setErrMsg(result.error);
        return;
      }
      setStep("confirming");
      const txHash = result.hash;
      setPaidTxHash(txHash);
      persistPending(txHash, false);

      // Let BSC accumulate the server's safe default depth (3 confirmations).
      // The server remains authoritative and will ask this same receipt to retry
      // if the configured depth is higher or the chain is temporarily slower.
      await new Promise(r => setTimeout(r, 9000));
      await registerReceipt(txHash);
    } catch (error: any) {
      setStep("error");
      setErrMsg(error?.message || "The payment request failed. No receipt was registered.");
    }
  };

  return (
    <div onMouseDown={(event) => { if (event.target === event.currentTarget && canClose) onClose(); }} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 9999,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
    }}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        aria-busy={!canClose}
        onMouseDown={(e) => e.stopPropagation()}
        style={{
        maxWidth: 420, width: "100%", background: "#FBF6EC", borderRadius: 20,
        padding: 28, boxShadow: "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))",
        fontFamily: "var(--ed-body, sans-serif)", color: "#211A12",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <span style={{ fontSize: 26 }}><Icon name="diamond" size={26} /></span>
          <h2 id={titleId} style={{ fontSize: 20, fontWeight: 800, margin: 0, letterSpacing: "-0.02em" }}>
            {info.reason === "payments_paused"
              ? "Payments paused"
              : info.reason === "free_cap_exhausted"
                ? "Daily free cap reached"
                : "Premium action"}
          </h2>
        </div>

        <p id={descriptionId} style={{ fontSize: 14, color: "rgba(33,26,18,0.7)", lineHeight: 1.6, margin: "0 0 18px" }}>
          {info.description}
        </p>

        <div style={{
          padding: "14px 18px", borderRadius: 12, marginBottom: 16,
          background: "linear-gradient(135deg, rgba(190,79,40,0.08), rgba(190,79,40,0.04))",
          border: "1px solid rgba(190,79,40,0.2)",
        }}>
          <div style={{ fontSize: 13, color: "rgba(33,26,18,0.55)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Price</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: "#9A4E1E", marginTop: 4 }}>
            {info.priceUsd.toFixed(2)} USDT
          </div>
          <div style={{ fontSize: 13, color: "rgba(33,26,18,0.5)", marginTop: 4, fontFamily: "var(--ed-m, ui-monospace, monospace)" }}>
            BSC (BEP-20) USDT · payment goes to project treasury
          </div>
        </div>

        {!paymentsAvailable && (
          <div style={{
            padding: 10, borderRadius: 8, marginBottom: 12,
            background: "rgba(220,38,38,0.08)", color: "#dc2626",
            fontSize: 13, fontFamily: "var(--ed-m, ui-monospace, monospace)",
            display: "flex", alignItems: "center", gap: 6,
          }}>
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }} aria-hidden="true">
              <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <span>Payments are temporarily paused. No transfer will be requested.</span>
          </div>
        )}

        {errMsg && (
          <div role="alert" style={{
            padding: 10, borderRadius: 8, marginBottom: 12,
            background: "rgba(220,38,38,0.08)", color: "#dc2626", fontSize: 13,
          }}>{errMsg}</div>
        )}

        {step === "idle" || step === "error" ? (
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={handlePay} disabled={!canSubmit} style={{
              flex: 2, padding: "12px", borderRadius: 12, border: "none",
              background: canSubmit ? "linear-gradient(180deg,#F49B2A,#E27D0C)" : "#ccc",
              color: "#FFF8EE", fontWeight: 700, fontSize: 14, cursor: canSubmit ? "pointer" : "not-allowed",
            }}>
              {paidTxHash
                ? receiptRegistered ? "Retry applying paid action" : "Retry registering receipt"
                : `Pay ${info.priceUsd.toFixed(2)} USDT`}
            </button>
            <button type="button" onClick={onClose} style={{
              flex: 1, padding: "12px", borderRadius: 12,
              border: "1px solid rgba(33,26,18,0.13)", background: "#FBF6EC",
              color: "#211A12", fontWeight: 600, fontSize: 14, cursor: "pointer",
            }}>
              Cancel
            </button>
          </div>
        ) : (
          <div role="status" aria-live="polite" style={{
            padding: 14, borderRadius: 12, textAlign: "center",
            background: "rgba(190,79,40,0.06)", fontSize: 13, color: "#9A4E1E",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
          }}>
            {step === "signing" && "Sign the USDT transfer in your wallet…"}
            {step === "confirming" && "Waiting for BSC confirmation…"}
            {step === "registering" && "Registering receipt with server…"}
            {step === "done" && (
              <>
                <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }} aria-hidden="true">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
                <span>Done! Applying action…</span>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
