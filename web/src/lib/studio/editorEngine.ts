/**
 * Studio Editor — client-side render/export engine (V1).
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │  EVERYTHING IN THIS FILE RUNS IN THE USER'S BROWSER. THE SERVER STAYS  │
 * │  IDLE — no upload, no transcode, no ffmpeg process, no headless        │
 * │  Chromium. Trim / sequence / caption / watermark / music-mux / encode  │
 * │  all happen on the user's own device + GPU (see docs/STUDIO-PRO.md §2). │
 * └──────────────────────────────────────────────────────────────────────┘
 *
 * Export pipeline (V1): an OffscreenCanvas-style draw loop renders each
 * timeline clip in real time onto a <canvas>; `canvas.captureStream()` +
 * `MediaRecorder` encode it, with a WebAudio-synthesised music track mixed in
 * via a `MediaStreamAudioDestinationNode`. This is the dependency-free path
 * (no external CDN, no wasm download) and works on every browser that ships
 * MediaRecorder — which is the correct pragmatic V1 choice per STUDIO-PRO.md
 * ("MediaRecorder canvas-capture fallback").
 *
 * WebCodecs (VideoEncoder) gives frame-accurate, faster-than-realtime encode
 * and is feature-detected below so the UI can surface it — but the actual V1
 * encode uses MediaRecorder because a hand-written MP4 muxer is out of scope
 * for the first slice. The WebCodecs path is the documented v2 upgrade.
 */

export interface EditorCaps {
  /** MediaRecorder + canvas.captureStream both present — export is possible. */
  canRecord: boolean;
  /** VideoEncoder present — the (future) frame-accurate encode path. */
  hasWebCodecs: boolean;
  /** Chosen recorder container mime, e.g. "video/mp4" | "video/webm;codecs=vp9". */
  mime: string;
  /** File extension matching `mime` — "mp4" | "webm". */
  ext: string;
  /** User asked the OS to reduce motion — dial back decorative animation. */
  reducedMotion: boolean;
}

/** Pick the best supported recorder mime, preferring MP4 (Safari) then WebM. */
function pickMime(): { mime: string; ext: string } {
  if (typeof MediaRecorder === "undefined") return { mime: "", ext: "webm" };
  const candidates: { mime: string; ext: string }[] = [
    { mime: "video/mp4;codecs=avc1.42E01E,mp4a.40.2", ext: "mp4" },
    { mime: "video/mp4", ext: "mp4" },
    { mime: "video/webm;codecs=vp9,opus", ext: "webm" },
    { mime: "video/webm;codecs=vp8,opus", ext: "webm" },
    { mime: "video/webm", ext: "webm" },
  ];
  for (const c of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(c.mime)) return c;
    } catch {
      /* isTypeSupported can throw on odd strings — keep trying */
    }
  }
  return { mime: "", ext: "webm" };
}

export function detectCaps(): EditorCaps {
  if (typeof window === "undefined") {
    return { canRecord: false, hasWebCodecs: false, mime: "", ext: "webm", reducedMotion: false };
  }
  const testCanvas = typeof document !== "undefined" ? document.createElement("canvas") : null;
  const canCapture = !!testCanvas && typeof (testCanvas as any).captureStream === "function";
  const canRecord = typeof MediaRecorder !== "undefined" && canCapture;
  const hasWebCodecs = typeof (window as any).VideoEncoder === "function";
  const reducedMotion =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const { mime, ext } = pickMime();
  return { canRecord: canRecord && !!mime, hasWebCodecs, mime, ext, reducedMotion };
}

/** Draw a video frame or image into ctx using object-fit: cover semantics. */
export function drawCover(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  sw: number,
  sh: number,
  cw: number,
  ch: number,
) {
  if (!sw || !sh) return;
  const scale = Math.max(cw / sw, ch / sh);
  const dw = sw * scale;
  const dh = sh * scale;
  const dx = (cw - dw) / 2;
  const dy = (ch - dh) / 2;
  ctx.drawImage(source, dx, dy, dw, dh);
}

// ── Bundled music (synthesised, zero bytes shipped) ─────────────────────────
// A couple of short royalty-free loops generated live with WebAudio oscillators
// so nothing external is fetched. Each is an arpeggio pattern (semitone offsets
// from a root) played on a soft triangle voice; the loop repeats to fill the
// reel. Users can also pick "None".

export interface MusicTrack {
  id: string;
  name: string;
  hint: string;
}

export const MUSIC_TRACKS: MusicTrack[] = [
  { id: "none", name: "No music", hint: "Silent reel" },
  { id: "sunny", name: "Sunny", hint: "Bright & bouncy" },
  { id: "dreamy", name: "Dreamy", hint: "Soft & floaty" },
  { id: "playful", name: "Playful", hint: "Quirky pet energy" },
];

// Semitone patterns (relative to a root freq) + timing per track.
const PATTERNS: Record<string, { root: number; steps: number[]; beat: number; wave: OscillatorType }> = {
  sunny:   { root: 261.63, steps: [0, 4, 7, 12, 7, 4], beat: 0.28, wave: "triangle" },
  dreamy:  { root: 220.0,  steps: [0, 3, 7, 10, 12, 10, 7, 3], beat: 0.42, wave: "sine" },
  playful: { root: 293.66, steps: [0, 5, 7, 5, 9, 7, 4, 0], beat: 0.22, wave: "triangle" },
};

function semis(root: number, n: number) {
  return root * Math.pow(2, n / 12);
}

/**
 * Schedule a looping arpeggio for `durationSec` into `dest` (recorded) and,
 * when `monitor` is provided, also to speakers for preview. Returns a stop fn.
 * All scheduling is client-side WebAudio — no audio asset is fetched.
 */
export function startMusic(
  ctx: AudioContext,
  dest: AudioNode,
  trackId: string,
  durationSec: number,
  volume: number,
  monitor?: AudioNode | null,
): () => void {
  const pat = PATTERNS[trackId];
  if (!pat || trackId === "none") return () => {};

  const master = ctx.createGain();
  master.gain.value = Math.max(0, Math.min(1, volume));
  master.connect(dest);
  if (monitor) master.connect(monitor);

  const oscs: OscillatorNode[] = [];
  const t0 = ctx.currentTime + 0.05;
  const end = t0 + durationSec;
  let t = t0;
  let i = 0;
  // Pre-schedule every note across the reel so timing is sample-accurate.
  while (t < end) {
    const freq = semis(pat.root, pat.steps[i % pat.steps.length]);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = pat.wave;
    osc.frequency.value = freq;
    // Short pluck envelope so notes don't smear into a drone.
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.9, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0008, t + pat.beat * 0.95);
    osc.connect(g);
    g.connect(master);
    osc.start(t);
    osc.stop(t + pat.beat);
    oscs.push(osc);
    t += pat.beat;
    i++;
  }
  return () => {
    try {
      for (const o of oscs) {
        try { o.stop(); } catch { /* already stopped */ }
      }
      master.disconnect();
    } catch { /* ignore */ }
  };
}

/** Human file size. */
export function fmtBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

/** mm:ss for a seconds value. */
export function fmtTime(s: number): string {
  const sec = Math.max(0, Math.round(s));
  const m = Math.floor(sec / 60);
  const r = sec % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}
