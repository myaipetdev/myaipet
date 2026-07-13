# MY AI PET — Project Architecture

> Updated: 2026-07-13. Reflects the EC2 single-box deployment; the earlier Vercel + FastAPI + token-economy description is obsolete.

## Overview

MY AI PET is a Web3-native AI pet platform. Users sign in with their wallet (SIWE-style message signing), adopt AI-driven pets, interact with them through daily activities, generate images and videos in Pet Studio, and earn **season points** — a non-financial recognition score ("Season Rewards"). The platform is deliberately **no-token**: there is no platform token and no redemption promise. The system is a single Next.js App Router monolith (`web/`), accompanied by Solidity contracts (on-chain features currently paused), the PetClaw SDK/CLI, and a Chrome desktop-pet extension.

---

## Tech Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Web (primary) | Next.js 16, React 19, TypeScript | App Router, `output: "standalone"` — the entire app (UI + API) |
| Runtime | Node.js under PM2 (`petclaw-web`) behind nginx on EC2 | Deploy via `deploy/ec2-pull.sh`; `docker-compose.yml` is an optional container path |
| Smart Contracts | Solidity 0.8.28, Hardhat, OpenZeppelin | Deployed on BSC, currently **paused**; Base migration planned (see `/contracts` page) |
| Database | AWS RDS PostgreSQL (production) | Prisma ORM v7; prod credentials in `web/.env.production` (local `.env` may point at a stale dev DB) |
| AI | LLM router (`web/src/lib/llm/router.ts`) | Grok (x.ai) by default; owner-connected BYOK models via `/api/petclaw/models`; images via Grok (+ optional fal.ai pet-LoRA); video via Studio provider catalog |
| Storage | S3 or local disk (`web/src/lib/storage.ts`) | `STORAGE_PROVIDER=s3` or default local `/opt/petclaw/uploads` served by nginx at `/uploads` |
| Wallet | RainbowKit + wagmi + `siwe` | Wallet signature → JWT (`jose`); no email/password accounts |
| Payments | USDT (BEP-20) on BSC, verified on-chain | SIWE + USDT only — no Stripe, no cards, no email billing |

**Live URLs:**
- App: https://app.myaipet.ai (Next.js on EC2)
- Marketing: https://myaipet.ai — a **separate static copy** served by nginx from `/opt/petclaw/landing-assets` (source in `landing-assets/`; synced manually, not part of the app deploy)

---

## Directory Structure

```
aipet-project/
├── web/                        # Next.js 16 — the entire application
│   ├── src/
│   │   ├── app/api/            # ~150 API route handlers (single API surface)
│   │   ├── components/         # React UI components
│   │   └── lib/                # auth (SIWE/JWT/PATs), prisma, llm/ (router),
│   │                           #   petclaw/ (agent, memory, skills), studio/,
│   │                           #   payments + onchain, storage, petMechanics
│   └── prisma/                 # Database schema & migrations
│
├── contracts/                  # Solidity sources (BSC; on-chain features paused)
│   ├── contracts/              # 6 .sol files (2 deployed-paused, 2 planned, 2 legacy)
│   └── hardhat.config.cjs      # Hardhat configuration
│
├── packages/petclaw/           # @myaipet/petclaw-sdk — SDK + `petclaw` CLI (git submodule)
├── desktop-pet/                # Chrome extension (desktop pet → capped season points)
├── deploy/                     # EC2 deploy (ec2-pull.sh), RDS setup, env checklist
├── landing-assets/             # Marketing site source (separate nginx copy in prod)
├── tools/                      # demo-video production kit, etc.
├── scripts/                    # Utility & maintenance scripts
└── docs/                       # Documentation
```

The former FastAPI backend and legacy React+Vite frontend have been removed; everything they did now lives in the Next.js app.

---

## System Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                          Clients                             │
│  Browser (RainbowKit/wagmi wallet) · Chrome extension        │
│  petclaw CLI / @myaipet/petclaw-sdk (PAT auth)               │
└────────────────────────┬─────────────────────────────────────┘
                         │ HTTPS
                         ▼
┌──────────────────────────────────────────────────────────────┐
│                     EC2 (single box)                         │
│                                                              │
│  nginx ── TLS, reverse proxy, /uploads static,               │
│   │       myaipet.ai marketing copy (landing-assets)         │
│   ▼                                                          │
│  Next.js 16 standalone under PM2 ("petclaw-web")             │
│  ┌──────────────┐  ┌──────────────────────────────────────┐  │
│  │  React 19    │  │  API routes (~150 handlers)          │  │
│  │  UI          │  │  /api/auth/*   /api/pets/*           │  │
│  │              │  │  /api/petclaw/*  /api/studio/*       │  │
│  │              │  │  /api/credits/*  /api/community/* …  │  │
│  └──────────────┘  └──────────┬───────────────────────────┘  │
└────────────────────────────────┼─────────────────────────────┘
                                 │
          ┌──────────────┬───────┴────────┬──────────────────┐
          ▼              ▼                ▼                  ▼
┌────────────────┐ ┌────────────┐ ┌───────────────┐ ┌────────────────┐
│ AWS RDS        │ │ Uploads    │ │ LLM router    │ │ BSC RPC        │
│ PostgreSQL     │ │ local disk │ │ Grok (x.ai)   │ │ USDT payment   │
│ (Prisma)       │ │ or S3      │ │ fal.ai (LoRA/ │ │ verification;  │
│                │ │            │ │ video), BYOK  │ │ paused NFT     │
│                │ │            │ │ models        │ │ contracts      │
└────────────────┘ └────────────┘ └───────────────┘ └────────────────┘
```

---

## Smart Contracts (BSC)

On-chain features are currently **paused (holding period)** while relayer operations and an external audit are finalized; the deployment is migrating to Base. The `/contracts` page in the app is the public disclosure of addresses and status.

| Contract | Standard | Status | Purpose |
|----------|----------|--------|---------|
| **PETContent** | ERC-721 | Deployed on BSC — paused | NFTs for AI-generated content + memory anchors |
| **PetaGenTracker** | — | Deployed on BSC — paused | On-chain generation-event log (relayer pattern) |
| **PETActivity** | — | Planned | Per-user activity recorder (gasless, roadmap) |
| **PetSoul** | — | Planned | Pet identity registry + successor inheritance (roadmap) |

`PETToken.sol` and `PETShop.sol` remain in `contracts/` as legacy sources, but **no token exists or is planned** — the platform is no-token by design. Season points are a non-financial recognition score, and payments are direct USDT transfers verified on-chain (no purchase contract).

Deployed contracts use OpenZeppelin patterns:
- **Ownable2Step** — Two-step ownership transfer (multisig ready)
- **Pausable** — Emergency stop mechanism (currently engaged)
- **ReentrancyGuard** — On mint functions

**ABI sync path:** `contracts/artifacts/` → `web/src/lib/contracts/*.abi.json`

---

## Key Flows

### 1. Authentication (Wallet-Based JWT)

```
User                    Frontend                  API
 │                         │                       │
 ├── Connect Wallet ──────►│                       │
 │                         ├── GET /api/auth/nonce─►│
 │                         │◄── nonce ─────────────┤
 │◄── Sign SIWE message ───┤                       │
 ├── Signature ───────────►│                       │
 │                         ├── POST /api/auth/verify►
 │                         │◄── JWT ───────────────┤
 │                         │                       │
 │   (all subsequent requests use Bearer token)    │
```

- Signature verified server-side with viem `verifyMessage` (ethers fallback for permissive encodings).
- The JWT (`jose`) is bound to the user's current nonce; logout rotates the nonce, invalidating outstanding tokens.
- **CLI/SDK auth:** personal access tokens with a `pck_` prefix, stored hashed in the `cli_tokens` table (plaintext shown once at creation).

### 2. Pet Adoption

Two modes are supported:

**Mode A — AI Chat Adoption:**
1. User chats with the Grok AI counselor.
2. AI extracts pet attributes (name, species, personality, traits).
3. `POST /api/pets/adopt-chat` (action: `create`) creates the pet record.
4. `POST /api/pets/avatar` triggers Grok image generation; avatar saved via the storage layer (S3 or local disk).
5. `PATCH /api/pets/{id}` persists the `avatar_url`.

**Mode B — Photo Upload Adoption:**
1. User uploads a photo via `POST /api/upload` (storage layer).
2. A human-avatar guard (`isHumanAvatar`, Grok vision, fail-open) blocks photos of people being used as pets.
3. `POST /api/pets/adopt-chat` (action: `create`) creates the pet record.
4. `PATCH /api/pets/{id}` sets the uploaded photo as the avatar.

**Guest tour:** `?tour=1` (`web/src/lib/tour.ts`, `TourMyPet.tsx`, `WalletGate.tsx`) gives read-only DEMO previews of community, World Cup, and My Pet without a wallet.

### 3. Content Generation (Image / Video)

```
User ──► POST /api/pets/{petId}/generate
              │
              ├── Image: Grok generates image (or fal.ai flux-LoRA when the pet
              │          has a trained pet-LoRA; falls back to Grok) → storage → URL
              │
              └── Video: Pet Studio pipeline — provider chosen from the catalog
                         (lib/studio/providers.ts) → poll status → storage → URL
```

- **Pet Studio** offers 22 pre-baked templates (`lib/studio/templates.ts`, 13 of them "trending" short-form) with hover-play example clips in `web/public/studio_examples/`, a two-phase Prompt Director (`/api/studio/prompt-director`), and a client-side editor (`StudioEditor.tsx` + `lib/studio/editorEngine.ts`, WebCodecs/MediaRecorder; free-tier exports are watermarked).
- Provider costs are credit-priced per run (credit = $0.05). Premium providers can be listed as **comingSoon** teasers — e.g. Veo 3 at 400 credits/run — and are not submittable until unlocked.
- NFT minting of generated content is paused along with the contracts (holding period).

### 4. Pet Interaction & Stats

Effects per action (`web/src/lib/petMechanics.ts`):

| Action | Affected Stats |
|--------|---------------|
| Feed | hunger ↓↓, happiness ↑, energy ↑ |
| Play | happiness ↑↑, energy ↓ |
| Talk | bond ↑, happiness ↑ |
| Pet | bond ↑, happiness ↑, energy ↑ |
| Walk | happiness ↑, energy ↓ |
| Train | exp ↑↑, energy ↓ |

- Stats decay passively over time (a neglected pet drifts toward hungry/tired/unhappy).
- Mood is derived from the current stat combination.

**Mood States (9):** ecstatic, happy, neutral, tired, hungry, sad, grumpy, exhausted, starving.

Activities feed the **Season Rewards** score (`season_points` on the user, `lib/seasonRewards.ts`) — recognition only, no financial value or redemption.

---

## API Architecture

There is a **single API surface**: ~150 route handlers under `web/src/app/api/`, running in the Next.js server process (the former FastAPI backend was removed). Major domains:

| Domain | Routes | Responsibilities |
|--------|--------|-----------------|
| Auth | `/api/auth/*` | Nonce, SIWE verify, JWT session, OAuth connectors |
| Pets | `/api/pets/*` | CRUD, chat, interact, generate, diary, evolve, agent |
| PetClaw | `/api/petclaw/*` | Skills registry, memory, BYOK models, CLI tokens, engagement, mission-control, export/import |
| Studio | `/api/studio/*` | Templates, prompt director, video jobs |
| Economy | `/api/credits/*`, `/api/payments/*` | Credit balance, USDT-verified purchases |
| Social | `/api/community/*`, `/api/worldcup/*`, `/api/battle/*`, `/api/catch/*` | Feed, World Cup (favorites bracket + honest champion-prediction poll), TCG battles, Wild Encounters |
| Ops | `/api/admin/*`, `/api/cron/*`, `/api/health` | Admin gates, scheduled jobs, health check |

### Agent stack

- `POST /api/pets/{petId}/agent` runs the pet as an agent; responds with SSE when `Accept: text/event-stream` or `?stream=1`.
- `runToolAgent` (`lib/petclaw/agent/tool-agent.ts`) does native tool-calling via `callLLMWithTools` with connector tools: `web_search`, `web_read` (SSRF-guarded), `wikipedia_lookup`, `crypto_price`, `recall_memory`.
- A plan-execute loop (`lib/petclaw/agent/plan-execute.ts`) and GBrain memory retrieval (`lib/petclaw/memory/retrieval.ts`) back longer tasks.
- All LLM calls route through `callLLM({task})` in `lib/llm/router.ts`; owners can connect their own encrypted BYOK models at `/api/petclaw/models`.

### PetClaw skills

The canonical skill set is **18 skills** — only skills backed by a real handler or endpoint are counted, reconciled across the three registries (`lib/petclaw/petclaw.ts`, `lib/petclaw/pethub.ts`, SDK `protocol.ts`).

### Chrome extension

The desktop-pet extension reports care actions to `POST /api/petclaw/engagement`; grants are server-authoritative and daily-capped (`ext_care` shared pool 20 pts/day for pet+treat, `ext_welcome` 1 pt/day), landing in the same `season_points` score.

### Credits & payments

- Credit = $0.05. Packs: **100 / 500 / 2000 credits for 5 / 20 / 50 USDT** (`/api/credits/purchase`).
- Purchase flow: user sends USDT (BEP-20) to the treasury, submits the tx hash; the server verifies the transfer on-chain (`verifyUsdtTransfer`, BSC-USD `0x55d3…7955`) and records the hash in a global `ConsumedPayment` ledger so a tx can never be credited twice.

---

## Deployment

- **App:** EC2 single box at `/opt/petclaw` — `bash deploy/ec2-pull.sh` does git reset to `origin/main`, `npm ci`, `prisma generate` + `prisma migrate deploy` (sourcing `web/.env.production`, which holds the RDS URL), `next build` (standalone), PM2 reload of `petclaw-web`, then a smoke curl against `https://app.myaipet.ai`.
- **Marketing:** `myaipet.ai` is a separate nginx-served static copy at `/opt/petclaw/landing-assets` — updating the app does **not** update it; sync it explicitly from `landing-assets/`.
- **Database:** production is AWS RDS PostgreSQL (see `deploy/setup-rds.sh`, `deploy/migrate-neon-to-rds.sh` for the Neon→RDS migration history).

---

## Security

| Area | Measure |
|------|---------|
| Auth | SIWE signature verification (viem + ethers fallback); JWT bound to the user's nonce — logout rotates the nonce and invalidates tokens |
| API auth | JWT Bearer on API routes; CLI PATs (`pck_`) stored hashed in `cli_tokens` |
| Payments | On-chain USDT transfer verification + single-use `ConsumedPayment` tx-hash ledger (no double-credit) |
| Agent SSRF | `web_read` URL guard blocks internal/metadata addresses before server-side fetch |
| Content safety | Human-avatar guard (Grok vision, fail-open) blocks human photos as pet avatars |
| Headers | HSTS, CSP, X-Frame-Options, etc. set in `next.config.ts` (nginx can layer more) |
| Credits & points | Atomic Prisma operations; server-authoritative daily caps on engagement grants |
| Rate limiting | `lib/rateLimit.ts` on abuse-prone routes (e.g. engagement 60/min) |
| Contracts | Ownable2Step, Pausable (currently engaged), ReentrancyGuard on deployed contracts |
