"use client";

/**
 * StudioEditor — the lightweight CLIENT-SIDE reel assembler (Studio-Pro V1).
 *
 *   ┌──────────────────────────────────────────────────────────────────┐
 *   │  Assemble                                              ✕ close     │
 *   ├───────────────────────────────┬──────────────────────────────────┤
 *   │                               │  IMPORT   your generated clips    │
 *   │         PREVIEW CANVAS        │  [thumb +] [thumb +] …            │
 *   │      (live composited reel)   │                                   │
 *   │        ▶  ────●──────  0:07    │  CLIP  trim · reorder · caption   │
 *   │                               │  MUSIC  none / synth loops        │
 *   ├───────────────────────────────┴──────────────────────────────────┤
 *   │  TIMELINE  [clip 1][clip 2][clip 3]                                │
 *   ├───────────────────────────────────────────────────────────────────┤
 *   │  EXPORT   ( free 720p+watermark )  ( HD 1080p · no wm · 10 cr )    │
 *   └───────────────────────────────────────────────────────────────────┘
 *
 * ═══════════════════════════════════════════════════════════════════════
 *  ALL RENDERING IS 100% CLIENT-SIDE. The server stays idle — no upload, no
 *  transcode, no ffmpeg, no headless Chromium. Trim / sequence / caption /
 *  watermark / music / final encode all run on the user's own device + GPU
 *  (canvas.captureStream + MediaRecorder + WebAudio). See editorEngine.ts and
 *  docs/STUDIO-PRO.md §2. The only thing that ever costs credits is the
 *  watermark-free HD export — a pure-margin resolution/watermark lever with
 *  zero vendor cost (the credit charge itself is a documented TODO below).
 * ═══════════════════════════════════════════════════════════════════════
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  detectCaps,
  drawCover,
  startMusic,
  MUSIC_TRACKS,
  fmtBytes,
  fmtTime,
  type EditorCaps,
} from "@/lib/studio/editorEngine";

// Reuse PetStudioPro's Collectible-Editorial tokens (kept local — no new system).
const T = {
  field: "#ECE4D4", paper: "#FBF6EC", inset: "#F5EFE2", ink: "#211A12", ink70: "#3A3024",
  muted: "#7A6E5A", muted2: "#5C5140", mono: "#9A7B4E", hair: "rgba(33,26,18,.13)",
  terra: "#BE4F28", creamOn: "#FCE9CF", cta1: "#F49B2A", cta2: "#E27D0C",
  studio: "#6B4FA0", studioDeep: "#3E3470", studioInk: "#191334", thrive: "#5C8A4E",
  disp: "var(--ed-disp)", body: "var(--ed-body)", m: "var(--ed-m)",
};

// The single V1 pay-moment: watermark-free 1080p export. Zero vendor cost →
// pure margin. Value mirrors docs/STUDIO-PRO.md §5.1 ("HD 1080p clean = 10 cr").
const HD_EXPORT_COST = 10;
// HONESTY GATE: the atomic credit charge + one-time server token (POST
// /api/studio/export, docs/STUDIO-PRO.md §3.4) is NOT wired yet, so no click
// ever actually deducts credits. Until that endpoint ships, HD export is
// genuinely free — the UI must say so and must NOT advertise a "10 cr" price
// that never gets charged. Flip this to false the moment the charge lands.
const HD_EXPORT_FREE_BETA = true;
const MAX_CLIPS = 3;
const MAX_REEL_SEC = 60; // ruthless V1 cap — social lengths only (STUDIO-PRO §6)

// A clip the parent (PetStudioPro) hands us — one of the user's generations.
export interface EditorSourceClip {
  id: string;
  url: string;
  kind: "video" | "image";
  label?: string;
}

// A clip placed on the timeline, with its edit state.
interface TimelineClip {
  key: string;          // unique per placement
  src: EditorSourceClip;
  natW: number;
  natH: number;
  natDur: number;       // video: real duration; image: 0 (uses `dur`)
  trimIn: number;       // video only
  trimOut: number;      // video only
  dur: number;          // image only: how long to show it
  caption: string;
}

type CaptionPos = "top" | "center" | "bottom";
type CaptionFont = "bold" | "serif" | "mono";

const CAPTION_FONTS: Record<CaptionFont, string> = {
  bold: '900 1px "Arial Black", "Helvetica Neue", Arial, sans-serif',
  serif: '700 1px Georgia, "Times New Roman", serif',
  mono: '700 1px "Courier New", ui-monospace, monospace',
};

interface StudioEditorProps {
  open: boolean;
  onClose: () => void;
  clips: EditorSourceClip[];
  credits: number | null;
  userTier: "free" | "pro" | "studio";
}

// ── module-level canvas draw helpers ────────────────────────────────────────

function clipLength(c: TimelineClip): number {
  return c.src.kind === "video" ? Math.max(0.1, c.trimOut - c.trimIn) : c.dur;
}

function drawCaption(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  text: string,
  pos: CaptionPos,
  font: CaptionFont,
) {
  if (!text.trim()) return;
  const size = Math.round(h * 0.052);
  ctx.save();
  ctx.font = CAPTION_FONTS[font].replace("1px", `${size}px`);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const metrics = ctx.measureText(text);
  const padX = size * 0.55;
  const padY = size * 0.4;
  const boxW = Math.min(w * 0.92, metrics.width + padX * 2);
  const boxH = size + padY * 2;
  const cx = w / 2;
  const cy = pos === "top" ? boxH * 0.75 + h * 0.04 : pos === "center" ? h / 2 : h - boxH * 0.75 - h * 0.04;
  // pill backdrop for legibility over any footage
  ctx.fillStyle = "rgba(25,19,52,0.62)";
  const r = boxH / 2;
  const x = cx - boxW / 2;
  const y = cy - boxH / 2;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + boxW, y, x + boxW, y + boxH, r);
  ctx.arcTo(x + boxW, y + boxH, x, y + boxH, r);
  ctx.arcTo(x, y + boxH, x, y, r);
  ctx.arcTo(x, y, x + boxW, y, r);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#FCE9CF";
  ctx.fillText(text, cx, cy + size * 0.04, w * 0.88);
  ctx.restore();
}

function drawWatermark(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const size = Math.round(h * 0.032);
  ctx.save();
  ctx.font = `800 ${size}px "Arial Black", Arial, sans-serif`;
  ctx.textAlign = "right";
  ctx.textBaseline = "alphabetic";
  const text = "MY AI PET";
  const pad = size * 0.9;
  // soft shadow so the mark reads on light or dark footage
  ctx.shadowColor = "rgba(0,0,0,0.55)";
  ctx.shadowBlur = size * 0.4;
  ctx.fillStyle = "rgba(252,233,207,0.92)";
  ctx.fillText(text, w - pad, h - pad);
  ctx.restore();
}

export default function StudioEditor({ open, onClose, clips, credits, userTier }: StudioEditorProps) {
  const caps = useMemo<EditorCaps>(() => detectCaps(), []);
  const [timeline, setTimeline] = useState<TimelineClip[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [captionPos, setCaptionPos] = useState<CaptionPos>("bottom");
  const [captionFont, setCaptionFont] = useState<CaptionFont>("bold");
  const [musicId, setMusicId] = useState<string>("none");
  const [musicVol, setMusicVol] = useState(0.6);
  const [playing, setPlaying] = useState(false);
  const [playhead, setPlayhead] = useState(0);
  const [loadingSrc, setLoadingSrc] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // export state
  const [exporting, setExporting] = useState(false);
  const [exportPct, setExportPct] = useState(0);
  const [exportResult, setExportResult] = useState<{ url: string; ext: string; size: number; hd: boolean } | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  // Loaded media elements keyed by source url (created once, reused).
  const mediaRef = useRef<Map<string, HTMLVideoElement | HTMLImageElement>>(new Map());
  const rafRef = useRef<number | null>(null);
  const playIndexRef = useRef(0);
  const imgStartRef = useRef(0);
  const abortExportRef = useRef(false);

  const totalDur = useMemo(() => timeline.reduce((s, c) => s + clipLength(c), 0), [timeline]);
  const selected = timeline.find((c) => c.key === selectedKey) || null;

  // clips already placed (a source can be added once) — keeps V1 simple.
  const placedIds = useMemo(() => new Set(timeline.map((c) => c.src.id)), [timeline]);

  // ── media loading ──────────────────────────────────────────────────────
  const loadMedia = useCallback((src: EditorSourceClip): Promise<HTMLVideoElement | HTMLImageElement> => {
    const existing = mediaRef.current.get(src.url);
    if (existing) return Promise.resolve(existing);
    return new Promise((resolve, reject) => {
      if (src.kind === "video") {
        const v = document.createElement("video");
        // crossOrigin lets us draw remote clips to canvas without tainting it.
        // Same-origin /uploads (where finished gens are persisted) always works;
        // a remote host without CORS headers is a documented V1 limitation.
        v.crossOrigin = "anonymous";
        v.muted = true;
        v.playsInline = true;
        v.preload = "auto";
        v.src = src.url;
        v.onloadedmetadata = () => { mediaRef.current.set(src.url, v); resolve(v); };
        v.onerror = () => reject(new Error("Could not load this clip"));
      } else {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => { mediaRef.current.set(src.url, img); resolve(img); };
        img.onerror = () => reject(new Error("Could not load this image"));
        img.src = src.url;
      }
    });
  }, []);

  const addClip = useCallback(async (src: EditorSourceClip) => {
    if (timeline.length >= MAX_CLIPS || placedIds.has(src.id)) return;
    setLoadError(null);
    setLoadingSrc(src.id);
    try {
      const el = await loadMedia(src);
      const natW = src.kind === "video" ? (el as HTMLVideoElement).videoWidth : (el as HTMLImageElement).naturalWidth;
      const natH = src.kind === "video" ? (el as HTMLVideoElement).videoHeight : (el as HTMLImageElement).naturalHeight;
      const natDur = src.kind === "video" ? (el as HTMLVideoElement).duration || 5 : 0;
      const clip: TimelineClip = {
        key: `${src.id}-${Date.now()}`,
        src, natW, natH, natDur,
        trimIn: 0,
        trimOut: src.kind === "video" ? Math.min(natDur, 8) : 0,
        dur: src.kind === "image" ? 3 : 0,
        caption: "",
      };
      setTimeline((t) => [...t, clip]);
      setSelectedKey(clip.key);
    } catch (e: any) {
      setLoadError(e?.message || "Could not load this clip");
    } finally {
      setLoadingSrc(null);
    }
  }, [timeline.length, placedIds, loadMedia]);

  const removeClip = (key: string) => {
    setTimeline((t) => t.filter((c) => c.key !== key));
    setSelectedKey((k) => (k === key ? null : k));
  };
  const moveClip = (key: string, dir: -1 | 1) => {
    setTimeline((t) => {
      const i = t.findIndex((c) => c.key === key);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= t.length) return t;
      const next = [...t];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };
  const patchClip = (key: string, patch: Partial<TimelineClip>) => {
    setTimeline((t) => t.map((c) => (c.key === key ? { ...c, ...patch } : c)));
  };

  // ── output geometry (derived from the first clip's orientation) ──────────
  const orientation: "landscape" | "portrait" | "square" = useMemo(() => {
    const first = timeline[0];
    if (!first || !first.natW || !first.natH) return "landscape";
    const r = first.natW / first.natH;
    if (r > 1.2) return "landscape";
    if (r < 0.85) return "portrait";
    return "square";
  }, [timeline]);
  const dims = useCallback((hd: boolean) => {
    const long = hd ? 1920 : 1280;
    const short = hd ? 1080 : 720;
    if (orientation === "portrait") return { w: hd ? 1080 : 720, h: hd ? 1920 : 1280 };
    if (orientation === "square") return { w: short, h: short };
    return { w: long, h: short };
  }, [orientation]);

  // ── one-frame draw (paused preview of the selected/first clip) ───────────
  const drawStill = useCallback((clip: TimelineClip, localT: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const el = mediaRef.current.get(clip.src.url);
    if (!el) return;
    const paint = () => {
      ctx.fillStyle = T.studioInk;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      drawCover(ctx, el, clip.natW, clip.natH, canvas.width, canvas.height);
      drawCaption(ctx, canvas.width, canvas.height, clip.caption, captionPos, captionFont);
    };
    if (clip.src.kind === "video") {
      const v = el as HTMLVideoElement;
      const target = clip.trimIn + Math.max(0, localT);
      if (Math.abs(v.currentTime - target) > 0.05) {
        const onSeek = () => { v.removeEventListener("seeked", onSeek); paint(); };
        v.addEventListener("seeked", onSeek);
        try { v.currentTime = target; } catch { paint(); }
      } else {
        paint();
      }
    } else {
      paint();
    }
  }, [captionPos, captionFont]);

  // ── live playback (real time) ────────────────────────────────────────────
  const stopRaf = () => {
    if (rafRef.current != null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
  };
  const pausePlayback = useCallback(() => {
    stopRaf();
    const cur = timeline[playIndexRef.current];
    if (cur?.src.kind === "video") {
      const v = mediaRef.current.get(cur.src.url) as HTMLVideoElement | undefined;
      v?.pause();
    }
    setPlaying(false);
  }, [timeline]);

  const startPlayback = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || timeline.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // restart from top if we're at the end
    let startIndex = playIndexRef.current;
    if (startIndex >= timeline.length) startIndex = 0;
    playIndexRef.current = startIndex;
    setPlaying(true);

    const enter = (idx: number) => {
      const clip = timeline[idx];
      if (!clip) return;
      if (clip.src.kind === "video") {
        const v = mediaRef.current.get(clip.src.url) as HTMLVideoElement | undefined;
        if (v) { try { v.currentTime = clip.trimIn; } catch { /* ignore */ } v.muted = true; v.play().catch(() => {}); }
      } else {
        imgStartRef.current = performance.now();
      }
    };
    enter(startIndex);

    const before = (idx: number) => timeline.slice(0, idx).reduce((s, c) => s + clipLength(c), 0);

    const tick = () => {
      const idx = playIndexRef.current;
      const clip = timeline[idx];
      if (!clip) { pausePlayback(); setPlayhead(totalDur); return; }
      const el = mediaRef.current.get(clip.src.url);
      if (el) {
        ctx.fillStyle = T.studioInk;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        drawCover(ctx, el, clip.natW, clip.natH, canvas.width, canvas.height);
        drawCaption(ctx, canvas.width, canvas.height, clip.caption, captionPos, captionFont);
      }
      let localT: number;
      let done: boolean;
      if (clip.src.kind === "video") {
        const v = el as HTMLVideoElement;
        localT = Math.max(0, v.currentTime - clip.trimIn);
        done = v.currentTime >= clip.trimOut - 0.03 || v.ended;
      } else {
        localT = (performance.now() - imgStartRef.current) / 1000;
        done = localT >= clip.dur;
      }
      setPlayhead(before(idx) + Math.min(localT, clipLength(clip)));
      if (done) {
        if (clip.src.kind === "video") {
          const v = el as HTMLVideoElement;
          v.pause();
        }
        const next = idx + 1;
        if (next >= timeline.length) {
          playIndexRef.current = timeline.length;
          setPlayhead(totalDur);
          stopRaf();
          setPlaying(false);
          return;
        }
        playIndexRef.current = next;
        enter(next);
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [timeline, totalDur, captionPos, captionFont, pausePlayback]);

  const togglePlay = () => {
    if (playing) pausePlayback();
    else {
      if (playIndexRef.current >= timeline.length) { playIndexRef.current = 0; setPlayhead(0); }
      startPlayback();
    }
  };

  // Redraw the paused preview whenever selection / caption / clips change.
  useEffect(() => {
    if (playing) return;
    const clip = selected || timeline[0];
    if (clip) drawStill(clip, 0);
    else {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (canvas && ctx) { ctx.fillStyle = T.studioInk; ctx.fillRect(0, 0, canvas.width, canvas.height); }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKey, timeline, captionPos, captionFont, playing]);

  // Stop everything when the modal closes / unmounts.
  useEffect(() => {
    if (!open) { pausePlayback(); playIndexRef.current = 0; setPlayhead(0); }
    return () => { stopRaf(); abortExportRef.current = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Escape closes (but not mid-export).
  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    requestAnimationFrame(() => dialogRef.current?.focus());
    return () => { previousFocus?.focus(); };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !exporting) onClose();
      if (e.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      ));
      if (!focusable.length) { e.preventDefault(); dialogRef.current.focus(); return; }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, exporting, onClose]);

  // ── EXPORT (100% client-side) ────────────────────────────────────────────
  const runExport = useCallback(async (hd: boolean, watermark: boolean) => {
    if (!caps.canRecord || timeline.length === 0 || exporting) return;
    pausePlayback();
    setExportError(null);
    setExportResult(null);
    setExporting(true);
    setExportPct(0);
    abortExportRef.current = false;

    const { w, h } = dims(hd);
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) { setExportError("Canvas unavailable"); setExporting(false); return; }

    let audioCtx: AudioContext | null = null;
    let stopMusic: (() => void) | null = null;
    let rec: MediaRecorder | null = null;
    try {
      const stream = (canvas as any).captureStream(30) as MediaStream;

      // Mix the synthesised music track in via a MediaStreamDestination — all
      // client-side WebAudio, nothing fetched, server never sees the audio.
      if (musicId !== "none") {
        const AC: typeof AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
        audioCtx = new AC();
        const dest = audioCtx.createMediaStreamDestination();
        stopMusic = startMusic(audioCtx, dest, musicId, totalDur, musicVol);
        for (const tr of dest.stream.getAudioTracks()) stream.addTrack(tr);
      }

      const chunks: BlobPart[] = [];
      rec = new MediaRecorder(stream, caps.mime ? { mimeType: caps.mime } : undefined);
      rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
      const stopped = new Promise<void>((res) => { rec!.onstop = () => res(); });
      rec.start(100);

      // Real-time playthrough onto the export canvas.
      const before = (idx: number) => timeline.slice(0, idx).reduce((s, c) => s + clipLength(c), 0);
      for (let idx = 0; idx < timeline.length; idx++) {
        if (abortExportRef.current) break;
        const clip = timeline[idx];
        const el = mediaRef.current.get(clip.src.url);
        if (!el) continue;
        const len = clipLength(clip);
        if (clip.src.kind === "video") {
          const v = el as HTMLVideoElement;
          v.muted = true;
          try { v.currentTime = clip.trimIn; } catch { /* ignore */ }
          await new Promise<void>((res) => {
            const onSeek = () => { v.removeEventListener("seeked", onSeek); res(); };
            v.addEventListener("seeked", onSeek);
            // safety: don't hang forever if 'seeked' never fires
            setTimeout(res, 400);
          });
          await v.play().catch(() => {});
          await new Promise<void>((res) => {
            const step = () => {
              if (abortExportRef.current) { res(); return; }
              ctx.fillStyle = T.studioInk;
              ctx.fillRect(0, 0, w, h);
              drawCover(ctx, v, clip.natW, clip.natH, w, h);
              drawCaption(ctx, w, h, clip.caption, captionPos, captionFont);
              if (watermark) drawWatermark(ctx, w, h);
              const local = Math.max(0, v.currentTime - clip.trimIn);
              setExportPct(Math.min(99, Math.round(((before(idx) + Math.min(local, len)) / Math.max(0.1, totalDur)) * 100)));
              if (v.currentTime >= clip.trimOut - 0.03 || v.ended) { v.pause(); res(); return; }
              requestAnimationFrame(step);
            };
            requestAnimationFrame(step);
          });
        } else {
          const img = el as HTMLImageElement;
          const startWall = performance.now();
          await new Promise<void>((res) => {
            const step = () => {
              if (abortExportRef.current) { res(); return; }
              const local = (performance.now() - startWall) / 1000;
              ctx.fillStyle = T.studioInk;
              ctx.fillRect(0, 0, w, h);
              drawCover(ctx, img, clip.natW, clip.natH, w, h);
              drawCaption(ctx, w, h, clip.caption, captionPos, captionFont);
              if (watermark) drawWatermark(ctx, w, h);
              setExportPct(Math.min(99, Math.round(((before(idx) + Math.min(local, len)) / Math.max(0.1, totalDur)) * 100)));
              if (local >= clip.dur) { res(); return; }
              requestAnimationFrame(step);
            };
            requestAnimationFrame(step);
          });
        }
      }

      rec.stop();
      await stopped;
      stopMusic?.();
      if (audioCtx) await audioCtx.close().catch(() => {});
      if (abortExportRef.current) { setExporting(false); return; }

      const blob = new Blob(chunks, { type: caps.mime || "video/webm" });
      if (!blob.size) throw new Error("Export produced no data — the clip source may block cross-origin canvas capture.");
      const url = URL.createObjectURL(blob);
      setExportResult({ url, ext: caps.ext, size: blob.size, hd });
      setExportPct(100);
    } catch (e: any) {
      try { if (rec && rec.state !== "inactive") rec.stop(); } catch { /* ignore */ }
      stopMusic?.();
      if (audioCtx) await audioCtx.close().catch(() => {});
      // A tainted-canvas SecurityError is the most likely failure for remote clips.
      const msg = String(e?.name === "SecurityError" || /taint|cross-origin/i.test(e?.message || "")
        ? "This clip's host blocks cross-origin capture. Clips saved to your library export fine."
        : e?.message || "Export failed");
      setExportError(msg);
    } finally {
      setExporting(false);
    }
  }, [caps, timeline, exporting, dims, musicId, musicVol, totalDur, captionPos, captionFont, pausePlayback]);

  // ── credit gate for the HD / watermark-free export ───────────────────────
  const tierIncludesHd = userTier === "pro" || userTier === "studio";
  const canAffordHd = credits != null && credits >= HD_EXPORT_COST;
  // While in free beta HD is open to everyone; once the paywall endpoint lands,
  // fall back to the tier/credit gate.
  const hdUnlocked = HD_EXPORT_FREE_BETA || tierIncludesHd || canAffordHd;

  const onHdExport = () => {
    if (!hdUnlocked) return;
    // TODO(v1-paywall): before rendering clean, charge the HD-export credits and
    // mint a one-time server token so the watermark can't be bypassed client-side
    //   → POST /api/studio/export { projectHash } → { token, creditsRemaining }
    // (see docs/STUDIO-PRO.md §3.4 / §6 "Watermark bypass"). Until that endpoint
    // exists, HD_EXPORT_FREE_BETA keeps this honestly free — the label reflects
    // that, so no charge is ever advertised that doesn't happen.
    runExport(true, false);
  };

  if (!open) return null;

  const reduce = caps.reducedMotion;
  const sourceVideos = clips.filter((c) => c.kind === "video");
  const hasClips = timeline.length > 0;

  return (
    <div
      onMouseDown={() => { if (!exporting) onClose(); }}
      style={{
        // Above the fixed global Nav (zIndex 100) — at 90 the nav bar painted
        // OVER this fullscreen editor and overlapped its header while scrolling.
        position: "fixed", inset: 0, zIndex: 114,
        background: "rgba(15,11,28,.62)",
        backdropFilter: "blur(7px)", WebkitBackdropFilter: "blur(7px)",
        display: "flex", alignItems: "flex-start", justifyContent: "center",
        padding: "24px 16px", overflowY: "auto",
        animation: reduce ? undefined : "edScrimIn 160ms ease both",
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="studio-editor-title"
        tabIndex={-1}
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          background: T.field, borderRadius: 20, padding: 20,
          border: `1px solid ${T.hair}`, boxShadow: "var(--ed-shadow-float)",
          width: "min(1080px, 100%)", maxWidth: "100%",
          animation: reduce ? undefined : "edPanelIn 260ms cubic-bezier(.2,.8,.2,1) both",
        }}
      >
        {/* header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 240px", minWidth: 0 }}>
            <div style={{ fontFamily: T.m, fontWeight: 700, fontSize: 14, letterSpacing: "0.16em", color: T.studio, textTransform: "uppercase" }}>
              STUDIO · ASSEMBLE
            </div>
            <h2 id="studio-editor-title" style={{ fontFamily: T.disp, fontWeight: 800, fontSize: 30, letterSpacing: "-0.02em", margin: "2px 0 0", color: T.ink, lineHeight: 1.05 }}>
              Build your reel
            </h2>
          </div>
          <span style={badge(T.thrive, "rgba(92,138,78,0.12)")}>100% ON-DEVICE</span>
          <span style={badge(caps.hasWebCodecs ? T.studio : T.muted2, T.inset)}>
            {caps.hasWebCodecs ? "WEBCODECS READY" : "MEDIARECORDER"}
          </span>
          <button
            onClick={() => { if (!exporting) onClose(); }}
            aria-label="Close editor"
            disabled={exporting}
            style={{ background: T.paper, border: `1px solid ${T.hair}`, borderRadius: 10, width: 36, height: 36, cursor: exporting ? "not-allowed" : "pointer", color: T.muted2, display: "inline-flex", alignItems: "center", justifyContent: "center" }}
          >
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true"><path d="M5 5l14 14M19 5 5 19" /></svg>
          </button>
        </div>

        {!caps.canRecord && (
          <div style={{ padding: "14px 16px", borderRadius: 12, background: "rgba(190,79,40,0.08)", border: "1px solid rgba(190,79,40,0.25)", color: T.terra, fontSize: 14, marginBottom: 14, fontFamily: T.body }}>
            Your browser can&rsquo;t record client-side video (no MediaRecorder + canvas capture). Open the editor in a recent Chrome, Edge, or Safari to export.
          </div>
        )}

        <div className="ed-editor-grid" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 320px", gap: 16, alignItems: "start" }}>
          {/* LEFT — preview + timeline */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
            <div style={{ position: "relative", background: T.paper, borderRadius: 16, padding: 12, border: `1px solid ${T.hair}`, boxShadow: "var(--ed-shadow-card)" }}>
              <div style={{
                position: "relative", borderRadius: 12, overflow: "hidden",
                background: `radial-gradient(120% 100% at 50% 30%, ${T.studioDeep}, ${T.studioInk})`,
                aspectRatio: orientation === "portrait" ? "9 / 16" : orientation === "square" ? "1 / 1" : "16 / 9",
                maxHeight: 380, margin: "0 auto",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <canvas
                  ref={canvasRef}
                  width={dims(false).w}
                  height={dims(false).h}
                  style={{ width: "100%", height: "100%", objectFit: "contain", display: hasClips ? "block" : "none" }}
                />
                {!hasClips && (
                  <div style={{ color: T.creamOn, textAlign: "center", padding: 28, maxWidth: 320 }}>
                    <div style={{ fontFamily: T.disp, fontWeight: 800, fontSize: 20, marginBottom: 6 }}>Add a clip to start</div>
                    <div style={{ fontSize: 14, color: "rgba(252,233,207,.85)", lineHeight: 1.5 }}>
                      Import 1&ndash;{MAX_CLIPS} of your generated clips from the right, trim them, then export.
                    </div>
                  </div>
                )}
                {exporting && (
                  <div style={{ position: "absolute", inset: 0, background: "rgba(25,19,52,.72)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, color: T.creamOn, padding: 24 }}>
                    <div style={{ fontFamily: T.m, fontWeight: 700, letterSpacing: "0.14em", fontSize: 14 }}>ENCODING ON YOUR DEVICE</div>
                    <div style={{ width: "min(280px,80%)", height: 12, borderRadius: 999, background: "rgba(252,233,207,0.16)", border: "1px solid rgba(252,233,207,0.4)", overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${exportPct}%`, background: "linear-gradient(90deg,#F49B2A,#E27D0C)", transition: "width .25s linear" }} />
                    </div>
                    <div style={{ fontSize: 14, fontFamily: T.m, fontVariantNumeric: "tabular-nums" }}>{exportPct}% · real-time render — keep this tab open</div>
                  </div>
                )}
              </div>

              {/* transport */}
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12 }}>
                <button
                  onClick={togglePlay}
                  disabled={!hasClips || exporting}
                  aria-label={playing ? "Pause" : "Play"}
                  style={{ width: 42, height: 42, borderRadius: 12, border: "none", cursor: hasClips && !exporting ? "pointer" : "not-allowed", background: `linear-gradient(135deg,#7D5FB8,#6B4FA0)`, color: T.creamOn, display: "inline-flex", alignItems: "center", justifyContent: "center", boxShadow: "var(--ed-shadow-card)", flexShrink: 0 }}
                >
                  {playing
                    ? <svg width={16} height={16} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
                    : <svg width={16} height={16} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.8c0-1 1.1-1.7 2-1.2l11 6.4c.9.5.9 1.9 0 2.4L9 18.8c-.9.5-2-.2-2-1.2V4.8Z" /></svg>}
                </button>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ height: 8, borderRadius: 999, background: T.inset, border: `1px solid ${T.hair}`, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${totalDur > 0 ? (playhead / totalDur) * 100 : 0}%`, background: T.studio, transition: playing ? "none" : "width .15s linear" }} />
                  </div>
                </div>
                <div style={{ fontFamily: T.m, fontSize: 14, fontWeight: 700, color: T.muted2, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
                  {fmtTime(playhead)} / {fmtTime(totalDur)}
                </div>
              </div>
            </div>

            {/* TIMELINE */}
            <div style={{ background: T.paper, borderRadius: 16, padding: 14, border: `1px solid ${T.hair}`, boxShadow: "var(--ed-shadow-card)" }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 }}>
                <span style={panelLabel}>TIMELINE</span>
                <span style={{ fontFamily: T.m, fontSize: 14, color: totalDur > MAX_REEL_SEC ? T.terra : T.muted2 }}>
                  {timeline.length}/{MAX_CLIPS} clips · {fmtTime(totalDur)}{totalDur > MAX_REEL_SEC ? " · over 60s" : ""}
                </span>
              </div>
              {!hasClips ? (
                <div style={{ padding: "18px 12px", textAlign: "center", color: T.muted2, fontSize: 14, border: `1px dashed ${T.hair}`, borderRadius: 12, fontFamily: T.body }}>
                  Your sequence is empty. Add clips from the Import panel &rarr;
                </div>
              ) : (
                <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
                  {timeline.map((c, i) => {
                    const sel = c.key === selectedKey;
                    return (
                      <div
                        key={c.key}
                        role="group"
                        tabIndex={0}
                        aria-label={`Clip ${i + 1}${sel ? ", selected" : ""}`}
                        onClick={() => setSelectedKey(c.key)}
                        onKeyDown={(event) => {
                          if (event.target !== event.currentTarget || (event.key !== "Enter" && event.key !== " ")) return;
                          event.preventDefault();
                          setSelectedKey(c.key);
                        }}
                        style={{
                        position: "relative", flexShrink: 0, width: 120, cursor: "pointer",
                        borderRadius: 12, overflow: "hidden", background: T.inset,
                        border: sel ? `2px solid ${T.studio}` : `1px solid ${T.hair}`,
                        boxShadow: sel ? "0 0 0 3px rgba(107,79,160,0.12)" : "none",
                      }}>
                        <div style={{ height: 66, background: `url(${c.src.url}) center/cover no-repeat`, position: "relative" }}>
                          {c.src.kind === "video" && <span style={{ position: "absolute", top: 5, left: 6, fontSize: 14 }}>▸</span>}
                          <span style={{ position: "absolute", top: 5, right: 6, fontFamily: T.m, fontSize: 14, fontWeight: 700, color: "white", filter: "drop-shadow(0 1px 0 rgba(0,0,0,.7))" }}>#{i + 1}</span>
                        </div>
                        <div style={{ padding: "6px 7px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4 }}>
                          <span style={{ fontFamily: T.m, fontSize: 14, color: T.muted2, fontWeight: 700 }}>{fmtTime(clipLength(c))}</span>
                          <div style={{ display: "flex", gap: 3 }}>
                            <button onClick={(e) => { e.stopPropagation(); moveClip(c.key, -1); }} disabled={i === 0} aria-label="Move left" style={miniBtn(i === 0)}>‹</button>
                            <button onClick={(e) => { e.stopPropagation(); moveClip(c.key, 1); }} disabled={i === timeline.length - 1} aria-label="Move right" style={miniBtn(i === timeline.length - 1)}>›</button>
                            <button onClick={(e) => { e.stopPropagation(); removeClip(c.key); }} aria-label="Remove clip" style={{ ...miniBtn(false), color: T.terra }}>✕</button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* EXPORT BAR */}
            <div style={{ background: T.paper, borderRadius: 16, padding: 14, border: `1px solid ${T.hair}`, boxShadow: "var(--ed-shadow-card)" }}>
              <div style={panelLabel}>EXPORT</div>
              {exportError && (
                <div style={{ marginTop: 10, padding: "9px 12px", borderRadius: 10, background: "rgba(190,79,40,0.08)", border: "1px solid rgba(190,79,40,0.22)", color: T.terra, fontSize: 14, fontFamily: T.body }}>{exportError}</div>
              )}
              {exportResult ? (
                <div style={{ marginTop: 12, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                  <video src={exportResult.url} controls loop playsInline style={{ width: 150, borderRadius: 10, border: `1px solid ${T.hair}`, background: "#000" }} />
                  <div style={{ flex: "1 1 200px", minWidth: 0 }}>
                    <div style={{ fontFamily: T.disp, fontWeight: 700, fontSize: 15, color: T.ink }}>
                      {exportResult.hd ? "HD reel ready · no watermark" : "Reel ready · watermarked"}
                    </div>
                    <div style={{ fontSize: 14, color: T.muted2, fontFamily: T.m, marginTop: 2 }}>
                      {exportResult.ext.toUpperCase()} · {fmtBytes(exportResult.size)} · {orientation}
                    </div>
                    <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                      <a href={exportResult.url} download={`my-ai-pet-reel.${exportResult.ext}`} style={{ ...ctaBtn, textDecoration: "none" }}>Download</a>
                      <button onClick={() => setExportResult(null)} style={ghostBtn}>Make another</button>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
                    {/* FREE */}
                    <button
                      onClick={() => runExport(false, true)}
                      disabled={!hasClips || exporting || !caps.canRecord}
                      style={{ ...exportCard, opacity: hasClips && caps.canRecord ? 1 : 0.55, cursor: hasClips && !exporting && caps.canRecord ? "pointer" : "not-allowed" }}
                    >
                      <span style={{ fontFamily: T.disp, fontWeight: 800, fontSize: 15, color: T.ink }}>Export free</span>
                      <span style={{ fontSize: 14, color: T.muted2, fontFamily: T.m, marginTop: 3 }}>720p · MY AI PET watermark · 0 cr</span>
                    </button>
                    {/* HD / paid */}
                    <button
                      onClick={onHdExport}
                      disabled={!hasClips || exporting || !caps.canRecord || !hdUnlocked}
                      title={HD_EXPORT_FREE_BETA ? "Free while Studio is in beta" : tierIncludesHd ? "Included in your membership" : hdUnlocked ? `Costs ${HD_EXPORT_COST} credits` : `Needs ${HD_EXPORT_COST} credits — you have ${credits ?? 0}`}
                      style={{
                        ...exportCard,
                        borderColor: hdUnlocked ? T.studio : T.hair,
                        background: hdUnlocked ? "rgba(107,79,160,0.06)" : T.inset,
                        opacity: hasClips && caps.canRecord ? 1 : 0.55,
                        cursor: hasClips && !exporting && caps.canRecord && hdUnlocked ? "pointer" : "not-allowed",
                      }}
                    >
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: T.disp, fontWeight: 800, fontSize: 15, color: hdUnlocked ? T.studio : T.muted2 }}>
                        {!hdUnlocked && (
                          <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
                        )}
                        Export HD
                      </span>
                      <span style={{ fontSize: 14, color: T.muted2, fontFamily: T.m, marginTop: 3 }}>
                        1080p · no watermark · {HD_EXPORT_FREE_BETA ? "free · beta" : tierIncludesHd ? "included" : `${HD_EXPORT_COST} cr`}
                      </span>
                    </button>
                  </div>
                  {!hdUnlocked && (
                    <a href="/?section=home&scroll=pricing" style={{ display: "inline-block", marginTop: 10, fontFamily: T.m, fontSize: 14, fontWeight: 700, color: T.terra, textDecoration: "underline" }}>
                      Credit purchases are paused — view status &rarr;
                    </a>
                  )}
                  {HD_EXPORT_FREE_BETA && (
                    <div style={{ marginTop: 10, fontSize: 14, color: T.muted2, fontFamily: T.m }}>
                      HD export is free while Studio is in beta.
                    </div>
                  )}
                  <div style={{ marginTop: 10, fontSize: 14, color: T.muted, fontFamily: T.body, lineHeight: 1.5 }}>
                    Rendering runs entirely in your browser (the server never transcodes). HD export is a real-time render — a {fmtTime(totalDur)} reel takes about {fmtTime(totalDur)}.
                  </div>
                </>
              )}
            </div>
          </div>

          {/* RIGHT — import + inspector */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {/* IMPORT */}
            <div style={{ background: T.paper, borderRadius: 16, padding: 14, border: `1px solid ${T.hair}`, boxShadow: "var(--ed-shadow-card)" }}>
              <div style={panelLabel}>IMPORT CLIPS</div>
              {clips.length === 0 ? (
                <div style={{ marginTop: 10, fontSize: 14, color: T.muted2, fontFamily: T.body, lineHeight: 1.5 }}>
                  No generations yet. Create a clip or image in Studio first, then assemble it here.
                </div>
              ) : (
                <>
                  {sourceVideos.length === 0 && (
                    <div style={{ marginTop: 8, marginBottom: 8, fontSize: 14, color: T.muted, fontFamily: T.body, lineHeight: 1.45 }}>
                      Tip: images work as still shots — animate a prompt in Studio for motion clips.
                    </div>
                  )}
                  <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, maxHeight: 220, overflowY: "auto" }}>
                    {clips.map((c) => {
                      const placed = placedIds.has(c.id);
                      const full = timeline.length >= MAX_CLIPS;
                      const busy = loadingSrc === c.id;
                      return (
                        <button
                          key={c.id}
                          onClick={() => addClip(c)}
                          disabled={placed || (full && !placed) || busy}
                          title={placed ? "Already added" : full ? `Max ${MAX_CLIPS} clips` : "Add to timeline"}
                          style={{
                            position: "relative", padding: 0, borderRadius: 10, overflow: "hidden",
                            border: `1px solid ${T.hair}`, background: T.inset,
                            cursor: placed || full || busy ? "not-allowed" : "pointer",
                            opacity: placed || (full && !placed) ? 0.5 : 1, aspectRatio: "1 / 1",
                          }}
                        >
                          <span style={{ display: "block", width: "100%", height: "100%", background: `url(${c.url}) center/cover no-repeat` }} />
                          <span style={{ position: "absolute", top: 5, left: 5, fontFamily: T.m, fontSize: 14, fontWeight: 700, color: "white", filter: "drop-shadow(0 1px 0 rgba(0,0,0,.7))" }}>
                            {c.kind === "video" ? "▸ CLIP" : "IMG"}
                          </span>
                          <span style={{ position: "absolute", bottom: 5, right: 5, width: 22, height: 22, borderRadius: 7, background: placed ? T.thrive : T.studio, color: "white", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700 }}>
                            {busy ? "…" : placed ? "✓" : "+"}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
              {loadError && <div style={{ marginTop: 8, fontSize: 14, color: T.terra, fontFamily: T.body }}>{loadError}</div>}
            </div>

            {/* CLIP INSPECTOR (trim / caption) */}
            <div style={{ background: T.paper, borderRadius: 16, padding: 14, border: `1px solid ${T.hair}`, boxShadow: "var(--ed-shadow-card)" }}>
              <div style={panelLabel}>SELECTED CLIP</div>
              {!selected ? (
                <div style={{ marginTop: 10, fontSize: 14, color: T.muted2, fontFamily: T.body }}>Select a clip on the timeline to trim it and add a caption.</div>
              ) : (
                <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 12 }}>
                  {selected.src.kind === "video" ? (
                    <>
                      <Range
                        label={`Trim in · ${selected.trimIn.toFixed(1)}s`}
                        min={0} max={Math.max(0.1, selected.trimOut - 0.2)} step={0.1} value={selected.trimIn}
                        onChange={(v) => { patchClip(selected.key, { trimIn: Math.min(v, selected.trimOut - 0.2) }); drawStill({ ...selected, trimIn: v }, 0); }}
                      />
                      <Range
                        label={`Trim out · ${selected.trimOut.toFixed(1)}s`}
                        min={selected.trimIn + 0.2} max={selected.natDur || selected.trimOut} step={0.1} value={selected.trimOut}
                        onChange={(v) => { patchClip(selected.key, { trimOut: Math.max(v, selected.trimIn + 0.2) }); drawStill({ ...selected, trimOut: v }, Math.max(0, v - selected.trimIn - 0.05)); }}
                      />
                      <div style={{ fontFamily: T.m, fontSize: 14, color: T.muted2 }}>Kept: {fmtTime(clipLength(selected))} of {fmtTime(selected.natDur)}</div>
                    </>
                  ) : (
                    <Range
                      label={`Show for · ${selected.dur.toFixed(1)}s`}
                      min={1} max={8} step={0.5} value={selected.dur}
                      onChange={(v) => patchClip(selected.key, { dur: v })}
                    />
                  )}
                  <div>
                    <div style={{ fontFamily: T.m, fontSize: 14, fontWeight: 700, color: T.mono, letterSpacing: "0.06em", marginBottom: 5 }}>CAPTION</div>
                    <input
                      aria-label="Clip caption"
                      value={selected.caption}
                      onChange={(e) => patchClip(selected.key, { caption: e.target.value.slice(0, 60) })}
                      placeholder="Add a caption (optional)"
                      style={{ width: "100%", padding: "9px 11px", borderRadius: 10, border: `1px solid ${T.hair}`, background: T.inset, color: T.ink, fontFamily: T.body, fontSize: 14 }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* CAPTION STYLE (shared) */}
            <div style={{ background: T.paper, borderRadius: 16, padding: 14, border: `1px solid ${T.hair}`, boxShadow: "var(--ed-shadow-card)" }}>
              <div style={panelLabel}>CAPTION STYLE</div>
              <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 10 }}>
                <Segmented
                  options={[["top", "Top"], ["center", "Center"], ["bottom", "Bottom"]]}
                  value={captionPos}
                  onChange={(v) => setCaptionPos(v as CaptionPos)}
                />
                <Segmented
                  options={[["bold", "Bold"], ["serif", "Serif"], ["mono", "Mono"]]}
                  value={captionFont}
                  onChange={(v) => setCaptionFont(v as CaptionFont)}
                />
              </div>
            </div>

            {/* MUSIC */}
            <div style={{ background: T.paper, borderRadius: 16, padding: 14, border: `1px solid ${T.hair}`, boxShadow: "var(--ed-shadow-card)" }}>
              <div style={panelLabel}>MUSIC</div>
              <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                {MUSIC_TRACKS.map((m) => {
                  const sel = m.id === musicId;
                  return (
                    <button key={m.id} onClick={() => setMusicId(m.id)} title={m.hint} style={{
                      padding: "9px 8px", borderRadius: 10, textAlign: "left",
                      border: sel ? `1.5px solid ${T.studio}` : `1px solid ${T.hair}`,
                      background: sel ? "rgba(107,79,160,0.08)" : T.inset, cursor: "pointer",
                    }}>
                      <div style={{ fontFamily: T.disp, fontWeight: 700, fontSize: 14, color: sel ? T.studio : T.ink }}>{m.name}</div>
                      <div style={{ fontFamily: T.m, fontSize: 14, color: T.muted2 }}>{m.hint}</div>
                    </button>
                  );
                })}
              </div>
              {musicId !== "none" && (
                <div style={{ marginTop: 10 }}>
                  <Range label={`Volume · ${Math.round(musicVol * 100)}%`} min={0} max={1} step={0.05} value={musicVol} onChange={setMusicVol} />
                  <div style={{ fontFamily: T.body, fontSize: 14, color: T.muted, marginTop: 4 }}>Synthesised loop — mixed in at export (no file downloaded).</div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width: 820px) {
          .ed-editor-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}

// ── small UI atoms ───────────────────────────────────────────────────────

function Range({ label, min, max, step, value, onChange }: { label: string; min: number; max: number; step: number; value: number; onChange: (v: number) => void }) {
  return (
    <label style={{ display: "block" }}>
      <span style={{ fontFamily: T.m, fontSize: 14, fontWeight: 700, color: T.muted2, letterSpacing: "0.04em" }}>{label}</span>
      <input
        aria-label={label}
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ width: "100%", marginTop: 6, accentColor: T.studio }}
      />
    </label>
  );
}

function Segmented({ options, value, onChange }: { options: [string, string][]; value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${options.length}, 1fr)`, gap: 4, padding: 4, borderRadius: 10, background: T.inset, border: `1px solid ${T.hair}` }}>
      {options.map(([v, lbl]) => {
        const sel = v === value;
        return (
          <button key={v} onClick={() => onChange(v)} style={{
            padding: "7px 0", borderRadius: 8, border: "none", cursor: "pointer",
            background: sel ? T.studio : "transparent", color: sel ? T.creamOn : T.muted2,
            fontFamily: T.body, fontWeight: 700, fontSize: 14,
          }}>{lbl}</button>
        );
      })}
    </div>
  );
}

// ── style helpers ──────────────────────────────────────────────────────────

const panelLabel: React.CSSProperties = {
  fontSize: 14, fontWeight: 700, letterSpacing: "0.14em",
  textTransform: "uppercase", color: T.mono, fontFamily: T.m,
};
function badge(fg: string, bg: string): React.CSSProperties {
  return { padding: "4px 9px", borderRadius: 999, fontFamily: T.m, fontSize: 14, fontWeight: 700, letterSpacing: "0.08em", background: bg, color: fg };
}
function miniBtn(disabled: boolean): React.CSSProperties {
  return { width: 20, height: 20, borderRadius: 6, border: `1px solid ${T.hair}`, background: T.paper, color: disabled ? T.hair : T.muted2, cursor: disabled ? "default" : "pointer", fontSize: 14, lineHeight: 1, padding: 0, display: "inline-flex", alignItems: "center", justifyContent: "center" };
}
const exportCard: React.CSSProperties = {
  display: "flex", flexDirection: "column", alignItems: "flex-start",
  padding: "12px 14px", borderRadius: 12, border: `1px solid ${T.hair}`,
  background: T.inset, textAlign: "left",
};
const ctaBtn: React.CSSProperties = {
  padding: "9px 16px", borderRadius: 10, border: "none",
  background: `linear-gradient(180deg,${T.cta1},${T.cta2})`, color: "#FFF8EE",
  fontFamily: T.body, fontWeight: 700, fontSize: 14, cursor: "pointer",
  display: "inline-flex", alignItems: "center", gap: 6,
};
const ghostBtn: React.CSSProperties = {
  padding: "9px 14px", borderRadius: 10, border: `1px solid ${T.hair}`,
  background: T.paper, color: T.ink70, fontFamily: T.body, fontWeight: 700, fontSize: 14, cursor: "pointer",
};
