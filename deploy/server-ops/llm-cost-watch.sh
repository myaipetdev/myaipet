#!/bin/bash
# 어제 LLM 사용량 → 일 비용 추정 (petclaw). cron: 40 1 * * * (10:40 KST)
# petclaw는 호출량을 DB에 기록(llm_platform_usage: usage_date, scope_key, attempts)
# → 템플릿의 nginx 로그 추정 대신 DB 집계 (더 정확).
# 단가($/1건)는 평균 추정치 — 일일 로그에 찍히는 실제 scope_key 보고 조정할 것.
UNIT_LLM=0.0005     # 챗/에이전트 1콜 (grok/gpt 평균)
UNIT_IMAGE=0.02     # 이미지 생성 1건
UNIT_VISION=0.002   # 비전 분석 1콜
UNIT_VIDEO=0.25     # fal 5s 영상 1건
OUT="/home/ubuntu/log-archive/llm-cost-watch.log"
mkdir -p "$(dirname "$OUT")"
Y=$(date -d yesterday +%Y-%m-%d)
ROWS=$(sudo -u postgres psql -d petclaw -Atc "SELECT scope_key||'='||attempts FROM llm_platform_usage WHERE usage_date='$Y' ORDER BY attempts DESC")
if [ -z "$ROWS" ]; then echo "$Y no-usage" >> "$OUT"; exit 0; fi
TOT=$(echo "$ROWS" | awk -F= '{s+=$2} END{print s+0}')
EST=$(echo "$ROWS" | awk -F= -v ul=$UNIT_LLM -v ui=$UNIT_IMAGE -v uv=$UNIT_VISION -v ud=$UNIT_VIDEO '
  tolower($1) ~ /user/   { next }          # per-user 스코프는 글로벌과 중복집계 방지
  $1 == "global"         { next }          # global = provider:* 합계와 중복 (2026-07-20 실측)
  tolower($1) ~ /video/  { c += $2*ud; next }
  tolower($1) ~ /image/  { c += $2*ui; next }
  tolower($1) ~ /vision/ { c += $2*uv; next }
  { c += $2*ul }
  END { printf "%.2f", c+0 }')
echo "$Y est=\$$EST all_attempts=$TOT scopes: $(echo "$ROWS" | grep -vi user | tr '\n' ' ')" >> "$OUT"
echo "$(date '+%F %T') llm-cost-watch ok $Y est=\$$EST attempts=$TOT"
