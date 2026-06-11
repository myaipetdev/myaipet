"use client";

/**
 * In-app toast notifications — replaces the browser `alert()` calls scattered
 * across the codebase. Backed by a global event bus so any module can fire one
 * without importing React state.
 *
 * Usage:
 *   import { toast } from "@/components/Toast";
 *   toast("Saved!");
 *   toast("Couldn't save — try again", "error");
 *   toast("+20 pts · Streak Savior", "success");
 *
 * The mount point (<ToastHost />) is rendered once at the top of App.tsx.
 */

import { useEffect, useState } from "react";

type ToastKind = "info" | "success" | "error" | "warning";
interface ToastRow { id: number; text: string; kind: ToastKind; expiresAt: number; }

const LISTENERS: Array<(r: ToastRow) => void> = [];
let NEXT_ID = 1;

export function toast(text: string, kind: ToastKind = "info", durationMs = 3600) {
  const row: ToastRow = {
    id: NEXT_ID++, text, kind,
    expiresAt: Date.now() + durationMs,
  };
  for (const fn of LISTENERS) fn(row);
}

export default function ToastHost() {
  const [rows, setRows] = useState<ToastRow[]>([]);

  useEffect(() => {
    const onAdd = (r: ToastRow) => {
      setRows(prev => [...prev, r].slice(-5));
    };
    LISTENERS.push(onAdd);

    const tick = setInterval(() => {
      const now = Date.now();
      setRows(prev => prev.filter(r => r.expiresAt > now));
    }, 250);

    return () => {
      const i = LISTENERS.indexOf(onAdd);
      if (i >= 0) LISTENERS.splice(i, 1);
      clearInterval(tick);
    };
  }, []);

  if (typeof window === "undefined") return null;

  return (
    <div
      aria-live="polite"
      style={{
        position: "fixed",
        top: "calc(env(safe-area-inset-top, 0px) + 76px)",
        right: 16,
        zIndex: 10_000,
        display: "flex", flexDirection: "column", gap: 8,
        pointerEvents: "none",
        maxWidth: 360,
      }}
    >
      {rows.map(r => <ToastRowView key={r.id} row={r} onDismiss={() => setRows(prev => prev.filter(x => x.id !== r.id))} />)}
    </div>
  );
}

function ToastRowView({ row, onDismiss }: { row: ToastRow; onDismiss: () => void }) {
  const { fg, bg, border, emoji } = STYLE[row.kind];
  return (
    <div
      role="status"
      onClick={onDismiss}
      style={{
        pointerEvents: "auto",
        background: bg, color: fg, border,
        borderRadius: 14,
        padding: "12px 16px",
        display: "flex", alignItems: "center", gap: 12,
        fontSize: 14, fontWeight: 600,
        fontFamily: "'Space Grotesk', sans-serif",
        lineHeight: 1.45,
        boxShadow: "0 10px 32px rgba(15,23,42,0.12), 0 1px 0 rgba(255,255,255,0.6) inset",
        cursor: "pointer",
        animation: "toastIn 320ms cubic-bezier(0.2,0.8,0.2,1)",
      }}
    >
      <span style={{ fontSize: 18 }}>{emoji}</span>
      <span style={{ flex: 1 }}>{row.text}</span>
      <style>{`
        @keyframes toastIn {
          from { opacity: 0; transform: translateY(-6px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0)   scale(1); }
        }
      `}</style>
    </div>
  );
}

const STYLE: Record<ToastKind, { fg: string; bg: string; border: string; emoji: string }> = {
  info:    { fg: "#1a1a2e", bg: "white",                    border: "1px solid rgba(0,0,0,0.08)",      emoji: "💬" },
  success: { fg: "#15803d", bg: "rgba(220,252,231,0.96)",   border: "1px solid rgba(22,163,74,0.30)",  emoji: "✓" },
  error:   { fg: "#991b1b", bg: "rgba(254,226,226,0.96)",   border: "1px solid rgba(220,38,38,0.30)",  emoji: "⚠" },
  warning: { fg: "#92400e", bg: "rgba(254,243,199,0.96)",   border: "1px solid rgba(217,119,6,0.30)",  emoji: "💡" },
};
