"use client";

/**
 * Pet Date — one-click AI-generated conversation between two pets.
 *
 * Picks one of the user's pets + a target pet (any active pet across the
 * platform — for the v1 we just let them paste a petId; later we add a
 * picker that surfaces the buddy graph).
 *
 * No graphics; just a turn-based dialogue log + a vibe label + friendship
 * delta. Costs 20 credits.
 */
import { useEffect, useState } from "react";
import { getAuthHeaders } from "@/lib/api";
import { toast } from "@/components/Toast";
import Icon from "@/components/Icon";

interface Pet { id: number; name: string; avatar_url: string | null; }
interface DateResult {
  pet_a: { name: string; avatar_url: string | null };
  pet_b: { name: string; avatar_url: string | null };
  log: { speaker: "A" | "B"; text: string }[];
  vibe: string;
  friendship: number;
}

const VIBE_STYLE: Record<string, { bg: string; fg: string }> = {
  playful:  { bg: "rgba(190,79,40,0.12)", fg: "#9A4E1E" },
  deep:     { bg: "rgba(190,79,40,0.08)", fg: "#211A12" },
  rivalry:  { bg: "rgba(190,79,40,0.16)", fg: "#9A4E1E" },
  shy:      { bg: "rgba(33,26,18,0.06)",  fg: "#211A12" },
};

export default function PetDateWidget() {
  const [pets, setPets] = useState<Pet[]>([]);
  const [myPetId, setMyPetId] = useState<number | null>(null);
  const [targetPetId, setTargetPetId] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<DateResult | null>(null);
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/pets", { headers: getAuthHeaders() })
      .then(r => {
        if (r.status === 401) { setAuthed(false); return null; }
        setAuthed(true);
        return r.ok ? r.json() : null;
      })
      .then(d => {
        if (!d) return;
        const list = (d?.pets || []) as Pet[];
        setPets(list);
        if (list.length) setMyPetId(list[0].id);
      })
      .catch(() => {});
  }, []);

  const validTarget = Number.isInteger(Number(targetPetId)) && Number(targetPetId) > 0;

  const go = async () => {
    if (!myPetId || !validTarget) return;
    setBusy(true); setResult(null);
    try {
      const r = await fetch("/api/pet-date", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ myPetId, theirPetId: Number(targetPetId) }),
      });
      const d = await r.json();
      if (!r.ok) toast(d?.error || "Date didn't go well — try again?", "error");
      else { setResult(d); toast("Date complete — read the chat", "success"); }
    } catch { toast("Network hiccup — try again?", "error"); }
    setBusy(false);
  };

  if (authed === false || authed === null) return null;

  return (
    <div className="mp-enter mp-enter-4" style={{ maxWidth: 1060, margin: "20px auto", padding: "0 24px" }}>
      <div style={{
        background: "#FBF6EC", borderRadius: 16,
        border: "1px solid var(--ed-hair, rgba(33,26,18,.13))", overflow: "hidden",
        boxShadow: "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))",
      }}>
        <div style={{
          padding: "16px 22px", borderBottom: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <span style={{ fontSize: 22, display: "inline-flex" }}><Icon name="heart" size={22} /></span>
          <div style={{ fontSize: 12, fontFamily: "var(--ed-m)", letterSpacing: "0.14em", color: "#7A6E5A" }}>
            PET DATE · AI-WRITTEN MEETUP
          </div>
          <div style={{ flex: 1 }} />
          <span style={{
            padding: "3px 8px", borderRadius: 999,
            background: "rgba(190,79,40,0.12)", border: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
            fontSize: 12, fontWeight: 800,
            fontFamily: "var(--ed-m)", color: "#9A4E1E",
          }}>20 cr</span>
        </div>

        <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <select
              aria-label="Your pet"
              value={myPetId ?? ""}
              onChange={e => setMyPetId(Number(e.target.value))}
              style={{
                flex: "1 1 200px", padding: "10px 12px", borderRadius: 10,
                border: "1px solid var(--ed-hair, rgba(33,26,18,.13))", fontSize: 13,
                fontFamily: "var(--ed-disp)", background: "#F5EFE2", color: "#211A12",
              }}
            >
              {pets.map(p => <option key={p.id} value={p.id}>🐾 {p.name}</option>)}
            </select>
            <input
              type="number"
              aria-label="Target pet ID from leaderboard"
              value={targetPetId}
              onChange={e => setTargetPetId(e.target.value)}
              placeholder="Target pet ID (from leaderboard)"
              style={{
                flex: "1 1 220px", padding: "10px 12px", borderRadius: 10,
                border: "1px solid var(--ed-hair, rgba(33,26,18,.13))", fontSize: 13,
                fontFamily: "var(--ed-m)", background: "#F5EFE2", color: "#211A12",
              }}
            />
            <button onClick={go} disabled={busy || !myPetId || !validTarget} style={{
              padding: "10px 16px", borderRadius: 10, border: "none",
              background: "linear-gradient(180deg,#F49B2A,#E27D0C)",
              color: "#FFF8EE", fontWeight: 800, fontSize: 13,
              cursor: "pointer", boxShadow: "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))",
              opacity: busy || !myPetId || !validTarget ? 0.5 : 1,
              fontFamily: "var(--ed-disp)",
            }}>{busy ? "Setting up date…" : "Start date"}</button>
          </div>

          {result && <DateLog result={result} />}
        </div>
      </div>
    </div>
  );
}

function DateLog({ result }: { result: DateResult }) {
  const vibe = VIBE_STYLE[result.vibe] || VIBE_STYLE.playful;
  return (
    <div style={{
      marginTop: 6, padding: 16, borderRadius: 12,
      background: "#F5EFE2",
      border: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
      boxShadow: "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <div style={{
          padding: "4px 10px", borderRadius: 999,
          background: vibe.bg, color: vibe.fg, border: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
          fontSize: 12, fontWeight: 800,
          fontFamily: "var(--ed-m)", letterSpacing: "0.1em",
        }}>{result.vibe.toUpperCase()}</div>
        <div style={{ flex: 1 }} />
        <div style={{
          fontSize: 12, fontWeight: 800, fontFamily: "var(--ed-m)",
          color: result.friendship >= 0 ? "#9A4E1E" : "#7A6E5A",
        }}>
          friendship {result.friendship >= 0 ? `+${result.friendship}` : result.friendship}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {result.log.map((line, i) => {
          const isA = line.speaker === "A";
          const speaker = isA ? result.pet_a : result.pet_b;
          return (
            <div key={i} style={{
              display: "flex", flexDirection: isA ? "row" : "row-reverse",
              gap: 10,
            }}>
              {speaker.avatar_url
                ? <img src={speaker.avatar_url} alt="" style={{ width: 28, height: 28, borderRadius: 8, flexShrink: 0, objectFit: "cover", border: "1px solid var(--ed-hair, rgba(33,26,18,.13))" }} />
                : <img src="/mascot.jpg" alt="" style={{ width: 28, height: 28, borderRadius: 8, flexShrink: 0, objectFit: "cover", border: "1px solid var(--ed-hair, rgba(33,26,18,.13))" }} />}
              <div style={{
                padding: "8px 12px", borderRadius: 12,
                background: isA ? "rgba(190,79,40,0.12)" : "#FBF6EC",
                border: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
                maxWidth: "70%",
                borderTopLeftRadius: isA ? 4 : 12,
                borderTopRightRadius: isA ? 12 : 4,
                fontSize: 13, lineHeight: 1.5, color: "#211A12",
              }}>{line.text}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
