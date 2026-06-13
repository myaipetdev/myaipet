"use client";

/**
 * Client component for the leaderboard table — handles the "⚔️ Challenge"
 * button per row, which triggers a battle against that specific pet.
 *
 * The challenge flow piggybacks on the existing /api/battle/create endpoint
 * with the opponentPetId param. 402 → PaywallModal → tx_hash → re-call.
 *
 * Why client-side: the user picks their own pet to challenge with, and the
 * USDT signature happens in the browser via wagmi.
 */

import { useEffect, useState } from "react";
import { getAuthHeaders } from "@/lib/api";
import PaywallModal from "@/components/PaywallModal";

export interface LeaderRow {
  rank: number;
  petId: number;
  name: string;
  level: number;
  evolutionStage: number;
  atk: number; def: number; spd: number;
  combinedPower: number;
  avatarUrl: string | null;
  ownerWallet: string;
  totalInteractions: number;
  careStreak: number;
}

export default function DashboardList({ rows }: { rows: LeaderRow[] }) {
  const [myPets, setMyPets] = useState<Array<{ id: number; name: string; level: number }>>([]);
  const [picker, setPicker] = useState<{ opponent: LeaderRow } | null>(null);
  const [busy, setBusy] = useState(false);
  const [paywall, setPaywall] = useState<any>(null);

  useEffect(() => {
    fetch("/api/pets", { headers: getAuthHeaders() })
      .then(r => r.ok ? r.json() : null)
      .then(d => Array.isArray(d?.pets) ? setMyPets(d.pets) : null)
      .catch(() => {});
  }, []);

  const startChallenge = async (myPetId: number, opponentPetId: number, txHash?: string) => {
    if (busy) return;
    setBusy(true);
    try {
      const url = txHash
        ? `/api/battle/create?tx_hash=${txHash}`
        : "/api/battle/create";
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ petId: myPetId, opponentPetId }),
      });
      if (res.status === 402) {
        const { paywall: pw } = await res.json();
        setPaywall({
          ...pw,
          onPaid: async (newTx: string) => {
            setPaywall(null);
            await startChallenge(myPetId, opponentPetId, newTx);
          },
        });
        return;
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || "Challenge failed");
        return;
      }
      const { result } = await res.json();
      window.location.href = `/battle/${result.battleId}`;
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div style={{
        background: "white", borderRadius: 16, padding: 8,
        border: "1px solid rgba(0,0,0,0.06)",
      }}>
        {rows.map((p) => (
          <div key={p.petId} className="leader-row" style={{
            display: "grid", gridTemplateColumns: "44px 44px 1fr auto auto auto", alignItems: "center", gap: 12,
            padding: "10px 14px", borderRadius: 10,
            color: "#1a1a2e",
          }}>
            <span style={{
              fontFamily: "'JetBrains Mono', monospace", fontSize: 14, fontWeight: 700,
              color: "rgba(26,26,46,0.5)", textAlign: "right",
            }}>#{p.rank}</span>
            <div style={{
              width: 36, height: 36, borderRadius: 8, overflow: "hidden",
              background: "rgba(0,0,0,0.04)",
            }}>
              {p.avatarUrl ? (
                <img src={p.avatarUrl} alt={p.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>🐾</div>
              )}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>
                {p.name}
                {p.careStreak >= 7 && (
                  <span style={{ marginLeft: 6, fontSize: 10, color: "#b45309" }}>🔥{p.careStreak}d</span>
                )}
              </div>
              <div style={{ fontSize: 10, fontFamily: "mono", color: "rgba(26,26,46,0.45)" }}>
                Lv.{p.level} · {p.ownerWallet}
              </div>
            </div>
            <div className="leader-stats" style={{
              fontSize: 10, fontFamily: "mono", color: "rgba(26,26,46,0.55)",
              textAlign: "right", whiteSpace: "nowrap",
            }}>
              <div>A{p.atk} D{p.def} S{p.spd}</div>
            </div>
            <div style={{
              fontSize: 16, fontWeight: 800, color: "#b45309",
              fontFamily: "'JetBrains Mono', monospace", textAlign: "right",
              minWidth: 50,
            }}>
              {p.combinedPower}
            </div>
          </div>
        ))}
        {rows.length === 0 && (
          <div style={{ padding: 40, textAlign: "center", color: "rgba(26,26,46,0.5)", fontSize: 13 }}>
            No pets in the leaderboard yet.
          </div>
        )}
      </div>

      {/* Pet picker modal — choose which of MY pets to challenge with */}
      {picker && (
        <div onClick={() => setPicker(null)} style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 9999,
          display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
        }}>
          <div onClick={(e) => e.stopPropagation()} style={{
            maxWidth: 440, width: "100%", background: "white", borderRadius: 20,
            padding: 24, boxShadow: "0 20px 60px rgba(0,0,0,0.18)",
          }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, margin: "0 0 6px", letterSpacing: "-0.02em" }}>
              Challenge {picker.opponent.name}
            </h2>
            <p style={{ fontSize: 13, color: "rgba(26,26,46,0.6)", margin: "0 0 18px", lineHeight: 1.55 }}>
              Power {picker.opponent.combinedPower} · Lv.{picker.opponent.level}. Pick your pet to send in.
            </p>
            <div style={{ display: "grid", gap: 8 }}>
              {myPets.map(myPet => (
                <button
                  key={myPet.id}
                  onClick={() => { setPicker(null); startChallenge(myPet.id, picker.opponent.petId); }}
                  disabled={busy}
                  style={{
                    padding: "12px 14px", borderRadius: 10,
                    border: "1px solid rgba(0,0,0,0.08)", background: "white",
                    color: "#1a1a2e", fontWeight: 700, fontSize: 14, cursor: busy ? "wait" : "pointer",
                    textAlign: "left",
                  }}
                >
                  {myPet.name} <span style={{ fontFamily: "mono", fontSize: 11, color: "rgba(26,26,46,0.5)", fontWeight: 400 }}>· Lv.{myPet.level}</span>
                </button>
              ))}
            </div>
            <button onClick={() => setPicker(null)} style={{
              marginTop: 14, width: "100%", padding: 10, borderRadius: 8,
              border: "1px solid rgba(0,0,0,0.1)", background: "white", color: "#1a1a2e",
              fontWeight: 600, fontSize: 12, cursor: "pointer",
            }}>Cancel</button>
          </div>
        </div>
      )}

      <PaywallModal info={paywall} onClose={() => setPaywall(null)} />
    </>
  );
}
