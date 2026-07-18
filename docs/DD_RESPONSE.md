# MY AI PET — Binance DD Questionnaire (Draft Responses)

> Project: **MY AI PET** (PetClaw Protocol)
> Network: BNB Smart Chain (BSC) mainnet
> Submission date: 2026-06-01
> **Updated: 2026-07-18** — launch-state claims reconciled with the signed AWS release and its fail-closed feature flags.
>
> **Authoritative launch-state snapshot (2026-07-18):** The web app and Studio are live on AWS EC2. External payments, OAuth/channel subscriptions, legacy agent channels, Pet LoRA, production blockchain integration, and referrals are disabled. PETContent and PetaGenTracker are deployed, but their on-chain `paused()` values are `false`; the owner remains authorized as minter/relayer. Their counters are zero (PETContent supply `0`; tracker users/generations `0`). PetClaw Extension v2.3.2 is available as a developer/unpacked ZIP and is not published in the Chrome Web Store. The historical `/studio_test` route was removed after promotion to `/studio`.
>
> **Draft status:** This questionnaire is not submission-ready until every `[TBD]` and finance, user, contract-ownership, and deployment-evidence claim is independently completed and approved. The launch-state snapshot above supersedes any historical or planned-capability wording below.
> This document covers the **green-highlighted questions (Q2.d, 3, 4, 5, 6, 14, 15, 19, 35–42)** assigned to the dev team. Q1, 2.a–c, 7–13, 16–18, 20–34, 43+ are handled by other team members.

---

# Overview

## Q2.d — Dune Dashboard (user statistics / TVL / Txs amount)

**Status:** Public Dune dashboard is still in preparation — target publish window: **2026 Q3**.

Until the public Dune URL goes live, deployment and current zero-activity state are independently verifiable against the two public contracts:

| Metric | Source |
|---|---|
| Generation-event counter (`totalGenerations = 0` at launch review) | https://bscscan.com/address/0x590D3b2CD0AB9aEE0e0d7Fd48E8810b20ec8Ac0a (PetaGenTracker) |
| AI content NFT supply (`totalSupply = 0` at launch review) | https://bscscan.com/address/0xB31B656D3790bFB3b3331D6A6BF0abf3dd6b0d9c (PETContent) |
| Real-time in-app activity feed | https://app.myaipet.ai (homepage) |
| In-app analytics (DAU / generations / chains / cohorts) | https://app.myaipet.ai/admin/analytics |

The Dune dashboard will surface, at minimum:
- Current contract state and any future daily/cumulative provenance events — PetaGenTracker + PETContent. Both counters were zero at the launch review; PETActivity is planned and has no deployed address.
- Unique wallet count interacting with the contracts
- Historical, finance-verified USDT volume, if any. The current payment rail is disabled.
- Gas spend by contract
- 7d / 30d cohort trend lines

> **Note on TVL:** MY AI PET operates a **points-based loyalty economy** and does not custody user funds in any staking pool, lending vault, or escrow contract. Accordingly, there is no TVL figure to report. Any historical USDT or NFT volume must be finance-verified; external payments and new blockchain writes are disabled in the current launch.

---

## Q3 — Products, status, on-chain & off-chain users, business model, revenue

| Product | Development Phase | On-chain User Amount | Off-chain User Amount | Business Model | Revenue Made (cumulative, USD) |
|---|---|---|---|---|---|
| **MY AI PET — Web App** (https://app.myaipet.ai) | **Live on AWS EC2**; SIWE sign-in live; payments and production on-chain integration disabled | `0` users recorded by PetaGenTracker at launch review | [TBD: registered user count from `users` table] | Granted credits and season points at launch; configured USDT monetization is disabled | [TBD: finance-verified historical revenue only] |
| **PETContent (ERC-721 NFT)** | **Deployed and verified on BSC; production integration disabled; `paused() = false` at review** | `0` supply at launch review | n/a | No current mint-fee revenue; this contract has no royalty interface | $0 observable mint revenue at zero supply |
| **PetaGenTracker (activity contract)** | **Deployed and verified on BSC; production integration disabled; `paused() = false` at review** | `0` users and `0` generations at launch review | n/a | n/a (unused infrastructure) | $0 current |
| **PETShop / PETToken / PETActivity** | Legacy PETShop/PETToken sources are outside the live flow and require deployment/owner evidence before any deployment claim; PETActivity is planned | n/a | n/a | None active | $0 current |
| **PetClaw SDK** (open MCP protocol, npm `@myaipet/petclaw-sdk` v1.6.1) | **Published, open-source MIT** | n/a (off-platform SDK) | [TBD: npm download count + GitHub stars at submission] | None — public good (drives platform demand) | $0 (strategic distribution layer) |
| **PetClaw Browser Extension v2.3.2** | **Downloadable developer/unpacked ZIP; not yet in the Chrome Web Store** | Uses a 30-day PetClaw client token generated after sign-in | [TBD: verified download/install count] | No separate paywall | n/a |
| **Telegram + Discord integrations** | **Built but launch-disabled** (`OAUTH_CONNECTIONS_ENABLED=false`; `AGENT_CHANNELS_ENABLED=false`) | No current-user claim | [TBD only after enablement] | No current revenue | n/a |
| **Pet Studio (multi-model AI video studio + client-side editor)** | **Live at `/studio`** | shares web-app users | shares web-app users | Free/granted-credit use at launch; paid subscription and USDT settlement disabled | [TBD: finance-verified historical revenue only] |
| **Total Revenue Made (cumulative through 2026-05-31)** | — | — | — | — | **[TBD: sum to insert from analytics DB]** |

### Notes on business model

MY AI PET runs a **points-based loyalty economy**. Concretely:
- There is **no live $PET token mint into user hands**.
- There is **no buyback-and-burn** mechanism.
- There is **no token airdrop** active or scheduled.
- Legacy PETToken/PETShop sources are not part of the live user flow, and their deployment/address/owner evidence remains to be supplied before submission. PETActivity is planned, not deployed. Commit `7c20c0ec` removed token-mint traces from the live app in 2026-04. The public-facing protocol manifest (`/.well-known/pet-card.json`) makes the no-token launch posture explicit.

Configured monetization paths (detail in Q38 below; **external settlement is disabled for launch**):
1. **Credit purchases** — verification code exists, but `PAYMENTS_ENABLED=false` makes purchases unavailable.
2. **Pay-per-action** — receipt code exists, but paid endpoints fail closed.
3. **AI generation usage** — may consume granted in-app credits; this is not current cash revenue.
4. **Marketplace** — the in-app credit catalog may operate, while premium USDT purchasing is disabled.
5. **Pet Studio subscriptions** — tier UI/configuration exists, but paid checkout and USDT settlement are disabled.

> There is **no live payment rail**. SIWE wallet sign-in is live; SIWE + USDT is only a configured future rail after the security, compliance, treasury, and end-to-end launch gates are satisfied. The retired Coinbase Onramp prototype is not shipped.

---

## Q4 — Description and highlights of the products offered

### 4.1 What MY AI PET is

MY AI PET is an **AI companion platform with production BSC integration disabled**. Users connect a wallet, adopt an AI-driven pet, interact through daily activities, and generate images and videos. PETContent and PetaGenTracker are deployed, but their launch-review counters are zero and their on-chain `paused()` values are `false`. The production server does not submit writes because `BLOCKCHAIN_ENABLED=false`. Reactivation requires an external audit and reviewed relayer, ownership, deployment, and public-status controls; changing the flag alone is not authorization (see `web/src/lib/blockchain.ts`, `deploy/ENV-CHECKLIST.md`, and the `/contracts` page).

The platform is built around a **portable, memory-rich, sovereign-AI companion** — a stack we call **the PetClaw protocol** and have published as an open MIT-licensed SDK so the same pet identity can move across any MCP-compatible client (Claude Code, Cursor, Gemini CLI, etc.).

### 4.2 Key Features

| # | Feature | Detail |
|---|---|---|
| 1 | **Multi-modal adoption** | Two adoption flows: (a) AI chat with a counselor agent that extracts pet attributes (name/species/personality/traits), (b) photo upload of a real pet. Both fail-closed under content moderation. |
| 2 | **AI image + video generation (6 styles)** | Per-pet, character-anchored AI image and short-video gen. Multi-provider fallback across fal.ai-hosted models (Kling 1.6, FLUX, Seedance, Wan 2.1, MiniMax) and Grok (x.ai) for resilience and cost optimization. Human photos are blocked as pet avatars by a vision-based guard (`isHumanAvatar`). |
| 3 | **Five-layer persistent memory** | (i) curated facts (`MEMORY.md`), (ii) owner profile (`USER.md`), (iii) session log, (iv) lexical pre-fetch, (v) post-turn LLM extraction. Memories survive across sessions and devices. |
| 4 | **9 mood states + 6 stats + 5 evolution stages** | Tamagotchi-style stat decay (happiness / energy / hunger / bond / EXP / level), 9 derived mood states (ecstatic → starving), evolution unlocks at level thresholds. |
| 5 | **Adventure Mode V2 — Pokémon-style 4-skill PvP** | Turn-based battles, 4 skill slots, element type advantage (Fire / Water / Grass / Electric), HP/EP system, EXP / season-point / rare-skill (5%) drops. |
| 6 | **PvE Story Mode — 30 stages, 6 regions, boss progression** | Grasslands → Volcano → Ocean → Storm → Shadow → Dragon. Boss intro/victory/defeat dialogue, 3-star rating (HP remaining + turn count), first-clear guaranteed skill drops. |
| 7 | **NFT minting (PETContent ERC-721)** | The relayer mint path is implemented, but production integration is disabled and supply is zero. The contract returned `paused() = false` at review and the owner remains an authorized minter. Live media is stored on protected EC2-local uploads. Reactivation requires the external audit and reviewed operational controls, not only a flag change. |
| 8 | **On-chain activity ledger (PetaGenTracker)** | The max-50 batch recorder is implemented, but production integration is disabled and recorded users/generations are zero. The contract returned `paused() = false` at review and the owner remains an authorized relayer. |
| 9 | **5-layer payment verification** | Verification and single-use receipt code is implemented and tested, but paid endpoints fail closed in this launch because `PAYMENTS_ENABLED=false`. |
| 10 | **Guest tour mode** | `?tour=1` renders read-only DEMO previews of wallet-gated sections (my pet, community, World Cup) so first-touch users can explore before connecting a wallet. SIWE sign-in is live; the payment rail is disabled and the retired Coinbase Onramp prototype is not shipped. |
| 11 | **Social layer** | Public gallery, likes, threaded comments (with orphan-prevention on parent delete), follow / following graph, weekly leaderboard. |
| 12 | **Marketplace — credit catalog + configured premium shop** | Credit-priced catalog items can use granted in-app credits. Premium USDT purchasing is configured but unavailable while payments are disabled. |
| 13 | **PetClaw SDK + MCP server (open, MIT)** | `@myaipet/petclaw-sdk` v1.6.1 on npm (with `petclaw-mcp` MCP server binary). Exposes companion-chat, persona-mirror, memory-recall, soul-export as MCP tools. Canonical skill registry: **18 skills, each backed by a real handler/endpoint**. CLI personal-access tokens (`pck_` prefix, revocable) authenticate SDK/CLI use. `/.well-known/pet-card.json` discovery file is conformant with the PetClaw spec. |
| 14 | **SOUL export — sovereign portability** | Canonical JSON bundle (memories + persona + skills + consent settings) with SHA-256 integrity hash. A pet raised on our server can move to another conformant server or run locally without losing identity. |
| 15 | **Cross-surface presence** | Web (primary) plus PetClaw Extension v2.3.2 as a downloadable developer/unpacked ZIP. Telegram and Discord integrations are built but disabled for launch. |
| 16 | **Smart-contract security** | 1 internal security code review — 26+ findings remediated (full report in `docs/AUDIT_REPORT.md`). An external third-party audit is required before any on-chain reactivation. Contract-source security patterns do not substitute for deployment/owner evidence. |
| 17 | **Pet Studio (live at `/studio`)** | The catalog has 12 model entries: 3 default-free entries, 6 membership-gated entries while memberships are not on sale, and 3 coming-soon entries. It also includes 22 templates (12 in the trending category), Prompt Director, and a client-side editor. Paid subscription checkout is disabled; displayed tier/pricing configuration is not a live settlement claim. |
| 18 | **Native tool-calling pet agent** | `callLLMWithTools` and a tool-agent loop expose web_search, wikipedia_lookup, crypto_price, and recall_memory. `web_read` is declared but currently returns an unavailable response and must not be claimed as active. SSE streaming is available on the pet agent endpoint; owner BYOK routing is supported. |
| 19 | **Mini-games & community events** | TCG-style card duels, Cat/Dog Catch (map spawns + photo catch), World Cup Favorites Bracket (client-side personal picks) and an honest champion-prediction community poll (votes only — no fabricated results), plus lo-fi ambient scenes (Pet Village, Pet Pond, walkable Pet Square, focus sessions). All grant small, daily-capped season points. |

### 4.3 Configured pricing reference (not purchasable at launch)

| Tier | Price | Credits received |
|---|---|---|
| Starter | $5 USDT | 100 credits |
| Creator | $20 USDT | 500 credits |
| Pro | $50 USDT | 2,000 credits |

> Credits are a **closed-loop in-app utility**, not a token-denominated balance. These configured USDT tiers are unavailable while `PAYMENTS_ENABLED=false`; they must not be represented as a live offer. Grant amounts and internal usage may operate independently of external purchases.

### 4.4 Tech stack

Next.js 16 + React 19 + TypeScript (web) · Solidity 0.8.28 + OpenZeppelin 5.x + Hardhat 3 (contracts) · EC2-local PostgreSQL 16 + Prisma 7.x (DB) · fal.ai model family (Kling 1.6, FLUX, Seedance, Wan, MiniMax) + Grok (x.ai) (AI providers) · task-based LLM router with owner BYOK model support · protected EC2-local uploads (storage) · RainbowKit + wagmi + viem + SIWE + JWT (Web3 auth) · AWS EC2 signed-artifact deployment (the former Vercel/Neon, RDS, and S3 production paths are historical or inactive; the legacy Python/FastAPI backend has been removed).

---

## Q5 — Target market size

### 5.1 Addressable markets (the intersection MY AI PET sits inside)

| Market | 2026 size (industry consensus) | Source category |
|---|---|---|
| **Global AI companion / chatbot market** | $40B+ (2026E), growing >30% YoY | Grand View Research, Statista |
| **Pet humanization / pet care market** | $325B+ global; $150B+ US | American Pet Products Assoc. (APPA) |
| **Web3 gaming / GameFi** | $25B–30B (2026E) | DappRadar, Messari |
| **Generative AI media (image + video)** | $15B+ and growing >40% YoY | McKinsey, Grand View |
| **Crypto wallet base (Chainalysis-tracked)** | ~580M global crypto users, ~50M+ wallets that have signed at least one DeFi or GameFi tx | Chainalysis Geography of Crypto 2025 |

> Sources will be hyperlinked in the final draft.

### 5.2 SAM / SOM (segments we actually serve)

**TAM** — All consumer crypto + AI companion + pet-humanization users → ~$50B addressable spend (2026E).

**SAM (Serviceable Available Market):**
- Crypto-native users in Asia-Pacific + North America + EU who actively use a non-financial Web3 app (NFT, GameFi, SocialFi).
- Estimated **~120M wallets** that have signed at least one non-financial transaction in the last 12 months (DappRadar 2025).
- Average annual spend in this cohort on Web3 games / collectibles: ~$45–80 (DappRadar, Messari estimates).
- → **SAM = ~$6B–10B annual spend**.

**SOM (Serviceable Obtainable Market — beachhead):**
- Crypto-native AI-curious users on BSC + ETH/Base who:
  - already use companion AI (Replika ~30M MAU, Character.AI ~28M MAU at peak — aggregate ~60M+) and
  - want **portability + ownership** of their companion (the central pain point the protocol layer solves).
- Conservative target = **0.5–1% of this overlapping cohort** in years 1–2 = **300K–600K users**.
- Average revenue per user (ARPU) target: $25–50/year (in line with mid-tier mobile-game ARPU).
- → **SOM = $7.5M–30M annual revenue at maturity**.

### 5.3 Geographic priority

1. **Korea + Southeast Asia** (Web3-gaming density, BSC penetration, AI-companion adoption)
2. **United States + Europe** (PetClaw-protocol distribution via MCP-client ecosystem — Claude Code, Cursor users)
3. **Japan + Greater China** (pet humanization tailwind + collector/Tamagotchi nostalgia layer)

---

## Q6 — Utility and value to the crypto industry and to other industries

### 6.1 Value to the crypto industry

| # | Contribution | Why it matters for the industry |
|---|---|---|
| 1 | **On-chain identity beyond DeFi** | Extends "wallet-as-identity" to a non-financial, daily-active use case. Pet DID = `wallet × petId` is a new identity primitive any companion app can adopt. |
| 2 | **Open companion protocol (PetClaw)** | MIT-licensed SDK + `/.well-known/pet-card.json` discovery + SOUL export (SHA-256 hashed). Any MCP client can talk to any conformant server — no lock-in. This is a public good for the AI×Web3 stack. |
| 3 | **Public BSC provenance contract references** | PETContent and PetaGenTracker have public deployments, but production integration is disabled and their counters were zero at launch review. Both returned `paused() = false`. |
| 4 | **Reference implementation patterns** | Open SDK + public contract source provide examples of relayer-batched activity tracking, payment verification, Ownable2Step/Pausable controls, and single-use receipts. This is not an external-audit claim. |
| 5 | **Web2 → Web3 onboarding bridge** | Read-only guest tour mode (`?tour=1`) + AI-counselor adoption chat lower first-touch friction for non-crypto-native users; full features unlock via SIWE wallet sign-in. |

### 6.2 Value to other industries

| Industry | How MY AI PET adds value |
|---|---|
| **AI companion / mental wellness** | Persistent-memory, owner-sovereign companions are a structural answer to "Replika lobotomized my partner"-style complaints about centralized companion apps. SOUL export means a user's emotional investment is portable. |
| **Pet care / pet tech** | The AI-companion "memory ledger + dream journal" surface is a natural complement to physical pet ownership — adjacent expansion path to pet-care apps, vet integrations, and pet-loss memorialization. |
| **Gaming / creator economy** | Pet Studio's character-anchored AI video generation is directly applicable to short-form video creators who need a visually consistent character across clips. |
| **Education / learn-to-play** | Bond / training / PvE-progression loop is a proven engagement primitive transferable to language-learning, kids' edutainment, and habit-formation apps. |
| **Tooling / MCP ecosystem** | `petclaw-mcp` server gives every MCP-compatible IDE / dev tool a turn-key companion AI surface. We are a citizen of the broader MCP ecosystem, not a walled garden. |

---

# Development

## Q14 — Private code repo access

Handled separately per project — GitHub usernames for each repo will be communicated by the team in the next email. NDA can be co-signed first if required. Target GitHub recipient: https://github.com/dhbnc/.

---

## Q15 — Key developers — background and GitHub usernames

> The table below is a **template structure** matching the Binance DD format. Names, bios, LinkedIn, GitHub usernames, commit counts, and CVs **to be filled by the team before submission.**
>
> The primary git committer of record on the deployed codebase is `blockschool`. Total and per-author commit counts remain **[TBD — calculate from the exact submission commit at submission time]**; do not reuse a historical hard-coded count.

| Position / Role | Name (real name) | LinkedIn | Twitter / X | Past experiences | GitHub | CV provided |
|---|---|---|---|---|---|---|
| **Founder / CEO** | [TBD] | [TBD] | [TBD] | [TBD: prior projects with dates] | [TBD] | Yes / No |
| **CTO / Smart Contracts Lead** | [TBD] | [TBD] | [TBD] | [TBD] | [TBD] | Yes / No |
| **Full-Stack Lead** | [TBD] | [TBD] | [TBD] | [TBD] | [TBD] | Yes / No |
| **AI / Backend Lead** | [TBD] | [TBD] | [TBD] | [TBD] | [TBD] | Yes / No |
| **Designer / Front-End** | [TBD] | [TBD] | [TBD] | [TBD] | [TBD] | Yes / No |

### Commit distribution (to be inserted at submission)

Following the Yooldo precedent, please include per-developer commit counts on the main project repos. Sample format:

```
Repo: aipet-project
  blockschool   : [TBD]
  <username 2> : [TBD]
  <username 3> : [TBD]
Repo: petclaw-sdk (public)
  <username>    : [TBD]
```

---

## Q19 — Past milestones, achievements, and updated roadmap

### 19.1 Past milestones (shipped, verifiable)

| Timeline | Milestone | Status |
|---|---|---|
| **2025 Q4** | Project incepted — PetClaw protocol design + initial smart-contract drafts | Finished |
| **2025 Q4** | Pet adoption (AI chat + photo upload) — first working prototype | Finished |
| **2026 Q1** | PETToken legacy contract source completed; deployment/address/owner evidence still required | Evidence TBD |
| 2026 Q1 | PETShop legacy contract source completed; deployment/address/owner evidence still required | Evidence TBD |
| 2026 Q1 | PETContent (ERC-721) deployed + BscScan-verified (`0xB31B656D...`) | Finished |
| 2026 Q1 | PetaGenTracker deployed + BscScan-verified (`0x590D3b2C...`) | Finished |
| 2026 Q1 | PETActivity design/source path | Planned; not deployed |
| 2026 Q1 | **Internal security code review** — 26+ findings remediated (`docs/AUDIT_REPORT.md`) | Finished |
| 2026 Q1 | AI image + video generation (6 styles) — live | Finished |
| 2026 Q1 | NFT minting via PETContent (relayer pattern) — built; production integration disabled, `paused() = false`, supply zero at launch review | Finished (integration off) |
| 2026 Q1 | PetaGenTracker batch recording (relayer, max 50/batch) — built; production integration disabled, `paused() = false`, counters zero at launch review | Finished (integration off) |
| 2026 Q1 | Coinbase Onramp prototype (Base/USDC, session-token auth) — evaluated, then retired and removed from production code; the configured successor SIWE+USDT rail is also disabled for launch | Retired |
| 2026 Q1 | Arena battle system + Leaderboard / ranking — live | Finished |
| 2026 Q1 | Social layer (gallery + likes + comments + follow graph) — live | Finished |
| 2026 Q1 | Marketplace credit catalog implemented; premium USDT purchasing is launch-disabled | Finished (paid rail paused) |
| 2026 Q1 | Pet evolution (5 stages) — live | Finished |
| 2026 Q1 | **5-layer on-chain TX verification + single-use paywall receipts** — implemented and tested; launch-disabled | Finished (paid rail paused) |
| 2026 Q2 | **Adventure Mode V2 (Pokémon-style PvP)** — 4 skill slots, type advantage, EXP/season-point/skill drops | Finished |
| 2026 Q2 | **PvE Story Mode — 30 stages, 6 regions, boss progression (up to Dragon King Bahamut Lv.60)** | Finished |
| 2026 Q2 | Telegram + Discord integrations built; OAuth/channel and legacy agent-channel gates remain disabled | Finished (launch-disabled) |
| 2026 Q2 | Browser Extension — upgraded to v2.3.2, available as a downloadable developer/unpacked package; Chrome Web Store publication pending | Finished (direct distribution) |
| 2026 Q2 | **PetClaw SDK published (npm, MIT, open)** + MCP server — current release `@myaipet/petclaw-sdk` v1.6.1, with CLI personal-access tokens (`pck_`) | Finished |
| 2026 Q2 | Admin analytics, mobile responsiveness, rate-limit hardening | Finished |
| 2026 Q2 | AWS-only deployment stack (Vercel + Neon dual-stack retired) | Finished |
| 2026 Q2 | Token-mint trace removal — explicit points-only economy | Finished |
| 2026 Q2 | **Pet Studio v1 (Phase 1, multi-provider AI video gen with pet character anchor)** | Finished |
| 2026 Q2 | **Pet Studio v2 (dark redesign + subscription configuration + editor)** — iterated on the historical `/studio_test` staging route, which was removed after promotion | Finished |
| 2026 Q2 | DD audit cleanup + public SDK staging for new GitHub org | Finished |
| 2026 Q2–Q3 | **Pet Studio launched at `/studio`** — 12 catalog entries across available, membership-gated, and coming-soon states; 22 templates (12 trending), Prompt Director, client-side editor; paid tiers disabled | Finished (paid rail paused) |
| 2026 Q2–Q3 | World Cup (Favorites Bracket + honest champion-prediction poll), TCG card duels, Cat/Dog Catch, Wild Encounters — all wired to daily-capped season points | Finished |
| 2026 Q2–Q3 | **Native tool-calling pet agent** (web_search / wikipedia_lookup / crypto_price / recall_memory; SSE streaming) + LLM router with owner BYOK models; `web_read` remains unavailable | Finished (except web_read) |
| 2026 Q3 | Guest tour mode (`?tour=1` read-only DEMO previews) + vision-based human-photo avatar guard | Finished |
| **2026 Q3 (current)** | Lo-fi ambient scenes (Pet Village, Pet Pond, Pet Square, focus sessions) + ongoing DD upkeep | In progress |

### 19.2 Updated roadmap

| Timeline | Milestone | Status |
|---|---|---|
| **2026 Q3** | **Public Dune dashboard** (user / tx / volume) | Upcoming |
| 2026 Q3 | **Skill NFTs (PETContent)** — rare skills as tradeable NFTs | Upcoming |
| 2026 Q3 | **Battle results on-chain (PETActivity)** — `BattleHistory` table is ready | Upcoming |
| 2026 Q3 | Skill upgrade history on-chain | Upcoming |
| ~~2026 Q3~~ | ~~Pet Studio v3 production rollout~~ — **shipped: Studio is live at `/studio`** | Done |
| 2026 Q3 | Custom domain (`myaipet.com`) | Upcoming |
| 2026 Q3 | i18n (Korean / English toggle) + mobile responsive polish | Upcoming |
| 2026 Q3 | Investor logo verification + Twitter cleanup (`@MYAIPETS`) | Upcoming |
| 2026 Q3 | **External third-party smart-contract audit** (firm TBD) + re-enable on-chain writes (`BLOCKCHAIN_ENABLED`) post-audit | Upcoming |
| 2026 Q3 | **Multisig ownership transfer to Gnosis Safe** (Ownable2Step finalization) | Upcoming |
| 2026 Q3 | USDT purchase end-to-end test (BNB wallet, real-user) | Upcoming |
| 2026 Q3–Q4 | Fiat-onramp re-evaluation (would require a fresh security/compliance review and provider approval) | Future Plans |
| **2026 Q4** | Pet Studio paid-tier Phase 2 expansion + creator marketplace, after payment enablement gates | Future Plans |
| 2026 Q4 | PetClaw SDK adoption push to MCP-client ecosystem (Claude Code / Cursor / Gemini CLI) | Future Plans |
| 2026 Q4 | Content moderation hardening (IP filtering on uploads + generated content) | Future Plans |
| ~~2026 Q4~~ | ~~Removal of unused legacy code paths (FastAPI backend, legacy Vite frontend)~~ | Done |
| **2027 H1** | Cross-chain expansion (multi-EVM PetClaw conformance) | Future Plans |

### 19.3 Differences from the original roadmap and rationale

| Original plan | Current direction | Why we changed |
|---|---|---|
| Active **$PET token economy** with mint into user hands | **Points-only loyalty economy** (legacy token/shop sources outside the live flow; deployment/owner evidence TBD) | Compliance posture: avoid any artifact that could be construed as a financial instrument absent clear regulatory framing. Commit `7c20c0ec` removed token-mint traces from the live app. Public-facing manifest (`/.well-known/pet-card.json`) makes this explicit. |
| **Single-surface (web only)** | Web + downloadable developer/unpacked extension; Telegram and Discord integrations are built but disabled | Companion AI works best when always-present, while each external channel must pass its own security and launch gate before enablement. |
| **Closed product only** | Closed product **+ open PetClaw SDK + MCP server** | We concluded the protocol layer is more strategic than the product layer. Open SDK gives us distribution via every MCP-compatible client and de-risks platform-lock-in concerns voiced by power users. |
| **Vercel + Neon hosted stack** | **AWS EC2 single-host stack**: local PostgreSQL, local protected uploads, signed immutable artifacts uploaded over PEM | Operational simplification, cost control, and a single root of trust. Vercel/Neon and the evaluated RDS/S3 paths are not used by the live deployment. |
| **Pet Studio Phase 1 shipping live on /studio** | Phase 1 was **reverted**, rebuilt on the historical `/studio_test` staging route, and the rebuilt Studio is **now live on `/studio`**; `/studio_test` is no longer deployed | Phase 1 quality bar was below user expectation for a video editor. We iterated away from the live URL, promoted the rebuilt version, then removed the staging route. |

---

# Commercial (Q35–42) — Revenue, profitability, treasury, competitors

> **Team note:** Questions 35–42 cover financial particulars (revenue history, projections, runway, treasury, competitor analysis). The team has flagged these for joint discussion before submitting. The framework below lists the exact data sources we can pull from and best estimates we can defend; numeric blanks marked `[TBD]` are the ones the team will fill in jointly.

## Q35 — Use of proceeds + current expenditure

### Targeted breakdown

[TBD: confirm with finance lead]

| Bucket | Original target % | Current % | Variance | Notes |
|---|---|---|---|---|
| Engineering salaries / contractor cost | [TBD] | [TBD] | [TBD] | Includes smart-contract, web, AI/backend, ops |
| Infrastructure (AWS + AI provider spend + RPC) | [TBD] | [TBD] | [TBD] | fal.ai + Grok + AWS + BSC gas |
| Security audits + legal | [TBD] | [TBD] | [TBD] | 1 internal code review completed (26+ findings fixed); external audit planned; ongoing legal counsel |
| Marketing + community | [TBD] | [TBD] | [TBD] | Twitter, KOL, ambassador program |
| Reserve / runway buffer | [TBD] | [TBD] | [TBD] | Operational runway buffer |

**Deviation from original plan:** [TBD — to be discussed.]

---

## Q36 — Past 12-month historical + 12-month future cash flow forecast (+ FTE plans)

> Format follows Celuvplay precedent. Numbers `[TBD]` to be filled.

| Item | Past 12 months (2025-06 → 2026-05) | Next 12 months (2026-06 → 2027-05) |
|---|---|---|
| Average team size (FTEs) | [TBD] | [TBD] |
| Monthly operating costs | [TBD: AI gen spend + AWS + salaries] | [TBD] |
| Annual operating costs | [TBD] | [TBD] |
| Cumulative revenue (USDT) | [TBD: finance-verified historical settlement only] | [TBD: forecast only after payment enablement approval] |
| Net (revenue − opex) | [TBD] | [TBD] |
| Expansion purpose | n/a (consolidation phase) | Pet Studio paid-tier/Phase-2 expansion + PetClaw SDK distribution + reviewed chain reactivation |
| Strategic objectives | n/a | Accelerate user acquisition via MCP-client embedding; treat monetization and on-chain volume as gated future work |

**Configured unit economics (not a live paid offer; from `web/src/lib/studio/providers.ts` + `docs/ECONOMY.md`):**
- Retail credit price: **$0.05/credit** ($5 → 100 credits); the largest pack realizes $0.025/credit, and margins are managed against that worst case.
- Example — Kling 1.6 Standard 5s video: vendor cost ~$0.35, charged 40 credits ($2.00 retail / $1.00 bulk) → ~65–82% gross margin per video.
- Per-model configured credit prices are declared alongside vendor cost in `providers.ts`. **No paid action is enabled at launch**; configured prices are intended to satisfy the margin policy in `docs/ECONOMY.md` if the rail is later approved.

---

## Q37 — Historical daily stats + adoption metrics

### a. Users data

| Metric | Value | Source |
|---|---|---|
| Total registered users (off-chain) | [TBD] | `users` table |
| Unique wallets with ≥1 recorded provenance interaction | 0 at BSC block 110,707,528 | `PetaGenTracker.totalUsers()` direct RPC |
| Daily Active Users (DAU) — last 30d avg | [TBD] | `last_active_at` rollup |
| Monthly Active Users (MAU) — last 90d avg | [TBD] | `last_active_at` rollup |
| Daily Active Wallets — last 30d avg | 0 at launch review | Zero tracker users/generations and zero PETContent supply |
| Total pets adopted | [TBD] | `pets` table count |
| Total AI generations completed | [TBD] | `generations` count where status = success |
| Total NFTs minted | 0 at BSC block 110,707,528 | `PETContent.totalSupply()` direct RPC |

### b. Geographical distribution of total users

[TBD: extract from request headers / Cloudflare analytics if available — sample distribution placeholder below]

| Region | Estimated % |
|---|---|
| Korea | [TBD] |
| Southeast Asia | [TBD] |
| North America | [TBD] |
| Europe | [TBD] |
| Other | [TBD] |

### c. Airdrop user data

**N/A** — no airdrop has been conducted or is scheduled. The project operates a points-only loyalty model with no token distribution.

### d. Additional metrics achieved

| Metric | Value | Notes |
|---|---|---|
| Public provenance contracts with verified addresses | 2 (PETContent, PetaGenTracker); production integration disabled, both returned `paused() = false` | Both contracts had zero activity/supply counters at launch review; PETActivity is planned |
| Security reviews | 1 internal code review (external audit planned) | 26+ findings remediated |
| Open-source SDK downloads (npm `@myaipet/petclaw-sdk`) | [TBD] | https://www.npmjs.com/package/@myaipet/petclaw-sdk |
| Historical on-chain volume (USDT), if any | [TBD: finance verification required] | Current payment rail is disabled |
| TVL | n/a (points-only economy, no custody) | — |

### e. Product stage

| Surface | Stage |
|---|---|
| Web app (https://app.myaipet.ai) | **Live on AWS EC2**; wallet auth live; payments and production on-chain integration disabled |
| PETContent NFT contract | **Deployed & verified on BSC; `paused() = false`, owner-minter active, supply 0; production integration disabled** |
| PetaGenTracker contract | **Deployed & verified on BSC; `paused() = false`, owner-relayer active, counters 0; production integration disabled** |
| PETToken / PETShop | **Legacy sources outside the live flow; deployment/address/owner evidence TBD** |
| PETActivity | **Planned; not deployed** |
| PetClaw SDK | **Live (npm, MIT, `@myaipet/petclaw-sdk` v1.6.1)** |
| PetClaw MCP server | **Live (`petclaw-mcp` binary shipped with the SDK)** |
| Browser extension v2.3.2 | **Downloadable developer/unpacked ZIP; not yet in the Chrome Web Store** |
| Telegram + Discord integrations | **Built but launch-disabled** |
| Pet Studio | **Live (`/studio`)**; paid checkout disabled; `/studio_test` removed |

---

## Q38 — Business model + current and planned revenue streams + detailed revenue breakdown

### Business model overview

MY AI PET currently runs a **points-based loyalty economy with external settlement disabled**. Granted credits and season points can be used in app, but users cannot buy credits and no paid subscription, premium action, or USDT marketplace route is enabled (`PAYMENTS_ENABLED=false`; subscription sales are also disabled). Configured USDT payment code is an unlaunched capability, not a current revenue claim. There is **no token mint into user hands** and **no airdrop**.

### Configured monetization paths (launch-disabled)

| Stream | Pricing | Settlement | Cumulative revenue to date (USDT-equiv) |
|---|---|---|---|
| **Credit purchases (USDT on BSC)** | Configured $5 / $20 / $50 tiers | Disabled; no current settlement | [TBD: finance-verified historical receipts only] |
| **Pay-per-action** | Configured single-use receipts | Disabled; no current settlement | [TBD: finance-verified historical receipts only] |
| **AI generation credit usage** | Internal granted-credit debit per enabled model | In-app usage, not cash revenue | n/a as revenue |
| **Marketplace** | Launch catalog currently exposes 14 active credit items across 3 categories; premium definitions exist but the paid route is disabled | Granted credits only at launch; no USDT settlement | n/a as current paid revenue |
| **Pet Studio membership/subscription** | Membership-gated catalog entries exist | Sales disabled; no current settlement | n/a as current paid revenue |

> Note: there is no live payment rail. SIWE wallet sign-in is live; the configured SIWE + USDT settlement path remains disabled. The retired Coinbase Onramp prototype is not shipped.

### Planned revenue streams (Q3–Q4 2026)

| Stream | Estimated launch | Mechanics |
|---|---|---|
| **Skill NFT secondary royalties** | TBD after audit | Requires a replacement contract or marketplace fee; the current PETContent contract has no royalty interface |
| **Pet Studio subscription Phase 2 tier expansion** | Q3–Q4 2026 | New higher-margin tiers for creator workflows |
| **Cross-server PetClaw protocol fees** | 2027 H1 | Voluntary tipping / settlement layer between conformant servers (research stage) |
| **Brand partnership / sponsored IP collaboration** | 2026 Q4 onward | In-app sponsored pet skins / collab events |

### Historical revenue breakdown (finance verification required)

[TBD: confirm with finance lead — illustrative split below.]

| Stream | Approx. share of current revenue |
|---|---|
| Credit purchases (USDT on BSC) | ~[TBD]% |
| Pay-per-action | ~[TBD]% |
| Marketplace items | ~[TBD]% |
| AI generation spend (in-app) | ~[TBD]% |
| Pet Studio subscription | ~[TBD]% (not currently on sale) |

---

## Q39 — Profitability / runway / financial sustainability

### Current status

[TBD — to be filled by finance lead. Suggested framing based on the template:]

| Item | Amount (USD) |
|---|---|
| Total funding received (to date) | [TBD] |
| Cumulative spending (project inception → 2026-05) | [TBD] |
| Current balance | [TBD] |
| Future monthly burn (from 2026-06) | [TBD: includes AI provider spend + AWS + salaries] |
| **Remaining operational runway (months)** | **[TBD]** |

**Sustainability narrative (draft):**

Funding, historical revenue, burn, and runway remain finance-owned `[TBD]` items. Current AWS cost must be verified in AWS Billing rather than inferred from architecture. AI-provider spend is bounded by application caps, but no break-even or accumulated-revenue claim should be made until bookkeeping evidence is attached.

---

## Q40 — Treasury management plan

[TBD: finance lead to insert holdings + onchain proof links]

| | No. tokens / fiat | Price per token | Total in USD | Proof |
|---|---|---|---|---|
| **Project treasury (on-chain)** | [TBD] | [TBD] | [TBD] | [TBD: BscScan link to treasury wallet] |
| **Fiat bank accounts** | [TBD] | — | [TBD] | [TBD: bank statement folder link] |

### Treasury management approach (narrative)

- Operating treasury is held in stablecoins (USDC / USDT) on BSC and in fiat bank accounts to insulate from market volatility.
- Multisig ownership transfer to Gnosis Safe is on the **Q3 2026 roadmap** — until that finalizes, contract ownership and the relayer key are held by the deployer wallet under hardware-wallet custody.
- No yield-farming, lending, or leverage on treasury funds.
- Quarterly internal treasury review.

---

## Q41 — Third-party platforms for asset storage

| Category | Provider | Details |
|---|---|---|
| Web hosting | AWS EC2 (nginx + PM2) | Signed immutable release artifacts are uploaded over the restricted operator PEM and atomically activated; production does not pull from GitHub. |
| Object storage (images, videos, avatars) | EC2-local `/opt/petclaw/uploads` | Access is mediated by the protected app route. Vercel Blob and S3 are not used by the live deployment. |
| Database | PostgreSQL 16 on the production EC2 host (via Prisma 7.x) | RDS/Neon migration material is historical; neither service backs the live database. |
| AI providers | fal.ai (Kling 1.6, FLUX, Seedance, Wan, MiniMax), Grok (x.ai) | Multi-provider fallback for resilience and cost; owners may attach their own LLM keys (BYOK, encrypted at rest) |
| Fiat onramp / payment rail | None in production; the Coinbase Onramp prototype was retired and removed | The configured future SIWE + USDT rail is disabled (`PAYMENTS_ENABLED=false`) |
| Wallet auth | RainbowKit + WalletConnect + SIWE | No custodial wallet — user holds keys |
| Email | [TBD: e.g., AWS SES / Postmark / etc.] | Transactional + support@myaipet.ai |

> **No user funds are custodied** by the platform, and no paid route is enabled at launch. If payment is approved later, the configured design settles directly on-chain subject to the documented launch gates.

---

## Q42 — Competitor analysis

| Metric | **MY AI PET** | Competitor A: **Replika** (centralized AI companion) | Competitor B: **Aavegotchi** (Web3 pet GameFi) | Competitor C: **Character.AI** (centralized AI characters) | Competitor D: **Tamadoge** (memecoin pet GameFi) |
|---|---|---|---|---|---|
| **Companion AI memory** | 5-layer persistent + SOUL export (portable) | Closed, server-side memory; not portable | None (NFT-only — stats, no AI memory) | Closed, server-side; recent caps controversy | None (memecoin theme — minimal AI) |
| **On-chain identity** | Wallet-derived Pet DID in app; NFT mint integration disabled and current supply 0 | None | Yes (NFT) | None | Yes (NFT) |
| **Open protocol / portability** | **Yes — MIT-licensed PetClaw SDK + MCP server + `/.well-known/pet-card.json`** | No | No | No | No |
| **AI image + video generation** | Multi-provider (fal.ai Kling + Grok), 6 styles, pet-character anchor | No (text-only chat) | No | No (text-focused) | No |
| **Battle / gameplay loop** | Pokémon-style 4-skill PvP + 30-stage PvE story mode | None | Yes (Haunt minigame + battle) | None | Limited |
| **Audit posture** | 1 internal code review (26+ fixes); external audit planned | n/a (no smart contracts) | Audited | n/a | Audited |
| **Wallet-less onboarding** | Read-only guest tour (`?tour=1`) without a wallet; SIWE wallet sign-in required for full features | Yes (web account) | Wallet required from start | Yes (web account) | Wallet required |
| **Compliance posture (token)** | Points-only, no token in user hands, no airdrop | n/a | Native token + DeFi loops | n/a | Memecoin token, high volatility |

### Our competitive edge (one-line summary)

Our differentiation combines sovereign-portable companion memory, substantial PvP/PvE gameplay, an open PetClaw protocol, and public-but-unused BSC provenance contracts. The contracts have an internal review only; external audit and production integration remain future gates.

---

# Appendix A — Smart contract addresses (BSC mainnet)

| Contract | Address | BscScan |
|---|---|---|
| PETContent (ERC-721) | `0xB31B656D3790bFB3b3331D6A6BF0abf3dd6b0d9c` | https://bscscan.com/address/0xB31B656D3790bFB3b3331D6A6BF0abf3dd6b0d9c |
| PetaGenTracker | `0x590D3b2CD0AB9aEE0e0d7Fd48E8810b20ec8Ac0a` | https://bscscan.com/address/0x590D3b2CD0AB9aEE0e0d7Fd48E8810b20ec8Ac0a |
| PETToken (legacy source; deployment evidence TBD) | `[TBD]` | `[TBD]` |
| PETShop (legacy source; deployment evidence TBD) | `[TBD]` | `[TBD]` |
| PETActivity (planned; not deployed) | n/a | n/a |
| BSC USDT (interaction target) | `0x55d398326f99059fF775485246999027B3197955` | https://bscscan.com/address/0x55d398326f99059fF775485246999027B3197955 |

# Appendix B — Public surfaces

- **App:** https://app.myaipet.ai
- **Protocol manifest:** https://app.myaipet.ai/.well-known/pet-card.json
- **Twitter / X:** https://x.com/MYAIPETS
- **PetClaw SDK (npm):** https://www.npmjs.com/package/@myaipet/petclaw-sdk (v1.6.1)
- **PetClaw MCP server:** `petclaw-mcp` binary shipped with the SDK (`npx -p @myaipet/petclaw-sdk petclaw-mcp`)
- **Support email:** support@myaipet.ai
- **Security contact:** Available at https://app.myaipet.ai/.well-known/security.txt

# Appendix C — Gap-fill checklist (for team to complete before submission)

| Section | Item | Owner | Source |
|---|---|---|---|
| Q2.d | Publish public Dune dashboard URL | Data lead | New Dune workbook |
| Q3 | Record launch-review on-chain counters and any later activity | Eng / on-chain | Direct RPC + PetaGenTracker/PETContent logs |
| Q3 | Insert live off-chain registered user count | Eng | `users` table |
| Q3 | Insert finance-verified historical revenue per stream, if any | Finance | Confirmed `credit_purchases` + `consumed_payments`, deduplicated by transaction hash; do not count item/reward ledgers as cash revenue |
| Q15 | Names + LinkedIn + GitHub + CV per developer | HR / Founder | Internal |
| Q15 | Per-developer commit counts on aipet-project + petclaw-sdk | Eng lead | `git shortlog -sn` |
| Q19 | Replace Q1/Q2 2026 month estimates with exact commit-month dates if needed | Eng lead | `git log` |
| Q35 | Use-of-proceeds buckets and current spend % | Finance | Cap table + bookkeeping |
| Q36 | Past + future 12-month cash flow + FTE counts | Finance | Bookkeeping |
| Q37.a | DAU / MAU / total wallets / total generations / total NFTs minted | Data lead | `/admin/analytics` + BscScan |
| Q37.b | Geographic distribution % | Data lead | Cloudflare analytics / IP rollup |
| Q37.d | npm download count for petclaw-sdk | Eng | npmjs.com badge |
| Q38 | % composition of revenue per stream | Finance | DB rollup |
| Q39 | Total funding / cumulative spend / current balance / monthly burn / runway months | Finance | Bookkeeping + bank statements |
| Q40 | Treasury holdings (tokens, fiat) + on-chain proof links | Finance | BscScan + bank statements |
| Q41 | Confirm email provider | Eng | infra config |
| App. A | Supply evidence for any legacy PETToken/PETShop deployment claim; keep PETActivity marked planned | Eng | Deployment receipts + BscScan verification + owner-state proof |
