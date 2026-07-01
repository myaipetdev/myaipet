"use client";

/**
 * In-app confirm / prompt dialogs — replaces the native window.confirm/prompt.
 * Same global event-bus pattern as Toast, but async: the call returns a Promise
 * that resolves when the user acts.
 *
 * Usage:
 *   import { confirmDialog, promptDialog } from "@/components/Dialog";
 *
 *   if (!(await confirmDialog({ title: "Disconnect Telegram?" }))) return;
 *   if (!(await confirmDialog({ title: "Wipe ALL entries?", body: "This is irreversible.", danger: true, confirmLabel: "Wipe" }))) return;
 *
 *   const next = await promptDialog({ title: "Edit content", defaultValue: current });
 *   if (next == null) return;          // user cancelled
 *
 * Mount <DialogHost /> once near <ToastHost /> in App.tsx.
 */

import { useEffect, useState } from "react";

interface ConfirmReq {
  kind: "confirm"; id: number;
  title: string; body?: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean;
  resolve: (v: boolean) => void;
}
interface PromptReq {
  kind: "prompt"; id: number;
  title: string; body?: string; defaultValue?: string; placeholder?: string; confirmLabel?: string; maxLength?: number;
  resolve: (v: string | null) => void;
}
type DialogReq = ConfirmReq | PromptReq;

const LISTENERS: Array<(r: DialogReq) => void> = [];
let NEXT_ID = 1;

export function confirmDialog(opts: {
  title: string; body?: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean;
}): Promise<boolean> {
  return new Promise((resolve) => {
    if (!LISTENERS.length) { resolve(typeof window !== "undefined" ? window.confirm(opts.title) : false); return; }
    const req: ConfirmReq = { kind: "confirm", id: NEXT_ID++, resolve, ...opts };
    for (const fn of LISTENERS) fn(req);
  });
}

export function promptDialog(opts: {
  title: string; body?: string; defaultValue?: string; placeholder?: string; confirmLabel?: string; maxLength?: number;
}): Promise<string | null> {
  return new Promise((resolve) => {
    if (!LISTENERS.length) { resolve(typeof window !== "undefined" ? window.prompt(opts.title, opts.defaultValue ?? "") : null); return; }
    const req: PromptReq = { kind: "prompt", id: NEXT_ID++, resolve, ...opts };
    for (const fn of LISTENERS) fn(req);
  });
}

export default function DialogHost() {
  const [req, setReq] = useState<DialogReq | null>(null);
  const [input, setInput] = useState("");

  useEffect(() => {
    const onReq = (r: DialogReq) => {
      setReq(r);
      setInput(r.kind === "prompt" ? (r.defaultValue ?? "") : "");
    };
    LISTENERS.push(onReq);
    return () => { const i = LISTENERS.indexOf(onReq); if (i >= 0) LISTENERS.splice(i, 1); };
  }, []);

  useEffect(() => {
    if (!req) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish(req.kind === "confirm" ? false : null);
      if (e.key === "Enter" && req.kind === "prompt") finish(input);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [req, input]);

  if (!req) return null;

  const finish = (value: boolean | string | null) => {
    if (req.kind === "confirm") req.resolve(value as boolean);
    else req.resolve(value as string | null);
    setReq(null);
  };

  const danger = req.kind === "confirm" && req.danger;
  const accent = danger ? "#C0392B" : "#BE4F28";
  const confirmLabel = req.confirmLabel || (req.kind === "confirm" ? (danger ? "Confirm" : "OK") : "Save");
  const cancelLabel = (req.kind === "confirm" && req.cancelLabel) || "Cancel";
  const promptTooShort = req.kind === "prompt" && input.trim().length === 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => { if (e.target === e.currentTarget) finish(req.kind === "confirm" ? false : null); }}
      style={{
        position: "fixed", inset: 0, zIndex: 10_001,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(33,26,18,0.42)", backdropFilter: "blur(2px)",
        padding: 20, animation: "dlgFade 160ms ease",
      }}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 400, background: "#FBF6EC", borderRadius: 18,
          padding: "22px 24px", boxShadow: "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))",
          border: "1px solid var(--ed-hair, rgba(33,26,18,.13))", animation: "dlgPop 200ms cubic-bezier(0.2,0.8,0.2,1)",
          fontFamily: "var(--ed-body)",
        }}
      >
        <div style={{ fontSize: 17, fontWeight: 800, color: "#211A12", letterSpacing: "-0.02em", lineHeight: 1.35, fontFamily: "var(--ed-disp)" }}>
          {req.title}
        </div>
        {req.body && (
          <div style={{ fontSize: 13.5, color: "#7A6E5A", marginTop: 8, lineHeight: 1.55 }}>
            {req.body}
          </div>
        )}

        {req.kind === "prompt" && (
          <input
            autoFocus
            value={input}
            onChange={(e) => setInput(e.target.value)}
            maxLength={req.maxLength}
            placeholder={req.placeholder || ""}
            style={{
              width: "100%", boxSizing: "border-box", marginTop: 14,
              padding: "10px 13px", borderRadius: 10, outline: "none",
              background: "#F5EFE2",
              border: `1px solid ${accent}55`, fontSize: 14.5, color: "#211A12",
              fontFamily: "var(--ed-body)",
            }}
          />
        )}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
          <button
            onClick={() => finish(req.kind === "confirm" ? false : null)}
            style={{
              padding: "9px 16px", borderRadius: 10, cursor: "pointer",
              border: "1px solid var(--ed-hair, rgba(33,26,18,.13))", background: "#F5EFE2",
              color: "#7A6E5A", fontSize: 13.5, fontWeight: 700,
              fontFamily: "var(--ed-disp)",
            }}
          >{cancelLabel}</button>
          <button
            autoFocus={req.kind === "confirm"}
            onClick={() => finish(req.kind === "confirm" ? true : input)}
            disabled={promptTooShort}
            style={{
              padding: "9px 18px", borderRadius: 10,
              cursor: promptTooShort ? "not-allowed" : "pointer",
              border: "none", color: "#FFF8EE", fontSize: 13.5, fontWeight: 800,
              fontFamily: "var(--ed-disp)",
              background: danger
                ? "linear-gradient(180deg,#D4553A,#C0392B)"
                : "linear-gradient(180deg,#F49B2A,#E27D0C)",
              boxShadow: "var(--ed-shadow-card, 0 12px 24px -16px rgba(80,55,20,.5))",
              opacity: promptTooShort ? 0.55 : 1,
            }}
          >{confirmLabel}</button>
        </div>
      </div>
      <style>{`
        @keyframes dlgFade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes dlgPop { from { opacity: 0; transform: translateY(8px) scale(0.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
      `}</style>
    </div>
  );
}
