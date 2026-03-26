"""
PETAGEN Pydantic Schemas
Request/Response models for all API endpoints.
"""

from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime


# ═══════════════════════════════════════════
#  Auth
# ═══════════════════════════════════════════

class NonceResponse(BaseModel):
    nonce: str
    message: str  # Pre-built SIWE message for frontend to sign

class VerifyRequest(BaseModel):
    message: str
    signature: str

class AuthResponse(BaseModel):
    token: str
    wallet_address: str
    credits: int

class UserResponse(BaseModel):
    wallet_address: str
    credits: int
    total_generations: int
    created_at: datetime


# ═══════════════════════════════════════════
#  Generation
# ═══════════════════════════════════════════

class GenerateRequest(BaseModel):
    pet_type: int = Field(ge=0, le=7, description="0=cat,1=dog,2=parrot,3=turtle,4=hamster,5=rabbit,6=fox,7=pomeranian")
    style: int = Field(ge=0, le=4, description="0=cinematic,1=anime,2=watercolor,3=3d,4=sketch")
    prompt: Optional[str] = Field(None, max_length=500)
    duration: int = Field(default=5, description="3, 5, or 10 seconds")

class GenerationStatusResponse(BaseModel):
    id: int
    status: str
    pet_type: int
    style: int
    prompt: Optional[str]
    duration: int
    credits_charged: int
    photo_url: Optional[str]
    video_url: Optional[str]
    content_hash: Optional[str]
    tx_hash: Optional[str]
    chain: Optional[str]
    error_message: Optional[str]
    created_at: datetime
    completed_at: Optional[datetime]

class GenerationListResponse(BaseModel):
    items: List[GenerationStatusResponse]
    total: int
    page: int
    page_size: int


# ═══════════════════════════════════════════
#  Gallery
# ═══════════════════════════════════════════

class GalleryItem(BaseModel):
    id: int
    pet_type: int
    style: int
    prompt: Optional[str]
    duration: int
    photo_url: str
    video_url: str
    wallet_address: str
    chain: Optional[str]
    content_hash: Optional[str]
    created_at: datetime

class GalleryResponse(BaseModel):
    items: List[GalleryItem]
    total: int
    page: int
    page_size: int


# ═══════════════════════════════════════════
#  Analytics
# ═══════════════════════════════════════════

class StatsResponse(BaseModel):
    total_users: int
    total_generations: int
    total_burned: str
    tx_today: int
    user_change: str     # e.g., "+4.2%"
    gen_change: str
    burned_change: str
    tx_change: str

class DailyCount(BaseModel):
    date: str
    count: int

class DailyStatsResponse(BaseModel):
    data: List[DailyCount]

class ChainStats(BaseModel):
    chain: str
    count: int
    percentage: float

class ChainStatsResponse(BaseModel):
    chains: List[ChainStats]

class ActivityItem(BaseModel):
    type: str           # "generate", "burn", "purchase", "register"
    icon: str
    text: str
    wallet: str
    chain: str
    time: str           # relative time, e.g., "3s ago"
    created_at: datetime

class ActivityResponse(BaseModel):
    items: List[ActivityItem]


# ═══════════════════════════════════════════
#  Credits
# ═══════════════════════════════════════════

class CreditBalanceResponse(BaseModel):
    credits: int

class PurchaseRequest(BaseModel):
    plan: str = Field(description="starter, creator, or pro")
    payment_tx_hash: Optional[str] = None

class PurchaseResponse(BaseModel):
    id: int
    credits: int
    amount_usd: float
    status: str
