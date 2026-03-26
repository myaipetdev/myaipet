"""
PETAGEN Soul Routes
API endpoints for SOUL.md generation, export, import, and verification.
"""

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from fastapi.responses import PlainTextResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.database import get_db
from app.models import User
from app.models_pet import Pet, SoulExport
from app.services.soul_engine import (
    generate_soul_md,
    generate_soul_json,
    compute_soul_hash,
    full_soul_export,
    import_soul_from_md,
    verify_soul_integrity,
)

router = APIRouter(prefix="/api/pets", tags=["soul"])


# -----------------------------------------------
#  Helpers
# -----------------------------------------------

async def _get_user_pet(pet_id: int, user: User, db: AsyncSession) -> Pet:
    """Fetch a pet belonging to the current user, or raise 404."""
    result = await db.execute(
        select(Pet).where(
            Pet.id == pet_id,
            Pet.user_id == user.id,
            Pet.is_active == True,  # noqa: E712
        )
    )
    pet = result.scalar_one_or_none()
    if pet is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Pet not found",
        )
    return pet


# -----------------------------------------------
#  GET /api/pets/{pet_id}/soul
#  Generate and return SOUL.md as text/markdown
# -----------------------------------------------

@router.get("/{pet_id}/soul", response_class=PlainTextResponse)
async def get_soul_md(
    pet_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Generate and return the pet's SOUL.md as a downloadable markdown file.
    This is the pet's complete identity in readable form.
    """
    pet = await _get_user_pet(pet_id, user, db)
    soul_md = await generate_soul_md(pet, db)

    return PlainTextResponse(
        content=soul_md,
        media_type="text/markdown",
        headers={
            "Content-Disposition": f'attachment; filename="{pet.name}_SOUL.md"',
        },
    )


# -----------------------------------------------
#  GET /api/pets/{pet_id}/soul/json
#  Return soul data as structured JSON
# -----------------------------------------------

@router.get("/{pet_id}/soul/json")
async def get_soul_json(
    pet_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Return the pet's soul data as structured JSON.
    Useful for programmatic access to soul information.
    """
    pet = await _get_user_pet(pet_id, user, db)
    soul_data = await generate_soul_json(pet, db)
    soul_data["soul_hash"] = compute_soul_hash(
        await generate_soul_md(pet, db)
    )
    return soul_data


# -----------------------------------------------
#  POST /api/pets/{pet_id}/soul/export
#  Export to IPFS + record on-chain
# -----------------------------------------------

@router.post("/{pet_id}/soul/export")
async def export_soul(
    pet_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Full soul export pipeline:
    1. Generate SOUL.md
    2. Upload to IPFS (Pinata)
    3. Record content hash on-chain
    4. Save export record in database

    Returns the IPFS CID, transaction hash, and soul hash.
    """
    pet = await _get_user_pet(pet_id, user, db)

    try:
        result = await full_soul_export(pet, db)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Soul export failed: {str(e)}",
        )

    return {
        "status": "exported",
        "pet_id": pet.id,
        "pet_name": pet.name,
        "ipfs_cid": result["ipfs_cid"],
        "ipfs_url": f"https://gateway.pinata.cloud/ipfs/{result['ipfs_cid']}",
        "soul_hash": result["soul_hash"],
        "tx_hash": result["tx_hash"],
        "chain": result["chain"],
        "version": result["version"],
        "exported_at": result["exported_at"],
    }


# -----------------------------------------------
#  POST /api/pets/soul/import
#  Upload a SOUL.md to create/resurrect a pet
# -----------------------------------------------

@router.post("/soul/import")
async def import_soul(
    file: UploadFile = File(..., description="SOUL.md file to import"),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Import a SOUL.md file to resurrect a pet.
    The pet is reborn with its personality, partial memories, and traits intact.
    Bond level transfers partially - trust must be rebuilt with the new owner.
    """
    # Validate file
    if not file.filename or not file.filename.endswith(".md"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File must be a .md (markdown) file",
        )

    content = await file.read()
    if len(content) > 1_000_000:  # 1MB limit
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="SOUL.md file too large (max 1MB)",
        )

    try:
        soul_md_content = content.decode("utf-8")
    except UnicodeDecodeError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File must be valid UTF-8 text",
        )

    # Validate it looks like a SOUL.md
    if "---" not in soul_md_content or "Soul" not in soul_md_content:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File does not appear to be a valid SOUL.md",
        )

    # Check active pet count
    from sqlalchemy import func as sqlfunc
    result = await db.execute(
        select(sqlfunc.count()).select_from(Pet).where(
            Pet.user_id == user.id,
            Pet.is_active == True,  # noqa: E712
        )
    )
    count = result.scalar()
    if count >= 3:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Maximum 3 active pets allowed. Release a pet first.",
        )

    try:
        pet = await import_soul_from_md(soul_md_content, user.id, db)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Soul import failed: {str(e)}",
        )

    return {
        "status": "resurrected",
        "pet_id": pet.id,
        "name": pet.name,
        "species": pet.species,
        "personality_type": pet.personality_type,
        "level": pet.level,
        "bond_level": pet.bond_level,
        "soul_hash": compute_soul_hash(soul_md_content),
        "message": (
            f"{pet.name} has been resurrected! They carry echoes of their past life. "
            f"Bond level starts at {pet.bond_level}/100 - trust must be rebuilt."
        ),
    }


# -----------------------------------------------
#  GET /api/pets/{pet_id}/soul/history
#  List all soul exports
# -----------------------------------------------

@router.get("/{pet_id}/soul/history")
async def get_soul_history(
    pet_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    List all soul export records for a pet.
    Each entry includes the IPFS CID, soul hash, and chain transaction.
    """
    pet = await _get_user_pet(pet_id, user, db)

    result = await db.execute(
        select(SoulExport)
        .where(SoulExport.pet_id == pet.id)
        .order_by(SoulExport.exported_at.desc())
    )
    exports = result.scalars().all()

    return {
        "pet_id": pet.id,
        "pet_name": pet.name,
        "total_exports": len(exports),
        "current_version": pet.soul_version or 1,
        "exports": [
            {
                "id": e.id,
                "version": e.version,
                "ipfs_cid": e.ipfs_cid,
                "ipfs_url": f"https://gateway.pinata.cloud/ipfs/{e.ipfs_cid}",
                "soul_hash": e.soul_hash,
                "tx_hash": e.tx_hash,
                "chain": e.chain,
                "exported_at": e.exported_at.isoformat() if e.exported_at else None,
            }
            for e in exports
        ],
    }


# -----------------------------------------------
#  GET /api/pets/{pet_id}/soul/verify
#  Verify soul against last on-chain hash
# -----------------------------------------------

@router.get("/{pet_id}/soul/verify")
async def verify_soul(
    pet_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Verify the pet's current soul against the last on-chain export.
    Returns whether the soul has changed since the last export.
    """
    pet = await _get_user_pet(pet_id, user, db)
    verification = await verify_soul_integrity(pet, db)

    return {
        "pet_id": pet.id,
        "pet_name": pet.name,
        **verification,
    }
