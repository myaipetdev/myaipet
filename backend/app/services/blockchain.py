"""
PETAGEN Blockchain Service
On-chain recording via Relayer pattern.
Reuses web3 patterns from simulator.py.
"""

import os
import random
import asyncio
import logging
from typing import Optional, Dict, List, Tuple
from datetime import datetime, timezone
from dataclasses import dataclass, field

from web3 import Web3
from eth_account import Account

from app.config import settings

logger = logging.getLogger(__name__)

# Minimal ABI for PetaGenTracker contract
CONTRACT_ABI = [
    {
        "inputs": [
            {"name": "users", "type": "address[]"},
            {"name": "petTypes", "type": "uint8[]"},
            {"name": "styles", "type": "uint8[]"},
            {"name": "contentHashes", "type": "bytes32[]"},
        ],
        "name": "batchGenerate",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function",
    },
    {
        "inputs": [
            {"name": "users", "type": "address[]"},
            {"name": "amounts", "type": "uint256[]"},
        ],
        "name": "batchBurn",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function",
    },
    {
        "inputs": [
            {"name": "user", "type": "address"},
            {"name": "credits", "type": "uint256"},
            {"name": "amountPaid", "type": "uint256"},
        ],
        "name": "recordPurchase",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function",
    },
    {
        "inputs": [],
        "name": "getStats",
        "outputs": [
            {"name": "", "type": "uint256"},
            {"name": "", "type": "uint256"},
            {"name": "", "type": "uint256"},
        ],
        "stateMutability": "view",
        "type": "function",
    },
    {
        "inputs": [{"name": "user", "type": "address"}],
        "name": "getUserStats",
        "outputs": [
            {"name": "registered", "type": "bool"},
            {"name": "generations", "type": "uint256"},
        ],
        "stateMutability": "view",
        "type": "function",
    },
]

# Minimal ABI for PETContent NFT contract (mintContent only)
PET_CONTENT_ABI = [
    {
        "inputs": [
            {"name": "to", "type": "address"},
            {"name": "uri", "type": "string"},
            {"name": "petType", "type": "uint8"},
            {"name": "style", "type": "uint8"},
            {"name": "genType", "type": "string"},
            {"name": "contentHash", "type": "bytes32"},
        ],
        "name": "mintContent",
        "outputs": [{"name": "", "type": "uint256"}],
        "stateMutability": "nonpayable",
        "type": "function",
    },
]


@dataclass
class TxResult:
    success: bool
    tx_hash: str = ""
    chain: str = ""
    block_number: int = 0
    gas_used: int = 0
    error: str = ""


@dataclass
class PendingRecord:
    user_address: str
    pet_type: int
    style: int
    content_hash: bytes
    generation_id: int


class BlockchainService:
    """
    On-chain recording service using Relayer pattern.
    Supports batch recording for gas efficiency.
    """

    def __init__(self):
        self.chains: Dict[str, dict] = {}
        self.relayer = None
        self.nft_w3: Optional[Web3] = None
        self.nft_contract = None
        self.batch_queue: List[PendingRecord] = []
        self._batch_lock = asyncio.Lock()
        self._initialized = False

    def initialize(self):
        """Initialize blockchain connections. Call after settings are loaded."""
        if self._initialized:
            return

        if settings.CONTRACT_BASE:
            try:
                w3 = Web3(Web3.HTTPProvider(settings.RPC_BASE))
                self.chains["base"] = {
                    "w3": w3,
                    "contract": w3.eth.contract(
                        address=Web3.to_checksum_address(settings.CONTRACT_BASE),
                        abi=CONTRACT_ABI,
                    ),
                    "weight": 0.64,
                }
                logger.info(f"Connected to Base: {settings.CONTRACT_BASE}")
            except Exception as e:
                logger.warning(f"Failed to connect to Base: {e}")

        if settings.CONTRACT_BNB:
            try:
                w3 = Web3(Web3.HTTPProvider(settings.RPC_BNB))
                self.chains["bnb"] = {
                    "w3": w3,
                    "contract": w3.eth.contract(
                        address=Web3.to_checksum_address(settings.CONTRACT_BNB),
                        abi=CONTRACT_ABI,
                    ),
                    "weight": 0.36,
                }
                logger.info(f"Connected to BNB: {settings.CONTRACT_BNB}")
            except Exception as e:
                logger.warning(f"Failed to connect to BNB: {e}")

        if settings.CONTRACT_PET_CONTENT:
            try:
                w3 = Web3(Web3.HTTPProvider(settings.RPC_BNB))
                self.nft_w3 = w3
                self.nft_contract = w3.eth.contract(
                    address=Web3.to_checksum_address(settings.CONTRACT_PET_CONTENT),
                    abi=PET_CONTENT_ABI,
                )
                logger.info(f"Connected to PETContent: {settings.CONTRACT_PET_CONTENT}")
            except Exception as e:
                logger.warning(f"Failed to connect to PETContent: {e}")

        if settings.BACKEND_RELAYER_KEY:
            self.relayer = Account.from_key(settings.BACKEND_RELAYER_KEY)
            logger.info(f"Relayer address: {self.relayer.address}")

        self._initialized = True

    def _pick_chain(self) -> str:
        """Select chain based on weight distribution (64% Base / 36% BNB)."""
        r = random.random()
        cumulative = 0.0
        for name, info in self.chains.items():
            cumulative += info["weight"]
            if r <= cumulative:
                return name
        return list(self.chains.keys())[0] if self.chains else ""

    async def _send_tx(self, chain_name: str, func_name: str, *args) -> TxResult:
        """Send a transaction to the specified chain."""
        chain = self.chains.get(chain_name)
        if not chain or not self.relayer:
            logger.info(f"[DRY RUN] {chain_name}.{func_name}")
            return TxResult(success=False, error="Chain not configured")

        try:
            w3 = chain["w3"]
            contract = chain["contract"]
            nonce = w3.eth.get_transaction_count(self.relayer.address)

            func = getattr(contract.functions, func_name)(*args)

            # Estimate gas with safety margin
            try:
                gas_estimate = func.estimate_gas({"from": self.relayer.address})
                gas_limit = int(gas_estimate * 1.3)
            except Exception:
                # Fallback gas estimation
                gas_limit = 100000 + (len(args[0]) * 40000 if args and isinstance(args[0], list) else 100000)

            tx = func.build_transaction({
                "from": self.relayer.address,
                "nonce": nonce,
                "gas": gas_limit,
                "gasPrice": w3.eth.gas_price,
            })

            signed = self.relayer.sign_transaction(tx)
            tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
            receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)

            logger.info(f"[TX] {chain_name} | {func_name} | hash={tx_hash.hex()[:16]}...")

            return TxResult(
                success=receipt.status == 1,
                tx_hash=tx_hash.hex(),
                chain=chain_name,
                block_number=receipt.blockNumber,
                gas_used=receipt.gasUsed,
            )

        except Exception as e:
            logger.error(f"[TX ERROR] {chain_name}.{func_name}: {e}")
            return TxResult(success=False, error=str(e))

    async def record_generation(
        self,
        user_address: str,
        pet_type: int,
        style: int,
        content_hash: bytes,
    ) -> TxResult:
        """Record a single generation on-chain (immediate, no batching)."""
        chain = self._pick_chain()
        if not chain:
            return TxResult(success=False, error="No chains configured")

        return await self._send_tx(
            chain,
            "batchGenerate",
            [Web3.to_checksum_address(user_address)],
            [pet_type],
            [style],
            [content_hash],
        )

    async def add_to_batch(self, record: PendingRecord):
        """Add a generation record to the batch queue."""
        async with self._batch_lock:
            self.batch_queue.append(record)

    async def flush_batch(self) -> Optional[TxResult]:
        """Flush the batch queue and send as a single transaction."""
        async with self._batch_lock:
            if not self.batch_queue:
                return None

            batch = self.batch_queue.copy()
            self.batch_queue.clear()

        chain = self._pick_chain()
        if not chain:
            return TxResult(success=False, error="No chains configured")

        users = [Web3.to_checksum_address(r.user_address) for r in batch]
        pet_types = [r.pet_type for r in batch]
        styles = [r.style for r in batch]
        content_hashes = [r.content_hash for r in batch]

        result = await self._send_tx(
            chain, "batchGenerate", users, pet_types, styles, content_hashes
        )

        logger.info(f"[BATCH] Flushed {len(batch)} records → {chain} | success={result.success}")
        return result

    async def record_purchase(
        self, user_address: str, credits: int, amount_paid_wei: int
    ) -> TxResult:
        """Record a credit purchase on-chain."""
        chain = self._pick_chain()
        if not chain:
            return TxResult(success=False, error="No chains configured")

        return await self._send_tx(
            chain,
            "recordPurchase",
            Web3.to_checksum_address(user_address),
            credits,
            amount_paid_wei,
        )

    async def mint_content(
        self,
        to_address: str,
        pet_type: int,
        style: int,
        gen_type: str,
        content_hash: bytes,
        token_uri: str = "",
    ) -> TxResult:
        """Mint a PETContent NFT for generated content on BSC."""
        if not self.nft_contract or not self.nft_w3 or not self.relayer:
            logger.info(f"[DRY RUN] mint_content for {to_address}")
            return TxResult(success=False, error="PETContent contract not configured")

        try:
            w3 = self.nft_w3
            nonce = w3.eth.get_transaction_count(self.relayer.address)

            func = self.nft_contract.functions.mintContent(
                Web3.to_checksum_address(to_address),
                token_uri,
                pet_type,
                style,
                gen_type,
                content_hash,
            )

            try:
                gas_estimate = func.estimate_gas({"from": self.relayer.address})
                gas_limit = int(gas_estimate * 1.3)
            except Exception:
                gas_limit = 300000

            tx = func.build_transaction({
                "from": self.relayer.address,
                "nonce": nonce,
                "gas": gas_limit,
                "gasPrice": w3.eth.gas_price,
            })

            signed = self.relayer.sign_transaction(tx)
            tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
            receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)

            logger.info(f"[NFT MINT] hash={tx_hash.hex()[:16]}... to={to_address}")

            return TxResult(
                success=receipt.status == 1,
                tx_hash=tx_hash.hex(),
                chain="bnb",
                block_number=receipt.blockNumber,
                gas_used=receipt.gasUsed,
            )

        except Exception as e:
            logger.error(f"[NFT MINT ERROR] {e}")
            return TxResult(success=False, error=str(e))

    async def get_on_chain_stats(self) -> Dict:
        """Get aggregated stats from both chains."""
        total_users = 0
        total_generations = 0
        total_burned = 0

        for name, chain in self.chains.items():
            try:
                stats = chain["contract"].functions.getStats().call()
                total_users += stats[0]
                total_generations += stats[1]
                total_burned += stats[2]
            except Exception as e:
                logger.warning(f"Failed to get stats from {name}: {e}")

        return {
            "total_users": total_users,
            "total_generations": total_generations,
            "total_burned": total_burned,
        }

    async def batch_flush_loop(self, interval: int = 300):
        """
        Background loop that flushes the batch queue periodically.
        interval: seconds between flushes (default 5 minutes).
        """
        while True:
            await asyncio.sleep(interval)
            try:
                result = await self.flush_batch()
                if result and result.success:
                    logger.info(f"[BATCH LOOP] Flushed successfully: {result.tx_hash}")
            except Exception as e:
                logger.error(f"[BATCH LOOP] Error: {e}")


# Singleton
blockchain_service = BlockchainService()
