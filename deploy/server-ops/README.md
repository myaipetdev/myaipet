# Server ops scripts (verbatim mirrors)

Byte-for-byte copies of the server-managed ops scripts living in
`/home/ubuntu/` on prod (plus `ratelimit-guard.sh` mirrored at
`deploy/ratelimit-guard.sh`). Committed 2026-07-23 so an instance loss cannot
take the only copy with it. The SERVER is the source of truth at runtime —
if you change one here, copy it over and note it in TEAM-HANDOFF.

| file | cron | purpose |
|---|---|---|
| db-backup.sh | 0 19 * * * (04:00 KST) | daily pg_dump, keep 7 |
| archive-logs.sh | 30 1 * * * | nginx access log → 90d archive |
| llm-cost-watch.sh | 40 1 * * * | daily LLM cost estimate from DB usage |
| health-monitor.sh | */5 * * * * | site/5xx/CPU/disk/backup-freshness → Telegram |
| hourly-digest.sh | 5 * * * * | hourly users/AI/traffic/attack digest → Telegram |
| sybil-review-petclaw.sql | manual | pre-payout sybil risk scoring (NOT yet applied) |

Secrets are NOT here: scripts source `/home/ubuntu/.monitor-config`
(see `.monitor-config.example`). Cron lines: `deploy/crontab.example`
SERVER OPS section. Run
`/bin/bash /opt/petclaw/current/deploy/install-crontab.sh` to merge the signed
app block while preserving all six canonical server-ops jobs.
