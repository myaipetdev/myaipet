#!/usr/bin/env bash
# Restore a production dump into an isolated PostgreSQL database, then prove
# that every first-party media reference in that snapshot exists in the paired
# media archive. Nothing is written to the live application database.
set -euo pipefail
umask 077

if [[ $# -ne 3 ]]; then
  echo "Usage: $0 <postgres.dump> <uploads.tar.gz> <verification.env>" >&2
  exit 2
fi

PETCLAW_VERIFY_DUMP="$1"
PETCLAW_VERIFY_MEDIA="$2"
PETCLAW_VERIFY_OUTPUT="$3"
PETCLAW_LOCK_DIR="/run/petclaw-release"
PETCLAW_VERIFY_LOCK="${PETCLAW_LOCK_DIR}/backup-verify.lock"
PETCLAW_BOOT_GUARD="/usr/local/sbin/petclaw-release-boot-guard.sh"
PETCLAW_PG_RESTORE_BIN="/usr/lib/postgresql/16/bin/pg_restore"

for PETCLAW_VERIFY_INPUT in "${PETCLAW_VERIFY_DUMP}" "${PETCLAW_VERIFY_MEDIA}"; do
  if [[ ! -f "${PETCLAW_VERIFY_INPUT}" || -L "${PETCLAW_VERIFY_INPUT}" ]]; then
    echo "ERROR: backup verification input must be a regular non-symlink file." >&2
    exit 2
  fi
done
if [[ ! -f "${PETCLAW_PG_RESTORE_BIN}" || -L "${PETCLAW_PG_RESTORE_BIN}" \
  || ! -x "${PETCLAW_PG_RESTORE_BIN}" \
  || "$(realpath -e "${PETCLAW_PG_RESTORE_BIN}" 2>/dev/null || true)" != "${PETCLAW_PG_RESTORE_BIN}" \
  || "$(stat -c '%U:%G:%a' "${PETCLAW_PG_RESTORE_BIN}" 2>/dev/null || true)" != root:root:755 ]]; then
  echo "ERROR: pinned PostgreSQL restore client is unsafe." >&2
  exit 2
fi
command -v psql >/dev/null 2>&1 || { echo "ERROR: psql is required." >&2; exit 2; }
command -v node >/dev/null 2>&1 || { echo "ERROR: node is required." >&2; exit 2; }
command -v flock >/dev/null 2>&1 || { echo "ERROR: flock is required." >&2; exit 2; }
sudo -n true >/dev/null
if ! sudo -n -u postgres pg_isready -q; then
  echo "ERROR: the isolated local PostgreSQL restore target is unavailable." >&2
  exit 2
fi

# Serialize restore drills. A killed process releases this kernel lock, so the
# next run can safely remove any temporary database left by an older SIGKILL.
if [[ ! -x "${PETCLAW_BOOT_GUARD}" || -L "${PETCLAW_BOOT_GUARD}" \
  || "$(stat -c '%U:%G' "${PETCLAW_BOOT_GUARD}" 2>/dev/null || true)" != root:root ]]; then
  echo "ERROR: trusted backup lock helper is unavailable." >&2
  exit 2
fi
sudo "${PETCLAW_BOOT_GUARD}" --ensure-lock
if [[ ! -d "${PETCLAW_LOCK_DIR}" || -L "${PETCLAW_LOCK_DIR}" \
  || "$(realpath -e "${PETCLAW_LOCK_DIR}" 2>/dev/null || true)" != "${PETCLAW_LOCK_DIR}" \
  || "$(stat -c '%U:%G:%a' "${PETCLAW_LOCK_DIR}" 2>/dev/null || true)" != root:ubuntu:750 \
  || ! -f "${PETCLAW_VERIFY_LOCK}" || -L "${PETCLAW_VERIFY_LOCK}" \
  || "$(stat -c '%U:%G:%a' "${PETCLAW_VERIFY_LOCK}" 2>/dev/null || true)" != root:ubuntu:660 ]]; then
  echo "ERROR: root-created backup verification lock is unsafe." >&2
  exit 2
fi
exec 8<>"${PETCLAW_VERIFY_LOCK}"
if ! flock -n 8; then
  echo "ERROR: another backup restore verification is running." >&2
  exit 3
fi
mapfile -t PETCLAW_STALE_VERIFY_DBS < <(
  sudo -n -u postgres psql -At -v ON_ERROR_STOP=1 --dbname=postgres \
    -c "SELECT datname FROM pg_database WHERE datname LIKE 'petclaw_restore_verify_%' ORDER BY datname"
)
for PETCLAW_STALE_VERIFY_DB in "${PETCLAW_STALE_VERIFY_DBS[@]}"; do
  if [[ ! "${PETCLAW_STALE_VERIFY_DB}" =~ ^petclaw_restore_verify_[0-9]{14}_[0-9]+$ ]]; then
    echo "ERROR: refusing to remove an invalid stale verification database name." >&2
    exit 2
  fi
  sudo -n -u postgres dropdb --if-exists --force "${PETCLAW_STALE_VERIFY_DB}"
done

PETCLAW_VERIFY_ID="$(date -u +%Y%m%d%H%M%S)_$$"
PETCLAW_VERIFY_DB="petclaw_restore_verify_${PETCLAW_VERIFY_ID}"
if [[ ! "${PETCLAW_VERIFY_DB}" =~ ^[a-z0-9_]{10,63}$ ]]; then
  echo "ERROR: invalid temporary restore database name." >&2
  exit 2
fi
PETCLAW_VERIFY_REFS="$(mktemp)"
PETCLAW_VERIFY_MEMBERS="$(mktemp)"
PETCLAW_VERIFY_WATCHDOG_ARMED=0
PETCLAW_VERIFY_DROPDB_BIN="$(command -v dropdb)"
PETCLAW_VERIFY_WATCHDOG_UNIT="petclaw-verify-drop-${PETCLAW_VERIFY_ID}"
if [[ ! "${PETCLAW_VERIFY_DROPDB_BIN}" =~ ^/[A-Za-z0-9._/-]+$ \
  || ! "${PETCLAW_VERIFY_WATCHDOG_UNIT}" =~ ^[A-Za-z0-9._-]{10,80}$ ]]; then
  echo "ERROR: invalid verification cleanup command or unit name." >&2
  exit 2
fi

petclaw_verify_cleanup() {
  if [[ "${PETCLAW_VERIFY_WATCHDOG_ARMED}" == "1" ]]; then
    if sudo -n -u postgres dropdb --if-exists --force "${PETCLAW_VERIFY_DB}" >/dev/null 2>&1; then
      sudo systemctl stop "${PETCLAW_VERIFY_WATCHDOG_UNIT}.timer" >/dev/null 2>&1 || true
      PETCLAW_VERIFY_WATCHDOG_ARMED=0
    fi
  fi
  rm -f -- "${PETCLAW_VERIFY_REFS}" "${PETCLAW_VERIFY_MEMBERS}"
}
trap petclaw_verify_cleanup EXIT HUP INT TERM

# Arm cleanup before creation. Even SIGKILL in the restore cannot leave a full
# plaintext production clone indefinitely on the database host.
sudo systemd-run --quiet --collect --unit="${PETCLAW_VERIFY_WATCHDOG_UNIT}" --on-active=30m \
  /bin/bash -c '
    db="$1"; dropdb_bin="$2"
    [[ "$db" =~ ^petclaw_restore_verify_[0-9]{14}_[0-9]+$ ]] || exit 2
    [[ "$dropdb_bin" =~ ^/[A-Za-z0-9._/-]+$ ]] || exit 2
    runuser -u postgres -- "$dropdb_bin" --if-exists --force "$db"
  ' petclaw-verify-cleanup "${PETCLAW_VERIFY_DB}" "${PETCLAW_VERIFY_DROPDB_BIN}"
PETCLAW_VERIFY_WATCHDOG_ARMED=1
sudo -n -u postgres createdb "${PETCLAW_VERIFY_DB}"
# ubuntu intentionally opens the private dump for psql.
# shellcheck disable=SC2024
sudo -n -u postgres "${PETCLAW_PG_RESTORE_BIN}" \
  --exit-on-error --single-transaction --no-owner --no-acl \
  --dbname="${PETCLAW_VERIFY_DB}" < "${PETCLAW_VERIFY_DUMP}"

PETCLAW_VERIFY_TABLES="$(sudo -n -u postgres psql -At -v ON_ERROR_STOP=1 \
  --dbname="${PETCLAW_VERIFY_DB}" \
  -c "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' AND table_name <> '_prisma_migrations'")"
if [[ ! "${PETCLAW_VERIFY_TABLES}" =~ ^[0-9]+$ ]] || (( PETCLAW_VERIFY_TABLES < 1 )); then
  echo "ERROR: restored database has no application tables." >&2
  exit 4
fi

# Include direct media columns and strings nested in the two JSON fields that
# can carry LoRA/personality media. External provider URLs are ignored later;
# only first-party /uploads and /api/media references must exist in the archive.
# ubuntu intentionally owns the private reference file.
# shellcheck disable=SC2024
sudo -n -u postgres psql -At -v ON_ERROR_STOP=1 --dbname="${PETCLAW_VERIFY_DB}" \
  > "${PETCLAW_VERIFY_REFS}" <<'SQL'
WITH media_refs(ref) AS (
  SELECT photo_path FROM generations
  UNION ALL SELECT video_path FROM generations
  UNION ALL SELECT avatar_url FROM pets
  UNION ALL SELECT codex_url FROM pets
  UNION ALL SELECT avatar_url FROM user_profiles
  UNION ALL SELECT photo_path FROM caught_cats
  UNION ALL SELECT player_avatar FROM battle_history
  UNION ALL SELECT opponent_avatar FROM battle_history
  UNION ALL SELECT lora_url FROM pet_loras
  -- JSON-key lookup keeps this verifier compatible with pre-migration backups.
  UNION ALL SELECT to_jsonb(pet_loras) ->> 'training_archive_ref' FROM pet_loras
  UNION ALL
    SELECT value #>> '{}'
    FROM pet_loras, LATERAL jsonb_path_query(
      COALESCE(images_used, 'null'::jsonb),
      '$.** ? (@.type() == "string")'
    ) AS value
  UNION ALL
    SELECT value #>> '{}'
    FROM pets, LATERAL jsonb_path_query(
      COALESCE(personality_modifiers, 'null'::jsonb),
      '$.** ? (@.type() == "string")'
    ) AS value
)
SELECT DISTINCT ref FROM media_refs WHERE ref IS NOT NULL ORDER BY ref;
SQL

tar -tzf "${PETCLAW_VERIFY_MEDIA}" > "${PETCLAW_VERIFY_MEMBERS}"
PETCLAW_VERIFY_RESULT="$(node - "${PETCLAW_VERIFY_REFS}" "${PETCLAW_VERIFY_MEMBERS}" <<'NODE'
const fs = require("node:fs");
const [refsPath, membersPath] = process.argv.slice(2);
const refs = fs.readFileSync(refsPath, "utf8").split(/\r?\n/).filter(Boolean);
const members = new Set(
  fs.readFileSync(membersPath, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((value) => value.replace(/^\.\//, "").replace(/\/$/, "")),
);

function mediaKey(value) {
  let path = value.trim();
  if (/^https?:\/\//i.test(path)) {
    let parsed;
    try { parsed = new URL(path); } catch { return { invalid: true }; }
    const host = parsed.hostname.toLowerCase();
    if (!['app.myaipet.ai', 'www.app.myaipet.ai'].includes(host)) return null;
    if (parsed.username || parsed.password || parsed.search || parsed.hash) return { invalid: true };
    path = parsed.pathname;
  }
  if (path.startsWith('/uploads/')) path = path.slice('/uploads/'.length);
  else if (path.startsWith('uploads/')) path = path.slice('uploads/'.length);
  else if (path.startsWith('/api/media/')) path = path.slice('/api/media/'.length);
  else if (path.startsWith('api/media/')) path = path.slice('api/media/'.length);
  else return null;
  if (!path || path.length > 600 || path.includes('%') || path.includes('\\') || path.includes('?') || path.includes('#')) {
    return { invalid: true };
  }
  if (!/^[A-Za-z0-9._/-]+$/.test(path) || path.split('/').some((part) => !part || part === '.' || part === '..')) {
    return { invalid: true };
  }
  return { key: path };
}

let localReferences = 0;
const missing = [];
for (const ref of refs) {
  const parsed = mediaKey(ref);
  if (parsed === null) continue;
  localReferences++;
  if (parsed.invalid || (!members.has(`uploads/${parsed.key}`) && !members.has(parsed.key))) {
    missing.push(ref);
  }
}
if (missing.length) {
  process.stderr.write(`ERROR: ${missing.length} first-party media reference(s) are absent from the snapshot.\n`);
  for (const value of missing.slice(0, 20)) process.stderr.write(`missing_media=${value}\n`);
  process.exit(5);
}
process.stdout.write(`local_media_references=${localReferences}\nmedia_archive_entries=${members.size}\n`);
NODE
)"

{
  printf 'restore_verified=true\n'
  printf 'media_refs_verified=true\n'
  printf 'application_tables=%s\n' "${PETCLAW_VERIFY_TABLES}"
  printf '%s\n' "${PETCLAW_VERIFY_RESULT}"
} > "${PETCLAW_VERIFY_OUTPUT}"
chmod 600 "${PETCLAW_VERIFY_OUTPUT}"

echo "Backup restore and media-reference verification passed." >&2
