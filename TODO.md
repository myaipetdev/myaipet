# MY AI PET — TODO

Updated: 2026-07-13

## 🔴 Open — Now

- [ ] Referral program wiring — scaffold only. `web/src/app/api/referral/` routes, `web/src/components/ReferralPanel.tsx`, and the `referral_program` migration exist, but ReferralPanel is not rendered anywhere in the app. Wire the panel into the UI + ship the migration before treating this as a feature. NOT live — do not document as shipped.
- [ ] fal.ai balance top-up (founder action) — Studio video generation routes through fal.ai (`web/src/lib/studio/providers.ts`); keep the account balance funded or runs fail.
- [ ] Decision: full Agent Office → PetClaw tab merge. 2026-07-24 interim shipped: office left the top nav (deep link + App render kept), mission-control now returns a `registered` signal and AgentOffice gates to an onboarding empty-state until the pet has any real agent signal, and PetClaw hosts the entry card. Remaining decision is only whether to physically merge the office UI into SovereigntyDashboard as a tab (needs a tab bar there). Note: hotel view is `GrandPawOffice.tsx` — `PetVillage.tsx` is dead code (imported nowhere), delete or justify.
- [ ] Decision: credit-pack reprice — packs grant 100/500/2000 credits for 5/20/50 USDT ($0.05/credit). Any change must keep UI credits equal to server grants (`/api/credits/purchase`) and stay margin-positive over model costs.

---

## ✅ Shipped: Adventure Mode V2 (Pokemon-Style Battle System)

### Design
- [x] Skill system redesign — 4 skill slots per pet (like Pokemon)
- [x] Skill types: Attack, Defense, Special, Utility
- [x] Skill acquisition: purchase with credits, learn through training, rare drops
- [x] Skill leveling: upgrade skills with credits (1→5 star rarity)
- [x] Element system: Fire/Water/Grass/Electric type advantages

### Battle System
- [x] Turn-based PvP with 4-skill combat
- [x] Damage calculation based on pet stats + skill level + type advantage
- [x] HP/EP system per battle
- [x] Matchmaking by pet level range
- [x] Battle rewards: EXP + rare skill drops

### Growth Mechanics
- [x] Play time tracking — daily active time rewards (/api/playtime)
- [x] Credits spent → proportional growth boost (1.0x→1.5x, lib/skills.ts getGrowthMultiplier)
- [x] Premium items (lib/premium.ts): EXP boosts, battle pass, skill scrolls — priced in credits
- [x] Skill shop: buy/upgrade skills with credits (Marketplace Skills tab)
- [x] Daily training cap (30 battles/day, 1500 exp/day)

### Adventure Modes
- [x] Wild Encounter — meet wild pets, skill discovery, credit drops (+ two-track Catch)
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

---

## 🟡 Backlog

### On-chain
- [ ] Multisig ownership transfer (Gnosis Safe)
- [ ] On-chain recording actual user test (BNB wallet)
- [ ] USDT purchase end-to-end test
- [ ] Skill NFTs (PETContent) — rare skills as collectible NFTs (cosmetic/collectible only; keep no-token posture — no financial framing)
- [ ] Battle results on-chain (PETActivity) — battle_history table ready
- [ ] Skill upgrade history on-chain

### Product
- [ ] Twitter account cleanup (@MYAIPETS)
- [ ] Investor logo verification — confirm logo assets render correctly for backers (Amber, WAGMI Ventures, Animoca, KuCoin Ventures, ViaBTC, Web3 Labs, Arkstream, ICC, WaterDrip, CryptoSen)
- [ ] Mobile responsive polish
- [ ] i18n (Korean/English toggle)

### Technical Debt
- [x] Prune retired Coinbase Onramp code and dependencies — the "Buy with Card" flow was removed; payment rail is SIWE + USDT on BSC only

---

## ✅ Completed

### Smart Contracts (BSC Mainnet)
- [x] PETToken (ERC20) — deployed + verified (on-chain purchase flow since RETIRED; economy is points-only, no token)
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
- [x] Rate limiting on payment/session endpoints (lib/rateLimit.ts)
- [x] Content moderation for user text + generation prompts (lib/moderation.ts)
- [x] Pet avatar guard — isHumanAvatar blocks human photos and fails closed when classification is unavailable (lib/services/petAvatarGuard.ts)

### Core Features
- [x] Pet adoption (AI chat + photo upload)
- [x] AI content generation (image + video, multiple styles)
- [x] On-chain activity recording implementation (production integration disabled)
- [x] NFT minting implementation (PETContent via relayer; production integration disabled)
- [x] PetaGenTracker batch-recording implementation via relayer (production integration disabled)
- [x] Arena battle system
- [x] Leaderboard + ranking
- [x] Social gallery + comments
- [x] Marketplace (DB-driven shop across 6 categories + Skills tab)
- [x] Pet evolution (5 stages)
- [x] Credit-purchase implementation — SIWE + USDT on BSC only; production sales disabled (packs defined as 100/500/2000 credits for 5/20/50 USDT)
- [x] Credits balance dropdown in Nav (platform credits, not wallet balance)
- [x] Season Rewards — airdrop_points renamed to season_points, lib/seasonRewards.ts (non-financial loyalty points; never "airdrop")
- [x] reward_redemptions table + unique-constraint migration
- [x] Removed legacy backend/ (FastAPI) and frontend/ (React) apps

### 2026 H1 Ships
- [x] Guest tour mode ?tour=1 — read-only DEMO previews for community/worldcup/my pet (lib/tour.ts, TourMyPet.tsx, WalletGate.tsx)
- [x] PetClaw native tool-calling — callLLMWithTools (lib/llm/router.ts), runToolAgent with available connector tools (web_search, wikipedia_lookup, crypto_price, recall_memory); web_read is declared and SSRF-guarded but unavailable; SSE via ?stream=1 on /api/pets/[petId]/agent
- [x] LLM router + BYOK owner models (/api/petclaw/models), plan-execute loop, GBrain memory retrieval (lib/petclaw/memory/retrieval.ts)
- [x] PetClaw honest skill surface — 18 real-handler/endpoint-backed skills (canonical count)
- [x] Studio: 22 trending templates with hover-play example videos (lib/studio/templates.ts, public/studio_examples/), Prompt Director v2 two-phase question sheet (/api/studio/prompt-director), client-side StudioEditor (WebCodecs/MediaRecorder, watermark on free tier)
- [x] Veo-3 provider listed as comingSoon at 400 credits/run (lib/studio/providers.ts)
- [x] Pet Village + cozy-world scenes — PetVillage (fronting Agent Office), PetPond, PetSquare (walkable), FocusSession, DailyPetCard
- [x] World Cup: Favorites Bracket (client-side personal picks) + Champion Prediction honest community poll (world_cup_predictions)
- [x] TCG cards/battle/illustrate + Cat Catch (cats + dogs, map + upload fallback)
- [x] Companion Codex sticker — collectible-creature sticker per pet (lib/codex.ts, pet_codex_url)
- [x] Chrome extension engagement → season_points via server-authoritative capped /api/petclaw/engagement
- [x] CLI PAT tokens (pck_ prefix) + @myaipet SDK packages (packages/petclaw)
- [x] Demo-video production kit (tools/demo-video/ — read HANDOFF.md before making any product video)

### Documentation
- [x] docs/DEPLOYMENT.md
- [x] docs/AUDIT_REPORT.md
- [x] docs/ARCHITECTURE.md
- [x] docs/ECONOMY.md, docs/PROJECT_DEFINITION.md, docs/DD_RESPONSE.md, docs/STUDIO-PRO.md
