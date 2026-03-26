# ═══════════════════════════════════════════
#  PETAGEN (AI PET) - Full Setup Guide
# ═══════════════════════════════════════════

## 아키텍처

```
Frontend (React + wagmi)  ←→  Backend (FastAPI)  ←→  fal.ai (AI Video)
                               ├── SQLite DB
                               ├── File Storage (photos/videos)
                               └── web3.py → PetaGenTracker.sol (Base + BNB)
```

---

## 1. Smart Contract 배포

```bash
cd contracts
npm init -y
npm install hardhat @nomicfoundation/hardhat-toolbox
npx hardhat init  # "Create a JavaScript project" 선택

# hardhat.config.js에 네트워크 추가:
# networks: {
#   base: { url: "https://mainnet.base.org", accounts: [process.env.DEPLOYER_KEY] },
#   bnb: { url: "https://bsc-dataseed.binance.org/", accounts: [process.env.DEPLOYER_KEY] }
# }

npx hardhat run scripts/deploy.js --network base
npx hardhat run scripts/deploy.js --network bnb

# 배포 후: 백엔드 Relayer 주소 추가
# npx hardhat console --network base
# > const t = await ethers.getContractAt("PetaGenTracker", "0xCONTRACT_ADDR")
# > await t.addRelayer("0xBACKEND_RELAYER_ADDR")
```

## 2. Backend 실행

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

pip install -r requirements.txt

# 환경변수 설정
cp .env.template .env
# .env 파일에 필수 값 입력:
#   - JWT_SECRET (랜덤 32자)
#   - FAL_API_KEY (fal.ai에서 발급)
#   - CONTRACT_BASE, CONTRACT_BNB (배포된 주소)
#   - BACKEND_RELAYER_KEY (백엔드용 릴레이어 키)
#   - RELAYER_KEY (시뮬레이터용 릴레이어 키)

# 서버 시작
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Swagger API 문서: http://localhost:8000/docs
```

## 3. 시뮬레이터 실행 (별도 프로세스)

```bash
cd backend
python simulator.py
# 시뮬레이터는 자체 RELAYER_KEY 사용 (백엔드와 별도!)
```

## 4. Frontend 실행

```bash
cd frontend
npm install
npm run dev
# http://localhost:5173 접속
# Vite가 /api 요청을 localhost:8000으로 프록시
```

## 5. 프로덕션 배포

```bash
# Frontend → Vercel
cd frontend
npx vercel --prod

# Backend → Railway / Render
# requirements.txt + Procfile 또는 Dockerfile
# Procfile: web: uvicorn app.main:app --host 0.0.0.0 --port $PORT

# 시뮬레이터 → 별도 Railway 서비스
# Procfile: worker: python simulator.py
```

---

# API 엔드포인트 요약

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/health` | - | 헬스체크 |
| GET | `/api/auth/nonce?address=0x...` | - | SIWE 논스 발급 |
| POST | `/api/auth/verify` | - | 서명 검증 + JWT 발급 |
| GET | `/api/auth/me` | JWT | 유저 정보 |
| POST | `/api/generate` | JWT | 영상 생성 (multipart) |
| GET | `/api/generate/{id}/status` | JWT | 생성 상태 조회 |
| GET | `/api/generate/history` | JWT | 생성 이력 |
| GET | `/api/gallery` | - | 갤러리 (필터/페이지네이션) |
| GET | `/api/analytics/stats` | - | 플랫폼 통계 |
| GET | `/api/analytics/daily` | - | 일별 생성 차트 |
| GET | `/api/analytics/chains` | - | 체인별 분포 |
| GET | `/api/analytics/activity` | - | 실시간 활동 피드 |
| GET | `/api/credits/balance` | JWT | 크레딧 잔액 |
| POST | `/api/credits/purchase` | JWT | 크레딧 구매 |

---

# 기술 스택

| Layer | Technology |
|-------|-----------|
| Smart Contract | Solidity 0.8.20 + Hardhat |
| Backend | FastAPI + SQLAlchemy + aiosqlite |
| Auth | SIWE + JWT |
| AI Video | fal.ai (Kling 3.0) |
| Frontend | Vite + React 18 + wagmi + RainbowKit |
| Chains | Base (64%) + BNB Chain (36%) |
| DB | SQLite (→ PostgreSQL 마이그레이션 가능) |

---

# 비용 요약

| 항목 | 월간 비용 |
|------|----------|
| Base 가스 (~10 TX/일) | ~$1.5 |
| BNB 가스 (~6 TX/일) | ~$0.5 |
| Vercel (프론트) | $0 (무료 티어) |
| Railway (백엔드 + 시뮬레이터) | ~$10 |
| fal.ai (AI 영상, 유저 수에 따라) | 변동 |
| **인프라 합계 (AI 제외)** | **~$12/월** |

AI 비용: 5초 영상 1건 당 ~$0.50 (Kling 3.0 via fal.ai)
크레딧 가격: 5초=30크레딧, 100크레딧=$5 → 5초 영상 매출 $1.50 vs 비용 $0.50

---

# 프로젝트 구조

```
aipet-project/
├── SETUP.md
├── contracts/
│   ├── PetaGenTracker.sol     # 온체인 활동 기록 컨트랙트
│   └── deploy.js              # Hardhat 배포 스크립트
├── backend/
│   ├── .env.template          # 환경변수 템플릿
│   ├── requirements.txt       # Python 의존성
│   ├── simulator.py           # 온체인 활동 시뮬레이터
│   └── app/
│       ├── main.py            # FastAPI 앱 엔트리
│       ├── config.py          # 설정 (Pydantic)
│       ├── database.py        # SQLite 연결
│       ├── models.py          # DB 모델
│       ├── schemas.py         # API 스키마
│       ├── auth.py            # SIWE + JWT 인증
│       ├── routes/
│       │   ├── auth.py        # 인증 API
│       │   ├── generate.py    # 영상 생성 API
│       │   ├── gallery.py     # 갤러리 API
│       │   ├── analytics.py   # 분석 API
│       │   └── credits.py     # 크레딧 API
│       ├── services/
│       │   ├── ai_video.py    # fal.ai 연동
│       │   ├── blockchain.py  # 온체인 기록 (Relayer)
│       │   └── storage.py     # 파일 저장
│       └── tasks/
│           └── generation.py  # 백그라운드 생성 태스크
└── frontend/
    ├── package.json
    ├── vite.config.js         # API 프록시 설정
    ├── index.html
    └── src/
        ├── main.jsx           # wagmi + RainbowKit 설정
        ├── App.jsx            # 메인 앱
        ├── api.js             # API 클라이언트
        ├── hooks/
        │   ├── useAuth.js     # SIWE 인증 훅
        │   └── useWallet.js   # wagmi 체인 설정
        └── components/
            ├── Nav.jsx        # 네비게이션 + 지갑
            ├── Hero.jsx       # 랜딩 히어로
            ├── Stats.jsx      # 통계 카드
            ├── Feed.jsx       # 실시간 활동 피드
            ├── Generate.jsx   # 영상 생성 UI
            ├── Gallery.jsx    # 갤러리
            ├── Analytics.jsx  # 분석 대시보드
            └── Pricing.jsx    # 크레딧 구매
```
