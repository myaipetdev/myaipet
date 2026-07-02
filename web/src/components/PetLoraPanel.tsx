"use client";

/**
 * Pet-LoRA training panel for the Studio — the UI for the (already built,
 * env-gated) /api/pets/[petId]/lora pipeline.
 *
 * When PET_LORA_ENABLED is off the GET returns { enabled: false } and this
 * renders nothing, so the flagship feature stays dark in prod until ops flips
 * it on. When enabled it exposes the full lifecycle: train → poll → ready.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { getAuthHeaders } from "@/lib/api";
import Icon from "@/components/Icon";

interface Lora {
  id: number;
  status: "training" | "ready" | "failed";
  triggerWord: string;
  loraReady: boolean;
  imagesUsed: number;
  error?: string;
}

const POLL_MS = 20_000;
const MAX_POLLS = 18; // ~6 min, then stop and let the user refresh

export default function PetLoraPanel({ petId, petName }: { petId: number; petName: string }) {
  const [enabled, setEnabled] = useState(false);
  const [lora, setLora] = useState<Lora | null>(null);
  const [ready, setReady] = useState(true);        // initial load done
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollCount = useRef(0);

  const clearPoll = () => {
    if (pollRef.current) { clearTimeout(pollRef.current); pollRef.current = null; }
  };

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/pets/${petId}/lora`, { headers: getAuthHeaders() });
      if (!r.ok) { setEnabled(false); return; }
      const d = await r.json();
      setEnabled(!!d.enabled);
      setLora(d.lora || null);
      return d.lora as Lora | null;
    } catch {
      setEnabled(false);
    }
  }, [petId]);

  // (Re)load whenever the selected pet changes.
  useEffect(() => {
    setReady(false); setMsg(null); clearPoll(); pollCount.current = 0;
    load().finally(() => setReady(true));
    return clearPoll;
  }, [petId, load]);

  // Poll while a run is in flight (GET lazily advances the fal job server-side).
  useEffect(() => {
    if (lora?.status !== "training") { clearPoll(); return; }
    clearPoll();
    pollRef.current = setTimeout(async function tick() {
      pollCount.current += 1;
      const fresh = await load();
      if (fresh?.status === "training" && pollCount.current < MAX_POLLS) {
        pollRef.current = setTimeout(tick, POLL_MS);
      }
    }, POLL_MS);
    return clearPoll;
  }, [lora?.status, load]);

  const train = async (retrain = false) => {
    setBusy(true); setMsg(null);
    try {
      const r = await fetch(`/api/pets/${petId}/lora${retrain ? "?retrain=1" : ""}`, {
        method: "POST",
        headers: getAuthHeaders(),
      });
      const d = await r.json();
      if (!r.ok) { setMsg(d.error || "Couldn't start training."); if (d.lora) setLora(d.lora); return; }
      setLora(d.lora);
      pollCount.current = 0;
    } catch {
      setMsg("Network error — try again.");
    } finally {
      setBusy(false);
    }
  };

  if (!ready || !enabled) return null;

  const status = lora?.status;
  const wrap: React.CSSProperties = {
    marginTop: 12, padding: "13px 15px", borderRadius: 12,
    background: "#F5EFE2",
    border: "1px solid rgba(33,26,18,.13)",
  };
  const eyebrow: React.CSSProperties = {
    fontSize: 13, fontFamily: "var(--ed-m), 'Space Mono', ui-monospace, monospace",
    color: "#5C8A4E", letterSpacing: "0.1em", fontWeight: 700, marginBottom: 6,
    textTransform: "uppercase",
  };

  if (status === "ready") {
    return (
      <div style={wrap}>
        <div style={eyebrow}><Icon name="test-tube" size={12} style={{ marginRight: 5 }} /> IDENTITY MODEL · TRAINED</div>
        <div style={{ fontSize: 13, color: "#211A12", lineHeight: 1.5 }}>
          {petName}&rsquo;s face profile is trained and saved to their file.
        </div>
        <button onClick={() => train(true)} disabled={busy} style={ghostBtn}>
          {busy ? "Starting…" : "Retrain with newer photos"}
        </button>
      </div>
    );
  }

  if (status === "training") {
    return (
      <div style={wrap}>
        <div style={eyebrow}><Icon name="test-tube" size={12} style={{ marginRight: 5 }} /> TRAINING {petName.toUpperCase()}&rsquo;S IDENTITY</div>
        <div style={{ fontSize: 13, color: "#211A12", lineHeight: 1.5, display: "flex", alignItems: "center", gap: 8 }}>
          <Spinner /> Learning their face from {lora?.imagesUsed || "your"} photos — a few minutes.
          You can keep creating in the meantime.
        </div>
      </div>
    );
  }

  // none yet, or failed
  return (
    <div style={wrap}>
      <div style={eyebrow}><Icon name="sparkling" size={12} style={{ marginRight: 5 }} /> TRAIN {petName.toUpperCase()}&rsquo;S FACE PROFILE</div>
      <div style={{ fontSize: 13, color: "#211A12", lineHeight: 1.5 }}>
        Train a one-time identity model from {petName}&rsquo;s photos. Their
        face profile is saved to their pet file.
      </div>
      {status === "failed" && lora?.error && (
        <div style={{ fontSize: 13, color: "#BE4F28", marginTop: 6 }}>Last run failed: {lora.error}</div>
      )}
      {msg && <div style={{ fontSize: 13, color: "#BE4F28", marginTop: 6 }}>{msg}</div>}
      <button onClick={() => train(false)} disabled={busy} style={primaryBtn}>
        {busy ? "Starting…" : status === "failed" ? `Retry training ${petName}` : `Train ${petName}'s identity`}
      </button>
    </div>
  );
}

function Spinner() {
  return (
    <span style={{
      width: 13, height: 13, borderRadius: "50%", flexShrink: 0,
      border: "2px solid rgba(92,138,78,0.3)", borderTopColor: "#5C8A4E",
      display: "inline-block", animation: "mpspin 0.8s linear infinite",
    }}>
      <style>{`@keyframes mpspin{to{transform:rotate(360deg)}}`}</style>
    </span>
  );
}

const primaryBtn: React.CSSProperties = {
  marginTop: 10, padding: "9px 16px", borderRadius: 10, border: "none",
  background: "linear-gradient(180deg, #F49B2A, #E27D0C)", color: "#FFF8EE",
  fontSize: 13, fontWeight: 700, cursor: "pointer",
  fontFamily: "var(--ed-body), 'Hanken Grotesk', system-ui, sans-serif",
  boxShadow: "0 10px 20px -12px rgba(226,125,12,.7)",
};

const ghostBtn: React.CSSProperties = {
  marginTop: 8, padding: "6px 12px", borderRadius: 9,
  background: "transparent", border: "1px solid rgba(33,26,18,.13)",
  color: "#3A3024", fontSize: 13, fontWeight: 700, cursor: "pointer",
  fontFamily: "var(--ed-body), 'Hanken Grotesk', system-ui, sans-serif",
};
