#!/bin/bash
# EC2 deploy: git pull → build → PM2 restart
# Idempotent — safe to re-run.
#
# Run on the EC2 instance from the repo root:
#   bash deploy/ec2-pull.sh
#
# Or remote-trigger via SSH (from your laptop):
#   ssh -i ~/.ssh/your-key.pem ubuntu@app.myaipet.ai 'cd /opt/petclaw && bash deploy/ec2-pull.sh'

set -euo pipefail

ROOT="${PETCLAW_ROOT:-$(pwd)}"
WEB="${ROOT}/web"
BRANCH="${PETCLAW_BRANCH:-main}"
PM2_APP="${PM2_APP:-petclaw-web}"

echo "═══════════════════════════════════"
echo "  PetClaw EC2 deploy"
echo "  Root: ${ROOT}"
echo "  Branch: ${BRANCH}"
echo "═══════════════════════════════════"

cd "${ROOT}"

# 1. Fetch + reset to remote (preserves no local changes — assumes EC2 is push-target only)
echo "→ Fetching ${BRANCH}…"
git fetch origin "${BRANCH}"
git checkout "${BRANCH}"
git reset --hard "origin/${BRANCH}"

# 2. Install deps. `npm ci` is preferred (faster, deterministic) but it's
# strict about transitive lockfile sync — falls back to `npm install` if a
# transitive bump in package.json hasn't been mirrored into the lock yet, so
# deploys aren't blocked by lock drift. The fallback will update the lock on
# the EC2 disk — commit that diff back later to keep CI in sync.
cd "${WEB}"
echo "→ Installing deps…"
if [ -f "package-lock.json" ]; then
  npm ci --no-audit --no-fund 2>&1 \
    || (echo "  npm ci failed — falling back to npm install"; npm install --no-audit --no-fund)
else
  npm install --no-audit --no-fund
fi

# 3. Prisma client regen (cheap; needed when schema or @prisma/client version changed)
echo "→ Prisma generate…"
npx prisma generate

# 3b. Apply pending migrations BEFORE rebuilding so the new code never starts
# against an old schema (would 500 on missing columns/tables). `migrate deploy`
# is idempotent — safe to re-run when nothing's pending.
# We source .env.production explicitly because prisma.config.ts uses
# `import "dotenv/config"` which only loads `.env` by default — not the
# environment-suffixed file our PM2 process actually runs against.
echo "→ Prisma migrate deploy…"
if [ -f .env.production ]; then
  set -a; source .env.production; set +a
fi
npx prisma migrate deploy

# 4. Build
echo "→ Next build…"
npm run build

# 5. Restart PM2 (or start if not running)
echo "→ PM2 restart…"
if pm2 describe "${PM2_APP}" >/dev/null 2>&1; then
  pm2 reload "${PM2_APP}" --update-env
else
  # First-time start. Adjust the entrypoint path if your PM2 setup is different.
  pm2 start npm --name "${PM2_APP}" -- start
fi
pm2 save

# 6. Smoke check
echo "→ Smoke test…"
sleep 2
curl -fsS -o /dev/null -w "HTTP %{http_code}\n" "https://app.myaipet.ai/api/petclaw/skills?id=companion-chat" || echo "(smoke endpoint not 200 — check pm2 logs)"

echo ""
echo "✅ Deploy complete. Verify:"
echo "   curl -s -o /dev/null -w '%{http_code}\\n' https://app.myaipet.ai/api/petclaw/memory?petId=1   (expect 401 — auth required, route exists)"
echo "   pm2 logs ${PM2_APP} --lines 30"
