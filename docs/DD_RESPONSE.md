# MY AI PET — Binance DD Questionnaire (Draft Responses)

> Project: **MY AI PET** (PetClaw Protocol)
> Network: BNB Smart Chain (BSC) mainnet
> Submission date: 2026-06-01
> This document covers the **green-highlighted questions (Q2.d, 3, 4, 5, 6, 14, 15, 19, 35–42)** assigned to the dev team. Q1, 2.a–c, 7–13, 16–18, 20–34, 43+ are handled by other team members.

---

# Overview

## Q2.d — Dune Dashboard (user statistics / TVL / Txs amount)

**Status:** Public Dune dashboard is in preparation — target publish date: **mid-June 2026**.

Until the public Dune URL goes live, all on-chain activity is independently verifiable on BscScan against our deployed contracts:

| Metric | Source |
|---|---|
| Generation events (mints + interactions) on-chain | https://bscscan.com/address/0x590D3b2CD0AB9aEE0e0d7Fd48E8810b20ec8Ac0a (PetaGenTracker) |
| AI content NFTs minted | https://bscscan.com/address/0xB31B656D3790bFB3b3331D6A6BF0abf3dd6b0d9c (PETContent) |
| Real-time in-app activity feed | https://app.myaipet.ai (homepage) |
| In-app analytics (DAU / generations / chains / cohorts) | https://app.myaipet.ai/admin/analytics |

The Dune dashboard will surface, at minimum:
- Daily and cumulative on-chain events (mints + activity recordings) — PetaGenTracker + PETActivity + PETContent
- Unique wallet count interacting with the contracts
- USDT volume through the credit-purchase pipeline
- Gas spend by contract
- 7d / 30d cohort trend lines

> **Note on TVL:** MY AI PET operates a **points-based loyalty economy** and does not custody user funds in any staking pool, lending vault, or escrow contract. Accordingly, there is no TVL figure to report. Volume metrics (USDT credit purchases + NFT mint volume) will be surfaced on the Dune dashboard in lieu of TVL.

---

## Q3 — Products, status, on-chain & off-chain users, business model, revenue

| Product | Development Phase | On-chain User Amount | Off-chain User Amount | Business Model | Revenue Made (cumulative, USD) |
|---|---|---|---|---|---|
| **MY AI PET — Web App** (https://app.myaipet.ai) | **Launched on BSC mainnet** | [TBD: insert wallet count with ≥1 PetaGenTracker tx] | [TBD: registered user count from `users` table] | Credit purchases (USDT/USDC fiat-onramp) + action-pay (per premium action) + marketplace (USDT or in-app credits) | [TBD: from `credit_purchases.amount_usd` + `item_purchases`] |
| **PETContent (ERC-721 NFT)** | **Launched on BSC mainnet** | [TBD: minter count from contract logs] | n/a | NFT mint fees + secondary royalties (planned) | [TBD: from on-chain mint events × current pricing] |
| **PetaGenTracker (activity contract)** | **Launched on BSC mainnet** | [TBD: unique recorder wallet count] | n/a | n/a (infrastructure — gas only) | $0 (infra contract, no revenue) |
| **PETShop / PETToken / PETActivity** (utility contracts) | Deployed but **not actively distributed** — points-only operating model | n/a — no token in user hands | n/a | None active (see notes below) | $0 |
| **PetClaw SDK** (open MCP protocol, npm `petclaw-sdk` v1.3.0) | **Published, open-source MIT** | n/a (off-platform SDK) | [TBD: npm download count + GitHub stars at submission] | None — public good (drives platform demand) | $0 (strategic distribution layer) |
| **PetClaw Browser Extension v2.0.2** | **Launched (Chrome Web Store)** | shares wallet with web app | [TBD: install count] | Shares web-app revenue (no separate paywall) | n/a |
| **Telegram + Discord bots** | **Launched** | shares wallet with web app | [TBD: chat user count] | Shares web-app revenue | n/a |
| **Pet Studio v3 (Capcut-style editor)** | **In `/studio_test` (private staging)** | n/a | Internal QA only | Tiered subscription (Phase 2) + per-generation credit spend | $0 (pre-launch) |
| **Total Revenue Made (cumulative through 2026-05-31)** | — | — | — | — | **[TBD: sum to insert from analytics DB]** |

### Notes on business model

MY AI PET runs a **points-based loyalty economy**. Concretely:
- There is **no live $PET token mint into user hands**.
- There is **no buyback-and-burn** mechanism.
- There is **no token airdrop** active or scheduled.
- The PETToken / PETShop / PETActivity contracts remain deployed on mainnet for compliance optionality (Ownable2Step pausable contracts that the team controls), but they are not part of the live user flow. Commit `7c20c0ec` removed all token-mint traces from the live app on 2026-04. The public-facing protocol manifest (`/.well-known/pet-card.json`) makes this explicit.

Active revenue streams (detail in Q38 below):
1. **Credit purchases** (USDT on BSC via 5-layer-verified pipeline)
2. **Coinbase Onramp** (fiat → USDC on Base, session-token auth)
3. **Pay-per-action** (single-use USDT receipts for premium in-app actions: stat upgrades, premium training, marketplace, Pet Studio)
4. **AI generation spend** (credit burn per image/video generation, tier-priced by duration and provider)
5. **Marketplace** (31 items across 5 categories — USDT or in-app points)
6. **Pet Studio subscription** (Phase 2 tiered subscription — fiat / on-chain)

---

## Q4 — Description and highlights of the products offered

### 4.1 What MY AI PET is

MY AI PET is a **Web3 AI companion platform on BSC**. Users connect a wallet, adopt an AI-driven pet (either via natural-language chat with our AI counselor or via photo upload of their real pet), and interact with that pet through daily activities — feeding, playing, training, talking — while also generating images and videos of the pet using AI. Generation events and content-NFT minting are written to BSC via the on-chain contracts; **these on-chain writes are currently paused (holding period)** pending an external audit and a planned Base migration, and re-enable via a single `BLOCKCHAIN_ENABLED` flag (see `web/src/lib/blockchain.ts` and the `/contracts` page).

The platform is built around a **portable, memory-rich, sovereign-AI companion** — a stack we call **the PetClaw protocol** and have published as an open MIT-licensed SDK so the same pet identity can move across any MCP-compatible client (Claude Code, Cursor, Gemini CLI, etc.).

### 4.2 Key Features

| # | Feature | Detail |
|---|---|---|
| 1 | **Multi-modal adoption** | Two adoption flows: (a) AI chat with a counselor agent that extracts pet attributes (name/species/personality/traits), (b) photo upload of a real pet. Both fail-closed under content moderation. |
| 2 | **AI image + video generation (6 styles)** | Per-pet, character-anchored AI image and short-video gen. Multi-provider fallback (fal.ai Kling 3.0, Grok x.ai) for resilience and cost optimization. |
| 3 | **Five-layer persistent memory** | (i) curated facts (`MEMORY.md`), (ii) owner profile (`USER.md`), (iii) session log, (iv) lexical pre-fetch, (v) post-turn LLM extraction. Memories survive across sessions and devices. |
| 4 | **9 mood states + 6 stats + 5 evolution stages** | Tamagotchi-style stat decay (happiness / energy / hunger / bond / EXP / level), 9 derived mood states (ecstatic → starving), evolution unlocks at level thresholds. |
| 5 | **Adventure Mode V2 — Pokémon-style 4-skill PvP** | Turn-based battles, 4 skill slots, element type advantage (Fire / Water / Grass / Electric), HP/EP system, EXP / season-point / rare-skill (5%) drops. |
| 6 | **PvE Story Mode — 30 stages, 6 regions, boss progression** | Grasslands → Volcano → Ocean → Storm → Shadow → Dragon. Boss intro/victory/defeat dialogue, 3-star rating (HP remaining + turn count), first-clear guaranteed skill drops. |
| 7 | **NFT minting (PETContent ERC-721)** | Generated content (image / video) can be minted as ERC-721 NFTs via a relayer pattern (gas paid by platform, user only signs). Token URI points to Vercel Blob storage. **On-chain minting is currently paused (holding period); re-enabled via `BLOCKCHAIN_ENABLED`.** |
| 8 | **On-chain activity ledger (PetaGenTracker)** | Gas-efficient batched on-chain recording of pet generation events; max 50 events per batch tx via relayer. **Currently paused (holding period).** |
| 9 | **5-layer payment verification** | Every paid credit purchase passes: (i) tx hash format, (ii) replay prevention, (iii) eth_getTransactionReceipt confirmation, (iv) sender match, (v) value/amount match. Single-use paywall receipts. |
| 10 | **Coinbase Onramp** | Fiat → USDC on Base, session-token authenticated (CDP pending full approval). Lowers Web3 onboarding friction for credit-card-first users. |
| 11 | **Social layer** | Public gallery, likes, threaded comments (with orphan-prevention on parent delete), follow / following graph, weekly leaderboard. |
| 12 | **Marketplace — 31 items across 5 categories** | Skill NFTs (rare skills as tradeable NFTs — in progress), cosmetics, consumables, evolution items, premium training. Priced in USDT or points. |
| 13 | **PetClaw SDK + MCP server (open, MIT)** | `petclaw-sdk` v1.3.0 on npm. `npx petclaw-mcp` exposes companion-chat, persona-mirror, memory-recall, soul-export as MCP tools. `/.well-known/pet-card.json` discovery file is conformant with the PetClaw spec. |
| 14 | **SOUL export — sovereign portability** | Canonical JSON bundle (memories + persona + skills + consent settings) with SHA-256 integrity hash. A pet raised on our server can move to another conformant server or run locally without losing identity. |
| 15 | **Cross-surface presence** | Web (primary), browser extension (roaming desktop pet, page-aware, skill registry), Telegram bot, Discord bot. |
| 16 | **Smart-contract security** | 1 internal security code review — 26+ findings remediated (full report in `docs/AUDIT_REPORT.md`); **external third-party audit planned pre-launch (firm TBD)**. Contracts use `Ownable2Step`, `Pausable`, `ReentrancyGuard` on purchase/mint; ERC20Pausable on PETToken. |
| 17 | **Pet Studio v3 (Capcut-style multi-provider AI video editor)** | Multi-provider AI video gen with pet-character anchor, timeline editing, Phase 2 subscription model, Phase 3 editor — currently in `/studio_test`. |

### 4.3 Pricing reference (PETShop tiers, USDT on BSC)

| Tier | Price | Credits received |
|---|---|---|
| Starter | $5 USDT | 100 credits |
| Creator | $20 USDT | 500 credits |
| Pro | $50 USDT | 2,000 credits |

> Credits are a **closed-loop in-app utility** (consumed on AI generation / premium actions), not a token-denominated balance. Grant amounts match `web/src/app/api/credits/purchase/route.ts`.

### 4.4 Tech stack

Next.js 16 + React 19 + TypeScript (web) · FastAPI + SQLAlchemy async (Python backend) · Solidity 0.8.28 + OpenZeppelin 5.x + Hardhat 3 (contracts) · Neon Postgres + Prisma 7.x (DB) · fal.ai Kling 3.0 + Grok (x.ai) (AI providers) · Vercel Blob + AWS S3 (storage) · RainbowKit + wagmi + viem + SIWE + JWT (Web3 auth) · `next/wbg` AWS-only deployment stack (Vercel + Neon dependencies dropped 2026-Q1).

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
| 3 | **Real BSC mainnet activity** | Generation events + content NFTs are written to BSC mainnet via PetaGenTracker + PETContent — non-MEV / non-DeFi network usage. |
| 4 | **Audit-grade reference patterns** | Open SDK + publicly verifiable BscScan contracts give other GameFi / SocialFi teams a starting point: relayer-batched activity tracking, 5-layer payment verification, Ownable2Step + Pausable safety harness, single-use paywall receipts. |
| 5 | **Web2 → Web3 onboarding bridge** | Coinbase Onramp (fiat → USDC) + wallet-less first-touch flow + AI-counselor adoption chat lower onboarding friction for non-crypto-native users. |

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
> The primary git committer of record on the deployed codebase is `blockschool`. Total commit count to date: **[TBD — run `git log --oneline | wc -l` at submission time. Currently 101 commits in 2026 alone.]**

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
| **2026 Q1** | PETToken (ERC-20) deployed + BscScan-verified | Finished |
| 2026 Q1 | PETShop deployed + BscScan-verified | Finished |
| 2026 Q1 | PETContent (ERC-721) deployed + BscScan-verified (`0xB31B656D...`) | Finished |
| 2026 Q1 | PetaGenTracker deployed + BscScan-verified (`0x590D3b2C...`) | Finished |
| 2026 Q1 | PETActivity deployed + BscScan-verified | Finished |
| 2026 Q1 | **Internal security code review** — 26+ findings remediated (`docs/AUDIT_REPORT.md`) | Finished |
| 2026 Q1 | AI image + video generation (6 styles) — live | Finished |
| 2026 Q1 | NFT minting via PETContent (relayer pattern) — built; on-chain writes currently paused (holding period) | Finished (paused) |
| 2026 Q1 | PetaGenTracker batch recording (relayer, max 50/batch) — built; on-chain writes currently paused (holding period) | Finished (paused) |
| 2026 Q1 | Coinbase Onramp integration (Base/USDC, session-token auth) — live (pending CDP full approval) | Finished |
| 2026 Q1 | Arena battle system + Leaderboard / ranking — live | Finished |
| 2026 Q1 | Social layer (gallery + likes + comments + follow graph) — live | Finished |
| 2026 Q1 | Marketplace (31 items, 5 categories) — live | Finished |
| 2026 Q1 | Pet evolution (5 stages) — live | Finished |
| 2026 Q1 | **5-layer on-chain TX verification + single-use paywall receipts** — production | Finished |
| 2026 Q2 | **Adventure Mode V2 (Pokémon-style PvP)** — 4 skill slots, type advantage, EXP/season-point/skill drops | Finished |
| 2026 Q2 | **PvE Story Mode — 30 stages, 6 regions, boss progression (up to Dragon King Bahamut Lv.60)** | Finished |
| 2026 Q2 | Telegram bot + Discord bot (cross-surface presence) | Finished |
| 2026 Q2 | Browser Extension v2.0.2 (roaming desktop pet, page-aware, skill registry, live test-drive) | Finished |
| 2026 Q2 | **PetClaw SDK v1.3.0 published (npm, MIT, open)** + MCP server | Finished |
| 2026 Q2 | Admin analytics, mobile responsiveness, rate-limit hardening | Finished |
| 2026 Q2 | AWS-only deployment stack (Vercel + Neon dual-stack retired) | Finished |
| 2026 Q2 | Token-mint trace removal — explicit points-only economy | Finished |
| 2026 Q2 | **Pet Studio v1 (Phase 1, multi-provider AI video gen with pet character anchor)** | Finished |
| 2026 Q2 | **Pet Studio v2 (dark redesign + Phase 2 subscription + Phase 3 editor — Capcut-style)** | Finished (in `/studio_test`) |
| **2026 Q2 (current)** | DD audit cleanup + public SDK staging for new GitHub org | In progress |

### 19.2 Updated roadmap

| Timeline | Milestone | Status |
|---|---|---|
| **2026 Q3** | **Public Dune dashboard** (user / tx / volume) | Upcoming |
| 2026 Q3 | **Skill NFTs (PETContent)** — rare skills as tradeable NFTs | Upcoming |
| 2026 Q3 | **Battle results on-chain (PETActivity)** — `BattleHistory` table is ready | Upcoming |
| 2026 Q3 | Skill upgrade history on-chain | Upcoming |
| 2026 Q3 | Pet Studio v3 production rollout (currently in `/studio_test`) | Upcoming |
| 2026 Q3 | Custom domain (`myaipet.com`) | Upcoming |
| 2026 Q3 | i18n (Korean / English toggle) + mobile responsive polish | Upcoming |
| 2026 Q3 | Investor logo verification + Twitter cleanup (`@MYAIPETS`) | Upcoming |
| 2026 Q3 | **External third-party smart-contract audit** (firm TBD) + re-enable on-chain writes (`BLOCKCHAIN_ENABLED`) post-audit | Upcoming |
| 2026 Q3 | **Multisig ownership transfer to Gnosis Safe** (Ownable2Step finalization) | Upcoming |
| 2026 Q3 | USDT purchase end-to-end test (BNB wallet, real-user) | Upcoming |
| 2026 Q3 | Coinbase Onramp full approval (pending CDP review) | Upcoming |
| **2026 Q4** | Pet Studio subscription Phase 2 tier expansion + creator marketplace | Future Plans |
| 2026 Q4 | PetClaw SDK adoption push to MCP-client ecosystem (Claude Code / Cursor / Gemini CLI) | Future Plans |
| 2026 Q4 | Content moderation hardening (IP filtering on uploads + generated content) | Future Plans |
| 2026 Q4 | Removal of unused legacy code paths (FastAPI backend, legacy Vite frontend) | Future Plans |
| **2027 H1** | Cross-chain expansion (multi-EVM PetClaw conformance) | Future Plans |

### 19.3 Differences from the original roadmap and rationale

| Original plan | Current direction | Why we changed |
|---|---|---|
| Active **$PET token economy** with mint into user hands | **Points-only loyalty economy** (token contracts deployed but not actively distributed) | Compliance posture: avoid any artifact that could be construed as a financial instrument absent clear regulatory framing. Commit `7c20c0ec` removed all token-mint traces from the live app. Public-facing manifest (`/.well-known/pet-card.json`) makes this explicit. |
| **Single-surface (web only)** | Multi-surface: web + browser extension + Telegram bot + Discord bot | Companion AI works best when always-present. We expanded the surface to match user behavior — the pet is now reachable wherever the user is. |
| **Closed product only** | Closed product **+ open PetClaw SDK + MCP server** | We concluded the protocol layer is more strategic than the product layer. Open SDK gives us distribution via every MCP-compatible client and de-risks platform-lock-in concerns voiced by power users. |
| **Vercel + Neon hosted stack** | **AWS-only stack** (PR `784072ef`, 2026-Q1) | Operational simplification, cost control, and a single root-of-trust for compliance once we hit Vercel/Neon free-tier ceilings. |
| **Pet Studio Phase 1 shipping live on /studio** | Phase 1 **reverted**; Phase 3 (Capcut-style) iterating in `/studio_test` | Phase 1 quality bar was below user expectation for a video editor. We moved iteration off the live URL into a staging path (commit `00082268`, 2026-05) to protect the live brand. |

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
| Cumulative revenue (USDT/USDC) | [TBD: sum from `credit_purchases.amount_usd` + `item_purchases`] | [TBD: forecast — primarily Pet Studio subscription + credit purchase + marketplace] |
| Net (revenue − opex) | [TBD] | [TBD] |
| Expansion purpose | n/a (consolidation phase) | Pet Studio v3 production launch + PetClaw SDK distribution + cross-chain expansion |
| Strategic objectives | n/a | Accelerate user acquisition via MCP-client embedding + Pet Studio subscription monetization + content NFT volume |

**Known unit economics (from `SETUP.md`):**
- 5-second AI video generation: cost ~$0.50 (Kling 3.0 via fal.ai) vs revenue ~$1.50 → ~67% gross margin per video.
- Fixed infra (excluding AI provider spend): ~$12 / month (after AWS migration).
- Base + BNB gas per day combined: ~$2 (typical day, no batch backfill).

---

## Q37 — Historical daily stats + adoption metrics

### a. Users data

| Metric | Value | Source |
|---|---|---|
| Total registered users (off-chain) | [TBD] | `users` table |
| Unique wallets with ≥1 on-chain interaction | [TBD] | PetaGenTracker + PETContent on-chain |
| Daily Active Users (DAU) — last 30d avg | [TBD] | `last_active_at` rollup |
| Monthly Active Users (MAU) — last 90d avg | [TBD] | `last_active_at` rollup |
| Daily Active Wallets — last 30d avg | [TBD] | on-chain logs |
| Total pets adopted | [TBD] | `pets` table count |
| Total AI generations completed | [TBD] | `generations` count where status = success |
| Total NFTs minted | [TBD] | PETContent `Transfer` events from `0x0` |

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
| Smart contracts deployed (BSC mainnet) | 5 (PETToken, PETShop, PETContent, PetaGenTracker, PETActivity) | All BscScan-verified |
| Security reviews | 1 internal code review (external audit planned) | 26+ findings remediated |
| Open-source SDK downloads (npm `petclaw-sdk`) | [TBD] | https://www.npmjs.com/package/petclaw-sdk |
| Cumulative on-chain volume (USDT credit purchases) | [TBD] | from PETShop + verified credit-purchase txs |
| TVL | n/a (points-only economy, no custody) | — |

### e. Product stage

| Surface | Stage |
|---|---|
| Web app (https://app.myaipet.ai) | **Live (BSC mainnet)** |
| PETContent NFT contract | **Deployed & verified (BSC mainnet); on-chain writes paused (holding period)** |
| PetaGenTracker contract | **Deployed & verified (BSC mainnet); on-chain writes paused (holding period)** |
| PETToken / PETShop / PETActivity contracts | **Deployed, not actively distributed** (compliance posture) |
| PetClaw SDK | **Live (npm, MIT, v1.3.0)** |
| PetClaw MCP server | **Live (`npx petclaw-mcp`)** |
| Browser extension v2.0.2 | **Live (Chrome Web Store)** |
| Telegram + Discord bots | **Live** |
| Pet Studio v3 | **Private staging (`/studio_test`)** — production rollout 2026 Q3 |

---

## Q38 — Business model + current and planned revenue streams + detailed revenue breakdown

### Business model overview

MY AI PET runs a **points-based loyalty economy**. Users buy credits (a **closed-loop in-app utility balance — not a token and not token-denominated**) using USDT or USDC fiat-onramp, and spend those credits on AI content generation, premium actions, marketplace items, and Pet Studio subscriptions. There is **no token mint into user hands** and **no airdrop**, by design (compliance posture).

### Current revenue streams (live)

| Stream | Pricing | Settlement | Cumulative revenue to date (USDT-equiv) |
|---|---|---|---|
| **Credit purchases (USDT on BSC)** | $5 / $20 / $50 tiers (Starter / Creator / Pro) | USDT on-chain → credits in app; 5-layer-verified | [TBD] |
| **Coinbase Onramp (USDC on Base)** | Fiat → USDC, session-token auth | USDC → credits | [TBD] |
| **Pay-per-action** | Per-action USDT micropayment for premium actions (stat upgrades, premium training, marketplace) | Single-use receipts | [TBD] |
| **AI generation spend** | Credit burn per image (~30 credits) / video (~30 credits / 5s) | In-app credit ledger | [TBD: derive from `generations` × tier price] |
| **Marketplace** | USDT or in-app points for 31 items (skill NFTs, cosmetics, consumables, evolution items, premium training) | USDT on-chain (for paid items) + in-app | [TBD] |
| **Pet Studio Phase 2 subscription** | Tiered monthly subscription | Fiat / on-chain | [TBD — pre-production launch] |

### Planned revenue streams (Q3–Q4 2026)

| Stream | Estimated launch | Mechanics |
|---|---|---|
| **Skill NFT secondary royalties** | Q3 2026 | % cut on PETContent (skill NFT) secondary trading |
| **Pet Studio subscription Phase 2 tier expansion** | Q3–Q4 2026 | New higher-margin tiers for creator workflows |
| **Cross-server PetClaw protocol fees** | 2027 H1 | Voluntary tipping / settlement layer between conformant servers (research stage) |
| **Brand partnership / sponsored IP collaboration** | 2026 Q4 onward | In-app sponsored pet skins / collab events |

### Revenue breakdown (rough estimate of current run-rate composition)

[TBD: confirm with finance lead — illustrative split below.]

| Stream | Approx. share of current revenue |
|---|---|
| Credit purchases (USDT + Coinbase Onramp) | ~[TBD]% |
| Pay-per-action | ~[TBD]% |
| Marketplace items | ~[TBD]% |
| AI generation spend (in-app) | ~[TBD]% |
| Pet Studio subscription | 0% (pre-launch) |

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

The project is sustained by a combination of (i) initial funding, (ii) accumulated revenue from credit purchases + marketplace + action-pay, and (iii) operational discipline (AWS-only consolidation, multi-provider AI fallback for cost optimization, $12/mo fixed-infra footprint excluding variable AI spend). With Pet Studio Phase 2 subscription launching in 2026 Q3–Q4 and PetClaw SDK distribution driving inbound, we project [TBD: break-even quarter target].

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
| Web hosting | AWS (EC2 + RDS Postgres) | After Vercel/Neon migration (2026 Q1) — single-cloud consolidation |
| Object storage (images, videos, avatars) | Vercel Blob + AWS S3 | Vercel Blob for active user content; S3 for backups |
| Database | AWS RDS PostgreSQL (via Prisma 7.x) | Migrated from Neon in 2026 Q1 |
| AI providers | fal.ai (Kling 3.0), Grok (x.ai) | Multi-provider fallback for resilience and cost |
| Fiat onramp | Coinbase (Coinbase Pay / Onramp) | Session-token auth; CDP full approval pending |
| Wallet auth | RainbowKit + WalletConnect + SIWE | No custodial wallet — user holds keys |
| Email | [TBD: e.g., AWS SES / Postmark / etc.] | Transactional + support@myaipet.ai |

> **No user funds are custodied** by the platform. All paid transactions settle directly on-chain (BSC USDT or Base USDC).

---

## Q42 — Competitor analysis

| Metric | **MY AI PET** | Competitor A: **Replika** (centralized AI companion) | Competitor B: **Aavegotchi** (Web3 pet GameFi) | Competitor C: **Character.AI** (centralized AI characters) | Competitor D: **Tamadoge** (memecoin pet GameFi) |
|---|---|---|---|---|---|
| **Companion AI memory** | 5-layer persistent + SOUL export (portable) | Closed, server-side memory; not portable | None (NFT-only — stats, no AI memory) | Closed, server-side; recent caps controversy | None (memecoin theme — minimal AI) |
| **On-chain identity** | Pet DID (`wallet × petId`) + NFT minting | None | Yes (NFT) | None | Yes (NFT) |
| **Open protocol / portability** | **Yes — MIT-licensed PetClaw SDK + MCP server + `/.well-known/pet-card.json`** | No | No | No | No |
| **AI image + video generation** | Multi-provider (fal.ai Kling + Grok), 6 styles, pet-character anchor | No (text-only chat) | No | No (text-focused) | No |
| **Battle / gameplay loop** | Pokémon-style 4-skill PvP + 30-stage PvE story mode | None | Yes (Haunt minigame + battle) | None | Limited |
| **Audit posture** | 1 internal code review (26+ fixes); external audit planned | n/a (no smart contracts) | Audited | n/a | Audited |
| **Wallet-less onboarding** | Yes (web flow without wallet sign-up; wallet optional for full features) | Yes (web account) | Wallet required from start | Yes (web account) | Wallet required |
| **Compliance posture (token)** | Points-only, no token in user hands, no airdrop | n/a | Native token + DeFi loops | n/a | Memecoin token, high volatility |

### Our competitive edge (one-line summary)

We are the **only** project at the intersection of (i) deep AI companion with sovereign-portable memory, (ii) verifiable on-chain identity, (iii) actual gameplay-loop depth (PvP + PvE), and (iv) audit-grade contracts on BSC — and we are deliberately neutral on token economics so the protocol layer can stay open.

---

# Appendix A — Smart contract addresses (BSC mainnet)

| Contract | Address | BscScan |
|---|---|---|
| PETContent (ERC-721) | `0xB31B656D3790bFB3b3331D6A6BF0abf3dd6b0d9c` | https://bscscan.com/address/0xB31B656D3790bFB3b3331D6A6BF0abf3dd6b0d9c |
| PetaGenTracker | `0x590D3b2CD0AB9aEE0e0d7Fd48E8810b20ec8Ac0a` | https://bscscan.com/address/0x590D3b2CD0AB9aEE0e0d7Fd48E8810b20ec8Ac0a |
| PETToken (ERC-20) | `[TBD: insert from deploy output]` | https://bscscan.com/address/[TBD] |
| PETShop | `[TBD]` | https://bscscan.com/address/[TBD] |
| PETActivity | `[TBD]` | https://bscscan.com/address/[TBD] |
| BSC USDT (interaction target) | `0x55d398326f99059fF775485246999027B3197955` | https://bscscan.com/address/0x55d398326f99059fF775485246999027B3197955 |

# Appendix B — Public surfaces

- **App:** https://app.myaipet.ai
- **Protocol manifest:** https://app.myaipet.ai/.well-known/pet-card.json
- **Twitter / X:** https://x.com/MYAIPETS
- **PetClaw SDK (npm):** https://www.npmjs.com/package/petclaw-sdk (v1.3.0)
- **PetClaw MCP server:** `npx petclaw-mcp`
- **Support email:** support@myaipet.ai
- **Security contact:** Available at https://app.myaipet.ai/.well-known/security.txt

# Appendix C — Gap-fill checklist (for team to complete before submission)

| Section | Item | Owner | Source |
|---|---|---|---|
| Q2.d | Publish public Dune dashboard URL | Data lead | New Dune workbook |
| Q3 | Insert live on-chain wallet count | Eng / on-chain | PetaGenTracker logs |
| Q3 | Insert live off-chain registered user count | Eng | `users` table |
| Q3 | Insert cumulative revenue per stream | Finance | `credit_purchases` + `item_purchases` + `reward_redemptions` |
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
| App. A | Insert PETToken / PETShop / PETActivity contract addresses | Eng | `web/.env` or deploy output |
