# MY AI PET — Security Audit & Bug Fix Report (March 2026)

## Summary

| Metric | Detail |
|--------|--------|
| **Total issues found and fixed** | 26+ items |
| **Scope** | 4 Solidity contracts, Next.js web app (API routes + components), FastAPI backend |
| **Audit period** | March 2026 |

---

## Smart Contract Audit Fixes

### Critical (3)

| ID | Description |
|----|-------------|
| C-1 | Added `MAX_SUPPLY = 100M` cap to PETToken to prevent infinite minting |
| C-2 | PetaGenTracker switched from hand-rolled owner pattern to `Ownable2Step` |
| C-3 | Deploy script now wires `addMinter(petShop)` for PETToken |

### High (4)

| ID | Description |
|----|-------------|
| H-1 | `withdrawUSDT()` sends only to owner (removed arbitrary address parameter) |
| H-2 | PETContent uses `_mint` + `ReentrancyGuard` instead of `_safeMint` |
| H-3 | `batchGenerate` zero-address check added |
| H-4 | Tier struct has `exists` flag to prevent duplicate insertion |

### Medium (6)

| ID | Description |
|----|-------------|
| M-1 | Zero-address validation on all contracts |
| M-2 | All 4 contracts have `Pausable` emergency stop |
| M-3 | PETShop 10 purchases/day rate limit per user |
| M-4 | All contracts use `Ownable2Step` (multisig ready) |
| M-5 | All contracts unified to `^0.8.28` |
| M-6 | NFT `tokenId` starts at 1 |

### Additional

| ID | Description |
|----|-------------|
| A-2 | Deleted old unpatched `PetaGenTracker.sol` (root level) |
| A-7 | Deleted duplicate `deploy-all.cjs` |
| A-10 | `batchBurn` amount > 0 validation |
| — | BscScan API key configured |

---

## Web App Bug Fixes

### API Response Mismatches

| Area | Fix |
|------|-----|
| adopt-chat | `data.message` changed to `data.reply` |
| adopt-chat | `data.pet` changed to `data` (direct response) |
| adopt-chat | text/content field mismatch fixed |
| adopt-chat | `"ai"` role changed to `"assistant"` role mapping |
| adopt-chat | Missing `Authorization` header added |
| Video generate | Added `gen_type: "video"` to response |
| Comments | Added `display_name` from `UserProfile` |
| Send button | Unicode `\u27A4` replaced with literal `➤` |

### Race Conditions (CR-2) — 5 Files Fixed

All changed from stale-value updates to Prisma atomic operations:

| File | Atomic Operation |
|------|-----------------|
| `shop/route.ts` | `credits: { decrement: price }` |
| `pets/[petId]/generate/route.ts` | `credits: { decrement }` |
| `pets/slots/route.ts` | `pet_slots: { increment: 1 }, credits: { decrement }` |
| `pets/[petId]/evolve/route.ts` | `experience/credits: { increment }` |
| `arena/result/route.ts` | `experience/total_interactions: { increment }` |

### Payment Security (CR-1)

`credits/purchase/route.ts` — Added 5-layer on-chain TX verification:

| Layer | Check |
|-------|-------|
| 1 | TX hash format validation |
| 2 | Replay prevention (check existing purchases) |
| 3 | `eth_getTransactionReceipt` confirmation check |
| 4 | Sender wallet match verification |
| 5 | Transaction value/amount check |

### Other Security Fixes

| ID | Description |
|----|-------------|
| CR-3 | Comment delete clears `parent_id` (orphan prevention) |
| CR-4 | Social profile wallet `toLowerCase()` normalization |
| CR-5 | Auth nonce rotation on failed verification (replay prevention) |
| CR-6 | Comment `parent_id` type validation |
| CR-7 | FAL video 24-hour timeout |
| CR-8 | Generation status query includes `user_id` filter |

---

## Backend Fixes

| ID | Description |
|----|-------------|
| B-1 | Duplicate `calculate_mood()` removed, unified to `pet_engine.py` (9 moods) |
| B-4 | `get_photo_url` / `get_video_url` returns `None` instead of `"/static/uploads/None"` |

---

## Feature Additions

| Feature | Description |
|---------|-------------|
| Pet adoption | 2 modes (AI chat creation + photo upload) |
| Avatar prompt | Removed hardcoded kawaii style, `custom_traits` now reflected |
| Original style | Video generation toggle enabled |
| Pet PATCH API | `avatar_url` field support added |
