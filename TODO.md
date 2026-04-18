# MY AI PET — TODO

## 🔴 Next Priority: Adventure Mode V2 (Pokemon-Style Battle System)

### Design
- [x] Skill system redesign — 4 skill slots per pet (like Pokemon)
- [x] Skill types: Attack, Defense, Special, Utility
- [x] Skill acquisition: purchase with $PET/USDT, learn through training, rare drops
- [x] Skill leveling: upgrade skills with $PET (1→5 star rarity)
- [x] Element system: Fire/Water/Grass/Electric type advantages

### Battle System
- [x] Turn-based PvP with 4-skill combat
- [x] Damage calculation based on pet stats + skill level + type advantage
- [x] HP/EP system per battle
- [x] Matchmaking by pet level range
- [x] Battle rewards: EXP, $PET, rare skill drops (5% chance)

### Growth Mechanics
- [x] Play time tracking — daily active time rewards (/api/playtime)
- [x] $PET/USDT spent → proportional growth boost (1.0x→1.5x)
- [x] Premium training: USDT purchase for accelerated leveling
- [x] Skill shop: buy/upgrade skills with USDT or $PET (Marketplace Skills tab)
- [x] Daily training cap (30 battles/day, 1500 exp/day)

### Adventure Modes
- [x] Wild Encounter — meet wild pets, skill discovery, credit drops
- [x] Explore — treasure/training/rest locations with real rewards
- [x] Gym Challenge — timing minigame for stat training

### PvE Story Mode
- [x] 30 stages across 6 regions (Grasslands→Volcano→Ocean→Storm→Shadow→Dragon)
- [x] Boss progression: Gym Leaders → Elite → Dragon King Bahamut (Lv.60)
- [x] 3-star rating system (HP remaining + turn count)
- [x] First-clear guaranteed skill drops per boss
- [x] Stage map UI with region headers and star progress
- [x] Boss intro dialogue + victory/defeat dialogue
- [x] DB: pve_progress table with best_turns, best_hp_left tracking

### On-chain
- [ ] Skill NFTs (PETContent) — rare skills as tradeable NFTs
- [ ] Battle results on-chain (PETActivity) — BattleHistory table ready
- [ ] Skill upgrade history on-chain

---

## 🟡 Backlog

### On-chain Improvements
- [ ] Multisig ownership transfer (Gnosis Safe)
- [ ] On-chain recording actual user test (BNB wallet)
- [ ] USDT purchase end-to-end test
- [ ] Coinbase Onramp full approval (pending CDP review)

### Adventure Modes (✅ Implemented in V2)
- [x] Wild Encounter — API-backed with real rewards + skill drops
- [x] Explore — 3-location reveal with treasure/training/rest
- [x] Gym Challenge — timing minigame with API rewards

### Product
- [ ] Custom domain (myaipet.com)
- [ ] Twitter account cleanup (@MYAIPETS)
- [ ] Investor logo verification
- [ ] Mobile responsive polish
- [ ] i18n (Korean/English toggle)

### Technical Debt
- [ ] Remove backend/ FastAPI (unused — all logic in Next.js API routes)
- [ ] Remove frontend/ legacy React app (unused)
- [ ] Prisma migration for reward_redemptions table
- [ ] Rate limiting on Coinbase session endpoint
- [ ] Content moderation for AI-generated images (IP filtering)

---

## ✅ Completed

### Smart Contracts (BSC Mainnet)
- [x] PETToken (ERC20) — deployed + verified
- [x] PETShop — deployed + verified
- [x] PETContent (ERC721) — deployed + verified
- [x] PetaGenTracker — deployed + verified
- [x] PETActivity — deployed + verified

### Security Audit
- [x] 2 audits + 1 code review — 40+ issues fixed
- [x] ERC20Pausable on PETToken
- [x] Ownable2Step on all contracts
- [x] ReentrancyGuard on purchase/mint
- [x] Atomic DB operations (prisma.$transaction)
- [x] TX 5-layer verification for credit purchase
- [x] Nonce rotation on auth failure
- [x] Wallet signature on adoption/generation

### Features
- [x] Pet adoption (AI chat + photo upload)
- [x] AI content generation (image + video, 6 styles)
- [x] On-chain activity recording (PETActivity)
- [x] NFT minting (PETContent) via relayer
- [x] PetaGenTracker batch recording via relayer
- [x] Coinbase Onramp (Base/USDC, session token auth)
- [x] Arena battle system
- [x] Leaderboard + ranking
- [x] Social gallery + comments
- [x] Marketplace (31 items, 5 categories)
- [x] Pet evolution (5 stages)
- [x] Credit purchase (USDT on BSC)
- [x] $PET balance dropdown

### Documentation
- [x] docs/DEPLOYMENT.md
- [x] docs/AUDIT_REPORT.md
- [x] docs/ARCHITECTURE.md
