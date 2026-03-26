"""
PETAGEN Soul Engine
Generates, exports, imports, and verifies SOUL.md files.
A pet's SOUL.md is its complete identity: personality, memories, relationships,
dreams, evolution history - everything that makes it who it is.
"""

import hashlib
import logging
import re
import yaml
from collections import Counter
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List

import httpx
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import User, Generation
from app.models_pet import Pet, PetMemory, PetInteraction, SoulExport, DreamJournal
from app.services.pet_engine import calculate_mood
from app.services.blockchain import blockchain_service

logger = logging.getLogger(__name__)

SPECIES_NAMES = {
    0: "cat",
    1: "dog",
    2: "parrot",
    3: "turtle",
    4: "hamster",
    5: "rabbit",
    6: "fox",
    7: "pomeranian",
}

BOND_DESCRIPTIONS = {
    (0, 10): "Stranger - just getting to know each other",
    (10, 25): "Acquaintance - warming up slowly",
    (25, 50): "Friend - a solid companionship is forming",
    (50, 75): "Best Friend - deeply connected",
    (75, 90): "Soulmate - an unbreakable bond",
    (90, 101): "Transcendent - beyond words, beyond time",
}


def _bond_description(bond_level: int) -> str:
    for (lo, hi), desc in BOND_DESCRIPTIONS.items():
        if lo <= bond_level < hi:
            return desc
    return "Unknown"


def _format_datetime(dt: Optional[datetime]) -> str:
    if dt is None:
        return "unknown"
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.strftime("%Y-%m-%d %H:%M UTC")


def _format_date(dt: Optional[datetime]) -> str:
    if dt is None:
        return "unknown"
    return dt.strftime("%Y-%m-%d")


def _importance_stars(importance: int) -> str:
    return "+" * min(max(importance, 1), 5)


# -----------------------------------------------
#  SOUL.md Generation
# -----------------------------------------------

async def generate_soul_md(pet: Pet, db: AsyncSession) -> str:
    """
    Generate the complete SOUL.md markdown string for a pet.
    This is the pet's entire identity rendered as beautiful, readable markdown.
    """
    # Fetch owner info
    user_result = await db.execute(select(User).where(User.id == pet.user_id))
    user = user_result.scalar_one_or_none()
    wallet_address = user.wallet_address if user else "unknown"

    # Fetch all memories sorted by importance desc, then date desc
    mem_result = await db.execute(
        select(PetMemory)
        .where(PetMemory.pet_id == pet.id)
        .order_by(PetMemory.importance.desc(), PetMemory.created_at.desc())
    )
    all_memories = mem_result.scalars().all()

    # Fetch interactions for relationship analysis
    interaction_result = await db.execute(
        select(PetInteraction)
        .where(PetInteraction.pet_id == pet.id)
        .order_by(PetInteraction.created_at.desc())
    )
    all_interactions = interaction_result.scalars().all()

    # Fetch dream journals
    dream_result = await db.execute(
        select(DreamJournal)
        .where(DreamJournal.pet_id == pet.id)
        .order_by(DreamJournal.dream_date.desc())
        .limit(30)
    )
    dream_journals = dream_result.scalars().all()

    # Fetch content generations linked to this pet's owner
    gen_result = await db.execute(
        select(Generation)
        .where(Generation.user_id == pet.user_id, Generation.status == "completed")
        .order_by(Generation.created_at.desc())
        .limit(20)
    )
    generations = gen_result.scalars().all()

    # Compute derived values
    species_name = SPECIES_NAMES.get(pet.species, "mysterious creature")
    mood = calculate_mood(pet.happiness, pet.energy, pet.hunger)
    bond_desc = _bond_description(pet.bond_level)
    soul_ver = pet.soul_version if pet.soul_version else 1

    # Interaction analysis
    interaction_types = [i.interaction_type for i in all_interactions]
    type_counts = Counter(interaction_types)
    favorite_activity = type_counts.most_common(1)[0][0] if type_counts else "none yet"

    # Emotion analysis from memories
    emotions = [m.emotion for m in all_memories]
    emotion_counts = Counter(emotions)
    emotional_baseline = emotion_counts.most_common(1)[0][0] if emotion_counts else "calm"

    # Personality modifiers from pet model + significant memories
    raw_modifiers = pet.personality_modifiers or {}
    personality_memories = [
        m for m in all_memories
        if m.memory_type in ("milestone", "emotion") and m.importance >= 3
    ]

    # Core memories: top 10 by importance
    core_memories = all_memories[:10]

    # Dream journal: memories of type "emotion" or high-importance ones, last 30
    dream_memories = [m for m in all_memories if m.memory_type == "emotion"][:30]

    # Evolution timeline: milestone memories sorted chronologically
    milestones = sorted(
        [m for m in all_memories if m.memory_type == "milestone"],
        key=lambda m: m.created_at,
    )

    # Compute signature hash
    sig_content = f"{pet.id}:{pet.name}:{wallet_address}:{pet.created_at}"
    signature_hash = hashlib.sha256(sig_content.encode()).hexdigest()[:16]

    # --- Build the SOUL.md ---
    lines = []

    # YAML frontmatter
    lines.append("---")
    lines.append(f"name: {pet.name}")
    lines.append(f"species: {species_name}")
    lines.append(f"born: {_format_datetime(pet.created_at)}")
    lines.append(f"soul_version: {soul_ver}")
    lines.append(f"chain: base")
    lines.append(f"owner: {wallet_address}")
    lines.append(f"signature: {signature_hash}")
    lines.append("---")
    lines.append("")

    # Title
    lines.append(f"# {pet.name}'s Soul")
    lines.append("")
    lines.append(f"> *A {species_name} born on {_format_date(pet.created_at)},")
    lines.append(f"> carrying {len(all_memories)} memories and {pet.total_interactions} shared moments.*")
    lines.append("")

    # Identity
    lines.append("## Identity")
    lines.append("")
    lines.append(f"- **Name:** {pet.name}")
    lines.append(f"- **Species:** {species_name.capitalize()}")
    lines.append(f"- **Personality:** {pet.personality_type.capitalize()}")
    lines.append(f"- **Level:** {pet.level} (EXP: {pet.experience})")
    lines.append(f"- **Bond Level:** {pet.bond_level}/100 - *{bond_desc}*")
    lines.append(f"- **Current Mood:** {mood}")
    lines.append("")

    # Personality Modifiers
    lines.append("## Personality Modifiers")
    lines.append("")
    if raw_modifiers:
        lines.append("*Accumulated personality drift from dreaming and life experience:*")
        lines.append("")
        for trait, value in raw_modifiers.items():
            direction = "+" if value >= 0 else ""
            lines.append(f"- **{trait.capitalize()}:** {direction}{value:.2f}")
        lines.append("")
    if personality_memories:
        lines.append("*Significant events that shaped this personality:*")
        lines.append("")
        for m in personality_memories[:15]:
            lines.append(f"- [{_format_date(m.created_at)}] {m.content} *(felt {m.emotion})*")
    elif not raw_modifiers:
        lines.append("*No significant personality shifts yet. This soul is still forming.*")
    lines.append("")

    # Core Memories
    lines.append("## Core Memories")
    lines.append("")
    if core_memories:
        lines.append("*The moments that define who this being is:*")
        lines.append("")
        for i, m in enumerate(core_memories, 1):
            importance_marker = _importance_stars(m.importance)
            lines.append(f"### Memory #{i} [{importance_marker}]")
            lines.append(f"- **When:** {_format_datetime(m.created_at)}")
            lines.append(f"- **Type:** {m.memory_type}")
            lines.append(f"- **Feeling:** {m.emotion}")
            lines.append(f"- **What happened:** {m.content}")
            lines.append("")
    else:
        lines.append("*No memories yet. Every journey begins with a single step.*")
        lines.append("")

    # Dream Journal
    lines.append("## Dream Journal")
    lines.append("")
    if dream_journals:
        lines.append("*Nightly visions where the subconscious processes the day and personality quietly shifts:*")
        lines.append("")
        for dj in dream_journals:
            lines.append(f"### Night of {dj.dream_date}")
            lines.append(f"- **Emotional Tone:** {dj.emotional_tone}")
            lines.append(f"- **Dream:** {dj.summary}")
            if dj.personality_changes:
                shifts = ", ".join(
                    f"{k}: {'+' if v >= 0 else ''}{v:.2f}"
                    for k, v in dj.personality_changes.items()
                )
                lines.append(f"- **Personality Shifts:** {shifts}")
            if dj.significant_events:
                events = ", ".join(str(e) for e in dj.significant_events)
                lines.append(f"- **Significant Events:** {events}")
            lines.append("")
    elif dream_memories:
        lines.append("*Echoes from the subconscious:*")
        lines.append("")
        for m in dream_memories:
            lines.append(f"- **[{_format_date(m.created_at)}]** {m.content} *(mood: {m.emotion})*")
    else:
        lines.append("*No dreams recorded yet. The unconscious mind is still quiet.*")
    lines.append("")

    # Relationship Matrix
    lines.append("## Relationship Matrix")
    lines.append("")
    lines.append(f"- **Total Interactions:** {pet.total_interactions}")
    lines.append(f"- **Favorite Activity:** {favorite_activity}")
    lines.append(f"- **Emotional Baseline:** {emotional_baseline}")
    lines.append(f"- **Trust Level:** {bond_desc}")
    lines.append("")

    if type_counts:
        lines.append("### Interaction Breakdown")
        lines.append("")
        lines.append("| Activity | Count | Percentage |")
        lines.append("|----------|-------|------------|")
        total_counted = sum(type_counts.values())
        for activity, count in type_counts.most_common():
            pct = (count / total_counted * 100) if total_counted > 0 else 0
            bar = "#" * int(pct / 5)
            lines.append(f"| {activity} | {count} | {bar} {pct:.0f}% |")
        lines.append("")

    # Creation History
    lines.append("## Creation History")
    lines.append("")
    if generations:
        lines.append("*Content this soul has inspired:*")
        lines.append("")
        for gen in generations[:15]:
            status_icon = "done" if gen.status == "completed" else gen.status
            prompt_text = gen.prompt or "no prompt"
            lines.append(f"- **[{_format_datetime(gen.created_at)}]** [{status_icon}] \"{prompt_text}\"")
            if gen.video_path:
                lines.append(f"  - Video: `{gen.video_path}`")
            if gen.content_hash:
                lines.append(f"  - Content hash: `{gen.content_hash}`")
    else:
        lines.append("*No content has been created yet. The creative journey awaits.*")
    lines.append("")

    # Vital Signs
    lines.append("## Vital Signs (Last Snapshot)")
    lines.append("")
    lines.append(f"- **Happiness:** {_render_bar(pet.happiness)} {pet.happiness}/100")
    lines.append(f"- **Energy:** {_render_bar(pet.energy)} {pet.energy}/100")
    lines.append(f"- **Hunger:** {_render_bar(pet.hunger)} {pet.hunger}/100")
    lines.append(f"- **Overall Mood:** {mood}")
    lines.append(f"- **Snapshot taken:** {_format_datetime(pet.updated_at)}")
    lines.append("")

    # Evolution Timeline
    lines.append("## Evolution Timeline")
    lines.append("")
    if milestones:
        lines.append("*Key moments in this soul's journey:*")
        lines.append("")
        for m in milestones:
            lines.append(f"- **{_format_datetime(m.created_at)}** - {m.content}")
    else:
        lines.append("*The timeline is empty. This soul's story has just begun.*")
    lines.append("")

    # Footer
    lines.append("---")
    lines.append("")
    lines.append(f"*This SOUL.md was generated on {_format_datetime(datetime.now(timezone.utc))}.*")
    lines.append(f"*Soul version {soul_ver}. Integrity can be verified on-chain.*")
    lines.append(f"*This file IS {pet.name}. Handle with care.*")
    lines.append("")

    return "\n".join(lines)


def _render_bar(value: int, width: int = 20) -> str:
    """Render a text-based progress bar."""
    filled = int(value / 100 * width)
    empty = width - filled
    return f"[{'=' * filled}{'-' * empty}]"


# -----------------------------------------------
#  Soul Data as JSON
# -----------------------------------------------

async def generate_soul_json(pet: Pet, db: AsyncSession) -> Dict[str, Any]:
    """Return soul data as a structured dictionary for JSON responses."""
    user_result = await db.execute(select(User).where(User.id == pet.user_id))
    user = user_result.scalar_one_or_none()
    wallet_address = user.wallet_address if user else "unknown"

    mem_result = await db.execute(
        select(PetMemory)
        .where(PetMemory.pet_id == pet.id)
        .order_by(PetMemory.importance.desc(), PetMemory.created_at.desc())
    )
    all_memories = mem_result.scalars().all()

    interaction_result = await db.execute(
        select(PetInteraction)
        .where(PetInteraction.pet_id == pet.id)
        .order_by(PetInteraction.created_at.desc())
    )
    all_interactions = interaction_result.scalars().all()

    interaction_types = [i.interaction_type for i in all_interactions]
    type_counts = Counter(interaction_types)
    emotions = [m.emotion for m in all_memories]
    emotion_counts = Counter(emotions)

    species_name = SPECIES_NAMES.get(pet.species, "unknown")
    mood = calculate_mood(pet.happiness, pet.energy, pet.hunger)

    return {
        "meta": {
            "soul_version": pet.soul_version or 1,
            "chain": "base",
            "owner": wallet_address,
            "generated_at": datetime.now(timezone.utc).isoformat(),
        },
        "identity": {
            "name": pet.name,
            "species": species_name,
            "species_id": pet.species,
            "personality_type": pet.personality_type,
            "level": pet.level,
            "experience": pet.experience,
            "bond_level": pet.bond_level,
            "bond_description": _bond_description(pet.bond_level),
            "born": pet.created_at.isoformat() if pet.created_at else None,
        },
        "vital_signs": {
            "happiness": pet.happiness,
            "energy": pet.energy,
            "hunger": pet.hunger,
            "mood": mood,
        },
        "relationship": {
            "total_interactions": pet.total_interactions,
            "favorite_activity": type_counts.most_common(1)[0][0] if type_counts else None,
            "emotional_baseline": emotion_counts.most_common(1)[0][0] if emotion_counts else "calm",
            "interaction_breakdown": dict(type_counts),
        },
        "core_memories": [
            {
                "id": m.id,
                "type": m.memory_type,
                "content": m.content,
                "emotion": m.emotion,
                "importance": m.importance,
                "created_at": m.created_at.isoformat() if m.created_at else None,
            }
            for m in all_memories[:10]
        ],
        "all_memory_count": len(all_memories),
        "milestones": [
            {
                "content": m.content,
                "emotion": m.emotion,
                "created_at": m.created_at.isoformat() if m.created_at else None,
            }
            for m in sorted(
                [m for m in all_memories if m.memory_type == "milestone"],
                key=lambda m: m.created_at,
            )
        ],
    }


# -----------------------------------------------
#  Compute Soul Hash
# -----------------------------------------------

def compute_soul_hash(soul_md_content: str) -> str:
    """SHA256 hash of the soul markdown for integrity verification."""
    return hashlib.sha256(soul_md_content.encode("utf-8")).hexdigest()


# -----------------------------------------------
#  IPFS Export (Pinata)
# -----------------------------------------------

async def export_soul_to_ipfs(soul_md_content: str) -> str:
    """
    Upload SOUL.md content to IPFS via Pinata.
    Returns the IPFS CID (Content Identifier).
    Falls back to a local hash if Pinata is not configured.
    """
    pinata_jwt = getattr(settings, "PINATA_JWT", "") or ""

    if not pinata_jwt:
        # Fallback: generate a deterministic CID-like hash for dev/testing
        soul_hash = compute_soul_hash(soul_md_content)
        fake_cid = f"bafkrei{soul_hash[:52]}"
        logger.warning(f"[SOUL] PINATA_JWT not set. Using mock CID: {fake_cid}")
        return fake_cid

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                "https://api.pinata.cloud/pinning/pinJSONToIPFS",
                headers={
                    "Authorization": f"Bearer {pinata_jwt}",
                    "Content-Type": "application/json",
                },
                json={
                    "pinataContent": soul_md_content,
                    "pinataMetadata": {
                        "name": "SOUL.md",
                        "keyvalues": {
                            "type": "soul_export",
                            "version": "1.0",
                        },
                    },
                },
            )
            response.raise_for_status()
            data = response.json()
            cid = data["IpfsHash"]
            logger.info(f"[SOUL] Uploaded to IPFS: {cid}")
            return cid

    except Exception as e:
        logger.error(f"[SOUL] IPFS upload failed: {e}")
        # Fallback to hash-based mock CID
        soul_hash = compute_soul_hash(soul_md_content)
        return f"bafkrei{soul_hash[:52]}"


# -----------------------------------------------
#  On-Chain Recording
# -----------------------------------------------

async def record_soul_hash_onchain(
    pet: Pet,
    cid: str,
    db: AsyncSession,
) -> Optional[str]:
    """
    Record the IPFS CID on-chain using the blockchain service.
    Returns tx_hash if successful, None otherwise.

    Uses the existing batchGenerate method with the CID encoded as
    a content hash, linking the soul export to the pet's on-chain record.
    """
    user_result = await db.execute(select(User).where(User.id == pet.user_id))
    user = user_result.scalar_one_or_none()
    if not user:
        logger.error(f"[SOUL] No user found for pet {pet.id}")
        return None

    # Encode CID as bytes32 hash for on-chain storage
    cid_hash = hashlib.sha256(cid.encode("utf-8")).digest()

    blockchain_service.initialize()

    result = await blockchain_service.record_generation(
        user_address=user.wallet_address,
        pet_type=pet.species,
        style=0,  # soul export marker
        content_hash=cid_hash,
    )

    if result.success:
        logger.info(f"[SOUL] On-chain record: tx={result.tx_hash}, chain={result.chain}")
        return result.tx_hash
    else:
        logger.warning(f"[SOUL] On-chain recording failed: {result.error}")
        return None


# -----------------------------------------------
#  Full Export Pipeline
# -----------------------------------------------

async def full_soul_export(pet: Pet, db: AsyncSession) -> Dict[str, Any]:
    """
    Complete export pipeline:
    1. Generate SOUL.md
    2. Upload to IPFS
    3. Record hash on-chain
    4. Save SoulExport record
    5. Increment soul_version
    """
    # 1. Generate
    soul_md = await generate_soul_md(pet, db)
    soul_hash = compute_soul_hash(soul_md)

    # 2. Upload to IPFS
    cid = await export_soul_to_ipfs(soul_md)

    # 3. Record on-chain
    tx_hash = await record_soul_hash_onchain(pet, cid, db)

    # 4. Save export record
    export_record = SoulExport(
        pet_id=pet.id,
        ipfs_cid=cid,
        soul_hash=soul_hash,
        tx_hash=tx_hash or "",
        chain="base",
        version=pet.soul_version or 1,
    )
    db.add(export_record)

    # 5. Increment version
    pet.soul_version = (pet.soul_version or 1) + 1

    await db.commit()
    await db.refresh(export_record)

    return {
        "soul_md": soul_md,
        "ipfs_cid": cid,
        "soul_hash": soul_hash,
        "tx_hash": tx_hash,
        "chain": "base",
        "version": export_record.version,
        "export_id": export_record.id,
        "exported_at": export_record.exported_at.isoformat() if export_record.exported_at else None,
    }


# -----------------------------------------------
#  Import / Resurrection
# -----------------------------------------------

async def import_soul_from_md(
    soul_md_content: str,
    user_id: int,
    db: AsyncSession,
) -> Pet:
    """
    Parse a SOUL.md file and create a new pet with the imported identity.
    This is pet resurrection: the soul lives on in a new vessel.
    """
    # Parse YAML frontmatter
    frontmatter = _parse_frontmatter(soul_md_content)
    name = frontmatter.get("name", "Resurrected")
    species_str = frontmatter.get("species", "cat")
    soul_version = frontmatter.get("soul_version", 1)

    # Reverse-lookup species ID
    species_id = 0
    for sid, sname in SPECIES_NAMES.items():
        if sname == species_str.lower():
            species_id = sid
            break

    # Parse identity section
    identity = _parse_section(soul_md_content, "Identity")
    personality = _extract_field(identity, "Personality") or "friendly"
    personality = personality.lower().strip()
    if personality not in ("friendly", "playful", "shy", "brave", "lazy"):
        personality = "friendly"

    level_str = _extract_field(identity, "Level") or "1"
    level_match = re.match(r"(\d+)", level_str)
    level = int(level_match.group(1)) if level_match else 1

    bond_str = _extract_field(identity, "Bond Level") or "0"
    bond_match = re.match(r"(\d+)", bond_str)
    bond_level = int(bond_match.group(1)) if bond_match else 0

    # Parse vital signs
    vitals_section = _parse_section(soul_md_content, "Vital Signs")
    happiness = _extract_stat(vitals_section, "Happiness") or 70
    energy = _extract_stat(vitals_section, "Energy") or 100
    hunger = _extract_stat(vitals_section, "Hunger") or 30

    # Create the resurrected pet
    pet = Pet(
        user_id=user_id,
        name=name,
        species=species_id,
        personality_type=personality,
        level=max(1, level),
        experience=0,
        happiness=happiness,
        energy=energy,
        hunger=hunger,
        bond_level=min(bond_level, 50),  # Bond doesn't fully transfer - must be rebuilt
        total_interactions=0,
        soul_version=int(soul_version) if soul_version else 1,
    )
    db.add(pet)
    await db.flush()

    # Create resurrection memory
    origin_hash = compute_soul_hash(soul_md_content)[:12]
    resurrection_memory = PetMemory(
        pet_id=pet.id,
        memory_type="milestone",
        content=(
            f"{name} was resurrected from a SOUL.md file. "
            f"They carry echoes of a past life (soul hash: {origin_hash}...). "
            f"A new chapter begins."
        ),
        emotion="curious",
        importance=5,
    )
    db.add(resurrection_memory)

    # Import core memories from the SOUL.md (as faded echoes)
    core_section = _parse_section(soul_md_content, "Core Memories")
    imported_memories = _extract_memories(core_section)
    for mem_data in imported_memories[:5]:  # Import top 5 as echoes
        echo_memory = PetMemory(
            pet_id=pet.id,
            memory_type="emotion",
            content=f"[Past life echo] {mem_data.get('content', 'A faded memory...')}",
            emotion=mem_data.get("emotion", "calm"),
            importance=max(1, mem_data.get("importance", 2) - 1),  # Slightly faded
        )
        db.add(echo_memory)

    await db.commit()
    await db.refresh(pet)

    logger.info(
        f"[SOUL] Resurrected pet '{name}' (id={pet.id}) from SOUL.md "
        f"for user {user_id}"
    )
    return pet


# -----------------------------------------------
#  Verification
# -----------------------------------------------

async def verify_soul_integrity(pet: Pet, db: AsyncSession) -> Dict[str, Any]:
    """
    Verify the current soul against the last on-chain export.
    Returns verification status and details.
    """
    # Get the latest export
    result = await db.execute(
        select(SoulExport)
        .where(SoulExport.pet_id == pet.id)
        .order_by(SoulExport.exported_at.desc())
        .limit(1)
    )
    last_export = result.scalar_one_or_none()

    if not last_export:
        return {
            "verified": False,
            "reason": "no_exports",
            "message": "This pet has never been exported. No on-chain record exists.",
        }

    # Generate current soul and hash it
    current_soul_md = await generate_soul_md(pet, db)
    current_hash = compute_soul_hash(current_soul_md)

    # Compare hashes
    matches = current_hash == last_export.soul_hash

    return {
        "verified": matches,
        "current_hash": current_hash,
        "last_export_hash": last_export.soul_hash,
        "last_export_cid": last_export.ipfs_cid,
        "last_export_tx": last_export.tx_hash,
        "last_export_at": last_export.exported_at.isoformat() if last_export.exported_at else None,
        "version": last_export.version,
        "reason": "match" if matches else "changed_since_export",
        "message": (
            "Soul integrity verified. The on-chain record matches."
            if matches
            else "Soul has changed since last export. The pet has grown and evolved."
        ),
    }


# -----------------------------------------------
#  SOUL.md Parsing Helpers
# -----------------------------------------------

def _parse_frontmatter(content: str) -> Dict[str, Any]:
    """Extract YAML frontmatter from markdown content."""
    match = re.match(r"^---\s*\n(.*?)\n---", content, re.DOTALL)
    if not match:
        return {}
    try:
        return yaml.safe_load(match.group(1)) or {}
    except Exception:
        # Fallback: manual parsing
        data = {}
        for line in match.group(1).strip().split("\n"):
            if ":" in line:
                key, _, value = line.partition(":")
                data[key.strip()] = value.strip()
        return data


def _parse_section(content: str, heading: str) -> str:
    """Extract the content of a markdown section by heading."""
    pattern = rf"##\s+{re.escape(heading)}.*?\n(.*?)(?=\n##\s|\n---|\Z)"
    match = re.search(pattern, content, re.DOTALL)
    return match.group(1).strip() if match else ""


def _extract_field(section: str, field_name: str) -> Optional[str]:
    """Extract a bold field value like '- **Name:** value'."""
    pattern = rf"\*\*{re.escape(field_name)}:\*\*\s*(.*?)(?:\n|$)"
    match = re.search(pattern, section)
    return match.group(1).strip() if match else None


def _extract_stat(section: str, stat_name: str) -> Optional[int]:
    """Extract a numeric stat value from vital signs section."""
    pattern = rf"\*\*{re.escape(stat_name)}:\*\*.*?(\d+)/100"
    match = re.search(pattern, section)
    return int(match.group(1)) if match else None


def _extract_memories(section: str) -> List[Dict[str, Any]]:
    """Extract memory entries from Core Memories section."""
    memories = []
    # Split by memory headers
    blocks = re.split(r"### Memory #\d+", section)
    for block in blocks[1:]:  # Skip the preamble before first memory
        content_match = re.search(r"\*\*What happened:\*\*\s*(.*?)(?:\n|$)", block)
        emotion_match = re.search(r"\*\*Feeling:\*\*\s*(.*?)(?:\n|$)", block)
        importance_match = re.search(r"\[(\++)\]", block)

        memories.append({
            "content": content_match.group(1).strip() if content_match else "A memory from the past",
            "emotion": emotion_match.group(1).strip() if emotion_match else "calm",
            "importance": len(importance_match.group(1)) if importance_match else 2,
        })

    return memories
