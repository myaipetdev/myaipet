# PetClaw production launch checklist — AWS EC2

## Current live topology (verified 2026-07-17)

- One AWS EC2 host runs nginx, PM2, PostgreSQL 16, and local private uploads.
- Production env: `/opt/petclaw/aipet-project/web/.env.production` until the first immutable release; then `/opt/petclaw/current/web/.env.production`.
- Uploads: `/opt/petclaw/uploads`, served only through the owner/public-consent app route.
- Off-host backup fallback: encrypted pull to the restricted operator workstation. There is currently no EFS/NFS mount, IAM role, RDS, or S3 production storage.

Do not follow the old Neon/RDS cutover playbook for this host. RDS/S3 is a
separate, future migration and requires its own tested backup/restore plan.

## P0 release order

1. Pin production and the artifact builder to Node.js `>=24.18.0 <25`, npm `11.16.0`, and PM2 `6.0.14`. Install the official Node.js LTS archive side-by-side, verify its published SHA-256 before extraction, and restart `pm2-ubuntu.service`; the release controller rejects an older runtime, an altered systemd `PATH`/`PM2_HOME`/`PIDFile`/executable, a PM2 daemon running under another Node binary, or a candidate that does not inherit the same canonical binary.
2. Run the offline security, contract, Prisma, TypeScript, lint, extension, and clean production-build checks. The artifact builder performs an engine-strict `npm ci --dry-run --ignore-scripts` against the committed tree before it can sign release bytes. The release gate requires exactly one literal assignment for each launch kill-switch: `PAYMENTS_ENABLED=false`, `OAUTH_CONNECTIONS_ENABLED=false`, `AGENT_CHANNELS_ENABLED=false`, `PET_LORA_ENABLED=false`, `BLOCKCHAIN_ENABLED=false`, and `REFERRALS_ENABLED=false`. It applies the same exact-value rule to the avatar storage and vision caps documented below. Missing, duplicate, exported, spaced, or overridden forms fail the deploy.
3. Verify the EC2 security group exposes only `80/tcp` and `443/tcp` publicly; restrict `22/tcp` to the operator IP. Ports `3000-3003`, PostgreSQL `5432`, and every other service port must have no public inbound rule. From an off-EC2 host, connection attempts to the public IP on `3000-3003` must fail.
4. Run `deploy/pull-production-backup.sh`. It briefly quiesces PM2 writes, captures paired DB/media bytes, resumes service, restores into an isolated local PostgreSQL database, cross-checks every first-party media reference, encrypts before transfer, and signs the receipt.
5. Build a clean committed release archive with `deploy/build-release-artifact.sh <exact-commit> <off-worktree-output-dir>`. It uses `git archive`, rejects the unapproved Referral migration, scans extracted content for credentials, checks the destructive-migration checksum allowlist, and signs a canonical archive manifest with the pinned operator signing subkey.
6. Upload the archive, manifest, detached manifest signature, SHA-256, and signed backup evidence set via the production PEM. Run the root-installed `/usr/local/sbin/petclaw-verify-release-artifact.sh` against the three artifact files. It verifies the pinned signature and SHA before extraction, rejects unsafe tar members, runs the trusted scanner and migration gate, then atomically seals one release below root-owned `/opt/petclaw/verified`. `/opt/petclaw/incoming` is only an untrusted upload spool.
7. Run `/usr/local/sbin/petclaw-ec2-release.sh` as `ubuntu` with `PETCLAW_RELEASE_SOURCE` set to that verifier output, `PETCLAW_BACKUP_EVIDENCE` set, and live LLM smoke enabled. Uploaded copies of the controller are deliberately rejected.
8. Run `/bin/bash /opt/petclaw/current/deploy/install-crontab.sh`; never install `crontab.example` as a full replacement. Verify exactly seven app jobs and all six preserved ops jobs, verify the cron and PM2 log directories are mode 700 and leaf logs are mode 600, run external/API/browser/extension/rate-limit smoke, then reboot once and verify PM2/nginx recovery.

One-time EC2 trust bootstrap must happen over the pinned production SSH host key.
Before installing anything as root, compare remote SHA-256 values for the public
key, verifier, scanner, migration gate, and boot guard with the local committed bytes, and
confirm that `gpg --show-keys --with-colons` reports primary fingerprint
`0B286A30DC9C53D08CE5ABC72E2A4FDD17382A1F`. Do not bootstrap the controller
from an uploaded checkout: the trusted verifier installs the controller and boot
guard only from a successfully signed artifact.

After those byte/fingerprint checks, establish the pinned namespaces and tools:

```sh
sudo chown root:root /opt/petclaw
sudo chmod 755 /opt/petclaw
sudo install -d -o ubuntu -g ubuntu -m 700 /opt/petclaw/incoming
sudo install -d -o root -g root -m 755 /opt/petclaw/verified /opt/petclaw/releases
sudo install -d -o ubuntu -g ubuntu -m 700 /opt/petclaw/backup-evidence
sudo install -d -o ubuntu -g ubuntu -m 700 /opt/petclaw/backup-staging
sudo install -d -o root -g root -m 755 /usr/local/libexec/petclaw /etc/petclaw
sudo install -o root -g root -m 644 deploy/backup-verification-public-key.asc /etc/petclaw/release-signing-public-key.asc
sudo install -o root -g root -m 755 deploy/verify-release-artifact.sh /usr/local/sbin/petclaw-verify-release-artifact.sh
sudo install -o root -g root -m 755 deploy/scan-release-secrets.sh /usr/local/libexec/petclaw/scan-release-secrets.sh
sudo install -o root -g root -m 755 deploy/check-release-migrations.sh /usr/local/libexec/petclaw/check-release-migrations.sh
sudo install -o root -g root -m 755 deploy/release-boot-guard.sh /usr/local/sbin/petclaw-release-boot-guard.sh
sudo /usr/local/sbin/petclaw-release-boot-guard.sh --ensure-lock
```

For each release, upload only the four artifact proof files to
`/opt/petclaw/incoming` and the signed backup proof set to its timestamped
`/opt/petclaw/backup-evidence` child. Then run, in this order (replace the
example ID and evidence stamp with the signed values):

```sh
sudo /usr/local/sbin/petclaw-verify-release-artifact.sh \
  /opt/petclaw/incoming/petclaw-RELEASE_ID.tar.gz \
  /opt/petclaw/incoming/petclaw-RELEASE_ID.manifest \
  /opt/petclaw/incoming/petclaw-RELEASE_ID.manifest.asc

PETCLAW_RELEASE_SOURCE=/opt/petclaw/verified/RELEASE_ID \
PETCLAW_BACKUP_EVIDENCE=/opt/petclaw/backup-evidence/BACKUP_STAMP/release-receipt.env \
PETCLAW_RELEASE_PREFLIGHT_ONLY=1 \
  /usr/local/sbin/petclaw-ec2-release.sh

PETCLAW_RELEASE_SOURCE=/opt/petclaw/verified/RELEASE_ID \
PETCLAW_BACKUP_EVIDENCE=/opt/petclaw/backup-evidence/BACKUP_STAMP/release-receipt.env \
PETCLAW_LIVE_LLM_SMOKE=1 \
  /usr/local/sbin/petclaw-ec2-release.sh
```

The verifier promotes each accepted archive to exactly one direct child such as
`/opt/petclaw/verified/20260717T150000Z`; do not run the release from `/tmp`, the
upload spool, a
Git checkout, or the live tree. The release gate rejects descendant symlinks,
hard links, special files, foreign ownership, generated dependencies, secrets,
and override attempts for the pinned release/nginx paths. Upload backup receipt,
signature, and completion marker into a mode-700 timestamped child of
`/opt/petclaw/backup-evidence`. Successful releases retain the active version
and exactly one rollback version; failed candidates are removed automatically.
The gate also requires 6 GiB free before building, 3 GiB before migrations, and
3 GiB again after migrations before any candidate start or traffic switch.
The controller and root watchdog serialize on the root-created, non-truncating
`/run/petclaw-release/release.lock`; never recreate it in an ubuntu-writable
namespace.
Before traffic switches, the candidate is persisted in PM2 and a root-owned
boot guard is armed. An SSH loss triggers the timed watchdog; an unexpected EC2
reboot before `RELEASE_COMMITTED` restores the previous nginx configuration and
release pointer before nginx starts.

## Production env vars (EC2 `.env.production`)

### Required

| Var | What | If missing |
|---|---|---|
| `DATABASE_URL` | Production PostgreSQL connection string (currently the EC2-local PostgreSQL 16 database) | App crashes on first DB query |
| `JWT_SECRET` | 64-char random — `openssl rand -hex 32` | All auth fails |
| `GROK_API_KEY` | xAI platform key for the default primary text provider | xAI is skipped; a configured fallback may still run |
| `OPENAI_API_KEY` | OpenAI platform key for text and pet-vision fallback | xAI has no cross-provider fallback |
| `FAL_API_KEY` | fal.ai console | Image generation fails |
| `AGENT_ENCRYPTION_KEY` | 64-char random — `openssl rand -hex 32` | Agent token storage fails |
| `NEXT_PUBLIC_APP_URL` | `https://app.myaipet.ai` | OAuth redirects break |
| `CRON_SECRET` | 64-char random — `openssl rand -hex 32` | Cron consolidation can't auth |
| `PAYMENTS_ENABLED` | **Current launch value: `false`**. Only exact lowercase `true`, together with a treasury, enables external payments. | Payments remain paused (fail closed) |
| `PAYMENT_MIN_CONFIRMATIONS` | Minimum confirmed blocks before a USDT receipt is accepted. Set `3` or higher before enabling payments. | Safe default is `3` |
| `OAUTH_CONNECTIONS_ENABLED` | **Current launch value: `false`**. Provider keys do not override this gate. | Channel subscriptions remain unavailable (fail closed) |
| `AGENT_CHANNELS_ENABLED` | **Current launch value: `false`**. Legacy bot-token connect/webhook/autonomy stays paused. | Agent platform connections remain unavailable (fail closed) |
| `PET_LORA_ENABLED` | **Current launch value: `false`** until isolated object storage and a signed cost budget are approved. | LoRA training remains unavailable (fail closed) |
| `BLOCKCHAIN_ENABLED` | **Current launch value: `false`** until the relayer/contracts receive their external audit. | Relayer-funded writes remain paused (fail closed) |
| `REFERRALS_ENABLED` | **Exact launch value: `false`**. The Referral schema and migration are excluded from this launch. | Referral route returns 503 without querying an absent table |

### Text LLM routing, privacy, and spend guard

The default text platform order is xAI then OpenAI. A retryable xAI failure may
send the same prompt and relevant pet-memory context to OpenAI. Pet-image
validation and appearance description use the same xAI-to-OpenAI retry policy;
their fallback is required for onboarding while the production xAI account is
spend-blocked. `LLM_PLATFORM_FALLBACK_PROVIDER` controls text only; vision uses
OpenAI whenever that key is configured and xAI has an eligible failure. A
matching owner BYOK connection is fail-closed: key, model, decrypt, or routing
failures do **not** fall through to either platform key.

| Var | Production value / rule |
|---|---|
| `LLM_PLATFORM_PROVIDER` | `xai` (default) or `openai` |
| `LLM_PLATFORM_FALLBACK_PROVIDER` | `openai` (default), `xai`, or `none`; never an arbitrary provider |
| `LLM_XAI_MODEL` | Optional; must remain on the application allowlist |
| `LLM_OPENAI_MODEL` | Optional; currently only `gpt-5.6-luna` is allowed for platform-funded calls |
| `LLM_REQUEST_TIMEOUT_MS` | `20000` default; accepted range 1000–120000 |
| `LLM_DAILY_CALL_CAP` | Global UTC-day platform **attempt** cap; default `2000` |
| `LLM_USER_DAILY_CAP` | Per-owner UTC-day platform **attempt** cap; default `60` |
| `VISION_DAILY_CAP` | **Exact launch value `300`.** Global UTC-day pet-image/catch vision provider-attempt cap. |
| `VISION_USER_DAILY_CAP` | **Exact launch value `30`.** Per-authenticated-owner UTC-day vision provider-attempt cap, reserved atomically with the global bucket. |
| `IMAGE_DAILY_CAP` | Global UTC-day image-generation **provider-attempt** cap across xAI/FAL; default `800` |
| `IMAGE_USER_DAILY_CAP` | Per-authenticated-user UTC-day image-generation **provider-attempt** cap; default `20` |

All caps are enforced atomically in PostgreSQL before provider requests,
including every text/vision/model fallback attempt and every paid or free image
provider submission (avatar, battle sprite, reward mockup, Pet-LoRA, and
Studio). Owner/BYOK text calls are not charged. Deploy migration
`20260717150000_llm_platform_usage` before starting code that uses this guard;
if the table or database is unavailable, platform inference deliberately fails
closed instead of running unmetered.

Run the offline policy test on every release. Run live adapter probes with
synthetic inputs after changing a provider/model/request shape; the scripts read
keys from the environment and never print them or provider error bodies:

```sh
cd /opt/petclaw/current/web
npm run test:llm-fallback
set -a
. ./.env.production
set +a
node scripts/llm-smoke.mjs --provider xai --mode all
node scripts/llm-smoke.mjs --provider openai --mode all
unset GROK_API_KEY OPENAI_API_KEY
```

Do not put real pet prompts into smoke tests, command history, or deployment
logs. Keep the legacy source env `ubuntu:ubuntu:600` and each immutable release
copy `root:ubuntu:640`; confirm the standalone artifact
contains no `.env*`, PEM, or key files before restart.

### Storage (pick one)

| Var | What |
|---|---|
| `STORAGE_PROVIDER=s3` + `AWS_S3_BUCKET` + `AWS_S3_REGION` + `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY` | Optional future S3 adapter; not configured for this launch. |
| `STORAGE_PROVIDER=local` + `LOCAL_UPLOAD_DIR=/opt/petclaw/uploads` | Current production mode. Nginx must proxy `/uploads/*` to the protected app route, never alias the directory. |
| `AVATAR_UPLOAD_USER_DAILY_CAP=20` | **Exact launch value.** Durable per-authenticated-user UTC-day avatar validation/upload attempt cap. Values above the application hard ceiling are clamped. |
| `AVATAR_UPLOAD_GLOBAL_DAILY_CAP=1000` | **Exact launch value.** Cluster-wide UTC-day avatar validation/upload attempt cap; reserved atomically with the user bucket before vision spend. |
| `AVATAR_PREVIEW_TTL_HOURS=24` | **Exact launch value.** Unclaimed UUID avatar previews are moved to the reference-aware deletion outbox after 24 hours. |
| `LOCAL_STORAGE_MIN_FREE_BYTES=2147483648` | **Exact launch value (2 GiB).** Every local write includes its incoming bytes in the `statfs` floor check and fails closed if the floor would be breached. |

The four values above are mandatory even though the application has bounded
defaults; `deploy/release-smoke.sh` rejects missing or drifted launch values.
The production file must contain these literal assignments (vision values are
included here because avatar/catch validation shares that durable budget):

```dotenv
AVATAR_UPLOAD_USER_DAILY_CAP=20
AVATAR_UPLOAD_GLOBAL_DAILY_CAP=1000
AVATAR_PREVIEW_TTL_HOURS=24
LOCAL_STORAGE_MIN_FREE_BYTES=2147483648
VISION_DAILY_CAP=300
VISION_USER_DAILY_CAP=30
```

Deploy `20260718000000_avatar_media_lifecycle` before serving the new upload
route, and keep the protected `media-deletions` cron enabled every 15 minutes.
The upload quota reuses the migrated `llm_platform_usage` PostgreSQL ledger and
fails with 503 rather than running unmetered when that ledger is unavailable.
Before release, run the contract test and the PostgreSQL race/cleanup harness
against an explicitly disposable database:

```sh
cd /opt/petclaw/current/web
npm run test:avatar-storage-contract
AVATAR_STORAGE_TEST_DATABASE_URL="postgresql://.../disposable_test" npm run test:avatar-storage-p0
```

### Optional — turn on when ready

| Var | Purpose | Cost / risk |
|---|---|---|
| `BLOCKCHAIN_ENABLED=true` + `BACKEND_RELAYER_KEY=0x...` | On-chain memory anchor (mint PETContent NFT per checkpoint) | ~0.0005 BNB per anchor. Pets without souls skip anyway. |
| `PETCLAW_BEST_OF_N=true` | 2-candidate reply selection on web chat | Doubles Grok cost. |
| `PETCLAW_CORS_ORIGINS=chrome-extension://<stable-store-id>` | Extra exact browser origins allowed to read PetClaw/Pets APIs. First-party `myaipet.ai` origins are built in; comma-separate any additional approved origins. | Do not use `*`. Add only after the Chrome Web Store ID is stable. |

External payments are not a launch toggle. Keep `PAYMENTS_ENABLED=false` until
the payment replay migration, mixed-case concurrency test, 3+ confirmation
finality test, treasury/RPC dry run, refund/support procedure, and enabled-state
smoke have all been signed off.
`TREASURY_WALLET` by itself never enables a paid route.

### OAuth channel subscriptions — launch disabled

Keep `OAUTH_CONNECTIONS_ENABLED=false` and `AGENT_CHANNELS_ENABLED=false`.
Before the credential-lockdown migration,
`pet_platform_connections.credentials` mixed raw OAuth JSON with AES-encrypted
agent bot credentials. Migration `20260717168000_oauth_credentials_lockdown`
atomically deactivates and deletes every non-ciphertext value, then rejects new
plaintext at the database boundary. It never prints credential values.

After the required production backup, run the aggregate-only audit, deploy the
migration, then require a clean post-migration audit:

```sh
cd /opt/petclaw/current/web
OAUTH_CREDENTIAL_AUDIT_DATABASE_URL="$DATABASE_URL" npm run audit:oauth-credentials
npx prisma migrate deploy
OAUTH_CREDENTIAL_AUDIT_DATABASE_URL="$DATABASE_URL" npm run audit:oauth-credentials -- --assert-safe
```

The first command may report insecure aggregate counts; no row identifiers,
platform names, tokens, keys, or connection URL are emitted. Stop if the second
command exits non-zero. Do not enable subscriptions until OAuth and agent
connections have separate purpose-bound rows/tables, browser navigation auth is
implemented without weakening API bearer auth, and `returnTo` is restricted to
an internal path allowlist. Existing provider registrations may remain present;
they do not bypass the kill-switch.

Agent-loop wallet reservations expire five minutes after creation (the loop
has a 60-second hard wall-clock). Install the protected
`/api/cron/agent-credit-reservations` job from `deploy/crontab.example`; its
compare-and-set settlement guarantees that a crash refund and a late commit
cannot both settle the same debit.

Future provider registration reference:

| Var | Where to register |
|---|---|
| `DISCORD_CLIENT_ID` + `DISCORD_CLIENT_SECRET` | https://discord.com/developers/applications → OAuth2 → Redirect = `https://app.myaipet.ai/api/auth/oauth/discord/callback` |
| `GITHUB_CLIENT_ID` + `GITHUB_CLIENT_SECRET` | https://github.com/settings/developers → callback = `https://app.myaipet.ai/api/auth/oauth/github/callback` |
| `TWITTER_CLIENT_ID` + `TWITTER_CLIENT_SECRET` | https://developer.x.com → OAuth 2.0 → callback = `https://app.myaipet.ai/api/auth/oauth/twitter/callback` (PKCE already wired) |
| `TELEGRAM_BOT_USERNAME` + `TELEGRAM_BOT_TOKEN` | https://t.me/BotFather → `/newbot` → then `/setdomain` to `app.myaipet.ai` |

## Cron (EC2 crontab)

```sh
# Run once as ubuntu. User cron cannot create /var/log files.
install -d -m 700 /home/ubuntu/.local/state/petclaw-cron
touch /home/ubuntu/.local/state/petclaw-cron/{consolidate,daydream,daydream-video,season-close,embed-memories,media-deletions,agent-credit-refunds,backup}.log
chmod 600 /home/ubuntu/.local/state/petclaw-cron/*.log

# Merge-install only the marked app block. The installer preserves and verifies
# the six server ops jobs, rejects malformed markers and concurrent edits, and
# performs an exact post-install readback. The sealed script is intentionally
# invoked through bash because non-runtime release files are mode 640.
/bin/bash /opt/petclaw/current/deploy/install-crontab.sh

# Expect exactly 13 active schedules: seven app jobs plus six ops jobs.
crontab -l | grep -Ec '^[0-9*@]'
```

After installation, an unauthenticated POST should still be rejected; do not
manually invoke season-close with the real secret as a smoke test:

```sh
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://app.myaipet.ai/api/cron/season-close       # expect 401
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://app.myaipet.ai/api/cron/embed-memories    # expect 401
```

## Production backups

The live single-box topology is not protected by a dump kept on the same EC2
volume. Until an independently retained EFS/NFS target exists, the workstation
pull backup is the required release gate. It uses the pinned GPG key, an actual
temporary-database restore, DB-to-media reference verification, and a signed
receipt. For a future mounted target, run:

```sh
sudo install -d -o ubuntu -g ubuntu -m 700 /mnt/petclaw-backups
# Mount off-host storage at /mnt/petclaw-backups before continuing.
PETCLAW_BACKUP_DIR=/mnt/petclaw-backups bash deploy/backup-production.sh
```

Both backup paths refuse overlap with releases, quiesce application writers,
restore-test the dump, verify first-party media completeness, encrypt payloads,
and retain completed or failed encrypted sets for at most 90 days. A systemd
watchdog restarts PM2, removes plaintext staging, and drops the isolated restore
database even after an untrappable process failure. The local PostgreSQL restore
target is a deliberate part of the current EC2 topology and must pass
`sudo -u postgres pg_isready` before backup.

The operator workstation loads both LaunchAgents generated from the checked-in
`deploy/ai.myaipet.production-backup.plist.template` and
`deploy/ai.myaipet.production-backup-retention.plist.template`. macOS TCC can
deny LaunchAgents access to Documents, Desktop, and Downloads with exit 126 even
when an interactive shell succeeds. Install the runtime outside those folders:

```sh
install -d -m 700 "$HOME/.local/libexec/petclaw-backup" \
  "$HOME/.config/petclaw-backup-runtime" \
  "$HOME/Library/Application Support/PetClaw/ProductionBackups" \
  "$HOME/Library/Logs/PetClaw"
install -m 700 deploy/{pull-production-backup.sh,prune-offhost-backups.sh,verify-backup-snapshot.sh} \
  "$HOME/.local/libexec/petclaw-backup/"
install -m 600 deploy/{backup-verification-public-key.asc,parse-database-url.mjs} \
  "$HOME/.local/libexec/petclaw-backup/"
install -m 600 /absolute/path/to/production.pem \
  "$HOME/.config/petclaw-backup-runtime/production.pem"
```

Render `__BACKUP_LIBEXEC__` as the absolute
`$HOME/.local/libexec/petclaw-backup` path, `__OFFHOST_DIR__` as the absolute
`$HOME/Library/Application Support/PetClaw/ProductionBackups` path, and
`__SSH_KEY__` as the absolute
`$HOME/.config/petclaw-backup-runtime/production.pem` path. Replace
`__GPG_HOME__` and `__LOG_DIR__` with absolute non-TCC-restricted paths too.
Validate with `plutil -lint`, set the rendered plists to mode 600, install them
with `launchctl bootstrap gui/$(id -u)`, and require a manual `launchctl kickstart
-k` run to finish with exit status 0 before relying on the schedule. The
retention agent runs `deploy/prune-offhost-backups.sh` every
day independently of backup creation. This independence is required: an
expired set must still be removed when a later snapshot fails or backup
creation is temporarily disabled. Failed partials may retain encrypted
evidence until expiry, but the retention job removes any surviving plaintext
payload immediately.

## Verification curls

```sh
# Mounted routes (auth required → 401, not 404)
curl -s -o /dev/null -w "%{http_code}\n" "https://app.myaipet.ai/api/petclaw/memory?petId=1"      # expect 401
curl -s -o /dev/null -w "%{http_code}\n" "https://app.myaipet.ai/api/petclaw/connections?petId=1" # expect 401
curl -s -o /dev/null -w "%{http_code}\n" -X POST "https://app.myaipet.ai/api/petclaw/memory/consolidate?cron=1"  # expect 401

# Public skills (200)
curl -s "https://app.myaipet.ai/api/petclaw/skills?id=companion-chat" | jq '.skill.name'

# Synthetic public demo (200, no pet/model/memory); real pet execution without
# an owner token must return 401.
curl -s -X POST "https://app.myaipet.ai/api/petclaw/demo-chat" \
  -H "Origin: https://myaipet.ai" -H "Content-Type: application/json" \
  -d '{"message":"What can PetClaw do?"}' | jq '.output | {synthetic,persisted}'
curl -s -o /dev/null -w "%{http_code}\n" -X POST "https://app.myaipet.ai/api/petclaw/skills" \
  -H "Content-Type: application/json" \
  -d '{"action":"execute","petId":1,"skillId":"companion-chat","input":{"message":"hello"}}' # expect 401

# Browser CORS: first party is allowed; arbitrary sites are denied at preflight.
curl -s -o /dev/null -w "%{http_code}\n" -X OPTIONS "https://app.myaipet.ai/api/petclaw/skills" \
  -H "Origin: https://myaipet.ai" -H "Access-Control-Request-Method: POST" # expect 204
curl -s -o /dev/null -w "%{http_code}\n" -X OPTIONS "https://app.myaipet.ai/api/petclaw/skills" \
  -H "Origin: https://evil.example" -H "Access-Control-Request-Method: POST" # expect 403

# DB health — check pet count via the public stats endpoint
curl -s "https://app.myaipet.ai/api/stats" | jq
```

## Roll back an immutable EC2 release

The release script automatically restores nginx/current and deletes the
candidate if external smoke fails. It also installs and enables
`petclaw-release-boot-guard.service`; verify it is enabled after the first
immutable release. After a later regression, point
`/opt/petclaw/current` to the retained previous release, restore its nginx
port, reload nginx, and keep the database on additive migrations. Restore data
from the signed off-host set only for a confirmed data incident.

## Cost controls

Current fixed infrastructure cost is the existing EC2 volume/instance and
network transfer; verify it in AWS Billing rather than relying on a stale
estimate. Provider spend is bounded in PostgreSQL by the text, vision, and
image attempt caps above. Keep `PET_LORA_ENABLED=false` until training has its
own paid entitlement and persistent cap. RDS, S3, EFS, ECS, and their backup
charges are not part of the current live topology.
