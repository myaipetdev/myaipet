"use client";

/**
 * PetSquare — a cozy, walkable top-down neighborhood for the Community section.
 *
 * A calm, Animal-Crossing-lite plaza rendered in the Collectible Editorial palette
 * (warm paper, terracotta, muted greens/tans, foil lamplight). YOUR active pet is
 * the player: walk with arrow keys / WASD, click-to-walk on desktop, tap-to-walk on
 * mobile. Every OTHER character is a REAL community pet fetched from the public
 * roster (GET /api/worldcup/bracket → active, avatar-bearing pets: {id,name,avatar_url,level}).
 *
 * HONESTY: there is no realtime presence here. "Neighbors" are RECENT community pets,
 * not live-online users — the UI says so plainly. Interactions are friendly LOCAL
 * emotes (a wave/heart/etc. that floats over the pet); we never fabricate conversations,
 * likes, or "online now" status. Sparse rosters fall through to an honest low-data state.
 *
 * Pure inline SVG + CSS (no external assets, no new deps). Ambient motion (lamp glow,
 * idle bob) is CSS-gated so `prefers-reduced-motion: reduce` yields a static — but still
 * fully walkable — map. One rAF loop drives movement; it parks itself when idle.
 */

import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { api, getAuthHeaders } from "@/lib/api";

// ── Collectible Editorial tokens ──
const T = {
  field: "#ECE4D4", paper: "#FBF6EC", inset: "#F5EFE2", ink: "#211A12", ink70: "#3A3024",
  muted: "#7A6E5A", mono: "#9A7B4E", hair: "rgba(33,26,18,.13)",
  terra: "#BE4F28", terraSub: "#9A4E1E", creamOn: "#FCE9CF",
  sage: "#5C8A4E", sage2: "#9FC59A", sageDk: "#3F6A35",
  tan: "#E3D3B2", tanDk: "#CBB185", stone: "#F5EFE2", stoneEdge: "#E7DcC6",
  foil: "#E8C77E", foilDk: "#C8932F", water: "#8FB9C9",
  disp: "var(--ed-disp, 'Bricolage Grotesque', system-ui, sans-serif)",
  body: "var(--ed-body, 'Hanken Grotesk', system-ui, sans-serif)",
  m: "var(--ed-m, 'Space Mono', ui-monospace, monospace)",
  shadowCard: "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))",
};

// World is a fixed logical grid; the container scales it to fit width.
const W = 1000, H = 680;
const SPEED = 230;              // world-units / second
const NEAR = 116;               // proximity radius to "meet" a neighbor
const TOKEN = 62;               // avatar token diameter (world units)

type Pet = { id: number; name: string; avatar_url: string; level?: number | null };
type Placed = Pet & { x: number; y: number };
type Emote = { id: number; petId: number | "player"; ch: string; born: number };

const frac = (n: number) => n - Math.floor(n);

// Deterministic, id-seeded scatter across the lower plaza (keeps the café/pond
// footprint clear). Grid + per-id jitter → even spread, stable across renders.
function placePets(pets: Pet[]): Placed[] {
  const z = { x0: 96, x1: 904, y0: 250, y1: 596 };
  const n = pets.length;
  const cols = Math.max(1, Math.ceil(Math.sqrt(n)));
  const rows = Math.max(1, Math.ceil(n / cols));
  const cw = (z.x1 - z.x0) / cols;
  const ch = (z.y1 - z.y0) / rows;
  return pets.map((p, i) => {
    const col = i % cols, row = Math.floor(i / cols);
    const j1 = frac(Math.sin(p.id * 12.9898) * 43758.5453) - 0.5;
    const j2 = frac(Math.sin(p.id * 78.233) * 12543.877) - 0.5;
    return {
      ...p,
      x: z.x0 + cw * (col + 0.5) + j1 * cw * 0.55,
      y: z.y0 + ch * (row + 0.5) + j2 * ch * 0.5,
    };
  });
}

function absUrl(u?: string | null): string | null {
  if (!u) return null;
  return u; // relative paths are served by the same origin; leave as-is
}

// ── The static, hand-drawn plaza (inline SVG) ──
function Scene() {
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" preserveAspectRatio="none"
      aria-hidden="true" style={{ position: "absolute", inset: 0, display: "block" }}>
      <defs>
        <radialGradient id="psq-lamp" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={T.foil} stopOpacity="0.55" />
          <stop offset="100%" stopColor={T.foil} stopOpacity="0" />
        </radialGradient>
        <pattern id="psq-cobble" width="34" height="34" patternUnits="userSpaceOnUse">
          <rect width="34" height="34" fill={T.stone} />
          <circle cx="8" cy="8" r="1" fill="rgba(33,26,18,.05)" />
          <circle cx="25" cy="22" r="1" fill="rgba(33,26,18,.05)" />
        </pattern>
      </defs>

      {/* grass field */}
      <rect x="0" y="0" width={W} height={H} fill={T.field} />
      <rect x="0" y="0" width={W} height={H} fill={T.sage2} opacity="0.16" />

      {/* soft dirt paths (cross) */}
      <g fill={T.tan} stroke={T.tanDk} strokeWidth="2">
        <rect x="430" y="150" width="140" height="500" rx="26" />
        <rect x="70" y="380" width="860" height="132" rx="30" />
      </g>

      {/* central cobbled plaza */}
      <ellipse cx="500" cy="446" rx="212" ry="150" fill="url(#psq-cobble)"
        stroke={T.stoneEdge} strokeWidth="4" />
      <ellipse cx="500" cy="446" rx="70" ry="50" fill={T.paper} stroke={T.foilDk}
        strokeWidth="2.5" opacity="0.9" />
      <ellipse cx="500" cy="446" rx="70" ry="50" fill="url(#psq-lamp)" />

      {/* café building (top-center) */}
      <g>
        <rect x="392" y="66" width="216" height="104" rx="10" fill="#F3E7CE"
          stroke={T.ink} strokeWidth="3" />
        <rect x="382" y="44" width="236" height="34" rx="8" fill={T.terra} stroke={T.ink} strokeWidth="3" />
        {[0, 1, 2, 3, 4].map(i => (
          <rect key={i} x={382 + i * 47.2} y="44" width="23.6" height="34" fill={T.creamOn} opacity="0.5" />
        ))}
        <rect x="470" y="112" width="60" height="58" rx="4" fill={T.tanDk} stroke={T.ink} strokeWidth="2.5" />
        <circle cx="516" cy="142" r="3" fill={T.ink} />
        <rect x="410" y="96" width="40" height="34" rx="4" fill={T.water} opacity="0.5" stroke={T.ink} strokeWidth="2" />
        <rect x="550" y="96" width="40" height="34" rx="4" fill={T.water} opacity="0.5" stroke={T.ink} strokeWidth="2" />
        <text x="500" y="34" textAnchor="middle" fill={T.terraSub}
          style={{ font: `700 15px ${T.m}`, letterSpacing: "2px" }}>THE CAFÉ</text>
      </g>

      {/* pond (bottom-left) */}
      <ellipse cx="168" cy="588" rx="86" ry="52" fill={T.water} stroke={T.sageDk} strokeWidth="3" opacity="0.85" />
      <ellipse cx="150" cy="576" rx="30" ry="16" fill={T.paper} opacity="0.35" />

      {/* trees */}
      {[[150, 250], [858, 250], [842, 592], [110, 150], [890, 150]].map(([x, y], i) => (
        <g key={i}>
          <ellipse cx={x} cy={y + 40} rx="30" ry="10" fill="rgba(33,26,18,.12)" />
          <rect x={x - 7} y={y + 6} width="14" height="34" rx="4" fill={T.tanDk} stroke={T.ink} strokeWidth="2" />
          <circle cx={x} cy={y} r="38" fill={T.sage} stroke={T.ink} strokeWidth="3" />
          <circle cx={x - 14} cy={y - 6} r="18" fill={T.sage2} opacity="0.7" />
        </g>
      ))}

      {/* benches around the plaza */}
      {[[500, 300, 0], [500, 592, 0], [300, 446, 90], [700, 446, 90]].map(([x, y, r], i) => (
        <g key={i} transform={`translate(${x} ${y}) rotate(${r})`}>
          <rect x="-34" y="-7" width="68" height="14" rx="5" fill={T.tanDk} stroke={T.ink} strokeWidth="2.5" />
          <rect x="-30" y="-15" width="60" height="7" rx="3" fill={T.tan} stroke={T.ink} strokeWidth="2" />
        </g>
      ))}

      {/* lamps with foil glow */}
      {[[330, 300], [670, 300], [330, 592], [670, 592]].map(([x, y], i) => (
        <g key={i} className="psq-lamp">
          <circle cx={x} cy={y} r="46" fill="url(#psq-lamp)" />
          <rect x={x - 3} y={y - 2} width="6" height="30" rx="2" fill={T.ink} />
          <circle cx={x} cy={y - 8} r="8" fill={T.foil} stroke={T.ink} strokeWidth="2" />
        </g>
      ))}
    </svg>
  );
}

export default function PetSquare() {
  const worldRef = useRef<HTMLDivElement | null>(null);
  const [pets, setPets] = useState<Placed[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchErr, setFetchErr] = useState(false);
  const [player, setPlayer] = useState<{ name: string; avatar: string | null }>({ name: "You", avatar: null });
  const [focused, setFocused] = useState(false);
  const [nearId, setNearId] = useState<number | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const [emotes, setEmotes] = useState<Emote[]>([]);

  // mutable movement state (out of React render loop for perf)
  const pos = useRef({ x: 500, y: 630 });
  const target = useRef<{ x: number; y: number } | null>(null);
  const keys = useRef<Set<string>>(new Set());
  const petsRef = useRef<Placed[]>([]);
  const nearRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const playerElRef = useRef<HTMLDivElement | null>(null);
  const emoteSeq = useRef(0);
  const wakeRef = useRef<() => void>(() => {});

  const MOVE_KEYS = useMemo(() => new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "a", "d", "w", "s"]), []);

  petsRef.current = pets;

  // ── data: player (your active pet) + real community neighbors ──
  useEffect(() => {
    let alive = true;
    (async () => {
      // player: your active pet's avatar, if signed in with one
      try {
        const d: any = await api.pets.list();
        const list: any[] = d?.pets || [];
        const mine = list.find((p) => p.is_active) || list[0];
        if (alive && mine) setPlayer({ name: mine.name || "You", avatar: absUrl(mine.avatar_url) });
      } catch { /* signed out / no pet → generic walker */ }

      // neighbors: REAL public roster (same source as the World Cup bracket)
      try {
        const res = await fetch("/api/worldcup/bracket?size=24", { headers: { ...getAuthHeaders() } });
        const j = await res.json();
        const raw: Pet[] = (Array.isArray(j?.pets) ? j.pets : [])
          .filter((p: any) => p && typeof p.id === "number" && p.avatar_url)
          .map((p: any) => ({ id: p.id, name: p.name || "Pet", avatar_url: p.avatar_url, level: p.level }));
        if (alive) { setPets(placePets(raw)); setFetchErr(false); }
      } catch {
        if (alive) setFetchErr(true);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  // ── movement rAF loop ──
  useEffect(() => {
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const p = pos.current;

      // keyboard velocity
      let dx = 0, dy = 0;
      const k = keys.current;
      if (k.has("ArrowLeft") || k.has("a")) dx -= 1;
      if (k.has("ArrowRight") || k.has("d")) dx += 1;
      if (k.has("ArrowUp") || k.has("w")) dy -= 1;
      if (k.has("ArrowDown") || k.has("s")) dy += 1;

      let moving = false;
      if (dx || dy) {
        target.current = null; // keys override click-to-walk
        const m = Math.hypot(dx, dy) || 1;
        p.x += (dx / m) * SPEED * dt;
        p.y += (dy / m) * SPEED * dt;
        moving = true;
      } else if (target.current) {
        const tx = target.current.x - p.x, ty = target.current.y - p.y;
        const dist = Math.hypot(tx, ty);
        if (dist < 3) { target.current = null; }
        else {
          const s = Math.min(dist, SPEED * dt);
          p.x += (tx / dist) * s;
          p.y += (ty / dist) * s;
          moving = true;
        }
      }

      // clamp to walkable bounds
      p.x = Math.max(40, Math.min(W - 40, p.x));
      p.y = Math.max(210, Math.min(H - 26, p.y));

      // apply transform directly (no per-frame React render)
      if (playerElRef.current) {
        playerElRef.current.style.left = `${(p.x / W) * 100}%`;
        playerElRef.current.style.top = `${(p.y / H) * 100}%`;
      }

      // nearest neighbor within reach
      let best: number | null = null, bestD = NEAR;
      for (const q of petsRef.current) {
        const d = Math.hypot(q.x - p.x, q.y - p.y);
        if (d < bestD) { bestD = d; best = q.id; }
      }
      if (best !== nearRef.current) { nearRef.current = best; setNearId(best); }

      if (moving || target.current || keys.current.size) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        rafRef.current = null; // park the loop when idle
      }
    };
    // kick once to position the player initially
    rafRef.current = requestAnimationFrame(step);
    wakeRef.current = () => { if (rafRef.current == null) { last = performance.now(); rafRef.current = requestAnimationFrame(step); } };
    return () => { if (rafRef.current != null) cancelAnimationFrame(rafRef.current); };
  }, []);

  // ── keyboard (only while the square has focus, so we don't hijack the page) ──
  useEffect(() => {
    if (!focused) return;
    const down = (e: KeyboardEvent) => {
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (MOVE_KEYS.has(key)) { e.preventDefault(); keys.current.add(key); wakeRef.current(); }
      else if (key === "e" && nearRef.current != null) { e.preventDefault(); setOpenId(nearRef.current); }
      else if (key === "Escape") setOpenId(null);
    };
    const up = (e: KeyboardEvent) => {
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      keys.current.delete(key);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      keys.current.clear();
    };
  }, [focused, MOVE_KEYS]);

  // ── pointer: click/tap-to-walk ──
  const walkTo = useCallback((clientX: number, clientY: number) => {
    const el = worldRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = ((clientX - r.left) / r.width) * W;
    const y = ((clientY - r.top) / r.height) * H;
    target.current = { x: Math.max(40, Math.min(W - 40, x)), y: Math.max(210, Math.min(H - 26, y)) };
    wakeRef.current();
  }, []);

  const onGroundPointer = useCallback((e: React.PointerEvent) => {
    setFocused(true);
    walkTo(e.clientX, e.clientY);
  }, [walkTo]);

  // ── emote (local, honest — no fabricated activity) ──
  const wave = useCallback((petId: number | "player", ch: string) => {
    const id = ++emoteSeq.current;
    setEmotes((prev) => [...prev.slice(-8), { id, petId, ch, born: Date.now() }]);
    setTimeout(() => setEmotes((prev) => prev.filter((x) => x.id !== id)), 1500);
  }, []);

  const openPet = openId != null ? pets.find((p) => p.id === openId) || null : null;
  const nearPet = nearId != null ? pets.find((p) => p.id === nearId) || null : null;

  return (
    <div style={{ fontFamily: T.body, color: T.ink }}>
      <style>{`
        @keyframes psq-bob { 0%,100% { transform: translate(-50%,-50%) } 50% { transform: translate(-50%,-56%) } }
        @keyframes psq-pop { 0% { opacity:0; transform: translate(-50%,-40%) scale(.6) } 20% { opacity:1 } 100% { opacity:0; transform: translate(-50%,-160%) scale(1) } }
        @keyframes psq-glow { 0%,100% { opacity:.55 } 50% { opacity:.9 } }
        .psq-lamp { animation: psq-glow 3.4s ease-in-out infinite; transform-origin:center }
        .psq-tok { animation: psq-bob 2.6s ease-in-out infinite }
        .psq-tok:nth-child(3n){ animation-delay:.5s } .psq-tok:nth-child(3n+1){ animation-delay:1.1s }
        .psq-emote { animation: psq-pop 1.5s ease-out forwards }
        @media (prefers-reduced-motion: reduce) {
          .psq-lamp, .psq-tok { animation: none !important }
          .psq-tok { transform: translate(-50%,-50%) !important }
        }
      `}</style>

      {/* Header row + honesty note */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
        <div>
          <div style={{ fontFamily: T.m, fontSize: 12, fontWeight: 700, letterSpacing: ".14em", textTransform: "uppercase", color: T.terra, marginBottom: 6 }}>
            The Pet Square
          </div>
          <p style={{ margin: 0, fontFamily: T.m, fontSize: 12.5, color: T.mono, letterSpacing: ".02em", maxWidth: 560 }}>
            Walk your pet around and meet the neighbors — real, recent community pets. Not live presence:
            no one is “online.” Arrow keys / WASD, or click to walk. Get close and press <b style={{ color: T.ink }}>E</b> (or tap) to say hi.
          </p>
        </div>
        <div style={{ fontFamily: T.m, fontSize: 12, color: T.mono, letterSpacing: ".06em", whiteSpace: "nowrap" }}>
          {loading ? "loading…" : `${pets.length} neighbor${pets.length === 1 ? "" : "s"}`}
        </div>
      </div>

      {/* The world */}
      <div
        ref={worldRef}
        role="application"
        aria-label="Walkable community pet square"
        tabIndex={0}
        onPointerDown={onGroundPointer}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          position: "relative", width: "100%", maxWidth: 1000, margin: "0 auto",
          aspectRatio: `${W} / ${H}`, borderRadius: 18, overflow: "hidden",
          background: T.field, border: `1.5px solid ${T.hair}`,
          boxShadow: focused ? `0 0 0 3px rgba(184,79,40,.35), ${T.shadowCard}` : T.shadowCard,
          cursor: "pointer", outline: "none", touchAction: "none", userSelect: "none",
        }}
      >
        <Scene />

        {/* loading / error / empty states over the scene */}
        {(loading || fetchErr || (!loading && pets.length === 0)) && (
          <div style={{
            position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
            padding: 24, textAlign: "center", background: "rgba(251,246,236,.62)", backdropFilter: "blur(1px)",
          }}>
            <div style={{ maxWidth: 360 }}>
              <div style={{ fontFamily: T.disp, fontSize: 22, fontWeight: 800, color: T.ink, marginBottom: 6, letterSpacing: "-.02em" }}>
                {loading ? "Opening the square…" : fetchErr ? "Couldn’t load the square" : "The square is quiet"}
              </div>
              <div style={{ fontFamily: T.m, fontSize: 12.5, color: T.mono, letterSpacing: ".04em" }}>
                {loading ? "Gathering the neighbors" : fetchErr ? "Check your connection and try again"
                  : "No community pets to meet yet — adopt one and be the first on the block."}
              </div>
            </div>
          </div>
        )}

        {/* neighbor pets (real) */}
        {pets.map((p) => {
          const near = p.id === nearId;
          return (
            <div
              key={p.id}
              className="psq-tok"
              onPointerDown={(e) => {
                e.stopPropagation();
                setFocused(true);
                if (p.id === nearId) setOpenId(p.id);
                else { target.current = { x: p.x, y: p.y - 4 }; wakeRef.current(); }
              }}
              style={{
                position: "absolute", left: `${(p.x / W) * 100}%`, top: `${(p.y / H) * 100}%`,
                width: TOKEN, height: TOKEN, transform: "translate(-50%,-50%)",
                borderRadius: "50%", zIndex: near ? 6 : 4, cursor: "pointer",
              }}
            >
              <div style={{
                width: "100%", height: "100%", borderRadius: "50%", overflow: "hidden",
                border: `2.5px solid ${near ? T.terra : T.ink}`,
                boxShadow: `2px 3px 0 ${near ? "rgba(184,79,40,.4)" : "rgba(33,26,18,.28)"}`,
                background: T.tan,
              }}>
                <img src={p.avatar_url} alt="" draggable={false}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              </div>
              {/* name tag: subtle always; highlighted when near */}
              <div style={{
                position: "absolute", top: "100%", left: "50%", transform: "translate(-50%,4px)",
                whiteSpace: "nowrap", fontFamily: T.m, fontSize: 10.5, fontWeight: 700, letterSpacing: ".04em",
                padding: "1px 7px", borderRadius: 999,
                background: near ? T.ink : "rgba(251,246,236,.9)",
                color: near ? T.creamOn : T.ink70,
                border: `1px solid ${near ? T.ink : T.hair}`,
                boxShadow: near ? "0 4px 10px -6px rgba(33,26,18,.6)" : "none",
              }}>{p.name}{near ? " · press E" : ""}</div>

              {/* emotes floating over this pet */}
              {emotes.filter((em) => em.petId === p.id).map((em) => (
                <div key={em.id} className="psq-emote" style={{
                  position: "absolute", left: "50%", top: 0, fontSize: 24, pointerEvents: "none",
                }}>{em.ch}</div>
              ))}
            </div>
          );
        })}

        {/* the player = your pet */}
        <div ref={playerElRef} style={{
          position: "absolute", left: `${(pos.current.x / W) * 100}%`, top: `${(pos.current.y / H) * 100}%`,
          width: TOKEN + 6, height: TOKEN + 6, transform: "translate(-50%,-50%)",
          borderRadius: "50%", zIndex: 8, pointerEvents: "none",
        }}>
          <div style={{
            width: "100%", height: "100%", borderRadius: "50%", overflow: "hidden",
            border: `3px solid ${T.terra}`,
            boxShadow: `0 0 0 2px ${T.paper}, 3px 4px 0 rgba(184,79,40,.45)`,
            background: T.creamOn,
          }}>
            {player.avatar
              ? <img src={player.avatar} alt="" draggable={false} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              : <img src="/mascot.jpg" alt="" draggable={false} style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
          </div>
          <div style={{
            position: "absolute", top: "100%", left: "50%", transform: "translate(-50%,4px)",
            whiteSpace: "nowrap", fontFamily: T.m, fontSize: 10.5, fontWeight: 700, letterSpacing: ".04em",
            padding: "1px 8px", borderRadius: 999, background: T.terra, color: T.creamOn,
          }}>{player.name} · you</div>
          {emotes.filter((em) => em.petId === "player").map((em) => (
            <div key={em.id} className="psq-emote" style={{ position: "absolute", left: "50%", top: 0, fontSize: 26, pointerEvents: "none" }}>{em.ch}</div>
          ))}
        </div>

        {/* hint pill when standing next to someone (and no card open) */}
        {nearPet && !openPet && (
          <div style={{
            position: "absolute", bottom: 12, left: "50%", transform: "translateX(-50%)",
            fontFamily: T.m, fontSize: 12, fontWeight: 700, letterSpacing: ".04em",
            padding: "7px 14px", borderRadius: 999, background: T.ink, color: T.creamOn,
            boxShadow: "0 10px 24px -12px rgba(33,26,18,.7)", pointerEvents: "none",
          }}>Say hi to <b style={{ color: "#fff" }}>{nearPet.name}</b> — press E or tap them</div>
        )}
      </div>

      {/* Interact card */}
      {openPet && (
        <>
          <div onPointerDown={() => setOpenId(null)} style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(33,26,18,.28)" }} />
          <div role="dialog" aria-label={`Say hi to ${openPet.name}`} style={{
            position: "fixed", zIndex: 61, left: "50%", top: "50%", transform: "translate(-50%,-50%)",
            width: "min(340px, 92vw)", background: T.paper, borderRadius: 16,
            border: `1.5px solid ${T.hair}`, boxShadow: "0 30px 60px -24px rgba(80,55,20,.6)",
            padding: 20, textAlign: "center",
          }}>
            <div style={{
              width: 84, height: 84, margin: "0 auto 12px", borderRadius: "50%", overflow: "hidden",
              border: `3px solid ${T.ink}`, boxShadow: `3px 4px 0 rgba(33,26,18,.28)`, background: T.tan,
            }}>
              <img src={openPet.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </div>
            <div style={{ fontFamily: T.disp, fontSize: 24, fontWeight: 800, color: T.ink, letterSpacing: "-.02em" }}>{openPet.name}</div>
            <div style={{ fontFamily: T.m, fontSize: 11.5, color: T.mono, letterSpacing: ".08em", textTransform: "uppercase", marginTop: 3 }}>
              {openPet.level ? `Lv ${openPet.level} · ` : ""}Neighbor · recent community pet
            </div>

            <div style={{ display: "flex", justifyContent: "center", gap: 10, margin: "16px 0 10px" }}>
              {["👋", "❤️", "😂", "⭐"].map((ch) => (
                <button key={ch} onClick={() => wave(openPet.id, ch)} style={{
                  width: 48, height: 48, fontSize: 24, borderRadius: 12, cursor: "pointer",
                  background: T.inset, border: `1.5px solid ${T.hair}`,
                  boxShadow: "0 4px 0 rgba(33,26,18,.14)", transition: "transform .1s",
                }}>{ch}</button>
              ))}
            </div>
            <div style={{ fontFamily: T.m, fontSize: 11, color: T.mono, letterSpacing: ".03em", lineHeight: 1.5 }}>
              A friendly wave, just between the two of you — emotes stay local and aren’t posted anywhere.
            </div>

            <button onClick={() => setOpenId(null)} style={{
              marginTop: 14, padding: "9px 22px", borderRadius: 999, cursor: "pointer",
              background: T.ink, color: T.creamOn, border: "none",
              fontFamily: T.m, fontSize: 12, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase",
            }}>Wave goodbye</button>
          </div>
        </>
      )}
    </div>
  );
}
