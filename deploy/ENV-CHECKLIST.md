# Production env vars — checklist for the EC2 `.env`

Add these to `/opt/petclaw/web/.env.production` (or wherever PM2 reads from) and `pm2 restart petclaw-web --update-env` after editing.

## Required for new features to activate

| Var | Purpose | If missing |
|---|---|---|
| `CRON_SECRET` | Authenticates the hourly consolidation cron | Cron endpoint returns 401, no auto-consolidation. Memory still consolidates per-turn inside `retainFromConversation` but at lower frequency. |

## Optional — turn on when ready

| Var | Purpose | Cost / risk |
|---|---|---|
| `BLOCKCHAIN_ENABLED=true` | Enables on-chain memory anchor (PETContent NFT mint per checkpoint) | Needs `BACKEND_RELAYER_KEY` and ~0.0005 BNB per anchor. Pets without souls skip anyway. |
| `PETCLAW_BEST_OF_N=true` | 2-candidate reply selection on web chat | Doubles Grok cost. Higher response quality. |

## OAuth subscriptions (each platform is independent — set what you have)

| Var | Where to get |
|---|---|
| `DISCORD_CLIENT_ID` + `DISCORD_CLIENT_SECRET` | https://discord.com/developers/applications → New App → OAuth2 → set Redirect URL to `https://app.myaipet.ai/api/auth/oauth/discord/callback` |
| `GITHUB_CLIENT_ID` + `GITHUB_CLIENT_SECRET` | https://github.com/settings/developers → New OAuth App → Callback URL = `https://app.myaipet.ai/api/auth/oauth/github/callback` |
| `TWITTER_CLIENT_ID` + `TWITTER_CLIENT_SECRET` | https://developer.x.com → Project → User auth settings → OAuth 2.0 → Callback `https://app.myaipet.ai/api/auth/oauth/twitter/callback`. Twitter requires PKCE — already wired. |
| `TELEGRAM_BOT_USERNAME` + `TELEGRAM_BOT_TOKEN` | https://t.me/BotFather → `/newbot` → then `/setdomain` to `app.myaipet.ai`. Username (without `@`) and token from BotFather. |

If a provider is left unconfigured, its tile shows "OAuth not yet configured" in the UI — no errors, no broken flow.

## How to verify

After setting envs and `pm2 reload`:

```sh
# Public providers list (shows configured=true|false per provider)
curl -s "https://app.myaipet.ai/api/petclaw/skills" | jq

# Owner-only memory ledger (need auth cookie, just confirms route mounted)
curl -s -o /dev/null -w "%{http_code}\n" "https://app.myaipet.ai/api/petclaw/memory?petId=1"
# Expect 401 (auth required). 404 means deploy didn't land.

# Cron secret sanity (no auth → expect 401)
curl -s -o /dev/null -w "%{http_code}\n" -X POST "https://app.myaipet.ai/api/petclaw/memory/consolidate?cron=1"
```
