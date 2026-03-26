# MY AI PET - BSC Deployment Guide

## Overview

Four Solidity 0.8.28 contracts (OpenZeppelin 5.x) deployed to BNB Smart Chain:

| Contract | Type | Key Features |
|----------|------|-------------|
| **PETToken** | ERC20 | Mintable, burnable, MAX_SUPPLY 100M, Ownable2Step, Pausable |
| **PETShop** | Purchase gateway | Buy PET with USDT, 3 tiers, rate limit 10/day, ReentrancyGuard |
| **PETContent** | ERC721 NFT | AI-generated content NFTs, minter role, ReentrancyGuard |
| **PetaGenTracker** | Activity tracker | On-chain recording, relayer pattern, batch ops (max 50) |

**PETShop tiers:**

| Tier | Price (USDT) | PET Received |
|------|-------------|-------------|
| Starter | $5 | 500 PET |
| Creator | $20 | 2,500 PET |
| Pro | $50 | 10,000 PET |

---

## Prerequisites

- **Node.js** (v18+)
- **Hardhat 3.x** (`npm install` in `contracts/`)
- **Deployer wallet** funded with ~0.01 BNB ($6-7) for gas
- **BscScan API key** for contract verification

## Environment Setup

Create `contracts/.env`:

```env
DEPLOYER_PRIVATE_KEY=0x...your_private_key...
BSCSCAN_API_KEY=your_bscscan_api_key

# Optional
MULTISIG_ADDRESS=0x...         # Ownable2Step ownership transfer target
RELAYER_ADDRESS=0x...          # Backend relayer for PETContent & Tracker
```

> **Never commit `.env` to version control.**

---

## Deploy

```bash
cd contracts
npm install
npx hardhat --config hardhat.config.cjs run deploy.cjs --network bsc
```

The deploy script (`contracts/deploy.cjs`) does the following in order:

1. Deploys **PETToken**
2. Deploys **PETShop** (with BSC USDT: `0x55d398326f99059fF775485246999027B3197955`)
3. Deploys **PETContent**
4. Deploys **PetaGenTracker**
5. Wires permissions:
   - Grants PETShop the minter role on PETToken
   - Grants the relayer address minter/recorder roles on PETContent and PetaGenTracker
6. Verifies all contracts on BscScan
7. If `MULTISIG_ADDRESS` is set, initiates Ownable2Step ownership transfer (multisig must call `acceptOwnership()` to complete)

Save the deployed contract addresses printed in the console output.

---

## Post-Deployment Configuration

### 1. Backend

Add contract addresses to `backend/.env`:

```env
CONTRACT_BNB_PET_TOKEN=0x...
CONTRACT_BNB_PET_SHOP=0x...
CONTRACT_BNB_PET_CONTENT=0x...
CONTRACT_BNB_PETAGENTRACKER=0x...
BACKEND_RELAYER_KEY=0x...your_relayer_private_key...
```

### 2. Frontend

Add contract addresses to `web/.env`:

```env
NEXT_PUBLIC_PET_TOKEN_ADDRESS=0x...
NEXT_PUBLIC_PET_SHOP_ADDRESS=0x...
NEXT_PUBLIC_PET_CONTENT_ADDRESS=0x...
NEXT_PUBLIC_PETAGENTRACKER_ADDRESS=0x...
```

### 3. ABIs

If contract interfaces changed since last deploy, copy the updated ABIs:

```bash
cp contracts/artifacts/contracts/*.sol/*.json web/src/lib/contracts/
```

---

## Verification

If automatic verification failed during deploy, verify manually:

```bash
cd contracts
npx hardhat --config hardhat.config.cjs verify --network bsc <CONTRACT_ADDRESS> <CONSTRUCTOR_ARGS...>
```

Check verified contracts at `https://bscscan.com/address/<CONTRACT_ADDRESS>#code`.

---

## Multisig Ownership Transfer

If `MULTISIG_ADDRESS` was set, the deploy script calls `transferOwnership()` on each contract. This is a two-step process (Ownable2Step):

1. Deploy script calls `transferOwnership(multisigAddress)` -- pending state
2. Multisig must call `acceptOwnership()` on each contract to finalize

Until step 2 is completed, the deployer remains the active owner.

---

## Cost Estimate

| Item | Estimated Cost |
|------|---------------|
| Deploy 4 contracts | ~0.005-0.008 BNB |
| Permission wiring txs | ~0.001-0.002 BNB |
| Contract verification | Free |
| **Total** | **~0.01 BNB ($6-7)** |

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `insufficient funds` | Fund deployer wallet with at least 0.01 BNB |
| `nonce too low` | Wait for pending txs to confirm, or reset nonce in wallet |
| BscScan verification fails | Retry with `npx hardhat verify` manually; check API key is valid |
| `execution reverted` on PETShop | Confirm USDT address matches BSC mainnet (`0x55d398326f99059fF775485246999027B3197955`) |
| Ownership transfer stuck | Multisig must call `acceptOwnership()` on each contract |
