"""
PETAGEN Pet Pydantic Schemas
Request/Response models for Pet API endpoints.
"""

from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime, date


# -----------------------------------------------
#  Pet
# -----------------------------------------------

class PetCreate(BaseModel):
    name: str = Field(min_length=1, max_length=50)
    species: int = Field(ge=0, le=7, description="0=cat,1=dog,2=parrot,3=turtle,4=hamster,5=rabbit,6=fox,7=pomeranian")


class PetResponse(BaseModel):
    id: int
    user_id: int
    name: str
    species: int
    personality_type: str
    level: int
    experience: int
    happiness: int
    energy: int
    hunger: int
    bond_level: int
    total_interactions: int
    avatar_url: Optional[str]
    is_active: bool
    current_mood: str
    created_at: datetime
    updated_at: datetime


# -----------------------------------------------
#  Interaction
# -----------------------------------------------

class PetInteractRequest(BaseModel):
    interaction_type: str = Field(
        description="One of: feed, play, talk, pet, walk, train"
    )


class PetInteractResponse(BaseModel):
    response_text: str
    stat_changes: Dict[str, int]
    new_stats: Dict[str, int]
    memory_created: Optional[str] = None


# -----------------------------------------------
#  Memory
# -----------------------------------------------

class PetMemoryResponse(BaseModel):
    id: int
    memory_type: str
    content: str
    emotion: str
    importance: int
    created_at: datetime


# -----------------------------------------------
#  Status
# -----------------------------------------------

class PetStatusResponse(BaseModel):
    id: int
    name: str
    species: int
    personality_type: str
    level: int
    experience: int
    happiness: int
    energy: int
    hunger: int
    bond_level: int
    total_interactions: int
    current_mood: str
    recent_memories: List[PetMemoryResponse]


# -----------------------------------------------
#  Dream Journal
# -----------------------------------------------

class DreamJournalResponse(BaseModel):
    id: int
    pet_id: int
    dream_date: date
    summary: str
    emotional_tone: str
    personality_changes: Optional[Dict[str, Any]] = None
    stat_changes: Optional[Dict[str, Any]] = None
    significant_events: Optional[List[str]] = None
    created_at: datetime


class PersonalityEvolutionResponse(BaseModel):
    pet_id: int
    pet_name: str
    base_personality: str
    current_modifiers: Dict[str, float]
    evolution_history: List[Dict[str, Any]]  # List of {date, changes} entries
    dominant_traits: List[str]  # Top traits by magnitude
    trait_descriptions: Dict[str, str]  # Human-readable descriptions


# -----------------------------------------------
#  Instinct / Urge System
# -----------------------------------------------

class UrgeResponse(BaseModel):
    urge_type: str
    intensity: float
    description: str
    source_stats: Dict[str, int]


class InstinctsResponse(BaseModel):
    pet_id: int
    pet_name: str
    current_mood: str
    should_act: bool
    strongest_urge: Optional[str] = None
    urges: List[UrgeResponse]


# -----------------------------------------------
#  Notifications
# -----------------------------------------------

class PetNotificationResponse(BaseModel):
    id: int
    pet_id: int
    notification_type: str
    message: str
    is_read: bool
    created_at: datetime


class NotificationReadRequest(BaseModel):
    notification_ids: Optional[List[int]] = Field(
        None, description="Specific IDs to mark read. If null, marks all unread."
    )


# -----------------------------------------------
#  Autonomous Actions
# -----------------------------------------------

class AutonomousActionResponse(BaseModel):
    id: int
    pet_id: int
    urge_type: str
    action_taken: str
    prompt_used: Optional[str] = None
    generation_id: Optional[int] = None
    credits_used: int
    created_at: datetime
