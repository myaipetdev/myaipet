"use client";

/**
 * My Pet — Collectible Editorial. The pet's home base, laid out like a premium
 * editorial print piece: a terracotta collector's poster holding the framed
 * collectible (CollectibleFrame) and a status/care column. Care actions use a
 * direct fetch so the real server payload surfaces: the pet's reply, +PTS,
 * stat-delta pops, combos, level-ups, streak NFTs — and real errors (cooldown,
 * gates) plus the 402 USDT paywall. The dashed "REMEMBERS" box is wired to the
 * live pending-request + memories endpoints. Zero fabricated numbers — every
 * value rendered comes from a real API payload; empty/error states are honest.
 * Falls back to the existing PetProfile for onboarding when the user has no pet
 * yet; classic tools (Wardrobe · Memories · Evolution) open in a paper modal.
 */

import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { api, getAuthHeaders } from "@/lib/api";
import Reveal from "@/components/Reveal";
import CollectibleFrame, { Motes } from "@/components/editorial/CollectibleFrame";
import PaywallModal, { type PaywallInfo } from "@/components/PaywallModal";
import useCountUp from "@/hooks/useCountUp";
import { CODEX_VARIANTS } from "@/lib/codex";

const PetProfile = lazy(() => import("@/components/PetProfile"));

type Pet = {
  id: number; name: string; level: number; element?: string; species?: number;
  happiness?: number; energy?: number; hunger?: number; bond_level?: number;
  experience?: number; created_at?: string;
  avatar_url?: string | null; codex_url?: string | null; evolution_name?: string | null; species_name?: string | null;
};

type CareFlash = { id: number; text: string; error?: boolean; pts?: number; levelUp?: boolean; fulfilled?: boolean };
type StatPop = { id: number; delta: number };
type PetMemory = { id?: number; content: string; memory_type?: string; importance?: number; created_at: string };
type PetRequest = { type: string; message?: string; expiresAt?: string; reward?: { happiness?: number; bond?: number; exp?: number } };
type ComboToast = { id: number; name: string; description: string; emoji?: string };

const T = {
  field: "#ECE4D4", paper: "#FBF6EC", ink: "#211A12", ink70: "#3A3024", muted: "#7A6E5A", muted2: "#5C5140",
  mono: "#9A7B4E", hair: "rgba(33,26,18,.13)", terra: "#BE4F28", creamOn: "#FCE9CF",
  happy: "#F0589E", energy: "#3E8FE0", bond: "#9E72E8", thrive: "#5C8A4E", gold: "#C8932F",
  disp: "var(--ed-disp)", body: "var(--ed-body)", m: "var(--ed-m)",
};

// Status → dot/word color + a one-line care hint for needy states.
const STATUS_META: Record<string, { color: string; hint?: string }> = {
  "THRIVING": { color: "#5C8A4E" },
  "DOING WELL": { color: "#3E8FE0" },
  "RESTING": { color: "#C8932F", hint: "low energy — Feed and Pet restore it" },
  "WANTS YOU": { color: "#BE4F28", hint: "feed or play to cheer them up" },
};

function relTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "JUST NOW";
  const min = Math.floor(ms / 60000);
  if (min < 1) return "JUST NOW";
  if (min < 60) return `${min} MIN AGO`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} HOUR${h === 1 ? "" : "S"} AGO`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} DAY${d === 1 ? "" : "S"} AGO`;
  const mo = Math.floor(d / 30);
  return `${mo} MONTH${mo === 1 ? "" : "S"} AGO`;
}

function StatRow({ label, value, pct, color, warning, pop }: {
  label: string; value: number; pct: number; color: string; warning?: string | null; pop?: StatPop | null;
}) {
  const shown = useCountUp(Math.round(value), 600);
  return (
    <div style={{ marginTop: 16, position: "relative" }}>
      {pop && (
        <span key={pop.id} aria-hidden style={{
          position: "absolute", right: 0, top: -8, fontFamily: T.m, fontSize: 13, fontWeight: 700,
          color, animation: "mpDeltaRise .8s ease-out both", pointerEvents: "none",
        }}>{pop.delta > 0 ? "+" : ""}{pop.delta}</span>
      )}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: T.muted2 }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: color }} />{label}
        </span>
        <span style={{ fontFamily: T.disp, fontWeight: 700, fontSize: 24 }}>{shown}</span>
      </div>
      <div style={{ height: 3, borderRadius: 2, background: "rgba(33,26,18,.1)", marginTop: 7, overflow: "hidden" }}>
        <div style={{ height: "100%", borderRadius: 2, width: `${Math.max(0, Math.min(100, pct))}%`, background: color, transition: "width .6s ease" }} />
      </div>
      {warning && (
        <div style={{ marginTop: 5, fontFamily: T.m, fontSize: 13, fontWeight: 700, letterSpacing: ".06em", color: T.terra }}>{warning}</div>
      )}
    </div>
  );
}

const CareIcon = ({ d }: { d: string }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={T.ink70} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ display: "block", margin: "0 auto 5px" }}>{<path d={d} />}</svg>
);

function CareTile({ label, icon, onClick, busy }: { label: string; icon: React.ReactNode; onClick: () => void; busy?: boolean }) {
  return (
    <button onClick={onClick} disabled={busy} className="mp-caretile" style={{
      flex: 1, background: "#FCE9CF", border: "1px solid rgba(190,79,40,0.22)", borderRadius: 14,
      padding: "13px 6px", textAlign: "center", cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1,
      fontFamily: T.body,
    }}>
      {icon}
      <span style={{ fontSize: 13, fontWeight: 600, color: T.ink70 }}>{label}</span>
    </button>
  );
}

export default function MyPetEditorial({ onNavigate }: { onNavigate?: (section: string) => void }) {
  const [pets, setPets] = useState<Pet[] | null>(null);
  const [petSlots, setPetSlots] = useState(1);
  const [loadError, setLoadError] = useState(false);
  const [active, setActive] = useState<Pet | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [flash, setFlash] = useState<CareFlash | null>(null);
  const [pops, setPops] = useState<Record<string, StatPop>>({});
  const [combo, setCombo] = useState<ComboToast | null>(null);
  const [streakMint, setStreakMint] = useState<{ id: number; days: number } | null>(null);
  const [lvPop, setLvPop] = useState(0);            // increments on level-up → frame/seal pop
  const [reqGlow, setReqGlow] = useState(0);         // increments on request_fulfilled → box pulse
  const [request, setRequest] = useState<PetRequest | null>(null);
  const [memory, setMemory] = useState<PetMemory | null>(null);
  const [memoryLoaded, setMemoryLoaded] = useState(false);
  const [paywall, setPaywall] = useState<PaywallInfo | null>(null);
  const [showClassic, setShowClassic] = useState<null | "tools" | "create">(null);
  const [codexBusy, setCodexBusy] = useState(false);
  const [showPhoto, setShowPhoto] = useState(false); // hero toggle: prefer codex, flip to raw photo
  const [codexVariant, setCodexVariant] = useState(CODEX_VARIANTS[0].key); // which 띠부씰 look to generate

  const activeIdRef = useRef<number | null>(null);
  useEffect(() => { activeIdRef.current = active?.id ?? null; }, [active?.id]);

  const seq = useRef(0);
  const timers = useRef<number[]>([]);
  const later = useCallback((fn: () => void, ms: number) => {
    if (typeof window === "undefined") return;
    timers.current.push(window.setTimeout(fn, ms));
  }, []);
  useEffect(() => () => { timers.current.forEach((t) => clearTimeout(t)); }, []);

  const showFlash = useCallback((f: Omit<CareFlash, "id">) => {
    const id = ++seq.current;
    setFlash({ id, ...f });
    later(() => setFlash((cur) => (cur && cur.id === id ? null : cur)), 3600);
  }, [later]);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const data: any = await api.pets.list();
      const list: Pet[] = data?.pets || [];
      setPets(list);
      if (typeof data?.pet_slots === "number") setPetSlots(data.pet_slots);
      setActive((prev) => (prev ? list.find((p) => p.id === prev.id) || list[0] || null : list[0] || null));
    } catch {
      // Honest failure: keep whatever we had, never dump an existing owner into
      // the create-a-pet onboarding on a network blip (duplicate-pet risk).
      setLoadError(true);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  // ── Live pending request (GET /interact) — feeds the REMEMBERS file-record box ──
  useEffect(() => {
    const id = active?.id;
    if (!id) return;
    let cancelled = false;
    setRequest(null);
    fetch(`/api/pets/${id}/interact`, { headers: getAuthHeaders() })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled && d) setRequest(d.request || null); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [active?.id]);

  // ── Latest real memory — only real content, no fabricated fallback ──
  useEffect(() => {
    const id = active?.id;
    if (!id) return;
    let cancelled = false;
    setMemory(null);
    setMemoryLoaded(false);
    (async () => {
      try {
        const d: any = await api.pets.memories(id);
        if (cancelled) return;
        const list: PetMemory[] = d?.memories || d?.items || [];
        const first = list.find((m) => m && m.content);
        setMemory(first || null);
        setMemoryLoaded(true); // loaded — genuinely empty list may fall back to the invite copy
      } catch { /* fetch failed → stay unloaded, render nothing rather than lie */ }
    })();
    return () => { cancelled = true; };
  }, [active?.id]);

  const switchPet = (p: Pet) => {
    if (active?.id === p.id) return;
    setActive(p);
    // clear per-pet transient UI so pet A's celebration never paints pet B
    setFlash(null); setPops({}); setCombo(null); setStreakMint(null); setShowPhoto(false);
  };

  // ── Codex sticker: generate the pet's collectible-creature illustration
  //    (Studio style 6). The server pins it to pet.codex_url, so the card + this
  //    hero switch to it. Costs 5 credits; 402 = not enough credits (honest). ──
  const illustrateCodex = async () => {
    if (!active || codexBusy) return;
    const petId = active.id;
    const petName = active.name;
    setCodexBusy(true);
    try {
      const res = await fetch(`/api/pets/${petId}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ type: "image", style: 6, codexVariant }),
      });
      if (res.status === 402) {
        if (activeIdRef.current === petId) showFlash({ text: `Not enough credits — ${petName}'s Codex needs 5. Add credits and try again.`, error: true });
      } else if (!res.ok) {
        const j = await res.json().catch(() => ({} as any));
        throw new Error(j.error || j.details || `Couldn't illustrate (${res.status})`);
      } else {
        const j = await res.json();
        if (j?.image_url && activeIdRef.current === petId) {
          const url = j.image_url as string;
          setActive((prev) => (prev && prev.id === petId ? { ...prev, codex_url: url } : prev));
          setPets((prev) => (prev ? prev.map((p) => (p.id === petId ? { ...p, codex_url: url } : p)) : prev));
          setShowPhoto(false);
          showFlash({ text: `${petName}'s Codex sticker is ready — it's on your card now.` });
        }
      }
    } catch (e: any) {
      if (activeIdRef.current === petId) {
        const msg = e?.message && !/failed to fetch|networkerror|load failed/i.test(e.message)
          ? e.message : "Couldn't reach the server — try again in a moment.";
        showFlash({ text: msg, error: true });
      }
    }
    setCodexBusy(false);
  };

  const care = async (type: "feed" | "play" | "pet") => {
    if (!active || busy) return;
    const petId = active.id;
    setBusy(type);

    const finishCare = (r: any) => {
      if (activeIdRef.current !== petId) return; // pet switched mid-flight
      const it = r?.interaction || {};
      // pet reply + real points chip (+ level-up / fulfilled celebration chips)
      showFlash({
        text: it.response || "",
        pts: typeof it.points_earned === "number" && it.points_earned > 0 ? it.points_earned : undefined,
        levelUp: !!it.leveled_up,
        fulfilled: !!it.request_fulfilled,
      });
      // floating stat-delta pops over the matching rows (hunger shown as Fullness)
      const fx = it.effects || {};
      const now = Date.now();
      const next: Record<string, StatPop> = {};
      if (typeof fx.happiness === "number" && fx.happiness !== 0) next.happiness = { id: now, delta: fx.happiness };
      if (typeof fx.energy === "number" && fx.energy !== 0) next.energy = { id: now + 1, delta: fx.energy };
      if (typeof fx.hunger === "number" && fx.hunger !== 0) next.fullness = { id: now + 2, delta: -fx.hunger };
      if (typeof fx.bond === "number" && fx.bond !== 0) next.bond = { id: now + 3, delta: fx.bond };
      if (typeof fx.experience === "number" && fx.experience !== 0) next.experience = { id: now + 4, delta: fx.experience };
      if (Object.keys(next).length) {
        setPops(next);
        later(() => setPops((cur) => (cur === next ? {} : cur)), 950);
      }
      if (it.combo) {
        const id = ++seq.current;
        setCombo({ id, name: it.combo.name, description: it.combo.description, emoji: it.combo.emoji });
        later(() => setCombo((cur) => (cur && cur.id === id ? null : cur)), 4200);
      }
      if (it.leveled_up) setLvPop((n) => n + 1);
      if (it.care_streak?.mintedNft) {
        const id = ++seq.current;
        setStreakMint({ id, days: it.care_streak.days });
        later(() => setStreakMint((cur) => (cur && cur.id === id ? null : cur)), 9000);
      }
      if (it.request_fulfilled) setReqGlow((n) => n + 1);
      setRequest(it.next_request || null);
      // move the bars without a reload — the server row is canonical
      if (r?.pet) {
        setActive((prev) => (prev && prev.id === petId ? { ...prev, ...r.pet } : prev));
        setPets((prev) => (prev ? prev.map((p) => (p.id === petId ? { ...p, ...r.pet } : p)) : prev));
      }
    };

    // Direct fetch (not api.pets.interact): the wrapper throws on non-2xx and
    // loses the 402 paywall payload + real server messages.
    const callInteract = async (txHash?: string): Promise<any | null> => {
      const qs = txHash ? `?tx_hash=${txHash}` : "";
      const res = await fetch(`/api/pets/${petId}/interact${qs}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ interaction_type: type }),
      });
      if (res.status === 402) {
        const j = await res.json().catch(() => ({} as any));
        if (j?.paywall) {
          // USDT overflow purchase path — retry the same action once paid
          setPaywall({
            ...j.paywall,
            onPaid: async (newTx: string) => {
              setPaywall(null);
              setBusy(type);  // keep Feed/Play/Pet locked through the paid retry (no double-submit)
              try {
                const retry = await callInteract(newTx);
                if (retry) finishCare(retry);
              } catch (e: any) {
                if (activeIdRef.current === petId) showFlash({ text: e?.message || "Try again in a moment.", error: true });
              } finally {
                setBusy(null);
              }
            },
          });
        } else if (activeIdRef.current === petId) {
          showFlash({ text: j?.error || "Payment required.", error: true });
        }
        return null;
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({} as any));
        throw new Error(err.error || err.details || `Interaction failed (${res.status})`);
      }
      return res.json();
    };

    try {
      const r = await callInteract();
      if (r) finishCare(r);
    } catch (e: any) {
      if (activeIdRef.current === petId) {
        const msg = e?.message && !/failed to fetch|networkerror|load failed/i.test(e.message)
          ? e.message
          : "Couldn't reach the server — try again in a moment.";
        showFlash({ text: msg, error: true });
      }
    }
    setBusy(null);
  };

  if (pets === null) {
    if (loadError) {
      return (
        <div style={{ paddingTop: 140, textAlign: "center", fontFamily: T.body, color: T.ink }}>
          <div style={{ fontFamily: T.disp, fontWeight: 700, fontSize: 22 }}>Couldn&apos;t reach your pet</div>
          <p style={{ fontSize: 14, color: T.muted2, margin: "8px auto 20px", maxWidth: 340, lineHeight: 1.5 }}>
            The connection failed — your pet is safe. Try again.
          </p>
          <button onClick={load} style={{
            border: "none", cursor: "pointer", background: "linear-gradient(180deg,#F49B2A,#E27D0C)", color: "#FFF8EE",
            fontFamily: T.disp, fontWeight: 700, fontSize: 14, borderRadius: 12, padding: "11px 28px",
            boxShadow: "var(--ed-shadow-card)",
          }}>Retry</button>
        </div>
      );
    }
    return <div style={{ paddingTop: 120, textAlign: "center", fontFamily: T.m, color: T.muted }}>Loading your pet…</div>;
  }
  if (!active) {
    // Genuinely empty pets array — real onboarding, not an error disguise.
    return <Suspense fallback={null}><PetProfile /></Suspense>;
  }

  const happy = active.happiness ?? 0, energy = active.energy ?? 0, hunger = active.hunger ?? 0, bond = active.bond_level ?? 0;
  const status = happy >= 80 && energy >= 50 && hunger < 40 ? "THRIVING" : energy < 20 ? "RESTING" : happy < 30 ? "WANTS YOU" : "DOING WELL";
  const statusMeta = STATUS_META[status] || STATUS_META["DOING WELL"];
  const photo = active.avatar_url || "/mascot.jpg";
  const codexUrl = active.codex_url || null;
  // Hero prefers the Codex sticker illustration when it exists (the whole point),
  // with a photo/sticker toggle; falls back to the real photo otherwise.
  const heroArt = codexUrl && !showPhoto ? codexUrl : photo;
  const selVariant = CODEX_VARIANTS.find((v) => v.key === codexVariant) ?? CODEX_VARIANTS[0];
  const species = active.evolution_name || active.species_name || "Companion";
  const element = (active.element || "normal").toUpperCase();
  const estYearRaw = active.created_at ? new Date(active.created_at).getFullYear() : null;
  const estYear = estYearRaw !== null && Number.isFinite(estYearRaw) ? estYearRaw : null;
  const xp = typeof active.experience === "number" ? active.experience : null;
  const reqBonus = request?.reward
    ? [request.reward.happiness ? `+${request.reward.happiness} HAPPY` : null,
       request.reward.bond ? `+${request.reward.bond} BOND` : null,
       request.reward.exp ? `+${request.reward.exp} XP` : null].filter(Boolean).join(" ")
    : "";
  const showMemoryBox = !!(request?.type || memoryLoaded);
  // Fixed per-slot mount delays for the FIRST-VIEWPORT cards only (chips → care).
  // Lower cards now scroll-reveal via <Reveal> with equally static delays, so a
  // late-mounting card (memory box after fetch) never shifts its siblings.
  const rise = (slot: number) => ({ animationDelay: `${slot * 70}ms` });

  const closeClassic = () => { setShowClassic(null); load(); };

  return (
    <div style={{ position: "relative", fontFamily: T.body, color: T.ink, paddingTop: 78 }}>
      <div className="ed-grain" /><div className="ed-glow" /><div className="ed-vignette" />
      <div style={{ position: "relative", zIndex: 2, maxWidth: 1200, margin: "0 auto", padding: "8px 24px 48px" }}>
        <div className="mp-grid" style={{ display: "grid", gridTemplateColumns: "1.02fr 1fr", gap: 24, alignItems: "start" }}>
          <style>{`
            @media (max-width: 880px) {
              .mp-grid { grid-template-columns: 1fr !important; }
              /* On 1-col mobile the poster must scroll normally above the stats —
                 a sticky poster would pin at top:88 and cover the right column
                 as it scrolls past. Drop sticky + the desktop max-height clamp. */
              .mp-poster-wrap { position: static !important; height: auto !important; }
              .mp-poster-wrap > div { max-height: none !important; }
            }
            @keyframes mpDeltaRise { 0% { opacity: 0; transform: translateY(3px); } 18% { opacity: 1; } 100% { opacity: 0; transform: translateY(-16px); } }
            @keyframes mpSealPopA { 0% { transform: scale(1); } 35% { transform: scale(1.045); } 100% { transform: scale(1); } }
            @keyframes mpSealPopB { 0% { transform: scale(1); } 35% { transform: scale(1.045); } 100% { transform: scale(1); } }
            @keyframes mpReqPulseA { 0% { background-color: rgba(190,79,40,.16); } 100% { background-color: rgba(255,250,235,.5); } }
            @keyframes mpReqPulseB { 0% { background-color: rgba(190,79,40,.16); } 100% { background-color: rgba(255,250,235,.5); } }
            /* fly-in: the framed collectible drops onto the mat and settles once —
               ONE clear move (600ms spring-out, 120ms lead so the terracotta mat's
               .ed-rise lands first). Composes with the child .ed-float bob + lvPop
               because it lives on its own wrapper element; blanket reduced-motion
               rule neutralizes it. */
            @keyframes mpCardFlyIn { 0% { opacity: 0; transform: translateY(-42px) scale(.92) rotate(-5deg); } 60% { opacity: 1; transform: translateY(5px) scale(1.015) rotate(.5deg); } 100% { opacity: 1; transform: translateY(0) scale(1) rotate(0); } }
            .mp-flyin { animation: mpCardFlyIn .6s cubic-bezier(.2,.85,.25,1) .12s both; will-change: transform, opacity; }
            .mp-caretile { box-shadow: 0 10px 22px -18px rgba(190,79,40,.55); transition: transform .16s cubic-bezier(.2,.8,.2,1), box-shadow .16s ease; }
            @media (hover: hover) { .mp-caretile:hover:not(:disabled) { transform: translateY(-2px); box-shadow: var(--ed-shadow-float); } }
            .mp-caretile:active:not(:disabled) { transform: scale(.97); }
          `}</style>

          {/* ── poster (left) — a sticky, content-height sidebar. It is exactly as
                 tall as card + MEET + name (no viewport stretch), so the collectible
                 never floats in a sea of empty terracotta; it pins at top:88 and
                 stays visible while the taller right column scrolls past — the
                 canonical short-sticky-sidebar pattern. Keyed on the pet so both the
                 mat (.ed-rise) and the collectible (.mp-flyin) replay on switch.
                 maxHeight + overflow:hidden are a pure clamp for the rare very-tall
                 case (long name / short viewport). Mobile (<=880px) drops sticky. ── */}
          <div className="mp-poster-wrap" style={{ position: "sticky", top: 88, alignSelf: "start" }}>
            <div key={active.id} className="ed-rise" style={{ position: "relative", background: T.terra, borderRadius: 18, minHeight: "min(calc(100vh - 200px), 620px)", maxHeight: "calc(100vh - 116px)", overflow: "hidden", display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div aria-hidden style={{ position: "absolute", inset: 14, border: "1px solid rgba(252,233,207,.35)", borderRadius: 8, pointerEvents: "none" }} />
              {[["14px", "14px", "", ""], ["14px", "", "", "14px"], ["", "14px", "14px", ""], ["", "", "14px", "14px"]].map((c, i) => (
                <span key={i} aria-hidden style={{ position: "absolute", top: c[0] || undefined, left: c[1] || undefined, bottom: c[2] || undefined, right: c[3] || undefined, width: 11, height: 11,
                  backgroundImage: "linear-gradient(rgba(252,233,207,.7),rgba(252,233,207,.7)),linear-gradient(rgba(252,233,207,.7),rgba(252,233,207,.7))",
                  backgroundSize: "1px 11px,11px 1px", backgroundPosition: "center,center", backgroundRepeat: "no-repeat" }} />
              ))}
              <div style={{ position: "absolute", top: 26, left: 28, right: 28, display: "flex", justifyContent: "space-between", alignItems: "flex-start", zIndex: 3 }}>
                <div style={{ fontFamily: T.m, fontSize: 13, fontWeight: 700, letterSpacing: ".06em", color: T.creamOn, whiteSpace: "nowrap" }}>COMPANION PROTOCOL</div>
                <div style={{ textAlign: "right", fontFamily: T.m, fontSize: 13, fontWeight: 700, letterSpacing: ".1em", color: T.creamOn }}>
                  FILE № {String(active.id).padStart(4, "0")}
                  <div style={{ height: 22, width: 96, margin: "5px 0 4px auto", background: "repeating-linear-gradient(90deg,#FCE9CF 0 1px,transparent 1px 3px,#FCE9CF 3px 5px,transparent 5px 6px,#FCE9CF 6px 9px,transparent 9px 11px)" }} />
                  {estYear !== null && (
                    <span title={new Date(active.created_at as string).toLocaleDateString()}>EST. {estYear}</span>
                  )}
                </div>
              </div>
              <div style={{ position: "absolute", left: -2, top: "50%", transform: "rotate(-90deg) translateX(50%)", transformOrigin: "left center", fontFamily: T.m, fontSize: 13, fontWeight: 700, letterSpacing: ".18em", color: "rgba(252,233,207,.55)", whiteSpace: "nowrap" }}>
                ★ {element} · LV.{String(active.level).padStart(2, "0")}
              </div>
              <div aria-hidden style={{ position: "absolute", top: -40, right: 6, fontFamily: T.disp, fontWeight: 800, fontSize: 132, lineHeight: 1, color: "rgba(255,255,255,.08)", zIndex: 1, pointerEvents: "none" }}>{active.level}</div>

              {/* flow content — the frame + MEET + name stack snugly inside the
                  content-height poster, cleared from the absolute header (paddingTop)
                  and bottom ticker (paddingBottom). */}
              <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", width: "100%", zIndex: 2, paddingTop: 48, paddingBottom: 34 }}>
                <div style={{ position: "relative", zIndex: 2 }}>
                  <Motes />
                  {/* fly-in entrance: keyed to active.id so it replays when My Pet
                      opens AND on pet-switch remount. Nested OUTSIDE the lvPop pop so
                      the two one-shots live on separate elements and never fight over
                      the `animation` shorthand; it also composes with the child
                      .ed-float bob (transforms multiply down the chain). */}
                  <div key={active.id} className="mp-flyin">
                    {/* level-up: one-shot scale pop on the framed collectible (carries the gold seal) */}
                    <div style={{ animation: lvPop > 0 ? `${lvPop % 2 ? "mpSealPopA" : "mpSealPopB"} .7s cubic-bezier(.2,.8,.2,1)` : undefined }}>
                      <CollectibleFrame photoUrl={heroArt} level={active.level} speciesLabel={species.toUpperCase()} elementLabel={element} width={264} />
                    </div>
                  </div>
                </div>

                <div style={{ fontFamily: T.m, fontSize: 13, fontWeight: 700, letterSpacing: ".34em", color: T.creamOn, marginTop: 22, zIndex: 2 }}>MEET</div>
                <div className="ed-foil-text ed-foil-deboss" style={{ fontFamily: T.disp, fontWeight: 800, fontSize: "clamp(38px,4.6vw,64px)", lineHeight: 0.82, letterSpacing: "-.04em", zIndex: 2, maxWidth: "92%", textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{active.name}</div>
              </div>

              <div style={{ position: "absolute", bottom: 16, left: 0, right: 0, overflow: "hidden", zIndex: 2, WebkitMaskImage: "linear-gradient(90deg,transparent,#000 8%,#000 92%,transparent)" }}>
                <div style={{ display: "inline-flex", whiteSpace: "nowrap", animation: "edTickerSlide 18s linear infinite", fontFamily: T.m, fontSize: 13, fontWeight: 700, letterSpacing: ".18em", color: "rgba(252,233,207,.45)" }}>
                  {Array.from({ length: 4 }).map((_, i) => <span key={i} style={{ padding: "0 14px" }}>ADOPT · REMEMBER · OWN ·</span>)}
                </div>
              </div>
            </div>
          </div>

          {/* ── right column: pets · identity · status · care · memory · chat · studio · catch ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {/* pet switcher — above the fold, beside the identity chips */}
            {(pets.length > 1 || pets.length < petSlots) && (
              <div className="ed-rise" style={{ ...rise(1), display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ fontFamily: T.m, fontSize: 13, letterSpacing: ".12em", color: T.mono, textTransform: "uppercase" }}>Your pets</span>
                {pets.map((p) => (
                  <button key={p.id} onClick={() => switchPet(p)} style={{
                    fontFamily: T.body, fontWeight: 600, fontSize: 13, padding: "6px 14px", borderRadius: 999, cursor: "pointer",
                    border: p.id === active.id ? `1.5px solid ${T.ink}` : `1px solid ${T.hair}`,
                    background: p.id === active.id ? T.ink : T.paper, color: p.id === active.id ? T.paper : T.ink70,
                  }}>{p.name} · Lv {p.level}</button>
                ))}
                {pets.length < petSlots && (
                  <button onClick={() => setShowClassic("create")} className="ed-wipe" style={{
                    fontFamily: T.body, fontWeight: 600, fontSize: 13, padding: "6px 14px", borderRadius: 999, cursor: "pointer",
                    border: "1.5px dashed rgba(154,78,30,.45)", background: "transparent", color: "#9A4E1E",
                  }}>+ Adopt</button>
                )}
              </div>
            )}

            {/* identity chips */}
            <div className="ed-rise" style={{ ...rise(2), display: "flex", gap: 7, flexWrap: "wrap" }}>
              {[`LV.${String(active.level).padStart(2, "0")}`, species.toUpperCase(), element.toUpperCase()].map((t) => (
                <span key={t} style={{ fontFamily: T.m, fontSize: 13, fontWeight: 700, letterSpacing: ".1em", color: "#9A4E1E", background: T.paper, border: `1px solid ${T.hair}`, borderRadius: 9, padding: "5px 11px" }}>{t}</span>
              ))}
            </div>

            {/* XP progress — real experience from pets.list; pairs with the level-up pop */}
            {xp !== null && (
              <div className="ed-rise" style={{ ...rise(3), position: "relative", background: T.paper, border: `1px solid ${T.hair}`, borderRadius: 12, padding: "9px 12px" }}>
                {pops.experience && (
                  <span key={pops.experience.id} aria-hidden style={{
                    position: "absolute", right: 12, top: -8, fontFamily: T.m, fontSize: 13, fontWeight: 700,
                    color: T.thrive, animation: "mpDeltaRise .8s ease-out both", pointerEvents: "none",
                  }}>+{pops.experience.delta}</span>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", fontFamily: T.m, fontSize: 13, fontWeight: 700, letterSpacing: ".1em", color: T.mono }}>
                  <span>LV.{active.level} · {xp % 100}/100 XP</span>
                  <span>NEXT: LV.{active.level + 1}</span>
                </div>
                <div style={{ height: 3, borderRadius: 2, background: "rgba(33,26,18,.1)", marginTop: 6, overflow: "hidden" }}>
                  <div style={{ height: "100%", borderRadius: 2, width: `${xp % 100}%`, background: T.thrive, transition: "width .6s ease" }} />
                </div>
              </div>
            )}

            {/* status */}
            <div className="ed-rise" style={{ ...rise(4), background: T.paper, borderRadius: 22, padding: 20, boxShadow: "var(--ed-shadow-card)" }}>
              <div style={{ fontFamily: T.m, fontWeight: 700, fontSize: 13, letterSpacing: ".14em", color: T.mono, textTransform: "uppercase" }}>Status</div>
              <div style={{ display: "flex", alignItems: "center", gap: 7, fontFamily: T.disp, fontWeight: 700, fontSize: 15, marginTop: 6, color: statusMeta.color }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: statusMeta.color }} />{status}
              </div>
              {statusMeta.hint && (
                <div style={{ marginTop: 4, fontSize: 13, color: T.muted2 }}>{statusMeta.hint}</div>
              )}
              <StatRow label="Happy" value={happy} pct={happy} color={T.happy} pop={pops.happiness} />
              <StatRow label="Energy" value={energy} pct={energy} color={T.energy} pop={pops.energy} />
              <StatRow label="Fullness" value={100 - hunger} pct={100 - hunger} color={T.gold}
                warning={hunger >= 80 ? "needs food — Play is blocked" : null} pop={pops.fullness} />
              <StatRow label="Bond" value={bond} pct={bond} color={T.bond} pop={pops.bond} />
            </div>

            {/* care */}
            <div className="ed-rise" style={{ ...rise(5), background: T.paper, borderRadius: 22, padding: 20, boxShadow: "var(--ed-shadow-card)" }}>
              <div style={{ fontFamily: T.m, fontWeight: 700, fontSize: 13, letterSpacing: ".14em", color: T.mono, textTransform: "uppercase" }}>Care</div>
              <div style={{ display: "flex", gap: 9, marginTop: 14 }}>
                <CareTile label="Feed" busy={!!busy} onClick={() => care("feed")} icon={<CareIcon d="M5 3v8a3 3 0 0 0 6 0V3M8 3v18M19 3c-1.5 0-3 2-3 5s1.5 4 3 4v9" />} />
                <CareTile label="Play" busy={!!busy} onClick={() => care("play")} icon={<CareIcon d="M6 12h4M8 10v4M15 11h.01M18 13h.01M7 7h10a4 4 0 0 1 4 4v1a4 4 0 0 1-7 2.8 3 3 0 0 1-4 0A4 4 0 0 1 3 12v-1a4 4 0 0 1 4-4Z" />} />
                <CareTile label="Pet" busy={!!busy} onClick={() => care("pet")} icon={<CareIcon d="M9 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM15 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM6 15a2 2 0 1 0 0-4M18 15a2 2 0 1 0 0-4M8.5 14c-1.5 1-2 2.2-2 3.4C6.5 18.8 7.7 20 9.2 20c1 0 1.6-.5 2.8-.5s1.8.5 2.8.5c1.5 0 2.7-1.2 2.7-2.6 0-1.2-.5-2.4-2-3.4" />} />
              </div>
              {flash && (
                <div key={flash.id} style={{ marginTop: 12, display: "flex", alignItems: "flex-start", gap: 8, flexWrap: "wrap", animation: "edRiseIn .3s cubic-bezier(.22,.9,.3,1) both" }}>
                  <span style={{ flex: "1 1 auto", minWidth: 0, fontSize: 13, color: flash.error ? T.terra : T.muted2, fontStyle: "italic", lineHeight: 1.4 }}>{flash.text}</span>
                  {flash.pts !== undefined && (
                    <span style={{ flexShrink: 0, fontFamily: T.m, fontSize: 13, fontWeight: 700, letterSpacing: ".08em", color: "#9A7B4E", border: "1px solid rgba(154,123,78,.35)", borderRadius: 8, padding: "3px 8px" }}>+{flash.pts} PTS</span>
                  )}
                  {flash.fulfilled && (
                    <span style={{ flexShrink: 0, fontFamily: T.m, fontSize: 13, fontWeight: 700, letterSpacing: ".08em", color: "#FFF8EE", background: T.terra, borderRadius: 8, padding: "3px 8px" }}>REQUEST FULFILLED</span>
                  )}
                  {flash.levelUp && (
                    <span style={{ flexShrink: 0, fontFamily: T.m, fontSize: 13, fontWeight: 700, letterSpacing: ".08em", color: "#5C3504", background: "linear-gradient(100deg,#FFF7E6,#F2CD86 50%,#E8B257)", borderRadius: 8, padding: "3px 8px" }}>LEVEL UP → LV.{active.level}</span>
                  )}
                </div>
              )}
              {streakMint && (
                <div key={streakMint.id} style={{ marginTop: 10, border: "1.5px solid rgba(200,147,47,.6)", background: "rgba(200,147,47,.08)", borderRadius: 12, padding: "10px 12px", animation: "edRiseIn .35s cubic-bezier(.22,.9,.3,1) both" }}>
                  <div style={{ fontFamily: T.m, fontSize: 13, fontWeight: 700, letterSpacing: ".12em", color: "#A9712B" }}>CARE STREAK · {streakMint.days} DAYS</div>
                  <div style={{ fontSize: 13, color: T.muted2, marginTop: 3, lineHeight: 1.45 }}>Care-streak milestone recorded in {active.name}&apos;s history — preserved with the pet.</div>
                </div>
              )}
            </div>

            {/* memory / live request — the file-record box, wired to real endpoints.
                Scroll-reveals from the right; the fulfill-pulse lives on the keyed
                inner div so it re-fires without re-running the entrance. */}
            {/* Reserve the box's collapsed footprint so the async request/memory
                fetch resolving after first paint doesn't shove the lower cards. */}
            <div style={{ minHeight: showMemoryBox ? undefined : 92 }}>
            {showMemoryBox && (
              <Reveal dir="right">
              <div key={`req-${reqGlow}`} style={{
                border: "1.5px dashed #E8C079", borderRadius: 16, padding: "15px 16px", background: "rgba(255,250,235,.5)",
                animation: reqGlow > 0 ? `${reqGlow % 2 ? "mpReqPulseA" : "mpReqPulseB"} 1.4s ease-out both` : undefined,
              }}>
                {request?.type && (
                  <div style={{ marginBottom: memoryLoaded ? 12 : 0 }}>
                    <div style={{ fontFamily: T.m, fontSize: 13, fontWeight: 700, letterSpacing: ".12em", color: "#A9712B" }}>
                      {active.name.toUpperCase()} ASKS: {String(request.type).toUpperCase()}{reqBonus ? ` · BONUS ${reqBonus}` : ""}
                    </div>
                    {request.message && (
                      <p style={{ fontStyle: "italic", fontSize: 13, color: T.muted2, marginTop: 6, lineHeight: 1.5 }}>&ldquo;{request.message}&rdquo;</p>
                    )}
                  </div>
                )}
                {memoryLoaded && (
                  <div>
                    <div style={{ fontFamily: T.m, fontSize: 13, fontWeight: 700, letterSpacing: ".12em", color: "#A9712B" }}>{active.name.toUpperCase()} REMEMBERS</div>
                    {memory ? (
                      <div key={memory.id ?? memory.created_at} className="ed-rise">
                        <p style={{ fontStyle: "italic", fontSize: 13, color: T.muted2, marginTop: 6, lineHeight: 1.5 }}>&ldquo;{memory.content}&rdquo;</p>
                        <div style={{ fontFamily: T.m, fontSize: 13, fontWeight: 700, letterSpacing: ".12em", color: T.mono, marginTop: 6 }}>{relTime(memory.created_at)}</div>
                      </div>
                    ) : (
                      <p style={{ fontStyle: "italic", fontSize: 13, color: T.muted2, marginTop: 6, lineHeight: 1.5 }}>Care for {active.name} and they&apos;ll remember it — your habits, your mood, the little things.</p>
                    )}
                  </div>
                )}
              </div>
              </Reveal>
            )}
            </div>

            {/* chat — primary companion action (scroll-reveal, fixed 90ms slots) */}
            <Reveal dir="right" delay={90}>
            <button onClick={() => onNavigate?.("chat")} className="ed-card-hover" style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, textAlign: "left", border: "none", cursor: "pointer", background: "linear-gradient(180deg,#F49B2A,#E27D0C)", borderRadius: 18, padding: "15px 18px", color: "#FFF8EE", boxShadow: "0 12px 24px -14px rgba(226,125,12,.7)" }}>
              <span>
                <span style={{ display: "block", fontFamily: T.disp, fontWeight: 800, fontSize: 17 }}>Chat with {active.name}</span>
                <span style={{ display: "block", fontFamily: T.body, fontSize: 13, color: "#FCE9CF", marginTop: 2 }}>Talk live — every chat grows your Bond.</span>
              </span>
              <span style={{ fontSize: 20, flexShrink: 0 }}>→</span>
            </button>
            </Reveal>

            {/* codex sticker — turn the pet into a numbered collectible creature.
                Warm-dark panel, foil-gold headline. Generate (5 credits) → server
                pins pet.codex_url → hero + card switch to the illustration. When it
                exists: photo/sticker toggle + a jump to the card. */}
            <Reveal dir="right" delay={135}>
            <div style={{ background: "#1E1710", border: "1px solid rgba(200,147,47,.5)", borderRadius: 18, padding: 18, color: "rgba(251,246,236,.8)", boxShadow: "var(--ed-shadow-dark)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <div style={{ fontFamily: T.m, fontSize: 13, fontWeight: 700, letterSpacing: ".14em", color: "#E8C77E" }}>PET CODEX № {String(active.id).padStart(4, "0")}</div>
                {codexUrl && (
                  <div style={{ display: "flex", gap: 4, background: "rgba(251,246,236,.08)", borderRadius: 999, padding: 3 }}>
                    {([["Sticker", false], ["Photo", true]] as const).map(([lab, ph]) => (
                      <button key={lab} onClick={() => setShowPhoto(ph)} style={{
                        fontFamily: T.m, fontSize: 12, fontWeight: 700, letterSpacing: ".06em", padding: "4px 10px", borderRadius: 999, cursor: "pointer", border: "none",
                        background: showPhoto === ph ? "#E8C77E" : "transparent", color: showPhoto === ph ? "#3A2A08" : "rgba(251,246,236,.7)",
                      }}>{lab}</button>
                    ))}
                  </div>
                )}
              </div>
              {codexUrl ? (
                <div style={{ fontFamily: T.disp, fontWeight: 700, fontSize: 18, margin: "6px 0 4px", color: "#FBF6EC" }}>{active.name} is a collectible ✦</div>
              ) : (
                <div style={{ fontFamily: T.disp, fontWeight: 700, fontSize: 18, margin: "6px 0 4px", color: "#E8C77E" }}>Turn {active.name} into a collectible</div>
              )}
              <p style={{ fontSize: 13, color: "rgba(251,246,236,.75)", margin: "0 0 12px", lineHeight: 1.5 }}>
                {codexUrl
                  ? <>The Codex sticker is live on {active.name}&apos;s card and this hero. Re-illustrate in any style anytime.</>
                  : <>A numbered die-cut creature sticker — your own dex entry. Pick a style; it becomes {active.name}&apos;s card art and this hero.</>}
              </p>

              {/* 띠부씰 style picker — one asset, many looks */}
              <div style={{ fontFamily: T.m, fontSize: 13, fontWeight: 700, letterSpacing: ".12em", color: "rgba(232,199,126,.75)", marginBottom: 7 }}>STICKER STYLE · {selVariant.blurb.toUpperCase()}</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 13 }}>
                {CODEX_VARIANTS.map((v) => {
                  const on = v.key === codexVariant;
                  return (
                    <button key={v.key} type="button" onClick={() => setCodexVariant(v.key)} title={v.blurb} aria-pressed={on} style={{
                      fontFamily: T.m, fontSize: 13, fontWeight: 700, letterSpacing: ".04em", padding: "5px 11px", borderRadius: 999, cursor: "pointer",
                      border: on ? "1px solid #E8C77E" : "1px solid rgba(251,246,236,.18)",
                      background: on ? "#E8C77E" : "transparent", color: on ? "#3A2A08" : "rgba(251,246,236,.7)",
                    }}>{v.label}</button>
                  );
                })}
              </div>

              <div style={{ display: "flex", gap: 9, flexWrap: "wrap", alignItems: "center" }}>
                <button onClick={illustrateCodex} disabled={codexBusy} className="ed-card-hover" style={{
                  display: "inline-flex", alignItems: "center", gap: 8, background: "linear-gradient(180deg,#F0C868,#C8932F)", color: "#3A2A08", fontFamily: T.disp, fontWeight: 800, fontSize: 14, borderRadius: 12, padding: "10px 18px", border: "none", cursor: codexBusy ? "wait" : "pointer", boxShadow: "0 12px 24px -14px rgba(200,147,47,.7)",
                }}>{codexBusy ? `Illustrating ${active.name}…` : `${codexUrl ? "Re-illustrate" : "Illustrate"} ${selVariant.label} · 5 credits`}</button>
                {codexUrl && (
                  <button onClick={() => onNavigate?.("cards")} className="ed-wipe" style={{
                    background: "transparent", color: "rgba(251,246,236,.75)", fontFamily: T.m, fontSize: 12.5, fontWeight: 700, letterSpacing: ".04em", border: "1px solid rgba(251,246,236,.2)", borderRadius: 11, padding: "9px 14px", cursor: "pointer",
                  }}>See the card →</button>
                )}
              </div>
            </div>
            </Reveal>

            {/* studio teaser — warm-dark panel, studio-purple accent, foil-gold headline */}
            <Reveal dir="right" delay={180}>
            <button onClick={() => onNavigate?.("create")} className="ed-card-hover" style={{ width: "100%", textAlign: "left", cursor: "pointer", background: "#1E1710", border: "1px solid rgba(107,79,160,.5)", borderRadius: 18, padding: 18, color: "rgba(251,246,236,.8)", boxShadow: "var(--ed-shadow-dark)" }}>
              <div style={{ fontFamily: T.m, fontSize: 13, fontWeight: 700, letterSpacing: ".14em", color: "#6B4FA0" }}>PRO PET STUDIO</div>
              <div style={{ fontFamily: T.disp, fontWeight: 700, fontSize: 19, margin: "5px 0 12px", color: "#E8C77E" }}>Make {active.name} a star ✦</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {["Cinematic", "Anime", "3D Pixar", "Pixel"].map((s) => (
                  <span key={s} style={{ fontSize: 13, fontWeight: 600, border: "1px solid rgba(232,199,126,.3)", borderRadius: 8, padding: "4px 9px", color: "#E8C77E" }}>{s}</span>
                ))}
              </div>
            </button>
            </Reveal>

            {/* catch — warm-dark panel, catch-teal accent */}
            <Reveal dir="right" delay={270}>
            <button onClick={() => onNavigate?.("catch")} className="ed-card-hover" style={{ width: "100%", textAlign: "left", cursor: "pointer", background: "#1E1710", border: "1px solid rgba(26,126,104,.5)", borderRadius: 18, padding: 18, color: "rgba(251,246,236,.8)", boxShadow: "var(--ed-shadow-dark)" }}>
              <div style={{ fontFamily: T.m, fontSize: 13, fontWeight: 700, letterSpacing: ".14em", color: "#1A7E68" }}>FIELD ALBUM</div>
              <div style={{ fontFamily: T.disp, fontWeight: 700, fontSize: 18, marginTop: 5, color: "#E8C77E" }}>Catch in the wild</div>
              <p style={{ fontSize: 13, color: "rgba(251,246,236,.8)", margin: "7px 0 12px", lineHeight: 1.5 }}>Find real animals out there and turn them into collectibles for {active.name}&apos;s field album.</p>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 9, background: "rgba(26,126,104,.25)", color: T.creamOn, fontFamily: T.disp, fontWeight: 700, fontSize: 13.5, borderRadius: 11, padding: "9px 15px" }}>Go catching →</span>
            </button>
            </Reveal>
          </div>
        </div>

        {/* Classic tools — wardrobe, memories, evolution still live in the full
            PetProfile until each is re-homed into the editorial system. They open
            in a paper modal (compact mode hides PetProfile's duplicate
            header/stats/care row) so two care loops never share one page. */}
        <Reveal dir="up" style={{ marginTop: 24, paddingTop: 18, borderTop: `1px solid ${T.hair}`, textAlign: "center" }}>
          <button onClick={() => setShowClassic("tools")} className="ed-underline-slide" style={{
            fontFamily: T.m, fontSize: 13, letterSpacing: ".1em", textTransform: "uppercase",
            color: T.mono, background: "transparent", border: "none", cursor: "pointer",
          }}>
            Wardrobe · Memories · Evolution ↗
          </button>
        </Reveal>
      </div>

      {/* combo toast — paper, hairline, card shadow */}
      {combo && (
        <div style={{
          position: "fixed", top: 84, left: "50%", transform: "translateX(-50%)", zIndex: 130,
          background: T.paper, border: `1px solid ${T.hair}`, borderRadius: 16, padding: "13px 22px",
          boxShadow: "var(--ed-shadow-card)", textAlign: "center", maxWidth: 340,
          animation: "edPanelIn .26s cubic-bezier(.2,.8,.2,1) both",
        }}>
          <div style={{ fontFamily: T.m, fontSize: 13, fontWeight: 700, letterSpacing: ".14em", color: T.mono }}>COMBO{combo.emoji ? ` · ${combo.emoji}` : ""}</div>
          <div style={{ fontFamily: T.disp, fontWeight: 800, fontSize: 17, color: T.ink, marginTop: 3 }}>{combo.name}</div>
          <div style={{ fontSize: 13, color: T.muted2, marginTop: 3, lineHeight: 1.45 }}>{combo.description}</div>
        </div>
      )}

      {/* classic tools modal — paper panel over the sanctioned blur scrim */}
      {showClassic && (
        <div onClick={closeClassic} style={{
          position: "fixed", inset: 0, zIndex: 120, background: "rgba(0,0,0,.5)",
          backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)",
          overflowY: "auto", padding: "4vh 12px 6vh", animation: "edScrimIn .16s ease both",
        }}>
          <div onClick={(e) => e.stopPropagation()} style={{
            position: "relative", maxWidth: 990, margin: "0 auto", background: T.paper, borderRadius: 22,
            boxShadow: "var(--ed-shadow-float)", animation: "edPanelIn .26s cubic-bezier(.2,.8,.2,1) both", paddingBottom: 10,
          }}>
            <div style={{
              position: "sticky", top: 0, zIndex: 5, display: "flex", justifyContent: "space-between", alignItems: "center",
              gap: 10, padding: "14px 18px 11px", background: T.paper, borderBottom: `1px solid ${T.hair}`, borderRadius: "22px 22px 0 0",
            }}>
              <span style={{ fontFamily: T.m, fontSize: 13, fontWeight: 700, letterSpacing: ".14em", color: T.mono }}>
                {showClassic === "create" ? "ADOPT A NEW PET" : "CLASSIC TOOLS — WARDROBE · MEMORIES · EVOLUTION"}
              </span>
              <button onClick={closeClassic} className="ed-wipe" style={{
                border: `1px solid ${T.hair}`, background: T.field, borderRadius: 9, padding: "5px 12px",
                fontFamily: T.m, fontSize: 13, fontWeight: 700, letterSpacing: ".08em", color: T.muted2, cursor: "pointer",
              }}>CLOSE ✕</button>
            </div>
            <Suspense fallback={<div style={{ padding: 60, textAlign: "center", fontFamily: T.m, color: T.muted }}>Loading tools…</div>}>
              <PetProfile compact initialShowCreate={showClassic === "create"} />
            </Suspense>
          </div>
        </div>
      )}

      {/* paywall — opens when feed/play overflow returns 402; retry-on-paid */}
      <PaywallModal info={paywall} onClose={() => setPaywall(null)} />
    </div>
  );
}
