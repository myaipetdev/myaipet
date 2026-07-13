# MY AI PET - Deployment Guide

> Updated: 2026-07-13

## Overview

Production is a single EC2 instance running the Next.js app (`web/`) under **PM2** (`petclaw-web`) at `https://app.myaipet.ai`, backed by **RDS PostgreSQL**. The marketing landing page (`https://myaipet.ai`) is a **separate** static nginx copy on the same instance and is synced by hand (see below).

| Surface | What | Deploy path |
|---------|------|-------------|
| **App** (`app.myaipet.ai`) | Next.js in `web/`, PM2 process `petclaw-web` | `deploy/ec2-pull.sh` on EC2 |
| **Landing** (`myaipet.ai`) | Static files from `landing-assets/` | manual `sudo cp` |
| **Database** | RDS PostgreSQL (`.env.production` `DATABASE_URL`) | Prisma migrations, applied by `ec2-pull.sh` |

> The local `web/.env` points at a stale Neon database — production config lives only in `.env.production` on the EC2 instance. The Neon → RDS migration is complete (`deploy/migrate-neon-to-rds.sh` was the one-time tool).

---

## Standard app deploy (the live path)

1. Push to `main` on `myaipetdev/myaipet`.
2. SSH to the EC2 instance and run the pull script from the repo root:

```bash
ssh -i ~/.ssh/your-key.pem ubuntu@app.myaipet.ai
cd /opt/petclaw/aipet-project   # repo checkout on the instance
bash deploy/ec2-pull.sh
```

The script (`deploy/ec2-pull.sh`) is idempotent and does, in order:

1. `git fetch` + `git reset --hard origin/main` (EC2 is a push-target only — local changes are discarded)
2. `npm ci` in `web/` (falls back to `npm install` if the lockfile has drifted; commit the resulting lock diff back later)
3. `npx prisma generate`
4. `npx prisma migrate deploy` — runs **before** the build so new code never starts against an old schema; sources `.env.production` explicitly
5. `npm run build` — this bakes `web/public/` assets (studio example videos, images, etc.) into the build
6. `pm2 reload petclaw-web --update-env` (or `pm2 start npm --name petclaw-web -- start` on first run), then `pm2 save`
7. Smoke test: `curl https://app.myaipet.ai/api/petclaw/skills?id=companion-chat` (expect HTTP 200)

Post-deploy verification (printed by the script):

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://app.myaipet.ai/api/petclaw/memory?petId=1   # expect 401 — auth required, route exists
pm2 logs petclaw-web --lines 30
```

Overridable env vars for the script: `PETCLAW_ROOT` (defaults to cwd), `PETCLAW_BRANCH` (default `main`), `PM2_APP` (default `petclaw-web`).

---

## Landing page sync (myaipet.ai)

The marketing landing is **not** deployed by `ec2-pull.sh`. When anything under `landing-assets/` changes, copy it into the nginx-served directory on the instance:

```bash
sudo cp landing-assets/* /opt/petclaw/landing-assets/
```

Forgetting this step leaves the public landing page stale even after a successful app deploy.

---

## Environment (`.env.production` on EC2)

Full var-by-var reference: `deploy/ENV-CHECKLIST.md`. Highlights:

| Var | What | If missing |
|-----|------|-----------|
| `DATABASE_URL` | RDS PostgreSQL connection string | App crashes on first DB query |
| `JWT_SECRET` | 64-char random (`openssl rand -hex 32`) | All auth fails |
| `GROK_API_KEY` | x.ai console | Chat/memory extraction degrade to fallback |
| `FAL_API_KEY` | fal.ai console | Image generation fails |
| `AGENT_ENCRYPTION_KEY` | 64-char random | Agent token storage fails |
| `NEXT_PUBLIC_APP_URL` | `https://app.myaipet.ai` | OAuth redirects break |
| `CRON_SECRET` | 64-char random | Cron consolidation can't auth |
| `TREASURY_WALLET` | USDT receive address | Payment routes **fail closed** (by design — see `web/src/lib/onchain.ts`) |

Storage: `STORAGE_PROVIDER=s3` (+ `AWS_S3_BUCKET`/`AWS_S3_REGION`/credentials) recommended for prod, or `STORAGE_PROVIDER=local` + `LOCAL_UPLOAD_DIR` served via nginx.

**Payments:** the only rail is SIWE wallet auth + **USDT (BEP-20) on BSC** — no Stripe, cards, or email accounts. Credit packs (verified in `web/src/app/api/credits/purchase/route.ts`): 100 credits / 5 USDT, 500 / 20 USDT, 2000 / 50 USDT (1 credit = $0.05). On-chain payment verification config (chain, RPC, USDT contract `0x55d398326f99059fF775485246999027B3197955`, treasury) is centralized and env-overridable in `web/src/lib/onchain.ts`.

---

## Legacy / alternative deploy paths

- **ECS/Docker** (`deploy/deploy.sh`, `deploy/ecs-task-definition.json`, `web/Dockerfile`, `docker-compose.yml`): a complete ECR → ECS Fargate pipeline exists in the repo but is **not** the live path. Actual production is the EC2 git-pull flow above.
- **One-time AWS setup helpers**: `deploy/setup-aws.sh` (S3/ECR/log group), `deploy/setup-rds.sh` (RDS provisioning), `deploy/migrate-neon-to-rds.sh` (data copy, already done).

---

## Appendix: smart contracts (BSC — currently paused)

There is **no token**. MY AI PET operates a no-token model: credits are bought directly with USDT, and `season_points` are non-financial engagement points with no redemption. Do not deploy or document token-sale contracts.

Two utility contracts were deployed to BNB Smart Chain during the build and are currently **paused (holding period)**, with a migration to Base planned ahead of go-live (see the public `/contracts` page, `web/src/app/contracts/page.tsx`):

| Contract | Address | Status |
|----------|---------|--------|
| **PETContent** (ERC-721, content NFTs / memory anchors) | `0xB31B656D3790bFB3b3331D6A6BF0abf3dd6b0d9c` | Deployed, paused |
| **PetaGenTracker** (generation-event recorder) | `0x590D3b2CD0AB9aEE0e0d7Fd48E8810b20ec8Ac0a` | Deployed, paused |
| PETActivity, PetSoul | TBD | Planned (roadmap) |

Tooling lives in `contracts/` (Hardhat 2.x, Solidity 0.8.28, OpenZeppelin 5.x; `hardhat.config.cjs`, `deploy.cjs`). Server-side on-chain recording is opt-in via `BLOCKCHAIN_ENABLED=true` + `BACKEND_RELAYER_KEY` (~0.0005 BNB per anchor); contract addresses are overridable via `PET_CONTENT_ADDRESS` / `PET_TRACKER_ADDRESS` (server) and `NEXT_PUBLIC_PET_CONTENT` / `NEXT_PUBLIC_PET_TRACKER` (client). Manual BscScan verification, if ever needed:

```bash
cd contracts
npx hardhat --config hardhat.config.cjs verify --network bsc <CONTRACT_ADDRESS> <CONSTRUCTOR_ARGS...>
```

> **Never commit `.env` files (deployer/relayer keys) to version control.**

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Smoke curl not 200 after deploy | `pm2 logs petclaw-web --lines 30`; check `.env.production` and that `prisma migrate deploy` succeeded |
| `npm ci` fails on EC2 | Script auto-falls back to `npm install`; commit the updated `package-lock.json` back to keep CI in sync |
| New route 500s on missing column/table | A migration didn't apply — re-run `bash deploy/ec2-pull.sh` (migrate step is idempotent) |
| Payment routes reject everything | `TREASURY_WALLET` unset — payments fail closed by design (`web/src/lib/onchain.ts`) |
| Landing page shows old content | Run the manual sync: `sudo cp landing-assets/* /opt/petclaw/landing-assets/` |
