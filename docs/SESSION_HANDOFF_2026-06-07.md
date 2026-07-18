# AIPET 세션 인수인계 — 2026-06-07

> **HISTORICAL / SUPERSEDED:** 운영 인수인계로 사용하지 마세요. 현재 Studio는
> `/studio`에서 라이브이며 `/studio_test`는 제거됐습니다. 외부 결제, OAuth,
> legacy agent channels, Pet-LoRA, blockchain production integration, referrals는
> launch-disabled입니다. PetClaw Extension은 v2.3.2 developer/unpacked ZIP이며
> Chrome Web Store에 게시되지 않았습니다. 현재 운영 기준은 `docs/DEPLOYMENT.md`입니다.

---

## 0. 가장 먼저 — 파일 읽기 권한 복구 확인
이전 세션은 `~/Documents` 아래 **파일 읽기가 OS 레벨에서 거부**(`Operation not permitted`)되어 멈췄습니다. macOS의 Documents/Desktop 보호(TCC/전체 디스크 접근)가 풀렸고, **앱 재시작 전엔 반영 안 됨**.
- 복구: Claude Code 완전 재시작 / 시스템 설정 → 개인정보 보호 및 보안 → 전체 디스크 접근 권한에 터미널·Claude Code 추가 후 재시작 / 또는 프로젝트를 `~/dev/` 같은 비보호 경로로 이동.
- 확인: 아무 소스 파일 한 줄 읽혀지면 OK. (쓰기는 됐지만 읽기가 막혔던 상태)

---

## 1. 지금 해야 할 작업 (인수인계 사유): **Studio 화면 리디자인**
- **목표**: Studio 화면이 "너무 장난감 같다" → **프로 크리에이티브 툴(다크·정제)** 느낌으로 업그레이드.
- **방향 확정**: **생성 위주(generation-first) 유지.** 파일 업로드/편집 스튜디오로 피벗 ❌ (사용자 결정). 비주얼·레이아웃만 바꾸고 **데이터/생성 로직은 100% 그대로.**
- **반드시**: 작업 전 `web/src/components/PetStudio.tsx`를 **먼저 읽어서** state·fetch·핸들러를 보존할 것. (블라인드 덮어쓰면 생성 기능 깨짐 — 그래서 이전 세션이 중단함)

### 대상 파일
- `web/src/components/PetStudio.tsx` (717줄) — 메인 Studio UI (좌 라이브러리 / 중앙 프리뷰+타임라인 / 우 Inspector)
- `web/src/components/PetVideoEditor.tsx` (321줄) — ffmpeg.wasm 인브라우저 에디터 (필요시 같이 톤 맞추기)
- `/studio_test` staging 래퍼 — 역사적 대상이며 현재는 제거됨. 라이브 경로는 `/studio`

### 합의된 디자인 방향
- **다크 테마**: 배경 `#0b0c10`, 패널 `#16181d`, 보더 `rgba(255,255,255,.06)`, 텍스트 흐림 단계. ← "장난감 탈출"의 핵심.
- **앰버는 액센트로만**(활성 탭/Generate 버튼). 상단 그라데이션 리본 톤다운.
- **탭 라벨 잘림 수정**: `TEMP/MUSI/HIST` → `Templates / Pets / Music / History` 풀네임 + 아이콘.
- **템플릿 카드화**: 거대 이모지 → 작은 모노톤 아이콘 + 제목 + 메타(`celebration · 5s`) 카드, hover/선택 링.
- **헤더**: 미니멀 워드마크, Credits/Tier를 pill로, 프로젝트명 인라인.
- **프리뷰**: 16:9 프레임 + 미세 그리드, 빈 상태 문구 정제, 생성 중 스켈레톤/프로그레스.
- **타임라인**: ruler · 클립 블록 · 플레이헤드 (NLE 느낌).
- **Inspector**: 섹션 구분선, 프롬프트 박스 모노스페이스, Generate 풀폭 + 비용 우측 정렬 + disabled 상태.
- **타이포**: UI=Inter/시스템, 메타·코드=JetBrains Mono. 라운드 12px 일관, 그림자 절제, hover/focus 트랜지션.
- 미해결 선호(기본값=정제된 다크+앰버 액센트): 브랜드 앰버를 더 살릴지 vs 라이트 유지 정제. → 진행하며 사용자에게 확인 가능.

### Studio 아키텍처 (리디자인 시 참고 — 데이터 계약)
- **API**: `GET /api/studio/providers`(현재 모델 엔트리 12개, tier free/pro/studio) · `GET /api/studio/templates`(22개) · `GET /api/studio/subscription` · `POST /api/studio/generate {modelId, petId, templateId|prompt, customDirection}` · `GET /api/studio/generate/[jobId]`(폴링) · `GET /api/pets`.
- **lib/studio/**: `providers.ts`, `templates.ts`, `backend.ts`(FAL queue + Grok 실제 호출), `subscription.ts`(3-tier, 월 한도; DB 모델 `UserSubscription`, `StudioMonthlyUsage`).
- **현재 상태 정정 (2026-07-18)**: Studio는 `/studio`에서 라이브이며 `/studio_test`는 제거됨.
- **현재 상태 정정 (2026-07-18)**: 에디터 음악은 WebAudio로 합성하므로 `public/studio_music/*.mp3`에 의존하지 않음. `/api/upload`는 아바타 이미지 전용이므로, 에디터 mp4를 서버에 저장하는 기능을 추가할 경우 별도의 owner-private 비디오 업로드 경로가 필요함.
- **역사적 완성도 추정 (2026-06-07 당시)**: 백엔드/API ~90-95%, 구독 ~95%, UI 셸 ~80%, 에디터 ~70%. 현재 라이브 상태 판단에는 사용하지 않음.

---

## 2. 이번 세션에 이미 끝낸 일 (참고 — 건드리지 말 것)

### 보안 감사 + 수정 (브랜치 `security-hardening-2026-06`, **커밋 안 함**)
- 전체 감사 보고서: `docs/SECURITY_AUDIT_2026-06.md` (확정 64건: Critical 6 / High 19 / Medium 15 / Low 19 / Info 5).
- **#1(유출된 Grok API 키 폐기·교체) 제외하고 모든 코드성 발견 수정 완료.** (키 교체는 xAI 대시보드에서 직접 해야 함 — 미완)
- 변경: 웹 31개 파일 + 신규 모듈 + 마이그레이션 1개. `tsc --noEmit` 신규 에러 0 (기존 11건은 그대로 — 대부분 wagmi 훅 타입, 런타임 정상).
- 신규 공통 모듈: `lib/authz.ts`(펫 소유권), `lib/payments.ts`(결제 단일 원장), `lib/battleSim.ts`(서버 권위 전투), `lib/cronAuth.ts`(크론 fail-closed), `lib/onchain.ts`(온체인 설정+검증 추상화).
- 마이그레이션: `web/prisma/migrations/20260604000000_security_hardening/migration.sql` (consumed_payments 테이블 + 유니크/인덱스).

### 온체인 교체 가능성 레이어 (`lib/onchain.ts`)
- 트레저리 지갑·체인·USDT·컨트랙트 주소·검증 로직을 **env로 교체 가능**하게 중앙화. 구현된 주소나 키만으로 기능이 켜지지 않으며 production integration은 launch-disabled.
- 결제 검증 메커니즘 교체점: `getUsdtVerifier()` / `UsdtVerifier` 인터페이스. 결제 라우트는 전부 `verifyUsdtTransfer()` 호출.

### ⚠️ 배포 전 필수 운영 조치 (보안 수정이 fail-closed라 미설정 시 기능 중단)
1. `npx prisma migrate deploy` — `consumed_payments` 등 없으면 결제 라우트 런타임 오류.
2. 외부 결제는 현재 `PAYMENTS_ENABLED=false`. 향후 별도 체크리스트를 통과해 enable할 때만 `TREASURY_WALLET`을 설정·검증.
3. `CRON_SECRET` 설정(+Vercel Cron `Authorization: Bearer $CRON_SECRET`) — 미설정 시 크론 503.
4. (선택) `SIWE_ALLOWED_DOMAINS`.
5. 시크릿 로테이션: Grok·Neon DB·FAL·AGENT_ENCRYPTION_KEY·CRON_SECRET·JWT_SECRET.

상세: `docs/SECURITY_AUDIT_2026-06.md` §9 참조.

---

## 3. 새 세션 첫 수행 순서 (추천)
1. 파일 읽기 되는지 확인(소스 한 줄 read).
2. `git status` / `git branch` 로 `security-hardening-2026-06` 상태 확인 (작업 트리에 미커밋 변경 다수 — 정상).
3. `web/src/components/PetStudio.tsx` 통독 → 위 디자인 방향대로 비주얼만 리디자인 (로직 보존).
4. `cd web && node node_modules/typescript/bin/tsc --noEmit` 로 회귀 확인 (기준선: 기존 에러 11건).
5. 현재 라이브 경로(`/studio`)에서 시각 확인. 제거된 `/studio_test`는 사용하지 않음.

---
*프로젝트 루트: `/Users/max/Documents/개발/aipet-project 2` · 메인 앱: `web/` (Next.js 16, Prisma/Postgres) · 작업 브랜치: `security-hardening-2026-06`*
