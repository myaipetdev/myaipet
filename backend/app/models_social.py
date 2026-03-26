"""
PETAGEN Social Models
Like, Comment, Follow, and UserProfile models for community features.
"""

from sqlalchemy import (
    Column, Integer, String, Text, Boolean, DateTime, ForeignKey, UniqueConstraint
)
from sqlalchemy.orm import relationship
from app.database import Base
from app.models import utcnow


class Like(Base):
    __tablename__ = "likes"
    __table_args__ = (
        UniqueConstraint("user_id", "generation_id", name="uq_user_generation_like"),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    generation_id = Column(Integer, ForeignKey("generations.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime, default=utcnow, nullable=False)

    user = relationship("User", lazy="selectin")
    generation = relationship("Generation", lazy="selectin")


class Comment(Base):
    __tablename__ = "comments"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    generation_id = Column(Integer, ForeignKey("generations.id", ondelete="CASCADE"), nullable=False)
    content = Column(Text, nullable=False)
    parent_id = Column(Integer, ForeignKey("comments.id", ondelete="CASCADE"), nullable=True)
    is_deleted = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=utcnow, nullable=False)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)

    user = relationship("User", lazy="selectin")
    generation = relationship("Generation", lazy="selectin")
    replies = relationship("Comment", back_populates="parent", lazy="selectin")
    parent = relationship("Comment", back_populates="replies", remote_side=[id], lazy="selectin")


class Follow(Base):
    __tablename__ = "follows"
    __table_args__ = (
        UniqueConstraint("follower_id", "following_id", name="uq_follower_following"),
    )

    id = Column(Integer, primary_key=True, index=True)
    follower_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    following_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime, default=utcnow, nullable=False)

    follower = relationship("User", foreign_keys=[follower_id], lazy="selectin")
    following = relationship("User", foreign_keys=[following_id], lazy="selectin")


class UserProfile(Base):
    __tablename__ = "user_profiles"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False)
    display_name = Column(String(50), nullable=True)
    bio = Column(Text, nullable=True)
    avatar_url = Column(String(512), nullable=True)
    created_at = Column(DateTime, default=utcnow, nullable=False)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)

    user = relationship("User", lazy="selectin")
