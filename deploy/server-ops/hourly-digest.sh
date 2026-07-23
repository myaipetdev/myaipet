#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# petclaw($PET) — 1시간 단위 지표 다이제스트 → 텔레그램 Server Alert 토픽
#   cron: 5 * * * * /home/ubuntu/hourly-digest.sh
#   설정: /home/ubuntu/.monitor-config (health-monitor.sh와 공용)
#   원본: SOH hourly-digest.sh — DB 쿼리부만 petclaw 스키마로 치환 (2026-07-22)
#   설계 원칙: 쿼리는 가볍게 (petclaw DB는 소형이라 전부 ms 단위)
# ═══════════════════════════════════════════════════════════════
CONFIG=/home/ubuntu/.monitor-config
[ -f "$CONFIG" ] || exit 0
. "$CONFIG"
[ -n "$TG_TOKEN" ] && [ -n "$TG_CHAT" ] || exit 0

PSQL="sudo -u postgres psql -d petclaw -tAc"
STATE=/home/ubuntu/.monitor-state
mkdir -p "$STATE"

# ── 지갑/유저 ────────────────────────────────────────────────
TOTAL=$($PSQL "SELECT count(*) FROM users;")
NEW_1H=$($PSQL "SELECT count(*) FROM users WHERE created_at > now() - interval '1 hour';")
ACTIVE_1H=$($PSQL "SELECT count(DISTINCT user_id) FROM pet_interactions WHERE created_at > now() - interval '1 hour';")

# ── AI 생성/과금 ─────────────────────────────────────────────
GEN_1H=$($PSQL "SELECT count(*) FROM generations WHERE created_at > now() - interval '1 hour';")
GEN_CRED_1H=$($PSQL "SELECT COALESCE(sum(credits_charged),0) FROM generations WHERE created_at > now() - interval '1 hour';")
BUY_1H=$($PSQL "SELECT count(*) FROM credit_purchases WHERE created_at > now() - interval '1 hour';")
BUY_USD_1H=$($PSQL "SELECT COALESCE(round(sum(amount_usd)::numeric,2),0) FROM credit_purchases WHERE created_at > now() - interval '1 hour' AND status NOT IN ('pending','failed');")
LLM_TODAY=$($PSQL "SELECT COALESCE(sum(attempts),0) FROM llm_platform_usage WHERE usage_date = CURRENT_DATE AND scope_key LIKE 'provider:%';")

# 봇 시그니처: 가입 60초 안에 첫 펫 인터랙션 (사람은 온보딩 읽느라 못 끊음)
FAST_1H=$($PSQL "
  SELECT count(*) FILTER (WHERE fast) FROM (
    SELECT EXISTS(
      SELECT 1 FROM pet_interactions t
      WHERE t.user_id = u.id
        AND t.created_at < u.created_at + interval '60 seconds'
    ) AS fast
    FROM users u WHERE u.created_at > now() - interval '1 hour'
  ) s;")
FAST_PCT=0; [ "${NEW_1H:-0}" -gt 0 ] && FAST_PCT=$((FAST_1H * 100 / NEW_1H))

# ── 트래픽 (nginx 로그, DB 부하 0) ────────────────────────────
mins_pat() { for i in $(seq $1 $2); do date -u -d "$i min ago" "+%d/%b/%Y:%H:%M"; done | paste -sd'|'; }
LOG=/var/log/nginx/access.log
CUR=$(sudo tail -400000 "$LOG" 2>/dev/null | grep -cE "\[($(mins_pat 0 9))")     # 최근 10분
RPM=$((CUR / 10))

PREV_RPM=0
[ -f "$STATE/last_rpm" ] && PREV_RPM=$(cat "$STATE/last_rpm")
echo "$RPM" > "$STATE/last_rpm"
TREND="—"
DELTA=0
if [ "$PREV_RPM" -gt 0 ]; then
  DELTA=$(( (RPM - PREV_RPM) * 100 / PREV_RPM ))
  if   [ "$DELTA" -ge 30 ];  then TREND="▲ +${DELTA}%"
  elif [ "$DELTA" -le -30 ]; then TREND="▼ ${DELTA}%"
  else TREND="→ ${DELTA}%"
  fi
fi

# ── 공격/봇 대량접속 탐지 (상위 IP 집중도 + 급증) ─────────────
RECENT=$(sudo tail -200000 "$LOG" 2>/dev/null | grep -E "\[($(mins_pat 0 9))")
TOP_LINE=$(echo "$RECENT" | awk '{print $1}' | sort | uniq -c | sort -rn | head -1)
TOP_CNT=$(echo "$TOP_LINE" | awk '{print $1}')
TOP_IP=$(echo "$TOP_LINE" | awk '{print $2}')
UNIQ_IP=$(echo "$RECENT" | awk '{print $1}' | sort -u | grep -c .)
TOP_PCT=0; [ "$CUR" -gt 0 ] && TOP_PCT=$((TOP_CNT * 100 / CUR))
ATTACK=""
[ "$TOP_PCT" -ge 25 ] && [ "$CUR" -ge 100 ] && ATTACK="%0A⚠️ <b>단일 IP 집중</b>: ${TOP_IP} 가 ${TOP_PCT}% (${TOP_CNT}건)"
[ "$DELTA" -ge 100 ] && [ "$PREV_RPM" -gt 0 ] && \
  ATTACK="${ATTACK}%0A⚠️ <b>트래픽 급증</b>: 분당 ${PREV_RPM} → ${RPM} (+${DELTA}%)"

# ── 5xx / 429 (최근 10분) ────────────────────────────────────
ERR=$(echo "$RECENT" | awk '$9>=500' | grep -c .)
ERR_PCT=0; [ "$CUR" -gt 0 ] && ERR_PCT=$((ERR * 100 / CUR))
R429=$(echo "$RECENT" | awk '$9==429' | grep -c .)

# ── 서버 ─────────────────────────────────────────────────────
IDLE=$(vmstat 2 2 | tail -1 | awk '{print $15}')
DISK=$(df / | tail -1 | awk '{print $5}')
LOAD=$(uptime | grep -oE 'load average: .*' | cut -d' ' -f3 | tr -d ,)

fmt() { echo "${1:-0}" | sed -e :a -e 's/\(.*[0-9]\)\([0-9]\{3\}\)/\1,\2/;ta'; }

MSG="📊 <b>${PROJECT:-서버} 시간별 리포트</b> · $(date -u '+%m-%d %H:00 UTC')%0A%0A\
<b>유저</b>%0A\
· 전체 <b>$(fmt $TOTAL)</b> (신규 1h +$(fmt $NEW_1H))%0A\
· 1시간 활성 <b>$(fmt $ACTIVE_1H)</b> · 60초내 개시 ${FAST_PCT}%%0A%0A\
<b>AI/과금</b>%0A\
· 생성 1h $(fmt $GEN_1H)건 (크레딧 $(fmt $GEN_CRED_1H))%0A\
· 크레딧 구매 1h $(fmt $BUY_1H)건 (\$${BUY_USD_1H})%0A\
· LLM 오늘 $(fmt $LLM_TODAY)콜%0A%0A\
<b>트래픽</b>%0A\
· 분당 $(fmt $RPM) ${TREND}%0A\
· 고유 IP $(fmt $UNIQ_IP) · 5xx ${ERR_PCT}% · 429 $(fmt $R429)%0A%0A\
<b>서버</b>%0A\
· CPU idle ${IDLE}% · load ${LOAD} · disk ${DISK}${ATTACK}"

curl -s -m 20 -o /dev/null "https://api.telegram.org/bot${TG_TOKEN}/sendMessage" \
  -d chat_id="${TG_CHAT}" ${TG_TOPIC:+-d message_thread_id="${TG_TOPIC}"} \
  -d parse_mode=HTML -d text="$MSG"
