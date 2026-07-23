"use client";

/**
 * Thumbnail Studio — a 100% client-side canvas thumbnail maker.
 *
 *   ┌───────────────────────────────┬──────────────────────────────┐
 *   │  CONTROLS (left on desktop)   │   LIVE CANVAS PREVIEW (right) │
 *   │  · Title / subtitle textarea  │   (preview stacks FIRST on    │
 *   │  · Detected keyword chips     │    mobile)                    │
 *   │  · Presets                    │   1280×720  /  720×1280       │
 *   │  · Style radio cards          │   drawn at true resolution,   │
 *   │  · Photo + darkness slider    │   exported as a real PNG      │
 *   │  · Position + aspect          │                               │
 *   └───────────────────────────────┴──────────────────────────────┘
 *
 * ZERO server cost. No credits, no API, nothing uploads — the whole thing is a
 * <canvas>, drawn in the browser. That's the feature: "made on your device, free".
 *
 * The TOOL CHROME follows the Collectible Editorial system (terracotta / cream /
 * ink / mono eyebrows / hard offset shadows). The CANVAS OUTPUT the user designs
 * may use bold, saturated colors — that's the artifact, not our chrome.
 *
 * Concept ported from a Korean "thumbnail color formula" reference (see
 * lib/studio/thumbnailFormula.ts), rebuilt in English for pet creators.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  analyzeText, buildColorGuide, colorFor, THUMB_COLORS, MAX_POPS,
  type AnalyzedWord,
} from "@/lib/studio/thumbnailFormula";

// ── Collectible Editorial chrome tokens (match PetStudioPro) ──
const T = {
  field: "#ECE4D4", paper: "#FBF6EC", inset: "#F5EFE2", ink: "#211A12", ink70: "#3A3024",
  muted: "#7A6E5A", muted2: "#5C5140", mono: "#9A7B4E", hair: "rgba(33,26,18,.13)",
  terra: "#BE4F28", terraSub: "#9A4E1E", creamOn: "#FCE9CF",
  cta1: "#F49B2A", cta2: "#E27D0C", foilDeep: "#C8932F",
  disp: "var(--ed-disp)", body: "var(--ed-body)", m: "var(--ed-m)",
};

// ── Canvas artifact styles (bold + saturated is fine here — it's the OUTPUT) ──
interface StyleDef {
  id: string; label: string; hint: string;
  bg: string; base: string; subColor: string;
  numberHighlight?: boolean;   // draw yellow marker behind number words (for light bg)
  frame?: string | null;       // colored keyline drawn on the canvas edge
  captionMode?: boolean;       // giant bottom subtitle band (shorts)
}
const STYLES: StyleDef[] = [
  { id: "black-impact", label: "Black Impact", hint: "Black bg · white type · key word pops", bg: "#0B0B0C", base: "#FFFFFF", subColor: "#CFCBC2" },
  { id: "white-info", label: "White Info", hint: "White bg · numbers highlit · risk pops", bg: "#FAFAF6", base: "#15130F", subColor: "#4A463E", numberHighlight: true },
  { id: "red-warning", label: "Red Warning", hint: "Charcoal + alert-red keyline", bg: "#141210", base: "#FFFFFF", subColor: "#F2C7C2", frame: THUMB_COLORS.risk },
  { id: "shorts-caption", label: "Shorts Caption", hint: "9:16 · big bottom caption band", bg: "#0B0B0C", base: "#FFFFFF", subColor: "#FFFFFF", captionMode: true },
];

type AspectId = "16:9" | "9:16";
type PositionId = "center" | "left" | "right" | "top" | "bottom";

interface PresetDef {
  id: string; label: string; style: string; aspect: AspectId; position: PositionId; solution: string;
  seed: { title: string; subtitle: string };
}
const PRESETS: PresetDef[] = [
  { id: "views", label: "Views formula", style: "black-impact", aspect: "16:9", position: "center", solution: THUMB_COLORS.solutionGreen, seed: { title: "HOW TO FILM YOUR PET IN 3 STEPS", subtitle: "the free setup that just works" } },
  { id: "warning", label: "Warning", style: "red-warning", aspect: "16:9", position: "center", solution: THUMB_COLORS.solutionSky, seed: { title: "NEVER DO THIS TO YOUR PET", subtitle: "the mistake new owners make" } },
  { id: "payoff", label: "Payoff", style: "white-info", aspect: "16:9", position: "left", solution: THUMB_COLORS.solutionSky, seed: { title: "MY PET GAINED 5 NEW SKILLS", subtitle: "here's the easy 3-step guide" } },
  { id: "shorts", label: "Shorts caption", style: "shorts-caption", aspect: "9:16", position: "bottom", solution: THUMB_COLORS.solutionSky, seed: { title: "WAIT FOR IT", subtitle: "the secret pet trick nobody shows" } },
];

const ASPECTS: { id: AspectId; label: string; px: string; w: number; h: number }[] = [
  { id: "16:9", label: "16:9 Thumbnail", px: "1280×720", w: 1280, h: 720 },
  { id: "9:16", label: "9:16 Shorts", px: "720×1280", w: 720, h: 1280 },
];

const POSITIONS: { id: PositionId; label: string }[] = [
  { id: "center", label: "Center" },
  { id: "left", label: "Left" },
  { id: "right", label: "Right" },
  { id: "top", label: "Top" },
  { id: "bottom", label: "Bottom" },
];

// Heavy display stack for the canvas artifact (a real font name canvas can resolve —
// next/font's hashed families aren't reliably nameable inside <canvas>).
const CANVAS_FONT = (px: number) => `900 ${px}px "Arial Black","Helvetica Neue",Arial,sans-serif`;

// ── Canvas text layout (pure geometry over an offscreen 2d ctx) ──
interface MWord extends AnalyzedWord { w: number; }
interface Line { items: MWord[]; width: number; }
interface Fit { fontSize: number; lines: Line[]; lineHeight: number; }

/** Wrap words into lines that fit maxW at the current ctx.font. Never merges across
 *  paragraphs (hard \n breaks are honored by the caller). */
function wrap(ctx: CanvasRenderingContext2D, paragraphs: AnalyzedWord[][], maxW: number): Line[] {
  const spaceW = ctx.measureText(" ").width;
  const lines: Line[] = [];
  for (const para of paragraphs) {
    if (para.length === 0) { lines.push({ items: [], width: 0 }); continue; }
    let cur: MWord[] = [];
    let curW = 0;
    for (const word of para) {
      const w = ctx.measureText(word.raw).width;
      const add = cur.length ? spaceW + w : w;
      if (cur.length && curW + add > maxW) {
        lines.push({ items: cur, width: curW });
        cur = [{ ...word, w }];
        curW = w;
      } else {
        cur.push({ ...word, w });
        curW += add;
      }
    }
    if (cur.length) lines.push({ items: cur, width: curW });
  }
  return lines;
}

/** Shrink font size until every line fits maxW and the block fits maxH. */
function fitText(
  ctx: CanvasRenderingContext2D, paragraphs: AnalyzedWord[][],
  maxW: number, maxH: number, capPx: number, minPx = 16, lineFactor = 1.05,
): Fit {
  for (let size = Math.round(capPx); size >= minPx; size -= 2) {
    ctx.font = CANVAS_FONT(size);
    const lines = wrap(ctx, paragraphs, maxW);
    const maxLineW = lines.reduce((m, l) => Math.max(m, l.width), 0);
    const totalH = lines.length * size * lineFactor;
    if (maxLineW <= maxW && totalH <= maxH) return { fontSize: size, lines, lineHeight: size * lineFactor };
  }
  ctx.font = CANVAS_FONT(minPx);
  return { fontSize: minPx, lines: wrap(ctx, paragraphs, maxW), lineHeight: minPx * lineFactor };
}

interface DrawParams {
  title: string; subtitle: string;
  style: StyleDef; aspect: { w: number; h: number };
  position: PositionId; solutionColor: string;
  img: HTMLImageElement | null; darknessPct: number;
}

/** The whole render, top to bottom. Called on every control change + photo load. */
function drawThumbnail(canvas: HTMLCanvasElement, p: DrawParams) {
  const { style, aspect, position, solutionColor, img, darknessPct } = p;
  const W = aspect.w, H = aspect.h;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  // 1. Background: photo (cover-fit) + darkness overlay, else solid style bg.
  ctx.fillStyle = style.bg;
  ctx.fillRect(0, 0, W, H);
  if (img && img.complete && img.naturalWidth > 0) {
    const scale = Math.max(W / img.naturalWidth, H / img.naturalHeight);
    const dw = img.naturalWidth * scale, dh = img.naturalHeight * scale;
    ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
    if (darknessPct > 0) {
      ctx.fillStyle = `rgba(0,0,0,${Math.min(0.7, darknessPct / 100)})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  // 2. Optional colored keyline frame (identity for Red Warning).
  if (style.frame) {
    const b = Math.round(Math.min(W, H) * 0.018);
    ctx.strokeStyle = style.frame;
    ctx.lineWidth = b;
    ctx.strokeRect(b / 2, b / 2, W - b, H - b);
  }

  const hasPhoto = !!(img && img.complete && img.naturalWidth > 0);
  const padX = W * 0.075, padY = H * 0.075;
  const boxW = W - padX * 2;
  const boxH = H - padY * 2;

  // 3. Split into title / subtitle budgets. Caption mode flips the emphasis so the
  //    subtitle becomes the giant bottom line.
  const captionMode = !!style.captionMode;
  const titleParas: AnalyzedWord[][] = analyzeText(p.title, solutionColor, style.base).paragraphs;
  const hasTitle = p.title.trim().length > 0;
  const hasSub = p.subtitle.trim().length > 0;
  const subParas: AnalyzedWord[][] = p.subtitle.split(/\r?\n/).map((l) =>
    l.split(/\s+/).filter(Boolean).map((raw, i) => ({ raw, category: "plain" as const, idx: i, active: false })),
  );

  // Vertical budgets.
  let titleMaxH: number, subMaxH: number, titleCap: number, subCap: number;
  if (captionMode) {
    titleMaxH = boxH * (hasTitle ? 0.24 : 0);
    subMaxH = boxH * (hasTitle ? 0.62 : 0.86);
    titleCap = H * 0.10;
    subCap = H * 0.16;
  } else {
    subMaxH = hasSub ? boxH * 0.26 : 0;
    titleMaxH = boxH - subMaxH - (hasSub ? boxH * 0.05 : 0);
    titleCap = H * 0.34;
    subCap = H * 0.085;
  }

  const titleFit = hasTitle ? fitText(ctx, titleParas, boxW, titleMaxH, titleCap) : null;
  const subFit = hasSub ? fitText(ctx, subParas, boxW, subMaxH, subCap) : null;

  const gap = hasTitle && hasSub ? H * (captionMode ? 0.02 : 0.028) : 0;
  const titleH = titleFit ? titleFit.lines.length * titleFit.lineHeight : 0;
  const subH = subFit ? subFit.lines.length * subFit.lineHeight : 0;

  // In caption mode the caption is pinned to the bottom regardless of position.
  const totalH = titleH + gap + subH;
  let blockTop: number;
  if (captionMode) {
    blockTop = padY + boxH - totalH; // bottom-anchored
  } else if (position === "top") {
    blockTop = padY;
  } else if (position === "bottom") {
    blockTop = padY + boxH - totalH;
  } else {
    blockTop = padY + (boxH - totalH) / 2;
  }

  const align: "left" | "center" | "right" =
    position === "left" ? "left" : position === "right" ? "right" : "center";

  // Caption mode gets a translucent band behind the subtitle for guaranteed legibility.
  if (captionMode && subFit) {
    const bandTop = blockTop + (hasTitle ? titleH + gap : 0) - H * 0.02;
    const bandH = subH + H * 0.04;
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(0, bandTop, W, bandH);
  }

  ctx.textBaseline = "top";

  // 4. Draw the title (per-word colors) then the subtitle (single color).
  if (titleFit) {
    drawLines(ctx, titleFit, blockTop, padX, boxW, align, style, solutionColor, hasPhoto, false);
  }
  if (subFit) {
    const subTop = blockTop + (hasTitle ? titleH + gap : 0);
    drawLines(ctx, subFit, subTop, padX, boxW, align, style, solutionColor, hasPhoto, true);
  }
}

/** Draw a fitted text block line by line, word by word, applying pops + legibility. */
function drawLines(
  ctx: CanvasRenderingContext2D, fit: Fit, top: number, padX: number, boxW: number,
  align: "left" | "center" | "right", style: StyleDef, solutionColor: string,
  hasPhoto: boolean, isSubtitle: boolean,
) {
  ctx.font = CANVAS_FONT(fit.fontSize);
  const spaceW = ctx.measureText(" ").width;
  const size = fit.fontSize;

  fit.lines.forEach((line, li) => {
    const lineTop = top + li * fit.lineHeight;
    let x = align === "left" ? padX : align === "right" ? padX + (boxW - line.width) : padX + (boxW - line.width) / 2;

    for (const word of line.items) {
      const isPop = !isSubtitle && word.active && word.category !== "plain";
      const wordColor = isSubtitle
        ? style.subColor
        : isPop ? colorFor(word.category, solutionColor, style.base) : style.base;

      // Light-bg number highlight: a yellow marker box behind dark ink (yellow text
      // on white is unreadable — the box is the honest way to "pop" a metric there).
      const marker = isPop && word.category === "number" && style.numberHighlight;
      if (marker) {
        ctx.save();
        ctx.shadowColor = "transparent";
        ctx.fillStyle = THUMB_COLORS.number;
        const mpx = size * 0.08;
        roundRect(ctx, x - mpx, lineTop + size * 0.04, word.w + mpx * 2, size * 0.9, size * 0.08);
        ctx.fill();
        ctx.restore();
      }

      // Legibility: soft drop shadow always; a dark/light stroke over photos.
      ctx.save();
      const lightText = isLight(marker ? "#15130F" : wordColor);
      ctx.shadowColor = lightText ? "rgba(0,0,0,0.55)" : "rgba(255,255,255,0.45)";
      ctx.shadowBlur = size * 0.06;
      ctx.shadowOffsetY = size * 0.02;
      if (hasPhoto && !marker) {
        ctx.lineWidth = size * 0.09;
        ctx.strokeStyle = lightText ? "rgba(0,0,0,0.8)" : "rgba(255,255,255,0.7)";
        ctx.lineJoin = "round";
        ctx.strokeText(word.raw, x, lineTop);
      }
      ctx.fillStyle = marker ? "#15130F" : wordColor;
      ctx.fillText(word.raw, x, lineTop);
      ctx.restore();

      x += word.w + spaceW;
    }
  });
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Rough luminance test so we shadow/stroke text in the readable direction. */
function isLight(hex: string): boolean {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return true;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 150;
}

// ─────────────────────────────────────────────────────────────────────────────

export default function ThumbnailStudio({ className }: { className?: string } = {}) {
  const [title, setTitle] = useState(PRESETS[0].seed.title);
  const [subtitle, setSubtitle] = useState(PRESETS[0].seed.subtitle);
  const [styleId, setStyleId] = useState<string>("black-impact");
  const [aspectId, setAspectId] = useState<AspectId>("16:9");
  const [position, setPosition] = useState<PositionId>("center");
  const [solutionColor, setSolutionColor] = useState<string>(THUMB_COLORS.solutionGreen);
  const [presetId, setPresetId] = useState<string | null>("views");
  const [darknessPct, setDarknessPct] = useState(28);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  // Once the user edits text by hand, presets stop clobbering their copy.
  const dirtyRef = useRef(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduceMotion = useMemo(
    () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
    [],
  );

  const style = STYLES.find((s) => s.id === styleId) ?? STYLES[0];
  const aspect = ASPECTS.find((a) => a.id === aspectId) ?? ASPECTS[0];

  const analysis = useMemo(
    () => analyzeText(title, solutionColor, style.base),
    [title, solutionColor, style.base],
  );

  // Emphasis-color count = base text color + each distinct active accent (pop) color.
  // The muted subtitle tone is a de-emphasized neutral, not an "emphasis color", so
  // it is deliberately excluded — the ≤3 rule should bite only when the accent pops
  // (yellow + red + green) pile up alongside the base, not for having a subtitle.
  const colorCount = useMemo(() => {
    const set = new Set<string>([style.base]);
    for (const para of analysis.paragraphs) {
      for (const w of para) {
        if (w.active && w.category !== "plain") set.add(colorFor(w.category, solutionColor, style.base));
      }
    }
    return set.size;
  }, [analysis, style.base, solutionColor]);

  // Redraw on any change (and when a freshly-loaded photo becomes drawable).
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    drawThumbnail(c, { title, subtitle, style, aspect: { w: aspect.w, h: aspect.h }, position, solutionColor, img, darknessPct });
  }, [title, subtitle, style, aspect, position, solutionColor, img, darknessPct]);

  const setText = useCallback((t: string, s: string, markDirty: boolean) => {
    setTitle(t); setSubtitle(s);
    dirtyRef.current = markDirty;
  }, []);

  const applyPreset = useCallback((p: PresetDef) => {
    setStyleId(p.style);
    setAspectId(p.aspect);
    setPosition(p.position);
    setSolutionColor(p.solution);
    setPresetId(p.id);
    if (!dirtyRef.current) setText(p.seed.title, p.seed.subtitle, false);
  }, [setText]);

  // A generic example seed (the tool is on-device and has no pet context),
  // so the control is labeled "use example", not "use my pet".
  const useExample = useCallback(() => {
    setText("DORDOR LEVELED UP TO 5", "the free 3-step care guide", false);
  }, [setText]);

  const onUpload = useCallback((file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const el = new window.Image();
      el.onload = () => setImg(el);
      el.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  }, []);

  const downloadPng = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    c.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `pet-thumbnail-${aspectId.replace(":", "x")}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setSaved(true);
      setTimeout(() => setSaved(false), 1600);
    }, "image/png");
  }, [aspectId]);

  const copyGuide = useCallback(async () => {
    const preset = PRESETS.find((p) => p.id === presetId) ?? null;
    const text = buildColorGuide({
      title, subtitle, presetLabel: preset?.label ?? null, styleLabel: style.label,
      position, aspect: aspectId, aspectPx: aspect.px, darknessPct, hasPhoto: !!img, analysis,
    });
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard blocked (permissions / http): fall back to a text selection prompt.
      window.prompt("Copy your color guide:", text);
    }
  }, [title, subtitle, presetId, style.label, position, aspectId, aspect.px, darknessPct, img, analysis]);

  const tooManyColors = colorCount > 3;
  const tooManyPops = analysis.detectedCount > MAX_POPS;

  return (
    <div className={`thumbstudio-root${className ? ` ${className}` : ""}`} style={{ color: T.ink, fontFamily: T.body }}>
      <style>{CSS}</style>

      {/* ── Masthead ── */}
      <header className="ts-head">
        <div className="ts-eyebrow">MY AI PET · CREATOR SUITE</div>
        <h1 className="ts-title">Thumbnail Studio</h1>
        <p className="ts-sub">
          A color-formula thumbnail maker for pet creators.{" "}
          <span className="ts-freebadge">Made on your device · free · no credits</span>
        </p>
      </header>

      <div className="ts-grid">
        {/* ── LIVE PREVIEW (right on desktop, first on mobile) ── */}
        <section className="ts-preview" aria-label="Live thumbnail preview">
          <div className="ts-canvaswrap" style={{ aspectRatio: aspectId.replace(":", " / ") }}>
            <canvas ref={canvasRef} className="ts-canvas" aria-label="Thumbnail preview" role="img" />
          </div>

          {/* Formula meters — enforce the "≤3 colors / 2–5 words" rules in the UI */}
          <div className="ts-meters" role="group" aria-label="Formula checks">
            <span className={`ts-meter${tooManyColors ? " warn" : ""}`}>
              <b>{colorCount}</b>/3 colors on screen
            </span>
            <span className={`ts-meter${tooManyPops ? " warn" : ""}`}>
              <b>{analysis.activeCount}</b> word{analysis.activeCount === 1 ? "" : "s"} popped
              {tooManyPops ? ` · ${analysis.detectedCount - MAX_POPS} held back` : ` · ${MAX_POPS} max`}
            </span>
          </div>
          {(tooManyColors || tooManyPops) && (
            <p className="ts-warncopy">
              {tooManyColors && "Too many colors dilutes the eye — aim for ≤3. "}
              {tooManyPops && `Only the first ${MAX_POPS} pops render; trim the rest.`}
            </p>
          )}

          <div className="ts-actions">
            <button type="button" className="ts-cta" onClick={downloadPng}>
              {saved ? "Saved ✓" : "Download PNG"}
            </button>
            <button type="button" className="ts-ghost" onClick={copyGuide}>
              {copied ? "Copied ✓" : "Copy color guide"}
            </button>
          </div>
          <p className="ts-note">
            Exports at true {aspect.px}. Nothing is uploaded — the PNG is rendered right here in your browser.
          </p>
        </section>

        {/* ── CONTROLS (left on desktop) ── */}
        <section className="ts-controls">
          {/* 1. Text */}
          <Panel label="Headline">
            <div className="ts-row-between">
              <span className="ts-hint">Line breaks are respected. Big + few words win.</span>
              <button type="button" className="ts-chip" onClick={useExample}>＋ use example</button>
            </div>
            <textarea
              className="ts-textarea ts-titlearea"
              value={title}
              onChange={(e) => setText(e.target.value, subtitle, true)}
              placeholder="YOUR BOLD TITLE"
              rows={2}
              aria-label="Thumbnail title"
              spellCheck={false}
            />
            <textarea
              className="ts-textarea"
              value={subtitle}
              onChange={(e) => setText(title, e.target.value, true)}
              placeholder="a short supporting line (optional)"
              rows={2}
              aria-label="Thumbnail subtitle"
              spellCheck={false}
            />
          </Panel>

          {/* 2. Detected keywords */}
          <Panel label="Detected keywords">
            {analysis.chips.length === 0 ? (
              <p className="ts-empty">
                No pops yet. Add a <b>number</b> (3, 100K, $500), a <b>risk</b> word
                (never, stop, mistake) or a <b>benefit</b> word (free, easy, how, best).
              </p>
            ) : (
              <div className="ts-chips">
                {analysis.chips.map((c, i) => (
                  <span key={`${c.word}-${i}`} className="ts-kw">
                    <span className="ts-kw-dot" style={{ background: c.color }} aria-hidden />
                    {c.word}
                  </span>
                ))}
              </div>
            )}
            {/* Solution accent toggle (green vs sky — same bucket, pick per style) */}
            <div className="ts-row-between" style={{ marginTop: 10 }}>
              <span className="ts-hint">Benefit accent</span>
              <div className="ts-seg" role="group" aria-label="Benefit accent color">
                {[
                  { c: THUMB_COLORS.solutionGreen, name: "Green" },
                  { c: THUMB_COLORS.solutionSky, name: "Sky" },
                ].map((o) => (
                  <button
                    key={o.c}
                    type="button"
                    className={`ts-segbtn${solutionColor === o.c ? " on" : ""}`}
                    aria-pressed={solutionColor === o.c}
                    onClick={() => setSolutionColor(o.c)}
                  >
                    <span className="ts-kw-dot" style={{ background: o.c }} aria-hidden /> {o.name}
                  </button>
                ))}
              </div>
            </div>
          </Panel>

          {/* 3. Presets */}
          <Panel label="Presets">
            <div className="ts-presets">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`ts-preset${presetId === p.id ? " on" : ""}`}
                  aria-pressed={presetId === p.id}
                  onClick={() => applyPreset(p)}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </Panel>

          {/* 4. Style */}
          <Panel label="Style">
            <div className="ts-styles">
              {STYLES.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={`ts-style${styleId === s.id ? " on" : ""}`}
                  aria-pressed={styleId === s.id}
                  onClick={() => {
                    setStyleId(s.id);
                    if (s.captionMode) setAspectId("9:16");
                  }}
                >
                  <span className="ts-style-swatch" style={{ background: s.bg, color: s.base }} aria-hidden>Aa</span>
                  <span className="ts-style-txt">
                    <b>{s.label}</b>
                    <span>{s.hint}</span>
                  </span>
                </button>
              ))}
            </div>
          </Panel>

          {/* 5. Photo */}
          <Panel label="Photo (optional)">
            <div className="ts-row-between">
              <label className="ts-upload">
                <input type="file" accept="image/*" onChange={(e) => onUpload(e.target.files?.[0] ?? null)} aria-label="Upload background photo" />
                {img ? "Replace photo" : "Upload photo"}
              </label>
              {img && (
                <button type="button" className="ts-ghost sm" onClick={() => setImg(null)}>Remove</button>
              )}
            </div>
            <label className={`ts-slider${img ? "" : " disabled"}`}>
              <span className="ts-hint">Photo darkness — legibility overlay <b>{darknessPct}%</b></span>
              <input
                type="range" min={0} max={70} step={1} value={darknessPct}
                onChange={(e) => setDarknessPct(Number(e.target.value))}
                disabled={!img}
                aria-label="Photo darkness overlay percent"
              />
            </label>
          </Panel>

          {/* 6. Position + aspect */}
          <Panel label="Layout">
            <span className="ts-hint">Text position</span>
            <div className="ts-seg wrap" role="group" aria-label="Text position">
              {POSITIONS.map((pos) => (
                <button
                  key={pos.id}
                  type="button"
                  className={`ts-segbtn${position === pos.id ? " on" : ""}`}
                  aria-pressed={position === pos.id}
                  onClick={() => setPosition(pos.id)}
                >
                  {pos.label}
                </button>
              ))}
            </div>
            <span className="ts-hint" style={{ marginTop: 12, display: "block" }}>Aspect</span>
            <div className="ts-seg" role="group" aria-label="Aspect ratio">
              {ASPECTS.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  className={`ts-segbtn${aspectId === a.id ? " on" : ""}`}
                  aria-pressed={aspectId === a.id}
                  onClick={() => setAspectId(a.id)}
                >
                  {a.label}
                </button>
              ))}
            </div>
          </Panel>
        </section>
      </div>

      {/* motion pref honored via CSS below (transitions gated on prefers-reduced-motion) */}
      {reduceMotion ? null : null}
    </div>
  );
}

function Panel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="ts-panel">
      <div className="ts-panel-label">{label}</div>
      {children}
    </div>
  );
}

// ── Scoped chrome CSS (Collectible Editorial). All selectors under .thumbstudio-root
//    so nothing leaks. Uses the --ed-* tokens declared on <body> in globals.css. ──
const CSS = `
.thumbstudio-root{max-width:1160px;margin:0 auto;padding:20px 16px 56px}
.thumbstudio-root *{box-sizing:border-box}
.thumbstudio-root .ts-head{margin-bottom:20px}
.thumbstudio-root .ts-eyebrow{font-family:var(--ed-m);font-size:13px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:${T.terraSub}}
.thumbstudio-root .ts-title{font-family:var(--ed-disp);font-weight:800;font-size:clamp(28px,5vw,44px);letter-spacing:-.02em;margin:4px 0 6px;color:${T.ink}}
.thumbstudio-root .ts-sub{font-size:15px;color:${T.muted2};margin:0;line-height:1.5}
.thumbstudio-root .ts-freebadge{display:inline-block;font-family:var(--ed-m);font-size:13px;font-weight:700;letter-spacing:.04em;color:${T.terra};background:rgba(190,79,40,.10);border:1px solid rgba(190,79,40,.2);border-radius:999px;padding:2px 9px;margin-left:4px;white-space:nowrap}

.thumbstudio-root .ts-grid{display:grid;grid-template-columns:1fr;gap:18px}
@media(min-width:920px){.thumbstudio-root .ts-grid{grid-template-columns:minmax(0,1fr) minmax(0,1.05fr);align-items:start}}

/* Preview: first on mobile, right column on desktop */
.thumbstudio-root .ts-preview{order:-1;display:flex;flex-direction:column;gap:12px}
@media(min-width:920px){.thumbstudio-root .ts-preview{order:0;position:sticky;top:16px}}

.thumbstudio-root .ts-canvaswrap{width:100%;background:${T.field};border-radius:14px;overflow:hidden;box-shadow:var(--ed-shadow-card,0 20px 40px -26px rgba(80,55,20,.5)),0 0 0 1px ${T.hair};display:flex}
.thumbstudio-root .ts-canvas{width:100%;height:100%;display:block}

.thumbstudio-root .ts-meters{display:flex;flex-wrap:wrap;gap:8px}
.thumbstudio-root .ts-meter{font-family:var(--ed-m);font-size:13px;font-weight:700;letter-spacing:.03em;color:${T.muted2};background:${T.inset};border:1px solid ${T.hair};border-radius:999px;padding:5px 11px}
.thumbstudio-root .ts-meter b{color:${T.ink}}
.thumbstudio-root .ts-meter.warn{color:#8a2b16;background:rgba(255,90,77,.1);border-color:rgba(255,90,77,.4)}
.thumbstudio-root .ts-meter.warn b{color:${T.terra}}
.thumbstudio-root .ts-warncopy{margin:0;font-size:13px;color:${T.terraSub};line-height:1.45}

.thumbstudio-root .ts-actions{display:flex;gap:10px;flex-wrap:wrap}
.thumbstudio-root .ts-cta{flex:1 1 auto;min-height:48px;min-width:150px;padding:12px 20px;border:none;border-radius:12px;background:linear-gradient(180deg,${T.cta1},${T.cta2});color:${T.ink};font-family:var(--ed-disp);font-weight:800;font-size:17px;letter-spacing:.01em;cursor:pointer;box-shadow:0 16px 30px -18px rgba(226,125,12,.8)}
.thumbstudio-root .ts-ghost{min-height:48px;padding:12px 18px;border:1px solid ${T.hair};border-radius:12px;background:${T.paper};color:${T.ink70};font-family:var(--ed-body);font-weight:700;font-size:14px;cursor:pointer}
.thumbstudio-root .ts-ghost.sm{min-height:36px;padding:6px 12px;font-size:13px}
.thumbstudio-root .ts-note{margin:0;font-size:13px;color:${T.muted};line-height:1.45}

/* Controls */
.thumbstudio-root .ts-controls{display:flex;flex-direction:column;gap:14px}
.thumbstudio-root .ts-panel{background:${T.paper};border:1px solid ${T.hair};border-radius:16px;padding:16px;box-shadow:var(--ed-shadow-card,0 20px 40px -26px rgba(80,55,20,.5))}
.thumbstudio-root .ts-panel-label{font-family:var(--ed-m);font-size:13px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:${T.mono};margin-bottom:10px}
.thumbstudio-root .ts-hint{font-size:13px;color:${T.muted2}}
.thumbstudio-root .ts-hint b{color:${T.ink}}
.thumbstudio-root .ts-empty{font-size:13px;color:${T.muted2};line-height:1.5;margin:0}
.thumbstudio-root .ts-empty b{color:${T.ink}}
.thumbstudio-root .ts-row-between{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px}

.thumbstudio-root .ts-chip{min-height:34px;padding:5px 12px;border:1px solid rgba(190,79,40,.3);border-radius:999px;background:rgba(190,79,40,.08);color:${T.terra};font-family:var(--ed-m);font-size:13px;font-weight:700;letter-spacing:.04em;cursor:pointer;white-space:nowrap}

.thumbstudio-root .ts-textarea{width:100%;padding:12px 14px;border:1px solid ${T.hair};border-radius:12px;background:${T.inset};color:${T.ink};font-family:var(--ed-body);font-size:15px;line-height:1.35;resize:vertical;margin-bottom:8px}
.thumbstudio-root .ts-textarea:last-child{margin-bottom:0}
.thumbstudio-root .ts-titlearea{font-weight:800;letter-spacing:-.01em;font-size:16px}
.thumbstudio-root .ts-textarea:focus-visible{outline:none;border-color:${T.terra};box-shadow:0 0 0 3px rgba(190,79,40,.16)}

.thumbstudio-root .ts-chips{display:flex;flex-wrap:wrap;gap:8px}
.thumbstudio-root .ts-kw{display:inline-flex;align-items:center;gap:7px;padding:6px 12px;border:1px solid ${T.hair};border-radius:999px;background:${T.inset};font-size:14px;font-weight:700;color:${T.ink}}
.thumbstudio-root .ts-kw-dot{width:11px;height:11px;border-radius:50%;flex-shrink:0;box-shadow:inset 0 0 0 1px rgba(0,0,0,.15)}

.thumbstudio-root .ts-seg{display:flex;gap:6px}
.thumbstudio-root .ts-seg.wrap{flex-wrap:wrap}
.thumbstudio-root .ts-segbtn{display:inline-flex;align-items:center;gap:6px;min-height:40px;padding:8px 13px;border:1px solid ${T.hair};border-radius:10px;background:${T.paper};color:${T.ink70};font-family:var(--ed-body);font-weight:700;font-size:13px;cursor:pointer}
.thumbstudio-root .ts-segbtn.on{border-color:${T.terra};background:rgba(190,79,40,.09);color:${T.terra}}

.thumbstudio-root .ts-presets{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}
.thumbstudio-root .ts-preset{min-height:46px;padding:11px 12px;border:1px solid ${T.hair};border-radius:12px;background:${T.inset};color:${T.ink};font-family:var(--ed-body);font-weight:800;font-size:14px;cursor:pointer;text-align:center}
.thumbstudio-root .ts-preset.on{border-color:${T.terra};background:rgba(190,79,40,.1);color:${T.terra};box-shadow:0 4px 0 -1px rgba(190,79,40,.25)}

.thumbstudio-root .ts-styles{display:grid;grid-template-columns:1fr;gap:8px}
@media(min-width:520px){.thumbstudio-root .ts-styles{grid-template-columns:1fr 1fr}}
.thumbstudio-root .ts-style{display:flex;align-items:center;gap:11px;min-height:56px;padding:10px 12px;border:1px solid ${T.hair};border-radius:12px;background:${T.paper};cursor:pointer;text-align:left}
.thumbstudio-root .ts-style.on{border-color:${T.terra};box-shadow:0 0 0 1px ${T.terra},0 6px 0 -2px rgba(190,79,40,.22)}
.thumbstudio-root .ts-style-swatch{flex-shrink:0;width:40px;height:40px;border-radius:9px;display:flex;align-items:center;justify-content:center;font-family:"Arial Black",sans-serif;font-weight:900;font-size:16px;box-shadow:inset 0 0 0 1px rgba(0,0,0,.15)}
.thumbstudio-root .ts-style-txt{display:flex;flex-direction:column;gap:2px;min-width:0}
.thumbstudio-root .ts-style-txt b{font-size:14px;color:${T.ink};line-height:1.15}
.thumbstudio-root .ts-style-txt span{font-size:13px;color:${T.muted};line-height:1.25}

.thumbstudio-root .ts-upload{display:inline-flex;align-items:center;min-height:40px;padding:9px 15px;border:1px dashed ${T.terra};border-radius:10px;background:rgba(190,79,40,.06);color:${T.terra};font-family:var(--ed-body);font-weight:700;font-size:13px;cursor:pointer;position:relative;overflow:hidden}
.thumbstudio-root .ts-upload input{position:absolute;inset:0;opacity:0;cursor:pointer;font-size:0}
.thumbstudio-root .ts-slider{display:block;margin-top:12px}
.thumbstudio-root .ts-slider.disabled{opacity:.5}
.thumbstudio-root .ts-slider input{width:100%;margin-top:8px;accent-color:${T.terra};height:24px;cursor:pointer}
.thumbstudio-root .ts-slider.disabled input{cursor:not-allowed}

.thumbstudio-root button:focus-visible,.thumbstudio-root .ts-upload:focus-within,.thumbstudio-root input:focus-visible{outline:2px solid ${T.terra};outline-offset:2px}

@media(prefers-reduced-motion:no-preference){
  .thumbstudio-root .ts-cta,.thumbstudio-root .ts-ghost,.thumbstudio-root .ts-preset,.thumbstudio-root .ts-style,.thumbstudio-root .ts-segbtn,.thumbstudio-root .ts-chip{transition:transform .14s ease,box-shadow .14s ease,background .14s ease,border-color .14s ease,color .14s ease}
  .thumbstudio-root .ts-cta:active{transform:translateY(1px)}
}
`;
