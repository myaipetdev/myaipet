"""
PETAGEN Storage Service
File upload, download, and serving for photos and videos.
"""

import os
import uuid
import httpx
from pathlib import Path

from app.config import settings


def ensure_dirs():
    """Create upload and video directories if they don't exist."""
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    os.makedirs(settings.VIDEO_DIR, exist_ok=True)


async def save_upload(file_data: bytes, filename: str, user_id: int) -> str:
    """
    Save uploaded photo to disk.
    Returns relative path from UPLOAD_DIR.
    """
    ensure_dirs()
    user_dir = os.path.join(settings.UPLOAD_DIR, str(user_id))
    os.makedirs(user_dir, exist_ok=True)

    ext = os.path.splitext(filename)[1] or ".jpg"
    safe_name = f"{uuid.uuid4().hex}{ext}"
    file_path = os.path.join(user_dir, safe_name)

    with open(file_path, "wb") as f:
        f.write(file_data)

    # Return relative path
    return os.path.relpath(file_path, settings.UPLOAD_DIR)


async def save_video_from_url(video_url: str, generation_id: int) -> str:
    """
    Download video from AI service URL and save locally.
    Returns relative path from VIDEO_DIR.
    """
    ensure_dirs()
    safe_name = f"{generation_id}_{uuid.uuid4().hex[:8]}.mp4"
    file_path = os.path.join(settings.VIDEO_DIR, safe_name)

    async with httpx.AsyncClient(timeout=120.0) as client:
        response = await client.get(video_url)
        response.raise_for_status()

        with open(file_path, "wb") as f:
            f.write(response.content)

    return safe_name


def get_photo_url(photo_path: str | None) -> str | None:
    """Convert relative photo path to a servable URL."""
    if not photo_path:
        return None
    return f"/static/uploads/{photo_path}"


def get_video_url(video_path: str | None) -> str | None:
    """Convert relative video path to a servable URL."""
    if not video_path:
        return None
    return f"/static/videos/{video_path}"


def get_full_photo_path(photo_path: str) -> str:
    """Get absolute filesystem path for a photo."""
    return os.path.join(settings.UPLOAD_DIR, photo_path)


def get_full_video_path(video_path: str) -> str:
    """Get absolute filesystem path for a video."""
    return os.path.join(settings.VIDEO_DIR, video_path)


async def get_video_bytes(video_path: str) -> bytes:
    """Read video file bytes for hashing."""
    full_path = get_full_video_path(video_path)
    with open(full_path, "rb") as f:
        return f.read()
