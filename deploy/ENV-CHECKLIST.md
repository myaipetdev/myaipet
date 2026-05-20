# PetClaw AWS-only deploy — env vars + migration playbook

## TL;DR — going from current (EC2 + NeonDB + Vercel Blob fallback) to AWS-only

1. `bash deploy/setup-aws.sh` — creates S3 bucket + ECR + log group (idempotent, skip if already done)
2. `VPC_SECURITY_GROUP_IDS=sg-xxx bash deploy/setup-rds.sh` — provisions RDS PostgreSQL
3. `NEON_DATABASE_URL='...' RDS_DATABASE_URL='...' bash deploy/migrate-neon-to-rds.sh` — copies data
4. Update `.env.production` on EC2 (see below)
5. `bash deploy/ec2-pull.sh` on the EC2 instance — rebuilds + restarts PM2
6. Confirm with smoke curls — then delete the Neon project on console.neon.tech

## Production env vars (EC2 `.env.production`)

### Required

| Var | What | If missing |
|---|---|---|
| `DATABASE_URL` | RDS PostgreSQL connection string | App crashes on first DB query |
| `JWT_SECRET` | 64-char random — `openssl rand -hex 32` | All auth fails |
| `GROK_API_KEY` | x.ai console | Chat/memory extraction degrade to fallback |
| `FAL_API_KEY` | fal.ai console | Image generation fails |
| `AGENT_ENCRYPTION_KEY` | 64-char random — `openssl rand -hex 32` | Agent token storage fails |
| `NEXT_PUBLIC_APP_URL` | `https://app.myaipet.ai` | OAuth redirects break |
| `CRON_SECRET` | 64-char random — `openssl rand -hex 32` | Cron consolidation can't auth |

### Storage (pick one)

| Var | What |
|---|---|
| `STORAGE_PROVIDER=s3` + `AWS_S3_BUCKET` + `AWS_S3_REGION` + `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY` | S3 (recommended for prod) |
| `STORAGE_PROVIDER=local` + `LOCAL_UPLOAD_DIR=/opt/petclaw/uploads` | Local disk (served via nginx — needs nginx config) |

### Optional — turn on when ready

| Var | Purpose | Cost / risk |
|---|---|---|
| `BLOCKCHAIN_ENABLED=true` + `BACKEND_RELAYER_KEY=0x...` | On-chain memory anchor (mint PETContent NFT per checkpoint) | ~0.0005 BNB per anchor. Pets without souls skip anyway. |
| `PETCLAW_BEST_OF_N=true` | 2-candidate reply selection on web chat | Doubles Grok cost. |

### OAuth subscriptions (each platform independent)

| Var | Where to register |
|---|---|
| `DISCORD_CLIENT_ID` + `DISCORD_CLIENT_SECRET` | https://discord.com/developers/applications → OAuth2 → Redirect = `https://app.myaipet.ai/api/auth/oauth/discord/callback` |
| `GITHUB_CLIENT_ID` + `GITHUB_CLIENT_SECRET` | https://github.com/settings/developers → callback = `https://app.myaipet.ai/api/auth/oauth/github/callback` |
| `TWITTER_CLIENT_ID` + `TWITTER_CLIENT_SECRET` | https://developer.x.com → OAuth 2.0 → callback = `https://app.myaipet.ai/api/auth/oauth/twitter/callback` (PKCE already wired) |
| `TELEGRAM_BOT_USERNAME` + `TELEGRAM_BOT_TOKEN` | https://t.me/BotFather → `/newbot` → then `/setdomain` to `app.myaipet.ai` |

## Cron (EC2 crontab)

```sh
crontab -e
# paste this line (replace $CRON_SECRET):
0 * * * * /usr/bin/curl -fsS -X POST "https://app.myaipet.ai/api/petclaw/memory/consolidate?cron=1" -H "x-cron-secret: $CRON_SECRET" >> /var/log/petclaw-consolidate.log 2>&1
```

## Verification curls

```sh
# Mounted routes (auth required → 401, not 404)
curl -s -o /dev/null -w "%{http_code}\n" "https://app.myaipet.ai/api/petclaw/memory?petId=1"      # expect 401
curl -s -o /dev/null -w "%{http_code}\n" "https://app.myaipet.ai/api/petclaw/connections?petId=1" # expect 401
curl -s -o /dev/null -w "%{http_code}\n" -X POST "https://app.myaipet.ai/api/petclaw/memory/consolidate?cron=1"  # expect 401

# Public skills (200)
curl -s "https://app.myaipet.ai/api/petclaw/skills?id=companion-chat" | jq '.skill.name'

# DB health — check pet count via the public stats endpoint
curl -s "https://app.myaipet.ai/api/stats" | jq
```

## Roll-back if RDS migration goes wrong

1. Revert `DATABASE_URL` on EC2 to the old Neon URL
2. `pm2 reload petclaw-web --update-env`
3. Investigate the migration dump file kept at repo root (`neon-dump-*.sql`)

## Costs (estimated, ap-northeast-2 on-demand)

| Resource | Monthly |
|---|---|
| RDS db.t4g.micro, 20GB gp3, 7-day backup | ~$15 |
| S3 (10GB + 100k requests) | ~$1 |
| EC2 t3.small | ~$15 |
| Data transfer (out 100GB) | ~$9 |
| **Total** | **~$40/mo** |

Drops Neon (~$19/mo for Launch) + Vercel Pro ($20/mo) — saves ~$39/mo with no real performance change.
