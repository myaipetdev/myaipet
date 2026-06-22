"use client";

/**
 * Expression Pack — generate a real face per mood, anchored on the pet's identity
 * image, so the living portrait changes its actual expression (not just emote
 * overlays). User-initiated: each face is a normal Studio generation that charges
 * the user's own credits (grok-imagine, 5cr, refUrl = pet avatar). Generated URLs
 * are saved to the pet via /api/pets/[id]/mood-portrait (JSON, no migration).
 */

import { useState } from "react";
import { getAuthHeaders } from "@/lib/api";
import { toast } from "@/components/Toast";
import Icon from "@/components/Icon";
import { EXPRESSION_KEYS, EXPRESSION_META, type ExpressionKey } from "@/lib/moodPortraits";

const COST_EACH = 5; // grok-imagine creditsPerRun
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function ExpressionPack({ pet, petId, moodPortraits, onChange }: {
  pet: any; petId: number; moodPortraits: Record<string, string>; onChange?: () => void;
}) {
  const [busyKey, setBusyKey] = useState<ExpressionKey | "all" | null>(null);

  const hasAvatar = !!pet?.avatar_url;
  const have = EXPRESSION_KEYS.filter((k) => moodPortraits?.[k]);
  const missing = EXPRESSION_KEYS.filter((k) => !moodPortraits?.[k]);

  const genOne = async (key: ExpressionKey): Promise<boolean> => {
    const meta = EXPRESSION_META[key];
    const prompt = `Portrait headshot of ${pet.name}${pet.appearance_desc ? `, ${pet.appearance_desc}` : ""}, ${meta.prompt}, same character identity, cute, soft studio lighting, high detail, centered`;
    try {
      const res = await fetch("/api/studio/generate", {
        method: "POST", headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ modelId: "grok-imagine", petId, prompt }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast(data.error === "Insufficient credits" ? `Need ${COST_EACH} credits for ${meta.label}` : (data.error || `Couldn't generate ${meta.label}`), "error");
        return false;
      }
      let url: string | null = (data.status === "completed" && data.url) ? data.url : null;
      if (!url && data.generationId) {
        for (let i = 0; i < 25; i++) {
          await sleep(3000);
          const r2 = await fetch(`/api/studio/generate/${data.generationId}`, { headers: getAuthHeaders() }).catch(() => null);
          if (!r2?.ok) continue;
          const d2 = await r2.json().catch(() => null);
          if (d2?.status === "completed") { url = d2.url; break; }
          if (d2?.status === "failed") break;
        }
      }
      if (!url) { toast(`${meta.label} timed out — try again`, "error"); return false; }
      await fetch(`/api/pets/${petId}/mood-portrait`, {
        method: "POST", headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ key, url }),
      });
      return true;
    } catch { toast("Network error", "error"); return false; }
  };

  const generate = async (keys: ExpressionKey[], label: string) => {
    if (busyKey || !keys.length) return;
    setBusyKey(keys.length > 1 ? "all" : keys[0]);
    let ok = 0;
    for (const k of keys) { setBusyKey(k); if (await genOne(k)) ok++; }
    setBusyKey(null);
    if (ok > 0) { toast(`${ok} expression${ok > 1 ? "s" : ""} ready ✨`, "success"); onChange?.(); }
  };

  const clearOne = async (key: ExpressionKey) => {
    if (busyKey) return;
    try {
      await fetch(`/api/pets/${petId}/mood-portrait?key=${key}`, { method: "DELETE", headers: getAuthHeaders() });
      onChange?.();
    } catch { /* ignore */ }
  };

  return (
    <div style={{ marginTop: 12, padding: "14px 16px", borderRadius: 14, background: "linear-gradient(135deg, rgba(96,165,250,0.06), rgba(168,85,247,0.05))", border: "1px solid rgba(96,165,250,0.18)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 12, fontFamily: "'Space Grotesk',sans-serif", fontWeight: 800, color: "#2563eb", letterSpacing: "0.02em", display: "inline-flex", alignItems: "center", gap: 5 }}>
          <Icon name="sparkling" size={14} /> Expression Pack
        </span>
        <span style={{ fontSize: 9.5, fontFamily: "'JetBrains Mono', monospace", color: "rgba(26,26,46,0.4)" }}>
          {have.length}/{EXPRESSION_KEYS.length}
        </span>
      </div>
      <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 11.5, color: "rgba(26,26,46,0.55)", marginBottom: 12 }}>
        Generate real faces from {pet.name}&apos;s photo — the portrait then changes expression with their mood.
      </div>

      {!hasAvatar ? (
        <div style={{ padding: "10px 12px", borderRadius: 10, background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)", fontFamily: "'Space Grotesk',sans-serif", fontSize: 12, color: "#b45309" }}>
          Set {pet.name}&apos;s photo first (generate one in Studio, then ⭐ Set as avatar) — it&apos;s the anchor for every expression.
        </div>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 12 }}>
            {EXPRESSION_KEYS.map((k) => {
              const url = moodPortraits?.[k];
              const meta = EXPRESSION_META[k];
              const thisBusy = busyKey === k;
              return (
                <div key={k} style={{ textAlign: "center" }}>
                  <div className={thisBusy ? "studio-pulse" : undefined} style={{
                    aspectRatio: "1/1", borderRadius: 11, overflow: "hidden", position: "relative",
                    border: `1px solid ${url ? "rgba(96,165,250,0.4)" : "rgba(0,0,0,0.07)"}`,
                    background: url ? `center/cover no-repeat url(${url})` : "rgba(0,0,0,0.03)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {!url && (thisBusy
                      ? <Icon name="sparkling" size={22} />
                      : <span style={{ fontSize: 22, opacity: 0.5 }}>{meta.emoji}</span>)}
                    {url && !thisBusy && (
                      <button onClick={() => clearOne(k)} title="Clear" style={{
                        position: "absolute", top: 3, right: 3, width: 16, height: 16, borderRadius: "50%", border: "none",
                        background: "rgba(0,0,0,0.45)", color: "white", fontSize: 9, lineHeight: 1, cursor: "pointer", padding: 0,
                      }}>✕</button>
                    )}
                  </div>
                  <div style={{ fontSize: 9.5, fontFamily: "'JetBrains Mono', monospace", color: "rgba(26,26,46,0.55)", marginTop: 3 }}>{meta.emoji} {meta.label}</div>
                </div>
              );
            })}
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            {missing.length > 0 && (
              <button onClick={() => generate(missing, "missing")} disabled={!!busyKey} style={{
                flex: 1, padding: "10px", borderRadius: 11, border: "none", cursor: busyKey ? "wait" : "pointer",
                background: "linear-gradient(135deg,#60a5fa,#7c3aed)", color: "white",
                fontFamily: "'Space Grotesk',sans-serif", fontWeight: 800, fontSize: 13, opacity: busyKey ? 0.6 : 1,
              }}>
                {busyKey ? "Generating…" : `Generate ${missing.length} face${missing.length > 1 ? "s" : ""} · ${missing.length * COST_EACH} cr`}
              </button>
            )}
            {have.length > 0 && missing.length === 0 && (
              <button onClick={() => generate(EXPRESSION_KEYS as unknown as ExpressionKey[], "all")} disabled={!!busyKey} style={{
                flex: 1, padding: "10px", borderRadius: 11, border: "1px solid rgba(96,165,250,0.4)", cursor: busyKey ? "wait" : "pointer",
                background: "white", color: "#2563eb", fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 13, opacity: busyKey ? 0.6 : 1,
              }}>
                {busyKey ? "Generating…" : `↻ Regenerate all · ${EXPRESSION_KEYS.length * COST_EACH} cr`}
              </button>
            )}
          </div>
          <div style={{ fontSize: 9, fontFamily: "'JetBrains Mono', monospace", color: "rgba(26,26,46,0.4)", marginTop: 8, textAlign: "center" }}>
            {COST_EACH} credits each · anchored on {pet.name}&apos;s photo
          </div>
        </>
      )}
    </div>
  );
}
