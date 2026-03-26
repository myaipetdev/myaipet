"""
PETAGEN Social Schemas
Pydantic models for social/community feature endpoints.
"""

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


# --- Like ---

class LikeResponse(BaseModel):
    id: int
    user_id: int
    wallet_address: str
    created_at: datetime

    model_config = {"from_attributes": True}


class LikeToggleResponse(BaseModel):
    liked: bool
    likes_count: int


# --- Comment ---

class CommentCreate(BaseModel):
    content: str = Field(..., min_length=1, max_length=500)
    parent_id: Optional[int] = None


class CommentResponse(BaseModel):
    id: int
    user_id: int
    wallet_address: str
    content: str
    parent_id: Optional[int] = None
    replies_count: int = 0
    created_at: datetime

    model_config = {"from_attributes": True}


class CommentListResponse(BaseModel):
    items: list[CommentResponse]
    total: int
    page: int
    page_size: int


# --- Follow ---

class FollowResponse(BaseModel):
    id: int
    follower_wallet: str
    following_wallet: str
    created_at: datetime

    model_config = {"from_attributes": True}


class FollowToggleResponse(BaseModel):
    following: bool
    followers_count: int


class FollowListResponse(BaseModel):
    items: list[FollowResponse]
    total: int


# --- User Profile ---

class UserProfileCreate(BaseModel):
    display_name: Optional[str] = Field(None, max_length=50)
    bio: Optional[str] = Field(None, max_length=200)
    avatar_url: Optional[str] = Field(None, max_length=512)


class UserProfileResponse(BaseModel):
    user_id: int
    wallet_address: str
    display_name: Optional[str] = None
    bio: Optional[str] = None
    avatar_url: Optional[str] = None
    followers_count: int = 0
    following_count: int = 0
    generations_count: int = 0
    total_likes_received: int = 0

    model_config = {"from_attributes": True}


# --- Social Feed ---

class SocialFeedItem(BaseModel):
    generation_id: int
    pet_type: int
    style: int
    prompt: Optional[str] = None
    photo_url: Optional[str] = None
    video_url: Optional[str] = None
    wallet_address: str
    display_name: Optional[str] = None
    likes_count: int = 0
    comments_count: int = 0
    is_liked: bool = False
    created_at: datetime

    model_config = {"from_attributes": True}


class SocialFeedResponse(BaseModel):
    items: list[SocialFeedItem]
    total: int
    page: int
    page_size: int
