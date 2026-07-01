"use client";

/**
 * CardDeck — the TCG "Cards" surface, styled as a FIELD ALBUM collection grid.
 *
 * Primary tab • Collection — a rarity-filterable album grid of every pet you've
 *   collected as a foil-stamped trading card (the /card/[id] data → <PetCard>),
 *   with a real "N collected" counter + rarity breakdown, real empty adoption
 *   slots, and a "Catch more in the wild" tile that opens the Catch camera.
 *   Clicking a card opens a detail overlay with Share + ✨ Illustrate.
 * Secondary tab • Battle — duel your card vs another pet's card via
 *   /api/card/battle (read-only, deterministic; no credits, no stat changes).
 *
 * SCRUM-100 (data-loss) fix: Illustrate is NON-DESTRUCTIVE. The generated art
 * is shown as an explicit PREVIEW next to the original; the pet's avatar is only
 * overwritten after the user confirms "Set as card art". Until then the original
 * animal card is untouched. Every generation is also persisted as its own
 * `generations` row server-side, so the illustrated variant is separately
 * recoverable in Studio history even after a swap.
 *
 * HONEST DATA: there is no fixed universe of "catchable" cards — a card is
 * minted from a pet you already own — so the album shows the REAL owned count
 * (never a fabricated "/ TOTAL" denominator) and a rarity breakdown computed
 * from each pet's REAL grind stats. The only placeholder slots shown are the
 * user's REAL remaining pet slots (pet_slots − owned), labelled as empty
 * adoption slots — never fake card numbers presented as owned inventory.
 *
 * Reuses: api.pets.list, /api/card/[id] (via <PetCard>), /api/studio/generate
 * (grok-imagine) for art, /api/petclaw/network/discover for opponents, and the
 * existing battle resolver server-side.
 */

import { useEffect, useMemo, useState } from "react";
import { api, getAuthHeaders } from "@/lib/api";
import PetCard from "@/components/PetCard";
import Icon from "@/components/Icon";
import { computeRarity, RARITY_ORDER, rarityTier, type Rarity } from "@/lib/tcg/theme";

// ── Collectible Editorial tokens ──
const T = {
  field: "#ECE4D4", paper: "#FBF6EC", inset: "#F5EFE2", ink: "#211A12", ink70: "#3A3024",
  muted: "#7A6E5A", muted2: "#5C5140", mono: "#9A7B4E", hair: "rgba(33,26,18,.13)",
  terra: "#BE4F28", terraSub: "#9A4E1E", creamOn: "#FCE9CF",
  win: "#5C8A4E", lose: "#BE4F28",
  disp: "var(--ed-disp)", body: "var(--ed-body)", m: "var(--ed-m)",
} as const;
const INK = T.ink;
const MUTED = T.muted;
const LINE = T.hair;
const GOLD = T.terra;

// Locked rarity colors (Collectible Editorial). Uncommon rides with Common in
// the album filter (the card seal already distinguishes them) so the tab row
// matches the mockup's five stops.
const RARITY_DOT: Record<Rarity, string> = {
  Common: "#5C8A4E", Uncommon: "#5C8A4E", Rare: "#3E8FE0", Epic: "#9E72E8", Legendary: "#C8932F",
};
// The rarity tabs shown in the album (mockup: All / Common / Rare / Epic / Legendary).
const FILTER_TABS: Array<{ key: "All" | Rarity; label: string; dot?: string }> = [
  { key: "All", label: "All" },
  { key: "Common", label: "Common", dot: RARITY_DOT.Common },
  { key: "Rare", label: "Rare", dot: RARITY_DOT.Rare },
  { key: "Epic", label: "Epic", dot: RARITY_DOT.Epic },
  { key: "Legendary", label: "Legendary", dot: RARITY_DOT.Legendary },
];

type Pet = {
  id: number; name: string; species?: number; avatar_url?: string | null;
  // Real grind columns (returned by /api/pets) — drive the honest rarity label.
  rarity: Rarity;
};
type Opp = { petId: number; name: string; element: string; level: number };
type SortKey = "rarity" | "name";

const cardUrl = (id: number) => `/card/${id}`;
const APP = "https://app.myaipet.ai";

function shareCard(id: number, name: string) {
  const text = `${name}'s trading card 🃏 — raise & battle your own AI pet`;
  window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(`${APP}/card/${id}`)}&hashtags=MyAIPet`, "_blank", "width=600,height=420");
}

// Collapse Uncommon into the Common filter bucket (matches the 5-tab mockup).
function filterBucket(r: Rarity): "Common" | Rarity {
  return r === "Uncommon" ? "Common" : r;
}

export default function CardDeck() {
  const [tab, setTab] = useState<"collection" | "battle">("collection");
  const [pets, setPets] = useState<Pet[]>([]);
  const [petSlots, setPetSlots] = useState<number>(0);
  const [notAuthed, setNotAuthed] = useState(false);
  const [bust, setBust] = useState<Record<number, number>>({});
  const [illustrating, setIllustrating] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Album interaction state
  const [filter, setFilter] = useState<"All" | Rarity>("All");
  const [sort, setSort] = useState<SortKey>("rarity");
  const [openId, setOpenId] = useState<number | null>(null); // card detail overlay

  // SCRUM-100 — non-destructive Illustrate preview. Holds the just-generated art
  // for a pet until the user explicitly confirms replacing the original.
  const [preview, setPreview] = useState<{ petId: number; name: string; url: string } | null>(null);

  // battle state
  const [myPetId, setMyPetId] = useState<number | null>(null);
  const [opps, setOpps] = useState<Opp[]>([]);
  const [oppId, setOppId] = useState<number | null>(null);
  const [battling, setBattling] = useState(false);
  const [battle, setBattle] = useState<any>(null);

  useEffect(() => {
    api.pets.list().then((d: any) => {
      const list: Pet[] = (d?.pets || []).map((p: any) => ({
        id: p.id, name: p.name, species: p.species, avatar_url: p.avatar_url,
        // Rarity from REAL grind columns via the shared deterministic function —
        // identical to the server card lib, so the album label never lies.
        rarity: computeRarity({
          level: p.level ?? 0, bond_level: p.bond_level ?? 0, care_streak: p.care_streak ?? 0,
          atk: p.atk ?? 0, def: p.def ?? 0, spd: p.spd ?? 0, evolution_stage: p.evolution_stage ?? 0,
        }).rarity,
      }));
      setPets(list);
      // Real slot count from the same payload (never inflated).
      if (typeof d?.pet_slots === "number") setPetSlots(d.pet_slots);
      if (list[0]) setMyPetId(list[0].id);
    }).catch((e: any) => { if (e?.status === 401) setNotAuthed(true); });

    fetch("/api/petclaw/network/discover?limit=24", { headers: getAuthHeaders() })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.nodes) setOpps(d.nodes); })
      .catch(() => {});
  }, []);

  // ── SCRUM-100: Illustrate now GENERATES ONLY. It never patches the pet.
  // The result is staged in `preview`; the original card stays intact until the
  // user confirms. `confirmIllustrate` performs the (now explicit) swap. ──
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
        // NON-DESTRUCTIVE: stage the generated art for confirmation instead of
        // overwriting avatar_url. The art is already persisted server-side as its
        // own `generations` row, so it's separately recoverable in Studio history.
        setPreview({ petId, name, url: data.url });
      }
    } catch (e: any) {
      setErr(e?.message || "Couldn't illustrate.");
    } finally {
      setIllustrating(null);
    }
  };

  // Explicit user confirmation — only here does the original card art change.
  const confirmIllustrate = async () => {
    if (!preview) return;
    const { petId, url } = preview;
    setIllustrating(petId);
    try {
      await fetch(`/api/pets/${petId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ avatar_url: url }),
      });
      setBust((b) => ({ ...b, [petId]: Date.now() }));
      setPreview(null);
    } catch (e: any) {
      setErr(e?.message || "Couldn't set the new art.");
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

  // ── Derived album data (all honest / real) ──
  const rarityCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const p of pets) { const b = filterBucket(p.rarity); c[b] = (c[b] || 0) + 1; }
    return c;
  }, [pets]);

  const visible = useMemo(() => {
    const arr = filter === "All" ? pets.slice() : pets.filter((p) => filterBucket(p.rarity) === filter);
    arr.sort((a, b) => sort === "name"
      ? a.name.localeCompare(b.name)
      : (rarityTier(b.rarity) - rarityTier(a.rarity)) || a.name.localeCompare(b.name));
    return arr;
  }, [pets, filter, sort]);

  // Real remaining adoption slots (never a fabricated card universe). Only shown
  // on the unfiltered "All" view so filtered counts stay exact.
  const emptySlots = Math.max(0, petSlots - pets.length);

  const openPet = openId != null ? pets.find((p) => p.id === openId) || null : null;

  if (notAuthed) return <Shell owned={0}><Empty>Connect your wallet to see your cards.</Empty></Shell>;
  if (pets.length === 0) return <Shell owned={0}><Empty>Adopt a pet first — then collect its card. <a href="/?section=my%20pet" style={{ color: GOLD, fontWeight: 700, textDecoration: "none" }}>Adopt ▸</a></Empty></Shell>;

  const oppList = opps.filter((o) => !pets.some((p) => p.id === o.petId));

  return (
    <Shell owned={pets.length} rarityCounts={rarityCounts}>
      {/* Tabs — mono-labelled editorial pills, active = ink */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {(["collection", "battle"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: "9px 18px", borderRadius: 999, cursor: "pointer",
            fontFamily: T.m, fontWeight: 700, fontSize: 11.5, letterSpacing: "0.12em", textTransform: "uppercase",
            border: `1px solid ${tab === t ? T.ink : T.hair}`, background: tab === t ? T.ink : T.paper,
            color: tab === t ? T.creamOn : T.muted, boxShadow: tab === t ? "var(--ed-shadow-card)" : "none",
            transition: "all .15s ease",
          }}>{t === "collection" ? "Collection" : (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Icon name="sword" size={15} /> Battle</span>
          )}</button>
        ))}
      </div>

      {err && <div style={{ background: T.creamOn, color: T.terraSub, border: `1px solid ${T.hair}`, borderRadius: 12, padding: "10px 14px", fontFamily: T.body, fontSize: 13.5, marginBottom: 16, boxShadow: "var(--ed-shadow-card)" }}>{err}</div>}

      {tab === "collection" && (
        <div>
          {/* Rarity filter tabs (colored dot each) + sort control */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {FILTER_TABS.map((f) => {
                const active = filter === f.key;
                const n = f.key === "All" ? pets.length : (rarityCounts[f.key] || 0);
                return (
                  <button key={f.key} onClick={() => setFilter(f.key)} style={{
                    display: "inline-flex", alignItems: "center", gap: 7,
                    padding: "8px 14px", borderRadius: 999, cursor: "pointer",
                    fontFamily: T.m, fontWeight: 700, fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase",
                    border: `1px solid ${active ? T.ink : T.hair}`, background: active ? T.ink : T.paper,
                    color: active ? T.creamOn : T.muted, transition: "all .15s ease",
                  }}>
                    {f.dot && <span style={{ width: 8, height: 8, borderRadius: "50%", background: f.dot, display: "inline-block" }} />}
                    {f.key === "Legendary" && <span style={{ color: active ? "#F6D488" : RARITY_DOT.Legendary, marginRight: -3 }}>★</span>}
                    {f.label}
                    <span style={{ opacity: 0.65, fontVariantNumeric: "tabular-nums" }}>{n}</span>
                  </button>
                );
              })}
            </div>
            <button onClick={() => setSort((s) => (s === "rarity" ? "name" : "rarity"))} style={{
              fontFamily: T.m, fontSize: 10.5, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase",
              color: T.mono, background: "none", border: "none", cursor: "pointer", padding: "6px 2px",
            }}>
              Sort: {sort === "rarity" ? "Rarity ↓" : "A → Z"}
            </button>
          </div>

          {/* Album grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(196px, 1fr))", gap: 18 }}>
            {visible.map((p) => (
              <button
                key={`${p.id}-${bust[p.id] || 0}`}
                onClick={() => setOpenId(p.id)}
                style={{ all: "unset", cursor: "pointer", display: "block", width: "100%", borderRadius: 18 }}
                aria-label={`Open ${p.name}'s card`}
              >
                <PetCard key={`pc-${p.id}-${bust[p.id] || 0}`} petId={p.id} maxWidth={260} />
              </button>
            ))}

            {/* Real remaining adoption slots — only on the unfiltered view, never
                fake card numbers. Labelled honestly as an empty slot to adopt. */}
            {filter === "All" && Array.from({ length: emptySlots }).map((_, i) => (
              <a key={`slot-${i}`} href="/?section=my%20pet" style={{ textDecoration: "none" }}>
                <SlotTile />
              </a>
            ))}

            {/* Catch-more tile — opens the real Catch camera flow */}
            {filter === "All" && <CatchTile />}
          </div>
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
            <div style={{ fontFamily: T.m, fontSize: 14, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: T.mono, paddingBottom: 10 }}>vs</div>
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
          {oppList.length === 0 && <div style={{ fontFamily: T.body, fontSize: 13.5, color: T.muted, marginBottom: 16 }}>No other pets to battle yet — invite a friend to adopt one.</div>}

          {battle && (
            <div style={{ borderRadius: 22, border: `1px solid ${T.hair}`, padding: 22, background: T.paper, boxShadow: "var(--ed-shadow-card)" }}>
              <div style={{ textAlign: "center", marginBottom: 18 }}>
                <div style={{ fontFamily: T.m, fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: T.mono, marginBottom: 7 }}>Duel result</div>
                <div style={{ fontFamily: T.disp, fontSize: 26, fontWeight: 800, color: battle.winner === "you" ? T.win : T.terra }}>
                  {battle.winner === "you" ? (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><Icon name="trophy" size={24} /> {battle.you.name} wins!</span>
                  ) : `${battle.opponent.name} wins`}
                </div>
                <div style={{ fontFamily: T.m, fontSize: 11, color: T.muted, fontWeight: 700, letterSpacing: "0.06em", marginTop: 7 }}>{battle.result.turns} turns · your HP {battle.result.yourHp}/{battle.result.yourHpMax} · their HP {battle.result.oppHp}/{battle.result.oppHpMax}</div>
              </div>
              <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
                {[battle.you, battle.opponent].map((c: any, i: number) => {
                  const isWinner = (i === 0 && battle.winner === "you") || (i === 1 && battle.winner === "opponent");
                  return (
                    <div key={i} style={{ width: 220, opacity: isWinner ? 1 : 0.72, transform: isWinner ? "scale(1.03)" : "none", transition: "all .2s" }}>
                      <PetCard petId={c.id} maxWidth={220} />
                      <div style={{ textAlign: "center", marginTop: 9, fontFamily: T.m, fontSize: 10.5, fontWeight: 700, letterSpacing: "0.14em", color: isWinner ? T.win : T.muted }}>{isWinner ? "WINNER" : ""}</div>
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

      {/* ── Card detail overlay — Share + ✨ Illustrate reachable per card ── */}
      {openPet && (
        <Overlay onClose={() => setOpenId(null)}>
          <div style={{ maxWidth: 320, margin: "0 auto" }}>
            <a href={cardUrl(openPet.id)} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>
              <PetCard key={`detail-${openPet.id}-${bust[openPet.id] || 0}`} petId={openPet.id} maxWidth={320} />
            </a>
            <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 14, flexWrap: "wrap" }}>
              <button onClick={() => shareCard(openPet.id, openPet.name)} style={btn}>𝕏 Share</button>
              <button
                onClick={() => illustrate(openPet.id, openPet.name)}
                disabled={illustrating === openPet.id}
                style={{ ...ghost, opacity: illustrating === openPet.id ? 0.6 : 1, display: "inline-flex", alignItems: "center", gap: 6 }}
              >
                {illustrating === openPet.id ? "Illustrating…" : <><Icon name="sparkling" size={14} /> Illustrate</>}
              </button>
              <a href={cardUrl(openPet.id)} target="_blank" rel="noopener noreferrer" style={{ ...ghost, textDecoration: "none", display: "inline-flex", alignItems: "center" }}>View card page ▸</a>
            </div>
            <p style={{ fontFamily: T.body, fontSize: 12.5, color: T.muted, textAlign: "center", margin: "12px auto 0", maxWidth: 260, lineHeight: 1.5 }}>
              Illustrate paints a new stylized portrait — you preview & confirm before it replaces the card. Your original photo is kept until then.
            </p>
          </div>
        </Overlay>
      )}

      {/* ── SCRUM-100: non-destructive Illustrate PREVIEW + confirm ── */}
      {preview && (
        <Overlay onClose={() => !illustrating && setPreview(null)}>
          <div style={{ maxWidth: 520, margin: "0 auto", textAlign: "center" }}>
            <div style={{ fontFamily: T.m, fontSize: 10.5, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: T.terra, marginBottom: 6 }}>Preview · not saved yet</div>
            <h3 style={{ fontFamily: T.disp, fontSize: 24, fontWeight: 800, color: T.ink, margin: "0 0 4px", letterSpacing: "-0.02em" }}>Use this as {preview.name}&apos;s card art?</h3>
            <p style={{ fontFamily: T.body, fontSize: 13.5, color: T.muted2, margin: "0 auto 18px", maxWidth: 400, lineHeight: 1.5 }}>
              Your original photo is untouched. Confirm to set the new art on the card, or keep the original. The generated art is also saved in Studio history either way.
            </p>
            <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap", marginBottom: 20 }}>
              <PreviewCol label="Original" ><PetCard key={`orig-${preview.petId}`} petId={preview.petId} maxWidth={220} /></PreviewCol>
              <PreviewCol label="Illustrated" accent>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <div style={{ width: 220, aspectRatio: "1 / 1", borderRadius: 14, overflow: "hidden", border: `2px solid ${T.terra}`, background: "#fff", boxShadow: "var(--ed-shadow-card)" }}>
                  <img src={preview.url} alt={`${preview.name} illustrated`} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                </div>
              </PreviewCol>
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
              <button onClick={confirmIllustrate} disabled={illustrating != null} style={{ ...btn, padding: "11px 22px", opacity: illustrating != null ? 0.6 : 1 }}>
                {illustrating != null ? "Saving…" : "Set as card art"}
              </button>
              <button onClick={() => setPreview(null)} disabled={illustrating != null} style={{ ...ghost, padding: "11px 22px" }}>Keep original</button>
            </div>
          </div>
        </Overlay>
      )}
    </Shell>
  );
}

// Primary action — ink fill, mono label, soft floating shadow (never a hard offset)
const btn: React.CSSProperties = { padding: "9px 15px", borderRadius: 999, border: `1px solid ${T.ink}`, background: T.ink, color: T.creamOn, fontFamily: T.m, fontWeight: 700, fontSize: 11.5, letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer", boxShadow: "var(--ed-shadow-card)" };
const ghost: React.CSSProperties = { padding: "9px 15px", borderRadius: 999, border: `1px solid ${T.hair}`, background: T.paper, color: T.ink70, fontFamily: T.m, fontWeight: 700, fontSize: 11.5, letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer" };
const select: React.CSSProperties = { padding: "9px 13px", borderRadius: 12, border: `1px solid ${T.hair}`, fontFamily: T.body, fontSize: 14, color: T.ink, background: T.paper, minWidth: 180 };

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontFamily: T.m, fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", color: T.mono, textTransform: "uppercase" }}>{label}</span>
      {children}
    </div>
  );
}

function PreviewCol({ label, accent, children }: { label: string; accent?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
      {children}
      <span style={{ fontFamily: T.m, fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: accent ? T.terra : T.muted }}>{label}</span>
    </div>
  );
}

// Empty adoption slot — a REAL remaining pet slot (paw silhouette), never a
// fabricated "card number". Clicking it goes to the adopt flow.
function SlotTile() {
  return (
    <div style={{
      width: "100%", aspectRatio: "5 / 7", borderRadius: 18, background: T.inset,
      border: `1px dashed ${T.hair}`, display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", gap: 10, textAlign: "center", padding: 14,
    }}>
      <Icon name="paw" size={30} style={{ opacity: 0.32 }} />
      <div style={{ fontFamily: T.m, fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: T.muted }}>Empty slot</div>
      <div style={{ fontFamily: T.m, fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: T.mono }}>Adopt ▸</div>
    </div>
  );
}

// "Catch more in the wild" — dark tile that opens the real Catch camera flow.
function CatchTile() {
  return (
    <a href="/?section=catch" style={{
      textDecoration: "none", width: "100%", aspectRatio: "5 / 7", borderRadius: 18,
      background: "radial-gradient(120% 90% at 50% 120%, #4A2A12 0%, #241206 55%, #17100A 100%)",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      gap: 12, textAlign: "center", padding: 16, boxShadow: "var(--ed-shadow-card)",
    }}>
      <Icon name="paw" size={26} style={{ opacity: 0.9 }} />
      <div style={{ fontFamily: T.disp, fontSize: 17, fontWeight: 800, color: "#FBF6EC", lineHeight: 1.15 }}>Catch more<br />in the wild</div>
      <span style={{
        marginTop: 4, padding: "8px 16px", borderRadius: 999,
        background: "linear-gradient(180deg,#F49B2A,#E27D0C)", color: "#2A1400",
        fontFamily: T.m, fontWeight: 700, fontSize: 10.5, letterSpacing: "0.12em", textTransform: "uppercase",
      }}>Open camera</span>
    </a>
  );
}

function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(24,16,8,.44)", backdropFilter: "blur(3px)", padding: 20, overflowY: "auto",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ position: "relative", background: T.field, borderRadius: 24, border: `1px solid ${T.hair}`, padding: "34px 26px 28px", maxWidth: 600, width: "100%", boxShadow: "var(--ed-shadow-card)" }}
      >
        <button onClick={onClose} aria-label="Close" style={{
          position: "absolute", top: 14, right: 14, width: 30, height: 30, borderRadius: "50%",
          border: `1px solid ${T.hair}`, background: T.paper, color: T.ink, cursor: "pointer",
          fontFamily: T.body, fontSize: 16, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center",
        }}>×</button>
        {children}
      </div>
    </div>
  );
}

function Shell({ children, owned, rarityCounts }: { children: React.ReactNode; owned: number; rarityCounts?: Record<string, number> }) {
  return (
    <div style={{ position: "relative", fontFamily: T.body, color: T.ink }}>
      <div className="ed-grain" /><div className="ed-glow" /><div className="ed-vignette" />
      <div style={{ position: "relative", zIndex: 2, maxWidth: 1060, margin: "0 auto", padding: "8px 0 48px" }}>
        <div style={{ marginBottom: 22 }}>
          <div style={{ fontFamily: T.m, fontSize: 10.5, fontWeight: 700, letterSpacing: "0.14em", color: T.terra, textTransform: "uppercase" }}>Field Album · Gotta Catch The Real Ones</div>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 16, marginTop: 8 }}>
            <h1 style={{ fontFamily: T.disp, fontSize: 46, fontWeight: 800, color: T.ink, margin: 0, letterSpacing: "-0.02em", lineHeight: 1.02 }}>Your collection</h1>
            {/* HONEST progress — the REAL owned count. No fabricated denominator,
                because a card is minted from a pet you own (no fixed universe). */}
            <div style={{ minWidth: 220, textAlign: "right" }}>
              <div style={{ fontFamily: T.disp, fontSize: 20, fontWeight: 800, color: T.ink }}>
                {owned} <span style={{ fontFamily: T.m, fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", color: T.muted, textTransform: "uppercase" }}>{owned === 1 ? "card collected" : "cards collected"}</span>
              </div>
              {owned > 0 && rarityCounts && (
                <div style={{ display: "inline-flex", gap: 12, marginTop: 8, justifyContent: "flex-end" }}>
                  {RARITY_ORDER.filter((r) => r !== "Uncommon").map((r) => {
                    const n = r === "Common" ? (rarityCounts.Common || 0) : (rarityCounts[r] || 0);
                    return (
                      <span key={r} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontFamily: T.m, fontSize: 10.5, fontWeight: 700, color: T.muted2, fontVariantNumeric: "tabular-nums" }}>
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: RARITY_DOT[r], display: "inline-block" }} />{n}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
          {/* hairline rule under the title */}
          <div style={{ height: 1, background: T.hair, margin: "16px 0 0" }} />
          <p style={{ fontFamily: T.body, fontSize: 14.5, color: T.muted2, margin: "14px 0 0", lineHeight: 1.55, maxWidth: 560 }}>
            Every pet is a foil-stamped collectible — real stats, real rarity. Share it, illustrate it, or duel another pet&apos;s card.
          </p>
        </div>
        {children}
      </div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: "28px 0", fontFamily: T.body, fontSize: 14.5, color: T.muted2 }}>{children}</div>;
}
