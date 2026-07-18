# MY AI PET — Points Economy Policy: Farm-Tolerant, Cost-Shielded

_Updated: 2026-07-16. Companion to `docs/ECONOMY.md` (paid-SKU margins). This doc
is the issuance half: what we give away, to whom, and what it may cost us.
Grounded in the 2026-07-16 issuance audit and the 1,000-wallet red-team exercise;
file:line references point at `web/src/`._

> **Launch-state correction (2026-07-18):** season points remain off-chain and
> non-financial. External payments and referrals are disabled
> (`PAYMENTS_ENABLED=false`, `REFERRALS_ENABLED=false`); dollar values and
> referral grants below are enablement models, not currently offered products.
>
> **Historical-baseline warning:** the `Current` columns below preserve the
> pre-hardening red-team snapshot and are not the current release state. The
> launch release already implements arena first-clear/caps, a durable catch
> vision guard, a signed 50+50 starter grant, the authenticated skill cap, and
> earned-credit/video/vision caps; referrals remain disabled. Use the deploy
> checklist and committed contract tests as the live source of truth.

---

## 0. Doctrine (one paragraph)

**Protect COST, not COUNT.** Wallet growth — including scripted wallet growth —
is a welcome traction signal and is deliberately NOT blocked. Season points are
non-financial recognition with **no redemption path and no token** (enforced in
code: `lib/seasonRewards.ts:13` — no on-chain anchoring, on purpose). Therefore
points issuance costs us ≈ $0 and can stay generous. The only thing that can
hurt us is a **call that spends real Grok/fal money without a purchased credit
behind it**. Every rule below flows from the red-team's asymmetry finding:
per-entity limits (IP, token, pet, wallet) never stop a 1,000-wallet adversary —
only (a) making expensive calls consume money the user paid, and (b) small
**global shared budgets** on whatever remains free, actually change farmer ROI.

The two lanes:

| | Lane A — recognition | Lane B — metered utility |
|---|---|---|
| Currency | season_points (non-financial) | credits (modeled after enablement: $0.05 retail / $0.025 bulk floor) |
| Marginal $ to us | ~$0 (Postgres rows) | ~$0.006/credit worst-case when spent (grok video/img), up to $0.45 for kling i2v |
| Farmers | **welcome** — they are DAU | tolerated, but every call is paid or budget-capped |
| Defense | per-wallet daily caps + snapshot-time cluster weighting | credits-first, global LLM/vision budgets as backstop |

---

## 1. LANE A — zero-marginal-cost actions: farmers welcome

Actions whose entire cost is a DB write. Farm these all day; it's pennies of
Postgres and it fills the DAU/leaderboard/community surfaces we want alive.

**In Lane A:** interact (feed/play/talk), check-in streak, missions,
card_battle, alley_battle, wild_catch (map spawns), worldcup predict, community
(comment/like/follow), Lo-Fi Square presence, extension care (ext_care /
ext_welcome), referral **visits/landing** (points only, see §1.4), evolve,
level_up, arena **season points** (not arena credits — those are Lane B, §2.3).

### 1.1 Issuance rules

- Per-action daily caps stay as coded (`DAILY_POINT_CAPS`, `seasonRewards.ts:42`)
  — they already work; the red-team confirmed a maxed wallet takes ~901 pts/day
  and that this costs us ≈ $0.
- **Close the two cap bypasses** (integrity, not money): `level_up` (+50,
  uncapped, `seasonRewards.ts:10`) and arena PvE season points (direct
  increment up to 6,000/day, `arena/pve/route.ts:199`) must route through
  `awardPointsCapped` so a wallet's max/day is bounded and the admin issuance
  metric (`admin/overview`) stops undercounting. New caps: `ap:level_up` 150/day,
  `ap:arena` 200/day.
- **Whole-wallet diminishing returns** (leaderboard meaningfulness, not cost):
  add a daily aggregate ceiling on season points per wallet. First **500**
  pts/day credit at 100%; the next tranche credits at **50%**; hard stop at
  **750 effective pts/day**. Implemented as a final multiplier inside
  `awardPointsCapped` reading the wallet's `ap:*` daily sum. A human doing 3–4
  favorite activities is untouched (~200–450/day); a script maxing all 16
  actions gets ~750 instead of ~1,100+ — compression, not punishment.

### 1.2 Explicitly NO sybil blocking in Lane A

No CAPTCHA on nonce/verify, no KYC, no per-IP account throttles beyond the
existing abuse-grade limits (20/min nonce). A 1,000-wallet farm earning
capped points on all wallets is, per founder posture, **a feature**: 1,000
wallets × capped DB writes = traction data at ~zero cost. We do not spend
engineering fighting free activity. (The red-team's own conclusion: don't
throttle the cost-less activity that makes the numbers look alive.)

### 1.3 Why caps at all, if points are worthless?

Two reasons only: (1) leaderboard legibility — an uncapped grinder at 50,000
pts/day makes rank meaningless for everyone else, killing the recognition value
that IS the product; (2) honest admin metrics — issuance must be countable.
Neither reason is anti-farmer; both are pro-leaderboard.

### 1.4 Referral (currently unwired — GET-only route + `Referral` model)

Wire it Lane-A-first: **+100 season points to both sides** when the referred
wallet adopts its first pet. The credit component (Lane B money) is small and
milestone-gated: **+25 credits to the referrer only**, released when the
referred wallet completes a **day-3 check-in**. Exposure: 25 cr × $0.006 =
$0.15 per successful referral, and a self-referral farm has to keep 2 wallets
alive 3 days per $0.15 — negative ROI vs proxy costs, no blocking needed.
No credits to the referred side (they already get the starter grant, §2.2).

### 1.5 Lane A parameter summary

| Action | pts | Daily cap (per wallet) | Change? |
|---|---|---|---|
| interact | 5 | 150 | keep |
| check-in streak | 5→50 d1–d7 | 1/day | keep |
| missions | 5–25, +25 bonus | ~30–110 | keep (MANUAL_RANK_CAP=2 stays) |
| card_battle / alley_battle | 5 | 40 / 30 | keep |
| wild_catch | 3–25 | 60 | keep |
| worldcup | 10 | 30 | keep |
| community | 1–3 | 50 | keep |
| ext_care / ext_welcome | 1 | 20 / 1 | keep |
| level_up | 50 | **UNCAPPED → 150 via awardPointsCapped** | fix |
| arena (season pts) | 10–200/win | **bypass → 200 via awardPointsCapped** | fix |
| referral | — | **unwired → 100 pts both sides on first-pet** | wire |
| **wallet total/day** | — | **none → 500 @100%, then 50%, hard 750** | add |

---

## 2. LANE B — $-costing actions: credits-metered ONLY

Any call that touches Grok (chat, vision, skills, agent) or fal (image, video)
is Lane B. Rule: **it consumes a credit, or it draws from a small free
allowance that is globally budget-capped — never "free and per-wallet-limited
only."** Per-wallet limits are UX politeness; global budgets are the defense.

### 2.1 The target: X = $25/day per 1,000-wallet farm (realistic), ~$120/day absolute grief ceiling

Justification from the red-team numbers:

- The sibling health app burned **~$39/day on ONE determined bot**. Our design
  ceiling for an entire 1,000-wallet farm must beat that; $25/day does.
- Post-fix realistic farm bleed decomposes as: chat main + fan-out ≈ **$2–3/day**
  (already bounded by the global `LLM_DAILY_CALL_CAP=2000`, `router.ts:146`) +
  free vision allowance ≈ **$10–15/day** (post-fix, §2.4) + misc ≈ **$5** →
  ~$20–25/day. One starter pack sold per day ($5, ~$4.70 gross) plus one creator
  pack ($20) fully covers it; at 1% farm→payer conversion the farm is
  profitable CAC, which is the founder's bet.
- The **grief ceiling** (~$120/day) is what a farm that deliberately burns every
  free credit on video can cost us, and it is enforced by GLOBAL budgets
  (§2.5) — not by per-wallet math, which a farm multiplies away. Rationale:
  worst week of pure grief ≈ $840 — annoying, survivable, and visible on the
  admin dashboard long before it matters.
- Season points issuance contributes **$0** to X. Points are never the leak.

### 2.2 Historical pre-hardening faucet review (not current launch state)

Faucets exist for genuine-user onboarding and session ritual, not as income.
All faucet grants are real, spendable credits — but sized so a hoarding farmer
gains little and a griefing farmer hits global budgets.

| Faucet | Historical baseline (superseded) | Target | Why |
|---|---|---|---|
| Signup grant | **100 cr minted on unauthenticated `GET /nonce`** (`nonce/route.ts:25`) | **50 cr at first successful `verify`** (proven key control) **+ 50 cr at day-3 check-in** | Kills the mint-without-signature leak (red-team Leak 3); halves day-1 grief exposure; day-3 tranche converts farmers into 3-day-retained "users" or filters them |
| First-video gate | none — starter credits can buy ~6 videos day 1 (~$1.80/wallet real cost) | **video-kind generation unlocks at day-2 check-in OR first purchase** (images/cards available immediately) | Caps one-time starter grief at ~$0.30/wallet (images only); genuine users hit day-2 trivially; not a paywall — a pacing gate |
| Playtime | 10 cr/day (30-min heartbeats) | keep 10 | Session ritual; $0.06/day worst-case |
| Adventure | EV ~75–90 cr/day (15 runs) | **`credits:adventure` daily ceiling 40** | 75–90/day is a second salary; 40 keeps the loop rewarding at ~$0.24/day worst-case |
| Arena PvE | **5–200 cr EVERY replay × 30/day/pet → up to 6,000 cr/day** (`lib/pve.ts` rewards) | **credits on FIRST CLEAR only + `credits:arena` daily ceiling 50** | This is the P0. 6,000 cr/day = $36/day/user vendor exposure — the exact sibling-app burn profile, in-house |
| Evolve | +50/stage ×5, one-time | keep | Atomic one-time guard already correct |
| Referral | unwired | 25 cr referrer-side, day-3-gated (§1.4) | Priced at $0.15/referral exposure |
| **Per-wallet earned-credit total** | none (theoretical 6,100+/day) | **hard ceiling `credits:earned` 100/day** | Belt-and-suspenders over the per-faucet caps; 100 cr/day × $0.006 = $0.60/day/wallet absolute max |

Steady-state genuine user: 10 playtime + ≤40 adventure + ≤50 arena ≈ up to 100
cr/day if they play everything — enough to feel generous (a free grok video
every 3–4 min of real play... no: every ~2 days of real play, or ~20 free
images/day), while worst-case vendor exposure is $0.60/wallet/day **only if
spent**, and spending is where the global budgets sit.

### 2.3 Chat — free promise kept, cost capped

Chat stays free (the companion promise is load-bearing; never 402 the pet).
Defense in depth, mostly already built:

1. Keep `LLM_USER_DAILY_CAP=60`/pet and global `LLM_DAILY_CALL_CAP=2000`/day
   (`router.ts:146-150`). The global cap is the actual defense — 1,000 wallets
   contend for one pool and each gets ~2 turns; scaling wallets stops helping.
2. **Past any cap: degrade to canned/persona replies, never an error.** The pet
   still answers; it just answers from the template pool. Bots can't tell the
   difference cheaply; humans rarely hit 60 turns.
3. **Memory fan-out is now budgeted:** persistent-memory, self-learning,
   bond-loop, consolidation, and best-of-N paths route through `callLLM`, so
   `consumeLLMBudget` counts their platform-provider calls.
4. **Authenticated PetClaw LLM skills are capped:** the execute branch reserves
   `llm:skill:<petId>` with `LLM_SKILL_DAILY_CAP` (default 50/day/pet), and the
   handler also routes through `callLLM`.
5. **Chat uses the shared LLM wall:** `callLLM` enforces
   `LLM_USER_DAILY_CAP=60` per pet and `LLM_DAILY_CALL_CAP=2000` globally.
   A separate proposed `llm:chat` wallet row was not required for launch.

### 2.4 Catch vision — the one scalable leak, closed

The pre-hardening route called vision before billing and relied on a 20/hour
token-local limit. The launch implementation closes that path:

- `consumeCatchVerify` runs before vision: **3 free verify attempts/day/wallet**,
  then **1 available credit per attempt**, charged on attempt rather than success.
- Each provider attempt reserves the dedicated
  `VISION_DAILY_CAP` (global) = **300 calls/day** (~$1.50/day at the original estimate),
  plus `VISION_USER_DAILY_CAP` = **30 calls/day** per authenticated owner.
- The route limit is **6/hour**. If a vision budget refuses a billed request,
  the reserved catch credit is refunded.

At 3 free/day: farm of 1,000 = 3,000 calls ≈ $15/day max, inside X. Genuine
users average <2 catches/day; collectors who binge pay a fair 1 cr (~$0.05,
10× our ~$0.005 cost — margin-positive per ECONOMY.md's ≥50%-GM rule).

### 2.5 Global budgets — the actual wall (backstop, not primary)

Credits-metering is primary. These global (process/platform-wide) daily budgets
are the backstop that makes the grief ceiling real, per the red-team's "only
global shared budgets change farmer ROI":

| Budget | Value | Worst-case $/day |
|---|---|---|
| `LLM_DAILY_CALL_CAP` (chat main, exists) | 2,000 | ~$0.60 + ~$1.20 fan-out |
| `VISION_DAILY_CAP` + per-user cap | 300 global / 30 per owner | ~$1.50 global at the original estimate |
| Free-origin video gate for never-paid wallets | 300/day global, 2/day/wallet, unlock day 2 | ~$90 (grok-video $0.30 avg) |
| **Total grief ceiling** | | **~$120/day** |

`checkVideoAllowed` now checks confirmed purchase history, enforces the day-2
pacing gate and a durable `video:free` per-wallet quota, then applies the
process-wide 300/day backstop. Paying users bypass this free-origin gate. When a
global budget trips, the product degrades without spending another provider
call: canned chat, "try again tomorrow" on catch verification, or a next-day
message for free-origin video. The global video counter is process-local and
resets on deployment; keep that limitation in mind before horizontal scaling.

---

## 3. Leaderboard & eligibility integrity — WITHOUT blocking

Farm wallets stay in the product and keep earning. Integrity happens at
**snapshot time**, in the ranking function, not at the door.

- **Snapshot-time cluster heuristics, unannounced timing.** At each season
  snapshot (timing not pre-announced), wallets are clustered on: funding-graph
  adjacency (same funder / circular transfers), signup burst + IP/ASN overlap,
  behavioral fingerprint (identical action timing vectors — a farm's cron is a
  signature), and referral-graph shape.
- **Diminishing per-cluster weight, not exclusion:** within a cluster of n
  wallets, ranked score weights as 1/√rank-in-cluster (wallet 1 = 100%, wallet
  4 ≈ 50%, wallet 100 ≈ 10%), i.e. a 1,000-wallet farm collapses to ~60
  effective wallets on the board. Farm wallets still SHOW their raw points in
  their own profile — nothing is confiscated, because there is nothing of
  financial value to confiscate.
- **Honest framing (published, permanent):** the rules page states upfront:
  "Season points are recognition, not property, and confer no financial value.
  Leaderboard rankings may apply clustering weights to keep ranks meaningful.
  Snapshot timing is not announced." This is disclosed BEFORE anyone farms —
  no retroactive rule ambush, no "we detected cheating" theater, no promise
  ("eligibility", "allocation", "reward pool") that could read as a future
  airdrop criterion. We never announce criteria that imply points→value.
- What we do NOT do: ban waves, wallet blacklists, points confiscation,
  KYC-gated leaderboards. All of those fight COUNT; the doctrine protects COST.

---

## 4. WTP integration — how farmers become payers (and why they can't cannibalize)

Per the monetization blueprint (no-token; paywall **recall + creation**, never
shields or the companion; segments = collectors / creators / agent-users):

**The conversion ladder** (everything free feeds a paid want):

1. **Collectors** — catch/wild-catch/cards are free Lane A; the WTP surface is
   Card **illustrate** (5 cr, Codex sticker) and rarity-chase catch binges past
   the 3 free verifies (1 cr each). A farmer grinding the codex builds a
   collection whose *completion* costs credits. Free play manufactures the
   sunk-cost collection; credits finish it.
2. **Creators** — the hero SKU. Bond milestones and evolutions generate a
   *moment* ("your pet's first video memory") whose capture is video: 15–60 cr
   ($0.75–$3.00 retail). Free faucets (≤100 cr/day earned) meter out ~1 cheap
   video per 2 days of real play — a taste cadence, not a supply. The catalog's
   good models (kling i2v 50 cr, seedance 40 cr) are practically
   purchase-only.
3. **Agent-users** — agent loop (5 cr), Pet Date (20 cr), premium recall
   surfaces. Pure paid; 98%+ GM per ECONOMY.md.

**Why farmers don't cannibalize paid value:** everything farmable is
zero-marginal-cost recognition or throttled taste-tier utility. The paid goods
— video at scale, good models, agent runs, deep recall — cannot be earned at
any wallet count: earned credits cap at 100/day/wallet AND free-origin video
caps globally at 300/day. A 1,000-wallet farm can decorate 1,000 leaderboard
rows; it cannot mint one extra Kling clip beyond the global budget. Meanwhile
each farm wallet that turns out to be a human (some are — that's the founder's
wallet-count bet) enters the ladder at step 1 already invested.

**Price-point sanity vs the $0.05 anchor:** all Lane B free allowances stay
below the value of the smallest paid unit. 3 free vision/day = $0.15 retail
equivalent; 10 playtime cr = $0.50; the full 100 cr/day earn ceiling = $5.00
retail equivalent but only ~$0.60 vendor cost — the spread IS the engagement
subsidy, and it's priced. Nothing free ever exceeds starter-pack value per
day, so the $5 starter pack always reads as "skip a day of grinding," which is
the correct psychological anchor for a $0.05 credit.

---

## 5. Historical pre-hardening parameter review (not current launch state)

| # | Knob | Historical baseline (superseded) | Target | Why (one line) |
|---|---|---|---|---|
| 1 | Arena PvE credit payout | 5–200 cr EVERY replay, ×30/day/pet (≤6,000 cr/day) | **first-clear only + `credits:arena` ≤50/day** | The P0: in-house copy of the sibling app's $36/day burn profile |
| 2 | Catch vision billing | **Pre-hardening:** free, 20/hr, outside budget guard | **Implemented:** 3 free/day then 1 cr/attempt; global 300/day + 30/user/day; 6/hr | Charge the call we pay for and bound one-owner exhaustion |
| 3 | Signup credit grant | 100 cr on unauthenticated `GET /nonce` | **50 cr at verify + 50 cr at day-3 check-in** | No minting without a signature; day-3 tranche filters or retains |
| 4 | First video generation | day-1 with starter credits (~$1.80/wallet grief) | **unlock at day-2 check-in or first purchase** | Caps starter-grant grief at ~$0.30/wallet (images) |
| 5 | PetClaw authed skill execute | **Pre-hardening:** no authenticated daily cap | **Implemented:** `llm:skill` 50/day/pet + route via `callLLM` | Closes the historical unbounded-skill path |
| 6 | Pet chat daily LLM cap | none per-wallet (30/min RL only) | **`llm:chat` 200/day/wallet, degrade to canned** | 43,200 free calls/day/bot possible; canned fallback keeps the free-companion promise |
| 7 | Chat memory fan-out (retain/observe/bond/best-of-n) | **Pre-hardening:** raw provider calls bypassed the budget guard | **Implemented:** routed through `callLLM` | Makes fan-out consume the shared LLM budget |
| 8 | Adventure credits | EV ~75–90 cr/day | **`credits:adventure` ≤40/day** | Faucet is ritual, not salary |
| 9 | Per-wallet earned-credit total | none | **`credits:earned` ≤100/day** | Hard $0.60/day/wallet worst-case exposure, belt over per-faucet caps |
| 10 | Free-origin video (never-paid wallets) | **Pre-hardening:** uncapped globally | **Implemented:** day-2 gate + 2/day/wallet + 300/day process-wide | Global budgets, not per-entity limits, are what change farm ROI |
| 11 | Vision caps | **Pre-hardening:** absent | **Implemented:** 300/day global + 30/day per owner (~$1.50 global at the original estimate) | Backstop making the grief ceiling real |
| 12 | level_up season pts | uncapped, bypasses capped path | **via `awardPointsCapped`, 150/day** | Honest admin issuance metrics + bounded wallet/day |
| 13 | Arena season pts | direct increment ≤6,000/day | **via `awardPointsCapped`, 200/day** | Same |
| 14 | Wallet daily point total | none (~1,100 maxed) | **500 @100%, then 50%, hard 750** | Leaderboard legibility; compression not punishment |
| 15 | Referral grant | unwired (TODO) | **100 pts both sides on first-pet; +25 cr referrer at referred day-3** | $0.15/referral exposure; self-referral ROI negative without blocking |
| 16 | Lane A caps (interact/missions/checkin/community/battles/worldcup/ext) | as coded | **keep — no sybil blocking** | Zero marginal cost; farms here are welcome traction |
| 17 | Leaderboard ranking | raw points | **snapshot-time cluster weight 1/√rank-in-cluster** | Integrity without bans; disclosed policy, unannounced timing |
| 18 | `LLM_DAILY_CALL_CAP` / `LLM_USER_DAILY_CAP` | 2,000 global / 60 per pet | **keep** | Already the proven wall; red-team confirmed it holds chat to ~$2–3/day |

Budget identity check (1,000-wallet farm, post-change): chat ≈ $2–3 + vision
free tier ≤ $15 + misc ≤ $5 → **realistic ≈ $20–25/day (target X=$25 ✓)**;
grief ceiling = $2 chat + $25 vision + $90 free-origin video ≈ **$120/day ✓**;
one-time per-wallet ≈ $0.30 (image-only starter burn) vs $2.30 today.

---

## 6. Honesty guardrails — what marketing may and may not say

NO-TOKEN posture is a hard constraint (DD-remediated; see
`project_monetization-blueprint-no-token`). Season points have no redemption
path in code, and no words may create one in users' minds.

**Never say (or imply):** "airdrop", "token", "TGE", "allocation",
"eligibility snapshot", "points will convert / be redeemable", "earn crypto",
"rewards pool" (financial framing), APY/yield metaphors, "early supporters
will be rewarded" (in any financial sense), or any roadmap slide that draws an
arrow from season_points to an asset. Also banned: publishing wallet counts or
DAU that we know are farm-inflated **as if organic** — report raw counts as
raw counts, segment when we present traction (DD honesty: no fabricated or
laundered metrics).

**May say at launch:** "season points are recognition — leaderboard rank,
badges, cosmetics, bragging rights"; "points have no cash value and cannot be
redeemed" (put this disclaimer ON the leaderboard UI, permanently); "credits
meter supported creation features"; "wallet sign-in, no email, no card".
Do not quote a credit sale price or say users pay for creation until
`PAYMENTS_ENABLED=true` and the separate payment checklist has passed.

**Product-copy rules:** any new earn surface ships with the non-financial
disclaimer inherited from the leaderboard component; referral copy is prohibited
while `REFERRALS_ENABLED=false`. After enablement it uses "bring a friend"
framing (points + a few credits), never "earn per head";
cluster-weighting policy is published in the rules page BEFORE each season
starts (§3) so no participant can claim ambush.

**Internal rule:** if a proposed feature only makes sense to a user who
believes points→money, the feature is mis-designed — redesign it around
recognition or credits before shipping.

---

## Appendix — original hardening order (historical, not a current checklist)

This records the order proposed by the pre-hardening review. The launch-state
warning at the top of this document and committed contract tests supersede it;
an item's priority label below does not mean that work is still open.

1. **Historical P0 tranche:** #1 arena credits, #2 catch-vision billing+guard, #5
   petclaw skill RL, #3 nonce→verify grant move. These four close every leak
   the red-team priced above $5/day.
2. **Historical P1 tranche:** #6/#7 chat daily cap + fan-out migration, #9/#10/#11 global
   budgets, #12/#13 capped-path routing, #4 video day-2 gate.
3. **Historical P2 tranche:** #14 diminishing wallet total, #15 referral wiring, #17 snapshot
   clustering (needed before first season snapshot, not before).

Key files: `web/src/lib/seasonRewards.ts`, `web/src/lib/llm/router.ts`,
`app/api/arena/pve/route.ts` + `lib/pve.ts`, `app/api/catch/route.ts` +
`lib/catch/vision.ts`, `app/api/auth/nonce/route.ts`,
`app/api/petclaw/skills/route.ts`, `lib/petclaw/memory/*`,
`app/api/adventure/route.ts`, `app/api/referral/route.ts`, `docs/ECONOMY.md`.
