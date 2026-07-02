"use client";

/**
 * ChatEditorial — the dedicated Chat screen (design 시안 05). A terracotta pet
 * rail (identity + bond + "remembers you") on the left, the live conversation on
 * the right. Wired to the real chat API (api.pets.chat / chatHistory) — no faked
 * messages; an empty history just opens with the pet's greeting.
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { api } from "@/lib/api";

const T = {
  field: "#ECE4D4", paper: "#FBF6EC", inset: "#F5EFE2", ink: "#211A12", ink70: "#3A3024",
  muted: "#7A6E5A", muted2: "#5C5140", mono: "#9A7B4E", hair: "rgba(33,26,18,.13)",
  terra: "#BE4F28", terraSub: "#9A4E1E", creamOn: "#FCE9CF",
  disp: "var(--ed-disp)", body: "var(--ed-body)", m: "var(--ed-m)",
};

interface Msg { role: "user" | "pet"; text: string }
interface Pet { id: number; name: string; level?: number; species?: number; species_name?: string; element?: string; avatar_url?: string; bond_level?: number; evolution_name?: string }

export default function ChatEditorial({ onNavigate }: { onNavigate?: (s: string) => void }) {
  const [pets, setPets] = useState<Pet[] | null>(null);
  const [active, setActive] = useState<Pet | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    api.pets.list().then((d: any) => {
      const list: Pet[] = d.pets || [];
      setPets(list);
      if (list.length) setActive(list[0]);
    }).catch(() => setPets([]));
  }, []);

  useEffect(() => {
    if (!active) return;
    setMsgs([]);
    api.pets.chatHistory(active.id).then((d: any) => {
      const m = (d.messages || []) as Msg[];
      setMsgs(m.length ? m : [{ role: "pet", text: `Hi! I've been thinking about you. What's on your mind?` }]);
    }).catch(() => setMsgs([{ role: "pet", text: `Hi! I've been thinking about you. What's on your mind?` }]));
  }, [active?.id]);

  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [msgs, busy]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || busy || !active) return;
    setInput("");
    setMsgs((m) => [...m, { role: "user", text }]);
    setBusy(true);
    try {
      const res: any = await api.pets.chat(active.id, text);
      setMsgs((m) => [...m, { role: "pet", text: res?.reply || `*${active.name} tilts head*` }]);
    } catch {
      setMsgs((m) => [...m, { role: "pet", text: `*${active.name} blinks* — I couldn't reach my memory just now. Try again in a moment.` }]);
    } finally { setBusy(false); }
  }, [input, busy, active]);

  const photo = active?.avatar_url || "/mascot.jpg";
  const species = active?.evolution_name || active?.species_name || "Companion";
  const element = (active?.element || "").toUpperCase();
  const bond = active?.bond_level ?? 0;

  return (
    <div style={{ position: "relative", fontFamily: T.body, color: T.ink, paddingTop: 78, minHeight: "100vh" }}>
      <div className="ed-grain" /><div className="ed-glow" /><div className="ed-vignette" />
      <style>{`@media (max-width: 880px) { .chat-grid { grid-template-columns: 1fr !important; } .chat-rail { order: -1; } }`}</style>

      <div style={{ position: "relative", zIndex: 2, maxWidth: 1120, margin: "0 auto", padding: "8px 24px 40px" }}>
        {pets && pets.length === 0 ? (
          <div style={{ background: T.paper, borderRadius: 22, padding: "48px 28px", textAlign: "center", boxShadow: "var(--ed-shadow-card)", maxWidth: 460, margin: "40px auto" }}>
            <div style={{ fontFamily: T.disp, fontWeight: 800, fontSize: 24, color: T.ink }}>No companion yet</div>
            <p style={{ fontFamily: T.body, fontSize: 14.5, color: T.muted2, margin: "10px 0 18px", lineHeight: 1.5 }}>Adopt a pet first — then you can talk to it here, and it remembers everything.</p>
            <button onClick={() => onNavigate?.("my pet")} style={{ border: "none", cursor: "pointer", background: "linear-gradient(180deg,#F49B2A,#E27D0C)", color: "#FFF8EE", fontFamily: T.disp, fontWeight: 700, fontSize: 14, borderRadius: 12, padding: "12px 22px", boxShadow: "0 12px 22px -12px rgba(226,125,12,.7)" }}>Adopt your pet →</button>
          </div>
        ) : (
          <div className="chat-grid" style={{ display: "grid", gridTemplateColumns: "0.82fr 1.18fr", gap: 22, alignItems: "start" }}>

            {/* ── pet rail ── */}
            <div className="chat-rail" style={{ position: "relative", background: T.terra, borderRadius: 22, padding: "22px 22px 24px", overflow: "hidden", boxShadow: "var(--ed-shadow-float, 0 54px 84px -28px rgba(38,12,2,.72),0 14px 28px -12px rgba(38,12,2,.45))", minHeight: 520 }}>
              <div className="ed-grain" />
              <div style={{ position: "relative", zIndex: 2 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: T.m, fontSize: 12, fontWeight: 700, letterSpacing: ".14em", color: T.creamOn, textTransform: "uppercase" }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#8FE6B0", boxShadow: "0 0 0 3px rgba(143,230,176,.25)", animation: "pulse 2s ease-in-out infinite" }} />
                  Online · Remembers you
                </div>
                <div style={{ marginTop: 16, borderRadius: 14, overflow: "hidden", border: "3px solid rgba(252,233,207,.5)", boxShadow: "0 18px 36px -18px rgba(40,12,2,.6)", aspectRatio: "1 / 1", background: "#1A140D" }}>
                  <img src={photo} alt={active?.name || "pet"} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                </div>
                <div className="ed-foil-text" style={{ fontFamily: T.disp, fontWeight: 800, fontSize: 34, lineHeight: 0.95, letterSpacing: "-.02em", marginTop: 16 }}>{active?.name || "…"}</div>
                <div style={{ fontFamily: T.m, fontSize: 12, fontWeight: 700, letterSpacing: ".14em", color: "rgba(252,233,207,.75)", marginTop: 5, textTransform: "uppercase" }}>
                  LV.{String(active?.level ?? 1).padStart(2, "0")} · {species}{element ? ` · ${element}` : ""}
                </div>

                {/* bond */}
                <div style={{ marginTop: 18 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontFamily: T.m, fontSize: 12, fontWeight: 700, letterSpacing: ".12em", color: "rgba(252,233,207,.8)", textTransform: "uppercase" }}>
                    <span>Bond</span><span>{bond} → {bond + 1}</span>
                  </div>
                  <div style={{ marginTop: 6, height: 7, borderRadius: 999, background: "rgba(252,233,207,.25)", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${Math.min(100, (bond % 10) * 10 + 8)}%`, background: "#FCE9CF", transition: "width .5s" }} />
                  </div>
                </div>
                <p style={{ fontFamily: T.body, fontSize: 12.5, color: "rgba(252,233,207,.85)", marginTop: 12, lineHeight: 1.5 }}>
                  Every chat grows your Bond — and {active?.name || "your pet"} remembers it all.
                </p>

                {pets && pets.length > 1 && (
                  <div style={{ display: "flex", gap: 6, marginTop: 16, flexWrap: "wrap" }}>
                    {pets.map((p) => (
                      <button key={p.id} onClick={() => setActive(p)} style={{
                        fontFamily: T.body, fontWeight: 600, fontSize: 12, padding: "5px 11px", borderRadius: 999, cursor: "pointer",
                        border: p.id === active?.id ? "1.5px solid #FCE9CF" : "1px solid rgba(252,233,207,.3)",
                        background: p.id === active?.id ? "rgba(252,233,207,.2)" : "transparent", color: "#FCE9CF",
                      }}>{p.name}</button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* ── conversation ── */}
            <div style={{ background: T.paper, borderRadius: 22, boxShadow: "var(--ed-shadow-card)", border: `1px solid ${T.hair}`, display: "flex", flexDirection: "column", height: "min(72vh, 620px)", overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: `1px solid ${T.hair}` }}>
                <div style={{ fontFamily: T.disp, fontWeight: 800, fontSize: 17, color: T.ink }}>Chat with {active?.name || "your pet"}</div>
                <div style={{ fontFamily: T.m, fontSize: 12, fontWeight: 700, letterSpacing: ".14em", color: T.mono, textTransform: "uppercase" }}>Direct line · end-to-end yours</div>
              </div>

              <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "18px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
                {msgs.map((m, i) => (
                  m.role === "user" ? (
                    <div key={i} style={{ alignSelf: "flex-end", maxWidth: "78%", background: T.ink, color: "#FBF6EC", fontFamily: T.body, fontSize: 14, lineHeight: 1.5, padding: "11px 15px", borderRadius: "16px 16px 4px 16px", boxShadow: "0 8px 18px -12px rgba(33,26,18,.5)" }}>{m.text}</div>
                  ) : (
                    <div key={i} style={{ alignSelf: "flex-start", display: "flex", gap: 10, maxWidth: "82%" }}>
                      <img src={photo} alt="" style={{ width: 30, height: 30, borderRadius: 9, objectFit: "cover", flexShrink: 0, border: `1px solid ${T.hair}` }} />
                      <div>
                        <div style={{ fontFamily: T.m, fontSize: 12, fontWeight: 700, letterSpacing: ".1em", color: T.mono, marginBottom: 4, textTransform: "uppercase" }}>{active?.name}</div>
                        <div style={{ background: T.inset, color: T.ink70, fontFamily: T.body, fontSize: 14, lineHeight: 1.55, padding: "11px 15px", borderRadius: "4px 16px 16px 16px", border: `1px solid ${T.hair}` }}>{m.text}</div>
                      </div>
                    </div>
                  )
                ))}
                {busy && (
                  <div style={{ alignSelf: "flex-start", display: "flex", gap: 10, alignItems: "center" }}>
                    <img src={photo} alt="" style={{ width: 30, height: 30, borderRadius: 9, objectFit: "cover", border: `1px solid ${T.hair}` }} />
                    <div style={{ background: T.inset, padding: "12px 16px", borderRadius: "4px 16px 16px 16px", border: `1px solid ${T.hair}`, display: "flex", gap: 5 }}>
                      {[0, 1, 2].map((n) => <span key={n} style={{ width: 6, height: 6, borderRadius: "50%", background: T.terra, animation: `edTypingDot 1.2s ${n * 0.18}s ease-in-out infinite` }} />)}
                    </div>
                  </div>
                )}
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", borderTop: `1px solid ${T.hair}` }}>
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") send(); }}
                  placeholder={busy ? `${active?.name || "…"} is thinking…` : `Message ${active?.name || "your pet"}…`}
                  disabled={busy || !active}
                  style={{ flex: 1, background: T.inset, border: `1px solid ${T.hair}`, borderRadius: 12, padding: "12px 15px", fontFamily: T.body, fontSize: 14, color: T.ink, outline: "none" }}
                />
                <button onClick={send} disabled={busy || !input.trim()} aria-label="Send" style={{
                  flexShrink: 0, width: 44, height: 44, borderRadius: 12, border: "none", cursor: busy || !input.trim() ? "default" : "pointer",
                  background: "linear-gradient(180deg,#F49B2A,#E27D0C)", color: "#FFF8EE", fontSize: 19, fontWeight: 700,
                  opacity: busy || !input.trim() ? 0.5 : 1, boxShadow: "0 10px 20px -12px rgba(226,125,12,.7)",
                }}>→</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
