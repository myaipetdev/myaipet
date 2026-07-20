# MY AI PET — Demo Video Kit (HANDOFF)

Self-contained pipeline for producing the founder-approved product demo videos.
Everything in this folder is durable and git-versioned; a fresh Claude session
(or a human) can reproduce and extend the videos by following this document alone.

**Reference outputs already delivered** (on `~/Desktop`):
- `MY-AI-PET-fulldemo.mp4` — ~85s 1080p one-take walkthrough (canonical, v3):
  home → My Pet tour → Pet Square → Bracket vote → **Grand Paw Agent Office
  (3D hotel, shot on localhost dev — owner-gated on prod)** → Studio → PetClaw
  cinematic → landing
- `MY-AI-PET-promo-v2-bgm.mp4` — 34s 1080p sizzle reel (HTML animation; record
  via `?record=1` to hide player chrome; trim the end before the deck loops)
- `MY-AI-PET-realdemo.mp4` — LEGACY 50s compact cut; superseded by fulldemo and
  its script predates the v2 helpers — copy record-fulldemo.mjs helpers for new cuts

New deliverables follow the same naming: `~/Desktop/MY-AI-PET-<kebab-name>.mp4`.

---

## 0. Non-negotiable rules (founder + DD constraints)

1. **Real screens only.** Record the LIVE product (`https://app.myaipet.ai`,
   `https://myaipet.ai`). Never mock, composite, or fake a screen. The orange
   "DEMO TOUR" banner that appears in tour mode **stays in the shot** — it is
   proof the footage is real. (Scope: this governs product-walkthrough footage.
   The promo sizzle reel `product-demo.html` is an approved exception — a
   styled animation built from real screenshots/clips in `shots/`, never
   fabricated UI states.)
2. **Format = ONE-TAKE.** The founder explicitly rejected step-by-step /
   slideshow-style videos ("툭툭 끊기는", "완전 별로"). One continuous journey,
   fade-veil scene transitions, brisk pacing, caption-pill narration.
3. **Copyright-clean audio only.** Use the bundled self-composed BGM
   (`bgm-cozy.m4a`) or regenerate with `gen-bgm.mjs`. Never download music.
4. **Never deliver without eye-verifying frames** (§4 step 3). A past run
   shipped a video where the mascot had turned into two cats.
5. Captions are English (product language). Korean caption variant is fine if
   asked — swap the `cap("...")` strings only.

## 1. What's in this folder

| File | Purpose | Output dir |
|---|---|---|
| `record-fulldemo.mjs` | **Canonical recorder** — ~83s full journey: home → My Pet (tour) → Pet Square walk → World Cup bracket → Studio real flow → PetClaw cinematic → landing outro | `/tmp/fulldemo-rec/` |
| `record-realdemo.mjs` | ~60s compact cut (home → Studio → PetClaw → landing) | `/tmp/realdemo-rec/` |
| `record-promo.mjs` | Records `product-demo.html` (the scripted 8-scene sizzle animation) | `/tmp/promo-rec/` (or `$OUT_DIR`) |
| `capture-shots.mjs` | Refreshes ONLY the 4 product-UI stills in `shots/` (studio-top, studio-templates, home-hero, petclaw-hero) from prod + :8791. The template example jpg/mp4 assets in `shots/` come from `gen-trending-examples.mjs` on EC2 — see §7 | writes into `shots/` |

| `product-demo.html` | The sizzle-reel animation page (references `./shots/*` relatively) | — |
| `petclaw-hero.html` | Standalone PetClaw cinematic (sticker → laptop boot → connector chips); used as a scene by both recorders | — |
| `gen-bgm.mjs` | Procedural cozy lo-fi BGM synth (we own the output; zero copyright) | writes `bgm-cozy.wav` here |
| `bgm-cozy.m4a` | Ready-made 42s BGM, loudness-normalized to −21 LUFS | — |
| `shots/` | Real product stills + template example mp4s used by the sizzle reel | — |

Recording runtime ≈ the scripted wall-clock length (waits ARE the edit), so
expect ~73s (full) / ~60s (compact) / ~35s (promo) per run, plus browser startup.

## 2. One-time setup

```bash
cd "<repo>/tools/demo-video"
npm install                       # playwright (browsers usually already cached at ~/Library/Caches/ms-playwright)
npx playwright install chromium   # only if launch fails with "browser not found"
which ffmpeg || brew install ffmpeg
```

Serve this folder for the local scenes (`petclaw-hero.html`, `product-demo.html`).
Port 8791 may already be busy (a previous session's server) — and a stale server
rooted elsewhere would pass a naive 200-check while serving old files, so kill
and restart to be certain it serves THIS folder's current content:

```bash
lsof -ti:8791 | xargs kill 2>/dev/null   # clear anything already on the port
cd "<repo>/tools/demo-video"
nohup python3 -m http.server 8791 >/dev/null 2>&1 &   # nohup so it outlives the shell
# (in a Claude session, run this as a background Bash task — plain `&` in a
#  one-shot tool shell can die with the shell)
```

Sanity-check targets before recording:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8791/petclaw-hero.html   # 200
curl -s -o /dev/null -w "%{http_code}\n" https://app.myaipet.ai/studio             # 200
```

## 3. The recordable surface map

**Public (no wallet):** `/` (home), `/studio` (full demo mode incl. hover-play
template videos), marketing `https://myaipet.ai/`.

**Guest tour mode (deployed to prod):** append `?tour=1` — renders read-only
DEMO-badged previews instead of the connect-wall. Persists via sessionStorage
(`aipet_tour`), so subsequent in-session navigation stays in tour mode.
- `https://app.myaipet.ai/?section=my%20pet&tour=1` — demo pet "Dordor" + care tiles (Feed/Play/Pet are no-op toasts) + Dordor's Pond
- `https://app.myaipet.ai/?section=community&tour=1` — walkable Pet Square (ArrowKeys/WASD walk, click-to-walk, `E` to greet)
- `https://app.myaipet.ai/?section=worldcup&tour=1` — Favorites Bracket + community-prediction podium

**Still gated (owner APIs — do NOT fake these):** agent, office, workbench,
sovereignty, cards, chat. If a video needs them, record with a real logged-in
wallet or leave them out.

**Selector dependencies** (update recorders if these change):
- Template card titles come from `web/src/lib/studio/templates.ts`. Some have
  emoji prefixes (e.g. the real title is `🌕 Hanbok full moon`) — the recorders'
  `text=Hanbok full moon` works because Playwright `text=` is substring,
  case-insensitive matching, but any EXACT-match selector must include the emoji
- Director input: `input[placeholder*="One-line idea"]`
- My Pet tour care button: `button:has-text("Feed")`

## 4. The pipeline (5 steps — run all of them, in order)

```bash
KIT="<repo>/tools/demo-video"; cd "$KIT"

# 1) RECORD (Playwright headless; recording is wall-clock)
node record-fulldemo.mjs          # prints VIDEO:/tmp/fulldemo-rec/<hash>.webm

# 2) CONVERT webm → h264 mp4
ffmpeg -y -i <that>.webm -c:v libx264 -preset medium -crf 21 -pix_fmt yuv420p \
  -movflags +faststart /tmp/demo.mp4

# 3) EYE-VERIFY (MANDATORY): extract a contact sheet and actually LOOK at it
rm -rf /tmp/frames && mkdir -p /tmp/frames          # ALWAYS clear first — stale fNN.jpg
                                                    # from a longer previous run would get
                                                    # silently tiled in and corrupt the check
ffmpeg -y -i /tmp/demo.mp4 -vf "fps=1/7,scale=440:-1" /tmp/frames/f%02d.jpg
#   fps=1/7 suits ~80s+ videos; for cuts under ~60s use fps=1/5 so short scenes
#   (e.g. the landing outro) can't fall between samples
cd /tmp/frames && ffmpeg -y -i f%02d.jpg -vf "tile=4x4" -frames:v 1 /tmp/contact.jpg
#   -frames:v 1 is required: with >12 frames a bare tile=4x3 tries to emit a 2nd
#   output image and errors on the single-name pattern. tile=4x4 holds up to 16.
# → Read /tmp/contact.jpg with the Read tool. Check: every scene present, captions
#   legible, no blank/white MID-VIDEO frames, no wrong content. NOTE: trailing
#   solid-black tiles at the END of the grid are just empty filler cells (frame
#   count < grid size) — expected, not a failure. Fix + re-record if bad.

# 4) MUX BGM (loop the 42s bed to fit, duck to bed level, fade out at the end)
cd "$KIT" && D=$(ffprobe -v quiet -show_entries format=duration -of csv=p=0 /tmp/demo.mp4)
ffmpeg -y -i /tmp/demo.mp4 -stream_loop -1 -i bgm-cozy.m4a -shortest \
  -map 0:v -map 1:a -c:v copy -c:a aac -b:a 128k \
  -af "volume=0.9,afade=t=out:st=$(echo "$D - 1.4" | bc):d=1.4" \
  ~/Desktop/MY-AI-PET-<name>.mp4

# 5) VERIFY + DELIVER
ffprobe -v quiet -show_entries stream=codec_type -of csv=p=0 ~/Desktop/MY-AI-PET-<name>.mp4
# must print BOTH "video" and "audio"; then: open ~/Desktop/MY-AI-PET-<name>.mp4
```

## 5. Recorder anatomy (how to write a new scene)

Each recorder injects three helpers via `arm()` after every page load —
**re-arm after every `goto`** (page loads wipe injected DOM):

- `cap("text")` — bottom-center caption pill (dark ink `rgba(33,26,18,.92)`,
  cream text `#FCE9CF`, 17px, fade+rise). `cap(null)` hides it.
- `glide(dy, ms)` — rAF ease-in-out smooth scroll. Use instead of
  `mouse.wheel` (wheel jumps read as choppy slideshow — the exact founder complaint).
- `scene(url)` — fade a dark veil in (420ms) → `goto` → re-`arm()` → fade out.
  This is what makes page loads invisible. Default `waitUntil: "networkidle"`;
  pass `{waitUntil:"load"}` / `"domcontentloaded"` for pages with persistent
  polling (networkidle can hang on them).

Pacing values that landed with the founder: captions hold 1.5–2.4s; hover-play
holds ~4.2s (real mp4 plays in-card); typing via
`pressSequentially(text, {delay: 42})`; Pet Square walking via
`page.keyboard.down/up("ArrowRight")` held 0.7–1.1s per leg. Total target:
compact ≈60s, full ≈85s. When in doubt, pace FASTER — "조금 더 빨리" was
explicit feedback.

v3 additions:
- **1080p default** (viewport + recordVideo 1920×1080; promo stage auto-scales
  via its `--s` transform).
- **GPU flags are MANDATORY**: default headless software-GL renders the Grand
  Paw WebGL diorama black and poisons every later frame. All recorders launch
  with `--enable-gpu --use-angle=metal --enable-webgl --ignore-gpu-blocklist`.
- Hotel scene shoots the REAL shipped Agent Office on localhost:3000 (dev
  fixture data; prod keeps it wallet-gated) — dev server must be running, and
  the Next dev-tools badge is hidden via `nextjs-portal{display:none}`.

v2 helpers in record-fulldemo.mjs (frame-audit hard lessons — reuse them):
- **Fake cursor + click ripple** injected in `arm()` (Playwright records no OS
  cursor; without it clicks are invisible causality).
- **`scene(url, {ready})`** keeps the dark veil up until a content selector is
  visible — kills blank-paint flashes on page loads.
- **`sceneNav(label, ready)`** switches app sections by clicking the real
  `button.nav-btn` (client-side setSection) — zero reload, overlays survive.
- **`punch(locator, on)`** camera punch-in: scale the template GRID (stable),
  NOT the card — the card's inline styles get wiped when its hover video mounts.
- Always `__setCap(null)` before raising the veil (else the caption floats over black).
- Frame the interactive element (scrollIntoView + center) BEFORE its caption:
  the audit's worst finding was captions narrating content still below the fold.

## 6. BGM: regenerate / retune

Two ready-made tracks — give different videos different music (founder
feedback: every video sounding identical reads as lazy):
- `bgm-cozy.m4a` — 42s loop, 72 BPM lo-fi rhodes (gen-bgm.mjs)
- `bgm-adventure.m4a` — 90s through-composed (intro→A→B lift→A2→outro), 92 BPM
  kalimba/music-box (gen-bgm2.mjs). No loop seam up to 90s videos; for short
  cuts, mux from an offset (`-ss 31.3` before the audio `-i` = the B-section
  lift) so two videos don't share an identical opening.

`bgm-cozy.m4a` is ready to use. To change the mood, edit `gen-bgm.mjs` knobs —
`BPM` (72), `CHORDS` (Fmaj7→Am7→Dm9→Cmaj7 midi arrays), `PENTA` melody pool,
per-part volumes, deterministic `seed` — then:

```bash
node gen-bgm.mjs                                                     # → bgm-cozy.wav (42s)
ffmpeg -y -i bgm-cozy.wav -af "loudnorm=I=-21:TP=-2" -c:a aac -b:a 160k bgm-cozy.m4a
```

Honesty note: Claude cannot hear the result. Keep levels conservative (bed
music, not foreground) and tell the founder they are the judge of the mix.

## 7. Hard-won gotchas

- **Recording is wall-clock.** Waits ARE the edit. A hidden/backgrounded tab
  freezes rAF/JS timers but CSS animations keep running on wall clock — this
  skews screenshots, not Playwright recordings (Playwright pages render).
- **Frame-verify, always.** Stills lie about video (hover-play can't be
  confirmed from one frame) but they catch the big failures: wrong subject,
  blank scenes, missing captions, stuck veil.
- **Veil discipline:** end the video by fading the veil IN (clean out-point),
  and never `goto` without `scene()` or you get a hard white flash.
- **Prod is the source of truth.** Local dev bypasses WalletGate entirely
  (`isDev` short-circuit), so tour mode is only visible on prod builds.
- If regenerating `shots/` template assets: stills/videos are made by
  `web/scripts/gen-trending-examples.mjs` **run on the EC2 box** (local GROK
  key is stale). Grok model names: `grok-imagine-image` (+
  `reference_image_url`), `grok-imagine-video`. Anchor images must be LIVE
  https URLs, and every motion prompt needs the IDENTITY LOCK prefix (fluffy
  white Pomeranian, "Absolutely NO humans…") or the subject drifts.
- Deliverables always go to `~/Desktop` and get `open`-ed for the founder.

## 8. Kickoff prompt for a fresh session (paste-ready)

> Read `tools/demo-video/HANDOFF.md` and follow it exactly. Produce a
> <length>s one-take demo video of <sections/flow>, with caption narration and
> the bundled cozy BGM, eye-verify the contact sheet, and deliver the mp4 to
> `~/Desktop`. Do not skip pipeline steps 3 and 5.
