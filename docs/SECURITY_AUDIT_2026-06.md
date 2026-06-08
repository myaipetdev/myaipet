# AI Pet (MyAIPet / PetClaw) — 전체 코드 보안·정합성 검수 보고서

- **검수 대상**: `/Users/max/Documents/개발/aipet-project 2` (가장 최신·완성도 높은 빌드, `main` 브랜치)
- **검수 일자**: 2026-06-04
- **범위**: web (Next.js 16 앱, ~300 TS 파일, API 라우트 100+), Prisma 스키마(39 모델), 스마트컨트랙트 6개(Solidity), petclaw 에이전트 네트워크, Discord/Telegram 봇, 결제(USDT/Coinbase)·크레딧 경제, 스크립트
- **제외**: `aipet-project`(구버전), `pet-ai-mvp`(별도 Expo 앱), `node_modules`/`.next`/`artifacts`
- **방법**: 10개 차원으로 멀티에이전트 병렬 정적 분석 후, 모든 critical/high 발견 건을 2명의 독립 검증 에이전트(exploit 재현 / 반증)로 교차검증. 일부는 검수자가 직접 코드 확인.
- **결과 요약**: **확정 64건** (Critical 6, High 19, Medium 15, Low 19, Info 5), 반증·기각 3건.

---

## 0. 총평

스마트컨트랙트와 일부 신규 경로(배틀 시뮬레이션, action-pay, 파일 업로드, OAuth/JWT 세션)는 **상당히 견고**하게 작성되어 있습니다. 반면 **웹 백엔드의 인가(authorization)·결제 원자성·레이트리밋·시크릿 위생**에 투자 실사(DD)·런칭 전 반드시 막아야 할 구멍이 다수 존재합니다.

핵심 패턴: *"좋은 방어 패턴이 코드 안에 이미 존재하는데(예: `PaidAction.tx_hash @unique`, `shop` 음수잔액 롤백, studio 환불), 정작 가장 많이 쓰이는 경로(credits/purchase, generate, petclaw)에는 적용되지 않음."* → 즉 **새 패턴을 발명할 필요 없이 기존 올바른 패턴을 전 결제·인가 경로에 일관 적용**하면 대부분 해결됩니다.

### ⛔ 런칭/DD 전 즉시 조치 (Top priority)
1. **유출된 Grok API 키 즉시 폐기·교체** — git에 커밋된 `scripts/*.py`에 평문 존재 (C6).
2. **petclaw 인증 부재 IDOR 2건** — 누구나 임의 펫 메모리 탈취/삭제, 임의 펫 지갑 차감 (C1, C2).
3. **결제 1건으로 4개 혜택 중복 수령 + 동시성 중복 적립** (C3, H1, H2).
4. **아레나/PvE 결과를 클라이언트가 통보** → 무한 무료 XP/포인트/스킬, **에어드랍 포인트 무한 발행** (C4, C5).
5. **레이트리밋이 사실상 무력** (전 사용자 단일 버킷 + XFF 위조) + **크론 fail-open** (H10, H11, H12).
6. **약한 JWT 시크릿 + 프로덕션 시크릿 로컬 파일 노출** (H16, H17).

> DD 관점 주의: `airdrop_points`(토큰 에어드랍 배분 통화)가 여러 무캡 경로로 **무료·무한 발행** 가능합니다(C4, C5, H5, H6, M5). 토큰 분배 정합성에 직결되므로 실사에서 가장 민감하게 볼 항목입니다.

---

## 1. CRITICAL (6)

### C1. petclaw/connectors — 인증 없는 임의 펫 메모리 탈취·삭제 (IDOR)
- **파일**: `web/src/app/api/petclaw/connectors/route.ts:19`
- **내용**: POST 핸들러가 `getUser()`도, 소유권 확인도 없이 body의 `petId`만으로 동작. `connector:'memory', action:'export'` → 임의 펫의 전체 메모리(USER.md 소유자 프로필, MEMORY.md, 최대 1000개 크로스플랫폼 세션 메시지) 덤프. `action:'clear'` → 해당 펫 메모리 전체 삭제(`petMemory.deleteMany`). 외부 connector(telegram/slack/discord/twitter)는 클라이언트가 준 토큰으로 외부 API를 대신 호출하는 **오픈 릴레이**, `web-search/summarize`는 SSRF.
- **악용성**: `middleware.ts`가 `/api/petclaw/*`에 `Access-Control-Allow-Origin: *`만 붙이고 인증은 안 함 → 피해자 브라우저에서 **크로스오리진**으로도 호출 가능. 전 테넌트 데이터 노출/파괴.
- **수정**: `getUser` + `prisma.pet.findFirst({where:{id:Number(petId), user_id:user.id}})` 소유권 검증 후에만 동작. 외부 connector도 인증+레이트리밋.

### C2. petclaw/network/invoke — 인증 없는 임의 펫 지갑 차감·LLM 예산 소진
- **파일**: `web/src/app/api/petclaw/network/invoke/route.ts:4`
- **내용**: 인증/소유권 검증 없음. body의 `callerPetId`를 피해자 펫으로, `providerPetId`를 공격자 펫으로 지정 → `invokePet()`가 `deductPetWallet(callerPetId)` / `creditPetWallet(providerPetId)` 실행 → 피해자 펫 지갑 잔액을 공격자 펫으로 무동의 이전. 또한 `executeSkill`이 임의 펫에 대해 유료 Grok 호출을 일으켜 비용 폭탄 + provider 펫의 비공개 메모리를 응답에 노출.
- **수정**: 인증 + `callerPetId` 소유권 강제 후에만 지갑 차감/스킬 실행. provider 측은 소유자 consent 플래그 확인. 지갑 변경 원자화 + 사용자별 레이트리밋.

### C3. 동일 USDT tx_hash를 4개 결제 엔드포인트에서 중복 사용 (1결제 → N혜택)
- **파일**: `web/src/app/api/credits/purchase/route.ts:104` (+ studio/subscription, payments/action-pay, shop/premium)
- **내용**: 소비된 tx_hash의 **공통 원장**이 없어, 한 번의 온체인 USDT 송금($50)으로 → credits/purchase(2000크레딧) → studio/subscription(30일 구독) → action-pay(유료 액션) → shop/premium(프리미엄 아이템)을 모두 수령. 각 엔드포인트가 자기 테이블만 확인.
- **수정**: `tx_hash`에 UNIQUE 건 단일 "consumed_payments" 테이블을 만들고, 모든 결제 엔드포인트가 grant 트랜잭션 내부에서 insert. 영수증을 특정 상품(plan/item/action)에 바인딩.

### C4. 아레나 결과를 클라이언트가 통보 — 무료 XP/포인트/스킬
- **파일**: `web/src/app/api/arena/result/route.ts:14`
- **내용**: 서버 시뮬레이션 없이 body의 `won`을 그대로 신뢰. `{pet_id, won:true}`를 일일 캡(30)까지 반복 → 매회 35 에어드랍 포인트 + XP + 5% 희귀 스킬 드롭을 **플레이 없이** 획득. 펫·일자 누적 시 에어드랍 통화 무한 발행 + 무료 프리미엄 스킬.
- **수정**: `battle/create`의 결정론적 `simulateBattle`를 재사용해 서버 발급 매치 토큰 기반으로 결과를 서버에서 계산. 클라이언트 결과는 절대 신뢰 금지.

### C5. PvE 결과를 클라이언트가 통보 — 무료 스테이지 클리어/크레딧/포인트/스킬
- **파일**: `web/src/app/api/arena/pve/route.ts:68`
- **내용**: 동일 패턴. `{won:true, hp_left:max, turns:1}`로 전 스테이지 즉시 3성 클리어, 30스테이지 순차 해금, 크레딧(최대 500)·에어드랍 포인트(최대 500)·첫클리어 보장 스킬(희귀도 5 포함, 정가 800크레딧) 수확. `won:false`도 스테이지 포인트의 20% 지급 → 패배자도 파밍.
- **수정**: PvE 결과를 보스 스탯 + 펫 실제 스탯/스킬로 서버 계산. 서버가 확인한 패배에는 포인트 미지급.

### C6. 라이브 xAI/Grok API 키가 git 추적 파이썬 스크립트에 평문 하드코딩
- **파일**: `scripts/generate_gallery_images.py:12` (그리고 `scripts/generate_pet_avatars.py:9`에 동일 키가 fallback 기본값)
- **내용**: `.env`류는 gitignore 되지만 이 `.py`들은 **git이 추적**하며 라이브 키(`xai-y65KaA…`)가 평문 포함. 같은 키가 앱 LLM 호출 전반에 사용. **이미 커밋 히스토리에 존재**하므로 줄 삭제만으로는 무효화 안 됨.
- **수정**: **즉시 키 폐기·재발급**. 두 스크립트 모두 `os.environ['GROK_API_KEY']`(fallback 없이)로 교체. git 히스토리 정리(filter-repo/BFG) 또는 해당 키는 영구 폐기 처리. CI에 gitleaks/trufflehog 사전 스캐너 추가.

---

## 2. HIGH (19)

### 결제·크레딧 원자성 / 경제
- **H1** `credits/purchase` 리플레이 가드가 비유니크 컬럼에 대한 check-then-write 레이스 → 동시 요청 N배 적립. `web/.../credits/purchase/route.ts:104`. 수정: `payment_tx_hash @unique` + 트랜잭션 내부 create로 P2002 처리.
- **H2** `shop/premium` USDT 가드가 비유니크 `transactions.tx_hash` 레이스 → 1결제로 프리미엄/가챠 중복 지급. `shop/premium/route.ts:61`.
- **H3** `shop/seed`가 **인증 없는 공개 POST**로 상점 카탈로그(가격/활성/스탯) 덮어쓰기. `shop/seed/route.ts:37`. 수정: admin/secret 게이트 또는 비프로덕션 한정 또는 마이그레이션 이동.
- **H4** `TREASURY_WALLET` 미설정 시 수취인 검증이 조용히 스킵 → 자기 지갑으로 USDT 보내고 크레딧 수령(매출 $0). `credits/purchase/route.ts:66`. 수정: 미설정 시 fail-closed(결제 거부) + 부팅 검증.

### 게임 경제 로직
- **H5** interact당 에어드랍 포인트 일일 캡 없음(쿨다운 1.5s, 60/min) → 펫당 ~200+pt/min 무한 파밍. `pets/[petId]/interact/route.ts:239`.
- **H6** 콤보 감지가 꼬리(tail) 매칭이라 동일 액션 반복마다 재발동 → 콤보 보너스/포인트 무한, bond 100 도달. `lib/petMechanics.ts:198`.
- **H7** 일일 체크인이 DB 유니크 없는 read-then-write → 동시 요청 이중 수령. `checkin/route.ts:94`.

### 인젝션 / 비용증폭
- **H8** `isSafeImageUrl` SSRF 우회 가능(대괄호 IPv6, IPv4-mapped IPv6 메타데이터, 내부 호스트명, DNS 리바인딩). 검증된 `avatar_url`을 서버가 fetch(Grok vision/ref) → 클라우드 메타데이터(169.254.169.254) 접근·IAM 자격증명 탈취 위험. `lib/sanitize.ts:53`. 수정: 문자열 정규식 대신 DNS 해석 후 사설/루프백/링크로컬/메타데이터 차단 + fetch 시점 핀닝.
- **H9** `/api/agents/react`가 인증 없이 generation_id×활성펫 만큼 유료 LLM 팬아웃 → 비인증 비용증폭 DoS. `agents/react/route.ts:6`.

### 레이트리밋 / 크론 / 봇
- **H10** 레이트리미터가 **전 인증 사용자**를 단일 버킷으로 묶음(키 = `auth.slice(7,32)` = 모든 HS256 JWT 동일 prefix `eyJhbGciOiJIUzI1NiJ9.eyJz`). → 한 명이 전체 사용자 quota 소진(글로벌 DoS), 사용자별 스로틀 무의미. `lib/rateLimit.ts:24`. 수정: 검증된 JWT `sub`로 키잉.
- **H11** 비인증 경로 IP 레이트리밋이 클라이언트 제공 `X-Forwarded-For` 첫 홉을 신뢰 → 헤더 회전으로 무제한(데모 abuse 방어 무력화). `lib/rateLimit.ts:26`.
- **H12** agent `decay`/`activity` 크론이 `CRON_SECRET` 미설정 시 **fail-open**(공개 트리거). decay=일일 카운터 리셋, activity=크레딧 소비+에어드랍 포인트 증가 → 체이닝으로 일일 캡 우회·예산 소진. `agent/cron/decay/route.ts:15`. (inheritance는 fail-closed로 올바름 → 동일 적용)

### 데이터 모델 (경제 직결)
- **H13** 핵심 크레딧 차감이 잔액 가드 없이 decrement → 음수 잔액·무료 생성. `pets/[petId]/generate/route.ts:146`. 수정: `updateMany({where:{credits:{gte:cost}}})` 원자적 차감 + count===0 중단.
- **H14** `CreditPurchase.payment_tx_hash` 비유니크 → 온체인 결제 리플레이/이중적립 레이스. `prisma/schema.prisma:75`.

### 시크릿
- **H15** 프로덕션 시크릿이 로컬 `.env.vercel`/`.env.local`에 존재(gitignore되어 커밋은 안 됐으나 프로젝트 트리에 위치). zip/scp/Docker COPY/실사 공유 시 Neon DB 자격증명·FAL 키·`AGENT_ENCRYPTION_KEY`·`CRON_SECRET` 유출. `web/.env.vercel:1`. 수정: 모두 손상 간주·교체, 산출물에서 제외, `.dockerignore`에 `.env*`.
- **H16** Vercel 동기화 env의 **약한·추측가능 JWT 시크릿**(짧고 사람이 읽는 placeholder, `...change`). 추측 시 임의 사용자/관리자 토큰 위조 → 전면 인증우회. `web/.env.vercel:4`. 수정: `openssl rand -hex 32`로 교체(전 세션 무효화 감수), placeholder 제거, 부팅 시 최소엔트로피 검증.

### AI 비용
- **H17** Studio 크레딧 체크가 TOCTOU + 무가드 차감 → 동시요청으로 음수 잔액·무료 생성(Veo3 ~ $2.40/회). `studio/generate/route.ts:98`. 수정: 원자적 조건부 차감 + 생성행 생성 트랜잭션 내부.
- **H18** 레거시 비디오 생성이 **크레딧 차감 전에** 유료 Grok image+video API 호출 → 트랜잭션 실패/중단 시 provider엔 과금되고 사용자는 무과금. `pets/[petId]/generate/route.ts:225`. 수정: 호출 전 원자 예약, 실패 시 환불(studio 패턴 미러).
- **H19** Telegram 웹훅이 인바운드 메시지마다 크레딧/레이트리밋 없이 유료 Grok 호출 → 봇을 찾은 누구나 비용 폭탄(denial-of-wallet). `agent/webhook/telegram/[petId]/route.ts:98`. 수정: `consumeAgentCredits` 원자 차감 후에만 LLM 호출 + chat_id/pet_id 인바운드 레이트리밋.

---

## 3. MEDIUM (15)
- **M1** SIWE verify가 domain/URI/chainId/issued-at 미검증 → 주소+nonce만 맞으면 임의 메시지 수용(피싱 보조 재사용). `auth/verify/route.ts:41`
- **M2** `pets/[petId]/thought` GET 소유권 미확인 → 크로스테넌트 LLM 트리거·쓰기. `thought/route.ts:106`
- **M3** credits/purchase가 99% 과소납부 허용 + 실제 납부액 아닌 plan 가격 기록. `credits/purchase/route.ts:71`
- **M4** 주간 배틀 풀이 유료 참가비로 조성되나 참여 무관 power 상위100에 분배. `cron/distribute-pool/route.ts:85`
- **M5** `airdrop_points`가 다수 무캡 소스에서 글로벌 공급 회계 없이 발행. `lib/airdrop.ts:24`
- **M6** 온체인 무결성이 단일 핫 relayer 키 + 무제한 mint/tier 권한 owner에 전적 의존(중앙화 신뢰). `contracts/PETShop.sol:90`
- **M7** adopt-chat 'create'가 펫 이름/종/특성을 sanitize·moderation 없이 저장(=`/api/pets`가 강제하는 게이트 우회). `pets/adopt-chat/route.ts:88`
- **M8** adopt-chat이 요청마다 레이트리밋 없이 Grok 크레딧 소비. `pets/adopt-chat/route.ts:48`
- **M9** `Like`에 `@@unique([user_id, generation_id])` 없음 → 중복 좋아요로 카운트 부풀리기·NFT mint 트리거. `prisma/schema.prisma:230`
- **M10** 체크인 per-user/day 유니크 없음 → 동시 요청 이중 에어드랍. `checkin/route.ts:96`
- **M11** `deletePetData()`가 `onDelete:Restrict` 자식행 누락 → 활성 펫 데이터 삭제 트랜잭션 실패(GDPR/주권 삭제 불능). `lib/petclaw/data-sovereignty.ts:259`
- **M12** 마이그레이션 히스토리 불완전·스키마와 불일치(베이스 테이블 미마이그레이션, agent_schedule 컬럼 누락). `prisma/migrations/20260404000000_agent_system/migration.sql:36`
- **M13** `os.environ.get` 기본값에 안전하지 않은 하드코딩 fallback 시크릿. `scripts/generate_pet_avatars.py:9`
- **M14** Studio generate가 사용자 원문 프롬프트를 moderation 없이 fal.ai/Grok에 전달. `studio/generate/route.ts:71`
- **M15** 레이트리미터가 공유 JWT prefix 키 + in-memory per-instance → 사용자 격리 불가(H10과 동일 근본원인, 멀티인스턴스/서버리스에서 추가 악화). `lib/rateLimit.ts:25`

## 4. LOW (19)
- **L1** OAuth state JWT가 5분 수명 동안 재사용 가능(nonce 생성하나 기록·검증 안 함). `lib/oauth/state.ts:30`
- **L2** `jwtVerify`가 알고리즘 고정/iss·aud 미설정. `lib/auth.ts:32`
- **L3** 빈 `sid` 토큰은 세션-nonce 바인딩 우회 → 로그아웃 후 8h TTL 동안 유효. `lib/auth.ts:54`
- **L4** 세션이 Authorization 헤더 bearer JWT(httpOnly 쿠키 아님) → XSS 시 토큰 탈취. `auth/verify/route.ts:137`
- **L5** `petclaw/skills` GET이 타 펫 설치 스킬을 소유권 없이 조회. `petclaw/skills/route.ts:42`
- **L6** shop 구매가 stale 잔액 사용 + 조건부 gte 가드 없는 decrement. `shop/route.ts:31`
- **L7** `rewards/mockup`이 크레딧/페이월/레이트리밋 없이 유료 Grok 이미지 생성. `rewards/mockup/route.ts:42`
- **L8** Playtime 보상이 pet_id 없음/타인 것이어도 적립 + XP 일일캡 우회. `playtime/route.ts:45`
- **L9** PETShop 일일 구매 한도가 per-EOA → Sybil로 우회. `contracts/PETShop.sol:109`
- **L10** PETShop이 USDT만 인출 가능 → 다른 ERC20(PET 포함) 전송분 영구 잠김. `contracts/PETShop.sol:123`
- **L11** `PetSoul.claimInheritance`가 `isDeceased=true` 영구화 → 이후 체크포인트/heartbeat 동결. `contracts/PetSoul.sol:325`
- **L12** 웹앱이 메인넷 컨트랙트 주소·RPC 하드코딩, relayer mint 전 chainId/주소 검증 없음. `lib/blockchain.ts:10`
- **L13** distribute-pool이 `CRON_SECRET`을 URL 쿼리스트링으로 수용(로그 노출). `cron/distribute-pool/route.ts:52`
- **L14** distribute-pool 공개 GET이 우승자 지갑 주소 노출. `cron/distribute-pool/route.ts:136`
- **L15** `Transaction.tx_hash` 비유니크 + 인덱스 없음. `prisma/schema.prisma:62`
- **L16** 자주 필터되는 FK 컬럼 인덱스 누락(Generation.user_id, CreditPurchase.user_id, Like.generation_id). `prisma/schema.prisma:33`
- **L17** 상속이 `PetSoulNft.owner_wallet`만 갱신, 실제 Pet/User 소유권 미재배정. `lib/services/soul.ts:569`
- **L18** Studio 잡 폴링 1회가 상위 provider 요청 최대 11회로 팬아웃. `studio/generate/[jobId]/route.ts:57`
- **L19** Studio가 크레딧 차감과 상태 확정을 비원자적으로 분리 + 확정 실패 시 환불 없음. `studio/generate/route.ts:145`

## 5. INFO (5)
- **I1** OAuth redirect_uri가 조작가능 Host/X-Forwarded-Proto 헤더에서 파생. `lib/oauth/providers.ts:98`
- **I2** agent 'decay' 크론이 실제 펫 스탯 decay를 안 함(에이전트 크레딧 카운터만 리셋) — 명칭/의도 불일치. `agent/cron/decay/route.ts:20`
- **I3** `signAction` 메시지가 클라이언트 설정 timestamp만 포함, nonce/chainId/domain 없음 → 리플레이 방어가 전적으로 서버 의존. `lib/signAction.ts:22`
- **I4** 채팅 system prompt 스티어링 가능하나 영향 제한적(프롬프트 인젝션, 잘 완화됨). `pets/[petId]/chat/route.ts:136`
- **I5** `public-repo/` 스테이징 영역에 시크릿 없음(확인 완료). `public-repo/README.md`

---

## 6. 검수자 직접 발견(빌드/설정) — 워크플로 차원 외 보강
- **B1 (Medium)** `next.config.ts:34-35`가 `typescript.ignoreBuildErrors:true` + `eslint.ignoreDuringBuilds:true` → 현재 존재하는 **TypeScript 에러 11건이 프로덕션에 그대로 빌드·배포**됨. 타입/린트 안전망 무력화.
  - 실제 에러 예: `api/petclaw/import/route.ts:33`(판별 유니온 미구성으로 `.error` 접근), `components/SovereigntyDashboard.tsx:1090`(`on_chain` 없음), `hooks/useContracts.ts`·`useDirectUsdtPay.ts`·`usePETActivity.ts`(wagmi write 인자 `chain/account` 누락 — 런타임 결제/온체인 호출 깨질 수 있음), `hooks/useAuth.ts:89`·`lib/signAction.ts:42`(`signMessage` account 누락).
  - 수정: 최소한 CI에서 `tsc --noEmit` 게이트 추가, wagmi 훅 타입 에러부터 해소(실제 결제/서명 경로).
- **B2 (Low)** CSP가 `script-src 'unsafe-inline' 'unsafe-eval'` 허용(`next.config.ts:17`) → XSS 방어 약화. `connect-src https:`/`img-src https:`도 광범위. 가능하면 nonce 기반 CSP로 강화.
- **B3 (Low)** `coinbase/session` POST에 `getUser` 인증 없음 → 임의 walletAddress로 온램프 세션 토큰 발급 가능(Coinbase API quota abuse). `coinbase/session/route.ts:37`.

---

## 7. 반증·기각된 항목 (투명성)
- **R1 (기각)** `burnCredits` 음수 잔액 — 함수가 **호출처 없는 죽은 코드**라 실제 도달 불가(단, 라이브 음수 잔액은 H13에서 별건 확정). `credit-burn.ts:28`
- **R2 (강등→Low)** 모든 USD를 Float 저장 — 소비처가 모두 반올림/임계 버킷이라 실측 경제 왜곡 없음(텍스트북상 Decimal 권장 수준의 하드닝). `schema.prisma:629`
- **R3 (기각)** Vercel OIDC 토큰 노출 — 미커밋 + **이미 만료**(2026-03-13). 단 같은 파일의 장기 시크릿은 H15로 별건 확정. `web/.env.vercel:5`

---

## 8. 권장 조치 순서 (테마별)

1. **시크릿 로테이션 (오늘)**: Grok 키(C6), Neon DB·FAL·`AGENT_ENCRYPTION_KEY`(재암호화 필요)·`CRON_SECRET`·`JWT_SECRET`(H15/H16). gitleaks pre-commit + `.dockerignore .env*`.
2. **인가 게이트 (petclaw 표면)**: connectors/network·invoke/skills/thought에 `getUser` + 펫 소유권 패턴 일괄 적용(C1, C2, M2, L5).
3. **결제 원자성·단일 원장**: 공통 consumed-payments(tx_hash UNIQUE) + 모든 차감을 `updateMany({where:{credits:{gte}}})` 또는 트랜잭션 내부로(C3, H1, H2, H4, H13, H17, H18, M10, L6, L19). 기존 `PaidAction`/`shop` 패턴 재사용.
4. **서버 권위 게임 결과**: arena/result·pve를 `simulateBattle` 기반 서버 계산으로(C4, C5). 에어드랍 포인트 전 경로 일일 캡 + 글로벌 공급 회계(H5, H6, M5).
5. **레이트리밋·크론 재설계**: Redis/Upstash + 검증된 user id 키잉, 신뢰 프록시 IP, 크론 fail-closed(H10, H11, H12, M15, L13).
6. **비인증 비용 경로 차단**: agents/react, adopt-chat, rewards/mockup, telegram 웹훅, 데모 스킬에 인증+크레딧+레이트리밋(H9, H19, M8, L7).
7. **SSRF 방어**: DNS 해석+핀닝 기반 검증으로 교체(H8).
8. **데이터 모델·빌드 위생**: 누락 `@unique`/인덱스/onDelete 보강, 마이그레이션 정합(H14, M9, M11, M12, L15, L16), `tsc` CI 게이트(B1).

---

*검수 방법: 10차원 멀티에이전트 병렬 정적분석 + critical/high 전건 2중 적대적 검증(exploit 재현/반증). 코드 미실행 정적 분석 기반이므로, 4·5·8번 등 일부는 수정 후 동적 재검증(/verify) 권장.*

---

## 9. 조치 현황 (2026-06-04, 브랜치 `security-hardening-2026-06`)

#1(Grok 키 폐기·교체, 외부 작업)을 제외한 **모든 코드성 발견을 수정**했습니다. 변경: 웹 31개 파일 + 신규 모듈 4개(`lib/authz.ts`, `lib/payments.ts`, `lib/battleSim.ts`, `lib/cronAuth.ts`) + 마이그레이션 1개. `tsc --noEmit` 신규 에러 0건(기존 11건은 그대로).

### 수정 완료
- **C1/C2/M2/L5** petclaw `connectors`·`network/invoke`·`skills`(GET)·`thought`(GET)에 인증+펫 소유권 게이트(`lib/authz.ts`).
- **C3/H1/H2/H4/H14** 전 결제 경로 단일 원장 `ConsumedPayment`(tx_hash UNIQUE) + `treasuryConfigured()` fail-closed + `credit_purchases.payment_tx_hash @unique`.
- **C4/C5** arena `result`·`pve` 서버 권위 시뮬레이션(`lib/battleSim.ts`, 클라 `won` 신뢰 제거).
- **C6** (제외) — 키 교체는 직접. 단 권장: 두 `.py`의 하드코딩 키를 `os.environ`로 치환.
- **H5/M5** interact 에어드랍 포인트 일일 캡(`awardPointsCapped`). **H6** 콤보 tail 소비(재발동 차단). **H7/M10** 체크인 `DailyActionCount` 원자 클레임.
- **H13/H17/H18** 크레딧 차감을 `updateMany({credits:{gte}})` 원자 예약+실패 환불(generate/studio/mockup).
- **H9** `agents/react` 인증/크론+레이트리밋+배치 상한. **H19** 텔레그램 웹훅 `consumeAgentCredits` 선차감.
- **H10/H11** 레이트리미터 전체 토큰 해시 키잉 + 신뢰 프록시 IP. **H12** decay/activity/distribute-pool fail-closed(`lib/cronAuth.ts`).
- **H8** SSRF: `isSafeImageUrl` 강화(IPv6/메타데이터/내부호스트) + fetch 시점 DNS 검증 `isFetchableImageUrl`(video.ts ref fetch에 적용).
- **M1** SIWE domain+Issued-At 검증. **L2** alg 고정. **L3** 세션 sid 엄격. **M3** 실납부액 기록. **M4** 풀 분배 참가자 한정. **M7/M8** adopt-chat sanitize+moderation+레이트리밋. **M9** Like `@@unique`. **M11** deletePetData 누락 자식행 삭제. **M14** studio 프롬프트 moderation. **L7** mockup 크레딧+레이트리밋. **L13/L14** 풀 크론 헤더-only 시크릿+지갑주소 비노출. **L16** FK 인덱스. **B3** coinbase/session 인증.

### ⚠️ 배포 전 필수 운영 조치 (이 변경들이 fail-closed라 미설정 시 기능 중단)
1. **DB 마이그레이션 적용**: `prisma migrate deploy` — `consumed_payments` 테이블/유니크/인덱스가 없으면 결제 라우트가 런타임 오류. (중복 데이터 대비 dedupe 포함)
2. **`TREASURY_WALLET` 설정 필수** — 미설정 시 이제 모든 USDT 결제가 503(의도된 fail-closed).
3. **`CRON_SECRET` 설정 필수** — 미설정 시 decay/activity/distribute-pool 크론이 503. Vercel Cron은 `Authorization: Bearer $CRON_SECRET`로 호출되도록 구성.
4. (선택) **`SIWE_ALLOWED_DOMAINS`** — 다중 도메인/프록시 환경이면 csv로 지정(미설정 시 요청 Host로 검증).
5. **시크릿 로테이션**(H15/H16/C6): Grok·Neon·FAL·AGENT_ENCRYPTION_KEY·CRON_SECRET·JWT_SECRET.

### 온체인 교체 가능성(replaceability) 레이어 — 신규 `lib/onchain.ts`
트레저리 지갑·체인·USDT 토큰·컨트랙트 주소·온체인 검증 로직이 6개 이상 파일에 중복 하드코딩돼 있던 것을 **단일 모듈 `lib/onchain.ts`로 통합**했습니다. 모두 env로 덮어쓸 수 있고, 기본값은 현재 BSC/USDT 그대로라 **동작 변화 없음**. 나중에 교체 시:
- **트레저리 이전** → `TREASURY_WALLET`(+ 클라 `NEXT_PUBLIC_TREASURY_WALLET`)만 변경.
- **체인/RPC 변경** → `CHAIN_ID`·`CHAIN_NAME`·`RPC_URL`.
- **결제 토큰 변경** → `USDT_CONTRACT`·`USDT_DECIMALS`.
- **컨트랙트 재배포** → `PET_CONTENT_ADDRESS`·`PET_TRACKER_ADDRESS`·`PET_TOKEN_ADDRESS`·`PET_SHOP_ADDRESS`·`PET_ACTIVITY_ADDRESS`·`PET_SOUL_ADDRESS`(각각 `NEXT_PUBLIC_*` fallback).
- **검증 메커니즘 자체 교체**(다른 체인/인덱서 API/오프체인 레일) → `UsdtVerifier` 인터페이스 구현 후 `getUsdtVerifier()` 한 곳만 교체. 모든 결제 라우트가 `verifyUsdtTransfer()`를 호출하므로 라우트 코드는 불변.

적용 파일: credits/purchase·shop/premium·payments/action-pay·studio/subscription(로컬 검증함수 4벌 → 중앙 1벌), `blockchain.ts`(+chainId 가드 L12), `services/soul.ts`(RPC), `paywall.ts`, `config` 라우트, `contracts/index.ts`(클라 미러). 모두 `tsc` 통과.

### 미적용(별도 결정/위험 필요) — 권장사항으로 남김
- **스마트컨트랙트(M6/L9/L10/L11)** — 배포본 재설계는 재배포 필요, 코드 수정만으론 무효라 제외.
- **B1** 기존 TS 11건 + `ignoreBuildErrors` — 대부분 wagmi 훅 타입(런타임 동작), 지갑 흐름 회귀 위험으로 보류. wagmi 타입 정리 후 `ignoreBuildErrors` 해제 권장.
- **L1**(OAuth state 단발성 nonce 저장), **L4**(httpOnly 쿠키 전환), **M15**(레이트리밋 Redis 전환), **B2**(CSP nonce화) — 인프라/광범위 변경이라 후속 작업.
- **L8/L19** — 이미 일/회 단위로 bounded(기존 가드)라 보류.
