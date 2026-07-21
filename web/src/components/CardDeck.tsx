"use client";

/**
 * CardDeck — the TCG "Cards" surface, styled as a FIELD ALBUM collection grid.
 *
 * Primary tab • Collection — a rarity-filterable album grid of every pet you've
 *   collected as a foil-stamped trading card (the /card/[id] data → <PetCard>),
 *   with a real "N collected" counter + rarity breakdown, real empty adoption
 *   slots, and a "Catch more in the wild" tile that opens the Catch tab.
 *   Clicking a card opens a detail overlay with Share + ✨ Illustrate.
 * Tab • Catch — the full CatCatch camera flow (photograph real street animals),
 *   merged in from the old standalone /?section=catch screen; that URL now
 *   aliases here via App's routing + the `initialTab` prop.
 * Tab • Battle — duel your card vs another pet's card via
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
 * adoption slots — never fake card numbers presented as owned inventory. The
 * guest gate's two showcase cards are permanently stamped SAMPLE, and every
 * "+N pts" figure printed anywhere on this screen is the server's actual
 * grant (verified against /api/card/battle and /api/catch — never promise a
 * reward the server doesn't pay).
 *
 * Reuses: api.pets.list, /api/card/[id] (via <PetCard>), /api/studio/generate
 * (grok-imagine) for art, /api/petclaw/network/discover for opponents, and the
 * existing battle resolver server-side.
 */

import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { api, getAuthHeaders } from "@/lib/api";
import PetCard, { TOPO_MASK, rarityTopo } from "@/components/PetCard";
import { CODEX_VARIANTS, codexPrompt } from "@/lib/codex";
import Icon from "@/components/Icon";
import Reveal from "@/components/Reveal";
import useCountUp from "@/hooks/useCountUp";
import { computeRarity, rarityColor, RARITY_ORDER, RARITY_THRESHOLD, rarityTier, type Rarity } from "@/lib/tcg/theme";

// Catch (photograph real street animals) now lives INSIDE Cards as its own tab —
// the camera/leaflet bundle only loads when the Catch tab is actually opened.
const CatCatch = lazy(() => import("@/components/CatCatch"));

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
/* Shared foil materials — HOLO_LINEAR is the iridescent gradient the card face
 * masks through TOPO_MASK (also used by RipStub + the Rare guest sample);
 * FOIL_GOLD mirrors PetCard's Rare border ring exactly so the guest sample
 * speaks the deck's REAL rarity language, not an approximation. */
const HOLO_LINEAR = "linear-gradient(118deg,#ff5e8a,#ffd36e,#54ffc8,#5e8aff,#ff5eef,#ff5e8a)";
const FOIL_GOLD = "linear-gradient(100deg,#FFF7E6,#F2CD86 32%,#FFFBF0 50%,#E8B257 68%,#FFF7E6)";

// Rarity colors come from the single locked source in lib/tcg/theme (Uncommon
// rides with Common in the album filter — the card seal already distinguishes
// them — so the tab row matches the mockup's five stops).
const FILTER_TABS: Array<{ key: "All" | Rarity; label: string; dot?: string }> = [
  { key: "All", label: "All" },
  { key: "Common", label: "Common", dot: rarityColor("Common") },
  { key: "Rare", label: "Rare", dot: rarityColor("Rare") },
  { key: "Epic", label: "Epic", dot: rarityColor("Epic") },
  { key: "Legendary", label: "Legendary", dot: rarityColor("Legendary") },
];

type Pet = {
  id: number; name: string; species?: number; avatar_url?: string | null;
  // Real grind columns (returned by /api/pets) — drive the honest rarity label
  // and the real "{score}/{threshold} to {rarity}" progress line.
  rarity: Rarity; score: number;
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

type DeckTab = "collection" | "catch" | "battle";

export default function CardDeck({ onNavigate, initialTab }: { onNavigate?: (section: string) => void; initialTab?: DeckTab }) {
  const [tab, setTab] = useState<DeckTab>(initialTab ?? "collection");
  // Old /?section=catch deep links alias to this screen. App currently
  // remounts CardDeck per section (key={section} wrapper), so the seed lands
  // via useState above; this effect is belt-and-braces for if that keying is
  // ever removed.
  useEffect(() => { if (initialTab) setTab(initialTab); }, [initialTab]);
  // Keep the URL share/refresh-honest on tab flips without a section remount:
  // cards↔catch are one screen, only the query param swaps.
  const switchTab = (t: DeckTab) => {
    setTab(t);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("section", t === "catch" ? "catch" : "cards");
      window.history.replaceState(null, "", url.toString());
    }
  };
  const [pets, setPets] = useState<Pet[]>([]);
  const [petSlots, setPetSlots] = useState<number>(0);
  const [notAuthed, setNotAuthed] = useState(false);
  const [loaded, setLoaded] = useState(false);      // pets fetch settled (ok or not)
  const [loadErr, setLoadErr] = useState(false);    // non-401 failure — retryable, never the adopt state
  const [bust, setBust] = useState<Record<number, number>>({});
  const [illustrating, setIllustrating] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // SPA navigation for Adopt/Catch tiles: App passes onNavigate={setSection};
  // without it (e.g. rendered outside the SPA shell) the href still works.
  const navTo = (section: string) =>
    onNavigate ? (e: React.MouseEvent) => { e.preventDefault(); onNavigate(section); } : undefined;

  // Album interaction state
  const [filter, setFilter] = useState<"All" | Rarity>("All");
  const [sort, setSort] = useState<SortKey>("rarity");
  const [openId, setOpenId] = useState<number | null>(null); // card detail overlay
  const [cardVariant, setCardVariant] = useState(CODEX_VARIANTS[0].key); // collectible sticker look for Illustrate

  // SCRUM-100 — non-destructive Illustrate preview. Holds the just-generated art
  // for a pet until the user explicitly confirms replacing the original.
  const [preview, setPreview] = useState<{ petId: number; name: string; url: string } | null>(null);

  // battle state
  const [myPetId, setMyPetId] = useState<number | null>(null);
  const [opps, setOpps] = useState<Opp[]>([]);
  const [oppsLoaded, setOppsLoaded] = useState(false); // discover fetch settled ok
  const [oppsErr, setOppsErr] = useState(false);       // non-ok/network — retryable, never "no opponents"
  const [oppId, setOppId] = useState<number | null>(null);
  const [battling, setBattling] = useState(false);
  const [battle, setBattle] = useState<any>(null);
  const [reveal, setReveal] = useState(false); // battle result choreography step

  const loadPets = () => {
    setLoadErr(false);
    // Guests / tour visitors carry no JWT — the authed /api/pets call would 401
    // and log a console error. Skip it and land straight on the connect state.
    const hasToken = typeof window !== "undefined" && !!localStorage.getItem("petagen_jwt");
    if (!hasToken) { setNotAuthed(true); setLoaded(true); return; }
    api.pets.list().then((d: any) => {
      const list: Pet[] = (d?.pets || []).map((p: any) => {
        // Rarity + score from REAL grind columns via the shared deterministic
        // function — identical to the server card lib, so the album never lies.
        const { rarity, score } = computeRarity({
          level: p.level ?? 0, bond_level: p.bond_level ?? 0, care_streak: p.care_streak ?? 0,
          atk: p.atk ?? 0, def: p.def ?? 0, spd: p.spd ?? 0, evolution_stage: p.evolution_stage ?? 0,
        });
        return { id: p.id, name: p.name, species: p.species, avatar_url: p.avatar_url, rarity, score };
      });
      setPets(list);
      // Real slot count from the same payload (never inflated).
      if (typeof d?.pet_slots === "number") setPetSlots(d.pet_slots);
      setMyPetId((cur) => cur ?? (list[0] ? list[0].id : null));
    }).catch((e: any) => {
      if (e?.status === 401) setNotAuthed(true);
      else setLoadErr(true); // a network blip must NOT read as "adopt a pet first"
    }).finally(() => setLoaded(true));
  };

  const loadOpps = () => {
    setOppsErr(false);
    fetch("/api/petclaw/network/discover?limit=24", { headers: getAuthHeaders() })
      .then((r) => r.ok ? r.json() : Promise.reject(new Error(`status ${r.status}`)))
      .then((d) => { if (d?.nodes) setOpps(d.nodes); setOppsLoaded(true); })
      .catch(() => setOppsErr(true));
  };

  useEffect(() => {
    loadPets();
    loadOpps();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Battle reveal sequence: panel enters neutral → ~500ms later the winner
  // styling flips (the card transition finally animates) + WINNER stamp presses.
  useEffect(() => {
    if (!battle) { setReveal(false); return; }
    setReveal(false);
    const t = setTimeout(() => setReveal(true), 500);
    return () => clearTimeout(t);
  }, [battle]);

  // ── SCRUM-100: Illustrate now GENERATES ONLY. It never patches the pet.
  // The result is staged in `preview`; the original card stays intact until the
  // user confirms. `confirmIllustrate` performs the (now explicit) swap. ──
  const illustrate = async (petId: number, name: string) => {
    setIllustrating(petId); setErr(null);
    try {
      // Codex sticker — our original collectible-creature look in the chosen
      // variant (grok-imagine uses the pet's photo as reference for identity). The
      // number/name badge is our UI's job, so the art itself stays text-free.
      const prompt = codexPrompt(name, cardVariant);
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
    setIllustrating(petId); setErr(null);
    try {
      // Save to codex_url — NEVER avatar_url. The real photo is preserved; the
      // card + My Pet hero prefer codex_url when present (toggle-able on My Pet).
      const res = await fetch(`/api/pets/${petId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ codex_url: url }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || `Couldn't set the Codex art (${res.status}).`);
      }
      setBust((b) => ({ ...b, [petId]: Date.now() }));
      setPreview(null);
    } catch (e: any) {
      setErr(e?.message || "Couldn't set the Codex art.");
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

  // Closest pet toward the filtered rarity — REAL score vs the REAL threshold
  // from computeRarity. Null when the line can't be honest (no pet below it).
  const closestToFilter = useMemo(() => {
    if (filter === "All" || filter === "Common") return null;
    const threshold = RARITY_THRESHOLD[filter];
    const below = pets.filter((p) => p.score < threshold).sort((a, b) => b.score - a.score);
    return below[0] ? { name: below[0].name, score: below[0].score, threshold } : null;
  }, [pets, filter]);

  const openPet = openId != null ? pets.find((p) => p.id === openId) || null : null;

  // ── "Next grade" progression — the pet CLOSEST to its next rarity tier, from
  // the REAL computeRarity score vs the REAL threshold (never fabricated).
  // Null when every pet is already Legendary. ──
  const nextGrade = useMemo(() => {
    let best: { name: string; score: number; threshold: number; tier: Rarity } | null = null;
    for (const p of pets) {
      const up = (Object.entries(RARITY_THRESHOLD) as Array<[Exclude<Rarity, "Common">, number]>)
        .filter(([, t]) => t > p.score)
        .sort((a, b) => a[1] - b[1])[0];
      if (!up) continue; // already Legendary
      if (!best || up[1] - p.score < best.threshold - best.score) {
        best = { name: p.name, score: p.score, threshold: up[1], tier: up[0] };
      }
    }
    return best;
  }, [pets]);

  // ── Verb-strip DOORS — the highest-graded card (share target) + handlers.
  // Each of the header's 4 verbs performs its real action instead of only
  // describing it: Collect → adopt flow, Battle → battle tab, Share → tweet
  // the top card, Grade → scroll to the Next-grade strip. ──
  const topCard = useMemo(() => pets.length === 0 ? null
    : pets.slice().sort((a, b) => (rarityTier(b.rarity) - rarityTier(a.rarity)) || b.score - a.score)[0], [pets]);
  const goAdopt = () => {
    if (onNavigate) onNavigate("my pet");
    else if (typeof window !== "undefined") window.location.href = "/?section=my%20pet";
  };
  const goNextGrade = () => {
    switchTab("collection");
    setFilter("All");
    // Strip renders on the collection tab's unfiltered view — wait a beat for
    // the tab/filter flip to commit before scrolling to it.
    setTimeout(() => document.getElementById("cd-next-grade")?.scrollIntoView({ behavior: "smooth", block: "center" }), 80);
  };

  // Tabs — mono-labelled editorial pills, active = ink. Album · Catch · Battle.
  const tabStrip = (
    <div role="group" aria-label="Cards section" style={{ display: "flex", gap: 8, marginBottom: 20 }}>
      {(["collection", "catch", "battle"] as const).map((t) => (
        <button type="button" key={t} onClick={() => switchTab(t)} aria-pressed={tab === t} style={{
          padding: "9px 18px", borderRadius: 999, cursor: "pointer",
          fontFamily: T.m, fontWeight: 700, fontSize: 13, letterSpacing: "0.12em", textTransform: "uppercase",
          border: `1px solid ${tab === t ? T.ink : T.hair}`, background: tab === t ? T.ink : T.paper,
          color: tab === t ? T.creamOn : T.muted, boxShadow: tab === t ? "var(--ed-shadow-card)" : "none",
          transition: "all .15s ease",
        }}>{t === "collection" ? "Album" : t === "catch" ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><CameraGlyph size={15} /> Catch</span>
        ) : (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Icon name="sword" size={15} /> Battle</span>
        )}</button>
      ))}
    </div>
  );

  // Catch tab body — lazy CatCatch behind a skeleton in its own footprint.
  const catchTab = (
    <Suspense fallback={
      <div className="ed-skeleton" style={{ width: "100%", maxWidth: 640, margin: "0 auto", aspectRatio: "3 / 4", maxHeight: 520, borderRadius: 18, boxShadow: "var(--ed-shadow-card)" }} />
    }>
      <CatCatch />
    </Suspense>
  );

  // Every early return keeps the tab strip and the Catch tab reachable:
  // catching has ZERO dependency on /api/pets (CatCatch fetches /api/catch),
  // so a pets fetch that is pending, failed, or unauthenticated must never
  // dead-end a /?section=catch deep link or the My Pet catch shortcut.
  if (notAuthed) return (
    <Shell owned={0}>
      {tabStrip}
      {tab === "catch" ? catchTab : <GuestGate onCatch={() => switchTab("catch")} />}
    </Shell>
  );

  // Loading — foil-shimmer skeleton grid in the exact card footprint. Never
  // flash the adopt state at a collector whose cards are still on the wire.
  if (!loaded) {
    return (
      <Shell owned={0}>
        {tabStrip}
        {tab === "catch" ? catchTab : (
          <div className="cd-album-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(196px, 1fr))", gap: 18 }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="mp-enter" style={{ animationDelay: `${i * 45}ms` }}>
                <div className="ed-skeleton" style={{ width: "100%", aspectRatio: "5 / 7", borderRadius: 18, boxShadow: "var(--ed-shadow-card)" }} />
              </div>
            ))}
          </div>
        )}
      </Shell>
    );
  }

  // Honest failure — retryable, distinct from both "empty" and "adopt first".
  if (loadErr && pets.length === 0) {
    return (
      <Shell owned={0}>
        {tabStrip}
        {tab === "catch" ? catchTab : (
          <Empty>
            Couldn&apos;t reach your collection.{" "}
            <button onClick={loadPets} className="ed-underline-slide" style={{ backgroundColor: "transparent", border: "none", padding: 0, color: GOLD, fontWeight: 700, fontFamily: T.body, fontSize: 14.5, cursor: "pointer" }}>Retry ▸</button>
          </Empty>
        )}
      </Shell>
    );
  }

  // Zero pets: the album needs an adopted pet, but CATCHING never did — keep the
  // Catch tab reachable so /?section=catch deep links still work pet-less.
  if (pets.length === 0) return (
    <Shell owned={0}>
      {tabStrip}
      {tab === "catch" ? catchTab : <ZeroState onAdopt={navTo("my pet")} onCatch={() => switchTab("catch")} />}
    </Shell>
  );

  const oppList = opps.filter((o) => !pets.some((p) => p.id === o.petId));

  return (
    <Shell owned={pets.length} rarityCounts={rarityCounts} verbs={{
      collect: goAdopt,
      battle: () => switchTab("battle"),
      share: topCard ? () => shareCard(topCard.id, topCard.name) : undefined,
      grade: nextGrade ? goNextGrade : undefined,
    }}>
      {tabStrip}

      {/* Component-local keyframes (binder flip lives only here, not in globals).
          The global prefers-reduced-motion rule neutralizes it like everything else. */}
      <style>{`
        @keyframes cdBinderFlip{0%{opacity:0;transform:perspective(900px) rotateY(-72deg) translateY(8px)}70%{opacity:1;transform:perspective(900px) rotateY(6deg) translateY(0)}100%{opacity:1;transform:perspective(900px) rotateY(0deg)}}
        /* Wax Press (design 1): the seal drops from above, overshoots, seats; the
           card gives a tiny "thunk" recoil as it's stamped into the mat. */
        @keyframes cdSealDrop{0%{opacity:0;transform:translateY(-40px) scale(1.55) rotate(-14deg)}58%{opacity:1;transform:translateY(3px) scale(.93) rotate(3deg)}100%{opacity:1;transform:translateY(0) scale(1) rotate(6deg)}}
        @keyframes cdThunk{0%,100%{transform:translateY(0)}45%{transform:translateY(3px)}}
      `}</style>

      {/* Page-level banner only for errors with no overlay open (battle tab) —
          overlay errors render INSIDE the overlay, above the scrim. */}
      {err && !openPet && !preview && <div role="alert" style={{ background: T.creamOn, color: T.terraSub, border: `1px solid ${T.hair}`, borderRadius: 12, padding: "10px 14px", fontFamily: T.body, fontSize: 13.5, marginBottom: 16, boxShadow: "var(--ed-shadow-card)" }}>{err}</div>}

      {tab === "collection" && (
        <div>
          {/* Rarity filter tabs (colored dot each) + sort control */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
            <div role="group" aria-label="Filter cards by rarity" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {FILTER_TABS.map((f) => {
                const active = filter === f.key;
                const n = f.key === "All" ? pets.length : (rarityCounts[f.key] || 0);
                return (
                  <button type="button" key={f.key} onClick={() => setFilter(f.key)} aria-pressed={active} style={{
                    display: "inline-flex", alignItems: "center", gap: 7,
                    padding: "8px 14px", borderRadius: 999, cursor: "pointer",
                    fontFamily: T.m, fontWeight: 700, fontSize: 13, letterSpacing: "0.08em", textTransform: "uppercase",
                    border: `1px solid ${active ? T.ink : T.hair}`, background: active ? T.ink : T.paper,
                    color: active ? T.creamOn : T.muted, transition: "all .15s ease",
                  }}>
                    {f.dot && <span style={{ width: 8, height: 8, borderRadius: "50%", background: f.dot, display: "inline-block" }} />}
                    {f.key === "Legendary" && <span style={{ color: active ? "#F6D488" : rarityColor("Legendary"), marginRight: -3 }}>★</span>}
                    {f.label}
                    <span style={{ opacity: 0.65, fontVariantNumeric: "tabular-nums" }}>{n}</span>
                  </button>
                );
              })}
            </div>
            <button onClick={() => setSort((s) => (s === "rarity" ? "name" : "rarity"))} className="ed-underline-slide" style={{
              fontFamily: T.m, fontSize: 13, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase",
              color: T.mono, backgroundColor: "transparent", border: "none", cursor: "pointer", padding: "6px 2px",
            }}>
              Sort: {sort === "rarity" ? "Rarity ↓" : "A → Z"}
            </button>
          </div>

          {/* "Next grade" strip — REAL score vs the REAL next-tier threshold for
              the closest pet (computeRarity), so progression is visible without
              opening a card. Hidden when every card is already Legendary. */}
          {filter === "All" && nextGrade && (
            <Reveal dir="up">
              <div id="cd-next-grade" style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", background: T.paper, border: `1px solid ${T.hair}`, borderRadius: 14, padding: "12px 16px", marginBottom: 18, boxShadow: "var(--ed-shadow-card)" }}>
                <span style={{ fontFamily: T.m, fontSize: 13, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: T.mono, flexShrink: 0 }}>Next grade</span>
                <span style={{ fontFamily: T.body, fontSize: 13.5, color: T.ink70, flexShrink: 0 }}>
                  <strong style={{ fontFamily: T.disp, color: T.ink }}>{nextGrade.name}</strong>
                  {" "}is closest to{" "}
                  <strong style={{ color: rarityColor(nextGrade.tier) }}>{nextGrade.tier}</strong>
                </span>
                <div style={{ flex: 1, minWidth: 140, display: "flex", alignItems: "center", gap: 10 }}>
                  <div role="progressbar" aria-valuemin={0} aria-valuemax={nextGrade.threshold} aria-valuenow={nextGrade.score} aria-label={`${nextGrade.name}: ${nextGrade.score} of ${nextGrade.threshold} to ${nextGrade.tier}`} style={{ flex: 1, height: 8, borderRadius: 999, background: T.inset, border: `1px solid ${T.hair}`, overflow: "hidden" }}>
                    <div style={{ width: `${Math.min(100, Math.round((nextGrade.score / nextGrade.threshold) * 100))}%`, height: "100%", borderRadius: 999, background: rarityColor(nextGrade.tier), transition: "width .6s cubic-bezier(.2,.8,.2,1)" }} />
                  </div>
                  <span style={{ fontFamily: T.m, fontSize: 13, fontWeight: 700, letterSpacing: "0.04em", color: T.muted2, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>{nextGrade.score}/{nextGrade.threshold}</span>
                </div>
                <span style={{ fontFamily: T.body, fontSize: 13, color: T.muted2, flexBasis: "100%" }}>Grades rise from real care — level, bond, streak and stats. No chance, no purchases.</span>
              </div>
            </Reveal>
          )}

          {/* Album grid — cards FLY IN from below as they scroll into view
              (viewport-triggered <Reveal>, stagger capped at 8 steps); the
              shared lift-on-hover verb stays on the inner tile. */}
          <div className="cd-album-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(196px, 1fr))", gap: 18 }}>
            {visible.map((p, i) => (
              <Reveal key={`${p.id}-${bust[p.id] || 0}`} dir="up" delay={Math.min(i, 8) * 70}>
                <button
                  onClick={() => setOpenId(p.id)}
                  className="ed-card-hover"
                  style={{
                    display: "block", width: "100%", padding: 0, margin: 0, border: "none",
                    background: "none", font: "inherit", color: "inherit", textAlign: "inherit",
                    cursor: "pointer", borderRadius: 18,
                  }}
                  aria-label={`Open ${p.name}'s card`}
                >
                  <PetCard petId={p.id} maxWidth={260} placeholder={{ name: p.name, rarity: p.rarity }} insideButton />
                </button>
              </Reveal>
            ))}

            {/* Honest filter empty state — never a blank void. Progress line is
                the pet's REAL computeRarity score vs the REAL tier threshold. */}
            {visible.length === 0 && filter !== "All" && (
              <div className="mp-enter" style={{ gridColumn: "1 / -1" }}>
                <div style={{ borderRadius: 18, border: `1px dashed ${T.hair}`, background: T.inset, padding: "30px 22px", textAlign: "center", maxWidth: 460, margin: "0 auto" }}>
                  <div style={{ fontFamily: T.m, fontSize: 13, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: T.mono, marginBottom: 8 }}>No {filter} cards yet</div>
                  <p style={{ fontFamily: T.body, fontSize: 13.5, color: T.muted2, margin: 0, lineHeight: 1.55 }}>
                    Rarity grows from real care — level, bond and care streak raise a card&apos;s grade.
                  </p>
                  {closestToFilter && (
                    <div style={{ fontFamily: T.m, fontSize: 13, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: T.terraSub, marginTop: 10, fontVariantNumeric: "tabular-nums" }}>
                      Closest: {closestToFilter.name} — {closestToFilter.score}/{closestToFilter.threshold} to {filter}
                    </div>
                  )}
                  {filter === "Common" && (
                    <div style={{ fontFamily: T.m, fontSize: 13, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: T.terraSub, marginTop: 10 }}>
                      Every card you own has graded above Common
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Real remaining adoption slots — only on the unfiltered view, never
                fake card numbers. Labelled honestly as an empty slot to adopt. */}
            {filter === "All" && Array.from({ length: emptySlots }).map((_, i) => (
              <Reveal key={`slot-${i}`} dir="up" delay={Math.min(visible.length + i, 8) * 70}>
                <a
                  href="/?section=my%20pet" onClick={navTo("my pet")}
                  aria-label={`Adopt a pet in empty slot ${i + 1}`}
                  className="ed-card-hover"
                  style={{ textDecoration: "none", display: "block", borderRadius: 18 }}
                >
                  <SlotTile />
                </a>
              </Reveal>
            ))}

            {/* Catch-more tile — flips to this screen's own Catch tab (the old
                /?section=catch destination now aliases right back here). */}
            {filter === "All" && (
              <Reveal dir="up" delay={Math.min(visible.length + emptySlots, 8) * 70}>
                <CatchTile
                  onClick={() => { switchTab("catch"); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                />
              </Reveal>
            )}
          </div>
        </div>
      )}

      {/* Catch — the full camera → verify → collect flow, merged in from the
          old standalone section (Nav's "Catch" entry now lives here). */}
      {tab === "catch" && catchTab}

      {tab === "battle" && (
        <div>
          {/* Matchup controls fly in from opposite wings — your corner from the
              left, the opponent's from the right (alternating dir per side). */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "flex-end", marginBottom: 18 }}>
            <Reveal dir="left">
              <Field label="Your pet">
                <select aria-label="Your pet" value={myPetId ?? ""} onChange={(e) => setMyPetId(Number(e.target.value))} style={select}>
                  {pets.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </Field>
            </Reveal>
            <Reveal dir="fade" delay={140}>
              <div style={{ fontFamily: T.m, fontSize: 14, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: T.mono, paddingBottom: 10 }}>vs</div>
            </Reveal>
            <Reveal dir="right" delay={90}>
              <Field label="Opponent">
                <select aria-label="Opponent" value={oppId ?? ""} onChange={(e) => setOppId(Number(e.target.value))} style={select}>
                  <option value="">Pick an opponent…</option>
                  {oppList.map((o) => <option key={o.petId} value={o.petId}>{o.name} · Lv{o.level} · {o.element}</option>)}
                </select>
              </Field>
            </Reveal>
            <Reveal dir="pop" delay={180}>
              <button type="button" onClick={runBattle} disabled={!myPetId || !oppId || battling} aria-busy={battling} style={{ ...btn, padding: "11px 22px", opacity: !myPetId || !oppId || battling ? 0.5 : 1 }}>
                {battling ? "Battling…" : "Battle!"}
              </button>
            </Reveal>
          </div>
          {/* Mission + REAL reward, stated BEFORE the action — verified against
              /api/card/battle: awardPointsCapped grants 5 pts per duel (win or
              lose), DAILY_POINT_CAPS.card_battle = 40; no credits charged. */}
          <div style={{ fontFamily: T.body, fontSize: 13, color: T.muted2, margin: "-6px 0 16px" }}>
            Free to duel — deterministic from real card stats, and every duel pays{" "}
            <strong style={{ color: T.terraSub }}>+5 season points</strong> (cap 40/day).
          </div>
          {/* Honest opponent states: pending / retryable error / real empty —
              a failed discover fetch must never read as "no opponents exist". */}
          {oppList.length === 0 && (
            oppsLoaded ? (
              <div style={{ fontFamily: T.body, fontSize: 13.5, color: T.muted, marginBottom: 16 }}>No other pets to battle yet.</div>
            ) : oppsErr ? (
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", fontFamily: T.body, fontSize: 13.5, color: T.muted, marginBottom: 16 }}>
                <span>Couldn&apos;t find opponents.</span>
                <button onClick={loadOpps} className="ed-wipe" style={{ fontFamily: T.m, fontSize: 13, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: GOLD, background: "transparent", border: `1px solid ${T.hair}`, borderRadius: 999, padding: "4px 12px", cursor: "pointer" }}>Retry</button>
              </div>
            ) : (
              <div style={{ fontFamily: T.body, fontSize: 13.5, color: T.muted, marginBottom: 16 }}>Finding opponents…</div>
            )
          )}

          {battle && (
            <div className="mp-enter" style={{ borderRadius: 22, border: `1px solid ${T.hair}`, padding: 22, background: T.paper, boxShadow: "var(--ed-shadow-card)" }}>
              <div style={{ textAlign: "center", marginBottom: 18 }}>
                <div style={{ fontFamily: T.m, fontSize: 13, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: T.mono, marginBottom: 7 }}>Duel result</div>
                {/* Headline holds space during the neutral beat, then reveals */}
                <div style={{ fontFamily: T.disp, fontSize: 26, fontWeight: 800, color: battle.winner === "you" ? T.win : T.terra, opacity: reveal ? 1 : 0, transition: "opacity .35s ease" }}>
                  {battle.winner === "you" ? (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><Icon name="trophy" size={24} /> {battle.you.name} wins!</span>
                  ) : `${battle.opponent.name} wins`}
                </div>
                {/* Real figures tick up over ~600ms (already tabular) */}
                <div style={{ fontFamily: T.m, fontSize: 13, color: T.muted, fontWeight: 700, letterSpacing: "0.06em", marginTop: 7, fontVariantNumeric: "tabular-nums" }}>
                  <Num n={battle.result.turns} /> turns · your HP <Num n={battle.result.yourHp} />/<Num n={battle.result.yourHpMax} /> · their HP <Num n={battle.result.oppHp} />/<Num n={battle.result.oppHpMax} />
                </div>
                {/* Real awarded points from /api/card/battle (awardPointsCapped) —
                    mirrors the CatCatch reveal chip; never shown when capped to 0. */}
                {typeof battle.pointsAwarded === "number" && battle.pointsAwarded > 0 && (
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 12, background: "linear-gradient(180deg,#F49B2A,#E27D0C)", color: "#211A12", fontFamily: T.m, fontWeight: 700, fontSize: 13, letterSpacing: ".06em", borderRadius: 999, padding: "6px 14px", fontVariantNumeric: "tabular-nums" }}>+{battle.pointsAwarded} season points <Icon name="coin" size={14} /></div>
                )}
              </div>
              <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
                {[battle.you, battle.opponent].map((c: any, i: number) => {
                  const isWinner = (i === 0 && battle.winner === "you") || (i === 1 && battle.winner === "opponent");
                  return (
                    <div key={i} style={{
                      width: 220,
                      // Neutral until the reveal beat — flipping the styling ~500ms
                      // in lets this transition actually animate (it was dead code
                      // when the winner state was set on first render).
                      opacity: reveal ? (isWinner ? 1 : 0.72) : 1,
                      transform: reveal && isWinner ? "scale(1.03)" : "none",
                      transition: "opacity .45s cubic-bezier(.2,.8,.2,1), transform .45s cubic-bezier(.2,.8,.2,1)",
                    }}>
                      <PetCard petId={c.id} maxWidth={220} />
                      <div style={{ textAlign: "center", marginTop: 9, height: 26 }}>
                        {reveal && isWinner && (
                          <span style={{
                            display: "inline-block", fontFamily: T.m, fontSize: 13, fontWeight: 700,
                            letterSpacing: "0.18em", textTransform: "uppercase", color: T.win,
                            border: `2px solid ${T.win}`, borderRadius: 6, padding: "3px 10px",
                            animation: "sealPress 380ms 100ms both",
                          }}>Winner</span>
                        )}
                      </div>
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
                <a href={`/card/battle/${battle.matchup}`} target="_blank" rel="noopener noreferrer" className="ed-wipe" style={{ ...ghost, textDecoration: "none", display: "inline-flex", alignItems: "center" }}>View result page ▸</a>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Card detail overlay — Share + ✨ Illustrate reachable per card.
             The big card is NOT a link anymore: the holo tilt owns the inspect
             gesture ("View card page ▸" below stays the sole external link). ── */}
      {openPet && (
        <Overlay label={`${openPet.name} card details`} closeDisabled={illustrating != null} onClose={() => { setOpenId(null); setErr(null); }}>
          <div style={{ maxWidth: 320, margin: "0 auto" }}>
            {/* One-shot "drawn from the binder" flip */}
            <div style={{ position: "relative", animation: "cdThunk .18s ease-out 640ms both" }}>
              <div style={{ animation: "cdBinderFlip 480ms cubic-bezier(.2,.8,.2,1) 120ms both" }}>
                <PetCard key={`detail-${openPet.id}-${bust[openPet.id] || 0}`} petId={openPet.id} maxWidth={320} placeholder={{ name: openPet.name, rarity: openPet.rarity }} />
              </div>
              {/* Wax Press (design 1): a terracotta ownership seal drops + stamps
                  the card as it settles — the brand's ownership verb. */}
              <div aria-hidden style={{
                position: "absolute", top: -12, right: -6, width: 58, height: 58, zIndex: 6, borderRadius: "50%",
                background: "radial-gradient(circle at 36% 30%, #E4703F, #BE4F28 46%, #8A3616)",
                border: "2.5px solid #FBF6EC",
                boxShadow: "0 8px 16px -5px rgba(80,30,6,.55), inset 0 2px 3px rgba(255,220,200,.5), inset 0 -3px 5px rgba(90,30,8,.6)",
                display: "flex", alignItems: "center", justifyContent: "center",
                animation: "cdSealDrop .5s cubic-bezier(.2,.85,.25,1) 560ms both",
              }}>
                <span style={{ fontFamily: T.m, fontSize: 12, fontWeight: 700, letterSpacing: ".1em", color: "#FBE3D2", textShadow: "0 1px 1px rgba(80,20,0,.5)" }}>OWNED</span>
              </div>
            </div>
            {/* Holographic-ticket stub — grab the glowing dot and rip along the
                perforation to share (the reference interaction). The buttons
                below remain the accessible path to every action. */}
            <RipStub petId={openPet.id} rarity={openPet.rarity} onRip={() => shareCard(openPet.id, openPet.name)} />
            {/* Collectible sticker style picker — the look Illustrate will generate */}
            <div style={{ display: "flex", gap: 6, justifyContent: "center", flexWrap: "wrap", marginTop: 14 }}>
              {CODEX_VARIANTS.map((v) => {
                const on = v.key === cardVariant;
                return (
                  <button key={v.key} type="button" onClick={() => setCardVariant(v.key)} title={v.blurb} aria-pressed={on} style={{
                    fontFamily: T.m, fontSize: 13, fontWeight: 700, letterSpacing: ".04em", padding: "5px 11px", borderRadius: 999, cursor: "pointer",
                    border: on ? `1.5px solid ${T.ink}` : `1px solid ${T.hair}`, background: on ? T.ink : T.paper, color: on ? T.creamOn : T.muted,
                  }}>{v.label}</button>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 10, flexWrap: "wrap" }}>
              <button onClick={() => shareCard(openPet.id, openPet.name)} style={btn}>𝕏 Share</button>
              <button
                onClick={() => illustrate(openPet.id, openPet.name)}
                disabled={illustrating === openPet.id}
                className="ed-wipe"
                style={{ ...ghost, opacity: illustrating === openPet.id ? 0.6 : 1, display: "inline-flex", alignItems: "center", gap: 6 }}
              >
                {illustrating === openPet.id ? "Illustrating…" : <><Icon name="sparkling" size={14} /> Codex · 5 cr</>}
              </button>
              <a href={cardUrl(openPet.id)} target="_blank" rel="noopener noreferrer" className="ed-wipe" style={{ ...ghost, textDecoration: "none", display: "inline-flex", alignItems: "center" }}>View card page ▸</a>
            </div>
            {/* Errors surface INSIDE the overlay — a 402 must never hide under the scrim */}
            {err && (
              <div role="alert" style={{ background: T.creamOn, color: T.terraSub, border: `1px solid ${T.hair}`, borderRadius: 10, padding: "9px 12px", fontFamily: T.body, fontSize: 13, marginTop: 12, textAlign: "center" }}>{err}</div>
            )}
            <p style={{ fontFamily: T.body, fontSize: 13, color: T.muted2, textAlign: "center", margin: "12px auto 0", maxWidth: 268, lineHeight: 1.5 }}>
              Codex turns {openPet.name}{" "}into a collectible creature sticker — you preview &amp; confirm before it becomes the card art. Your photo is always kept. Costs 5 credits.
            </p>
          </div>
        </Overlay>
      )}

      {/* ── SCRUM-100: non-destructive Illustrate PREVIEW + confirm ── */}
      {preview && (
        <Overlay label={`Preview ${preview.name}'s Codex sticker`} closeDisabled={illustrating != null} onClose={() => { if (!illustrating) { setPreview(null); setErr(null); } }}>
          <div style={{ maxWidth: 520, margin: "0 auto", textAlign: "center" }}>
            <div style={{ fontFamily: T.m, fontSize: 13, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: T.terra, marginBottom: 6 }}>Preview · not saved yet</div>
            <h3 style={{ fontFamily: T.disp, fontSize: 24, fontWeight: 800, color: T.ink, margin: "0 0 4px", letterSpacing: "-0.02em" }}>Make this {preview.name}&apos;s Codex sticker?</h3>
            <p style={{ fontFamily: T.body, fontSize: 13.5, color: T.muted2, margin: "0 auto 18px", maxWidth: 400, lineHeight: 1.5 }}>
              Your photo is always kept — the Codex is saved separately, and you can flip back to the photo on My Pet anytime. Confirm to set it as the card art.
            </p>
            <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap", marginBottom: 20 }}>
              <PreviewCol label="Photo"><PetCard key={`orig-${preview.petId}`} petId={preview.petId} maxWidth={220} placeholder={{ name: preview.name, rarity: pets.find((p) => p.id === preview.petId)?.rarity || "Common" }} /></PreviewCol>
              <PreviewCol label="Codex" accent delay={90}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <div style={{ width: 220, aspectRatio: "1 / 1", borderRadius: 14, overflow: "hidden", border: `2px solid ${T.terra}`, background: "#fff", boxShadow: "var(--ed-shadow-card)" }}>
                  <img src={preview.url} alt={`${preview.name} illustrated`} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                </div>
              </PreviewCol>
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
              <button onClick={confirmIllustrate} disabled={illustrating != null} style={{ ...btn, padding: "11px 22px", opacity: illustrating != null ? 0.6 : 1 }}>
                {illustrating != null ? "Saving…" : "Set as Codex"}
              </button>
              <button onClick={() => { setPreview(null); setErr(null); }} disabled={illustrating != null} className="ed-wipe" style={{ ...ghost, padding: "11px 22px" }}>Keep photo</button>
            </div>
            {/* confirmIllustrate PATCH failures surface here, above the scrim */}
            {err && (
              <div role="alert" style={{ background: T.creamOn, color: T.terraSub, border: `1px solid ${T.hair}`, borderRadius: 10, padding: "9px 12px", fontFamily: T.body, fontSize: 13, marginTop: 14 }}>{err}</div>
            )}
          </div>
        </Overlay>
      )}
    </Shell>
  );
}

/** Holographic ticket stub under the detail card. A glowing dot rides the
 *  perforation — drag it across (≥85%) and the stub rips off, firing onRip
 *  (the X share). Real die-cut notches: transparent radial cutouts let the
 *  scrim show through. Touch + pointer, resets if released early. */
function RipStub({ petId, rarity, onRip }: { petId: number; rarity: Rarity; onRip: () => void }) {
  const [prog, setProg] = useState(0);
  const [ripped, setRipped] = useState(false);
  const stripRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const progRef = useRef(0);
  const firedRef = useRef(false);
  const moved = useRef(false);

  const moveTo = (clientX: number) => {
    const el = stripRef.current; if (!el) return;
    const r = el.getBoundingClientRect();
    const p = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    progRef.current = p;
    setProg(p);
  };
  // A real DRAG must cross the strip — a tap that merely lands past 85% must
  // never fire the share, so require actual movement (moved flag) too.
  const fireRip = () => {
    if (ripped || firedRef.current) return;
    firedRef.current = true;
    setRipped(true);
    setProg(1);
    setTimeout(onRip, 480);
  };
  const done = () => {
    if (!dragging.current) return;
    dragging.current = false;
    if (moved.current && progRef.current >= 0.85 && !firedRef.current) {
      fireRip();
    } else if (!firedRef.current) {
      progRef.current = 0;
      setProg(0);
    }
    moved.current = false;
  };
  const topo = rarityTopo(rarity);

  return (
    <div aria-hidden={false} style={{ marginTop: 2, userSelect: "none" }}>
      {/* Perforation strip — dashed tear line + the glowing grab dot */}
      <div
        ref={stripRef}
        onPointerDown={(e) => {
          if (ripped) return;
          e.currentTarget.focus();
          dragging.current = true;
          moved.current = false;
          (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
        }}
        onPointerMove={(e) => { if (dragging.current) { moved.current = true; moveTo(e.clientX); } }}
        onPointerUp={done}
        onPointerCancel={done}
        role="button"
        tabIndex={0}
        aria-disabled={ripped}
        aria-label={ripped ? "Ticket stub shared" : "Rip the ticket stub to share this card"}
        onKeyDown={(e) => {
          if (!ripped && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            fireRip();
          }
        }}
        style={{ position: "relative", height: 30, cursor: ripped ? "default" : "grab", touchAction: "none" }}
      >
        {/* uncut dashed perforation (remaining right segment) */}
        <div style={{ position: "absolute", top: "50%", left: `${prog * 100}%`, right: 0, borderTop: `2px dashed ${ripped ? "transparent" : "rgba(252,233,207,.55)"}`, transition: dragging.current ? "none" : "left .25s ease" }} />
        {/* cut edge left of the dot — a faint frayed trail */}
        {prog > 0.02 && !ripped && (
          <div style={{ position: "absolute", top: "50%", left: 0, width: `${prog * 100}%`, borderTop: "2px solid rgba(252,233,207,.18)" }} />
        )}
        {!ripped && (
          <div
            className={prog === 0 ? "mp-live-pulse" : undefined}
            style={{
              position: "absolute", top: "50%", left: `calc(${prog * 100}% - 12px)`, transform: "translateY(-50%)",
              width: 24, height: 24, borderRadius: "50%",
              background: "linear-gradient(180deg, #F49B2A, #E27D0C)", border: "2px solid #FFF8EE",
              boxShadow: "0 0 0 4px rgba(244,155,42,.22)",
              transition: dragging.current ? "none" : "left .25s ease",
            }}
          />
        )}
      </div>

      {/* The stub itself — rips off with a paper-tear rotation */}
      <div style={{
        position: "relative",
        background: `radial-gradient(circle 10px at 0 0, transparent 9.5px, ${T.paper} 10px) left top / 51% 100% no-repeat, radial-gradient(circle 10px at 100% 0, transparent 9.5px, ${T.paper} 10px) right top / 51% 100% no-repeat`,
        borderRadius: "0 0 14px 14px",
        padding: "12px 18px",
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
        boxShadow: "var(--ed-shadow-card)",
        transform: ripped ? "rotate(7deg) translate(20px, 46px)" : "none",
        opacity: ripped ? 0 : 1,
        transition: "transform .5s cubic-bezier(.3,.7,.4,1), opacity .5s ease",
        pointerEvents: "none",
      }}>
        <span style={{ fontFamily: T.m, fontSize: 13, fontWeight: 700, letterSpacing: "0.1em", color: T.muted2, whiteSpace: "nowrap" }}>
          № {String(petId).padStart(4, "0")} · {rarity.toUpperCase()}
        </span>
        <span style={{ fontFamily: T.m, fontSize: 13, fontWeight: 700, letterSpacing: "0.12em", color: T.mono, textAlign: "center", flex: 1 }}>
          RIP TO SHARE
        </span>
        {/* mini foil patch — matches the card face: iridescent topo only for
            Rare+ (topo>0), matte cream chip for Common/Uncommon. */}
        <span aria-hidden style={topo > 0 ? {
          width: 40, height: 26, borderRadius: 6, flexShrink: 0,
          background: `${HOLO_LINEAR} 50% 50% / 300% 300%`,
          WebkitMaskImage: TOPO_MASK, maskImage: TOPO_MASK,
          WebkitMaskSize: "70px 70px", maskSize: "70px 70px",
          opacity: 0.4 + topo * 0.6,
          boxShadow: `inset 0 0 0 1px ${T.hair}`,
        } : {
          width: 40, height: 26, borderRadius: 6, flexShrink: 0,
          background: "#E4D9C4",
          boxShadow: `inset 0 0 0 1px ${T.hair}`,
        }} />
      </div>

      {ripped && (
        <div className="mp-enter" style={{ fontFamily: T.m, fontSize: 13, fontWeight: 700, letterSpacing: "0.12em", color: T.creamOn, textAlign: "center", marginTop: 8 }}>
          TICKET RIPPED ✦ OPENING SHARE…
        </div>
      )}
    </div>
  );
}

// Primary action — ink fill, mono label, soft floating shadow (never a hard offset)
const btn: React.CSSProperties = { padding: "9px 15px", borderRadius: 999, border: `1px solid ${T.ink}`, background: T.ink, color: T.creamOn, fontFamily: T.m, fontWeight: 700, fontSize: 13, letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer", boxShadow: "var(--ed-shadow-card)" };
const ghost: React.CSSProperties = { padding: "9px 15px", borderRadius: 999, border: `1px solid ${T.hair}`, background: T.paper, color: T.ink70, fontFamily: T.m, fontWeight: 700, fontSize: 13, letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer" };
const select: React.CSSProperties = { padding: "9px 13px", borderRadius: 12, border: `1px solid ${T.hair}`, fontFamily: T.body, fontSize: 14, color: T.ink, background: T.paper, minWidth: 180 };

/** Outline camera glyph in currentColor — legible on both the active ink pill
 *  (cream) and the resting paper pill (muted), unlike a fixed-fill icon. */
function CameraGlyph({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden style={{ display: "block", flexShrink: 0 }}>
      <path d="M3 8.5C3 7.4 3.9 6.5 5 6.5H7L8.2 4.6C8.4 4.2 8.8 4 9.2 4H14.8C15.2 4 15.6 4.2 15.8 4.6L17 6.5H19C20.1 6.5 21 7.4 21 8.5V17C21 18.1 20.1 19 19 19H5C3.9 19 3 18.1 3 17V8.5Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <circle cx="12" cy="12.5" r="3.6" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontFamily: T.m, fontSize: 13, fontWeight: 700, letterSpacing: "0.14em", color: T.mono, textTransform: "uppercase" }}>{label}</span>
      {children}
    </div>
  );
}

/** Count-up on a REAL figure (battle turns / HP) — presentation only. */
function Num({ n }: { n: number }) {
  const v = useCountUp(n, 600);
  return <>{v}</>;
}

function PreviewCol({ label, accent, delay = 0, children }: { label: string; accent?: boolean; delay?: number; children: React.ReactNode }) {
  return (
    <div className="mp-enter" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, animationDelay: `${delay}ms` }}>
      {children}
      <span style={{ fontFamily: T.m, fontSize: 13, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: accent ? T.terra : T.muted }}>{label}</span>
    </div>
  );
}

// Richer zero-pets guidance — the album has literally nothing to show yet, so
// this replaces the terse one-liner with the same dashed-panel language as the
// filtered empty state, plus BOTH real paths off the page (adopt or catch).
function ZeroState({ onAdopt, onCatch }: { onAdopt?: (e: React.MouseEvent) => void; onCatch: () => void }) {
  return (
    <Reveal dir="up">
      <div style={{
        borderRadius: 20, border: `1px dashed ${T.hair}`, background: T.inset,
        padding: "40px 28px", textAlign: "center", maxWidth: 520, margin: "20px auto 0",
      }}>
        <Icon name="paw" size={34} style={{ opacity: 0.35 }} />
        <h3 style={{ fontFamily: T.disp, fontSize: 22, fontWeight: 800, color: T.ink, margin: "12px 0 6px", letterSpacing: "-0.01em" }}>
          No cards yet
        </h3>
        <p style={{ fontFamily: T.body, fontSize: 14, color: T.muted2, margin: "0 auto 20px", maxWidth: 380, lineHeight: 1.55 }}>
          Cards are created from pets you actually raise — adopt one to start your album. Animals you catch in the wild live in your Field Guide over in Catch, and brawl in Alley Clash.
        </p>
        <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
          <a href="/?section=my%20pet" onClick={onAdopt} className="ed-wipe" style={{ ...btn, textDecoration: "none", display: "inline-flex", alignItems: "center" }}>Adopt a pet ▸</a>
          <button type="button" onClick={onCatch} className="ed-wipe" style={{ ...ghost, display: "inline-flex", alignItems: "center", gap: 6 }}>
            <CameraGlyph size={14} /> Catch in the wild
          </button>
        </div>
      </div>
    </Reveal>
  );
}

// Guest gate — built around a two-card SAMPLE showcase: the SAME sample pet at
// two grades, so one glance teaches "rarity changes the card". Common is clean
// matte paper; Rare wears the deck's REAL foil language (PetCard's gold-foil
// ring + pointer-trailing holo topo/sheen/glare) with a different pose of the
// same cat and visibly higher stat chips. Both cards are stamped SAMPLE —
// never presented as owned inventory — and the connect CTA states the real
// deal: your pets become cards automatically, no purchase.
function GuestGate({ onCatch }: { onCatch: () => void }) {
  const { openConnectModal } = useConnectModal();
  return (
    <Reveal dir="up">
      <div style={{ borderRadius: 20, border: `1px dashed ${T.hair}`, background: T.inset, padding: "36px 28px", textAlign: "center", maxWidth: 640, margin: "16px auto 0" }}>
        {/* SAMPLE showcase — Common vs Rare of the same pet, honestly labelled */}
        <div style={{ fontFamily: T.m, fontSize: 13, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: T.mono, marginBottom: 14 }}>
          Sample cards · what a grade changes
        </div>
        <div style={{ display: "flex", gap: 16, justifyContent: "center", alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
          <SampleCard grade="Common" />
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, flexShrink: 0 }}>
            <span aria-hidden style={{ fontFamily: T.disp, fontSize: 20, fontWeight: 800, color: T.terra, lineHeight: 1 }}>→</span>
            <span style={{ fontFamily: T.m, fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: T.terraSub }}>Real care</span>
          </div>
          <SampleCard grade="Rare" />
        </div>
        <p style={{ fontFamily: T.body, fontSize: 13, color: T.muted2, margin: "0 auto 20px", maxWidth: 440, lineHeight: 1.5 }}>
          Same pet, two grades. Care raises the grade — from Rare up the card is printed with a gold-foil edge and holographic contours, and its real stats climb with it. No chance, no packs.
        </p>
        <h3 style={{ fontFamily: T.disp, fontSize: 24, fontWeight: 800, color: T.ink, margin: "0 0 6px", letterSpacing: "-0.01em" }}>Your album is waiting</h3>
        <p style={{ fontFamily: T.body, fontSize: 14, color: T.muted2, margin: "0 auto 20px", maxWidth: 400, lineHeight: 1.55 }}>
          Connect and every pet you raise becomes a trading card like these automatically — graded by real care, ready to duel and share. Animals you catch build their own Field Guide in the Catch tab.
        </p>
        <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
          <button type="button" onClick={() => openConnectModal?.()} disabled={!openConnectModal} className="ed-wipe" style={{ ...btn, padding: "11px 22px", opacity: openConnectModal ? 1 : 0.6 }}>
            Connect wallet ▸
          </button>
          <button type="button" onClick={onCatch} className="ed-wipe" style={{ ...ghost, display: "inline-flex", alignItems: "center", gap: 6 }}>
            <CameraGlyph size={14} /> See how Catch works
          </button>
        </div>
        {/* The connect CTA's REAL reward, stated plainly (no purchase exists) */}
        <div style={{ fontFamily: T.body, fontSize: 13, color: T.muted2, marginTop: 12 }}>
          Free — no purchase, no packs. Your pets become cards automatically.
        </div>
      </div>
    </Reveal>
  );
}

/** One SAMPLE card for the guest showcase. `Rare` reuses the deck's REAL
 *  rarity treatments — PetCard's gold-foil border ring, the TOPO_MASK holo
 *  contours + .ed-holo-sheen layer, and the exact fine-pointer tilt/glare
 *  math — while `Common` stays clean matte paper, so the pair teaches the
 *  grade system at a glance. Fixed demo figures on art from the public
 *  gallery set (two poses of the same orange cat), permanently stamped
 *  SAMPLE — never presented as owned inventory. */
function SampleCard({ grade }: { grade: "Common" | "Rare" }) {
  const rare = grade === "Rare";
  const rc = rarityColor(grade);
  const ref = useRef<HTMLDivElement>(null);
  const [tiltOn, setTiltOn] = useState(false);
  useEffect(() => {
    if (rare && typeof window !== "undefined" && window.matchMedia("(hover: hover) and (pointer: fine)").matches) setTiltOn(true);
  }, [rare]);
  // Same handler math as PetCard — the Rare sample must BEHAVE rare on hover,
  // not just say it (holo sheen + glare trail the pointer via --holo-x/--px).
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!tiltOn || !el) return;
    const r = el.getBoundingClientRect();
    const nx = ((e.clientX - r.left) / r.width) * 2 - 1;
    const ny = ((e.clientY - r.top) / r.height) * 2 - 1;
    el.classList.add("ed-holo-live");
    el.style.transition = "transform 80ms linear";
    el.style.setProperty("--rx", nx.toFixed(3));
    el.style.setProperty("--ry", (-ny).toFixed(3));
    el.style.setProperty("--px", `${(((nx + 1) / 2) * 100).toFixed(1)}%`);
    el.style.setProperty("--py", `${(((ny + 1) / 2) * 100).toFixed(1)}%`);
    el.style.setProperty("--hl", "1");
    el.style.setProperty("--holo-x", `${Math.round(50 + nx * 60)}%`);
    el.style.setProperty("--holo-y", `${Math.round(50 + ny * 60)}%`);
  };
  const onLeave = () => {
    const el = ref.current;
    if (!el) return;
    el.classList.remove("ed-holo-live");
    el.style.transition = "transform 450ms cubic-bezier(0.2,0.8,0.2,1)";
    el.style.setProperty("--rx", "0");
    el.style.setProperty("--ry", "0");
    el.style.setProperty("--hl", "0");
  };
  const stats = rare
    ? ([["ATK", 24], ["DEF", 19], ["SPD", 22]] as const)
    : ([["ATK", 7], ["DEF", 6], ["SPD", 5]] as const);
  return (
    <div style={{ width: 172, flexShrink: 0, perspective: 700 }}>
      <div
        ref={ref}
        onPointerMove={rare ? onMove : undefined}
        onPointerLeave={rare ? onLeave : undefined}
        style={{
          position: "relative", borderRadius: 14, padding: rare ? 3 : 2,
          background: rare ? FOIL_GOLD : "#E4D9C4",
          boxShadow: "var(--ed-shadow-card)",
          transform: "rotateX(calc(var(--ry, 0) * 6deg)) rotateY(calc(var(--rx, 0) * 8deg))",
          willChange: tiltOn ? "transform" : undefined,
        }}
      >
        <div style={{ position: "relative", overflow: "hidden", borderRadius: rare ? 11 : 12, background: T.paper, textAlign: "left" }}>
          {/* header */}
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 6, padding: "8px 10px 6px" }}>
            <span style={{ fontFamily: T.disp, fontSize: 15, fontWeight: 800, color: T.ink, letterSpacing: "-0.02em" }}>Dordor</span>
            <span style={{ fontFamily: T.m, fontSize: 12, fontWeight: 700, color: T.muted2, fontVariantNumeric: "tabular-nums" }}>Lv {rare ? 21 : 2}</span>
          </div>
          {/* photo well — Rare gets the gold inset keyline + holo topo + sheen,
              and a different action pose/crop of the same cat */}
          <div style={{ position: "relative", margin: "0 10px", borderRadius: 6, overflow: "hidden", boxShadow: rare ? "inset 0 0 0 2px rgba(184,130,44,.5)" : `inset 0 0 0 1px ${T.hair}` }}>
            <div style={{ position: "relative", width: "100%", aspectRatio: "1 / 1", background: "#fff" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={rare ? "/gallery/cat_astro.jpg" : "/gallery/pet_cat.jpg"}
                alt=""
                style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: rare ? "47% 32%" : "50% 42%", display: "block" }}
              />
              {rare && <div className="ed-holo-sheen" aria-hidden style={{ opacity: 0.16 }} />}
              {rare && (
                <div aria-hidden style={{
                  position: "absolute", inset: 0, pointerEvents: "none",
                  background: HOLO_LINEAR, backgroundSize: "300% 300%",
                  backgroundPosition: "var(--holo-x, 50%) var(--holo-y, 50%)",
                  WebkitMaskImage: TOPO_MASK, maskImage: TOPO_MASK,
                  WebkitMaskSize: "150px 150px", maskSize: "150px 150px",
                  mixBlendMode: "screen", opacity: 0.32,
                }} />
              )}
              {/* SAMPLE stamp — airtight honesty on the art itself */}
              <span style={{
                position: "absolute", left: 6, bottom: 6, fontFamily: T.m, fontSize: 12, fontWeight: 700,
                letterSpacing: "0.12em", color: T.ink70, background: "rgba(251,246,236,.9)",
                border: `1px solid ${T.hair}`, borderRadius: 5, padding: "1px 6px",
              }}>SAMPLE</span>
            </div>
            {/* circular rarity seal — same language as the real card face */}
            <span aria-hidden style={{
              position: "absolute", top: 6, right: 6, width: 24, height: 24, borderRadius: "50%",
              background: T.paper, border: `2px solid ${rc}`, display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 2px 6px -1px rgba(40,20,0,.4)",
            }}>
              <span style={{ fontFamily: T.m, fontWeight: 700, fontSize: 12, color: rc }}>{grade[0]}</span>
            </span>
          </div>
          {/* stat chips — Rare's figures and gold keylines differ on sight */}
          <div style={{ display: "flex", gap: 5, padding: "7px 10px 6px" }}>
            {stats.map(([lab, val]) => (
              <span key={lab} style={{
                flex: 1, display: "flex", flexDirection: "column", alignItems: "center", background: "#fff",
                borderRadius: 7, border: rare ? "1px solid rgba(184,130,44,.45)" : `1px solid ${T.hair}`, padding: "4px 2px",
              }}>
                <span style={{ fontFamily: T.disp, fontSize: 14, fontWeight: 700, color: T.ink, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{val}</span>
                <span style={{ fontFamily: T.m, fontSize: 12, color: T.muted2, letterSpacing: 1, marginTop: 2 }}>{lab}</span>
              </span>
            ))}
          </div>
          {/* footer — grade name; Rare adds the mini topo-foil patch (the same
              chip the ticket stub wears), Common a matte cream one */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, padding: "0 10px 8px" }}>
            <span style={{ fontFamily: T.m, fontSize: 12, fontWeight: 700, letterSpacing: "0.14em", color: rc }}>{grade.toUpperCase()}</span>
            <span aria-hidden style={rare ? {
              width: 26, height: 16, borderRadius: 4,
              background: `${HOLO_LINEAR} 50% 50% / 300% 300%`,
              WebkitMaskImage: TOPO_MASK, maskImage: TOPO_MASK,
              WebkitMaskSize: "46px 46px", maskSize: "46px 46px",
              opacity: 0.75, boxShadow: `inset 0 0 0 1px ${T.hair}`,
            } : {
              width: 26, height: 16, borderRadius: 4, background: "#E4D9C4", boxShadow: `inset 0 0 0 1px ${T.hair}`,
            }} />
          </div>
        </div>
        {/* pointer-following glare — same screen-blend highlight as PetCard */}
        {rare && (
          <div aria-hidden style={{
            position: "absolute", inset: 0, borderRadius: 14, pointerEvents: "none", mixBlendMode: "screen",
            opacity: "var(--hl, 0)" as unknown as number, transition: "opacity .3s ease",
            background: "radial-gradient(180px circle at var(--px, 50%) var(--py, 50%), rgba(255,246,220,.5), transparent 65%)",
          }} />
        )}
      </div>
      <div style={{ fontFamily: T.m, fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: rare ? T.terraSub : T.muted, marginTop: 8, textAlign: "center" }}>
        {rare ? "Weeks of real care" : "Day one"}
      </div>
    </div>
  );
}

// ── The album-shelf "slot family": SlotTile (empty, dashed) and CatchTile
// (dark field-note) share the REAL card's structural rhythm — the same 5/7
// footprint, radius-18 frame, and header → photo-well → hairline-footer rows —
// so [card][empty slot][catch] reads as one shelf, not three visual languages.

// Empty adoption slot — a REAL remaining pet slot (never a fabricated card
// number). Drawn as an empty card sleeve: dashed frame, blank portrait well,
// footer holds the door to the adopt flow.
function SlotTile() {
  return (
    <div style={{
      width: "100%", aspectRatio: "5 / 7", borderRadius: 18, background: T.inset,
      border: "1.5px dashed rgba(33,26,18,.3)", display: "flex", flexDirection: "column",
      padding: "11px 14px 9px", textAlign: "left",
    }}>
      {/* header rhythm — where a card's name / Lv row sits */}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
        <span style={{ fontFamily: T.m, fontSize: 13, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: T.muted2 }}>Empty slot</span>
        <span style={{ fontFamily: T.m, fontSize: 13, fontWeight: 700, color: T.muted2, fontVariantNumeric: "tabular-nums" }}>Lv —</span>
      </div>
      {/* photo-well rhythm — dashed frame where the portrait will print */}
      <div style={{ flex: 1, minHeight: 34, margin: "9px 0 8px", borderRadius: 8, border: "1.5px dashed rgba(33,26,18,.22)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Icon name="paw" size={28} style={{ opacity: 0.32 }} />
      </div>
      <span style={{ fontFamily: T.body, fontSize: 13, color: T.muted2, lineHeight: 1.45 }}>
        Your next card prints here.
      </span>
      {/* footer rhythm — the card's baseline strip, holding the door */}
      <div style={{ borderTop: "1px dashed rgba(33,26,18,.22)", marginTop: 9, paddingTop: 9, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span style={{ fontFamily: T.m, fontSize: 13, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: T.terraSub }}>Adopt a pet ▸</span>
        <span style={{ fontFamily: T.m, fontSize: 13, fontWeight: 700, color: T.muted2 }}>№ —</span>
      </div>
    </div>
  );
}

// "Catch in the wild" — the shelf's dark FIELD-NOTE slot; flips to this
// screen's Catch tab in-place. Same card rhythm as its neighbours, toned to
// night-expedition ink (no saturated orange slab — the CTA is a cream chip).
// Entrance comes from the <Reveal> wrapper at the call site.
function CatchTile({ onClick }: { onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} className="ed-card-hover" style={{
      border: "none", font: "inherit", cursor: "pointer",
      width: "100%", aspectRatio: "5 / 7", borderRadius: 18,
      background: "linear-gradient(180deg,#2C2114,#1A120A)",
      display: "flex", flexDirection: "column", alignItems: "stretch",
      padding: "11px 14px 9px", textAlign: "left", color: "#FBF6EC",
      boxShadow: "var(--ed-shadow-card)",
    }}>
      {/* header rhythm — a card's name row, field-note flavored */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span style={{ fontFamily: T.disp, fontSize: 16.5, fontWeight: 800, lineHeight: 1.15, letterSpacing: "-0.01em" }}>Catch in the wild</span>
        <CameraGlyph size={16} />
      </div>
      {/* photo-well rhythm — keyline frame like the card's portrait well */}
      <div style={{ flex: 1, minHeight: 34, margin: "9px 0 8px", borderRadius: 8, border: "1px solid rgba(251,246,236,.25)", background: "rgba(251,246,236,.06)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Icon name="paw" size={26} style={{ opacity: 0.85 }} />
      </div>
      <span style={{ fontFamily: T.body, fontSize: 13, color: "rgba(251,246,236,.94)", lineHeight: 1.45 }}>
        Snap a real animal outside — it becomes a collectible card.
      </span>
      {/* REAL reward, stated before the action — /api/catch grants
          CATCH_POINTS 10–80 by rarity, daily-capped (anti-farm). */}
      <span style={{ fontFamily: T.m, fontSize: 13, fontWeight: 700, color: "rgba(251,246,236,.88)", letterSpacing: ".03em", fontVariantNumeric: "tabular-nums", marginTop: 5 }}>
        +10–80 season pts a catch · daily-capped
      </span>
      {/* footer rhythm — baseline strip with the door */}
      <div style={{ borderTop: "1px solid rgba(251,246,236,.22)", marginTop: 9, paddingTop: 9, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <span style={{ background: T.creamOn, color: T.ink, borderRadius: 999, padding: "6px 13px", fontFamily: T.m, fontWeight: 700, fontSize: 13, letterSpacing: "0.1em", textTransform: "uppercase" }}>Go catch ▸</span>
        <span style={{ fontFamily: T.body, fontSize: 12.5, color: "rgba(251,246,236,.8)" }}>or upload a photo</span>
      </div>
    </button>
  );
}

function Overlay({ children, onClose, label, closeDisabled = false }: { children: React.ReactNode; onClose: () => void; label: string; closeDisabled?: boolean }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const closeDisabledRef = useRef(closeDisabled);

  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => { closeDisabledRef.current = closeDisabled; }, [closeDisabled]);
  useEffect(() => {
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusTimer = window.setTimeout(() => panelRef.current?.querySelector<HTMLElement>("button:not([disabled])")?.focus(), 0);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !closeDisabledRef.current) {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      const target = returnFocusRef.current;
      requestAnimationFrame(() => target?.focus());
    };
  }, []);

  return (
    <div
      onMouseDown={(event) => { if (event.target === event.currentTarget && !closeDisabled) onClose(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(24,16,8,.44)", backdropFilter: "blur(3px)", padding: 20, overflowY: "auto",
        animation: "edScrimIn 160ms ease both",
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        aria-busy={closeDisabled}
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          position: "relative", background: T.field, borderRadius: 24, border: `1px solid ${T.hair}`, padding: "34px 26px 28px", maxWidth: 600, width: "100%", boxShadow: "var(--ed-shadow-card)",
          animation: "edPanelIn 260ms cubic-bezier(.2,.8,.2,1) both",
        }}
      >
        <button type="button" onClick={onClose} disabled={closeDisabled} aria-label={`Close ${label}`} style={{
          position: "absolute", top: 14, right: 14, width: 30, height: 30, borderRadius: "50%",
          border: `1px solid ${T.hair}`, background: T.paper, color: T.ink, cursor: "pointer",
          fontFamily: T.body, fontSize: 16, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center",
        }}>×</button>
        {children}
      </div>
    </div>
  );
}

/** One rarity dot + count that ticks up to its REAL value (honesty-safe). */
function RarityCount({ rarity, n }: { rarity: Rarity; n: number }) {
  const v = useCountUp(n, 600);
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontFamily: T.m, fontSize: 13, fontWeight: 700, color: T.muted2, fontVariantNumeric: "tabular-nums" }}>
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: rarityColor(rarity), display: "inline-block" }} />{v}
    </span>
  );
}

/** Actions wired into the 4-verb mission strip — each verb card is a DOOR
 *  (jump to adopt / battle tab / share the top card / scroll to Next grade),
 *  not a paragraph. Omitted on guest/loading shells → cards render static. */
type VerbActions = Partial<Record<"collect" | "battle" | "share" | "grade", (() => void) | undefined>>;

function Shell({ children, owned, rarityCounts, verbs }: { children: React.ReactNode; owned: number; rarityCounts?: Record<string, number>; verbs?: VerbActions }) {
  const ownedC = useCountUp(owned, 600);
  return (
    <div style={{ position: "relative", fontFamily: T.body, color: T.ink }}>
      {/* Album grid columns on phones — applies to the skeleton state too
          (this Shell wraps every early return). */}
      <style>{`
        @media (max-width: 560px){ .cd-album-grid{ grid-template-columns:repeat(auto-fill,minmax(150px,1fr)) !important; gap:12px !important; } }
        @media (max-width: 340px){ .cd-album-grid{ grid-template-columns:1fr !important; } }
      `}</style>
      <div className="ed-grain" /><div className="ed-glow" /><div className="ed-vignette" />
      <div style={{ position: "relative", zIndex: 2, maxWidth: 1060, margin: "0 auto", padding: "8px 0 48px" }}>
        <div style={{ marginBottom: 22 }}>
          <div style={{ fontFamily: T.m, fontSize: 13, fontWeight: 700, letterSpacing: "0.14em", color: T.terra, textTransform: "uppercase" }}>Field Album · Gotta Catch The Real Ones</div>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 16, marginTop: 8 }}>
            <div>
              <h1 style={{ fontFamily: T.disp, fontSize: 46, fontWeight: 800, color: T.ink, margin: 0, letterSpacing: "-0.02em", lineHeight: 1.02 }}>Your collection</h1>
              {/* What this page IS, in one line — every pet you raise doubles as a
                  real trading card, not a cosmetic skin. Answers "what am I looking
                  at" for a first-time desktop visitor before the tri-step below. */}
              <p style={{ fontFamily: T.body, fontSize: 15, color: T.muted2, margin: "8px 0 0", maxWidth: 560, lineHeight: 1.55 }}>
                Every pet you raise is also a <strong style={{ color: T.ink }}>collectible trading card</strong> — real stats and rarity graded from actual care, not chance. Turn one into an illustrated Codex sticker, duel it against another collector&apos;s card, or share your best pulls.
              </p>
            </div>
            {/* HONEST progress — the REAL owned count. No fabricated denominator,
                because a card is minted from a pet you own (no fixed universe). */}
            <div style={{ minWidth: 220, textAlign: "right" }}>
              <div style={{ fontFamily: T.disp, fontSize: 20, fontWeight: 800, color: T.ink, fontVariantNumeric: "tabular-nums" }}>
                {ownedC} <span style={{ fontFamily: T.m, fontSize: 13, fontWeight: 700, letterSpacing: "0.12em", color: T.muted, textTransform: "uppercase" }}>{owned === 1 ? "card collected" : "cards collected"}</span>
              </div>
              {owned > 0 && rarityCounts && (
                <div style={{ display: "inline-flex", gap: 12, marginTop: 8, justifyContent: "flex-end" }}>
                  {RARITY_ORDER.filter((r) => r !== "Uncommon").map((r) => (
                    <RarityCount key={r} rarity={r} n={r === "Common" ? (rarityCounts.Common || 0) : (rarityCounts[r] || 0)} />
                  ))}
                </div>
              )}
            </div>
          </div>
          {/* hairline rule under the title */}
          <div style={{ height: 1, background: T.hair, margin: "16px 0 0" }} />
          {/* WHAT CARDS ARE FOR — the page's mission strip: four verbs, each
              stating its real mission AND (where one exists) its REAL reward.
              Point figures are the server's actual grants, verified in code:
              /api/card/battle → awardPointsCapped(…, 5, cap 40/day);
              /api/catch → CATCH_POINTS 10–80 by rarity (cap 300/day).
              Never print a number the server doesn't pay. */}
          <div className="cd-explain-row" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginTop: 14 }}>
            <style>{`
              @media (max-width: 900px){ .cd-explain-row{ grid-template-columns: repeat(2, 1fr) !important; } }
              @media (max-width: 520px){ .cd-explain-row{ grid-template-columns: 1fr !important; } }
              .cd-explain-card{ transition: transform .16s var(--ed-ease,cubic-bezier(.16,1,.3,1)), border-color .16s ease, box-shadow .16s ease; }
              @media (hover:hover){ .cd-explain-card:hover{ transform: translateY(-3px); border-color: rgba(190,79,40,.4); box-shadow: var(--ed-shadow-card); } }
            `}</style>
            {([
              { k: "collect", n: "01", title: "Collect", body: "Every pet you raise becomes a card automatically — no packs, no purchases. Caught animals fill the Field Guide in Catch.", chip: null, act: "Adopt a pet ▸" },
              { k: "battle", n: "02", title: "Battle", body: "Duel any collector's card free — caught fighters brawl in Alley Clash too.", chip: "+5 season pts a duel · cap 40/day", act: "Open Battle ▸" },
              { k: "share", n: "03", title: "Share", body: "Each card is its own page — send the link anywhere. Public only if you opt your pet in.", chip: null, act: "Share your top card ▸" },
              { k: "grade", n: "04", title: "Grade", body: "Rarity and stats read from real care — level, bond, streak, ATK·DEF·SPD. No chance.", chip: null, act: "See next grade ▸" },
            ] as Array<{ k: "collect" | "battle" | "share" | "grade"; n: string; title: string; body: string; chip: string | null; act: string }>).map((s) => {
              const onAct = verbs?.[s.k];
              const cardStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 7, background: T.paper, border: `1px solid ${T.hair}`, borderRadius: 12, padding: "11px 13px" };
              const inner = (
                <>
                  <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                    <span style={{ fontFamily: T.m, fontSize: 13, fontWeight: 700, color: T.terra, letterSpacing: ".08em", flexShrink: 0, marginTop: 1 }}>{s.n}</span>
                    <span style={{ fontFamily: T.body, fontSize: 13.5, lineHeight: 1.45, color: T.muted2 }}>
                      <strong style={{ color: T.ink, fontFamily: T.disp }}>{s.title}</strong> — {s.body}
                    </span>
                  </div>
                  {s.chip && (
                    /* Standard editorial chip — ink on a soft terracotta tint with a
                       border (never a saturated orange slab). Figure stays the
                       server's REAL grant. */
                    <span style={{ alignSelf: "flex-start", marginLeft: 23, fontFamily: T.m, fontSize: 12.5, fontWeight: 700, letterSpacing: ".05em", color: T.ink, background: "rgba(190,79,40,.12)", border: "1px solid rgba(190,79,40,.38)", borderRadius: 999, padding: "3px 10px", fontVariantNumeric: "tabular-nums" }}>{s.chip}</span>
                  )}
                  {onAct && (
                    <span style={{ marginTop: "auto", marginLeft: 23, fontFamily: T.m, fontSize: 13, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: T.terraSub }}>{s.act}</span>
                  )}
                </>
              );
              return onAct ? (
                <button type="button" key={s.n} onClick={onAct} className="cd-explain-card" style={{ ...cardStyle, font: "inherit", textAlign: "left", cursor: "pointer", width: "100%", margin: 0 }}>{inner}</button>
              ) : (
                <div key={s.n} className="cd-explain-card" style={cardStyle}>{inner}</div>
              );
            })}
          </div>
          {/* Non-financial loyalty framing; no dates/countdowns — Season 1 is
              unscheduled (SEASON_SCHEDULED gate), pre-season points carry in. */}
          <p style={{ fontFamily: T.body, fontSize: 13, color: T.muted2, margin: "8px 0 0" }}>
            Season points are non-financial Season Rewards — points you earn now carry into Season 1.
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
