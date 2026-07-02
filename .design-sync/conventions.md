# Collectible Editorial — build conventions

MY AI PET's design system: every pet is a foil-stamped collectible artifact, every screen a warm editorial print piece. Warm cream, terracotta, gold foil — **never dark-mode UI, never neon/aurora/glassmorphism**.

## Setup

No provider is required — components are self-contained. The shipped `styles.css` already sets the page ground (`body { background: var(--ed-field) }`, warm cream `#ECE4D4`) and loads the three brand fonts (Bricolage Grotesque / Hanken Grotesk / Space Mono) with the `--font-display/--font-body/--font-mono-ed` variables the tokens depend on. Two components position themselves absolutely and need a `position: relative` parent: `GoldSeal` (stamps the top-right corner of that parent) and `Motes` (fills it with rising golden motes). `CollectibleFrame`'s seal and floating shadow overflow its box — give it ~28–44px of breathing room. Image props (`photoUrl`, `card.avatarUrl`) take absolute URLs; `https://app.myaipet.ai/mascot.jpg` is the production mascot stand-in.

## Styling idiom

Inline `style={{}}` + CSS custom properties + a small utility-class vocabulary. No Tailwind, no CSS modules — don't invent class names outside this list.

Tokens (`var(--ed-*)`): surfaces `--ed-field #ECE4D4`, `--ed-paper #FBF6EC` (cards), `--ed-inset #F5EFE2`; ink `--ed-ink #211A12`, `--ed-ink70`, muted `--ed-muted/--ed-muted2`, mono-label `--ed-mono #9A7B4E`, hairline `--ed-hair`; brand `--ed-terra #BE4F28`, `--ed-terra-sub`, cream-on-terracotta `--ed-cream-on/--ed-cream-on2`, CTA `--ed-cta1 #F49B2A`/`--ed-cta2 #E27D0C`; sections `--ed-catch #1A7E68` (teal), `--ed-studio #6B4FA0` (purple); stats `--ed-happy/--ed-energy/--ed-bond/--ed-thrive`; rarity `--ed-rare-common/-rare/-epic/-legend`; shadows `--ed-shadow-card` (soft card), `--ed-shadow-float` (deep floating), `--ed-shadow-dark`. **Never hard offset or glow shadows.**

Type: `fontFamily: 'var(--ed-disp)'` = Bricolage (display, 700–800, tight letterSpacing), `'var(--ed-body)'` = Hanken (body), `'var(--ed-m)'` = Space Mono (eyebrows/labels: ~10px, fontWeight 700, letterSpacing '.12em', uppercase).

Classes: finishes `ed-foil-text` (gold-foil gradient text), `ed-foilstrip`, `ed-holo-sheen` + `ed-gloss` (absolute overlays inside an image well), surface dressing `ed-grain`/`ed-glow`/`ed-vignette`; motion `ed-float` (frame bob), `ed-rise`, `ed-section-enter`, `mp-enter` + `mp-enter-1..5` (stagger), `ed-card-hover` (lift), `ed-press`, `mp-lift`, `ed-skeleton` (loading shimmer); button `mp-btn-primary` (the system CTA). Keyframes you may reference: `edRiseIn`, `edPopIn`, `edScrimIn`, `edPanelIn`, `sealPress`, `edFoilShift`, `edTickerSlide`, `edTypingDot`, `slideIn`.

CTA recipe (only conversion buttons): `background: 'linear-gradient(180deg,#F49B2A,#E27D0C)', color: '#FFF8EE'`. Secondary = ink `#211A12` on paper; tertiary = ghost with `--ed-hair` border. Warm-dark panels `#1E1710` with foil gold `#E8C77E` text are the sanctioned "dark tile" (terminals, card vaults).

## Where the truth lives

Read `styles.css` before styling — it is the app's real stylesheet (all tokens, classes, keyframes). Per-component API: each `<Name>.d.ts`; usage patterns: each `<Name>.prompt.md`.

## Idiomatic composition

```jsx
<div style={{ background: 'var(--ed-paper)', borderRadius: 22, padding: 24, boxShadow: 'var(--ed-shadow-card)' }}>
  <div style={{ fontFamily: 'var(--ed-m)', fontSize: 10, fontWeight: 700, letterSpacing: '.14em', color: 'var(--ed-mono)', textTransform: 'uppercase' }}>Companion File</div>
  <div style={{ display: 'flex', gap: 28, alignItems: 'center', marginTop: 16 }}>
    <div style={{ padding: '28px 32px 44px' }}>
      <CollectibleFrame photoUrl="https://app.myaipet.ai/mascot.jpg" level={5} speciesLabel="POMERANIAN" elementLabel="GRASS" width={260} />
    </div>
    <div>
      <h2 style={{ fontFamily: 'var(--ed-disp)', fontWeight: 800, fontSize: 34, color: 'var(--ed-ink)', letterSpacing: '-0.02em' }}>Meet Mochi</h2>
      <button className="ed-press" style={{ marginTop: 14, border: 'none', borderRadius: 12, padding: '12px 20px', background: 'linear-gradient(180deg,#F49B2A,#E27D0C)', color: '#FFF8EE', fontFamily: 'var(--ed-body)', fontWeight: 600, cursor: 'pointer' }}>Adopt your pet</button>
    </div>
  </div>
</div>
```
