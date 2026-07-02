# design-sync notes — MY AI PET (Collectible Editorial)

- This is a Next.js **app**, not a component library — no dist. The bundle entry is the committed barrel `web/ds-entry.ts`, passed via `--entry web/ds-entry.ts` (synth-entry discovery does NOT work here: `node_modules/web` doesn't exist, and `--entry` is what makes PKG_DIR resolve to `web/`).
- Converter invocation: `node .ds-sync/package-build.mjs --config .design-sync/config.json --node-modules web/node_modules --entry web/ds-entry.ts --out ./ds-bundle` (driver `resync.mjs` takes the same flags).
- `cfg.cssEntry` must be **self-contained** (the converter copies it verbatim; relative `@import`s break). Hence `cfg.buildCmd` concatenates `web/ds-sync-head.css` (Google Fonts `@import` — must precede all rules) + `web/src/app/globals.css` (the real app stylesheet, whole) + `web/ds-sync-tail.css` (declares `--font-display/--font-body/--font-mono-ed` on body + editorial field background) into the gitignored `web/.ds-css-entry.css`. Run buildCmd BEFORE every converter/driver run.
- Fonts: the app loads Bricolage Grotesque / Hanken Grotesk / Space Mono via **next/font**, which doesn't exist in the design environment. The head/tail CSS pair recreates it (remote Google import + body-scoped `--font-*` vars). `[FONT_REMOTE]` for Hanken/Space Mono is expected and correct. CRITICAL: the `--ed-*` font tokens reference `var(--font-*)` and are body-scoped — if the `--font-*` vars are missing, every editorial font silently falls back (this exact bug once shipped in the app).
- **Icon component is deliberately excluded** (removed from `componentSrcMap` + barrel): it hardcodes app-served `/icons/<name>.png` paths that 404 on any non-app origin, so it would render broken images in every design. If it should ever sync, it first needs an absolute-URL prop upstream.
- Excluded by design: screen components (MyPetEditorial, ChatEditorial, WorldCupPet, CardDeck — they self-fetch APIs), Nav (needs wagmi/RainbowKit providers), Sticker (superseded Printed Stock system).
- Preview image assets use production URLs (`https://app.myaipet.ai/mascot.jpg` — verified 200). `photoUrl`/`avatarUrl` are props, so designs can pass any absolute URL.
- GoldSeal and Motes are absolutely-positioned — previews (and any composition) must provide a `position: relative` parent. CollectibleFrame's seal/shadow overflow its box → previews pad ~28–44px.
- `cfg.overrides.CollectibleFrame = {cardMode: "column"}` — the Hero story is wider than a grid cell ([GRID_OVERFLOW], applied per the warn's suggestion).

## Known render warns
- `[FONT_REMOTE] "Hanken Grotesk", "Space Mono"` — by design (Google Fonts at runtime), see above.

## Re-sync risks
- `web/.ds-css-entry.css` is **generated**: a stale copy silently ships old tokens. Always re-run `cfg.buildCmd` first (globals.css changes often — it's the live app stylesheet).
- Preview compositions inline realistic `CardData` — if `web/src/lib/tcg/card.ts`'s `CardData` gains required fields, `previews/PetCard.tsx` needs updating (tsc won't guard the previews).
- Production asset URLs (`app.myaipet.ai/mascot.jpg`) are network-fetched at render time; if the domain or file moves, previews show broken images with no local error.
- Motes' preview captures the resting frame of an animation-driven ambient effect — faint dots are the honest static state, not a regression.
- Toolchain: node v24 via nvm (`export PATH=/Users/max/.nvm/versions/node/v24.14.1/bin:$PATH`); playwright chromium-headless-shell v1228 in `~/Library/Caches/ms-playwright`.
