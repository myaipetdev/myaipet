#!/bin/bash
# 일일 pg_dump → 최근 N개만 보관. cron: 0 19 * * * (04:00 KST)
# petclaw 치환 완료: DB=petclaw KEEP=7 DIR=/home/ubuntu/db-backups
set -e
DB="petclaw"
KEEP=7
DIR="/home/ubuntu/db-backups"
mkdir -p "$DIR"
TS=$(date +%Y%m%d)
sudo -u postgres pg_dump -Fc "$DB" -f "/tmp/$DB-$TS.dump"
sudo mv "/tmp/$DB-$TS.dump" "$DIR/"
sudo chown "$(whoami):$(whoami)" "$DIR/$DB-$TS.dump"
ls -t "$DIR/$DB-"*.dump | tail -n +$((KEEP+1)) | xargs -r rm -f
echo "$(date '+%F %T') db-backup ok: $DB-$TS.dump $(du -h "$DIR/$DB-$TS.dump" | cut -f1)"
