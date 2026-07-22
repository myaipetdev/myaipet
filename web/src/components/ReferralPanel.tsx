"use client";

/**
 * Referral panel — editorial (Collectible Editorial system).
 *
 * Fetches the owner's stable referral link + code + counts from
 * GET /api/referral and renders a copy-to-clipboard card.
 *
 * Self-contained: no dependency on App.tsx / Nav.tsx routing. Drop in
 * anywhere (e.g. Account/Settings page) — see mountHint in the task summary.
 */

import { useEffect, useState } from "react";
import { getAuthHeaders } from "@/lib/api";

interface ReferralData {
  code: string;
  link: string;
  referralCount: number;
  pendingCount: number;
}

export default function ReferralPanel() {
  const [data, setData] = useState<ReferralData | null>(null);
  const [error, setError] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/referral", { headers: getAuthHeaders() });
        if (!res.ok) throw new Error("failed");
        const j = await res.json();
        if (alive) setData(j);
      } catch {
        if (alive) setError(true);
      }
    })();
    return () => { alive = false; };
  }, []);

  const copy = async () => {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(data.link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard API unavailable (e.g. non-secure context) — silently no-op,
      // the link text is still visible/selectable for manual copy.
    }
  };

  if (error) return null;

  return (
    <div
      className="referral-panel"
      style={{
        padding: 20,
        borderRadius: 4,
        marginTop: 16,
        background: "#FBF6EC",
        border: "2px solid #211A12",
        boxShadow: "4px 4px 0 #211A12",
        fontFamily: "var(--ed-body, 'Hanken Grotesk', sans-serif)",
        color: "#211A12",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 4 }}>
        <h3
          style={{
            fontFamily: "var(--ed-disp, 'Bricolage Grotesque', sans-serif)",
            fontSize: 16,
            fontWeight: 800,
            margin: 0,
            letterSpacing: "-0.01em",
            textTransform: "uppercase",
          }}
        >
          Invite Friends
        </h3>
        <span
          style={{
            fontFamily: "var(--ed-m, 'Space Mono', ui-monospace, monospace)",
            fontSize: 13,
            padding: "2px 8px",
            borderRadius: 999,
            background: "#BE4F28",
            color: "#FBF6EC",
            fontWeight: 700,
            letterSpacing: "0.06em",
          }}
        >
          REFERRAL
        </span>
      </div>

      <p style={{ fontSize: 13, color: "rgba(33,26,18,0.65)", margin: "0 0 14px", lineHeight: 1.6 }}>
        Share your link. When a friend adopts their first pet through it, you both get a credit bonus.
      </p>

      {!data ? (
        <div style={{ fontSize: 13, color: "rgba(33,26,18,0.5)" }}>Loading…</div>
      ) : (
        <>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 12px",
              borderRadius: 4,
              background: "#FFFFFF",
              border: "1px solid rgba(33,26,18,0.18)",
              marginBottom: 12,
            }}
          >
            <span
              style={{
                flex: 1,
                minWidth: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                fontFamily: "var(--ed-m, 'Space Mono', ui-monospace, monospace)",
                fontSize: 13,
                color: "#211A12",
              }}
            >
              {data.link}
            </span>
            <button
              onClick={copy}
              style={{
                flexShrink: 0,
                padding: "6px 12px",
                borderRadius: 4,
                border: "2px solid #211A12",
                background: copied ? "#9FC59A" : "#211A12",
                color: copied ? "#211A12" : "#FBF6EC",
                fontFamily: "var(--ed-disp, sans-serif)",
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
                textTransform: "uppercase",
                letterSpacing: "0.02em",
              }}
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>

          <div style={{ display: "flex", gap: 20 }}>
            <div>
              <div
                style={{
                  fontFamily: "var(--ed-m, 'Space Mono', ui-monospace, monospace)",
                  fontSize: 13,
                  letterSpacing: "0.1em",
                  color: "rgba(33,26,18,0.5)",
                  textTransform: "uppercase",
                }}
              >
                Successful
              </div>
              <div style={{ fontFamily: "var(--ed-disp, sans-serif)", fontSize: 22, fontWeight: 800 }}>
                {data.referralCount}
              </div>
            </div>
            {data.pendingCount > 0 && (
              <div>
                <div
                  style={{
                    fontFamily: "var(--ed-m, 'Space Mono', ui-monospace, monospace)",
                    fontSize: 13,
                    letterSpacing: "0.1em",
                    color: "rgba(33,26,18,0.5)",
                    textTransform: "uppercase",
                  }}
                >
                  Pending
                </div>
                <div style={{ fontFamily: "var(--ed-disp, sans-serif)", fontSize: 22, fontWeight: 800, color: "rgba(33,26,18,0.5)" }}>
                  {data.pendingCount}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
