"""
PETAGEN Configuration
Loads settings from .env file using Pydantic BaseSettings.
"""

from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    # Database (PostgreSQL via asyncpg, or SQLite fallback)
    DATABASE_URL: str = "sqlite+aiosqlite:///./petagen.db"

    # Redis (Upstash)
    REDIS_URL: str = ""

    # JWT
    JWT_SECRET: str = "change-me-in-production-32-chars!"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 1440  # 24 hours

    # Blockchain - RPC
    RPC_BASE: str = "https://mainnet.base.org"
    RPC_BNB: str = "https://bsc-dataseed.binance.org/"

    # Blockchain - Contracts
    CONTRACT_BASE: str = ""
    CONTRACT_BNB: str = ""
    CONTRACT_PET_CONTENT: str = ""

    # Blockchain - Relayer (backend's own relayer, separate from simulator)
    BACKEND_RELAYER_KEY: str = ""

    # AI Video Generation
    FAL_API_KEY: str = ""
    DEFAULT_VIDEO_TIER: str = "premium"  # budget, standard, premium, ultra

    # Grok API (x.ai)
    GROK_API_KEY: str = ""
    GROK_API_BASE: str = "https://api.x.ai/v1"

    # File Storage
    UPLOAD_DIR: str = "./uploads"
    VIDEO_DIR: str = "./videos"
    MAX_UPLOAD_SIZE_MB: int = 10

    # X402 Payment Protocol
    X402_WALLET_ADDRESS: str = ""  # Wallet address to receive USDC payments
    X402_FACILITATOR_URL: str = "https://x402.org/facilitator"
    X402_INTERNAL_KEY: str = ""  # Secret key for internal pet-initiated bypass
    CDP_API_KEY: str = ""  # Coinbase Developer Platform API key

    # IPFS / Pinata (for SOUL.md exports)
    PINATA_JWT: str = ""

    # Dreaming
    DREAM_HOUR: int = 3  # UTC hour when pets dream (0-23)

    # Server
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    CORS_ORIGINS: str = "http://localhost:5173"

    @property
    def cors_origins_list(self) -> List[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",")]

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
