#!/usr/bin/env bash
# This legacy in-place deploy path is intentionally disabled. Updating the
# process directory with git reset/build/reload can destroy local state and
# cannot provide an atomic rollback.
set -euo pipefail

cat >&2 <<'EOF'
ERROR: deploy/ec2-pull.sh is disabled for production safety.

Build a clean, versioned source archive off-host, upload it to the EC2 host,
create a recent verified off-host backup receipt, then run:

  PETCLAW_RELEASE_SOURCE=/path/to/extracted-release \
  PETCLAW_BACKUP_EVIDENCE=/path/to/backup-receipt \
  bash deploy/ec2-release.sh
EOF
exit 2
