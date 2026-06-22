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

type Phase = "intro" | "camera" | "catching" | "result";

export default function CatCatch() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [phase, setPhase] = useState<Phase>("intro");
  const [view, setView] = useState<"catch" | "map">("catch");
  const [camErr, setCamErr] = useState<string | null>(null);
  const [result, setResult] = useState<{ caught: boolean; cat?: Cat; reason?: string; antiCheat?: boolean; pointsAwarded?: number } | null>(null);
  const [collection, setCollection] = useState<Cat[]>([]);
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
    submitPhoto(canvas.toDataURL("image/jpeg", 0.85));
  };

  // Desktop / no-camera fallback. The SAME vision anti-cheat runs on uploads,
  // so screenshots, photos of screens, drawings and memes are still rejected.
  const onUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => { if (typeof reader.result === "string") submitPhoto(reader.result); };
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
        {(["catch", "map"] as const).map((t) => (
          <button key={t} onClick={() => setView(t)} style={{
            padding: "8px 20px", borderRadius: 999, cursor: "pointer", fontSize: 14, fontWeight: 800,
            border: `2.5px solid ${OUTLINE}`, background: view === t ? "#f59e0b" : "#fff", color: INK,
            boxShadow: view === t ? "0 3px 0 rgba(26,26,34,0.25)" : "none",
            display: "inline-flex", alignItems: "center", gap: 7,
          }}>{t === "catch" ? <CameraIcon size={17} /> : <Icon name="compass" size={18} />}{t === "catch" ? "Catch" : "Nearby"}</button>
        ))}
      </div>

      {view === "map" && (
        <Suspense fallback={<Empty>Loading map…</Empty>}>
          <NearbyMap onCaught={(cat: Cat) => setCollection((c) => [cat, ...c])} />
        </Suspense>
      )}

      {view === "catch" && (<>
      {/* ── Capture zone ── */}
      <div style={{ position: "relative", borderRadius: 22, overflow: "hidden", border: `3px solid ${OUTLINE}`, background: "#000", aspectRatio: "3 / 4", maxHeight: 520, margin: "0 auto 18px", boxShadow: "0 10px 0 rgba(26,26,34,0.12)" }}>
        {phase === "intro" && (
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, background: CREAM, padding: 24, textAlign: "center" }}>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 4 }}>
              <Icon name="cat" size={74} />
              <Icon name="dog" size={74} />
            </div>
            <div style={{ fontSize: 17, fontWeight: 800, color: INK, maxWidth: 320, lineHeight: 1.4 }}>See a street cat or dog? Point your camera and catch it.</div>
            <div style={{ fontSize: 13, color: MUTED, maxWidth: 300 }}>Real animals only — screenshots and photos of screens won&apos;t work.</div>
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

        {phase === "result" && result && (
          <div style={{ position: "absolute", inset: 0, background: CREAM, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, padding: 20, textAlign: "center", overflowY: "auto" }}>
            {result.caught && result.cat ? (
              <>
                <div style={{ fontSize: 14, fontWeight: 800, color: result.cat.rarityColor, letterSpacing: 1 }}>{result.cat.rarityLabel.toUpperCase()} — CAUGHT!</div>
                <CatCard cat={result.cat} />
                {!!result.pointsAwarded && (
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 14, fontWeight: 800, color: "#b45309", background: "rgba(245,158,11,0.14)", borderRadius: 999, padding: "5px 14px" }}>+{result.pointsAwarded} season points <Icon name="coin" size={16} /></div>
                )}
                <button onClick={again} style={bigBtn}>Catch another</button>
              </>
            ) : (
              <>
                <Icon name={result.antiCheat ? "shield" : "footprints"} size={52} />
                <div style={{ fontSize: 17, fontWeight: 800, color: INK, maxWidth: 320, lineHeight: 1.4 }}>{result.antiCheat ? "Nice try!" : "No catch"}</div>
                <div style={{ fontSize: 14, color: MUTED, maxWidth: 320 }}>{result.reason}</div>
                <button onClick={again} style={bigBtn}>Try again</button>
              </>
            )}
            <button onClick={done} style={{ ...ghostBtn, marginTop: 2 }}>Done</button>
          </div>
        )}
      </div>

      {/* ── Collection ── */}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginTop: 26, marginBottom: 12 }}>
        <h2 style={{ fontSize: 19, fontWeight: 800, color: INK, margin: 0 }}>Your collection</h2>
        <span style={{ fontSize: 13, color: MUTED }}>{collection.length} caught</span>
      </div>
      {collection.length === 0 ? (
        <Empty>No catches yet — go find a cat or dog!</Empty>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 14 }}>
          {collection.map((c) => <CatCard key={c.id} cat={c} compact />)}
        </div>
      )}
      </>)}

      <style>{`@keyframes ccBob{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}`}</style>
    </Shell>
  );
}

function CatCard({ cat, compact }: { cat: Cat; compact?: boolean }) {
  const rc = cat.rarityColor;
  return (
    <div style={{ width: "100%", maxWidth: compact ? undefined : 260, margin: "0 auto", borderRadius: 16, overflow: "hidden", border: `3px solid ${rc}`, background: "#fff", boxShadow: `0 6px 0 ${rc}33` }}>
      <div style={{ position: "relative", width: "100%", aspectRatio: "1 / 1", background: "#eee" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={cat.photo_path} alt={cat.name} style={{ width: "100%", height: "100%", objectFit: cat.source === "wild" ? "contain" : "cover", display: "block", padding: cat.source === "wild" ? "12%" : 0, background: cat.source === "wild" ? "#fbf6ec" : undefined }} />
        <div style={{ position: "absolute", top: 6, right: 6, background: rc, color: "#fff", fontSize: 10, fontWeight: 900, padding: "2px 8px", borderRadius: 999, textTransform: "uppercase", letterSpacing: 0.5 }}>{cat.rarityLabel}</div>
        {cat.source === "wild" && (
          <div style={{ position: "absolute", top: 6, left: 6, background: "#f59e0b", color: INK, fontSize: 9.5, fontWeight: 900, padding: "2px 7px", borderRadius: 999, textTransform: "uppercase", letterSpacing: 0.5, border: `1.5px solid ${INK}` }}>Wild</div>
        )}
      </div>
      <div style={{ padding: compact ? "8px 10px" : "10px 12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: compact ? 14 : 16, fontWeight: 800, color: INK }}>
          <Icon name={cat.kind === "dog" ? "dog" : "cat"} size={compact ? 15 : 17} />
          <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{cat.name}</span>
        </div>
        <div style={{ fontSize: 11, color: MUTED, marginBottom: 6 }}>{cat.breed} · {cat.element}</div>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", fontSize: 10.5, fontFamily: "'JetBrains Mono',monospace", color: INK }}>
          {([["HP", cat.hp], ["ATK", cat.atk], ["DEF", cat.def], ["SPD", cat.spd]] as const).map(([k, v]) => (
            <span key={k} style={{ background: "#f1efe7", borderRadius: 6, padding: "2px 6px" }}>{k} {v}</span>
          ))}
        </div>
      </div>
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
        <h1 style={{ fontSize: 28, fontWeight: 900, color: INK, margin: "6px 0 0", letterSpacing: "-0.02em" }}>Catch cats &amp; dogs</h1>
        <p style={{ fontSize: 14.5, color: MUTED, margin: "8px auto 0", lineHeight: 1.55, maxWidth: 440 }}>
          Spot a cat or dog in the wild, snap it, and it becomes a collectible — with its own rarity, element and stats. No cheating: screenshots don&apos;t count.
        </p>
      </div>
      {children}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: "24px 0", fontSize: 14, color: MUTED, textAlign: "center" }}>{children}</div>;
}
