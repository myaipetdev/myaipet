# MY AI PET — Project Architecture

> Updated: 2026-07-18. Reflects the EC2 single-box deployment; the earlier Vercel + FastAPI + token-economy description is obsolete.

## Overview

MY AI PET is a Web3-native AI pet platform. Users sign in with their wallet (SIWE-style message signing), adopt AI-driven pets, interact with them through daily activities, generate images and videos in Pet Studio, and earn **season points** — a non-financial recognition score ("Season Rewards"). The platform is deliberately **no-token**: there is no platform token and no redemption promise. The system is a single Next.js App Router monolith (`web/`), accompanied by Solidity contracts (production integration is launch-disabled; the deployed contracts are not paused), the PetClaw SDK/CLI, and a Chrome desktop-pet extension.

---

## Tech Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Web (primary) | Next.js 16, React 19, TypeScript | App Router, `output: "standalone"` — the entire app (UI + API) |
| Runtime | Node.js under PM2 (`petclaw-web`) behind nginx on EC2 | A signed immutable artifact is uploaded over the operator PEM and activated by `deploy/ec2-release.sh`; `docker-compose.yml` is local-only |
| Smart Contracts | Solidity 0.8.28, Hardhat, OpenZeppelin | Deployed on BSC; production integration is disabled (`BLOCKCHAIN_ENABLED=false`), while both deployed contracts currently return `paused() == false`; Base migration planned (see `/contracts` page) |
| Database | PostgreSQL 16 on the production EC2 host | Prisma ORM v7; `web/.env.production` points to the host-local database. Old RDS migration scripts are historical and unused live. |
| AI | LLM router (`web/src/lib/llm/router.ts`) | Grok (x.ai) by default; owner-connected BYOK models via `/api/petclaw/models`; images via Grok (the fal.ai pet-LoRA path is launch-disabled); video via Studio provider catalog |
| Storage | EC2-local disk (`web/src/lib/storage.ts`) | Live mode is `STORAGE_PROVIDER=local` at `/opt/petclaw/uploads`; nginx proxies `/uploads` to the protected app route. The S3 adapter is not configured live. |
| Wallet | RainbowKit + wagmi + `siwe` | Wallet signature → JWT (`jose`); no email/password accounts |
| Payments | USDT (BEP-20) verification code on BSC | Production purchases are disabled (`PAYMENTS_ENABLED=false`); the implemented design is SIWE + USDT only — no Stripe, cards, or email billing |

**Live URLs:**
- App: https://app.myaipet.ai (Next.js on EC2)
- Marketing: https://myaipet.ai — static `landing-assets/` from the same signed immutable release selected by `/opt/petclaw/current`; there is no manual production sync

**Production launch gates (2026-07-18):** `PAYMENTS_ENABLED=false`, `BLOCKCHAIN_ENABLED=false`, `PET_LORA_ENABLED=false`, `OAUTH_CONNECTIONS_ENABLED=false`, `AGENT_CHANNELS_ENABLED=false`, and `REFERRALS_ENABLED=false`. The corresponding implementations remain in source but are unavailable in production until their separate enablement checklists pass.

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
├── contracts/                  # Solidity sources (BSC integration launch-disabled)
│   ├── contracts/              # 6 .sol files (2 deployed with paused()==false at review, 2 planned, 2 legacy)
│   └── hardhat.config.cjs      # Hardhat configuration
│
├── packages/petclaw/           # vendored @myaipet/petclaw-sdk — SDK + CLI + MCP
├── desktop-pet/                # Chrome extension (desktop pet → capped season points)
├── deploy/                     # signed-artifact EC2 release, verification, backup, env checklist
├── landing-assets/             # Marketing source included in each immutable release
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
│  nginx ── TLS, reverse proxy, protected /uploads proxy,      │
│   │       immutable myaipet.ai landing-assets                 │
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
│ EC2-local      │ │ Uploads    │ │ LLM router    │ │ BSC RPC        │
│ PostgreSQL 16  │ │ local disk │ │ Grok (x.ai)   │ │ payment/NFT    │
│ (Prisma)       │ │ protected  │ │ fal.ai video, │ │ integration    │
│                │ │            │ │ BYOK          │ │ launch-disabled│
│                │ │            │ │ models        │ │ contracts      │
└────────────────┘ └────────────┘ └───────────────┘ └────────────────┘
```

PostgreSQL 16 and `/opt/petclaw/uploads` are host-local services inside the
same EC2 boundary; only the AI-provider and BSC RPC boxes are external.

---

## Smart Contracts (BSC)

Production on-chain writes are disabled by `BLOCKCHAIN_ENABLED=false` while relayer operations and an external audit are finalized; the deployment is migrating to Base. This application gate is distinct from the contracts' own `Pausable` state. At BSC block 110,707,528, both deployed contracts returned `paused() == false`; `PETContent.totalSupply()` and all `PetaGenTracker` activity counters were zero. The `/contracts` page in the app is the public disclosure of addresses and status.

| Contract | Standard | Status | Purpose |
|----------|----------|--------|---------|
| **PETContent** | ERC-721 | Deployed on BSC — `paused()==false` at review; app integration off | NFTs for AI-generated content + memory anchors |
| **PetaGenTracker** | — | Deployed on BSC — `paused()==false` at review; app integration off | On-chain generation-event log (relayer pattern) |
| **PETActivity** | — | Planned | Per-user activity recorder (gasless, roadmap) |
| **PetSoul** | — | Planned | Pet identity registry + successor inheritance (roadmap) |

`PETToken.sol` and `PETShop.sol` remain in `contracts/` as legacy sources, but **no token exists or is planned** — the platform is no-token by design. Season points are a non-financial recognition score. The disabled payment implementation verifies direct USDT transfers on-chain and does not use a purchase contract.

Deployed contracts use OpenZeppelin patterns:
- **Ownable2Step** — Two-step ownership transfer (multisig ready)
- **Pausable** — Emergency stop mechanism (present, but not engaged at the block snapshot above)
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
4. `POST /api/pets/avatar` triggers Grok image generation; the live deployment saves the avatar to protected EC2-local storage. The unused S3 adapter remains optional in code.
5. `PATCH /api/pets/{id}` persists the `avatar_url`.

**Mode B — Photo Upload Adoption:**
1. User uploads a photo via `POST /api/upload` (storage layer).
2. The upload-specific `isPetPhoto` vision check fails closed unless it can confirm that the main subject is a pet or creature.
3. `POST /api/pets/adopt-chat` (action: `create`) creates the pet record.
4. `PATCH /api/pets/{id}` sets the uploaded photo as the avatar; its separate `isHumanAvatar` guard fails closed for client-supplied avatar URLs.

**Guest tour:** `?tour=1` (`web/src/lib/tour.ts`, `TourMyPet.tsx`, `WalletGate.tsx`) gives read-only DEMO previews of community, World Cup, and My Pet without a wallet.

### 3. Content Generation (Image / Video)

```
User ──► POST /api/pets/{petId}/generate
              │
              ├── Image: Grok generates image (the optional fal.ai flux-LoRA
              │          path is launch-disabled by PET_LORA_ENABLED=false) → storage → URL
              │
              └── Video: Pet Studio pipeline — provider chosen from the catalog
                         (lib/studio/providers.ts) → poll status → storage → URL
```

- **Pet Studio** offers 22 pre-baked templates (`lib/studio/templates.ts`, 12 of them "trending" short-form) with hover-play example clips in `web/public/studio_examples/`, a two-phase Prompt Director (`/api/studio/prompt-director`), and a client-side editor (`StudioEditor.tsx` + `lib/studio/editorEngine.ts`, WebCodecs/MediaRecorder). HD/no-watermark export is temporarily enabled during the free beta.
- Provider costs are credit-priced per run. The retail reference is $0.05/credit, while configured bulk packs reduce the effective price to as little as $0.025/credit. Premium providers can be listed as **comingSoon** teasers — e.g. Veo 3 at 400 credits/run — and are not submittable until unlocked.
- Product-side NFT minting is unavailable because `BLOCKCHAIN_ENABLED=false`; the deployed contract returned `paused()==false` at the launch review.

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
| Auth | `/api/auth/*` | Nonce, SIWE verify, JWT session; OAuth connectors exist in source but are launch-disabled |
| Pets | `/api/pets/*` | CRUD, chat, interact, generate, diary, evolve, agent |
| PetClaw | `/api/petclaw/*` | Skills registry, memory, BYOK models, CLI tokens, engagement, mission-control, export/import |
| Studio | `/api/studio/*` | Templates, prompt director, video jobs |
| Economy | `/api/credits/*`, `/api/payments/*` | Credit balance; USDT purchase routes are launch-disabled |
| Social | `/api/community/*`, `/api/worldcup/*`, `/api/battle/*`, `/api/catch/*` | Feed, World Cup (favorites bracket + honest champion-prediction poll), TCG battles, Wild Encounters |
| Ops | `/api/admin/*`, `/api/cron/*`, `/api/health` | Admin gates, scheduled jobs, health check |

### Agent stack

- `POST /api/pets/{petId}/agent` runs the pet as an agent; responds with SSE when `Accept: text/event-stream` or `?stream=1`.
- `runToolAgent` (`lib/petclaw/agent/tool-agent.ts`) does native tool-calling via `callLLMWithTools` with eligible in-process skills and private `recall_memory`. Outbound web/market connectors are excluded from memory-bearing runs until an explicit approval and data-taint policy exists.
- A plan-execute loop (`lib/petclaw/agent/plan-execute.ts`) and GBrain memory retrieval (`lib/petclaw/memory/retrieval.ts`) back longer tasks.
- Core text paths (pet/adoption chat, Pet Date, connected-platform replies,
  persona analysis, daydream/consolidation, skills and agent loops) route through
  `callLLM({task})` in `lib/llm/router.ts`; owners can connect their own encrypted
  BYOK models at `/api/petclaw/models`.
- Platform-funded text defaults to xAI and falls back once to OpenAI when the
  primary has a network/timeout, spend-limit, HTTP 429, or 5xx failure. HTTP
  authentication/permission and input errors do **not** fall back. Configure
  `LLM_PLATFORM_PROVIDER`, `LLM_PLATFORM_FALLBACK_PROVIDER`, and
  `LLM_REQUEST_TIMEOUT_MS`; model env overrides are validated against the
  code-owned allowlist in
  `lib/llm/platform-resilience.ts`. Owner BYOK requests never use this fallback.
- Image/video routes stay on their image/video backends (xAI/FAL). A text
  provider is never used as a substitute for failed media generation.
- Telegram and Discord connection routes exist in source but are unavailable at
  launch because both OAuth subscriptions and legacy agent channels are gated off.

Production env example:

```dotenv
GROK_API_KEY=xai-...
OPENAI_API_KEY=sk-...
LLM_PLATFORM_PROVIDER=xai
LLM_PLATFORM_FALLBACK_PROVIDER=openai  # xai | openai | none
LLM_OPENAI_MODEL=gpt-5.6-luna          # optional; must be allowlisted
LLM_REQUEST_TIMEOUT_MS=20000           # allowed range: 1000–120000
```

### PetClaw skills

The canonical skill set is **18 skills** — only skills backed by a real handler or endpoint are counted, reconciled across the three registries (`lib/petclaw/petclaw.ts`, `lib/petclaw/pethub.ts`, SDK `protocol.ts`).

### Chrome extension

Version 2.3.3 of the desktop-pet extension reports care actions to `POST /api/petclaw/engagement`; grants are server-authoritative and daily-capped (`ext_care` shared pool 20 pts/day for pet+treat, `ext_welcome` 1 pt/day), landing in the same `season_points` score. It is currently distributed as a direct ZIP for Chrome Developer mode (Load unpacked), not through the Chrome Web Store.

### Credits & payments

- The source defines packs of **100 / 500 / 2000 credits for 5 / 20 / 50 USDT** (`/api/credits/purchase`), but purchases are unavailable while `PAYMENTS_ENABLED=false`.
- When enabled after its checklist, the purchase flow sends USDT (BEP-20) to the treasury and submits the tx hash; the server verifies the transfer on-chain (`verifyUsdtTransfer`, BSC-USD `0x55d3…7955`) and records the hash in a global `ConsumedPayment` ledger so a tx can never be credited twice.

---

## Deployment

- **App:** Build and sign a clean immutable release artifact off-host, upload its archive/manifest/signature/checksum over the operator PEM, verify it into root-owned `/opt/petclaw/verified`, then run `deploy/ec2-release.sh`. The script builds and smokes a candidate port before atomically switching `/opt/petclaw/current`; production never pulls from GitHub.
- **Marketing:** `landing-assets/` ships in that same signed artifact. Nginx serves it through the current release pointer, so app and landing rollback together; no manual production copy is used.
- **Database:** production is PostgreSQL 16 on the same EC2 host. `deploy/setup-rds.sh` and `deploy/migrate-neon-to-rds.sh` document an abandoned/historical RDS path and are not part of the live release.
- **Uploads:** production uses `/opt/petclaw/uploads` on the EC2 host, reachable only through the protected app route. S3 support is an inactive adapter, not current production storage.

---

## Security

| Area | Measure |
|------|---------|
| Auth | SIWE signature verification (viem + ethers fallback); JWT bound to the user's nonce — logout rotates the nonce and invalidates tokens |
| API auth | JWT Bearer on API routes; CLI PATs (`pck_`) stored hashed in `cli_tokens` |
| Payments | Launch-disabled; the implemented rail uses on-chain USDT verification + a single-use `ConsumedPayment` tx-hash ledger (no double-credit) |
| Agent SSRF | The currently unavailable `web_read` connector has a URL guard that blocks internal/metadata addresses before server-side fetch |
| Content safety | Uploads use fail-closed `isPetPhoto` validation; pet create/edit routes separately use fail-closed `isHumanAvatar` validation for client-supplied avatar URLs |
| Headers | HSTS, CSP, X-Frame-Options, etc. set in `next.config.ts` (nginx can layer more) |
| Credits & points | Atomic Prisma operations; server-authoritative daily caps on engagement grants |
| Rate limiting | `lib/rateLimit.ts` on abuse-prone routes (e.g. engagement 60/min) |
| Contracts | Ownable2Step, Pausable (not engaged at the stated block snapshot), ReentrancyGuard on deployed contracts; app integration launch-disabled |
