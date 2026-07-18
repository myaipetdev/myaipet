# MY AI PET — Economy & Business-Model Analysis

_Numbers-grounded pass. Every credit price and vendor cost below is read from the
live code (not invented). Sources cited inline. Written 2026-07-09.
Updated: 2026-07-13 — the Veo 3 reprice recommended below has since landed in
code (`providers.ts`: 250 → **400 cr**, `usdPerRun` $2.40 → **$4.50**, ETA Q4 2026);
tables and the P0 section now reflect the repriced values._

> **Launch-state correction (2026-07-18):** this is enablement economics, not
> current revenue. External payment sales are disabled
> (`PAYMENTS_ENABLED=false`), as are subscription sales. No USDT credit pack or
> other external paid action is currently sellable.

---

## TL;DR (the thesis)

**Studio pay-per-creation credits is the proposed primary revenue engine after
the separate payment-enablement gates are cleared.** Both external payment sales
(`PAYMENTS_ENABLED=false`) and subscription sales
(`SUBSCRIPTION_SALES_ENABLED=false`, `studio/subscription/route.ts:33`) are
disabled at launch, so the three USDT credit packs generate no current revenue.

The "main BM feels weak" instinct is half-right: the _mechanism_ (credits) is
sound and margin-positive, but the **framing** is weak — the product talks like a
free Tamagotchi with a shop bolted on, when the real engine is **"pay to turn
your pet into video."** Video is the premium SKU (25–50 cr = $1.25–$2.50 a clip
at ~65–85% gross margin). Everything else (chat, care, streaks, cards) is
free/cheap engagement whose job is to feed video demand.

**No external paid action is currently sold.** Among the actions priced for later
enablement, the one margin-negative risk this doc
originally flagged — a _locked_ model (Veo 3) priced at 250 cr against a real
~$4–6 vendor cost — has been **repriced in code to 400 cr / $4.50 `usdPerRun`**
and remains correctly `comingSoon`. See the P0 section.

---

## 1. The price/cost ledger (as coded)

### Credit packs — the credit↔USDT anchor
`src/app/api/credits/purchase/route.ts:8`

| Pack | Credits | USDT | **$ / credit** |
|------|---------|------|----------------|
| starter | 100 | $5 | **$0.0500** |
| creator | 500 | $20 | **$0.0400** (−20%) |
| pro | 2000 | $50 | **$0.0250** (−50%) |

The pro pack **halves** the effective credit value. Margins below are shown at
both the retail anchor (**$0.05**) and the worst case a user can realize
(**$0.025**, bulk pro pack). Anything that stays positive at $0.025 is safe.

### Studio model catalog — `src/lib/studio/providers.ts`
`creditsPerRun` = what we charge; `usdPerRun` = our internal wholesale estimate.

| Model | kind | credits | usdPerRun (code) | catalog status |
|-------|------|---------|------------------|-------|
| grok-imagine | image | 5 | $0.03 | ✅ |
| flux-schnell | image | 3 | $0.003 | ✅ |
| flux-dev | image | 8 | $0.025 | ✅ |
| flux-pulid | image | 12 | $0.05 | ✅ |
| grok-imagine-video | video | 25 | $0.15 | ✅ |
| wan-2.1 | video | 25 | $0.18 | ✅ |
| seedance-1-lite | video | 40 | $0.30 | ✅ |
| kling-1.6-standard | video | 40 | $0.35 | ✅ |
| kling-image-to-video | video | 50 | $0.45 | ✅ |
| kling-1.6-pro | video | 120 | $1.20 | 🔒 comingSoon |
| minimax-hailuo | video | 90 | $0.85 | 🔒 comingSoon |
| veo-3 | video | 400 | $4.50 | 🔒 comingSoon (Q4 2026) |

### Non-Studio per-action credit charges (Grok/LLM-backed)

| Action | credits | source | backend cost |
|--------|---------|--------|--------------|
| Pet agent loop (plan-execute) | 5 (refunded if no work) | `pets/[petId]/agent/route.ts:34` | Grok `grok-4-1-fast-non-reasoning`, ~5–15 calls |
| Pet Date | 20 | `pet-date/route.ts:14` | Grok chat, ~1 call |
| Pet generate — image | 5 (0 if "Original") | `pets/[petId]/generate/route.ts:65` | grok-imagine |
| Pet generate — video 3s / 5s / 10s | 15 / 30 / 60 | `pets/[petId]/generate/route.ts:14` | video backend |
| Card illustrate (Codex sticker) | 5 | routes through `studio/generate` grok-imagine (`CardDeck.tsx:209`) | grok-imagine $0.03 |

### Grok/LLM real costs (for the LLM-backed actions)
`src/lib/llm/router.ts` defaults to xAI Grok and can fail over once to the
allowlisted OpenAI `gpt-5.6-luna` text model when xAI is transiently unavailable
or spend-limited. The xAI task defaults are:
`grok-3-mini` (chat), `grok-3-mini-fast` (judge/summarize/persona),
`grok-4-1-fast-non-reasoning` (reason). These are xAI's cheap tier
(order ~$0.20–0.50 per 1M tokens). A single chat turn (~1–4K tokens) is a
fraction of a cent; even a 10–15-call agent loop lands at ~**$0.02–0.05**.
LLM cost is never the binding constraint — **fal.ai video is.**

### fal.ai real vendor prices — assumptions
Public fal.ai list prices drift; these are realistic 2025–26 per-clip (5s/720p
unless noted) ranges used to sanity-check the coded `usdPerRun`:

| Model | fal public (approx) | code says | verdict |
|-------|--------------------|-----------|---------|
| FLUX schnell | ~$0.003 / img | $0.003 | accurate |
| FLUX dev | ~$0.025 / img | $0.025 | accurate |
| FLUX PuLID | ~$0.04–0.05 / img | $0.05 | conservative |
| Seedance 1.0 Lite | ~$0.18 / 5s | $0.30 | **conservative (safe)** |
| Kling 1.6 std t2v | ~$0.25 / 5s | $0.35 | conservative (safe) |
| Kling i2v std | ~$0.25–0.45 / 5s | $0.45 | conservative (safe) |
| **Wan 2.1 i2v** | ~$0.20–0.40 / 5s | **$0.18** | ⚠️ **may UNDERstate real cost** |
| MiniMax Hailuo 02 pro | ~$0.48 / 6s | $0.85 | conservative |
| Kling 1.6 pro | ~$1.00–1.40 / 10s 1080p | $1.20 | roughly right |
| **Veo 3 (8s, native audio)** | ~$3.20–6.00 / clip | **$4.50** | mid-range (was $2.40 — fixed) |

---

## 2. MARGIN TABLE — per paid action

Gross margin = (revenue − vendor cost) / revenue. Two revenue columns: retail
($0.05/cr) and bulk pro-pack ($0.025/cr). **GM@bulk is the number that matters** —
it's the floor a heavy user forces.

### Catalog-enabled actions (external sale disabled at launch)

| Action | cr | $ @0.05 | $ @0.025 | vendor cost | **GM@0.05** | **GM@bulk** |
|--------|----|---------|----------|-------------|-------------|-------------|
| FLUX schnell (img) | 3 | $0.15 | $0.075 | $0.003 | 98% | 96% |
| FLUX dev (img) | 8 | $0.40 | $0.20 | $0.025 | 94% | 88% |
| FLUX PuLID (img) | 12 | $0.60 | $0.30 | $0.05 | 92% | 83% |
| Grok Imagine (img) | 5 | $0.25 | $0.125 | $0.03 | 88% | 76% |
| Card illustrate | 5 | $0.25 | $0.125 | $0.03 | 88% | 76% |
| Pet gen — image | 5 | $0.25 | $0.125 | $0.03 | 88% | 76% |
| Grok Imagine video | 25 | $1.25 | $0.625 | $0.15 | 88% | 76% |
| Wan 2.1 video | 25 | $1.25 | $0.625 | $0.18* | 86% | 71% |
| Seedance Lite video | 40 | $2.00 | $1.00 | $0.30 | 85% | 70% |
| Kling 1.6 std video | 40 | $2.00 | $1.00 | $0.35 | 82% | 65% |
| Kling i2v video | 50 | $2.50 | $1.25 | $0.45 | 82% | 64% |
| Pet gen — video 5s | 30 | $1.50 | $0.75 | $0.15–0.45 | 70–90% | 40–80% |
| Pet Date (LLM) | 20 | $1.00 | $0.50 | ~$0.01 | 99% | 98% |
| Agent loop (LLM) | 5 | $0.25 | $0.125 | ~$0.02–0.05 | 80–92% | 60–84% |

\* Wan's coded $0.18 may understate real fal cost. At a realistic $0.40 it drops
to **68% @retail / 36% @bulk** — still positive but thin; verify against live fal.

**Every modeled catalog action is margin-positive, even at the bulk $0.025/cr
floor.** The worst modeled case is Kling i2v at 64% GM@bulk. This is a
pre-enablement pricing result, not evidence of live sales.

### Locked actions (comingSoon) — priced for when unlocked

| Action | cr | $ @0.05 | $ @0.025 | vendor (code / real) | GM@0.05 | **GM@bulk (real cost)** |
|--------|----|---------|----------|----------------------|---------|--------------------------|
| MiniMax Hailuo | 90 | $4.50 | $2.25 | $0.85 / ~$0.48 | 81% | 79% |
| Kling 1.6 pro | 120 | $6.00 | $3.00 | $1.20 / ~$1.40 | 80% | **53%** |
| **Veo 3** (repriced) | 400 | $20.00 | $10.00 | $4.50 / ~$4–6 | 78% | **40–60%** (55% at coded cost) |

---

## 3. P0 — margin-negative flag

**No catalog-enabled action is modeled as margin-negative.** The one locked
action that was —

> **P0 — RESOLVED in code: Veo 3 was priced at 250 cr with `usdPerRun` $2.40,
> which was break-even-to-negative at bulk-pack pricing** (a pro-pack buyer
> would pay $6.25 against a realistic ~$4–6/clip fal Veo-3-with-audio cost —
> as little as 4% gross, negative at the top of the range). Per this doc's
> recommendation it has been **repriced to 400 cr with `usdPerRun` = $4.50**
> (`providers.ts`, comment cites this doc), keeping ≥ 40% GM even at the bulk
> floor and the top of the real cost range. It remains `comingSoon:true`
> (ETA Q4 2026), so nothing bleeds today. Residual: if live fal cost lands at
> the $6 top end, 400 cr is below the ≥50%-GM rule floor of 480 cr — confirm
> live pricing before unlock.

One data-hygiene fix remains (not money-losing today, but it makes the ledger lie):
- **Wan 2.1 `usdPerRun` = $0.18** likely understates fal. Refresh from live pricing.

---

## 4. Business-model recommendation

### Primary revenue engine
**Studio pay-per-creation credits, with video as the hero SKU, after payment
enablement.** The code contains this metering model, but external sales remain
launch-disabled; the recommendation applies only after the payment readiness
checklist is cleared. Positioning for that later state:

- **Companion = free.** Chat, care, streaks, season points, catching, TCG cards
  earned deterministically. This is the retention/engagement loop. Never paywall
  the pet or its memory (matches the standing "paywall the creation + recall,
  never the memory" posture).
- **Studio = metered, with monetization gated.** Every image/video generation
  burns credits, but users cannot buy credits externally at launch. Video
  (25–50 cr) is where the money is; images (3–12 cr) are the on-ramp and the
  iteration surface that keeps users buying.
- **Companion+ subscription = optional access gate, additive not primary.** Note
  the current design is smart: the subscription gates _tier + monthly quota_ but
  **credits are still charged on top** (`studio/generate/route.ts:93–120`). So a
  subscription can never become an all-you-can-eat that goes underwater — it's
  pure additive margin. Keep it that way (see open decisions).

### How credits ↔ USDT should be priced

The current anchor ($0.05/cr) is right. The problem is the **50%-off pro pack**,
which is the sole driver of every "thin" number in the margin table. Recommend
softening the top-tier discount so the worst-case realized price floors at
**~$0.03/cr** instead of $0.025:

| Pack | Now | **Recommended** | $/cr |
|------|-----|-----------------|------|
| Starter | 100 / $5 | 100 / $5 | $0.050 |
| Creator | 500 / $20 | 500 / $20 | $0.040 |
| Pro | 2000 / $50 | **1500 / $50** _or_ 2000 / $60 | **$0.033 / $0.030** |

This lifts every video's GM@bulk by ~10 points (Kling i2v 64% → 73%) with almost
no perceived-value loss (a 33–40% bulk discount still reads as generous). If
acquisition matters more than margin near-term, keep 2000/$50 as a future
enablement promo but treat $0.025 as the floor the per-action prices must survive
— which, per the table, they already do for every catalog-enabled SKU before
payment enablement.

### How to set per-API-call credit values (the rule)

So no future model is ever accidentally sold below cost, price each action by a
**fixed multiple of vendor cost, measured at the bulk floor**:

> **credits(action) = ceil( vendorUSD / 0.0125 )**
> i.e. charge so vendor cost ≤ 50% of bulk-pack revenue → **≥50% GM guaranteed
> even at the deepest discount.** Target 3–4× cost (GM ≥ 66–75%) for video.

Sanity check vs coded enablement prices (using the modeled $0.025 floor):
- Kling std $0.35 → rule floor = 28 cr; charged **40** ✓ (comfortable)
- Kling i2v $0.45 → rule floor = 36 cr; charged **50** ✓
- Grok img $0.03 → rule floor = 3 cr; charged **5** ✓
- Veo 3 $4–6 (real) → rule floor = **320–480 cr**; charged **400** (was 250 ✗) →
  ✓ at the coded $4.50 (floor 360) and mid-range real cost; still short of the
  480-cr floor if fal lands at $6 — recheck before unlock.

Adopt the rule as a code invariant (a unit test asserting
`creditsPerRun ≥ ceil(usdPerRun / 0.0125)` for every non-locked model would catch
the next Veo-3-style mispricing at PR time).

---

## 5. Open decisions for the founder

1. **Pro-pack discount depth.** Ship 1500/$50 (margin-safe) or keep 2000/$50 as a
   deliberate acquisition subsidy? Every thin margin number traces to this one knob.
2. **Subscription = quota-only vs credit-inclusive.** Today Companion+ gates
   quota but still charges credits — that's why it can't go underwater. If you
   ever make a tier _include_ generations, the math breaks: pro @ $4.99/mo with a
   30-video quota = up to $9–13.50 of fal cost. **Recommend: keep credits-on-top;
   sell the subscription as "unlock the good models + higher caps," not as
   included generations.** Decide before flipping `SUBSCRIPTION_SALES_ENABLED`.
3. **When to unlock Veo 3 / Kling Pro / Hailuo.** The Veo 3 reprice (now 400 cr,
   `usdPerRun` $4.50) is done in code; before unlocking, confirm live fal cost —
   at the $6 top of the range, 400 cr is under the ≥50%-GM rule floor (480 cr).
4. **Refresh `usdPerRun` from live fal pricing** (Wan 2.1 especially — Veo 3's
   is now $4.50, mid-range), and add the margin-invariant test so the catalog
   can't drift negative silently.
5. **Failed-generation leakage.** Credits are correctly refunded on failure
   (`studio/generate` catch path), but confirm fal doesn't bill us for
   submitted-then-failed jobs; if it does, that's silent cost with no revenue.
6. **Free-tier vendor exposure.** Free users can access only eligible free
   models. Wan is pro-tier and unavailable without membership, while membership
   sales are disabled. Before enablement, verify the current catalog and vendor
   costs for every free model, then keep the free video quota tight.

---

## Appendix — file map (where each number lives)

- Credit packs: `web/src/app/api/credits/purchase/route.ts:8`
- Studio catalog (credits + usdPerRun): `web/src/lib/studio/providers.ts:47`
- Subscription tiers + limits: `web/src/lib/studio/providers.ts:280`
- Subscription sales gate (OFF): `web/src/app/api/studio/subscription/route.ts:33`
- Studio charge path (sub gate + credits both apply): `web/src/app/api/studio/generate/route.ts:93`
- Agent loop cost (5 cr): `web/src/app/api/pets/[petId]/agent/route.ts:34`
- Pet Date cost (20 cr): `web/src/app/api/pet-date/route.ts:14`
- Pet generate image/video costs: `web/src/app/api/pets/[petId]/generate/route.ts:14,65`
- Card illustrate → studio/generate grok-imagine: `web/src/components/CardDeck.tsx:203`
- LLM routing (Grok defaults): `web/src/lib/llm/router.ts:59`
- Premium shop (USDT/credit dual-priced items): `web/src/lib/premium.ts:19`
