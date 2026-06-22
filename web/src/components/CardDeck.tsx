"use client";

/**
 * CardDeck — the TCG "Cards" surface. Two tabs:
 *   • My Deck — all your pets as trading cards (the /card/[id] OG image), with
 *     share + ✨ Illustrate (Studio-generate stylized card art → set as avatar).
 *   • Battle — duel your card vs another pet's card via /api/card/battle
 *     (read-only, deterministic; no credits, no stat changes).
 *
 * Reuses: api.pets.list, /card/[id]/opengraph-image (the card PNG),
 * /api/studio/generate (grok-imagine) for art, /api/petclaw/network/discover
 * for opponents, and the existing battle resolver server-side.
 */

import { useEffect, useState } from "react";
import { api, getAuthHeaders } from "@/lib/api";
import PetCard from "@/components/PetCard";
import Icon from "@/components/Icon";

const INK = "#1a1a22";
const MUTED = "#6b6b73";
const LINE = "rgba(16,16,28,0.10)";
const GOLD = "#b45309";

type Pet = { id: number; name: string; avatar_url?: string | null };
type Opp = { petId: number; name: string; element: string; level: number };

const cardUrl = (id: number) => `/card/${id}`;
const APP = "https://app.myaipet.ai";

function shareCard(id: number, name: string) {
  const text = `${name}'s trading card 🃏 — raise & battle your own AI pet`;
  window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(`${APP}/card/${id}`)}&hashtags=MyAIPet`, "_blank", "width=600,height=420");
}

export default function CardDeck() {
  const [tab, setTab] = useState<"deck" | "battle">("deck");
  const [pets, setPets] = useState<Pet[]>([]);
  const [notAuthed, setNotAuthed] = useState(false);
  const [bust, setBust] = useState<Record<number, number>>({});
  const [illustrating, setIllustrating] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // battle state
  const [myPetId, setMyPetId] = useState<number | null>(null);
  const [opps, setOpps] = useState<Opp[]>([]);
  const [oppId, setOppId] = useState<number | null>(null);
  const [battling, setBattling] = useState(false);
  const [battle, setBattle] = useState<any>(null);

  useEffect(() => {
    api.pets.list().then((d: any) => {
      const list: Pet[] = (d?.pets || []).map((p: any) => ({ id: p.id, name: p.name, avatar_url: p.avatar_url }));
      setPets(list);
      if (list[0]) setMyPetId(list[0].id);
    }).catch((e: any) => { if (e?.status === 401) setNotAuthed(true); });

    fetch("/api/petclaw/network/discover?limit=24", { headers: getAuthHeaders() })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.nodes) setOpps(d.nodes); })
      .catch(() => {});
  }, []);

  const illustrate = async (petId: number, name: string) => {
    setIllustrating(petId); setErr(null);
    try {
      const prompt = `${name}, epic collectible trading-card character portrait, dramatic rim lighting, vibrant colors, clean simple background, highly detailed, card game art`;
      const res = await fetch("/api/studio/generate", {
        method: "POST", headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ modelId: "grok-imagine", petId, prompt, aspect: "1:1" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(res.status === 402 ? "Not enough credits (5 per illustration)." : data?.error || "Couldn't illustrate. Try again.");
        return;
      }
      if (data.url) {
        // Set the new art as the pet's avatar so it flows into the card.
        await fetch(`/api/pets/${petId}`, {
          method: "PATCH", headers: { "Content-Type": "application/json", ...getAuthHeaders() },
          body: JSON.stringify({ avatar_url: data.url }),
        }).catch(() => {});
        setBust((b) => ({ ...b, [petId]: Date.now() }));
      }
    } catch (e: any) {
      setErr(e?.message || "Couldn't illustrate.");
    } finally {
      setIllustrating(null);
    }
  };

  const runBattle = async () => {
    if (!myPetId || !oppId || battling) return;
    setBattling(true); setBattle(null); setErr(null);
    try {
      const res = await fetch("/api/card/battle", {
        method: "POST", headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ petId: myPetId, opponentId: oppId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(data?.error || "Battle failed"); return; }
      setBattle(data);
    } catch (e: any) {
      setErr(e?.message || "Battle failed");
    } finally {
      setBattling(false);
    }
  };

  if (notAuthed) return <Shell><Empty>Connect your wallet to see your cards.</Empty></Shell>;
  if (pets.length === 0) return <Shell><Empty>Adopt a pet first — then collect its card. <a href="/?section=my%20pet" style={{ color: GOLD, fontWeight: 700, textDecoration: "none" }}>Adopt ▸</a></Empty></Shell>;

  const oppList = opps.filter((o) => !pets.some((p) => p.id === o.petId));

  return (
    <Shell>
      {/* Tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 22 }}>
        {(["deck", "battle"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: "8px 18px", borderRadius: 999, cursor: "pointer", fontSize: 14, fontWeight: 700,
            border: `1.5px solid ${tab === t ? INK : LINE}`, background: tab === t ? INK : "#fff", color: tab === t ? "#fff" : MUTED,
          }}>{t === "deck" ? "My Deck" : (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Icon name="sword" size={16} /> Battle</span>
          )}</button>
        ))}
      </div>

      {err && <div style={{ background: "#fde8e8", color: "#9b1c1c", borderRadius: 10, padding: "10px 14px", fontSize: 13.5, marginBottom: 16 }}>{err}</div>}

      {tab === "deck" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(232px, 1fr))", gap: 22, justifyItems: "center" }}>
          {pets.map((p) => (
            <div key={p.id} style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%", maxWidth: 280 }}>
              <a href={cardUrl(p.id)} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>
                <PetCard key={`${p.id}-${bust[p.id] || 0}`} petId={p.id} />
              </a>
              <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
                <button onClick={() => shareCard(p.id, p.name)} style={btn}>𝕏 Share</button>
                <button onClick={() => illustrate(p.id, p.name)} disabled={illustrating === p.id} style={{ ...ghost, opacity: illustrating === p.id ? 0.6 : 1, display: "inline-flex", alignItems: "center", gap: 6 }}>
                  {illustrating === p.id ? "Illustrating…" : <><Icon name="sparkling" size={15} /> Illustrate</>}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "battle" && (
        <div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "flex-end", marginBottom: 18 }}>
            <Field label="Your pet">
              <select value={myPetId ?? ""} onChange={(e) => setMyPetId(Number(e.target.value))} style={select}>
                {pets.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
            <div style={{ fontSize: 20, fontWeight: 800, color: MUTED, paddingBottom: 8 }}>vs</div>
            <Field label="Opponent">
              <select value={oppId ?? ""} onChange={(e) => setOppId(Number(e.target.value))} style={select}>
                <option value="">Pick an opponent…</option>
                {oppList.map((o) => <option key={o.petId} value={o.petId}>{o.name} · Lv{o.level} · {o.element}</option>)}
              </select>
            </Field>
            <button onClick={runBattle} disabled={!myPetId || !oppId || battling} style={{ ...btn, padding: "11px 22px", opacity: !myPetId || !oppId || battling ? 0.5 : 1 }}>
              {battling ? "Battling…" : "Battle!"}
            </button>
          </div>
          {oppList.length === 0 && <div style={{ fontSize: 13, color: MUTED, marginBottom: 16 }}>No other pets to battle yet — invite a friend to adopt one.</div>}

          {battle && (
            <div style={{ borderRadius: 16, border: `1px solid ${LINE}`, padding: 20, background: "#fff" }}>
              <div style={{ textAlign: "center", fontSize: 22, fontWeight: 800, color: battle.winner === "you" ? "#16a34a" : "#dc2626", marginBottom: 16 }}>
                {battle.winner === "you" ? (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><Icon name="trophy" size={24} /> {battle.you.name} wins!</span>
                ) : `${battle.opponent.name} wins`}
                <div style={{ fontSize: 12, color: MUTED, fontWeight: 500, marginTop: 4 }}>{battle.result.turns} turns · your HP {battle.result.yourHp}/{battle.result.yourHpMax} · their HP {battle.result.oppHp}/{battle.result.oppHpMax}</div>
              </div>
              <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
                {[battle.you, battle.opponent].map((c: any, i: number) => {
                  const isWinner = (i === 0 && battle.winner === "you") || (i === 1 && battle.winner === "opponent");
                  return (
                    <div key={i} style={{ width: 220, opacity: isWinner ? 1 : 0.72, transform: isWinner ? "scale(1.03)" : "none", transition: "all .2s" }}>
                      <PetCard petId={c.id} maxWidth={220} />
                      <div style={{ textAlign: "center", marginTop: 8, fontSize: 13, fontWeight: 800, color: isWinner ? "#16a34a" : MUTED }}>{isWinner ? "WINNER" : ""}</div>
                    </div>
                  );
                })}
              </div>
              <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap", marginTop: 14 }}>
                <button onClick={() => {
                  const url = `${APP}/card/battle/${battle.matchup}`;
                  const wName = battle.winner === "you" ? battle.you.name : battle.opponent.name;
                  const text = `${wName} won the duel! ${battle.you.name} ⚔️ ${battle.opponent.name} 🃏`;
                  window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}&hashtags=MyAIPet`, "_blank", "width=600,height=420");
                }} style={btn}>𝕏 Share result</button>
                <a href={`/card/battle/${battle.matchup}`} target="_blank" rel="noopener noreferrer" style={{ ...ghost, textDecoration: "none", display: "inline-flex", alignItems: "center" }}>View result page ▸</a>
              </div>
            </div>
          )}
        </div>
      )}
    </Shell>
  );
}

const btn: React.CSSProperties = { padding: "9px 14px", borderRadius: 9, border: "none", background: INK, color: "#fff", fontWeight: 700, fontSize: 13.5, cursor: "pointer" };
const ghost: React.CSSProperties = { padding: "9px 14px", borderRadius: 9, border: `1px solid ${LINE}`, background: "#fff", color: INK, fontWeight: 600, fontSize: 13.5, cursor: "pointer" };
const select: React.CSSProperties = { padding: "9px 12px", borderRadius: 9, border: `1px solid ${LINE}`, fontSize: 14, color: INK, background: "#fff", minWidth: 180 };

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <span style={{ fontSize: 11, fontFamily: "monospace", letterSpacing: "0.1em", color: MUTED, textTransform: "uppercase" }}>{label}</span>
      {children}
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ maxWidth: 860, margin: "0 auto", padding: "8px 0 40px", fontFamily: "'Space Grotesk', system-ui, sans-serif" }}>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontFamily: "monospace", fontSize: 11, letterSpacing: "0.18em", color: GOLD, textTransform: "uppercase" }}>Trading cards</div>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: INK, margin: "6px 0 0" }}>Your deck</h1>
        <p style={{ fontSize: 14.5, color: MUTED, margin: "8px 0 0", lineHeight: 1.55 }}>
          Every pet is a collectible card — real stats, real rarity. Share it, illustrate it, or duel another pet&apos;s card.
        </p>
      </div>
      {children}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: "28px 0", fontSize: 14, color: MUTED }}>{children}</div>;
}
