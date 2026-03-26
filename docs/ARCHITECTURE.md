# MY AI PET — Project Architecture

## Overview

MY AI PET is a Web3 AI pet platform on Binance Smart Chain (BSC). Users connect a wallet, adopt AI-driven pets, interact with them through daily activities, generate images and videos via AI, and earn on-chain rewards. The system spans three codebases — a Next.js web app, a FastAPI backend, and Solidity smart contracts — all coordinated through REST APIs and blockchain transactions.

---

## Tech Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Web (Primary) | Next.js 16, React 19, TypeScript | App Router, deployed on Vercel |
| Backend | FastAPI, SQLAlchemy (async) | Separate deployment |
| Frontend (Legacy) | React + Vite | Partially synced, being phased out |
| Smart Contracts | Solidity 0.8.28, Hardhat 3, OpenZeppelin 5.x | BSC mainnet |
| Database | Neon PostgreSQL | Prisma ORM (web), SQLAlchemy (backend) |
| AI | Grok API (x.ai) | Image generation, video generation, chat |
| Storage | Vercel Blob | Generated images and videos |
| Wallet | RainbowKit + WalletConnect | Web3 authentication |

**Live URL:** https://aipet-demo.vercel.app

---

## Directory Structure

```
aipet-project/
├── web/                        # Next.js 16 — primary application
│   ├── src/
│   │   ├── app/api/            # 44 API routes (serverless functions)
│   │   ├── components/         # React UI components
│   │   └── lib/                # Auth, Prisma client, API client, contract ABIs
│   └── prisma/                 # Database schema & migrations
│
├── backend/                    # FastAPI — async Python backend
│   └── app/
│       ├── routes/             # API endpoints
│       ├── services/           # Business logic (pet engine, blockchain, etc.)
│       └── models*.py          # SQLAlchemy models
│
├── contracts/                  # Solidity smart contracts
│   ├── contracts/              # 4 .sol files
│   ├── deploy.cjs              # Deployment script
│   └── hardhat.config.cjs      # Hardhat configuration
│
├── frontend/                   # Legacy React+Vite app
├── scripts/                    # Utility & maintenance scripts
└── docs/                       # Documentation
```

---

## System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                        Client                           │
│  Browser ── RainbowKit/WalletConnect ── MetaMask        │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│               Next.js 16 (Vercel)                       │
│                                                         │
│  ┌──────────────┐  ┌─────────────────────────────────┐  │
│  │  React 19    │  │  API Routes (44 endpoints)      │  │
│  │  Frontend    │  │  /api/auth/*                     │  │
│  │  Components  │  │  /api/pets/*                     │  │
│  │              │  │  /api/upload                     │  │
│  │              │  │  /api/pets/{id}/generate         │  │
│  └──────────────┘  └──────────┬──────────────────────┘  │
│                               │                         │
└───────────────────────────────┼─────────────────────────┘
                                │
              ┌─────────────────┼─────────────────┐
              ▼                 ▼                  ▼
┌──────────────────┐ ┌──────────────────┐ ┌───────────────┐
│  FastAPI Backend  │ │  Neon PostgreSQL │ │  Vercel Blob  │
│                   │ │                  │ │               │
│  - Video pipeline │ │  Prisma (web)    │ │  Images       │
│  - Blockchain TX  │ │  SQLAlchemy      │ │  Videos       │
│  - Pet AI engine  │ │  (backend)       │ │  Avatars      │
└──────────┬────────┘ └──────────────────┘ └───────────────┘
           │
           ▼
┌──────────────────┐         ┌──────────────────┐
│  Grok API (x.ai) │         │  BSC Mainnet     │
│                   │         │                  │
│  - Image gen      │         │  - PETToken      │
│  - Video gen      │         │  - PETShop       │
│  - Chat AI        │         │  - PETContent    │
└───────────────────┘         │  - PetaGenTracker│
                              └──────────────────┘
```

---

## Smart Contracts (BSC)

| Contract | Standard | Purpose |
|----------|----------|---------|
| **PETToken** | ERC-20 | `$PET` utility token. Mintable by authorized minters. 100M supply cap. |
| **PETShop** | — | Purchase `$PET` with USDT. 3 price tiers. Rate limited (10 purchases/day). |
| **PETContent** | ERC-721 | NFT representing AI-generated content (images/videos). |
| **PetaGenTracker** | — | On-chain activity log. Uses a relayer pattern for gas-efficient recording. |

All contracts use:
- **Ownable2Step** — Two-step ownership transfer (multisig ready)
- **Pausable** — Emergency stop mechanism
- **ReentrancyGuard** — On purchase and mint functions

**ABI sync path:** `contracts/artifacts/` → `web/src/lib/contracts/*.abi.json` → `backend/` (inline ABI)

---

## Key Flows

### 1. Authentication (Wallet-Based JWT)

```
User                    Frontend                  API
 │                         │                       │
 ├── Connect Wallet ──────►│                       │
 │                         ├── GET /api/auth/nonce─►│
 │                         │◄── nonce ─────────────┤
 │◄── Sign nonce ──────────┤                       │
 ├── Signature ───────────►│                       │
 │                         ├── POST /api/auth/verify►
 │                         │◄── JWT ───────────────┤
 │                         │                       │
 │   (all subsequent requests use Bearer token)    │
```

- Nonce rotates on auth failure to prevent replay attacks.

### 2. Pet Adoption

Two modes are supported:

**Mode A — AI Chat Adoption:**
1. User chats with Grok AI counselor.
2. AI extracts pet attributes (name, species, personality, traits).
3. `POST /api/pets/adopt-chat` (action: `create`) creates the pet record.
4. `POST /api/pets/avatar` triggers Grok image generation; avatar saved to Vercel Blob.
5. `PATCH /api/pets/{id}` persists the `avatar_url`.

**Mode B — Photo Upload Adoption:**
1. User uploads a photo via `POST /api/upload` (stored in Vercel Blob).
2. `POST /api/pets/adopt-chat` (action: `create`) creates the pet record.
3. `PATCH /api/pets/{id}` sets the uploaded photo as the avatar.

### 3. Content Generation (Image / Video)

```
User ──► POST /api/pets/{petId}/generate
              │
              ├── Image: Grok generates image → Vercel Blob → URL returned
              │
              └── Video: Grok generates image → submit to Grok video API
                         → poll for completion → Vercel Blob → URL returned
```

Generated content appears in the user's gallery and can be minted as ERC-721 NFTs via `PETContent`.

### 4. Pet Interaction & Stats

| Action | Affected Stats |
|--------|---------------|
| Feed | hunger ↓, energy ↑ |
| Play | happiness ↑, energy ↓ |
| Talk | bond ↑ |
| Pet | happiness ↑, bond ↑ |
| Walk | energy ↓, happiness ↑ |
| Train | bond ↑, energy ↓ |

- Stats decay passively over time.
- Mood is derived from the current stat combination.

**Mood States (9):** ecstatic, happy, neutral, tired, hungry, sad, grumpy, exhausted, starving.

---

## API Architecture

The system runs two API surfaces:

| Surface | Runtime | Responsibilities |
|---------|---------|-----------------|
| **Next.js API Routes** | Vercel serverless | Auth, pet CRUD, content generation triggers, uploads, credit/points management |
| **FastAPI Backend** | Separate server | Video generation pipeline, blockchain transaction recording, pet AI engine |

The Next.js web app is the primary entry point for all client requests. It delegates long-running or blockchain-specific tasks to the FastAPI backend.

---

## Security

| Area | Measure |
|------|---------|
| Contract ownership | Ownable2Step (two-step transfer, multisig ready) |
| Emergency stop | Pausable on all contracts |
| Reentrancy | ReentrancyGuard on purchase/mint |
| API auth | JWT on all API routes |
| Credits & points | Atomic Prisma operations (no race conditions) |
| Token purchases | On-chain TX verification |
| Auth replay | Nonce rotation on failure |
| Purchase spam | Rate limiting (10/day) |
