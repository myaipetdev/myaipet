# MY AI PET Studio — PRO Rebuild Blueprint (`STUDIO-PRO.md`)

_Authoritative design doc for rebuilding "MY AI PET Studio" to CapCut / Kling /
Seedance grade — a tool people **pay** for. Grounded in competitive research,
the client-side-editing tech stack, the current Studio code, and
`docs/ECONOMY.md`. Written 2026-07-09._

> **North star:** the wallet opens at concrete task-completion friction points
> (hit a cap, ran out of credits, resolution too low to post, watermark on the
> clip you want to share) — **not** at a vague "go premium" wall. Every paid
> action stays margin-positive at the bulk credit floor ($0.025/cr) via the
> `credits = ceil(vendorUSD / 0.0125)` rule from `docs/ECONOMY.md`.

---

## 0. Where we are today (grounding)

Current Studio is a **generation-only** tool (`web/src/components/PetStudioPro.tsx`,
~2,200 lines): pick pet → style → engine → prompt → one clip/image out. It has:

- A clean provider catalog (`web/src/lib/studio/providers.ts`) — 12 models,
  fal + Grok backends, per-model `creditsPerRun` / `usdPerRun` / `tier`.
- A single charge+submit endpoint (`web/src/app/api/studio/generate/route.ts`)
  with atomic credit deduction, refund-on-failure, moderation, tier/quota gate,
  and permanent-storage persistence via `saveRemoteFile`.
- 20+ pet-anchored prompt templates (`web/src/lib/studio/templates.ts`).
- Job persistence/resume, variations, share links, avatar/card-art handoff.

**What it is missing to be a "pro tool people pay for":** there is no editor.
You cannot trim, sequence multiple clips, add a music track, add captions, or
control export resolution/watermark. Every "edit" is a re-generation (another
paid fal call). That is the gap this doc closes — and it closes it **without
adding server CPU load**, because all editing runs in the user's browser.

---

## 1. VISION — what "Pro Studio" is, and why users pay

**Pro Studio = Generate → Edit → Finish → Export, in one screen, mostly on the
user's own device.** The pet is the character; fal is the render farm; the
browser is the editing suite; fal (again, pay-per-use) is the optional "AI
finishing" lab. We sell **credits for the expensive moments** and keep the cheap
moments free so people stay long enough to hit an expensive one.

### The three things people actually pay for (from competitive research)

| Pay driver (observed across CapCut / Kling / Seedance / Runway) | How Pro Studio charges it |
|---|---|
| **Resolution + watermark wall** — free = 720p / watermarked, paid = clean HD | Editor export is free & client-side at **720p with a corner watermark**; **1080p watermark-free export costs credits** (pure-margin lever, zero vendor cost) or is included in a subscription tier |
| **Credit scarcity that bites mid-project** — the 2nd/3rd iteration triggers the wall, not the 1st | Generation already credit-metered per run; iteration (variations, re-gen, animate) each bills again — unchanged |
| **Flagship-model / premium-effect gating** ("won't look obviously AI") | Best video models stay `tier: studio` + higher credits; **AI-Finish effects** (upscale, interpolate, auto-caption, bg-remove, soundtrack) are paid fal passes gated by credits |
| **Speed / queue priority** | Client editing is instant for everyone; the paid lever is the AI-Finish fal pass (off-box GPU) vs. "good enough" client export |

### Why this specific shape wins for a pet product

- **The editor is the retention surface, not the paywall.** CapCut proved a
  generous free editor (watermark-free base export) plus quota/resolution/model
  gates converts better than a hostile watermark-everything wall. We keep basic
  editing free so a user assembles a real 15-second pet reel — *then* wants it in
  HD without a watermark to post. That is the buy moment.
- **Editing costs us ~$0.** WebCodecs runs on the user's GPU. Our EC2 box does
  not transcode. We can give away unlimited trimming/sequencing/captioning and
  still be margin-positive, because the only things that cost money (fal
  generation, fal AI-Finish, HD-export unlock) are individually metered.
- **It closes the loop the app already has.** A finished reel → share link
  (`/c/<id>`) → avatar/TCG card art → season points. Studio already wires all of
  this; the editor just produces a better artifact to push through it.

---

## 2. ARCHITECTURE

### 2.1 Principle: client-first, server-thin

Three compute zones, and **the middle one (editing) never touches our server**:

```
 ┌──────────────────────────── USER'S BROWSER ────────────────────────────┐
 │                                                                         │
 │  GENERATE            EDIT (100% client)               FINISH (optional) │
 │  ────────            ──────────────────               ───────────────── │
 │  prompt/template ─▶  timeline: trim · sequence 2–3    "AI Finish" tap ─┐│
 │        │             clips · 1 music track · text/     (upscale/interp/││
 │        │             caption overlay · (v2) trans-     caption/bg/music)││
 │        │             itions/stickers/speed             │               ││
 │        ▼                    │                           │               ││
 │  [fal render] ◀── proxy     │  WebCodecs decode/encode  │               ││
 │        │        (our API)   │  + OffscreenCanvas comp.  │               ││
 │        │                    │  + mp4-muxer → MP4 blob   │               ││
 │        │                    ▼                           │               ││
 │        │             EXPORT (client):                   │               ││
 │        │             720p+watermark = FREE              │               ││
 │        │             1080p clean   = credits/sub        │               ││
 │        │                    │                           │               ││
 └────────┼────────────────────┼───────────────────────────┼──────────────┘
          │ (job submit/poll)  │ (upload final MP4)         │ (proxy to fal)
          ▼                    ▼                            ▼
 ┌───────────────────────── OUR EC2 BOX (near-idle) ───────────────────────┐
 │  • serve SPA + WASM/JS bundles (static, CDN-cacheable)                   │
 │  • /api/studio/generate      → thin proxy to fal/Grok (existing)         │
 │  • /api/studio/export        → charge credits, mint watermark-free token │
 │  • /api/studio/finish        → thin proxy to fal AI models (new)         │
 │  • /api/studio/project       → save/load project JSON (v3, tiny rows)    │
 │  • storage: accept final MP4 PUT → /uploads (later S3/R2)                │
 │  NO ffmpeg process. NO transcode. NO headless Chromium. NO Remotion.     │
 └─────────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
              fal.ai GPU fleet (generation + AI-Finish) — off our box
```

### 2.2 Where server load actually lands

| Operation | Compute location | Our EC2 cost |
|---|---|---|
| Trim / cut / sequence clips | Browser (WebCodecs, GPU) | **~0** |
| Text / caption / sticker overlay | Browser (OffscreenCanvas) | **~0** |
| Transitions / speed ramp (v2) | Browser (canvas blend / frame resample) | **~0** |
| Music track mux/duck (v1 basic, v2 full) | Browser (ffmpeg.wasm audio path) | **~0** (user CPU) |
| Final MP4 encode + mux | Browser (WebCodecs + `mp4-muxer`) | **~0** |
| Export upload (final blob) | Disk/bandwidth I/O only | I/O, not CPU |
| Generation (fal/Grok) | fal GPU | thin HTTP proxy |
| AI-Finish (upscale/interp/caption/bg/music) | fal GPU | thin HTTP proxy |

**Net:** CPU stays flat regardless of how many users are editing simultaneously —
each browser renders its own project. The scaling variable becomes **storage +
bandwidth** (final MP4s), which is why v3 plans a migration from `/uploads` on
the box to S3/R2. This is the *same class of load the app already handles* for
the existing fal generation flow — no new server risk is introduced.

### 2.3 Editing engine choice (tech research verdict)

| Layer | Choice | Why |
|---|---|---|
| **Primary editor engine** | **WebCodecs** + thin canvas compositor + **`mp4-muxer`** | Hardware-accelerated decode/encode on the user's GPU; frame-accurate trim; ~50–100KB muxer (pure JS, not WASM). Covers ~90% of CapCut-grade editing client-side. |
| **Fallback / audio path** | **`ffmpeg.wasm`**, lazy-loaded behind `import()` | Only pulled when: (a) no WebCodecs (older Firefox Android), (b) audio mixing/ducking under music, (c) codec/container edge case. Never loaded upfront (~25MB). |
| **AI Finish** | **fal.ai** serverless GPU, pay-per-use | Upscale, interpolate, auto-caption, bg-remove, soundtrack — off our box, metered by credits. |
| **NOT used** | **Remotion**, **server-side ffmpeg** | Both run server-side (Lambda/Chromium+ffmpeg per render) — exactly the EC2-saturation failure mode to avoid. If a templated auto-reel is ever wanted, run it as an *isolated* serverless function, never the app box, never the default path. |

WebCodecs support to design around (2026): Chrome/Edge 94+, Firefox 130+ desktop,
Safari 26+ (macOS/iOS/iPadOS), Chrome Android 147+. **Firefox Android has none** →
that path gets the ffmpeg.wasm fallback or a "use Chrome/Safari for the editor"
notice. Always feature-detect with `VideoEncoder.isConfigSupported()` before
committing to a codec config (mismatches fail silently).

---

## 3. V1 BUILD SPEC — the smallest shippable "pro" slice

**Goal of v1:** turn the generation-only tool into a *generate-then-assemble*
tool, and introduce the first real paywall (watermark → HD export). Ship a
**minimal client editor**: trim + sequence 2–3 clips + one music track + one
text/caption overlay + export MP4 (free = 720p watermarked, paid = 1080p clean).

### 3.1 Scope (in / out)

**In:**
- Editor timeline holding **2–3 generated clips** (from History or fresh gens).
- **Trim** each clip (in/out handles, frame-accurate).
- **Sequence** clips end-to-end (drag reorder).
- **One music track** (upload user file, or pick from a small royalty-free set),
  trimmed to reel length, basic volume.
- **One text/caption overlay** per clip (position + font from a small preset set;
  drawn on canvas, not burned server-side).
- **Export MP4**: free path = 720p + corner watermark (client, WebCodecs);
  paid path = 1080p, no watermark (credits or subscription).

**Out (deferred to v2/v3):** transitions, stickers, speed ramp, multi-track
audio, AI-Finish effects, project save/resume. Keep v1 ruthlessly small.

### 3.2 Files & components to add

```
web/src/lib/studio/editor/
  engine.ts          # WebCodecs orchestration: decode ranges, composite, encode, mux
  timeline.ts        # Project model: clips[], music, overlays[], durations, ordering
  compositor.ts      # OffscreenCanvas draw loop: frame + text overlay + watermark
  export.ts          # encode+mux pipeline; 720p-wm (free) vs 1080p-clean (paid) presets
  caps.ts            # feature-detect WebCodecs / codec configs; decide fallback
  ffmpegFallback.ts  # lazy import('@ffmpeg/ffmpeg'); audio mux + no-WebCodecs path
  watermark.ts       # corner "MY AI PET" mark drawn onto canvas for free exports

web/src/components/studio/
  Editor.tsx         # timeline UI shell (rail of clips, playhead, transport)
  ClipTrack.tsx      # per-clip trim handles + drag-reorder
  MusicTrack.tsx     # audio upload/pick + trim + volume
  OverlayLayer.tsx   # text/caption editor over the preview canvas
  ExportBar.tsx      # resolution/watermark choice + "Export" (triggers export.ts)
```

**Wiring:** add an **"Edit / Assemble"** entry point in `PetStudioPro.tsx`
result actions (next to Remix / Animate / Share) that pushes finished
generations into `timeline.ts` and opens `Editor.tsx`. Reuse the existing
Collectible-Editorial tokens (`T` object) for styling — no new design system.

### 3.3 Exact libraries / APIs

| Need | Library / API | Notes |
|---|---|---|
| Decode/encode frames | **WebCodecs** `VideoDecoder` / `VideoEncoder` / `AudioEncoder` (built-in) | Feature-detect via `isConfigSupported`. H.264 baseline for max compatibility. |
| Container mux | **`mp4-muxer`** (npm, ~pure JS) | Wraps H.264/AAC chunks → playable MP4. Add to `web/package.json`. |
| Demux input clips | **`mp4box.js`** (npm) | Parse fal-returned MP4s into decodable samples. |
| Compositing | `OffscreenCanvas` + `VideoFrame` (built-in) | Draw frame → draw text overlay → draw watermark → `new VideoFrame(canvas)` → encode. |
| Audio mux / ducking (fallback) | **`@ffmpeg/ffmpeg`** (ffmpeg.wasm), lazy `import()` | Only for the music-under-video mux in v1 if WebCodecs `AudioEncoder` proves fiddly; keep behind dynamic import. |
| Export credit charge | **new** `POST /api/studio/export` | Charges HD-export credits, returns a one-time "clean export" token the client honors (drops the watermark canvas layer). |

> **v1 audio simplification:** if wiring `AudioEncoder` + PTS alignment is slow,
> ship v1 music via the lazy ffmpeg.wasm mux (encode silent video with WebCodecs,
> then `ffmpeg -i video -i music -shortest` in WASM). It is the pragmatic path
> for one track; move to native `AudioEncoder` in v2 when adding ducking.

### 3.4 The v1 paywall (first real "pro" money moment)

Export dialog offers two buttons:

- **"Export (free)"** → 720p, corner watermark, client-only, 0 credits.
- **"Export HD · no watermark"** → calls `POST /api/studio/export`, charges
  **HD-export credits** (see §5), server returns a signed token, client renders
  the 1080p clean MP4 (same WebCodecs pipeline, higher target resolution, no
  watermark layer). Subscription tiers (`pro`/`studio`) get this **included**
  (skip the credit charge) per `TIER_LIMITS.editorAccess`.

This is the highest-leverage lever in the research (resolution + watermark wall)
and it has **zero vendor cost** — the credit charge is pure margin.

---

## 4. PHASED ROADMAP

### v1 — Assemble & the watermark wall _(smallest shippable pro slice)_
- Client editor: trim, sequence 2–3 clips, 1 music track, 1 text/caption overlay.
- Export: free 720p+watermark vs paid 1080p clean (credits / subscription).
- Entry point from generation results into the editor.
- **Ships the first pay-to-finish moment.**

### v2 — A real timeline
- Multi-clip timeline with a scrubbable playhead + snapping.
- **Transitions** (crossfade / wipe — canvas blend during the frame loop).
- **Stickers** (the existing Codex sticker set + emoji, drawn as overlays).
- **Speed ramp** (frame resample: drop/duplicate frames or interpolate — cheap
  version client-side; smooth version via v3 AI interpolation).
- Full **audio**: native `AudioEncoder`, volume automation, ducking music under
  original clip audio (ffmpeg.wasm audio filtergraph if needed).
- Multiple text overlays with keyframed position/opacity.

### v3 — AI Finish + gating + project persistence
- **AI-Finish pass** (fal, pay-per-use, credit-metered): one-tap **upscale**
  (720p→1080p/4K), **smooth / slow-mo interpolation**, **auto-captions**
  (word-timed, rendered as an overlay track, not burned in), **background
  removal** (pet cut-out → new scene), **auto-soundtrack** (generated music).
- **Watermark-free + resolution gating** matured: 4K export as a `studio`-tier /
  higher-credit lever; premium AI-Finish effects gated per credits + tier.
- **Project save / resume**: `POST/GET /api/studio/project` persists the
  timeline JSON (clips are URLs already in storage; the project row is tiny —
  ordering, trims, overlay text, music ref). No media re-upload. Enables
  "come back tomorrow and finish your reel."
- Storage migration `/uploads` → **S3/R2** (bandwidth/storage is now the scaling
  variable, per §2.2).

---

## 5. MONETIZATION — hooks mapped to credits

All values follow the `docs/ECONOMY.md` invariant:
**`credits(action) = ceil(vendorUSD / 0.0125)`** → guarantees ≥50% gross margin
even at the deepest bulk-pack discount ($0.025/cr). Retail credit = $0.05.
Editing itself is free (client compute); credits are charged only where there is
real vendor cost **or** a deliberate resolution/watermark lever.

### 5.1 Credit table (new Pro-Studio actions)

| Action | Layer | Vendor $ (fal / — ) | Rule floor `ceil($/0.0125)` | **Charge (cr)** | Margin note |
|---|---|---|---|---|---|
| Basic edit (trim/seq/overlay/720p export) | client | $0 | 0 | **0 (free)** | Retention surface; costs us nothing |
| **HD 1080p clean export** | client | $0 | 0 | **10** | Pure-margin watermark/res lever; **free on `pro`/`studio` sub** |
| **4K clean export** (v3) | client | $0 | 0 | **25** | Higher res lever; `studio`-tier included |
| **AI upscale** 720p→1080p (v3) | fal `video-upscaler` | ~$0.05–0.20 | 4–16 | **20** | ~$0.20 worst case → 20 cr keeps ≥50% @bulk |
| **AI upscale — hero/4K** (Topaz/Crystal) | fal `topaz` / `crystal` | ~$0.10–0.30 | 8–24 | **30** | "Hero export" only; not default |
| **Smooth / slow-mo interpolate** (v3) | fal `rife` | ~$0.04–0.10 | 4–8 | **10** | Cheap; one-tap 2×/4× |
| **Auto-captions** (v3) | fal `wizper` | ~<$0.01 | 1 | **5** | Near-free vendor; small "finishing" charge |
| **Background removal** (v3) | fal `birefnet` | ~<$0.01 | 1 | **8** | Near-free vendor; pet cut-out effect |
| **Auto-soundtrack** (v3) | fal `stable-audio-25` | $0.20 flat | 16 | **20** | Flat-fee; 20 cr = comfortable margin |

> Every AI-Finish charge is set **at or above** the rule floor computed from the
> *worst-case* vendor price, so no finishing action can go underwater even at the
> $0.025/cr bulk floor. Where vendor cost is ~$0 (captions/bg-remove), the small
> charge is a finishing convenience fee, not a cost pass-through.

### 5.2 How this maps to the pay drivers

- **Watermark → HD export (10 cr)** = the resolution/watermark wall, the single
  strongest lever, with zero vendor cost. First buy moment in v1.
- **AI-Finish credits** = the "won't look obviously AI / finished shareable
  output" lever (upscale, interpolate, soundtrack), each metered to real fal cost.
- **Flagship generation models** (`kling-1.6-pro`, `minimax-hailuo`, `veo-3`)
  stay `tier: studio` + high credits (existing `providers.ts`), unchanged — the
  quality-anxiety upsell. **Veo 3 must be repriced to ≥350–400 cr before unlock**
  (see `docs/ECONOMY.md` P0 — it is break-even-to-negative at 250 cr).
- **Subscription (`pro`/`studio`)** = additive access gate only: includes
  watermark-free/HD export + editor + higher model tiers + monthly quota, but
  **credits are still charged on generation** (`generate/route.ts` already does
  this) so a tier can never become an all-you-can-eat that goes underwater. Do
  **not** flip `SUBSCRIPTION_SALES_ENABLED` to a credits-*inclusive* model.

### 5.3 Free-tier shape (generous but bounded, per research)

- Free: full basic editor, unlimited 720p watermarked exports, existing
  `TIER_LIMITS.free` (3 videos/mo, 30 images/mo, 720p gen cap).
- The free editor is the hook; the wall is HD export + AI-Finish + more gens.
- Launch generous, tighten later (CapCut pattern) — do not over-gate at launch.

---

## 6. RISKS & MITIGATIONS

| Risk | Impact | Mitigation |
|---|---|---|
| **WebCodecs gaps** — Firefox Android none; Safari/iOS only 26+; codec configs fail silently | Editor broken for some users | Feature-detect via `caps.ts` (`isConfigSupported`); lazy **ffmpeg.wasm** fallback for no-WebCodecs; graceful "open the editor in Chrome/Safari" notice on unsupported (Firefox Android). Gate the *export* button on a real capability check, not UA sniffing. |
| **ffmpeg.wasm size/perf** — ~25MB download, CPU-only (3–10× slower), ~2GB WASM memory ceiling | Slow first use, fails on long/large clips | Never load upfront — `import()` only when needed. Cap editor projects at short social lengths (<2–3 min, target ≤60s reels). Keep it the *fallback*, not the default path. Cache via service worker after first load. |
| **Storage / CDN growth** — final MP4s pile up in `/uploads` on the box | Disk fills; bandwidth cost | Storage/bandwidth is the real scaling variable (not CPU). v3 migrates `/uploads` → **S3/R2**. Set retention/cleanup on orphaned exports; serve via CDN. |
| **fal cost control** — AI-Finish + generation are real per-call spend; a mispriced model bleeds | Margin-negative actions | Enforce the `credits ≥ ceil(usdPerRun/0.0125)` invariant as a **unit test** over the model + finish catalog (catches the next Veo-3-style mispricing at PR time). Keep AI-Finish behind explicit credit charges. Refresh `usdPerRun` from live fal pricing (Wan 2.1, Veo 3 flagged in `docs/ECONOMY.md`). |
| **fal bills for failed jobs** | Silent cost, no revenue | Existing generate path refunds credits on failure; confirm fal doesn't bill submitted-then-failed jobs, and apply the same refund pattern to `/api/studio/finish`. |
| **Double-charge / stale poll** in editor async flows | User pays twice / UI stomps | Reuse the proven `jobSeqRef` + `mountedRef` sentinel pattern and sessionStorage job-pointer resume already in `PetStudioPro.tsx`; the export/finish endpoints charge inside the same atomic-decrement transaction shape as `generate/route.ts`. |
| **Watermark bypass** — client controls the watermark layer | Free users get clean HD | HD-clean export requires a server-minted one-time token from `/api/studio/export` (credit charged there); without it the client pipeline always composites the watermark. Token is per-export, short-lived, tied to the project hash. |
| **Editor scope creep** | v1 never ships | v1 is ruthlessly minimal (trim + 2–3 clips + 1 music + 1 caption + export). Transitions/stickers/speed/AI-Finish/save are explicitly v2/v3. |

---

## 7. Build order (concrete next steps)

1. `caps.ts` + `engine.ts` — prove a **decode→trim→re-encode→mux** round-trip of
   one fal MP4 in the browser (WebCodecs + `mp4-muxer`), export a 720p file.
2. `watermark.ts` + `compositor.ts` — add the corner watermark + one text overlay
   to the frame loop.
3. `timeline.ts` + `Editor.tsx` + `ClipTrack.tsx` — hold 2–3 clips, trim, reorder,
   sequence-export.
4. `MusicTrack.tsx` + ffmpeg.wasm audio mux — one music track under the reel.
5. `ExportBar.tsx` + `POST /api/studio/export` — the free-720p-wm vs paid-1080p-clean
   fork + credit charge / subscription bypass.
6. Wire the "Edit / Assemble" entry point into `PetStudioPro.tsx` result actions.
7. Add the `credits ≥ ceil(usdPerRun/0.0125)` invariant test over the catalog.

Ship v1, watch where users hit the export wall, then build v2/v3 against real
friction data.
