# ═══════════════════════════════════════════
#  MY AI PET (PetClaw) - Full Setup Guide
# ═══════════════════════════════════════════

Updated: 2026-07-13 — rewritten for the current codebase. The FastAPI backend +
Vite frontend described in earlier versions of this file no longer exist;
everything now lives in `web/` (a single Next.js app that serves both the UI
and the API routes).

## Architecture

```
web/ — Next.js 16 (App Router): UI + /api routes in one app
 ├── Prisma 7 → PostgreSQL        (prod: RDS via .env.production)
 ├── LLM: Grok (xAI) via src/lib/llm/router.ts (+ BYOK model connections)
 ├── Media: fal.ai (FLUX, Kling, …) + Grok Imagine  (src/lib/studio/providers.ts)
 ├── Auth: SIWE wallet signature → JWT (jose)          — no email/password
 └── Payments: USDT (BEP-20) on BSC, on-chain tx verification (src/lib/onchain.ts)

desktop-pet/       — Chrome MV3 extension (desktop companion)
packages/petclaw/  — PetClaw SDK submodule (@myaipet/petclaw-sdk on npm)
contracts/         — Hardhat + Solidity (optional on-chain activity tracking)
```

---

## 1. Web app (the only required piece)

```bash
cd web
npm install    # Node 20+ (dev machines run v24)

# Environment: no .env.example is checked in — create web/.env by hand.
# Required (the app/route will throw or 500 without these):
#   DATABASE_URL    PostgreSQL connection string (prisma.config.ts loads it via dotenv)
#   JWT_SECRET      random 32+ chars (src/lib/auth.ts throws at import if missing)
#   GROK_API_KEY    xAI key — powers pet chat / agent / vision
#   FAL_API_KEY     fal.ai key — image & video generation
#   NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID   WalletConnect Cloud project id

npx prisma generate
npm run dev
# http://localhost:3000
```

Optional env vars (feature-gated — the app boots without them):

| Var | Purpose |
|-----|---------|
| `CRON_SECRET` | protects `/api/cron/*` routes |
| `ADMIN_WALLETS` | comma-separated admin wallet addresses |
| `TREASURY_WALLET`, `NEXT_PUBLIC_TREASURY_WALLET` | USDT payment recipient — `/api/credits/purchase` returns 503 if unset |
| `USDT_CONTRACT`, `USDT_DECIMALS`, `RPC_URL` (or `BSC_RPC_URL`), `CHAIN_ID` | payment verification; defaults to BSC-USD on BSC mainnet (chainId 56) |
| `BLOCKCHAIN_ENABLED`, `BACKEND_RELAYER_KEY`, `PET_*_ADDRESS` | optional on-chain activity writes (off by default) |
| `STORAGE_PROVIDER`, `AWS_S3_BUCKET/REGION`, `AWS_ACCESS_KEY_ID/SECRET_ACCESS_KEY`, `LOCAL_UPLOAD_DIR/URL` | media storage (S3 or local disk) |
| `AGENT_ENCRYPTION_KEY` | encrypts BYOK model keys stored via `/api/petclaw/models` |
| `SIWE_ALLOWED_DOMAINS`, `SIWE_CHAIN_ID`, `NEXT_PUBLIC_APP_URL` | auth / domain config |
| `TELEGRAM_BOT_TOKEN`, `DISCORD_PUBLIC_KEY` | bot connectors |

## 2. Database (Prisma + PostgreSQL)

- Schema: `web/prisma/schema.prisma` · migrations: `web/prisma/migrations/`
- Fresh local DB: uncomment the `db` service in `docker-compose.yml`
  (postgres:16-alpine), point `DATABASE_URL` at it, then:

```bash
cd web
npx prisma migrate dev      # fresh/dev DB (creates + applies migrations)
npx prisma migrate deploy   # existing DB (apply pending migrations only)
```

- Optional demo data: `web/prisma/seed.ts` (run manually).

⚠️ Known local-dev gotcha: production runs against RDS (`.env.production`);
the local `.env` often points at a stale DB missing newer tables/columns
(cards, catch, etc.). Those API routes return 500 locally and the UIs catch
it gracefully — full card/catch data only renders against a migrated DB.

Naming note: the engagement-reward column is `season_points` and the logic
lives in `lib/seasonRewards.ts`. Season points are a non-financial score —
do not reintroduce the old `airdrop_*` names anywhere.

Tip: guest tour mode `?tour=1` (see `web/src/lib/tour.ts`) gives read-only
DEMO previews of community / world cup / my-pet without a wallet — handy when
developing UI against an empty or stale local DB.

## 3. Checks

```bash
cd web
npm run lint
npx tsc --noEmit
```

## 4. Chrome extension (optional)

Load `desktop-pet/` unpacked at `chrome://extensions` (Developer mode →
"Load unpacked"). Pet-care actions in the extension call the rate-capped
`/api/petclaw/engagement` endpoint, which credits season points to the
linked account.

## 5. Smart contracts (optional)

The web app runs fine without deploying anything — payment verification only
*reads* the chain over RPC. If you do need the tracking contracts:

```bash
cd contracts
npm install
# set DEPLOYER_PRIVATE_KEY in contracts/.env
npx hardhat run deploy.cjs --network bscTestnet   # or: bsc, base, baseSepolia
```

Networks are defined in `hardhat.config.cjs` (Solidity 0.8.28).

## 6. Production deploy

Prod is an EC2 git-pull flow, **not** Docker — see `docs/DEPLOYMENT.md` for the
full guide. Short version (run on the EC2 box):

```bash
cd /opt/petclaw/aipet-project && bash deploy/ec2-pull.sh
# fetch/reset main → npm ci → prisma generate + migrate deploy (.env.production)
# → next build → pm2 reload petclaw-web → smoke curl
```

The root `docker-compose.yml` is an optional local-container alternative
(`docker compose up -d web`, requires `web/.env.production`) — handy for
testing the production build locally, but it is not what prod runs. The
marketing site (myaipet.ai) is a separate nginx-served copy of
`landing-assets/` synced by hand (`sudo cp landing-assets/* /opt/petclaw/landing-assets/`).

---

# API endpoint summary (selection)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/health` | - | health check |
| GET | `/api/auth/nonce?address=0x...` | - | SIWE nonce (first call creates the user with 100 starter credits) |
| POST | `/api/auth/verify` | - | verify SIWE signature → JWT |
| GET | `/api/auth/me` | JWT | current user |
| POST | `/api/pets` | JWT | create a pet |
| POST | `/api/pets/[petId]/chat` | JWT | pet chat |
| POST | `/api/pets/[petId]/agent` | JWT | agent loop with tool calling; SSE via `?stream=1` or `Accept: text/event-stream` |
| POST | `/api/studio/generate` | JWT | Studio image/video generation |
| GET | `/api/studio/templates` | - | trending Studio templates |
| GET | `/api/generate/history`, `/api/generate/[id]/status` | JWT | generation history / status |
| GET | `/api/gallery` | - | gallery (filters / pagination) |
| GET | `/api/analytics/stats` · `daily` · `chains` · `activity` | - | analytics |
| GET | `/api/credits/balance` | JWT | credit balance |
| POST | `/api/credits/purchase` | JWT | verify USDT tx hash on-chain → grant credits |
| GET | `/api/petclaw` | - | PetClaw protocol root (skills, MCP, export/delete) |

Full protocol docs: `/api-docs` on the running app.

---

# Tech stack

| Layer | Technology |
|-------|-----------|
| App | Next.js 16 (App Router) + React 19 + TypeScript |
| DB | Prisma 7 + PostgreSQL |
| Auth | SIWE + JWT (jose) — wallet-only, no email/password |
| LLM | Grok (xAI) via `src/lib/llm/router.ts`; BYOK model connections (encrypted) |
| Media gen | fal.ai (FLUX, Kling, …) + Grok Imagine — catalog in `src/lib/studio/providers.ts` |
| Wallet | wagmi + RainbowKit + viem |
| Payments | USDT (BEP-20) on BSC only — on-chain tx verification; no Stripe/card |
| Contracts | Solidity 0.8.28 + Hardhat (optional) |
| Extension | Chrome Manifest V3 (`desktop-pet/`) |

---

# Credits & pricing (from code, not projections)

- 1 credit = $0.05. Packs (`POST /api/credits/purchase`, paid in USDT):
  `starter` 100 cr / 5 USDT · `creator` 500 cr / 20 USDT · `pro` 2000 cr / 50 USDT.
- Per-run credit costs are declared per model in `src/lib/studio/providers.ts`
  (e.g. Grok Imagine image 5 cr, FLUX schnell 3 cr; Veo 3 is `comingSoon`
  at 400 cr/run and cannot be submitted yet).
- New wallets start with 100 credits (granted on first `/api/auth/nonce`).

---

# Project structure

```
aipet-project/
├── SETUP.md
├── docker-compose.yml          # prod web container (+ commented local postgres)
├── web/                        # the app (Next.js 16, App Router)
│   ├── prisma/                 # schema.prisma, migrations/, seed.ts
│   ├── src/app/                # pages + /api routes
│   ├── src/components/         # UI (PetVillage, StudioEditor, TourMyPet, …)
│   └── src/lib/                # auth, onchain, llm/router, petclaw/, studio/, seasonRewards
├── packages/petclaw/           # PetClaw SDK (git submodule → @myaipet/petclaw-sdk)
├── desktop-pet/                # Chrome MV3 extension
├── contracts/                  # Hardhat + Solidity 0.8.28 (optional on-chain)
├── landing-assets/             # marketing site (served separately by nginx)
├── tools/demo-video/           # demo-video production kit (read its HANDOFF.md first)
├── docs/
├── deploy/
└── scripts/
```
