"""
PETAGEN Pet-Related SQLAlchemy Models
Pet, PetMemory, and PetInteraction models for the AI Pet core experience.
"""

from sqlalchemy import (
    Column, Integer, String, Text, Boolean, DateTime, ForeignKey, JSON, Date
)
from sqlalchemy.orm import relationship
from app.database import Base
from app.models import utcnow


class Pet(Base):
    __tablename__ = "pets"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String(50), nullable=False)
    species = Column(Integer, nullable=False)  # 0-7 matching existing pet types
    personality_type = Column(
        String(20), nullable=False, default="friendly"
    )  # friendly, playful, shy, brave, lazy
    level = Column(Integer, nullable=False, default=1)
    experience = Column(Integer, nullable=False, default=0)
    happiness = Column(Integer, nullable=False, default=70)
    energy = Column(Integer, nullable=False, default=100)
    hunger = Column(Integer, nullable=False, default=30)
    bond_level = Column(Integer, nullable=False, default=0)
    total_interactions = Column(Integer, nullable=False, default=0)
    avatar_url = Column(String(512), nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    soul_version = Column(Integer, nullable=False, default=1)
    personality_modifiers = Column(JSON, nullable=True, default=dict)  # Gradual personality drift
    last_dream_at = Column(DateTime, nullable=True)
    last_interaction_at = Column(DateTime, nullable=True)  # Tracks owner interaction for loneliness/instinct
    created_at = Column(DateTime, default=utcnow, nullable=False)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)

    # Relationships
    user = relationship("User", backref="pets")
    memories = relationship("PetMemory", back_populates="pet", lazy="selectin")
    interactions = relationship("PetInteraction", back_populates="pet", lazy="selectin")
    dream_journals = relationship("DreamJournal", back_populates="pet", lazy="selectin")
    notifications = relationship("PetNotification", back_populates="pet", lazy="selectin")
    autonomous_actions = relationship("PetAutonomousAction", back_populates="pet", lazy="selectin")
    soul_exports = relationship("SoulExport", back_populates="pet", lazy="selectin")


class PetMemory(Base):
    __tablename__ = "pet_memories"

    id = Column(Integer, primary_key=True, index=True)
    pet_id = Column(Integer, ForeignKey("pets.id"), nullable=False, index=True)
    memory_type = Column(
        String(20), nullable=False
    )  # interaction, milestone, emotion, generation
    content = Column(Text, nullable=False)
    emotion = Column(
        String(20), nullable=False, default="calm"
    )  # happy, sad, excited, calm, curious
    importance = Column(Integer, nullable=False, default=1)  # 1-5
    created_at = Column(DateTime, default=utcnow, nullable=False)

    # Relationships
    pet = relationship("Pet", back_populates="memories")


class PetInteraction(Base):
    __tablename__ = "pet_interactions"

    id = Column(Integer, primary_key=True, index=True)
    pet_id = Column(Integer, ForeignKey("pets.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    interaction_type = Column(
        String(20), nullable=False
    )  # feed, play, talk, pet, walk, train
    response_text = Column(Text, nullable=True)
    happiness_change = Column(Integer, nullable=False, default=0)
    energy_change = Column(Integer, nullable=False, default=0)
    hunger_change = Column(Integer, nullable=False, default=0)
    experience_gained = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, default=utcnow, nullable=False)

    # Relationships
    pet = relationship("Pet", back_populates="interactions")
    user = relationship("User", backref="pet_interactions")


class DreamJournal(Base):
    __tablename__ = "dream_journals"

    id = Column(Integer, primary_key=True, index=True)
    pet_id = Column(Integer, ForeignKey("pets.id"), nullable=False, index=True)
    dream_date = Column(Date, nullable=False)
    summary = Column(Text, nullable=False)  # The poetic dream narrative
    emotional_tone = Column(String(30), nullable=False)  # Overall emotional tone of the day
    personality_changes = Column(JSON, nullable=True)  # {"creativity": +0.1, "social": -0.05}
    stat_changes = Column(JSON, nullable=True)  # {"hunger": +5, "energy": +20, ...}
    significant_events = Column(JSON, nullable=True)  # ["first video", "level up", ...]
    created_at = Column(DateTime, default=utcnow, nullable=False)

    # Relationships
    pet = relationship("Pet", back_populates="dream_journals")


class PetNotification(Base):
    """
    Proactive pings from pet to owner.
    The pet decides when to reach out based on its internal state.
    """
    __tablename__ = "pet_notifications"

    id = Column(Integer, primary_key=True, index=True)
    pet_id = Column(Integer, ForeignKey("pets.id"), nullable=False, index=True)
    notification_type = Column(
        String(20), nullable=False
    )  # hunger, lonely, excited, creation, low_energy, milestone
    message = Column(Text, nullable=False)
    is_read = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, default=utcnow, nullable=False)

    # Relationships
    pet = relationship("Pet", back_populates="notifications")


class PetAutonomousAction(Base):
    """
    Record of actions the pet took on its own initiative.
    Tracks what urge drove the action, what happened, and any
    resources consumed (e.g., credits for video generation).
    """
    __tablename__ = "pet_autonomous_actions"

    id = Column(Integer, primary_key=True, index=True)
    pet_id = Column(Integer, ForeignKey("pets.id"), nullable=False, index=True)
    urge_type = Column(String(20), nullable=False)  # create_video, explore, socialize, rest, learn, play
    action_taken = Column(String(100), nullable=False)  # What the pet actually did
    prompt_used = Column(Text, nullable=True)  # For video generation actions
    generation_id = Column(Integer, nullable=True)  # FK to generations table if video was created
    credits_used = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, default=utcnow, nullable=False)

    # Relationships
    pet = relationship("Pet", back_populates="autonomous_actions")


class SoulExport(Base):
    """
    Record of each SOUL.md export.
    Links the pet's soul snapshot to IPFS and on-chain storage.
    """
    __tablename__ = "soul_exports"

    id = Column(Integer, primary_key=True, index=True)
    pet_id = Column(Integer, ForeignKey("pets.id"), nullable=False, index=True)
    ipfs_cid = Column(String(128), nullable=False)  # IPFS Content Identifier
    soul_hash = Column(String(64), nullable=False)  # SHA256 of the SOUL.md content
    tx_hash = Column(String(66), nullable=True)  # On-chain transaction hash
    chain = Column(String(10), nullable=False, default="base")
    version = Column(Integer, nullable=False, default=1)
    exported_at = Column(DateTime, default=utcnow, nullable=False)

    # Relationships
    pet = relationship("Pet", back_populates="soul_exports")
