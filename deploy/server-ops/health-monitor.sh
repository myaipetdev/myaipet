#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# Savior of Health — 서버 헬스 모니터 → 텔레그램 팀 그룹 알람
#   cron: */5 * * * * /home/ubuntu/health-monitor.sh
#   설정: /home/ubuntu/.monitor-config  (chmod 600)
#         TG_TOKEN=123456:AA...
#         TG_CHAT=-1001234567890
#         TG_TOPIC=20248          # 포럼 그룹의 토픽(스레드) ID. 일반 그룹이면 생략
#         PROJECT=$SOH            # 프로젝트명 (여러 프로젝트가 같은 토픽에 보고할 때 구분)
#         DOMAIN=saviorofhealth.app
# 노이즈 방지: 같은 알람은 60분 쿨다운, 정상 복귀 시 "복구" 1회 발송
# ═══════════════════════════════════════════════════════════════
CONFIG=/home/ubuntu/.monitor-config
[ -f "$CONFIG" ] || exit 0
. "$CONFIG"
[ -n "$TG_TOKEN" ] && [ -n "$TG_CHAT" ] || exit 0

STATE=/home/ubuntu/.monitor-state
mkdir -p "$STATE"
COOLDOWN=3600
NOW=$(date +%s)

send() {  # $1=메시지
  local args=(-d chat_id="${TG_CHAT}" -d parse_mode=HTML -d text="$1")
  [ -n "$TG_TOPIC" ] && args+=(-d message_thread_id="${TG_TOPIC}")
  curl -s -m 15 -o /dev/null \
    "https://api.telegram.org/bot${TG_TOKEN}/sendMessage" "${args[@]}"
}

# 문제 발생: 쿨다운 지났으면 발송
fire() {  # $1=키 $2=메시지
  local f="$STATE/$1" last=0
  [ -f "$f" ] && last=$(cat "$f")
  if [ $((NOW - last)) -ge $COOLDOWN ]; then
    send "🔴 <b>${PROJECT:-서버}</b> — $2%0A%0A<code>${DOMAIN:-}</code> · $(date -u '+%m-%d %H:%M UTC')"
    echo "$NOW" > "$f"
  fi
}

# 정상 복귀: 직전에 울렸던 알람만 복구 통지
clear_alert() {  # $1=키 $2=라벨
  local f="$STATE/$1"
  if [ -f "$f" ]; then
    send "🟢 <b>${PROJECT:-서버}</b> — 복구: $2 · $(date -u '+%m-%d %H:%M UTC')"
    rm -f "$f"
  fi
}

# ── 1. 사이트 응답 ───────────────────────────────────────────
CODE=$(curl -s -o /dev/null -w '%{http_code}' -m 10 -k \
  --resolve "${DOMAIN}:443:127.0.0.1" "https://${DOMAIN}/" 2>/dev/null)
if [ "$CODE" != "200" ]; then
  fire site "사이트 응답 실패 (HTTP ${CODE:-timeout})"
else
  clear_alert site "사이트 정상"
fi

# ── 2. 5xx 비율 (최근 5분) ───────────────────────────────────
MINS=$(for i in 0 1 2 3 4; do date -u -d "$i min ago" "+%d/%b/%Y:%H:%M"; done | paste -sd'|')
SAMPLE=$(sudo tail -50000 /var/log/nginx/access.log 2>/dev/null | grep -E "\[(${MINS})")
TOTAL=$(echo "$SAMPLE" | grep -c . )
if [ "$TOTAL" -ge 100 ]; then
  ERR=$(echo "$SAMPLE" | awk '$9>=500' | grep -c .)
  PCT=$((ERR * 100 / TOTAL))
  if [ "$PCT" -ge 5 ]; then
    fire err5xx "5xx 급증: ${PCT}% (${ERR}/${TOTAL}, 최근 5분)"
  else
    clear_alert err5xx "5xx 정상화"
  fi
fi

# ── 3. CPU 과부하 ────────────────────────────────────────────
# 단발 샘플은 순간 스파이크(트래픽 버스트, 이 스크립트의 로그 grep 등)에 쉽게 걸린다.
# → ①5분 로드평균(이미 평활화된 값)이 코어수의 3배 초과  그리고
#   ②여러 샘플 평균 idle이 15% 미만  둘 다일 때만 = 지속적 과부하로 판정
CORES=$(nproc)
LOAD5=$(uptime | grep -oE 'load average: .*' | awk -F', *' '{print $2}' | tr -d ' ')
IDLE=$(vmstat 2 5 | tail -4 | awk '{s+=$15} END {printf "%d", s/NR}')
OVERLOADED=$(awk -v l="$LOAD5" -v c="$CORES" -v i="${IDLE:-100}" \
  'BEGIN { print (l > c*3 && i < 15) ? 1 : 0 }')

if [ "$OVERLOADED" = "1" ]; then
  fire cpu "CPU 지속 과부하: idle ${IDLE}% · load ${LOAD5} (코어 ${CORES})"
else
  clear_alert cpu "CPU 여유 회복"
fi

# ── 4. 디스크 ────────────────────────────────────────────────
DISK=$(df / | tail -1 | awk '{print $5}' | tr -d '%')
if [ "$DISK" -ge 80 ]; then
  fire disk "디스크 부족: ${DISK}% 사용"
else
  clear_alert disk "디스크 여유 회복"
fi

# ── 5. DB 백업 신선도 (30시간 이상 = 크론 실패) ──────────────
NEWEST=$(ls -t /home/ubuntu/db-backups/*.dump 2>/dev/null | head -1)
if [ -n "$NEWEST" ]; then
  AGE_H=$(( (NOW - $(stat -c %Y "$NEWEST")) / 3600 ))
  if [ "$AGE_H" -ge 30 ]; then
    fire backup "DB 백업 실패: 최신 덤프 ${AGE_H}시간 전"
  else
    clear_alert backup "DB 백업 정상"
  fi
else
  fire backup "DB 백업 없음 (덤프 파일 미발견)"
fi
