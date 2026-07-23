#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# ratelimit-guard — 배포가 nginx conf를 템플릿에서 재렌더하며
# /api/ rate limit이 소실되는 것을 자동 재적용. cron: */10분.
# 템플릿에 반영되면(TEAM-HANDOFF 참조) grep이 항상 참 → 영구 no-op.
# 안전장치: 패치 후 nginx -t 실패 시 즉시 원복 + 텔레그램 알람.
# ═══════════════════════════════════════════════════════════════
set -euo pipefail
umask 077
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
export PATH
unset BASH_ENV CDPATH ENV GLOBIGNORE

CONF=/etc/nginx/sites-available/petclaw
# Match an active canonical directive, never a comment that merely mentions it.
grep -Eq '^[[:space:]]*limit_req[[:space:]]+zone=abuse[[:space:]]+burst=15[[:space:]]+nodelay;[[:space:]]*$' \
  "$CONF" && exit 0
PORT="$(grep -m1 -oE "proxy_pass http://127.0.0.1:[0-9]+" "$CONF" \
  | grep -oE "[0-9]+$" || true)"
[[ -n "$PORT" ]] || exit 0
TMP=$(mktemp)
awk -v port="$PORT" '
  /^    location \/ \{$/ { lastline=NR }
  { l[NR]=$0 }
  END {
    for (i=1;i<=NR;i++) {
      if (i==lastline) {
        print "    # ops-playbook: /api/ per-IP rate limit (guard 자동 재적용 — 템플릿 반영 시 영구화)"
        print "    location /api/ {"
        print "        limit_req zone=abuse burst=15 nodelay;"
        print "        proxy_pass http://127.0.0.1:" port ";"
        print "        proxy_http_version 1.1;"
        print "        proxy_set_header Host $host;"
        print "        proxy_set_header X-Real-IP $remote_addr;"
        print "        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;"
        print "        proxy_set_header X-Forwarded-Proto $scheme;"
        print "        proxy_hide_header X-Petclaw-Release;"
        print "        proxy_read_timeout 120s;"
        print "    }"
        print ""
      }
      print l[i]
    }
  }' "$CONF" > "$TMP"
sudo cp "$CONF" "${CONF}.guard-prev"
sudo install -o root -g root -m 644 "$TMP" "$CONF"
rm -f "$TMP"
if sudo nginx -t >/dev/null 2>&1; then
  sudo systemctl reload nginx
  echo "$(date '+%F %T') ratelimit-guard: re-applied (port $PORT)" >> /home/ubuntu/ops-cron.log
else
  sudo install -o root -g root -m 644 "${CONF}.guard-prev" "$CONF"
  TG_TOKEN=""
  TG_CHAT=""
  TG_TOPIC=""
  PROJECT=""
  # shellcheck disable=SC1091
  . /home/ubuntu/.monitor-config 2>/dev/null || true
  [[ -n "$TG_TOKEN" ]] && curl -s -m 10 -o /dev/null \
    "https://api.telegram.org/bot${TG_TOKEN}/sendMessage" \
    -d chat_id="${TG_CHAT}" ${TG_TOPIC:+-d message_thread_id="${TG_TOPIC}"} \
    -d text="🔴 ${PROJECT:-\$PET} — ratelimit-guard 패치 실패(nginx -t), 원복 완료. conf 구조 변경 여부 확인 필요"
  echo "$(date '+%F %T') ratelimit-guard: FAILED nginx -t, restored" >> /home/ubuntu/ops-cron.log
fi
