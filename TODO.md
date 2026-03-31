# MY AI PET — TODO

## 🔴 Next Priority: Adventure Mode V2 (Pokemon-Style Battle System)

### Design
- [ ] Skill system redesign — 4 skill slots per pet (like Pokemon)
- [ ] Skill types: Attack, Defense, Special, Utility
- [ ] Skill acquisition: purchase with $PET/USDT, learn through training, rare drops
- [ ] Skill leveling: upgrade skills with $PET (1→5 star rarity)
- [ ] Element system: Fire/Water/Grass/Electric type advantages

### Battle System
- [ ] Turn-based PvP with 4-skill combat
- [ ] Damage calculation based on pet stats + skill level + type advantage
- [ ] HP/MP system per battle
- [ ] Matchmaking by pet level range
- [ ] Battle rewards: EXP, $PET, rare skill drops

### Growth Mechanics
- [ ] Play time tracking — daily active time rewards
- [ ] $PET/USDT spent → proportional growth boost
- [ ] Premium training: USDT purchase for accelerated leveling
- [ ] Skill shop: buy/upgrade skills with USDT or $PET
- [ ] Daily training cap (prevent P2W abuse)

### On-chain
- [ ] Skill NFTs (PETContent) — rare skills as tradeable NFTs
- [ ] Battle results on-chain (PETActivity)
- [ ] Skill upgrade history on-chain

---

## 🟡 Backlog

### On-chain Improvements
- [ ] Multisig ownership transfer (Gnosis Safe)
- [ ] On-chain recording actual user test (BNB wallet)
- [ ] USDT purchase end-to-end test
- [ ] Coinbase Onramp full approval (pending CDP review)

### Adventure Modes (Currently Coming Soon)
- [ ] Wild Encounter — redesign with balanced rewards
- [ ] Explore — redesign with skill discovery
- [ ] Gym Challenge — redesign as skill training ground

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
