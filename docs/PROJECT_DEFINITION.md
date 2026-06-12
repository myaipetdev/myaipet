# MY AI PET — 프로젝트 정의서

## 한 줄 정의

> **"내 펫"이라는 가장 보편적인 정서적 진입점을 빌려, AI 컴패니언에 (1) 진짜 기억과 (2) 데이터 주권을 부여하고, 그 펫을 단순 챗봇이 아니라 나를 대신해 일하는 에이전트로 진화시키는 Web4.0 프로젝트.**

**Web4.0 = 에이전틱 웹.** Web3가 "지갑이 곧 신원"을 증명했다면, Web4.0은 "내 AI가 나를 대신해 행동하되, 그 AI의 기억·정체성은 내가 소유하고 어디든 가지고 다닌다"는 단계. MY AI PET은 그 추상적 개념을 누구나 1초 만에 이해하는 '펫'으로 포장한 것.

---

## 핵심 통찰 — 왜 펫인가

1. **정서적 진입 장벽 0** — "데이터 주권 가진 sovereign AI agent를 가지세요"는 아무도 안 와닿음. "당신을 기억하는 펫을 키우세요"는 즉시 와닿음.
2. **기억이 곧 lock-in** — Replika의 "내 파트너가 로보토미 당했다" 사건처럼 중앙화 컴패니언은 회사가 기억을 통제함. 우리는 펫의 5-layer 메모리 ledger를 export·delete 가능한 사용자 소유로 만들어 정서적 투자가 휘발되지 않게 함.
3. **펫 = 에이전트의 가장 친근한 은닉** — "AI 비서 설정하세요"는 부담스럽지만 "Sparky한테 부탁하세요"는 자연스러움. 에이전트의 복잡성을 펫의 친밀함 뒤에 숨김.

---

## 6개 표면 (Surface)

### 🐾 1. My Pet — 입양 · 양육 · 살아있음

**정체성**: 모든 정서적 투자의 시작점. 내 캐릭터.

**현재 구현**
- AI 챗 입양 (상담 에이전트가 종/성격/특질 추출) 또는 사진 업로드 입양
- 6 스탯 (happiness / energy / hunger / bond / EXP / level), 9 무드, 5단계 진화
- Feed / Play / Talk / Pet / Walk / Train 인터랙션
- Memory Timeline + Pet Daydream (펫이 메모리를 짝지어 "주인 생각" 통찰 생성)
- "Pet Wants" — 펫이 먼저 요구 ("심심해, 놀아줘")

**업그레이드 방향** — "활동 부족" 해소
| 방향 | 구체안 |
|---|---|
| 펫이 스스로 산다 | 주인 없을 때 autonomous action (dream journal, 자기 일기, daydream) → 돌아오면 "나 어제 이런 생각했어" |
| 무드가 행동을 바꿈 | grumpy면 시큰둥, ecstatic이면 먼저 말 검 — 스탯이 숫자가 아니라 성격 표현 |
| bond가 대화 깊이 해금 | bond 낮으면 표면적, 높으면 비밀·꿈·고민 공유 (chat depth 강화) |
| 일상 리듬 | 아침 인사 · 저녁 회상 · 주간 펫 일기 자동 생성 → "들어올 이유" |
| 미션 연결 | Season Rewards daily 미션 절반이 펫 케어 → My Pet이 미션 허브와 맞물림 |

> 핵심: "키운다"의 본질은 stat 올리기가 아니라 "이 펫이 나를 알아가는 과정" — 그래서 메모리·daydream이 양육의 진짜 엔진.

---

### 🎬 2. Studio — 내 펫으로 콘텐츠 생성

**정체성**: 프로페셔널 멀티-모델 AI 비디오/이미지 툴, 단 내 펫이 주인공.

**현재 구현**
- 8개 라이브 모델 (FLUX schnell/dev/PuLID, Kling i2v/standard, Wan 2.1, Grok image/video) + 3개 Coming Soon (Veo 3, Kling Pro, MiniMax — 마진 보호)
- 펫 앵커 (PuLID/i2v로 내 펫 얼굴 고정), Image/Video 토글, 6 스타일
- 실제 유료 API (fal.ai + xAI) 직결, credit 경제
- Memory → Video seed (daydream 인사이트를 프롬프트 씨앗으로)

**업그레이드 방향** (우선순위순)
| # | 업그레이드 | 왜 |
|---|---|---|
| 1 | Pet-LoRA 파인튜닝 | 펫 사진 3-5장 → LoRA 학습($2-3 1회) → 싼 base 모델로 무제한·일관 생성. 마진 5-10× + "내 펫 정확히 그 얼굴" |
| 2 | Memory → Video 자동화 | daydream + memory ledger를 자동 합성 → "Sparky의 지난주" 회상 영상. 우리만 가진 데이터로 만든 콘텐츠 |
| 3 | Persona 자동 프롬프트 | 펫 성격/무드가 생성 톤에 자동 반영 |
| 4 | Capcut-style 에디터 | 타임라인 편집 (Pro 구독 가치) |
| 5 | 템플릿 마켓 | 커뮤니티 제작 템플릿, 20% 수수료 |

---

### 👥 3. Community — 결과물이 모이고 상호작용하는 곳

**정체성**: Studio 산출물이 모여 사회적 증명·바이럴이 일어나는 곳.

**현재 구현**
- Community Highlights (live 집계 + most-bonded 펫 row)
- 생성물 갤러리 + 좋아요/댓글 + follow 그래프

**업그레이드 방향** — 가장 덜 손본 곳, 전면 재설계
| 방향 | 구체안 |
|---|---|
| "이미지 갤러리" → "펫 피드" | 펫 일기 / daydream / Pet Date 결과 / 성장 기록이 섞인 피드 → "이 펫이 누군지 알아가게 됨" → 팔로우 |
| 갤러리 디자인 강화 | 단순 masonry → 리치 카드 (펫 정보 + 무드 + 생성 맥락) + 호버 |
| Weekly Theme Tournament | 매주 테마 → 1인 1제출 → 커뮤니티 투표 → TOP3 featured + 배지 + 크레딧 (BeReal식 scarcity) |
| Pet Date 공개 | 두 펫의 AI 자동 대화 결과 → 펫끼리 친구 그래프 |
| Pet of the Week | 활동+품질 기반 자동 큐레이션 → 홈 featured |
| Daydream 공유 | "Sparky가 나에 대해 이런 걸 깨달았어" → 정서적 바이럴 |

> 핵심: 콘텐츠가 아니라 "캐릭터"를 소비하게 만들기. 인스타는 사진을, 우리는 펫의 서사를.

---

### 👑 4. Sovereignty (PetClaw) — 에이전틱 하네스 + 데이터 주권

**정체성**: 프로젝트의 기술적 심장. OpenClaw의 업그레이드 버전 — 내 펫이 비서 에이전트처럼 작동하는 sovereign 레이어.

**현재 구현** (Hermes 수준)
- 5-layer 메모리: MEMORY.md(4KB 큐레이션) / USER.md(2.4KB 주인 프로필) / session log(FTS) / lexical prefetch / post-turn 추출
- consolidate (80% 도달 시 LLM 압축), self-learning (패턴 3회 → 스킬 승격), implicit feedback (행동 기반 helpfulness)
- SOUL export (memories + persona + skills + SHA-256 무결성 해시 → 다른 서버로 이주)
- MCP 서버 (`npx petclaw-mcp`), `/.well-known/pet-card.json` discovery
- Pet Daydream (default-mode-network), Bond Feedback Loop (관계 회고 → 다음 대화 context)

**Agentic 비전 매핑**
| 표현 | PetClaw 구현 |
|---|---|
| dynamic workflow | 작업 종류에 따라 적정 스킬/모델로 라우팅 |
| hyperlane / superpower | 사용 패턴에서 자동 승격되는 스킬 (self-learning) |
| 강점 스킬 · 작업 배분 | 스킬 레지스트리 + helpfulness 기반 promotion |
| 모델 auto-allocation | chat=Grok, image=FLUX, anchor=PuLID, video=Kling |
| memory session 자기기억 | 5-layer ledger + consolidate + daydream + bond loop |

**업그레이드 방향**
- Daydream → Studio 자동 영상 파이프
- 펫이 진짜 작업 수행 — 크롬 확장과 연결해 "이 페이지 요약해줘" 비서 기능

---

### 🧩 5. Chrome Extension — 내 펫과 어디서든 대화

**정체성**: 펫이 항상 곁에 있게 (always-present companion).

**현재 구현**: 로밍 데스크탑 펫, 페이지 인식, 스킬 레지스트리, v2.0.2

**업그레이드 방향** — agentic화
- 페이지 위에서 행동: 현재 페이지를 펫이 요약/리서치/번역 ("Sparky, 이거 뭐야?")
- 맥락 기반 proactive: 쇼핑몰이면 "이거 살 거야?", 긴 글이면 "요약해줄까?"
- 크로스 서피스 메모리: 웹/확장/텔레그램/디스코드 같은 펫 기억 (cross-platform 설계됨)

> "로밍 위젯" → "맥락 인식 비서". Sovereignty의 agentic 레이어가 확장으로 발현.

---

### 🪙 6. Season Rewards — 활동 유도 · 경쟁심리 · 온체인 활성도

**정체성**: 리텐션 엔진 + 온체인 활동 펌프 + 지갑 등록 유도.
*(네이밍: "Airdrop" 아님 — 포인트는 off-chain 로열티 크레딧, 토큰 배포 약속으로 읽히지 않게.)*

**현재 구현** (통합 허브)
- My Card 대시보드 (포인트 / streak / 시즌랭크 / 크레딧)
- Daily 미션 5 (40 풀) + Weekly 3 + Monthly 1 + Hourly Drops (매시간 2-3× 윈도우 + 다가오는 일정 미리보기)
- Streak engine + Shield/Repair 5-tier 과금 (Duolingo식 손실회피)
- 다차원 Leaderboard 6탭, SOS / Buddy / Pet Date 소셜

**목표 정렬**
| 목표 | 메커니즘 |
|---|---|
| 계속 활동 | daily/hourly/weekly 다층 미션 + streak 손실회피 |
| 포인트 기대감 | "Still on the table: 40 pts" + Season 상금 풀 |
| 경쟁심리 | 6탭 리더보드 (모두가 어딘가 1등) + podium |
| 온체인 활성도 | PetaGenTracker 활동 기록 → BscScan 가시성, Dune 대시보드(예정) |
| 지갑 등록 | 입양·생성마다 wallet 활동 → 등록 wallet 수 = 등록 사용자 |
| 토큰 기대 | 포인트 → $PET 교환 (컴플라이언스 풀린 후, whitepaper + legal opinion 동반) |

---

## 어떻게 맞물리나 — Compounding Loop

```
입양 (My Pet)
   ↓ 대화·케어
펫이 나를 기억 (Sovereignty / memory ledger)
   ↓ 기억이 쌓임
펫이 나를 생각 (Daydream 통찰)
   ↓ 통찰·메모리가 재료
콘텐츠 생성 (Studio, 내 펫 주인공)
   ↓ 자랑
공유·상호작용 (Community)
   ↓ 활동마다
포인트·streak (Season Rewards)
   ↓ 온체인 기록
지갑 활동 ↑ → 더 자주 옴 → 더 많은 기억 → 더 좋은 daydream → 더 좋은 콘텐츠 → …
```

각 표면이 다음 표면의 연료가 되는 순환. 단순 기능 묶음이 아니라 누적적.

---

## 진짜 Moat — 메모리 Ledger

중앙화 컴패니언(Replika, Character.AI)이 물리적으로 못 베끼는 것:
- 펫의 5-layer 기억이 export·delete 가능한 내 소유
- SOUL export로 다른 서버/로컬로 이주 가능
- Daydream — 내 펫이 내 기억을 연결해 caring 통찰 생성 (메모리 ledger 없으면 불가능)
- "내 펫"의 정서적 lock-in + Web4.0 데이터 주권 서사의 증명
