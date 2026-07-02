"use client";

/**
 * Pet wardrobe — buy cute cosmetics with credits and wear them on your pet.
 * The "cute + spend" payoff: you get attached to your living pet, then dress it.
 * Buy via /api/shop (charges once), then wear/take-off freely via the wardrobe
 * endpoint. `onChange` lets the parent refresh the portrait overlay live.
 */

import { useEffect, useState } from "react";
import { getAuthHeaders } from "@/lib/api";
import { toast } from "@/components/Toast";

interface Wearable {
  key: string; name: string; description: string; icon: string;
  category: string; rarity: string; price: number; owned: boolean; equipped: boolean;
}

const RARITY_COLOR: Record<string, string> = {
  common: "#94a3b8", uncommon: "#22c55e", rare: "#3b82f6", epic: "#a855f7", legendary: "#f59e0b",
};

export default function WardrobeCard({ petId, onChange }: { petId: number; onChange?: () => void }) {
  const [items, setItems] = useState<Wearable[] | null>(null);
  const [credits, setCredits] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = () =>
    fetch(`/api/pets/${petId}/wardrobe`, { headers: getAuthHeaders() })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) { setItems(d.items); setCredits(d.credits); } })
      .catch(() => {});

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [petId]);

  const act = async (it: Wearable) => {
    if (busy) return;
    setBusy(it.key);
    try {
      if (!it.owned) {
        const r = await fetch("/api/shop", {
          method: "POST", headers: { "Content-Type": "application/json", ...getAuthHeaders() },
          body: JSON.stringify({ item_key: it.key, pet_id: petId }),
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) { toast(d.error === "Insufficient credits" ? `Need ${d.required} credits (you have ${d.available})` : (d.error || "Couldn't buy"), "error"); setBusy(null); return; }
        toast(`${it.icon} ${it.name} — bought & worn!`, "success");
      } else {
        const action = it.equipped ? "unequip" : "equip";
        const r = await fetch(`/api/pets/${petId}/wardrobe`, {
          method: "POST", headers: { "Content-Type": "application/json", ...getAuthHeaders() },
          body: JSON.stringify({ item_key: it.key, action }),
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) { toast(d.error || "Couldn't update", "error"); setBusy(null); return; }
        toast(action === "equip" ? `${it.icon} ${it.name} on!` : `Took off ${it.name}`, "info");
      }
      await load();
      onChange?.();
    } catch { toast("Network error", "error"); }
    setBusy(null);
  };

  if (!items || items.length === 0) return null;

  return (
    <div style={{ marginTop: 12, padding: "14px 16px", borderRadius: 14, background: "linear-gradient(135deg, rgba(168,85,247,0.06), rgba(245,158,11,0.04))", border: "1px solid rgba(168,85,247,0.16)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 13, fontFamily: "'Space Grotesk',sans-serif", fontWeight: 800, color: "#7c3aed", letterSpacing: "0.04em" }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
            <path d="M12 2.5a2 2 0 0 0-2 2c0 1 1 1.6 1.4 2.4" />
            <path d="M11.4 6.9 4.5 11a1 1 0 0 0-.5.9V20a1.5 1.5 0 0 0 1.5 1.5h13A1.5 1.5 0 0 0 20 20v-8.1a1 1 0 0 0-.5-.9l-6.9-4.1" />
            <path d="m9 12 3 2 3-2" />
          </svg>
          Wardrobe
        </span>
        {credits != null && (
          <span style={{ fontSize: 13, fontFamily: "'JetBrains Mono', monospace", color: "rgba(26,26,46,0.5)" }}>
            {credits.toLocaleString()} credits
          </span>
        )}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))", gap: 8 }}>
        {items.map((it) => {
          const rc = RARITY_COLOR[it.rarity] || "#94a3b8";
          return (
            <div key={it.key} style={{
              padding: "10px 8px", borderRadius: 11, textAlign: "center",
              background: it.equipped ? "rgba(168,85,247,0.12)" : "white",
              border: `1px solid ${it.equipped ? "rgba(168,85,247,0.45)" : "rgba(0,0,0,0.06)"}`,
            }}>
              <div style={{ fontSize: 30, lineHeight: 1.1 }}>{it.icon}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#1a1a2e", marginTop: 3, letterSpacing: "-0.01em" }}>{it.name}</div>
              <div style={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace", color: rc, textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 1 }}>{it.rarity}</div>
              <button
                onClick={() => act(it)}
                disabled={busy === it.key}
                style={{
                  marginTop: 7, width: "100%", padding: "6px 4px", borderRadius: 8, cursor: busy === it.key ? "wait" : "pointer",
                  border: "none", fontFamily: "'Space Grotesk',sans-serif", fontSize: 13, fontWeight: 700,
                  color: it.equipped ? "#7c3aed" : "white",
                  background: it.equipped
                    ? "rgba(168,85,247,0.16)"
                    : it.owned ? "linear-gradient(135deg,#a855f7,#7c3aed)" : "linear-gradient(135deg,#fbbf24,#f59e0b)",
                  opacity: busy === it.key ? 0.6 : 1,
                }}
              >
                {busy === it.key ? "…" : it.equipped ? "✓ Worn" : it.owned ? "Wear" : `${it.price} cr`}
              </button>
            </div>
          );
        })}
      </div>
      <div style={{ fontSize: 13, fontFamily: "'JetBrains Mono', monospace", color: "rgba(26,26,46,0.4)", marginTop: 9, textAlign: "center" }}>
        Buy once with credits · wear &amp; swap any time
      </div>
    </div>
  );
}
