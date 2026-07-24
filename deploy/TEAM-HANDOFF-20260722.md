# petclaw 인프라 변경 핸드오프 (2026-07-22)

> 제품 감사, 후보 코드, npm, 인증 UAT, 서명 릴리스의 최신 연속 기록은
> [`../docs/PRODUCTION_READINESS_HANDOFF_2026-07-24.md`](../docs/PRODUCTION_READINESS_HANDOFF_2026-07-24.md)입니다.
> 이 문서는 서버 운영 이력으로 유지하며 최신 출시 승인으로 해석하지 않습니다.

서버 운영 정비 중 적용된 사항과, **빌드 소스(myaipetdev/myaipet)에 반영이 필요한 항목** 정리.

## 오늘 서버에 적용된 것 (참고)
- EC2 t3.medium → **t3.large** + T3 Unlimited, **EIP 15.165.207.119** (구 3.34.197.230 폐기, DNS 갱신 완료)
- PostgreSQL `petclaw` 롤에 `statement_timeout=30s`
- `DATABASE_URL`에 `connection_limit=10&pool_timeout=20` (env 소스 + 현재 릴리즈, PM2 재기동 완료)
- nginx logrotate `maxsize 200M`, 일일 pg_dump 백업 크론 + 오프사이트 동기화
- `/etc/nginx/conf.d/ratelimit.conf` 존 정의 + **라이브 사이트 conf에 /api/ rate limit 적용** (아래 1번 참조)

> **2026-07-23 업데이트**: 예고대로 7/23 배포에서 rate limit이 소실되어, 서버에
> `~/ratelimit-guard.sh`(cron */10분)를 설치했습니다 — conf에 limit이 없으면 자동 재적용(nginx -t
> 실패 시 원복+알람). **템플릿에 반영되면 가드는 영구 no-op이 되므로 그대로 두면 됩니다.**
> 또한 crontab 재설치 시 하단 `ops-playbook` 블록 6줄(백업/아카이브/비용/모니터링/가드)은 유지해주세요
> — 7/23 crontab 교체 때 함께 소실되어 재설치했습니다.

## 1. ⚠️ nginx 템플릿에 rate limit 반영 필요 (다음 배포에서 사라짐)
라이브 `/etc/nginx/sites-available/petclaw`에 아래 블록을 넣었지만, 배포가 템플릿에서
conf를 재렌더하므로 **`deploy/nginx-petclaw.conf.template`의 `app.myaipet.ai` 서버 블록,
`location /` 바로 위에** 동일 블록을 추가해야 유지됩니다:

```nginx
    # 남용 방어 — API 경로에만 per-IP rate limit (존: conf.d/ratelimit.conf, 2r/s)
    location /api/ {
        limit_req zone=abuse burst=15 nodelay;
        proxy_pass http://127.0.0.1:__APP_PORT__;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_hide_header X-Petclaw-Release;
        proxy_read_timeout 120s;
    }
```
존 정의는 서버의 `/etc/nginx/conf.d/ratelimit.conf`에 이미 있음 (배포 무관, 영구):
```nginx
limit_req_zone $binary_remote_addr zone=abuse:10m rate=2r/s;
limit_req_status 429;
```
검증됨: 단건 200, 30연사 시 burst 15 초과분 429, 페이지/정적/업로드 무영향.

## 2. IP+UA 수집 (시빌 정산 대비 — 앱 코드 필요)
현재 스키마에 계정↔IP 연결 고리가 없음 (`login_challenges`에 ip/ua 컬럼 부재).
포인트→토큰 전환 시 시빌 필터링을 하려면 **로그인/가입 시점 네트워크 지문 기록**이 필요:

- 원문 IP 저장 대신 **salted HMAC**: `ipfp = HMAC_SHA256(server_salt, client_ip)` (개인정보 최소화)
- 저장 위치 제안: `login_challenges`에 `ipfp varchar`, `user_agent varchar` 컬럼 추가
  (또는 별도 `audit_logs(user_id, action, details jsonb, created_at)`)
- 클라이언트 IP는 nginx가 `X-Real-IP`로 이미 전달 중
- 축적 시점부터만 유효(소급 불가) → **빠를수록 좋음**
- 활용: 같은 ipfp에 계정 N개 = 시빌 클러스터 신호 (서버 `/home/ubuntu/sybil-review-petclaw.sql` 뷰에 신호 추가)

nginx access log(IP+UA+시각)는 90일 아카이브 중이라 타임스탬프 상관분석은 이미 가능하지만,
계정 ID 직결 신호는 앱 레벨 기록이 필요합니다.

## 3. 🔐 GitHub PAT 로테이션 권장
서버 git remote URL에 PAT가 평문으로 박혀 있었음 (`git remote -v`로 노출되는 상태였음).
→ credential store(`~/.git-credentials`, 600)로 이동 완료. 다만 **기존 토큰은 노출 이력이
있으므로 GitHub에서 revoke 후 재발급** (fine-grained PAT, repo:read 최소권한 또는 deploy key) 권장.

## 4. 운영 참고
- 업타임 감시: 외부(linux 서버)에서 5분 간격, 장애/복구 시 텔레그램 알람
- AWS Budgets: 월 $350 (85%/100%/예측100% 시 이메일)
- 어나운스/마케팅 D-1: c7i.xlarge 임시 증설 검토 (3분 다운타임, EIP라 DNS 무변경)
