"use client";

/**
 * Pet Video Editor — Phase 3 in-browser editor (ffmpeg.wasm).
 *
 * Capabilities (MVP):
 *   - Trim: set start/end on the source clip
 *   - Caption: text overlay with position + size + color
 *   - Music: load an mp3 (royalty-free presets or user upload), mix at adjustable volume
 *   - Export: render with ffmpeg.wasm → mp4 blob → upload to /api/upload → save as new Generation
 *
 * Loaded lazily from PetStudio so the ~30MB wasm bundle only ships when the
 * user actually clicks the editor button. Pro+ tier gate at the UI level.
 */

import { useEffect, useRef, useState } from "react";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";
import { getAuthHeaders } from "@/lib/api";
import { toast } from "@/components/Toast";

interface EditorState {
  trimStart: number;
  trimEnd: number;
  caption: string;
  captionColor: string;
  captionPos: "bottom" | "top" | "center";
  musicVolume: number;     // 0..1, 0 = no music
  musicUrl: string | null; // null = no music
}

const PRESET_MUSIC = [
  { id: "upbeat", label: "Upbeat", url: "/studio_music/upbeat.mp3" },
  { id: "chill",  label: "Chill", url: "/studio_music/chill.mp3" },
  { id: "synth",  label: "Synth", url: "/studio_music/synth.mp3" },
  { id: "lo-fi",  label: "Lo-fi", url: "/studio_music/lofi.mp3" },
];

export default function PetVideoEditor({ videoUrl, onClose }: { videoUrl: string; onClose: () => void }) {
  const [ffmpeg, setFFmpeg] = useState<FFmpeg | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMsg, setLoadingMsg] = useState("Booting editor…");
  const [duration, setDuration] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [exportedUrl, setExportedUrl] = useState<string | null>(null);
  const [exportProgress, setExportProgress] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);

  const [state, setState] = useState<EditorState>({
    trimStart: 0,
    trimEnd: 5,
    caption: "",
    captionColor: "white",
    captionPos: "bottom",
    musicVolume: 0,
    musicUrl: null,
  });

  // ── Lazy-load ffmpeg.wasm ──
  useEffect(() => {
    (async () => {
      try {
        const f = new FFmpeg();
        f.on("progress", ({ progress }) => setExportProgress(Math.min(1, Math.max(0, progress))));
        f.on("log", () => {});
        setLoadingMsg("Downloading ffmpeg.wasm (~30MB, cached after first load)…");
        const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd";
        await f.load({
          coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
          wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
        });
        setFFmpeg(f);
        setLoading(false);
        setLoadingMsg("");
      } catch (e: any) {
        setLoadingMsg(`Failed to load editor: ${e?.message || e}`);
      }
    })();
  }, []);

  // Probe duration from video metadata
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const handler = () => {
      setDuration(v.duration);
      setState(s => ({ ...s, trimEnd: Math.min(v.duration, 5) }));
    };
    v.addEventListener("loadedmetadata", handler);
    return () => v.removeEventListener("loadedmetadata", handler);
  }, []);

  // ── Export ──
  const exportClip = async () => {
    if (!ffmpeg || exporting) return;
    setExporting(true);
    setExportProgress(0);
    setExportedUrl(null);

    try {
      // Write source video
      await ffmpeg.writeFile("source.mp4", await fetchFile(videoUrl));

      // Build filter graph
      const trimDur = Math.max(0.1, state.trimEnd - state.trimStart);
      const vfFilters: string[] = [];
      if (state.caption.trim()) {
        const safeText = state.caption.replace(/'/g, "\\'").replace(/:/g, "\\:");
        const yPos = state.captionPos === "top" ? "h*0.05"
                  : state.captionPos === "center" ? "(h-text_h)/2"
                  : "h*0.85";
        vfFilters.push(
          `drawtext=text='${safeText}':fontcolor=${state.captionColor}:fontsize=48:x=(w-text_w)/2:y=${yPos}:box=1:boxcolor=black@0.4:boxborderw=12`
        );
      }
      const videoFilter = vfFilters.length ? ["-vf", vfFilters.join(",")] : [];

      const args: string[] = [
        "-ss", String(state.trimStart),
        "-i", "source.mp4",
        "-t", String(trimDur),
        ...videoFilter,
      ];

      // Music overlay
      if (state.musicUrl && state.musicVolume > 0) {
        await ffmpeg.writeFile("music.mp3", await fetchFile(state.musicUrl));
        args.push("-i", "music.mp3");
        args.push("-filter_complex",
          `[1:a]volume=${state.musicVolume.toFixed(2)},aloop=loop=-1:size=2e9[mus];[0:a][mus]amix=inputs=2:duration=shortest[aout]`);
        args.push("-map", "0:v", "-map", "[aout]");
      }

      args.push(
        "-c:v", "libx264", "-preset", "ultrafast", "-crf", "23",
        "-c:a", "aac", "-b:a", "128k",
        "-movflags", "+faststart",
        "out.mp4",
      );

      await ffmpeg.exec(args);
      const data = await ffmpeg.readFile("out.mp4");
      const blob = new Blob([data as unknown as BlobPart], { type: "video/mp4" });
      const url = URL.createObjectURL(blob);
      setExportedUrl(url);
    } catch (e: any) {
      toast(`Export failed: ${e?.message || e}`, "error");
    } finally {
      setExporting(false);
    }
  };

  // ── Save edited clip to server ──
  const saveToLibrary = async () => {
    if (!exportedUrl) return;
    try {
      const blob = await (await fetch(exportedUrl)).blob();
      const fd = new FormData();
      fd.append("file", blob, `edited-${Date.now()}.mp4`);
      const res = await fetch("/api/upload", {
        method: "POST",
        headers: { ...getAuthHeaders() },
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Upload failed");
      toast(`Saved! URL: ${data.url}`, "success");
    } catch (e: any) {
      toast(`Save failed: ${e?.message || e}`, "error");
    }
  };

  return (
    <div style={{ color: "white" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>Editor</h2>
        <button onClick={onClose} style={{ ...btnSecondary, display: "inline-flex", alignItems: "center", gap: 7 }}>
          <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
          Close
        </button>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: "center", color: "rgba(255,255,255,0.65)" }}>
          {loadingMsg}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 24 }} className="editor-grid">
          {/* Preview */}
          <div>
            <video ref={videoRef} src={videoUrl} controls style={{
              width: "100%", borderRadius: 12, background: "black",
            }} />
            <div style={{ marginTop: 14 }}>
              <label style={miniLabel}>TRIM</label>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 6, fontSize: 12, color: "rgba(255,255,255,0.7)" }}>
                <span>Start {state.trimStart.toFixed(1)}s</span>
                <input type="range" min={0} max={duration} step={0.1} value={state.trimStart}
                  onChange={e => setState(s => ({ ...s, trimStart: Math.min(parseFloat(e.target.value), s.trimEnd - 0.1) }))}
                  style={{ flex: 1 }} />
                <span>End {state.trimEnd.toFixed(1)}s</span>
                <input type="range" min={0} max={duration} step={0.1} value={state.trimEnd}
                  onChange={e => setState(s => ({ ...s, trimEnd: Math.max(parseFloat(e.target.value), s.trimStart + 0.1) }))}
                  style={{ flex: 1 }} />
              </div>
            </div>
          </div>

          {/* Controls */}
          <div style={{ display: "grid", gap: 16 }}>
            <div>
              <label style={miniLabel}>CAPTION</label>
              <input type="text" value={state.caption}
                onChange={e => setState(s => ({ ...s, caption: e.target.value }))}
                placeholder="e.g. Happy Birthday, Sparky!"
                style={inputStyle} />
              <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
                {(["bottom", "center", "top"] as const).map(p => (
                  <button key={p} onClick={() => setState(s => ({ ...s, captionPos: p }))} style={{
                    ...btnSmall,
                    background: state.captionPos === p ? "#fbbf24" : "rgba(255,255,255,0.06)",
                    color: state.captionPos === p ? "#1a1a2e" : "white",
                  }}>{p}</button>
                ))}
                {["white", "#fbbf24", "#a855f7", "#34d399"].map(c => (
                  <button key={c} onClick={() => setState(s => ({ ...s, captionColor: c }))} style={{
                    width: 28, height: 28, borderRadius: 6,
                    background: c, cursor: "pointer",
                    border: state.captionColor === c ? "2px solid white" : "1px solid rgba(255,255,255,0.15)",
                  }} />
                ))}
              </div>
            </div>

            <div>
              <label style={miniLabel}>MUSIC</label>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 6, marginTop: 6 }}>
                <button onClick={() => setState(s => ({ ...s, musicUrl: null }))} style={{
                  ...btnSmall,
                  background: state.musicUrl === null ? "#fbbf24" : "rgba(255,255,255,0.06)",
                  color: state.musicUrl === null ? "#1a1a2e" : "white",
                }}>None</button>
                {PRESET_MUSIC.map(m => (
                  <button key={m.id} onClick={() => setState(s => ({ ...s, musicUrl: m.url, musicVolume: s.musicVolume || 0.5 }))} style={{
                    ...btnSmall,
                    background: state.musicUrl === m.url ? "#fbbf24" : "rgba(255,255,255,0.06)",
                    color: state.musicUrl === m.url ? "#1a1a2e" : "white",
                  }}>{m.label}</button>
                ))}
              </div>
              {state.musicUrl && (
                <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", fontFamily: "mono" }}>Volume</span>
                  <input type="range" min={0} max={1} step={0.05} value={state.musicVolume}
                    onChange={e => setState(s => ({ ...s, musicVolume: parseFloat(e.target.value) }))}
                    style={{ flex: 1 }} />
                  <span style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", fontFamily: "mono", minWidth: 30 }}>
                    {Math.round(state.musicVolume * 100)}%
                  </span>
                </div>
              )}
            </div>

            <button onClick={exportClip} disabled={exporting} style={{
              ...btnPrimary, padding: "14px",
              opacity: exporting ? 0.6 : 1, cursor: exporting ? "wait" : "pointer",
            }}>
              {exporting ? `Rendering… ${Math.round(exportProgress * 100)}%` : "Render edit →"}
            </button>

            {exportedUrl && (
              <div style={{
                padding: 14, borderRadius: 12,
                background: "rgba(22,163,74,0.10)", border: "1px solid rgba(22,163,74,0.25)",
              }}>
                <video src={exportedUrl} controls style={{ width: "100%", borderRadius: 8 }} />
                <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <a href={exportedUrl} download="edited.mp4" style={{ ...btnPrimary, display: "inline-flex", alignItems: "center", gap: 7 }}>
                    <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M12 3v12M7 11l5 5 5-5M5 20h14" />
                    </svg>
                    Download
                  </a>
                  <button onClick={saveToLibrary} style={{ ...btnSecondary, display: "inline-flex", alignItems: "center", gap: 7 }}>
                    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M6.5 18A4.5 4.5 0 0 1 6 9.05a6 6 0 0 1 11.6 1.45A3.75 3.75 0 0 1 17 18H6.5z" />
                    </svg>
                    Save to library
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <style>{`
        @media (max-width: 760px) {
          .editor-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}

const miniLabel: React.CSSProperties = {
  fontSize: 12, fontWeight: 800, letterSpacing: "0.14em",
  textTransform: "uppercase", color: "rgba(255,255,255,0.45)",
  fontFamily: "'JetBrains Mono', monospace",
};
const inputStyle: React.CSSProperties = {
  width: "100%", marginTop: 6, padding: "10px 12px", borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.1)",
  background: "rgba(0,0,0,0.25)", color: "white",
  fontFamily: "'Space Grotesk',sans-serif", fontSize: 14,
};
const btnPrimary: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 18px", borderRadius: 10, border: "none",
  background: "linear-gradient(135deg,#fbbf24,#f59e0b)",
  color: "#1a1a2e", fontWeight: 800, fontSize: 13, cursor: "pointer",
  textDecoration: "none", fontFamily: "'Space Grotesk',sans-serif",
};
const btnSecondary: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 18px", borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.06)",
  color: "white", fontWeight: 700, fontSize: 13, cursor: "pointer",
  textDecoration: "none",
};
const btnSmall: React.CSSProperties = {
  padding: "6px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)",
  fontSize: 12, fontWeight: 700, cursor: "pointer",
  fontFamily: "'Space Grotesk',sans-serif",
};
