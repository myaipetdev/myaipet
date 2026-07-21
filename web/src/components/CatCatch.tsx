"use client";

/**
 * CatCatch — photograph REAL street cats & dogs and collect them like Pokémon.
 * Live camera, with a photo-upload fallback for desktop / no-camera devices.
 * Either way the image is verified by Grok vision server-side: screenshots /
 * photos-of-screens / drawings / memes are rejected, so you can only catch
 * animals you actually find.
 *
 * Collectible Editorial — every caught animal is a foil-stamped collectible on a
 * warm cream editorial print piece. Section signature: teal-green (#1A7E68).
 */

import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { getAuthHeaders } from "@/lib/api";
import Icon from "@/components/Icon";
import Reveal from "@/components/Reveal";
import { kindIcon, CATCH_POINTS, RARITY_TIERS } from "@/lib/catch/game";
import { rarityStock } from "@/components/Sticker";
import CollectibleFrame from "@/components/editorial/CollectibleFrame";

/** Camera glyph in the editorial teal/ink style (no emoji). `body` overrides the
 *  camera-body fill so the glyph never disappears teal-on-teal on active chips. */
function CameraIcon({ size = 20, body = "#1A7E68" }: { size?: number; body?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ display: "block", flexShrink: 0 }} aria-hidden>
      <path d="M3 8.5C3 7.4 3.9 6.5 5 6.5H7L8.2 4.6C8.4 4.2 8.8 4 9.2 4H14.8C15.2 4 15.6 4.2 15.8 4.6L17 6.5H19C20.1 6.5 21 7.4 21 8.5V17C21 18.1 20.1 19 19 19H5C3.9 19 3 18.1 3 17V8.5Z" fill={body} stroke="#211A12" strokeWidth="2" strokeLinejoin="round" />
      <circle cx="12" cy="12.5" r="3.6" fill="#FBF6EC" stroke="#211A12" strokeWidth="2" />
    </svg>
  );
}

/** Photo/upload glyph in the same style. */
function UploadIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ display: "block", flexShrink: 0 }} aria-hidden>
      <rect x="3" y="4.5" width="18" height="15" rx="3" fill="#FBF6EC" stroke="#211A12" strokeWidth="2" />
      <circle cx="15.5" cy="9" r="1.9" fill="#1A7E68" stroke="#211A12" strokeWidth="1.5" />
      <path d="M3.5 16.5L8.5 11.5L12.5 15.5" stroke="#211A12" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M11 17.5L15 13.5L20.5 18" stroke="#211A12" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const NearbyMap = lazy(() => import("@/components/NearbyMap")); // leaflet bundle — load only on the Map tab

// ── Collectible Editorial tokens (section signature: teal-green) ──
const PAPER = "#FBF6EC";
const INSET = "#F5EFE2";
const CREAM = "#FBF6EC"; // legacy alias → paper
const INK = "#211A12";
const OUTLINE = "rgba(33,26,18,.13)"; // hairline rule
const MUTED = "#7A6E5A";
const TEAL = "#1A7E68"; // catch section accent
const DISP = "var(--ed-disp)";
const BODY = "var(--ed-body)";
const MONO = "var(--ed-m)";

type Cat = {
  id: number; kind?: string; name: string; breed: string; rarity: string; rarityLabel: string; rarityColor: string;
  element: string; hp: number; atk: number; def: number; spd: number; photo_path: string; caught_at?: string;
  source?: string; // "camera" (real) | "wild" (game spawn)
  lat?: number | null; lng?: number | null;
  map_public?: boolean; // community-map consent — default false (private)
};

type Phase = "intro" | "camera" | "throw" | "catching" | "result";

/** Server-truth mission meters (GET /api/catch `meta`) — read from the same
 *  counters the billing/award paths write ("vision:free", "ap:catch"). */
type CatchMeta = {
  freeScansLeft: number; freeScansPerDay: number;
  catchPointsToday: number; catchPointsCap: number;
};

// REAL reward bounds — derived from CATCH_POINTS, the exact per-rarity amounts
// /api/catch pays through awardPointsCapped. Never hand-type a "+N pts" here:
// deriving from the server's own table means the promise can't drift.
const CATCH_PT_MIN = Math.min(...Object.values(CATCH_POINTS));
const CATCH_PT_MAX = Math.max(...Object.values(CATCH_POINTS));

// ── Client-side downscale/compress — kills the "Photo too large" dead-end.
// Longest edge ≤2000px, re-encoded as JPEG, quality stepped down until the
// payload is ~1.5MB (well under the server's ~6MB guard). Only files the
// browser truly cannot decode reject. ──
const UPLOAD_MAX_DIM = 2000;
const UPLOAD_MAX_B64 = 2_000_000; // base64 chars ≈ 1.5MB binary
async function downscalePhoto(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("unreadable"));
      i.src = url;
    });
    const w = img.naturalWidth, h = img.naturalHeight;
    if (!w || !h) throw new Error("empty-image");
    const scale = Math.min(1, UPLOAD_MAX_DIM / Math.max(w, h));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no-canvas");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    let out = "";
    for (const q of [0.85, 0.7, 0.55, 0.4]) {
      out = canvas.toDataURL("image/jpeg", q);
      if (out.length <= UPLOAD_MAX_B64) break;
    }
    return out;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function CatCatch() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [phase, setPhase] = useState<Phase>("intro");
  const [pendingImg, setPendingImg] = useState<string | null>(null); // captured image awaiting the throw
  const [view, setView] = useState<"catch" | "map" | "battle">("catch");
  const [camErr, setCamErr] = useState<string | null>(null);
  const [result, setResult] = useState<{ caught: boolean; cat?: Cat; reason?: string; antiCheat?: boolean; pointsAwarded?: number; newSpecies?: boolean } | null>(null);
  const [collection, setCollection] = useState<Cat[]>([]);
  const [sort, setSort] = useState<"recent" | "rarity">("recent");
  const [notAuthed, setNotAuthed] = useState(false);
  const [uploadErr, setUploadErr] = useState<string | null>(null);
  const [meta, setMeta] = useState<CatchMeta | null>(null);

  const loadCollection = useCallback(() => {
    fetch("/api/catch", { headers: getAuthHeaders() })
      .then((r) => (r.status === 401 ? (setNotAuthed(true), null) : r.ok ? r.json() : null))
      .then((d) => { if (d?.cats) setCollection(d.cats); if (d?.meta) setMeta(d.meta); })
      .catch(() => {});
  }, []);

  // ── Community-map consent (owner-scoped, default OFF) ──
  // PATCH /api/catch/[id] { map_public } — resolves true on success so the
  // reveal checkbox can reflect server truth, never optimistic.
  const setMapPublic = useCallback(async (id: number, val: boolean): Promise<boolean> => {
    try {
      const r = await fetch(`/api/catch/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ map_public: val }),
      });
      if (!r.ok) return false;
      setCollection((c) => c.map((x) => (x.id === id ? { ...x, map_public: val } : x)));
      return true;
    } catch { return false; }
  }, []);

  // Hard-delete one of YOUR catches (row + stored photo, via the server's
  // reference-aware cleanup queue). Plain confirm — no dark patterns either way.
  const deleteCatch = useCallback(async (cat: Cat) => {
    if (!window.confirm(`Delete ${cat.name} permanently? The catch and its photo are removed for good.`)) return;
    try {
      const r = await fetch(`/api/catch/${cat.id}`, { method: "DELETE", headers: getAuthHeaders() });
      if (r.ok) setCollection((c) => c.filter((x) => x.id !== cat.id));
    } catch { /* leave the card in place on failure */ }
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
        // "New species" = REAL first-of-its-kind check against the collection
        // as it stood before this catch (guide-normalized: kitten counts as cat).
        const newSpecies = !!(data.caught && data.cat?.kind) && !collection.some((c) => guideKey(c.kind) === guideKey(data.cat.kind));
        setResult({ ...data, newSpecies });
        if (data.caught && data.cat) setCollection((c) => [data.cat, ...c]);
      }
    } catch {
      setResult({ caught: false, reason: "Network error — try again." });
    }
    setPhase("result");
    // A scan was consumed whether or not anything was caught — refresh the
    // server-truth mission meters (scans left, catch points today).
    loadCollection();
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
  // Oversized photos are downscaled/compressed client-side (downscalePhoto) so
  // "Photo too large" can never dead-end a real catch — the only error left is
  // a file the browser genuinely cannot decode.
  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadErr(null);
    try {
      const dataUrl = await downscalePhoto(file);
      setPendingImg(dataUrl);
      setPhase("throw");
    } catch {
      setUploadErr("Couldn't read that file — use a regular photo (JPEG, PNG or WebP).");
    }
  };

  // After an upload there's no live camera stream to return to — going to
  // "camera" would show a dead black view. Re-enter the camera only when a
  // stream is actually running; otherwise return to the intro (camera + upload).
  const again = () => { setResult(null); setPhase(streamRef.current ? "camera" : "intro"); };
  const done = () => { setResult(null); stopCamera(); setPhase("intro"); };

  if (notAuthed) {
    // Guests get the full "why this page exists" loop before the gate.
    return <Shell><PurposeHero /><GuestGate /></Shell>;
  }

  return (
    <Shell>
      {/* Mode chips — active is a solid teal seal (cream type, card shadow),
          resting is quiet paper with a hairline. Unmistakable states. */}
      <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 22 }}>
        {(["catch", "map", "battle"] as const).map((t) => {
          const on = view === t;
          return (
            <button key={t} onClick={() => setView(t)} className="ccChip" style={{
              padding: "10px 18px", borderRadius: 999, cursor: "pointer", fontSize: 13, fontWeight: 700,
              fontFamily: MONO, letterSpacing: ".12em", textTransform: "uppercase",
              border: `1px solid ${on ? TEAL : OUTLINE}`,
              background: on ? TEAL : PAPER, color: on ? "#FCE9CF" : "#5C5140",
              boxShadow: on ? "var(--ed-shadow-card)" : "none",
              display: "inline-flex", alignItems: "center", gap: 7,
            }}>
              {t === "catch" ? <CameraIcon size={17} body={on ? "#FCE9CF" : TEAL} /> : t === "map" ? <Icon name="compass" size={18} /> : <Icon name="boxing" size={18} />}
              {t === "catch" ? "Camera" : t === "map" ? "Nearby" : "Alley Clash"}
            </button>
          );
        })}
      </div>

      {/* Map panel slides in from the right as a whole — the leaflet map's
          internals are untouched (Reveal only wraps the outer section block). */}
      {view === "map" && (
        <Reveal dir="right">
          <Suspense fallback={<Empty>Loading map…</Empty>}>
            <NearbyMap onCaught={(cat: Cat) => setCollection((c) => [cat, ...c])} />
          </Suspense>
        </Reveal>
      )}

      {view === "battle" && (
        <Reveal dir="up">
          <AlleyClash collection={collection} />
        </Reveal>
      )}

      {view === "catch" && (<>
      {/* ── PURPOSE HERO — why this page exists, as one visual loop ── */}
      <Reveal dir="up">
        <PurposeHero />
      </Reveal>

      {/* ── Viewfinder card — pops in as one block; every phase (camera /
             throw / reveal) lives inside untouched. ── */}
      <Reveal dir="pop">
      <div style={{ position: "relative", borderRadius: 18, overflow: "hidden", border: `1px solid ${OUTLINE}`, background: INSET, aspectRatio: "3 / 4", maxHeight: 520, margin: "0 auto 18px", boxShadow: "var(--ed-shadow-card)" }}>
        {phase === "intro" && (
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 11, background: "linear-gradient(160deg,#123029,#1B5A4B)", padding: "24px 22px", textAlign: "center", overflow: "hidden" }}>
            {/* inner hairline frame + cream corner registration ticks (the
                WorldCup/MyPet poster print pattern) */}
            <div aria-hidden style={{ position: "absolute", inset: 12, border: "1px solid rgba(252,233,207,.26)", borderRadius: 12, pointerEvents: "none" }} />
            {[["12px", "12px", "", ""], ["12px", "", "", "12px"], ["", "12px", "12px", ""], ["", "", "12px", "12px"]].map((c, i) => (
              <span key={i} aria-hidden style={{ position: "absolute", top: c[0] || undefined, left: c[1] || undefined, bottom: c[2] || undefined, right: c[3] || undefined, width: 11, height: 11, zIndex: 2,
                backgroundImage: "linear-gradient(rgba(252,233,207,.8),rgba(252,233,207,.8)),linear-gradient(rgba(252,233,207,.8),rgba(252,233,207,.8))",
                backgroundSize: "1px 11px,11px 1px", backgroundPosition: "center,center", backgroundRepeat: "no-repeat" }} />
            ))}
            {/* slow print-gloss sweep — flat sheen, not a glow */}
            <div className="ed-gloss" aria-hidden style={{ left: 0, opacity: 0.16 }} />
            <svg width="64" height="64" viewBox="0 0 96 96" aria-hidden style={{ display: "block" }}>
              <circle cx="48" cy="48" r="36" fill="none" stroke="rgba(252,233,207,.55)" strokeWidth="2" strokeDasharray="4 7" />
              <circle cx="48" cy="48" r="23" fill="none" stroke="rgba(252,233,207,.35)" strokeWidth="1.5" />
              <path d="M48 16v13M48 67v13M16 48h13M67 48h13" stroke="rgba(252,233,207,.7)" strokeWidth="2" strokeLinecap="round" />
              <circle cx="48" cy="48" r="3" fill="rgba(252,233,207,.9)" />
            </svg>
            <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, letterSpacing: ".12em", color: "rgba(252,233,207,.62)", textTransform: "uppercase" }}>Field camera · vision-verified</div>
            <div style={{ fontFamily: DISP, fontSize: "clamp(22px,4vw,30px)", fontWeight: 800, color: "#FCE9CF", maxWidth: 340, lineHeight: 1.16, letterSpacing: "-0.01em" }}>See an animal out in the world? Point your camera and catch it.</div>
            <div style={{ fontFamily: BODY, fontSize: 14, color: "rgba(252,233,207,.85)", maxWidth: 310, lineHeight: 1.5 }}>Mostly cats &amp; dogs — but any real animal counts. Screenshots and photos of screens won&apos;t work.</div>
            {/* Geo disclosure BEFORE the photo is taken — catches are PRIVATE by
                default; the community map only ever shows a catch after the
                explicit per-catch opt-in on the reveal (rounded ~110 m). */}
            <div style={{ fontFamily: BODY, fontSize: 13, color: "rgba(252,233,207,.6)", maxWidth: 310, lineHeight: 1.5 }}>Catches are private by default. You can choose, per catch, to share it on the community map at an approximate location (~110 m).</div>
            <button onClick={startCamera} className="ed-press ed-card-hover" style={{ padding: "13px 26px", borderRadius: 999, border: "none", background: "#FCE9CF", color: "#123029", fontFamily: MONO, fontWeight: 700, fontSize: 13, letterSpacing: ".12em", textTransform: "uppercase", cursor: "pointer", boxShadow: "var(--ed-shadow-card)", display: "inline-flex", alignItems: "center", gap: 8 }}>
              <CameraIcon size={20} /> Open camera
            </button>
            {camErr && <div style={{ fontFamily: MONO, fontSize: 13, letterSpacing: ".06em", color: "#F2B8A0", maxWidth: 300 }}>{camErr}</div>}
            <label className="ed-press ed-wipe" style={{ padding: "10px 20px", borderRadius: 999, border: "1px solid rgba(252,233,207,.55)", background: "transparent", color: "#FCE9CF", fontFamily: MONO, fontWeight: 700, fontSize: 13, letterSpacing: ".1em", textTransform: "uppercase", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 8 }}>
              <UploadIcon size={18} /> Upload a photo
              <input type="file" accept="image/*" onChange={onUpload} style={{ display: "none" }} />
            </label>
            <div style={{ fontFamily: BODY, fontSize: 13, color: "rgba(252,233,207,.6)", maxWidth: 300 }}>Uploads are verified the same way — big photos are resized for you.</div>
            {uploadErr && <div style={{ fontFamily: MONO, fontSize: 13, letterSpacing: ".06em", color: "#F2B8A0", maxWidth: 300 }}>{uploadErr}</div>}
            {/* Honest cost disclosure BEFORE any commit — mirrors the server
                billing in lib/economyGuards.consumeCatchVerify: 3 free vision
                scans/day/wallet (CATCH_FREE_VERIFY_PER_DAY), then 1 credit per
                scan (CATCH_VERIFY_CREDIT_COST), billed on the ATTEMPT (we pay
                the vision vendor per attempt, catch or not). Keep these numbers
                in sync with that guard. */}
            <div style={{ fontFamily: BODY, fontSize: 13, color: "rgba(252,233,207,.78)", maxWidth: 320, lineHeight: 1.45 }}>
              <strong style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase" }}>3 free scans a day · then 1 credit per scan</strong>
              {" "}— charged per scan, even if nothing is caught.
            </div>
          </div>
        )}

        {(phase === "camera" || phase === "catching") && (
          <>
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <video ref={videoRef} playsInline muted style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", background: "linear-gradient(160deg,#123029,#1B5A4B)" }} />
            {/* dashed inner frame + corner brackets + circular reticle */}
            <div style={{ position: "absolute", inset: 14, pointerEvents: "none", border: "1px dashed rgba(252,233,207,.6)", borderRadius: 12 }} />
            {[["top","left"],["top","right"],["bottom","left"],["bottom","right"]].map(([v,h]) => (
              <span key={v+h} aria-hidden style={{ position: "absolute", [v]: 16, [h]: 16, width: 22, height: 22, pointerEvents: "none", [`border${v[0].toUpperCase()+v.slice(1)}`]: "2px solid rgba(252,233,207,.85)", [`border${h[0].toUpperCase()+h.slice(1)}`]: "2px solid rgba(252,233,207,.85)", borderRadius: v === "top" ? (h === "left" ? "6px 0 0 0" : "0 6px 0 0") : (h === "left" ? "0 0 0 6px" : "0 0 6px 0") } as React.CSSProperties} />
            ))}
            <div style={{ position: "absolute", inset: 0, pointerEvents: "none", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14 }}>
              <div style={{ width: "58%", aspectRatio: "1", border: "1.5px solid rgba(252,233,207,.85)", borderRadius: "50%", boxShadow: "0 0 0 1px rgba(26,126,104,.5) inset" }} />
            </div>
            {phase === "camera" && (
              <div style={{ position: "absolute", top: 26, left: 0, right: 0, textAlign: "center", fontFamily: MONO, fontSize: 13, fontWeight: 700, letterSpacing: ".18em", color: "rgba(252,233,207,.85)", pointerEvents: "none" }}>SCANNING FOR LIFE…</div>
            )}
            {phase === "catching" && (
              <div style={{ position: "absolute", inset: 0, background: "rgba(18,48,41,0.66)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, color: "#FCE9CF" }}>
                <div style={{ animation: "ccBob 0.7s ease-in-out infinite" }}><Icon name="paw" size={56} /></div>
                <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 13, letterSpacing: ".18em" }}>CATCHING…</div>
              </div>
            )}
            {phase === "camera" && (
              <button onClick={capture} aria-label="Catch" style={{ position: "absolute", bottom: 20, left: "50%", transform: "translateX(-50%)", width: 72, height: 72, borderRadius: "50%", border: "4px solid #FCE9CF", background: TEAL, cursor: "pointer", boxShadow: "var(--ed-shadow-card)" }} />
            )}
          </>
        )}

        {phase === "throw" && pendingImg && (
          <ThrowCan image={pendingImg} onThrow={() => submitPhoto(pendingImg)} onCancel={again} />
        )}

        {phase === "result" && result && (
          result.caught && result.cat ? (
            <RevealCard cat={result.cat} points={result.pointsAwarded || 0} newSpecies={!!result.newSpecies} onAgain={again} onDone={done} onMapPublicChange={setMapPublic} />
          ) : (
            <div style={{ position: "absolute", inset: 0, background: PAPER, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, padding: 20, textAlign: "center", overflowY: "auto" }}>
              <Icon name={result.antiCheat ? "shield" : "footprints"} size={52} />
              <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, letterSpacing: ".14em", color: TEAL, textTransform: "uppercase" }}>{result.antiCheat ? "ANTI-CHEAT" : "NO CATCH"}</div>
              <div style={{ fontFamily: DISP, fontSize: 22, fontWeight: 700, color: INK, maxWidth: 320, lineHeight: 1.2 }}>{result.antiCheat ? "Nice try!" : "No catch"}</div>
              <div style={{ fontFamily: BODY, fontSize: 14, color: MUTED, maxWidth: 320, lineHeight: 1.5 }}>{result.reason}</div>
              <button onClick={again} className="ed-card-hover" style={bigBtn}>Try again</button>
              <button onClick={done} className="ed-wipe" style={{ ...ghostBtn, marginTop: 2 }}>Done</button>
            </div>
          )
        )}
      </div>
      </Reveal>

      {/* ── Today's missions — real loops with server-paid payoffs only ── */}
      <Reveal dir="up">
        <MissionStrip collection={collection} meta={meta} />
      </Reveal>

      {/* ── Rarity provenance — "who decides?" answered with the real mechanics ── */}
      <Reveal dir="up" delay={40}>
        <RarityProvenance pointsCap={meta?.catchPointsCap ?? null} />
      </Reveal>

      {/* ── Field Journal dashboard — rises in on scroll ── */}
      <Reveal dir="up">
        <FieldJournal collection={collection} />
      </Reveal>

      {/* ── Field Guide — the 7 wild-map species as a checklist board.
             Uncaught species show as ink silhouettes ("???"), the collection
             drive. Counts are REAL (derived from the caught collection). ── */}
      <Reveal dir="up" delay={60}>
        <FieldGuide collection={collection} />
      </Reveal>

      {/* ── Album ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 26, marginBottom: 14, paddingBottom: 12, borderBottom: `1px solid ${OUTLINE}` }}>
        <div>
          <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, letterSpacing: ".14em", color: TEAL, textTransform: "uppercase" }}>The collection</div>
          <h2 style={{ fontFamily: DISP, fontSize: 26, fontWeight: 800, color: INK, margin: "2px 0 0", letterSpacing: "-0.01em" }}>Your album</h2>
        </div>
        {collection.length > 1 && (
          <div style={{ display: "flex", gap: 6 }}>
            {(["recent", "rarity"] as const).map((s) => (
              <button key={s} onClick={() => setSort(s)} className="ccChip" style={{
                padding: "6px 13px", borderRadius: 999, cursor: "pointer", fontSize: 13, fontWeight: 700,
                fontFamily: MONO, letterSpacing: ".1em", textTransform: "uppercase",
                border: `1px solid ${sort === s ? TEAL : OUTLINE}`, background: sort === s ? TEAL : PAPER, color: sort === s ? "#FCE9CF" : "#5C5140",
                boxShadow: sort === s ? "var(--ed-shadow-card)" : "none",
              }}>{s === "recent" ? "Recent" : "Rarity"}</button>
            ))}
          </div>
        )}
      </div>
      {collection.length === 0 ? (
        <Empty>No catches yet — go find an animal!</Empty>
      ) : (
        // Collection cards fly up into the grid as they scroll into view
        // (stagger capped at 8 steps; fires once per card).
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 14 }}>
          {sortCollection(collection, sort).map((c, i) => (
            <Reveal key={c.id} dir="up" delay={Math.min(i, 8) * 60}>
              <CatCard cat={c} compact onToggleMap={setMapPublic} onDelete={deleteCatch} />
            </Reveal>
          ))}
        </div>
      )}
      </>)}

      <style>{`
        .ccChip{transition:transform .16s cubic-bezier(.2,.8,.2,1),box-shadow .16s ease,background .16s ease,color .16s ease,border-color .16s ease}
        @media(hover:hover){.ccChip:hover{transform:translateY(-2px);box-shadow:var(--ed-shadow-card)}}
        .ccChip:active{transform:translateY(1px)}
        @keyframes ccBob{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}
        @keyframes ccPulse{0%,100%{transform:translateX(-50%) scale(1);opacity:.9}50%{transform:translateX(-50%) scale(1.12);opacity:.55}}
        @keyframes ccFade{from{opacity:0}to{opacity:1}}
        @keyframes ccPop{0%{transform:scale(.3);opacity:0}60%{transform:scale(1.08)}100%{transform:scale(1);opacity:1}}
        /* Wax Press — the seal drops from above, overshoots, seats with a tiny recoil. */
        @keyframes ccSealDrop{0%{opacity:0;transform:translateY(-44px) scale(1.6) rotate(-16deg)}58%{opacity:1;transform:translateY(3px) scale(.92) rotate(2deg)}100%{opacity:1;transform:translateY(0) scale(1) rotate(-7deg)}}
        @keyframes ccThunk{0%,100%{transform:translateY(0)}45%{transform:translateY(3px)}}
        .ccHow summary::-webkit-details-marker{display:none}
        .ccHow[open] .ccHowChev{transform:rotate(45deg)}
      `}</style>
    </Shell>
  );
}

const tinyGhost: React.CSSProperties = { padding: "6px 14px", borderRadius: 999, border: "1px solid rgba(252,233,207,.6)", background: "rgba(18,48,41,0.55)", color: "#FCE9CF", fontFamily: MONO, fontWeight: 700, fontSize: 13, letterSpacing: ".1em", textTransform: "uppercase", cursor: "pointer" };

/** Cat-food can graphic (the throwable). */
function CanGraphic() {
  return (
    <svg width="72" height="72" viewBox="0 0 72 72" style={{ filter: "drop-shadow(0 8px 12px rgba(38,12,2,.45))" }} aria-hidden>
      <ellipse cx="36" cy="20" rx="22" ry="7" fill="#9A4E1E" stroke={INK} strokeWidth="2" />
      <rect x="14" y="20" width="44" height="34" fill="#BE4F28" stroke={INK} strokeWidth="2" />
      <ellipse cx="36" cy="54" rx="22" ry="7" fill="#9A4E1E" stroke={INK} strokeWidth="2" />
      <rect x="18" y="29" width="36" height="17" rx="3" fill={CREAM} stroke={INK} strokeWidth="1.5" />
      <circle cx="36" cy="37.5" r="6" fill="#1A7E68" stroke={INK} strokeWidth="1.5" />
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
      <div style={{ position: "absolute", top: "26%", left: "50%", transform: "translateX(-50%)", width: 92, height: 92, border: "1.5px dashed rgba(252,233,207,0.9)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", animation: "ccPulse 1.6s ease-in-out infinite", pointerEvents: "none" }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#FCE9CF" }} />
      </div>
      {!flying && <div style={{ position: "absolute", top: 16, left: 0, right: 0, textAlign: "center", color: "#FCE9CF", fontFamily: MONO, fontWeight: 700, fontSize: 13, letterSpacing: ".1em", textTransform: "uppercase", textShadow: "0 1px 4px rgba(0,0,0,.6)", pointerEvents: "none" }}>Hold &amp; drag the can — release to throw</div>}
      {/* Last pre-commit moment: the throw is what bills the scan, so restate
          the honest cost here (numbers mirror economyGuards.consumeCatchVerify). */}
      {!flying && <div style={{ position: "absolute", top: 38, left: 0, right: 0, textAlign: "center", color: "rgba(252,233,207,.85)", fontFamily: MONO, fontWeight: 700, fontSize: 12, letterSpacing: ".08em", textTransform: "uppercase", textShadow: "0 1px 4px rgba(0,0,0,.6)", pointerEvents: "none" }}>1 scan per throw · 3 free a day, then 1 credit — catch or not</div>}
      <div onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
        style={{ position: "absolute", bottom: 26, left: "50%", width: 84, height: 84, cursor: "grab", touchAction: "none", display: "flex", alignItems: "center", justifyContent: "center", ...canStyle }} aria-label="Throw the can">
        <CanGraphic />
      </div>
      {!flying && <button onClick={launch} style={{ position: "absolute", bottom: 12, right: 10, ...tinyGhost }}>Throw</button>}
      {!flying && <button onClick={onCancel} style={{ position: "absolute", bottom: 12, left: 10, ...tinyGhost }}>Cancel</button>}
    </div>
  );
}

/** The "ANIMAL FOUND" reveal — the caught animal is presented as a foil-stamped
 *  CollectibleFrame (holo + gold rarity seal) on a warm-ink editorial plate.
 *  Includes the community-map consent toggle: default UNCHECKED, plain
 *  checkbox, server-confirmed — nothing is published unless the user opts in. */
function RevealCard({ cat, points, newSpecies, onAgain, onDone, onMapPublicChange }: { cat: Cat; points: number; newSpecies?: boolean; onAgain: () => void; onDone: () => void; onMapPublicChange?: (id: number, val: boolean) => Promise<boolean> }) {
  const stock = rarityStock(rarityRank(cat.rarity));
  const [mapOn, setMapOn] = useState(!!cat.map_public); // fresh catches → false
  const [mapBusy, setMapBusy] = useState(false);
  const [mapErr, setMapErr] = useState(false);
  const hasGeo = cat.lat != null && cat.lng != null;
  const toggleMap = async (next: boolean) => {
    if (mapBusy || !onMapPublicChange) return;
    setMapBusy(true); setMapErr(false);
    const ok = await onMapPublicChange(cat.id, next);
    if (ok) setMapOn(next); else setMapErr(true); // reflect server truth only
    setMapBusy(false);
  };
  return (
    <div style={{ position: "absolute", inset: 0, background: "linear-gradient(160deg,#1B1308,#2A2014)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 11, padding: "30px 18px 18px", textAlign: "center", overflowY: "auto", animation: "ccFade .35s ease" }}>
      {/* Caught animal as a foil-stamped collectible — pops in, then a terracotta
          wax seal drops and stamps it CAUGHT (the card recoils under the press). */}
      <div style={{ position: "relative", animation: "ccThunk .18s ease-out 780ms both" }}>
        <div style={{ animation: "ccPop .5s cubic-bezier(.2,1.3,.4,1)" }}>
          <CollectibleFrame photoUrl={cat.photo_path} level={stock.seal.glyph} speciesLabel={cat.kind} elementLabel={cat.element} width={186} tilt={-2.4} holo seal float />
        </div>
        <div aria-hidden style={{
          position: "absolute", bottom: -10, left: -12, width: 56, height: 56, zIndex: 6, borderRadius: "50%",
          background: "radial-gradient(circle at 36% 30%, #E4703F, #BE4F28 46%, #8A3616)",
          border: "2.5px solid #FBF6EC",
          boxShadow: "0 8px 16px -5px rgba(80,30,6,.55), inset 0 2px 3px rgba(255,220,200,.5), inset 0 -3px 5px rgba(90,30,8,.6)",
          display: "flex", alignItems: "center", justifyContent: "center",
          animation: "ccSealDrop .5s cubic-bezier(.2,.85,.25,1) 700ms both",
        }}>
          <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, letterSpacing: ".1em", color: "#FBE3D2", textShadow: "0 1px 1px rgba(80,20,0,.5)" }}>CAUGHT</span>
        </div>
      </div>
      {/* First-of-its-kind — REAL check against the pre-catch collection. */}
      {newSpecies && (
        <div style={{ fontFamily: MONO, fontSize: 12.5, fontWeight: 700, letterSpacing: ".16em", color: "#1B1308", background: "linear-gradient(180deg,#FFF0C0,#EBB84E)", borderRadius: 999, padding: "4px 13px", boxShadow: "0 4px 10px -4px rgba(0,0,0,.5)", whiteSpace: "nowrap", animation: "ccPop .4s cubic-bezier(.2,1.3,.4,1) 900ms both" }}>
          ✦ NEW GUIDE SPECIES
        </div>
      )}
      <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: "#F2CD86", letterSpacing: ".12em" }}>ANIMAL FOUND</div>
      <div style={{ fontFamily: DISP, fontSize: 28, fontWeight: 800, color: "#FBF6EC", lineHeight: 1, letterSpacing: "-0.01em" }}>{cat.name}</div>
      <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: "rgba(251,246,236,0.7)", textTransform: "uppercase", letterSpacing: ".14em" }}>{cat.rarityLabel} · {cat.kind}</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center" }}>
        {([["HP", cat.hp], ["ATK", cat.atk], ["DEF", cat.def], ["SPD", cat.spd]] as const).map(([k, v]) => (
          <span key={k} style={{ background: "rgba(251,246,236,0.06)", color: "#FBF6EC", borderRadius: 6, padding: "3px 10px", fontSize: 13, fontWeight: 700, letterSpacing: ".08em", fontFamily: MONO, border: "1px solid rgba(251,246,236,0.16)", fontVariantNumeric: "tabular-nums" }}>{k} {v}</span>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 2 }}>
        {points > 0 && <span style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "linear-gradient(180deg,#F49B2A,#E27D0C)", color: "#211A12", fontFamily: MONO, fontWeight: 700, fontSize: 13, letterSpacing: ".06em", borderRadius: 999, padding: "5px 12px", fontVariantNumeric: "tabular-nums" }}>+{points} season points <Icon name="coin" size={14} /></span>}
        <span style={{ color: "rgba(251,246,236,0.55)", fontFamily: MONO, fontSize: 13, fontWeight: 700, letterSpacing: ".08em", fontVariantNumeric: "tabular-nums" }}>{`FILE № ${String(cat.id).padStart(6, "0")}`}</span>
      </div>
      {/* Community-map consent — explicit per-catch opt-in, default UNCHECKED.
          Only offered when the catch has a location; the server publishes the
          rounded (~110 m) coordinate, never the exact one. No dark patterns:
          plain checkbox, private stays the default, undo anytime in the album. */}
      {hasGeo && onMapPublicChange && (
        <div style={{ marginTop: 6, maxWidth: 320 }}>
          <label style={{ display: "flex", alignItems: "flex-start", gap: 9, textAlign: "left", cursor: mapBusy ? "wait" : "pointer", fontFamily: BODY, fontSize: 13, lineHeight: 1.45, color: "rgba(251,246,236,0.85)" }}>
            <input
              type="checkbox"
              checked={mapOn}
              disabled={mapBusy}
              onChange={(e) => toggleMap(e.target.checked)}
              style={{ width: 16, height: 16, marginTop: 1, accentColor: TEAL, flexShrink: 0 }}
            />
            <span>Show this catch on the community map (rounded location, ~110 m)</span>
          </label>
          <div style={{ fontFamily: BODY, fontSize: 12, color: mapErr ? "#F2B8A0" : "rgba(251,246,236,0.5)", marginTop: 4, paddingLeft: 25 }}>
            {mapErr ? "Couldn't update — try again." : mapOn ? "Shared. Remove it anytime from your album." : "Private by default — only you see it."}
          </div>
        </div>
      )}
      <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
        <button onClick={onAgain} className="ed-card-hover" style={bigBtn}>Catch another</button>
        <button onClick={onDone} className="ed-wipe" style={{ ...ghostBtn, borderColor: "rgba(251,246,236,0.4)", color: "#FBF6EC" }}>Done</button>
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
      <div style={{ textAlign: "center", marginBottom: 18 }}>
        <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, letterSpacing: "0.14em", color: TEAL, textTransform: "uppercase" }}>Alley Clash · practice</div>
        <h2 style={{ fontFamily: DISP, fontSize: 28, fontWeight: 800, color: INK, margin: "4px 0 0", letterSpacing: "-0.01em" }}>Send a fighter to the alley</h2>
        <p style={{ fontFamily: BODY, fontSize: 13, color: MUTED, margin: "8px auto 0", maxWidth: 380, lineHeight: 1.55 }}>Pick one of your caught animals to spar a street stray — a practice opponent, not another player. Win to gain season points (daily-capped).</p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(94px, 1fr))", gap: 10, marginBottom: 18 }}>
        {collection.map((c) => {
          const on = sel?.id === c.id;
          return (
            <button key={c.id} onClick={() => setSel(c)} style={{ padding: 7, borderRadius: 10, overflow: "hidden", cursor: "pointer", border: `1px solid ${on ? TEAL : OUTLINE}`, background: PAPER, boxShadow: on ? "var(--ed-shadow-card)" : "none", transform: on ? "translateY(-2px)" : "none", transition: "transform .12s ease" }}>
              <Thumb cat={c} />
              <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: INK, padding: "6px 2px 1px", letterSpacing: ".04em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</div>
            </button>
          );
        })}
      </div>
      {sel && (
        <div style={{ textAlign: "center" }}>
          <div style={{ fontFamily: MONO, fontSize: 13, color: MUTED, letterSpacing: ".06em", marginBottom: 12, fontVariantNumeric: "tabular-nums" }}>Sending <b style={{ color: INK }}>{sel.name}</b> · ATK {sel.atk} · DEF {sel.def} · SPD {sel.spd}</div>
          <button onClick={fight} disabled={busy} style={{ ...bigBtn, opacity: busy ? 0.7 : 1, display: "inline-flex", alignItems: "center", gap: 8 }}><Icon name="boxing" size={20} /> {busy ? "Fighting…" : "Fight!"}</button>
        </div>
      )}
      {res?.error && <div style={{ textAlign: "center", fontFamily: MONO, color: "#B14A2C", fontSize: 13, letterSpacing: ".06em", marginTop: 12 }}>{res.error}</div>}
    </div>
  );
}

function BattleResult({ res, onAgain }: { res: any; onAgain: () => void }) {
  const won = !!res.won;
  const fighter = (f: any, side: "you" | "them") => (
    <div style={{ textAlign: "center", flex: 1, minWidth: 0 }}>
      <div style={{ width: 84, height: 84, margin: "0 auto", borderRadius: 8, border: `1px solid ${OUTLINE}`, background: side === "you" ? PAPER : INSET, boxShadow: "inset 0 0 0 2px rgba(184,130,44,.4)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Icon name={f.icon} size={52} />
      </div>
      <div style={{ fontFamily: DISP, fontWeight: 700, color: INK, marginTop: 7, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{f.name}</div>
      <div style={{ height: 6, borderRadius: 999, background: "rgba(33,26,18,.1)", overflow: "hidden", marginTop: 7 }}>
        <div style={{ width: `${Math.max(0, Math.round((f.hpLeft / f.hpMax) * 100))}%`, height: "100%", background: side === "you" ? TEAL : "#B14A2C", transition: "width .6s ease" }} />
      </div>
      <div style={{ fontSize: 13, color: MUTED, marginTop: 4, fontFamily: MONO, letterSpacing: ".06em", fontVariantNumeric: "tabular-nums" }}>HP {Math.max(0, f.hpLeft)}/{f.hpMax}</div>
    </div>
  );
  return (
    <div style={{ textAlign: "center", padding: "6px 0 4px" }}>
      <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, letterSpacing: ".18em", color: won ? TEAL : "#B14A2C", textTransform: "uppercase" }}>{won ? "OUTCOME · WIN" : "OUTCOME · LOSS"}</div>
      <div style={{ fontFamily: DISP, fontSize: 30, fontWeight: 800, color: won ? TEAL : "#B14A2C", letterSpacing: "-0.01em", marginTop: 2 }}>{won ? "Victory!" : "Defeated"}</div>
      <div style={{ fontFamily: MONO, fontSize: 13, color: MUTED, letterSpacing: ".06em", marginBottom: 18, fontVariantNumeric: "tabular-nums" }}>{res.turns} turns in the alley</div>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, maxWidth: 360, margin: "0 auto" }}>
        {fighter(res.you, "you")}
        <div style={{ fontFamily: MONO, fontWeight: 700, color: MUTED, alignSelf: "center", fontSize: 14, letterSpacing: ".1em" }}>VS</div>
        {fighter(res.opponent, "them")}
      </div>
      {won && res.pointsAwarded > 0 && (
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 18, background: "linear-gradient(180deg,#F49B2A,#E27D0C)", color: "#211A12", fontFamily: MONO, fontWeight: 700, fontSize: 13, letterSpacing: ".06em", borderRadius: 999, padding: "6px 14px", fontVariantNumeric: "tabular-nums" }}>+{res.pointsAwarded} season points <Icon name="coin" size={14} /></div>
      )}
      <div style={{ marginTop: 20 }}>
        <button onClick={onAgain} className="ed-card-hover" style={bigBtn}>Battle again</button>
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

/** Consecutive-day catch streak from REAL caught_at timestamps. The streak may
 *  end today or yesterday (you haven't necessarily caught yet today). */
function catchStreak(collection: Cat[]): number {
  const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  const days = new Set(collection.filter((c) => c.caught_at).map((c) => dayKey(new Date(c.caught_at!))));
  if (days.size === 0) return 0;
  const cur = new Date();
  if (!days.has(dayKey(cur))) cur.setDate(cur.getDate() - 1); // streak alive until midnight
  let streak = 0;
  while (days.has(dayKey(cur))) { streak++; cur.setDate(cur.getDate() - 1); }
  return streak;
}

// ── Field Guide — the 7 species that roam the wild map (SPAWN_KINDS in
// lib/catch/spawns.ts). Camera catches of ANY real animal still collect;
// kinds beyond these seven show as bonus guide entries. ──
const GUIDE_SPECIES: Array<{ key: string; label: string; icon: string }> = [
  { key: "cat", label: "Cat", icon: "cat" },
  { key: "dog", label: "Dog", icon: "dog" },
  { key: "bird", label: "Bird", icon: "parrot" },
  { key: "duck", label: "Duck", icon: "chicken" },
  { key: "rabbit", label: "Rabbit", icon: "rabbit" },
  { key: "squirrel", label: "Squirrel", icon: "hamster" },
  { key: "fox", label: "Fox", icon: "fox" },
];
const GUIDE_ALIAS: Record<string, string> = {
  kitten: "cat", puppy: "dog",
  sparrow: "bird", parrot: "bird", crow: "bird", seagull: "bird", pigeon: "bird",
  goose: "duck", bunny: "rabbit", hare: "rabbit", chipmunk: "squirrel",
};
function guideKey(kind?: string): string {
  const k = (kind || "").toLowerCase().trim();
  return GUIDE_ALIAS[k] || k;
}

/** Real per-guide-key counts derived from the collection (shared by the
 *  missions strip and the Field Guide board so they can never disagree). */
function guideCounts(collection: Cat[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const c of collection) {
    const k = guideKey(c.kind);
    if (k) counts.set(k, (counts.get(k) || 0) + 1);
  }
  return counts;
}

/** PURPOSE HERO — one visual statement of the loop: see a real animal → snap →
 *  AI verifies → rarity rolls → it joins your collection (+pts). The point
 *  range is derived from CATCH_POINTS (exactly what /api/catch pays, daily-
 *  capped server-side) — never a hand-typed promise. */
function PurposeHero() {
  const steps: Array<{ n: string; art: React.ReactNode; title: string; copy: React.ReactNode }> = [
    { n: "01", art: <Icon name="paw" size={28} alt="" />, title: "Spot", copy: <>See a <strong style={{ color: INK }}>REAL animal</strong> out in the world</> },
    { n: "02", art: <CameraIcon size={26} />, title: "Snap", copy: "Photograph it live with your field camera" },
    { n: "03", art: <Icon name="shield" size={28} alt="" />, title: "Verify", copy: "AI vision confirms it's real — screens & drawings bounce" },
    { n: "04", art: <Icon name="treasure-chest" size={28} alt="" />, title: "Collect", copy: <>Rarity rolls, it joins your album — <strong style={{ color: "#9A4E1E", whiteSpace: "nowrap" }}>+{CATCH_PT_MIN}–{CATCH_PT_MAX} pts</strong></> },
  ];
  return (
    <div style={{ position: "relative", background: PAPER, border: `1px solid ${OUTLINE}`, borderRadius: 16, boxShadow: "var(--ed-shadow-card)", padding: "16px 18px 15px", marginBottom: 16, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 5 }}>
        <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, letterSpacing: ".14em", color: TEAL, textTransform: "uppercase" }}>The catch loop</div>
        {/* stamped "real animals only" seal — the page's one non-negotiable rule */}
        <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: PAPER, background: TEAL, borderRadius: 4, padding: "3px 9px", transform: "rotate(-1.6deg)", boxShadow: "2px 2px 0 rgba(33,26,18,.22)" }}>Real animals only</div>
      </div>
      <div style={{ fontFamily: DISP, fontSize: "clamp(19px,3.4vw,24px)", fontWeight: 800, color: INK, letterSpacing: "-0.01em", lineHeight: 1.15, marginBottom: 13 }}>
        Photograph a real animal — it becomes a collectible.
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(118px, 1fr))", gap: 8 }}>
        {steps.map((s) => (
          <div key={s.n} style={{ background: INSET, border: `1px solid ${OUTLINE}`, borderRadius: 10, padding: "10px 10px 9px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
              <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: MUTED, letterSpacing: ".08em", fontVariantNumeric: "tabular-nums" }}>{s.n}</span>
              {s.art}
              <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase", color: TEAL }}>{s.title}</span>
            </div>
            <div style={{ fontFamily: BODY, fontSize: 13, color: "#5C5140", lineHeight: 1.45 }}>{s.copy}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** TODAY'S MISSIONS — every chip is a real loop with a REAL payoff. The scan
 *  and points meters come from GET /api/catch `meta` (the server's own
 *  "vision:free" / "ap:catch" counters); point amounts are CATCH_POINTS — the
 *  exact values /api/catch grants. No invented bonuses, ever. */
function MissionStrip({ collection, meta }: { collection: Cat[]; meta: CatchMeta | null }) {
  const caughtToday = collection.filter((c) => isToday(c.caught_at)).length;
  const counts = guideCounts(collection);
  const found = GUIDE_SPECIES.filter((s) => (counts.get(s.key) || 0) > 0).length;
  const streak = catchStreak(collection);
  const capped = !!meta && meta.catchPointsToday >= meta.catchPointsCap;

  const seal = (done: boolean) => (
    <span aria-hidden style={{
      width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
      border: done ? `1.5px solid ${TEAL}` : `1.5px dashed rgba(33,26,18,.35)`,
      background: done ? TEAL : "transparent",
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      color: "#FCE9CF", fontFamily: MONO, fontSize: 12, fontWeight: 700,
    }}>{done ? "✓" : ""}</span>
  );
  const ptsPill = (text: string) => (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "linear-gradient(180deg,#F49B2A,#E27D0C)", color: INK, fontFamily: MONO, fontWeight: 700, fontSize: 12, letterSpacing: ".04em", borderRadius: 999, padding: "3px 10px", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{text} <Icon name="coin" size={12} alt="" /></span>
  );
  const flatPill = (text: string) => (
    <span style={{ background: INSET, border: `1px solid ${OUTLINE}`, color: "#5C5140", fontFamily: MONO, fontWeight: 700, fontSize: 12, letterSpacing: ".04em", borderRadius: 999, padding: "3px 10px", whiteSpace: "nowrap" }}>{text}</span>
  );
  const row = (done: boolean, label: React.ReactNode, reward: React.ReactNode) => (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", flexWrap: "wrap" }}>
      {seal(done)}
      <div style={{ fontFamily: BODY, fontSize: 14, color: done ? MUTED : INK, flex: 1, minWidth: 150, lineHeight: 1.4 }}>{label}</div>
      {reward}
    </div>
  );

  return (
    <div style={{ background: PAPER, border: `1px solid ${OUTLINE}`, borderRadius: 16, boxShadow: "var(--ed-shadow-card)", padding: "15px 18px 13px", marginTop: 4 }}>
      <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, letterSpacing: ".14em", color: TEAL, textTransform: "uppercase", paddingBottom: 9, borderBottom: `1px solid ${OUTLINE}` }}>Today&apos;s missions</div>
      <div style={{ display: "grid" }}>
        {/* First catch of the day — pays the normal rarity-scaled catch points
            (no invented bonus) and is what keeps the streak stat alive. */}
        {row(
          caughtToday > 0,
          caughtToday > 0
            ? <>First catch of the day — logged{streak > 1 ? <> · <b style={{ color: TEAL }}>{streak}-day streak</b></> : null}</>
            : <>Make your first catch of the day{streak > 0 ? <> — keeps your <b style={{ color: TEAL }}>{streak}-day streak</b> alive</> : " — starts a streak"}</>,
          ptsPill(`+${CATCH_PT_MIN}–${CATCH_PT_MAX} pts by rarity`),
        )}
        {/* New guide species — the payoff is the guide sticker; the points are
            the same rarity-scaled catch points, stated honestly. */}
        {row(
          found >= GUIDE_SPECIES.length,
          found >= GUIDE_SPECIES.length
            ? <>Field Guide complete — all {GUIDE_SPECIES.length} wild-map species logged</>
            : <>Log a new Field Guide species ({found}/{GUIDE_SPECIES.length})</>,
          flatPill("guide sticker + catch pts"),
        )}
      </div>
      {/* Server-truth meters. The free/credit numbers mirror
          economyGuards.consumeCatchVerify (3 free/day, then 1 credit). */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 4, paddingTop: 11, borderTop: `1px solid ${OUTLINE}` }}>
        <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "#5C5140", background: INSET, border: `1px solid ${OUTLINE}`, borderRadius: 999, padding: "4px 11px", fontVariantNumeric: "tabular-nums" }}>
          Scans · {meta ? `${meta.freeScansLeft}/${meta.freeScansPerDay} free left` : "3 free/day"} · then 1 credit
        </span>
        {meta && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontFamily: MONO, fontSize: 12, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: capped ? "#9A4E1E" : "#5C5140", background: INSET, border: `1px solid ${OUTLINE}`, borderRadius: 999, padding: "4px 11px", fontVariantNumeric: "tabular-nums" }}>
            Catch pts today · {meta.catchPointsToday}/{meta.catchPointsCap}
            <span aria-hidden style={{ width: 44, height: 5, borderRadius: 999, background: "rgba(33,26,18,.12)", overflow: "hidden", display: "inline-block" }}>
              <span style={{ display: "block", width: `${Math.min(100, Math.round((meta.catchPointsToday / Math.max(1, meta.catchPointsCap)) * 100))}%`, height: "100%", background: capped ? "#9A4E1E" : TEAL }} />
            </span>
            {capped && "· resumes tomorrow"}
          </span>
        )}
      </div>
    </div>
  );
}

/** "Rarest — who decides??" answered in the UI with the REAL mechanics. The
 *  odds are derived from RARITY_TIERS.weight — the exact table the server's
 *  rollRarity uses — and the points from CATCH_POINTS, so this disclosure can
 *  never show invented odds. */
function RarityProvenance({ pointsCap }: { pointsCap: number | null }) {
  const total = RARITY_TIERS.reduce((s, t) => s + t.weight, 0);
  const pct = (w: number) => { const p = (w / total) * 100; return `${p % 1 === 0 ? p : p.toFixed(1)}%`; };
  return (
    <details className="ccHow" style={{ background: PAPER, border: `1px solid ${OUTLINE}`, borderRadius: 14, boxShadow: "var(--ed-shadow-card)", marginTop: 14 }}>
      <summary style={{ cursor: "pointer", padding: "13px 16px", fontFamily: MONO, fontSize: 13, fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase", color: TEAL, listStyle: "none", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span>How rarity works — who decides?</span>
        <span className="ccHowChev" aria-hidden style={{ color: MUTED, fontSize: 15, lineHeight: 1, transition: "transform .18s ease" }}>+</span>
      </summary>
      <div style={{ padding: "0 16px 15px" }}>
        <ol style={{ margin: 0, padding: "0 0 0 18px", fontFamily: BODY, fontSize: 13, color: "#5C5140", lineHeight: 1.6, display: "grid", gap: 6 }}>
          <li><b style={{ color: INK }}>AI vision verifies the photo</b> — it must be a real, live animal. Screenshots, photos of screens, prints, drawings and memes are rejected. No human judges, no favorites.</li>
          <li><b style={{ color: INK }}>The server rolls rarity at catch time</b> from this fixed table — the same odds for every player:</li>
        </ol>
        <div style={{ margin: "10px 0 0", border: `1px solid ${OUTLINE}`, borderRadius: 10, overflow: "hidden" }}>
          {RARITY_TIERS.map((t, i) => (
            <div key={t.key} style={{ display: "flex", alignItems: "center", gap: 9, padding: "7px 12px", background: i % 2 ? "transparent" : INSET, borderTop: i ? `1px solid ${OUTLINE}` : "none" }}>
              <span aria-hidden style={{ width: 10, height: 10, borderRadius: "50%", background: t.color, border: `1px solid ${INK}`, flexShrink: 0 }} />
              <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: INK, width: 88 }}>{t.label}</span>
              <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: MUTED, fontVariantNumeric: "tabular-nums" }}>{pct(t.weight)}</span>
              <span style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 12, fontWeight: 700, color: "#9A4E1E", fontVariantNumeric: "tabular-nums" }}>+{CATCH_POINTS[t.key]} pts</span>
            </div>
          ))}
        </div>
        <p style={{ fontFamily: BODY, fontSize: 13, color: MUTED, margin: "10px 0 0", lineHeight: 1.55 }}>
          A very clear, well-framed sighting gives a small luck nudge toward Rare, Epic and Legendary.
          Points are non-financial Season Rewards{pointsCap ? ` — catch points cap at ${pointsCap}/day` : " and are daily-capped"}.
        </p>
      </div>
    </details>
  );
}

/** "Field Journal" dashboard — a naturalist's logbook. All counts are REAL
 *  (derived from the collection); the RAREST tile carries its provenance
 *  (highest rarity ROLLED so far — see RarityProvenance for the mechanics). */
function FieldJournal({ collection }: { collection: Cat[] }) {
  const collected = collection.length;
  const rarest = collection.reduce<Cat | null>((best, c) => (!best || rarityRank(c.rarity) > rarityRank(best.rarity) ? c : best), null);
  const today = collection.filter((c) => isToday(c.caught_at)).length;
  const kinds = new Set(collection.map((c) => c.kind)).size;
  // Logbook entry tile: big numeral on a ruled baseline; optional provenance
  // tooltip (title) + sub-caption. All values real, derived above.
  const note = (label: string, value: string, color: string, opts?: { title?: string; sub?: string; size?: number }) => (
    <div title={opts?.title} style={{ background: INSET, border: `1px solid ${OUTLINE}`, borderRadius: 10, padding: "10px 12px 9px", cursor: opts?.title ? "help" : undefined }}>
      <div style={{ fontSize: 12, fontFamily: MONO, fontWeight: 700, letterSpacing: ".12em", color: MUTED, textTransform: "uppercase", display: "flex", alignItems: "center", gap: 4 }}>
        {label}
        {opts?.title && <span aria-hidden style={{ width: 14, height: 14, borderRadius: "50%", border: "1px solid rgba(33,26,18,.3)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: MUTED, lineHeight: 1 }}>?</span>}
      </div>
      <div style={{ fontSize: opts?.size ?? 26, fontWeight: 800, color, fontFamily: DISP, marginTop: 4, letterSpacing: "-0.01em", lineHeight: 1.05, fontVariantNumeric: "tabular-nums", borderBottom: "1px dashed rgba(33,26,18,.18)", paddingBottom: 4 }}>{value}</div>
      {opts?.sub && <div style={{ fontSize: 12, fontFamily: BODY, color: MUTED, marginTop: 4, lineHeight: 1.35 }}>{opts.sub}</div>}
    </div>
  );
  const streak = catchStreak(collection);
  return (
    <div style={{
      background: PAPER, border: `1px solid ${OUTLINE}`, borderRadius: 16, boxShadow: "var(--ed-shadow-card)", padding: "18px 20px", marginTop: 4,
      // faint ruled journal lines — logbook paper, not decoration
      backgroundImage: "repeating-linear-gradient(180deg, transparent, transparent 25px, rgba(33,26,18,.045) 25px, rgba(33,26,18,.045) 26px)",
    }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 14, paddingBottom: 12, borderBottom: `1px solid ${OUTLINE}` }}>
        <div>
          <div style={{ fontSize: 13, fontFamily: MONO, fontWeight: 700, letterSpacing: ".14em", color: TEAL, textTransform: "uppercase" }}>Field Journal</div>
          <div style={{ fontSize: 13, fontFamily: MONO, fontWeight: 700, letterSpacing: ".08em", color: MUTED, textTransform: "uppercase", marginTop: 4 }}>Animals collected</div>
        </div>
        <div style={{ fontSize: 54, fontWeight: 800, color: INK, lineHeight: 0.9, fontFamily: DISP, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}>{collected}</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(112px, 1fr))", gap: 8 }}>
        {note("Rarest", rarest ? rarest.rarityLabel : "—", rarest ? rarest.rarityColor : MUTED, {
          // RAREST provenance — answers "who decides?" right on the tile.
          title: "Highest rarity rolled so far across your catches. Rarity is rolled server-side at catch time — open 'How rarity works' above for the exact odds.",
          sub: "highest roll so far",
          size: 20,
        })}
        {note("Today", String(today), INK)}
        {note("Streak", streak > 0 ? `${streak}d` : "—", streak > 0 ? TEAL : MUTED, { sub: streak > 0 ? "consecutive days" : "catch today to start" })}
        {note("Species", String(kinds), INK)}
      </div>
    </div>
  );
}

/** Field Guide checklist board — silhouettes for uncaught wild-map species.
 *  All counts are REAL (derived from the collection); the seven-slot universe
 *  is the honest wild-spawn species list, and any other real animal caught on
 *  camera is shown as a bonus entry, never hidden. */
function FieldGuide({ collection }: { collection: Cat[] }) {
  const counts = guideCounts(collection);
  const found = GUIDE_SPECIES.filter((s) => (counts.get(s.key) || 0) > 0).length;
  // Real animals caught beyond the wild-map seven (e.g. a turtle on camera).
  const bonus = [...counts.keys()].filter((k) => !GUIDE_SPECIES.some((s) => s.key === k)).sort();
  return (
    <div style={{ background: PAPER, border: `1px solid ${OUTLINE}`, borderRadius: 16, boxShadow: "var(--ed-shadow-card)", padding: "18px 20px", marginTop: 14 }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 14, paddingBottom: 12, borderBottom: `1px solid ${OUTLINE}` }}>
        <div>
          <div style={{ fontSize: 13, fontFamily: MONO, fontWeight: 700, letterSpacing: ".14em", color: TEAL, textTransform: "uppercase" }}>Field Guide</div>
          <div style={{ fontSize: 13, fontFamily: MONO, fontWeight: 700, letterSpacing: ".08em", color: MUTED, textTransform: "uppercase", marginTop: 4 }}>Wild-map species · collected get their sticker</div>
        </div>
        <div style={{ fontFamily: DISP, fontSize: 34, fontWeight: 800, color: found === GUIDE_SPECIES.length ? TEAL : INK, fontVariantNumeric: "tabular-nums", lineHeight: 0.9 }}>
          {found}<span style={{ fontSize: 17, color: MUTED, fontWeight: 700 }}>/{GUIDE_SPECIES.length}</span>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(76px, 1fr))", gap: 10 }}>
        {GUIDE_SPECIES.map((s, i) => {
          const n = counts.get(s.key) || 0;
          const got = n > 0;
          return (
            <div key={s.key} title={got ? `${s.label} · ${n} caught` : `${s.label} — not caught yet`} style={{
              position: "relative", display: "flex", flexDirection: "column", alignItems: "center", gap: 5,
              padding: "12px 6px 10px", borderRadius: got ? 12 : 10, textAlign: "center",
              // collected = die-cut sticker (hard offset shadow, slight tilt);
              // uncaught = dashed empty slot with the ink silhouette
              background: got ? "#FFFDF7" : "transparent",
              border: got ? `1.5px solid ${INK}` : `1px dashed ${OUTLINE}`,
              boxShadow: got ? "3px 3px 0 rgba(33,26,18,.16)" : "none",
              transform: got ? `rotate(${i % 2 ? 1.4 : -1.6}deg)` : "none",
            }}>
              {/* uncaught = die-cut ink silhouette (the "gotta find it" cue) */}
              <Icon name={s.icon} size={32} alt={got ? s.label : "Unknown species"} style={got ? undefined : { filter: "brightness(0)", opacity: 0.22 }} />
              <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: got ? INK : MUTED }}>
                {got ? s.label : "???"}
              </div>
              {got && (
                <span style={{ position: "absolute", top: -6, right: -5, fontFamily: MONO, fontSize: 12, fontWeight: 700, color: "#FCE9CF", background: TEAL, border: `1.5px solid ${PAPER}`, borderRadius: 999, padding: "1px 7px", fontVariantNumeric: "tabular-nums", boxShadow: "2px 2px 0 rgba(33,26,18,.18)" }}>×{n}</span>
              )}
            </div>
          );
        })}
        {bonus.map((k, i) => (
          <div key={k} title={`${k} · ${counts.get(k)} caught — beyond the wild-map guide`} style={{
            position: "relative", display: "flex", flexDirection: "column", alignItems: "center", gap: 5,
            padding: "12px 6px 10px", borderRadius: 12, textAlign: "center",
            background: "#FFFDF7", border: `1.5px solid ${INK}`,
            boxShadow: "3px 3px 0 rgba(33,26,18,.16)",
            transform: `rotate(${i % 2 ? -1.4 : 1.6}deg)`,
          }}>
            <Icon name={kindIcon(k)} size={32} alt={k} />
            <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: INK, maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{k}</div>
            <span style={{ position: "absolute", top: -6, right: -5, fontFamily: MONO, fontSize: 12, fontWeight: 700, color: "#FCE9CF", background: "#9A4E1E", border: `1.5px solid ${PAPER}`, borderRadius: 999, padding: "1px 7px", fontVariantNumeric: "tabular-nums", boxShadow: "2px 2px 0 rgba(33,26,18,.18)" }}>×{counts.get(k)}</span>
          </div>
        ))}
      </div>
      <p style={{ fontFamily: BODY, fontSize: 13, color: MUTED, margin: "12px 0 0", lineHeight: 1.5 }}>
        These seven roam the wild map — any other real animal you photograph still counts, and joins the guide as a bonus entry.
      </p>
    </div>
  );
}

/** Guest gate — what Catch IS and one clear way in, instead of a bare line. */
function GuestGate() {
  const { openConnectModal } = useConnectModal();
  return (
    <div style={{ borderRadius: 18, border: `1px dashed ${OUTLINE}`, background: INSET, padding: "34px 24px", textAlign: "center", maxWidth: 460, margin: "8px auto 0" }}>
      <div style={{ display: "flex", justifyContent: "center" }}><CameraIcon size={40} /></div>
      <h3 style={{ fontFamily: DISP, fontSize: 22, fontWeight: 800, color: INK, margin: "12px 0 6px", letterSpacing: "-0.01em" }}>Your field kit is packed</h3>
      <p style={{ fontFamily: BODY, fontSize: 14, color: MUTED, margin: "0 auto 18px", maxWidth: 340, lineHeight: 1.55 }}>
        Photograph real street animals and collect them — every catch is vision-verified, graded a rarity, and filed into your field guide.
      </p>
      <button
        type="button"
        onClick={() => openConnectModal?.()}
        disabled={!openConnectModal}
        className="ed-card-hover"
        style={{ ...bigBtn, background: TEAL, border: `1px solid ${TEAL}`, opacity: openConnectModal ? 1 : 0.6 }}
      >
        Connect wallet to start
      </button>
    </div>
  );
}

/** Small framed collectible thumbnail — cream mat + gold inset keyline + small holo. */
function Thumb({ cat }: { cat: Cat }) {
  const wild = cat.source === "wild";
  return (
    <div style={{ position: "relative", borderRadius: 6, overflow: "hidden", background: wild ? INSET : "#000", boxShadow: "inset 0 0 0 2px rgba(184,130,44,.5)", width: "100%", aspectRatio: "1 / 1" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={cat.photo_path} alt={cat.name} style={{ width: "100%", height: "100%", objectFit: wild ? "contain" : "cover", display: "block", padding: wild ? "12%" : 0 }} />
      <div className="ed-holo-sheen" aria-hidden />
    </div>
  );
}

function CatCard({ cat, compact, onToggleMap, onDelete }: { cat: Cat; compact?: boolean; onToggleMap?: (id: number, val: boolean) => Promise<boolean>; onDelete?: (cat: Cat) => void }) {
  const wild = cat.source === "wild";
  // Rarity seal letter in the rarity color (C/R/E/L)
  const rarityLetter = ["C", "U", "R", "E", "L"][rarityRank(cat.rarity)] || "C";
  // Owner controls (album only): per-catch map consent + hard delete. The map
  // toggle exists only for camera catches that carry a location.
  const [mapBusy, setMapBusy] = useState(false);
  const canMap = !!onToggleMap && !wild && cat.lat != null && cat.lng != null;
  const onMap = !!cat.map_public;
  const toggle = async () => {
    if (!onToggleMap || mapBusy) return;
    setMapBusy(true);
    await onToggleMap(cat.id, !onMap); // parent state refresh flips the label
    setMapBusy(false);
  };
  const ctrlBtn: React.CSSProperties = {
    padding: "4px 9px", borderRadius: 999, cursor: "pointer", fontFamily: MONO,
    fontWeight: 700, fontSize: 12, letterSpacing: ".05em", textTransform: "uppercase",
    background: INSET, border: `1px solid ${OUTLINE}`, color: "#5C5140",
  };
  return (
    <div style={{
      position: "relative",
      width: "100%", maxWidth: compact ? undefined : 260, margin: "0 auto",
      borderRadius: 12, padding: 9, background: PAPER,
      border: `1px solid ${OUTLINE}`, boxShadow: "var(--ed-shadow-card)",
    }}>
      <div style={{ position: "relative", borderRadius: 8, overflow: "hidden", background: PAPER }}>
        <div style={{ position: "relative", width: "100%", aspectRatio: "1 / 1", background: wild ? INSET : "#000", borderRadius: 6, overflow: "hidden", boxShadow: "inset 0 0 0 2px rgba(184,130,44,.5)" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={cat.photo_path} alt={cat.name} style={{ width: "100%", height: "100%", objectFit: wild ? "contain" : "cover", display: "block", padding: wild ? "12%" : 0 }} />
          <div className="ed-holo-sheen" aria-hidden />
          {/* rarity seal letter in the rarity color */}
          <div style={{ position: "absolute", top: 6, right: 6, width: compact ? 22 : 26, height: compact ? 22 : 26, borderRadius: "50%", background: PAPER, border: `1.5px solid ${cat.rarityColor}`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: MONO, fontWeight: 700, fontSize: compact ? 11 : 13, color: cat.rarityColor, boxShadow: "0 4px 10px -4px rgba(80,55,20,.5)" }}>{rarityLetter}</div>
          {wild && (
            <div style={{ position: "absolute", bottom: 6, left: 6, background: "rgba(33,26,18,.78)", color: "#FCE9CF", fontSize: 13, fontWeight: 700, padding: "2px 8px", borderRadius: 5, textTransform: "uppercase", letterSpacing: ".12em", fontFamily: MONO }}>Wild</div>
          )}
        </div>
        <div style={{ padding: compact ? "9px 4px 2px" : "11px 4px 2px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: compact ? 15 : 17, fontWeight: 700, color: INK, fontFamily: DISP, minWidth: 0 }}>
              <Icon name={kindIcon(cat.kind)} size={compact ? 15 : 17} />
              <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{cat.name}</span>
            </div>
            <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: MUTED, letterSpacing: ".06em", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>HP {cat.hp}</span>
          </div>
          <div style={{ fontSize: 13, color: MUTED, margin: "5px 0 8px", fontFamily: MONO, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", lineHeight: 1.4 }}>{cat.breed} · {cat.element}</div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", fontSize: 13, fontFamily: MONO, fontWeight: 700, color: INK, letterSpacing: ".04em", fontVariantNumeric: "tabular-nums" }}>
            {([["ATK", cat.atk], ["DEF", cat.def], ["SPD", cat.spd]] as const).map(([k, v]) => (
              <span key={k} style={{ background: INSET, borderRadius: 5, padding: "2px 7px", border: `1px solid ${OUTLINE}` }}>{k} {v}</span>
            ))}
          </div>
          {/* Owner controls — map consent state is always visible and reversible
              ("Remove from map"); Delete hard-deletes the catch + its photo. */}
          {(canMap || onDelete) && (
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 8 }}>
              {canMap && (
                <button onClick={toggle} disabled={mapBusy} title={onMap ? "Shared on the community map at a rounded (~110 m) location — click to remove" : "Private — click to share on the community map at a rounded (~110 m) location"} style={{
                  ...ctrlBtn, opacity: mapBusy ? 0.6 : 1,
                  ...(onMap ? { background: TEAL, border: `1px solid ${TEAL}`, color: "#FCE9CF" } : {}),
                }}>{onMap ? "On map · remove" : "Share to map"}</button>
              )}
              {onDelete && (
                <button onClick={() => onDelete(cat)} title="Delete this catch and its photo permanently" style={{ ...ctrlBtn, color: "#B14A2C", borderColor: "rgba(177,74,44,.45)" }}>Delete</button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const bigBtn: React.CSSProperties = { padding: "12px 24px", borderRadius: 999, border: "1px solid #211A12", background: "linear-gradient(180deg,#2C2316,#211A12)", color: "#FCE9CF", fontFamily: MONO, fontWeight: 700, fontSize: 13, letterSpacing: ".08em", textTransform: "uppercase", cursor: "pointer", boxShadow: "var(--ed-shadow-card)" };
const ghostBtn: React.CSSProperties = { padding: "10px 18px", borderRadius: 999, border: `1px solid ${INK}`, background: "transparent", color: INK, fontFamily: MONO, fontWeight: 700, fontSize: 13, letterSpacing: ".08em", textTransform: "uppercase", cursor: "pointer" };

function Shell({ children }: { children: React.ReactNode }) {
  // Catch renders as a TAB inside CardDeck's shell now, which already paints the
  // field background, grain, glow and vignette — keep this wrapper transparent
  // (no second print surface) and scale the heading under the page's h1.
  return (
    <div style={{ position: "relative", maxWidth: 640, margin: "0 auto", padding: "6px 0 8px", fontFamily: BODY, color: INK }}>
      <div style={{ marginBottom: 20, textAlign: "center" }}>
        <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, letterSpacing: "0.14em", color: TEAL, textTransform: "uppercase" }}>Catch · real animals only</div>
        <h2 style={{ fontFamily: DISP, fontSize: 32, fontWeight: 800, color: INK, margin: "7px 0 0", letterSpacing: "-0.02em", lineHeight: 1 }}>Catch animals</h2>
        {/* The anti-screenshot / cats-and-dogs rules are stated ONCE, in the
            viewfinder intro next to the camera action — not repeated here. */}
        <p style={{ fontFamily: BODY, fontSize: 14.5, color: MUTED, margin: "10px auto 0", lineHeight: 1.55, maxWidth: 440 }}>
          Spot an animal in the wild, snap it, and it becomes a collectible with its own rarity, element and stats.
        </p>
      </div>
      {children}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: "24px 0", fontFamily: MONO, fontSize: 13, letterSpacing: ".06em", color: MUTED, textAlign: "center" }}>{children}</div>;
}
