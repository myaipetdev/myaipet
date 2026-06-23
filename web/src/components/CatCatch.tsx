"use client";

/**
 * CatCatch — photograph REAL street cats & dogs and collect them like Pokémon.
 * Live camera, with a photo-upload fallback for desktop / no-camera devices.
 * Either way the image is verified by Grok vision server-side: screenshots /
 * photos-of-screens / drawings / memes are rejected, so you can only catch
 * animals you actually find.
 *
 * Cream tones + thick outlines + game-like, per the catchcat aesthetic.
 */

import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { getAuthHeaders } from "@/lib/api";
import Icon from "@/components/Icon";
import { kindIcon } from "@/lib/catch/game";
import { WaxSeal, rarityStock, dcVars } from "@/components/Sticker";

/** Camera glyph in the cream/thick-outline Catch style (no emoji). */
function CameraIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ display: "block", flexShrink: 0 }} aria-hidden>
      <path d="M3 8.5C3 7.4 3.9 6.5 5 6.5H7L8.2 4.6C8.4 4.2 8.8 4 9.2 4H14.8C15.2 4 15.6 4.2 15.8 4.6L17 6.5H19C20.1 6.5 21 7.4 21 8.5V17C21 18.1 20.1 19 19 19H5C3.9 19 3 18.1 3 17V8.5Z" fill="#f59e0b" stroke="#1a1a22" strokeWidth="2" strokeLinejoin="round" />
      <circle cx="12" cy="12.5" r="3.6" fill="#fff" stroke="#1a1a22" strokeWidth="2" />
    </svg>
  );
}

/** Photo/upload glyph in the same style. */
function UploadIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ display: "block", flexShrink: 0 }} aria-hidden>
      <rect x="3" y="4.5" width="18" height="15" rx="3" fill="#fff" stroke="#1a1a22" strokeWidth="2" />
      <circle cx="15.5" cy="9" r="1.9" fill="#f59e0b" stroke="#1a1a22" strokeWidth="1.5" />
      <path d="M3.5 16.5L8.5 11.5L12.5 15.5" stroke="#1a1a22" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M11 17.5L15 13.5L20.5 18" stroke="#1a1a22" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const NearbyMap = lazy(() => import("@/components/NearbyMap")); // leaflet bundle — load only on the Map tab

const CREAM = "#fbf6ec";
const INK = "#1a1a22";
const OUTLINE = "#1a1a22";
const MUTED = "#6b6b73";

type Cat = {
  id: number; kind?: string; name: string; breed: string; rarity: string; rarityLabel: string; rarityColor: string;
  element: string; hp: number; atk: number; def: number; spd: number; photo_path: string; caught_at?: string;
  source?: string; // "camera" (real) | "wild" (game spawn)
};

type Phase = "intro" | "camera" | "throw" | "catching" | "result";

export default function CatCatch() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [phase, setPhase] = useState<Phase>("intro");
  const [pendingImg, setPendingImg] = useState<string | null>(null); // captured image awaiting the throw
  const [view, setView] = useState<"catch" | "map" | "battle">("catch");
  const [camErr, setCamErr] = useState<string | null>(null);
  const [result, setResult] = useState<{ caught: boolean; cat?: Cat; reason?: string; antiCheat?: boolean; pointsAwarded?: number } | null>(null);
  const [collection, setCollection] = useState<Cat[]>([]);
  const [sort, setSort] = useState<"recent" | "rarity">("recent");
  const [notAuthed, setNotAuthed] = useState(false);

  const loadCollection = useCallback(() => {
    fetch("/api/catch", { headers: getAuthHeaders() })
      .then((r) => (r.status === 401 ? (setNotAuthed(true), null) : r.ok ? r.json() : null))
      .then((d) => { if (d?.cats) setCollection(d.cats); })
      .catch(() => {});
  }, []);

  useEffect(() => { loadCollection(); }, [loadCollection]);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  // The <video> is unmounted during throw/result; whenever we (re)enter a phase
  // that shows it, re-attach the still-live stream. Without this, "Catch another"
  // / throw-"Cancel" remount a blank <video> → black camera + dead shutter.
  useEffect(() => {
    if ((phase === "camera" || phase === "catching") && videoRef.current && streamRef.current && videoRef.current.srcObject !== streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [phase]);

  const startCamera = async () => {
    setCamErr(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      streamRef.current = stream;
      setPhase("camera");
      // attach after the video element mounts
      setTimeout(() => { if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play().catch(() => {}); } }, 50);
    } catch (e: any) {
      setCamErr(
        e?.name === "NotAllowedError" ? "Camera permission denied — allow it to catch cats."
        : e?.name === "NotFoundError" ? "No camera found — open this on your phone to catch cats."
        : "Couldn't open the camera. Try on a phone with camera access."
      );
    }
  };

  const getGeo = (): Promise<{ lat: number; lng: number } | null> =>
    new Promise((resolve) => {
      if (!navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => resolve(null),
        { timeout: 4000, maximumAge: 60_000 },
      );
    });

  const submitPhoto = async (imageDataUrl: string) => {
    setPhase("catching");
    const geo = await getGeo();
    try {
      const res = await fetch("/api/catch", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ imageDataUrl, lat: geo?.lat, lng: geo?.lng }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setResult({ caught: false, reason: data?.error || "Something went wrong — try again." }); }
      else {
        setResult(data);
        if (data.caught && data.cat) setCollection((c) => [data.cat, ...c]);
      }
    } catch {
      setResult({ caught: false, reason: "Network error — try again." });
    }
    setPhase("result");
  };

  const capture = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = Math.min(1024, video.videoWidth);
    canvas.height = Math.round(canvas.width * (video.videoHeight / video.videoWidth));
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    // Snap → throw-the-can mini-game → then submit for vision verification.
    setPendingImg(canvas.toDataURL("image/jpeg", 0.85));
    setPhase("throw");
  };

  // Desktop / no-camera fallback. The SAME vision anti-cheat runs on uploads,
  // so screenshots, photos of screens, drawings and memes are still rejected.
  const onUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => { if (typeof reader.result === "string") { setPendingImg(reader.result); setPhase("throw"); } };
      reader.readAsDataURL(file);
    }
    e.target.value = "";
  };

  // After an upload there's no live camera stream to return to — going to
  // "camera" would show a dead black view. Re-enter the camera only when a
  // stream is actually running; otherwise return to the intro (camera + upload).
  const again = () => { setResult(null); setPhase(streamRef.current ? "camera" : "intro"); };
  const done = () => { setResult(null); stopCamera(); setPhase("intro"); };

  if (notAuthed) {
    return <Shell><Empty>Connect your wallet to start catching.</Empty></Shell>;
  }

  return (
    <Shell>
      {/* Tabs */}
      <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 18 }}>
        {(["catch", "map", "battle"] as const).map((t) => (
          <button key={t} onClick={() => setView(t)} style={{
            padding: "8px 18px", borderRadius: 999, cursor: "pointer", fontSize: 14, fontWeight: 800,
            border: `2.5px solid ${OUTLINE}`, background: view === t ? "#f59e0b" : "#fff", color: INK,
            boxShadow: view === t ? "0 3px 0 rgba(26,26,34,0.25)" : "none",
            display: "inline-flex", alignItems: "center", gap: 7,
          }}>
            {t === "catch" ? <CameraIcon size={17} /> : t === "map" ? <Icon name="compass" size={18} /> : <Icon name="boxing" size={18} />}
            {t === "catch" ? "Catch" : t === "map" ? "Nearby" : "Battle"}
          </button>
        ))}
      </div>

      {view === "map" && (
        <Suspense fallback={<Empty>Loading map…</Empty>}>
          <NearbyMap onCaught={(cat: Cat) => setCollection((c) => [cat, ...c])} />
        </Suspense>
      )}

      {view === "battle" && <AlleyClash collection={collection} />}

      {view === "catch" && (<>
      {/* ── Capture zone ── */}
      <div style={{ position: "relative", borderRadius: 22, overflow: "hidden", border: `3px solid ${OUTLINE}`, background: "#000", aspectRatio: "3 / 4", maxHeight: 520, margin: "0 auto 18px", boxShadow: "0 10px 0 rgba(26,26,34,0.12)" }}>
        {phase === "intro" && (
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, background: CREAM, padding: 24, textAlign: "center" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/mascot.jpg" alt="MY AI PET" style={{ width: 92, height: 92, borderRadius: 22, objectFit: "cover", border: `3px solid ${OUTLINE}`, boxShadow: "0 5px 0 rgba(26,26,34,0.18)" }} />
            <div style={{ fontSize: 17, fontWeight: 800, color: INK, maxWidth: 320, lineHeight: 1.4 }}>See an animal out in the world? Point your camera and catch it.</div>
            <div style={{ fontSize: 13, color: MUTED, maxWidth: 300 }}>Mostly cats &amp; dogs — but any real animal counts. Screenshots and photos of screens won&apos;t work.</div>
            <button onClick={startCamera} style={{ ...bigBtn, display: "inline-flex", alignItems: "center", gap: 8 }}><CameraIcon size={20} /> Open camera</button>
            {camErr && <div style={{ fontSize: 13, color: "#9b1c1c", maxWidth: 300 }}>{camErr}</div>}
            <label style={{ ...bigBtn, background: "#fff", border: `2.5px solid ${OUTLINE}`, display: "inline-flex", alignItems: "center", gap: 8 }}>
              <UploadIcon size={20} /> Upload a photo
              <input type="file" accept="image/*" onChange={onUpload} style={{ display: "none" }} />
            </label>
            <div style={{ fontSize: 11, color: MUTED, maxWidth: 280 }}>No camera? Upload works too — but it&apos;s still checked, so screenshots won&apos;t pass.</div>
          </div>
        )}

        {(phase === "camera" || phase === "catching") && (
          <>
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <video ref={videoRef} playsInline muted style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
            {/* reticle */}
            <div style={{ position: "absolute", inset: 0, pointerEvents: "none", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ width: "62%", aspectRatio: "1", border: "3px dashed rgba(255,255,255,0.85)", borderRadius: 24 }} />
            </div>
            {phase === "catching" && (
              <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, color: "#fff" }}>
                <div style={{ animation: "ccBob 0.7s ease-in-out infinite" }}><Icon name="paw" size={56} /></div>
                <div style={{ fontWeight: 800, fontSize: 18 }}>Catching…</div>
              </div>
            )}
            {phase === "camera" && (
              <button onClick={capture} aria-label="Catch" style={{ position: "absolute", bottom: 18, left: "50%", transform: "translateX(-50%)", width: 74, height: 74, borderRadius: "50%", border: `5px solid #fff`, background: "#f59e0b", cursor: "pointer", boxShadow: "0 4px 0 rgba(0,0,0,0.3)" }} />
            )}
          </>
        )}

        {phase === "throw" && pendingImg && (
          <ThrowCan image={pendingImg} onThrow={() => submitPhoto(pendingImg)} onCancel={again} />
        )}

        {phase === "result" && result && (
          result.caught && result.cat ? (
            <RevealCard cat={result.cat} points={result.pointsAwarded || 0} onAgain={again} onDone={done} />
          ) : (
            <div style={{ position: "absolute", inset: 0, background: CREAM, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, padding: 20, textAlign: "center", overflowY: "auto" }}>
              <Icon name={result.antiCheat ? "shield" : "footprints"} size={52} />
              <div style={{ fontSize: 17, fontWeight: 800, color: INK, maxWidth: 320, lineHeight: 1.4 }}>{result.antiCheat ? "Nice try!" : "No catch"}</div>
              <div style={{ fontSize: 14, color: MUTED, maxWidth: 320 }}>{result.reason}</div>
              <button onClick={again} style={bigBtn}>Try again</button>
              <button onClick={done} style={{ ...ghostBtn, marginTop: 2 }}>Done</button>
            </div>
          )
        )}
      </div>

      {/* ── Field Journal dashboard ── */}
      <FieldJournal collection={collection} />

      {/* ── Album ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 22, marginBottom: 12 }}>
        <h2 style={{ fontSize: 19, fontWeight: 800, color: INK, margin: 0 }}>Your album</h2>
        {collection.length > 1 && (
          <div style={{ display: "flex", gap: 6 }}>
            {(["recent", "rarity"] as const).map((s) => (
              <button key={s} onClick={() => setSort(s)} style={{
                padding: "5px 12px", borderRadius: 999, cursor: "pointer", fontSize: 12, fontWeight: 800,
                border: `2px solid ${OUTLINE}`, background: sort === s ? "#f59e0b" : "#fff", color: INK,
              }}>{s === "recent" ? "Recent" : "Rarity"}</button>
            ))}
          </div>
        )}
      </div>
      {collection.length === 0 ? (
        <Empty>No catches yet — go find an animal!</Empty>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 14 }}>
          {sortCollection(collection, sort).map((c) => <CatCard key={c.id} cat={c} compact />)}
        </div>
      )}
      </>)}

      <style>{`
        @keyframes ccBob{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}
        @keyframes ccPulse{0%,100%{transform:translateX(-50%) scale(1);opacity:.9}50%{transform:translateX(-50%) scale(1.12);opacity:.55}}
        @keyframes ccFade{from{opacity:0}to{opacity:1}}
        @keyframes ccPop{0%{transform:scale(.3);opacity:0}60%{transform:scale(1.08)}100%{transform:scale(1);opacity:1}}
      `}</style>
    </Shell>
  );
}

const tinyGhost: React.CSSProperties = { padding: "5px 12px", borderRadius: 999, border: "2px solid #fff", background: "rgba(0,0,0,0.4)", color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer" };

/** Cat-food can graphic (the throwable). */
function CanGraphic() {
  return (
    <svg width="72" height="72" viewBox="0 0 72 72" style={{ filter: "drop-shadow(0 4px 0 rgba(0,0,0,.4))" }} aria-hidden>
      <ellipse cx="36" cy="20" rx="22" ry="7" fill="#c0392b" stroke={OUTLINE} strokeWidth="3" />
      <rect x="14" y="20" width="44" height="34" fill="#e74c3c" stroke={OUTLINE} strokeWidth="3" />
      <ellipse cx="36" cy="54" rx="22" ry="7" fill="#c0392b" stroke={OUTLINE} strokeWidth="3" />
      <rect x="18" y="29" width="36" height="17" rx="3" fill={CREAM} stroke={OUTLINE} strokeWidth="2" />
      <circle cx="36" cy="37.5" r="6" fill="#f59e0b" stroke={OUTLINE} strokeWidth="2" />
    </svg>
  );
}

/** Throw-the-can mini-game: drag the can and release to throw, then submit. */
function ThrowCan({ image, onThrow, onCancel }: { image: string; onThrow: () => void; onCancel: () => void }) {
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const [flying, setFlying] = useState(false);
  const startRef = useRef<{ x: number; y: number } | null>(null);

  const launch = () => { if (flying) return; setFlying(true); setTimeout(onThrow, 520); };
  const onDown = (e: React.PointerEvent) => { (e.target as HTMLElement).setPointerCapture?.(e.pointerId); startRef.current = { x: e.clientX, y: e.clientY }; setDrag({ x: 0, y: 0 }); };
  const onMove = (e: React.PointerEvent) => { if (!startRef.current) return; setDrag({ x: e.clientX - startRef.current.x, y: e.clientY - startRef.current.y }); };
  const onUp = () => { if (!startRef.current) return; startRef.current = null; setDrag(null); launch(); };

  const canStyle: React.CSSProperties = flying
    ? { transform: "translate(-50%, -260px) scale(0.4) rotate(220deg)", opacity: 0, transition: "transform 0.52s cubic-bezier(.2,.7,.3,1), opacity 0.52s ease" }
    : drag
      ? { transform: `translate(calc(-50% + ${Math.max(-120, Math.min(120, drag.x))}px), ${Math.max(-190, Math.min(20, drag.y))}px)`, transition: "none" }
      : { transform: "translate(-50%, 0)", transition: "transform 0.2s ease" };

  return (
    <div style={{ position: "absolute", inset: 0, background: "#000" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={image} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", filter: "brightness(0.92)" }} />
      <div style={{ position: "absolute", top: "26%", left: "50%", transform: "translateX(-50%)", width: 92, height: 92, border: "3px dashed rgba(255,255,255,0.9)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", animation: "ccPulse 1.6s ease-in-out infinite", pointerEvents: "none" }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#fff" }} />
      </div>
      {!flying && <div style={{ position: "absolute", top: 16, left: 0, right: 0, textAlign: "center", color: "#fff", fontWeight: 800, fontSize: 14, textShadow: "0 1px 4px rgba(0,0,0,.6)", pointerEvents: "none" }}>Hold &amp; drag the can — release to throw</div>}
      <div onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
        style={{ position: "absolute", bottom: 26, left: "50%", width: 84, height: 84, cursor: "grab", touchAction: "none", display: "flex", alignItems: "center", justifyContent: "center", ...canStyle }} aria-label="Throw the can">
        <CanGraphic />
      </div>
      {!flying && <button onClick={launch} style={{ position: "absolute", bottom: 12, right: 10, ...tinyGhost }}>Throw</button>}
      {!flying && <button onClick={onCancel} style={{ position: "absolute", bottom: 12, left: 10, ...tinyGhost }}>Cancel</button>}
    </div>
  );
}

/** The "ANIMAL FOUND" reveal — the caught animal slaps down as a fresh die-cut
 *  sticker on a warm-ink developing plate, then its rarity wax seal stamps in. */
function RevealCard({ cat, points, onAgain, onDone }: { cat: Cat; points: number; onAgain: () => void; onDone: () => void }) {
  const stock = rarityStock(rarityRank(cat.rarity));
  const wild = cat.source === "wild";
  return (
    <div style={{ position: "absolute", inset: 0, background: "#1f1b16", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 11, padding: 18, textAlign: "center", overflowY: "auto", animation: "ccFade .35s ease" }}>
      {/* Freshly-slapped sticker */}
      <div style={{ position: "relative", padding: 9, borderRadius: 18, background: "#fff", border: "3px solid #1a1a22", boxShadow: "0 8px 0 rgba(0,0,0,.35)", animation: "ccPop .5s cubic-bezier(.2,1.3,.4,1)" }}>
        <div style={{ width: 138, height: 138, borderRadius: 12, overflow: "hidden", border: "2px solid #1a1a22", background: wild ? CREAM : "#000" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={cat.photo_path} alt={cat.name} style={{ width: "100%", height: "100%", objectFit: wild ? "contain" : "cover", padding: wild ? 12 : 0 }} />
        </div>
        <WaxSeal seal={stock.seal} size={36} stamp title={`${cat.rarityLabel} rarity`} style={{ position: "absolute", top: -8, right: -8, animationDelay: "140ms", zIndex: 2 }} />
      </div>
      <div style={{ fontSize: 12, fontWeight: 800, color: "#f59e0b", letterSpacing: 3, fontFamily: "'JetBrains Mono', monospace" }}>ANIMAL FOUND</div>
      <div style={{ fontSize: 26, fontWeight: 800, color: "#fff", fontFamily: "'Space Grotesk', sans-serif", lineHeight: 1, letterSpacing: "-0.01em" }}>{cat.name}</div>
      <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.7)", textTransform: "uppercase", letterSpacing: 1.5, fontFamily: "'JetBrains Mono', monospace" }}>{cat.rarityLabel} · {cat.kind}</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center" }}>
        {([["HP", cat.hp], ["ATK", cat.atk], ["DEF", cat.def], ["SPD", cat.spd]] as const).map(([k, v]) => (
          <span key={k} style={{ background: CREAM, color: INK, borderRadius: 8, padding: "3px 9px", fontSize: 11, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", boxShadow: "0 3px 0 rgba(0,0,0,.3)" }}>{k} {v}</span>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 2 }}>
        {points > 0 && <span style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "#f59e0b", color: INK, fontWeight: 800, fontSize: 13, borderRadius: 999, padding: "4px 12px", border: `2px solid ${INK}` }}>+{points} <Icon name="coin" size={14} /></span>}
        <span style={{ color: "rgba(255,255,255,0.55)", fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 700 }}>{`№ ${String(cat.id).padStart(6, "0")}`}</span>
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
        <button onClick={onAgain} style={bigBtn}>Catch another</button>
        <button onClick={onDone} style={{ ...ghostBtn, borderColor: "rgba(255,255,255,0.5)", color: "#fff" }}>Done</button>
      </div>
    </div>
  );
}

/** Alley Clash — battle a caught animal against a generated practice opponent. */
function AlleyClash({ collection }: { collection: Cat[] }) {
  const [sel, setSel] = useState<Cat | null>(null);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<any>(null);

  const fight = async () => {
    if (!sel || busy) return;
    setBusy(true); setRes(null);
    try {
      const r = await fetch("/api/catch/battle", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ catId: sel.id }),
      });
      const d = await r.json().catch(() => ({}));
      setRes(r.ok ? d : { error: d?.error || "Battle failed — try again." });
    } catch { setRes({ error: "Network error — try again." }); }
    setBusy(false);
  };

  if (collection.length === 0) {
    return <Empty>Catch an animal first, then bring it to the alley.</Empty>;
  }
  if (res && !res.error) return <BattleResult res={res} onAgain={() => setRes(null)} />;

  return (
    <div>
      <div style={{ textAlign: "center", marginBottom: 14 }}>
        <div style={{ fontFamily: "monospace", fontSize: 11, letterSpacing: "0.18em", color: "#b45309", textTransform: "uppercase" }}>Alley Clash · practice</div>
        <h2 style={{ fontSize: 20, fontWeight: 900, color: INK, margin: "4px 0 0" }}>Send a fighter to the alley</h2>
        <p style={{ fontSize: 13, color: MUTED, margin: "6px auto 0", maxWidth: 380, lineHeight: 1.5 }}>Pick one of your caught animals to spar a street stray — a practice opponent, not another player. Win to earn season points.</p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(94px, 1fr))", gap: 10, marginBottom: 16 }}>
        {collection.map((c) => {
          const on = sel?.id === c.id;
          return (
            <button key={c.id} onClick={() => setSel(c)} style={{ padding: 0, borderRadius: 14, overflow: "hidden", cursor: "pointer", border: `3px solid ${on ? "#f59e0b" : OUTLINE}`, background: "#fff", boxShadow: on ? "0 4px 0 rgba(26,26,34,.25)" : "0 2px 0 rgba(26,26,34,.15)", transform: on ? "translateY(-2px)" : "none" }}>
              <div style={{ position: "relative", width: "100%", aspectRatio: "1", background: c.source === "wild" ? CREAM : "#eee" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={c.photo_path} alt={c.name} style={{ width: "100%", height: "100%", objectFit: c.source === "wild" ? "contain" : "cover", padding: c.source === "wild" ? "14%" : 0 }} />
              </div>
              <div style={{ fontSize: 11, fontWeight: 800, color: INK, padding: "5px 4px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</div>
            </button>
          );
        })}
      </div>
      {sel && (
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 13, color: MUTED, marginBottom: 10 }}>Sending <b style={{ color: INK }}>{sel.name}</b> · ATK {sel.atk} · DEF {sel.def} · SPD {sel.spd}</div>
          <button onClick={fight} disabled={busy} style={{ ...bigBtn, opacity: busy ? 0.7 : 1, display: "inline-flex", alignItems: "center", gap: 8 }}><Icon name="boxing" size={20} /> {busy ? "Fighting…" : "Fight!"}</button>
        </div>
      )}
      {res?.error && <div style={{ textAlign: "center", color: "#9b1c1c", fontSize: 13, marginTop: 12 }}>{res.error}</div>}
    </div>
  );
}

function BattleResult({ res, onAgain }: { res: any; onAgain: () => void }) {
  const won = !!res.won;
  const fighter = (f: any, side: "you" | "them") => (
    <div style={{ textAlign: "center", flex: 1, minWidth: 0 }}>
      <div style={{ width: 84, height: 84, margin: "0 auto", borderRadius: 16, border: `3px solid ${OUTLINE}`, background: side === "you" ? "#fff" : CREAM, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Icon name={f.icon} size={52} />
      </div>
      <div style={{ fontWeight: 800, color: INK, marginTop: 6, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{f.name}</div>
      <div style={{ height: 8, borderRadius: 999, background: "rgba(0,0,0,.1)", overflow: "hidden", marginTop: 6 }}>
        <div style={{ width: `${Math.max(0, Math.round((f.hpLeft / f.hpMax) * 100))}%`, height: "100%", background: side === "you" ? "#22c55e" : "#ef4444", transition: "width .6s ease" }} />
      </div>
      <div style={{ fontSize: 10.5, color: MUTED, marginTop: 3, fontFamily: "monospace" }}>HP {Math.max(0, f.hpLeft)}/{f.hpMax}</div>
    </div>
  );
  return (
    <div style={{ textAlign: "center", padding: "6px 0 4px" }}>
      <div style={{ fontSize: 26, fontWeight: 900, color: won ? "#16a34a" : "#dc2626", letterSpacing: 1 }}>{won ? "VICTORY!" : "DEFEATED"}</div>
      <div style={{ fontSize: 12, color: MUTED, marginBottom: 16 }}>{res.turns} turns in the alley</div>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, maxWidth: 360, margin: "0 auto" }}>
        {fighter(res.you, "you")}
        <div style={{ fontWeight: 900, color: INK, alignSelf: "center", fontSize: 18 }}>VS</div>
        {fighter(res.opponent, "them")}
      </div>
      {won && res.pointsAwarded > 0 && (
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 16, background: "#f59e0b", color: INK, fontWeight: 800, fontSize: 13, borderRadius: 999, padding: "5px 14px", border: `2px solid ${OUTLINE}` }}>+{res.pointsAwarded} season points <Icon name="coin" size={14} /></div>
      )}
      <div style={{ marginTop: 18 }}>
        <button onClick={onAgain} style={bigBtn}>Battle again</button>
      </div>
    </div>
  );
}

const RARITY_ORDER = ["gray", "green", "blue", "purple", "orange"];
function rarityRank(r: string): number { const i = RARITY_ORDER.indexOf(r); return i < 0 ? 0 : i; }
function sortCollection(list: Cat[], sort: "recent" | "rarity"): Cat[] {
  const arr = [...list];
  if (sort === "rarity") arr.sort((a, b) => rarityRank(b.rarity) - rarityRank(a.rarity) || b.id - a.id);
  else arr.sort((a, b) => b.id - a.id); // id increases with time → newest first
  return arr;
}
function isToday(iso?: string): boolean {
  if (!iso) return false;
  const d = new Date(iso), n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}

/** "Field Journal" dashboard — real counts derived from the collection. */
function FieldJournal({ collection }: { collection: Cat[] }) {
  const collected = collection.length;
  const rarest = collection.reduce<Cat | null>((best, c) => (!best || rarityRank(c.rarity) > rarityRank(best.rarity) ? c : best), null);
  const today = collection.filter((c) => isToday(c.caught_at)).length;
  const kinds = new Set(collection.map((c) => c.kind)).size;
  const note = (label: string, value: string, color: string) => (
    <div style={{ background: "#fff", border: `2px solid ${INK}`, borderRadius: 10, padding: "8px 10px", boxShadow: "0 3px 0 rgba(26,26,34,0.14)" }}>
      <div style={{ fontSize: 9.5, fontFamily: "'JetBrains Mono',monospace", letterSpacing: ".1em", color: MUTED, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 800, color, fontFamily: "'Space Grotesk',sans-serif" }}>{value}</div>
    </div>
  );
  return (
    <div style={{ background: "#fff", border: `3px solid ${OUTLINE}`, borderRadius: 18, boxShadow: "0 6px 0 rgba(26,26,34,0.12)", padding: "16px 18px", marginTop: 4 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 10.5, fontFamily: "monospace", letterSpacing: ".14em", color: "#b45309", textTransform: "uppercase" }}>Animals collected</div>
          <div style={{ fontSize: 19, fontWeight: 900, color: INK }}>Field Journal</div>
        </div>
        <div style={{ fontSize: 40, fontWeight: 900, color: INK, lineHeight: 1, fontFamily: "'Space Grotesk',sans-serif" }}>{collected}</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
        {note("Rarest", rarest ? rarest.rarityLabel : "—", rarest ? rarest.rarityColor : MUTED)}
        {note("Today", String(today), INK)}
        {note("Species", String(kinds), INK)}
      </div>
    </div>
  );
}

function CatCard({ cat, compact }: { cat: Cat; compact?: boolean }) {
  const stock = rarityStock(rarityRank(cat.rarity));
  const wild = cat.source === "wild";
  return (
    <div className="dc dc-sm" style={{
      position: "relative",
      width: "100%", maxWidth: compact ? undefined : 260, margin: "0 auto",
      borderRadius: 16, padding: 8,
      border: `${stock.keyline}px solid ${stock.keylineColor}`, background: stock.marginStock,
      ...dcVars(stock.shadowAlpha, false, stock.marginHairline ? "inset 0 0 0 1.5px rgba(26,26,34,0.18)" : ""),
    }}>
      <div style={{ position: "relative", borderRadius: 10, overflow: "hidden", border: `2px solid ${INK}`, background: "#fff" }}>
        <div style={{ position: "relative", width: "100%", aspectRatio: "1 / 1", background: wild ? CREAM : "#eee" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={cat.photo_path} alt={cat.name} style={{ width: "100%", height: "100%", objectFit: wild ? "contain" : "cover", display: "block", padding: wild ? "12%" : 0 }} />
          {wild && (
            <div style={{ position: "absolute", bottom: 6, left: 6, background: "#f59e0b", color: INK, fontSize: 9, fontWeight: 800, padding: "2px 7px", borderRadius: 6, textTransform: "uppercase", letterSpacing: 0.5, border: `1.5px solid ${INK}`, fontFamily: "'JetBrains Mono',monospace" }}>Wild</div>
          )}
        </div>
        <div style={{ padding: compact ? "8px 9px" : "9px 11px", background: CREAM, borderTop: `2px solid ${INK}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: compact ? 14 : 16, fontWeight: 800, color: INK, fontFamily: "'Space Grotesk',sans-serif" }}>
            <Icon name={kindIcon(cat.kind)} size={compact ? 15 : 17} />
            <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{cat.name}</span>
          </div>
          <div style={{ fontSize: 11, color: MUTED, marginBottom: 6, fontFamily: "'JetBrains Mono',monospace" }}>{cat.breed} · {cat.element}</div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", fontSize: 10, fontFamily: "'JetBrains Mono',monospace", color: INK }}>
            {([["HP", cat.hp], ["ATK", cat.atk], ["DEF", cat.def], ["SPD", cat.spd]] as const).map(([k, v]) => (
              <span key={k} style={{ background: "#fff", borderRadius: 6, padding: "2px 6px", border: `1.5px solid ${INK}` }}>{k} {v}</span>
            ))}
          </div>
        </div>
      </div>
      {/* Rarity wax seal — anchored to the die-cut margin */}
      <WaxSeal seal={stock.seal} size={compact ? 26 : 30} title={`${cat.rarityLabel} rarity`} style={{ position: "absolute", top: -7, right: -7, zIndex: 2 }} />
    </div>
  );
}

const bigBtn: React.CSSProperties = { padding: "13px 26px", borderRadius: 999, border: `3px solid ${OUTLINE}`, background: "#f59e0b", color: INK, fontWeight: 800, fontSize: 15, cursor: "pointer", boxShadow: "0 4px 0 rgba(26,26,34,0.25)" };
const ghostBtn: React.CSSProperties = { padding: "9px 18px", borderRadius: 999, border: `2px solid ${OUTLINE}`, background: "transparent", color: INK, fontWeight: 700, fontSize: 13.5, cursor: "pointer" };

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "8px 0 40px", fontFamily: "'Space Grotesk', system-ui, sans-serif" }}>
      <div style={{ marginBottom: 18, textAlign: "center" }}>
        <div style={{ fontFamily: "monospace", fontSize: 11, letterSpacing: "0.18em", color: "#b45309", textTransform: "uppercase" }}>Catch · real animals only</div>
        <h1 style={{ fontSize: 28, fontWeight: 900, color: INK, margin: "6px 0 0", letterSpacing: "-0.02em" }}>Catch animals</h1>
        <p style={{ fontSize: 14.5, color: MUTED, margin: "8px auto 0", lineHeight: 1.55, maxWidth: 440 }}>
          Spot an animal in the wild — mostly cats &amp; dogs, but anything counts — snap it, and it becomes a collectible with its own rarity, element and stats. No cheating: screenshots don&apos;t count.
        </p>
      </div>
      {children}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: "24px 0", fontSize: 14, color: MUTED, textAlign: "center" }}>{children}</div>;
}
