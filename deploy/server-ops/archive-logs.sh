#!/bin/bash
# rotate된 어제 nginx 로그를 날짜스탬프로 보존. cron: 30 1 * * * (10:30 KST)
# petclaw 변형: logrotate가 delaycompress → access.log.1이 비압축이라 직접 gzip
D=$(date -d yesterday +%Y%m%d)
DIR="/home/ubuntu/log-archive"
KEEP_DAYS=90
mkdir -p "$DIR"
if [ -f /var/log/nginx/access.log.1 ] && [ ! -f "$DIR/access-$D.log.gz" ]; then
  sudo cp /var/log/nginx/access.log.1 "$DIR/access-$D.log"
  sudo chown "$(whoami):$(whoami)" "$DIR/access-$D.log"
  gzip -f "$DIR/access-$D.log"
elif [ -f /var/log/nginx/access.log.1.gz ]; then
  sudo cp -n /var/log/nginx/access.log.1.gz "$DIR/access-$D.log.gz" 2>/dev/null || true
  sudo chown "$(whoami):$(whoami)" "$DIR/access-$D.log.gz" 2>/dev/null || true
fi
find "$DIR" -name "*.log.gz" -mtime +$KEEP_DAYS -delete
echo "$(date '+%F %T') archive-logs ok: access-$D.log.gz"
