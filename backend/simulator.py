"""
PETAGEN Activity Simulator
===========================
Generates realistic on-chain activity patterns via Relayer.
Run as cron or persistent process.

Usage:
  pip install web3 python-dotenv
  python simulator.py

Env vars (.env):
  RPC_BASE=https://mainnet.base.org
  RPC_BNB=https://bsc-dataseed.binance.org/
  CONTRACT_BASE=0x...
  CONTRACT_BNB=0x...
  RELAYER_KEY=0x...
"""

import asyncio
import random
import hashlib
import time
import json
import os
from datetime import datetime, timezone
from dataclasses import dataclass
from typing import List
from web3 import Web3
from eth_account import Account

# ═══════════════════════════════════════════
#  Config — 현실적 수치 (초기 프로젝트)
# ═══════════════════════════════════════════

@dataclass
class GrowthConfig:
    """주간 성장률 기반 자동 스케일링"""
    base_daily_generations: int = 40      # 일일 기본 생성 수
    base_daily_new_users: int = 8         # 일일 신규 유저
    base_daily_burns: int = 5             # 일일 번 이벤트
    weekly_growth_rate: float = 0.12      # 주간 12% 성장
    max_daily_generations: int = 500      # 상한선
    
    def get_today_target(self, days_since_launch: int) -> dict:
        weeks = days_since_launch / 7
        multiplier = (1 + self.weekly_growth_rate) ** weeks
        noise = random.uniform(0.75, 1.25)  # ±25% 일일 변동
        
        return {
            "generations": min(
                int(self.base_daily_generations * multiplier * noise),
                self.max_daily_generations
            ),
            "new_users": max(1, int(self.base_daily_new_users * multiplier * noise * 0.8)),
            "burns": max(1, int(self.base_daily_burns * multiplier * noise * 0.6))
        }

# ═══════════════════════════════════════════
#  Time-of-day activity distribution
# ═══════════════════════════════════════════

# UTC 기준 시간대별 가중치 (아시아 타겟 → UTC+8~9 피크)
HOURLY_WEIGHTS = {
    0: 1.3, 1: 1.5, 2: 1.4, 3: 1.2,     # 아시아 저녁 피크
    4: 0.9, 5: 0.7, 6: 0.5, 7: 0.4,      # 아시아 심야
    8: 0.6, 9: 0.8, 10: 1.0, 11: 1.1,    # 유럽 아침
    12: 1.2, 13: 1.3, 14: 1.1, 15: 1.0,  # 유럽 오후
    16: 0.9, 17: 0.8, 18: 0.7, 19: 0.6,  # 미주 아침
    20: 0.8, 21: 0.9, 22: 1.0, 23: 1.1,  # 아시아 오후 시작
}

PET_WEIGHTS = [30, 25, 10, 8, 10, 7, 5, 5]  # cat,dog,parrot,turtle,hamster,rabbit,fox,pom
STYLE_WEIGHTS = [40, 25, 15, 12, 8]          # cinematic,anime,watercolor,3d,sketch

# ═══════════════════════════════════════════
#  Wallet Pool
# ═══════════════════════════════════════════

class WalletPool:
    """재사용 가능한 지갑 풀 — 반복 유저 패턴 시뮬레이션"""
    
    def __init__(self, size: int = 200):
        self.wallets: List[str] = []
        self.activity_count: dict = {}
        self._generate(size)
    
    def _generate(self, size: int):
        for _ in range(size):
            acct = Account.create()
            addr = acct.address
            self.wallets.append(addr)
            self.activity_count[addr] = 0
    
    def get_active_user(self) -> str:
        """기존 활성 유저 반환 (파워유저 편향)"""
        # 80/20 룰: 상위 20% 유저가 활동의 80%
        if self.activity_count and random.random() < 0.7:
            sorted_wallets = sorted(
                self.activity_count.items(), 
                key=lambda x: x[1], reverse=True
            )
            top_20 = sorted_wallets[:max(1, len(sorted_wallets)//5)]
            chosen = random.choice(top_20)[0]
        else:
            chosen = random.choice(self.wallets)
        
        self.activity_count[chosen] = self.activity_count.get(chosen, 0) + 1
        return chosen
    
    def get_new_user(self) -> str:
        """활동 없는 지갑 반환 (신규 유저)"""
        inactive = [w for w in self.wallets if self.activity_count.get(w, 0) == 0]
        if not inactive:
            # 풀 확장
            acct = Account.create()
            self.wallets.append(acct.address)
            self.activity_count[acct.address] = 0
            return acct.address
        chosen = random.choice(inactive)
        self.activity_count[chosen] = 1
        return chosen


# ═══════════════════════════════════════════
#  Simulator
# ═══════════════════════════════════════════

class PetaGenSimulator:
    
    def __init__(self):
        self.config = GrowthConfig()
        self.wallet_pool = WalletPool(200)
        self.launch_date = datetime(2025, 3, 1, tzinfo=timezone.utc)
        
        # Chain connections
        self.chains = {}
        rpc_base = os.getenv("RPC_BASE", "https://mainnet.base.org")
        rpc_bnb = os.getenv("RPC_BNB", "https://bsc-dataseed.binance.org/")
        
        if os.getenv("CONTRACT_BASE"):
            w3 = Web3(Web3.HTTPProvider(rpc_base))
            self.chains["base"] = {
                "w3": w3,
                "contract": w3.eth.contract(
                    address=Web3.to_checksum_address(os.getenv("CONTRACT_BASE")),
                    abi=self._load_abi()
                ),
                "weight": 0.64  # 64% Base, 36% BNB
            }
        
        if os.getenv("CONTRACT_BNB"):
            w3 = Web3(Web3.HTTPProvider(rpc_bnb))
            self.chains["bnb"] = {
                "w3": w3,
                "contract": w3.eth.contract(
                    address=Web3.to_checksum_address(os.getenv("CONTRACT_BNB")),
                    abi=self._load_abi()
                ),
                "weight": 0.36
            }
        
        self.relayer = Account.from_key(os.getenv("RELAYER_KEY", "0x" + "0" * 64))
    
    def _load_abi(self) -> list:
        abi_path = os.path.join(os.path.dirname(__file__), "abi", "PetaGenTracker.json")
        if os.path.exists(abi_path):
            with open(abi_path) as f:
                return json.load(f)
        # Minimal ABI for the functions we need
        return [
            {"inputs":[{"name":"users","type":"address[]"},{"name":"petTypes","type":"uint8[]"},{"name":"styles","type":"uint8[]"},{"name":"contentHashes","type":"bytes32[]"}],"name":"batchGenerate","outputs":[],"stateMutability":"nonpayable","type":"function"},
            {"inputs":[{"name":"users","type":"address[]"},{"name":"amounts","type":"uint256[]"}],"name":"batchBurn","outputs":[],"stateMutability":"nonpayable","type":"function"},
            {"inputs":[],"name":"getStats","outputs":[{"name":"","type":"uint256"},{"name":"","type":"uint256"},{"name":"","type":"uint256"}],"stateMutability":"view","type":"function"}
        ]
    
    def _pick_chain(self) -> str:
        r = random.random()
        cumulative = 0
        for name, info in self.chains.items():
            cumulative += info["weight"]
            if r <= cumulative:
                return name
        return list(self.chains.keys())[0]
    
    def _content_hash(self, user: str) -> bytes:
        raw = f"{user}-{time.time()}-{random.random()}"
        return Web3.keccak(text=raw)
    
    async def _send_batch_tx(self, chain_name: str, func_name: str, *args):
        """Send a batch transaction to the specified chain"""
        chain = self.chains.get(chain_name)
        if not chain:
            print(f"[DRY RUN] {chain_name}.{func_name}({len(args[0])} items)")
            return None
        
        try:
            w3 = chain["w3"]
            contract = chain["contract"]
            nonce = w3.eth.get_transaction_count(self.relayer.address)
            
            func = getattr(contract.functions, func_name)(*args)
            tx = func.build_transaction({
                "from": self.relayer.address,
                "nonce": nonce,
                "gas": 100000 + len(args[0]) * 40000,
                "gasPrice": w3.eth.gas_price,
            })
            
            signed = self.relayer.sign_transaction(tx)
            tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
            receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
            
            print(f"[TX] {chain_name} | {func_name} | {len(args[0])} items | {tx_hash.hex()[:16]}...")
            return receipt
            
        except Exception as e:
            print(f"[ERROR] {chain_name}.{func_name}: {e}")
            return None
    
    async def run_hour_batch(self, targets: dict):
        """시간당 배치 실행"""
        hour = datetime.now(timezone.utc).hour
        weight = HOURLY_WEIGHTS.get(hour, 1.0)
        
        # 이번 시간 할당량
        hourly_gens = max(1, int((targets["generations"] / 24) * weight * random.uniform(0.8, 1.2)))
        hourly_new = max(0, int((targets["new_users"] / 24) * weight))
        hourly_burns = max(0, int((targets["burns"] / 24) * weight))
        
        # --- Video Generations ---
        if hourly_gens > 0:
            users, pet_types, styles, hashes = [], [], [], []
            
            for _ in range(hourly_gens):
                if hourly_new > 0 and random.random() < 0.3:
                    user = self.wallet_pool.get_new_user()
                    hourly_new -= 1
                else:
                    user = self.wallet_pool.get_active_user()
                
                users.append(Web3.to_checksum_address(user))
                pet_types.append(random.choices(range(8), weights=PET_WEIGHTS)[0])
                styles.append(random.choices(range(5), weights=STYLE_WEIGHTS)[0])
                hashes.append(self._content_hash(user))
            
            chain = self._pick_chain()
            await self._send_batch_tx(chain, "batchGenerate", users, pet_types, styles, hashes)
        
        # --- Burns ---
        if hourly_burns > 0:
            burn_users = [
                Web3.to_checksum_address(self.wallet_pool.get_active_user())
                for _ in range(hourly_burns)
            ]
            burn_amounts = [
                Web3.to_wei(random.randint(5, 80), "ether")  # 5-80 $PETA
                for _ in range(hourly_burns)
            ]
            chain = self._pick_chain()
            await self._send_batch_tx(chain, "batchBurn", burn_users, burn_amounts)
        
        print(f"[BATCH] hour={hour} gens={hourly_gens} burns={hourly_burns} weight={weight:.1f}")
    
    async def run_forever(self):
        """메인 루프 — 1시간 간격 실행"""
        print("=" * 50)
        print("PETAGEN Activity Simulator Started")
        print(f"Chains: {list(self.chains.keys()) or ['DRY RUN']}")
        print(f"Wallet pool: {len(self.wallet_pool.wallets)}")
        print("=" * 50)
        
        while True:
            days = (datetime.now(timezone.utc) - self.launch_date).days
            targets = self.config.get_today_target(days)
            
            print(f"\n[DAY {days}] Targets: {targets}")
            
            await self.run_hour_batch(targets)
            
            # 다음 실행까지 대기 (45~75분 — 정확한 1시간 간격 피하기)
            wait = random.randint(2700, 4500)
            print(f"[WAIT] {wait//60}m until next batch")
            await asyncio.sleep(wait)


# ═══════════════════════════════════════════
#  Entry
# ═══════════════════════════════════════════

if __name__ == "__main__":
    try:
        from dotenv import load_dotenv
        load_dotenv()
    except ImportError:
        pass
    
    sim = PetaGenSimulator()
    asyncio.run(sim.run_forever())
