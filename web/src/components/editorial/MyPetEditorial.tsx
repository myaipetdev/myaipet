"use client";

/**
 * My Pet — Collectible Editorial. The pet's home base, laid out like a premium
 * editorial print piece: a status column, a terracotta collector's poster holding
 * the framed collectible (CollectibleFrame), and a care column. Wired to the real
 * active pet (api.pets.list / interact). Falls back to the existing PetProfile for
 * onboarding when the user has no pet yet.
 */

import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import CollectibleFrame, { Motes } from "@/components/editorial/CollectibleFrame";

const PetProfile = lazy(() => import("@/components/PetProfile"));

type Pet = {
  id: number; name: string; level: number; element?: string; species?: number;
  happiness?: number; energy?: number; hunger?: number; bond_level?: number;
  avatar_url?: string | null; evolution_name?: string | null; species_name?: string | null;
};

const T = {
  field: "#ECE4D4", paper: "#FBF6EC", ink: "#211A12", ink70: "#3A3024", muted: "#7A6E5A", muted2: "#5C5140",
  mono: "#9A7B4E", hair: "rgba(33,26,18,.13)", terra: "#BE4F28", creamOn: "#FCE9CF",
  happy: "#F0589E", energy: "#3E8FE0", bond: "#9E72E8", thrive: "#5C8A4E",
  disp: "var(--ed-disp)", body: "var(--ed-body)", m: "var(--ed-m)",
};

function StatRow({ label, value, pct, color }: { label: string; value: number; pct: number; color: string }) {
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: T.muted2 }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: color }} />{label}
        </span>
        <span style={{ fontFamily: T.disp, fontWeight: 700, fontSize: 24 }}>{value}</span>
      </div>
      <div style={{ height: 3, borderRadius: 2, background: "rgba(33,26,18,.1)", marginTop: 7, overflow: "hidden" }}>
        <div style={{ height: "100%", borderRadius: 2, width: `${Math.max(0, Math.min(100, pct))}%`, background: color, transition: "width .6s ease" }} />
      </div>
    </div>
  );
}

const CareIcon = ({ d }: { d: string }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={T.ink70} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ display: "block", margin: "0 auto 5px" }}>{<path d={d} />}</svg>
);

function CareTile({ label, icon, onClick, busy }: { label: string; icon: React.ReactNode; onClick: () => void; busy?: boolean }) {
  return (
    <button onClick={onClick} disabled={busy} style={{
      flex: 1, background: "#FCE9CF", border: "1px solid rgba(190,79,40,0.22)", borderRadius: 14,
      padding: "13px 6px", textAlign: "center", cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1,
      transition: "transform .12s ease", fontFamily: T.body,
      boxShadow: "0 10px 22px -18px rgba(190,79,40,.55)",
    }}
      onMouseDown={(e) => (e.currentTarget.style.transform = "translateY(1px)")}
      onMouseUp={(e) => (e.currentTarget.style.transform = "none")}
      onMouseLeave={(e) => (e.currentTarget.style.transform = "none")}>
      {icon}
      <span style={{ fontSize: 12, fontWeight: 600, color: T.ink70 }}>{label}</span>
    </button>
  );
}

export default function MyPetEditorial({ onNavigate }: { onNavigate?: (section: string) => void }) {
  const [pets, setPets] = useState<Pet[] | null>(null);
  const [active, setActive] = useState<Pet | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [showClassic, setShowClassic] = useState(false);

  const load = useCallback(async () => {
    try {
      const data: any = await api.pets.list();
      const list: Pet[] = data?.pets || [];
      setPets(list);
      setActive((prev) => (prev ? list.find((p) => p.id === prev.id) || list[0] || null : list[0] || null));
    } catch { setPets([]); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const care = async (type: "feed" | "play" | "pet") => {
    if (!active || busy) return;
    setBusy(type);
    try {
      const r: any = await api.pets.interact(active.id, type);
      if (r?.error) setFlash(r.error);
      else { setFlash(r?.message || null); await load(); }
    } catch { setFlash("Try again in a moment."); }
    setBusy(null);
    setTimeout(() => setFlash(null), 2600);
  };

  if (pets === null) {
    return <div style={{ paddingTop: 120, textAlign: "center", fontFamily: T.m, color: T.muted }}>Loading your pet…</div>;
  }
  if (!active) {
    return <Suspense fallback={null}><PetProfile /></Suspense>;
  }

  const happy = active.happiness ?? 0, energy = active.energy ?? 0, hunger = active.hunger ?? 0, bond = active.bond_level ?? 0;
  const status = happy >= 80 && energy >= 50 && hunger < 40 ? "THRIVING" : energy < 20 ? "RESTING" : happy < 30 ? "WANTS YOU" : "DOING WELL";
  const photo = active.avatar_url || "/mascot.jpg";
  const species = active.evolution_name || active.species_name || "Companion";
  const element = (active.element || "normal").toUpperCase();

  return (
    <div style={{ position: "relative", fontFamily: T.body, color: T.ink, paddingTop: 78 }}>
      <div className="ed-grain" /><div className="ed-glow" /><div className="ed-vignette" />
      <div style={{ position: "relative", zIndex: 2, maxWidth: 1200, margin: "0 auto", padding: "8px 24px 48px" }}>
        <div className="mp-grid" style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 24, alignItems: "start" }}>
          <style>{`@media (max-width: 880px) { .mp-grid { grid-template-columns: 1fr !important; } }`}</style>

          {/* ── poster (left, dominant) ── */}
          <div>
            <div style={{ position: "relative", background: T.terra, borderRadius: 18, minHeight: 660, overflow: "hidden", display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div aria-hidden style={{ position: "absolute", inset: 14, border: "1px solid rgba(252,233,207,.35)", borderRadius: 8, pointerEvents: "none" }} />
              {[["14px", "14px", "", ""], ["14px", "", "", "14px"], ["", "14px", "14px", ""], ["", "", "14px", "14px"]].map((c, i) => (
                <span key={i} aria-hidden style={{ position: "absolute", top: c[0] || undefined, left: c[1] || undefined, bottom: c[2] || undefined, right: c[3] || undefined, width: 11, height: 11,
                  backgroundImage: "linear-gradient(rgba(252,233,207,.7),rgba(252,233,207,.7)),linear-gradient(rgba(252,233,207,.7),rgba(252,233,207,.7))",
                  backgroundSize: "1px 11px,11px 1px", backgroundPosition: "center,center", backgroundRepeat: "no-repeat" }} />
              ))}
              <div style={{ position: "absolute", top: 26, left: 28, right: 28, display: "flex", justifyContent: "space-between", alignItems: "flex-start", zIndex: 3 }}>
                <div style={{ fontFamily: T.m, fontSize: 10, fontWeight: 700, letterSpacing: ".12em", color: T.creamOn }}>COMPANION PROTOCOL</div>
                <div style={{ textAlign: "right", fontFamily: T.m, fontSize: 9, fontWeight: 700, letterSpacing: ".1em", color: T.creamOn }}>
                  FILE № {String(active.id).padStart(4, "0")}
                  <div style={{ height: 22, width: 120, margin: "5px 0 4px auto", background: "repeating-linear-gradient(90deg,#FCE9CF 0 1px,transparent 1px 3px,#FCE9CF 3px 5px,transparent 5px 6px,#FCE9CF 6px 9px,transparent 9px 11px)" }} />
                  EST. 2026
                </div>
              </div>
              <div style={{ position: "absolute", left: -2, top: "50%", transform: "rotate(-90deg) translateX(50%)", transformOrigin: "left center", fontFamily: T.m, fontSize: 9, fontWeight: 700, letterSpacing: ".18em", color: "rgba(252,233,207,.55)", whiteSpace: "nowrap" }}>
                ★ {element} · LV.{String(active.level).padStart(2, "0")}
              </div>
              <div aria-hidden style={{ position: "absolute", top: -40, right: 6, fontFamily: T.disp, fontWeight: 800, fontSize: 210, lineHeight: 1, color: "rgba(255,255,255,.08)", zIndex: 1, pointerEvents: "none" }}>{active.level}</div>

              <div style={{ position: "relative", marginTop: 92, zIndex: 2 }}>
                <Motes />
                <CollectibleFrame photoUrl={photo} level={active.level} speciesLabel={species.toUpperCase()} elementLabel={element} width={330} />
              </div>

              <div style={{ fontFamily: T.m, fontSize: 11, fontWeight: 700, letterSpacing: ".34em", color: T.creamOn, marginTop: 38, zIndex: 2 }}>MEET</div>
              <div className="ed-foil-text" style={{ fontFamily: T.disp, fontWeight: 800, fontSize: "clamp(64px,9vw,118px)", lineHeight: 0.82, letterSpacing: "-.04em", zIndex: 2, maxWidth: "92%", textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{active.name}</div>

              <div style={{ position: "absolute", bottom: 16, left: 0, right: 0, overflow: "hidden", zIndex: 2, WebkitMaskImage: "linear-gradient(90deg,transparent,#000 8%,#000 92%,transparent)" }}>
                <div style={{ display: "inline-flex", whiteSpace: "nowrap", animation: "edTickerSlide 18s linear infinite", fontFamily: T.m, fontSize: 11, fontWeight: 700, letterSpacing: ".18em", color: "rgba(252,233,207,.45)" }}>
                  {Array.from({ length: 4 }).map((_, i) => <span key={i} style={{ padding: "0 14px" }}>ADOPT · REMEMBER · OWN ·</span>)}
                </div>
              </div>
            </div>
          </div>

          {/* ── right column: identity · status · care · memory · chat · studio · catch ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {/* identity chips */}
            <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
              {[`LV.${String(active.level).padStart(2, "0")}`, species.toUpperCase(), element.toUpperCase()].map((t) => (
                <span key={t} style={{ fontFamily: T.m, fontSize: 10, fontWeight: 700, letterSpacing: ".1em", color: "#9A4E1E", background: T.paper, border: `1px solid ${T.hair}`, borderRadius: 9, padding: "5px 11px" }}>{t}</span>
              ))}
            </div>

            {/* status */}
            <div style={{ background: T.paper, borderRadius: 22, padding: 20, boxShadow: "var(--ed-shadow-card)" }}>
              <div style={{ fontFamily: T.m, fontWeight: 700, fontSize: 10, letterSpacing: ".14em", color: T.mono, textTransform: "uppercase" }}>Status</div>
              <div style={{ display: "flex", alignItems: "center", gap: 7, fontFamily: T.disp, fontWeight: 700, fontSize: 15, marginTop: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: T.thrive }} />{status}
              </div>
              <StatRow label="Happy" value={happy} pct={happy} color={T.happy} />
              <StatRow label="Energy" value={energy} pct={energy} color={T.energy} />
              <StatRow label="Bond" value={bond} pct={Math.min(100, bond * 10)} color={T.bond} />
            </div>

            {/* care */}
            <div style={{ background: T.paper, borderRadius: 22, padding: 20, boxShadow: "var(--ed-shadow-card)" }}>
              <div style={{ fontFamily: T.m, fontWeight: 700, fontSize: 10, letterSpacing: ".14em", color: T.mono, textTransform: "uppercase" }}>Care</div>
              <div style={{ display: "flex", gap: 9, marginTop: 14 }}>
                <CareTile label="Feed" busy={!!busy} onClick={() => care("feed")} icon={<CareIcon d="M5 3v8a3 3 0 0 0 6 0V3M8 3v18M19 3c-1.5 0-3 2-3 5s1.5 4 3 4v9" />} />
                <CareTile label="Play" busy={!!busy} onClick={() => care("play")} icon={<CareIcon d="M6 12h4M8 10v4M15 11h.01M18 13h.01M7 7h10a4 4 0 0 1 4 4v1a4 4 0 0 1-7 2.8 3 3 0 0 1-4 0A4 4 0 0 1 3 12v-1a4 4 0 0 1 4-4Z" />} />
                <CareTile label="Pet" busy={!!busy} onClick={() => care("pet")} icon={<CareIcon d="M9 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM15 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM6 15a2 2 0 1 0 0-4M18 15a2 2 0 1 0 0-4M8.5 14c-1.5 1-2 2.2-2 3.4C6.5 18.8 7.7 20 9.2 20c1 0 1.6-.5 2.8-.5s1.8.5 2.8.5c1.5 0 2.7-1.2 2.7-2.6 0-1.2-.5-2.4-2-3.4" />} />
              </div>
              {flash && <div style={{ marginTop: 12, fontSize: 12, color: T.muted2, fontStyle: "italic", lineHeight: 1.4 }}>{flash}</div>}
            </div>

            {/* memory */}
            <div style={{ border: "1.5px dashed #E8C079", borderRadius: 16, padding: "15px 16px", background: "rgba(255,250,235,.5)" }}>
              <div style={{ fontFamily: T.m, fontSize: 10, fontWeight: 700, letterSpacing: ".12em", color: "#A9712B" }}>{active.name.toUpperCase()} REMEMBERS</div>
              <p style={{ fontStyle: "italic", fontSize: 13, color: T.muted2, marginTop: 7, lineHeight: 1.5 }}>Care for {active.name} and they&apos;ll remember it — your habits, your mood, the little things.</p>
            </div>

            {/* chat — primary companion action */}
            <button onClick={() => onNavigate?.("chat")} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, textAlign: "left", border: "none", cursor: "pointer", background: "linear-gradient(180deg,#F49B2A,#E27D0C)", borderRadius: 18, padding: "15px 18px", color: "#FFF8EE", boxShadow: "0 12px 24px -14px rgba(226,125,12,.7)" }}>
              <span>
                <span style={{ display: "block", fontFamily: T.disp, fontWeight: 800, fontSize: 17 }}>Chat with {active.name}</span>
                <span style={{ display: "block", fontFamily: T.body, fontSize: 12.5, color: "#FCE9CF", marginTop: 2 }}>Talk live — every chat grows your Bond.</span>
              </span>
              <span style={{ fontSize: 20, flexShrink: 0 }}>→</span>
            </button>

            {/* studio teaser */}
            <button onClick={() => onNavigate?.("create")} style={{ textAlign: "left", border: "none", cursor: "pointer", background: "linear-gradient(150deg,#2B2250,#3A2D63)", borderRadius: 18, padding: 18, color: "#EDE7FF" }}>
              <div style={{ fontFamily: T.m, fontSize: 10, letterSpacing: ".14em", color: "#B9A9F0" }}>PRO PET STUDIO</div>
              <div style={{ fontFamily: T.disp, fontWeight: 700, fontSize: 19, margin: "5px 0 12px" }}>Make {active.name} a star ✦</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {["Cinematic", "Anime", "3D Pixar", "Pixel"].map((s) => (
                  <span key={s} style={{ fontSize: 11, fontWeight: 600, border: "1px solid rgba(255,255,255,.18)", borderRadius: 8, padding: "4px 9px", color: "#D9CFFB" }}>{s}</span>
                ))}
              </div>
            </button>

            {/* catch */}
            <button onClick={() => onNavigate?.("catch")} style={{ textAlign: "left", border: "none", cursor: "pointer", background: "linear-gradient(150deg,#241C44,#34295F)", borderRadius: 18, padding: 18, color: "#E9E4FB" }}>
              <div style={{ fontFamily: T.disp, fontWeight: 700, fontSize: 18 }}>Catch in the wild</div>
              <p style={{ fontSize: 12.5, color: "#B7AEDC", margin: "7px 0 12px", lineHeight: 1.5 }}>Find real animals out there and turn them into collectibles for {active.name}&apos;s field album.</p>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 9, background: "rgba(252,233,207,.16)", color: "#FCE9CF", fontFamily: T.disp, fontWeight: 700, fontSize: 13.5, borderRadius: 11, padding: "9px 15px" }}>Open camera →</span>
            </button>
          </div>
        </div>

        {pets.length > 1 && (
          <div style={{ display: "flex", gap: 8, marginTop: 22, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontFamily: T.m, fontSize: 10, letterSpacing: ".12em", color: T.mono, textTransform: "uppercase" }}>Your pets</span>
            {pets.map((p) => (
              <button key={p.id} onClick={() => setActive(p)} style={{
                fontFamily: T.body, fontWeight: 600, fontSize: 13, padding: "6px 14px", borderRadius: 999, cursor: "pointer",
                border: p.id === active.id ? `1.5px solid ${T.ink}` : `1px solid ${T.hair}`,
                background: p.id === active.id ? T.ink : T.paper, color: p.id === active.id ? T.paper : T.ink70,
              }}>{p.name} · Lv {p.level}</button>
            ))}
          </div>
        )}

        {/* Classic tools — wardrobe, memories, evolution, chat still live in the
            full PetProfile until each is re-homed into the editorial system.
            Kept reachable so the editorial swap loses nothing. */}
        <div style={{ marginTop: 24, paddingTop: 18, borderTop: `1px solid ${T.hair}`, textAlign: "center" }}>
          <button onClick={() => setShowClassic((v) => !v)} style={{
            fontFamily: T.m, fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase",
            color: T.mono, background: "transparent", border: "none", cursor: "pointer",
          }}>
            {showClassic ? "Hide tools ↑" : "Wardrobe · Memories · Evolution · Chat ↓"}
          </button>
        </div>
        {showClassic && (
          <div style={{ marginTop: 8 }}>
            <Suspense fallback={null}><PetProfile /></Suspense>
          </div>
        )}
      </div>
    </div>
  );
}
