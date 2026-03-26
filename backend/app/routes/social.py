"""
PETAGEN Social Routes
Community features: likes, comments, follows, social feed, and user profiles.
"""

from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func, and_, case
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.auth import get_current_user, get_optional_user
from app.models import User, Generation
from app.models_social import Like, Comment, Follow, UserProfile
from app.schemas_social import (
    LikeResponse,
    LikeToggleResponse,
    CommentCreate,
    CommentResponse,
    CommentListResponse,
    FollowResponse,
    FollowToggleResponse,
    FollowListResponse,
    UserProfileCreate,
    UserProfileResponse,
    SocialFeedItem,
    SocialFeedResponse,
)
from app.services.storage import get_photo_url, get_video_url

router = APIRouter(prefix="/api/social", tags=["social"])


# ============================================================
# LIKES
# ============================================================

@router.post("/like/{generation_id}", response_model=LikeToggleResponse)
async def toggle_like(
    generation_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Toggle like on a generation. Like if not liked, unlike if liked."""
    # Verify generation exists
    gen = await db.get(Generation, generation_id)
    if not gen:
        raise HTTPException(status_code=404, detail="Generation not found")

    # Check existing like
    result = await db.execute(
        select(Like).where(
            Like.user_id == user.id,
            Like.generation_id == generation_id,
        )
    )
    existing = result.scalar_one_or_none()

    if existing:
        await db.delete(existing)
        await db.commit()
        liked = False
    else:
        new_like = Like(user_id=user.id, generation_id=generation_id)
        db.add(new_like)
        await db.commit()
        liked = True

    # Get updated count
    count_result = await db.execute(
        select(func.count()).select_from(Like).where(Like.generation_id == generation_id)
    )
    likes_count = count_result.scalar() or 0

    return LikeToggleResponse(liked=liked, likes_count=likes_count)


@router.get("/likes/{generation_id}", response_model=list[LikeResponse])
async def get_likes(
    generation_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Get all likes for a generation."""
    result = await db.execute(
        select(Like, User.wallet_address)
        .join(User, Like.user_id == User.id)
        .where(Like.generation_id == generation_id)
        .order_by(Like.created_at.desc())
    )
    rows = result.all()

    return [
        LikeResponse(
            id=like.id,
            user_id=like.user_id,
            wallet_address=wallet,
            created_at=like.created_at,
        )
        for like, wallet in rows
    ]


# ============================================================
# COMMENTS
# ============================================================

@router.post("/comment/{generation_id}", response_model=CommentResponse)
async def add_comment(
    generation_id: int,
    body: CommentCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Add a comment to a generation."""
    # Verify generation exists
    gen = await db.get(Generation, generation_id)
    if not gen:
        raise HTTPException(status_code=404, detail="Generation not found")

    # Verify parent comment exists if provided
    if body.parent_id is not None:
        parent = await db.get(Comment, body.parent_id)
        if not parent or parent.generation_id != generation_id:
            raise HTTPException(status_code=400, detail="Invalid parent comment")

    comment = Comment(
        user_id=user.id,
        generation_id=generation_id,
        content=body.content,
        parent_id=body.parent_id,
    )
    db.add(comment)
    await db.commit()
    await db.refresh(comment)

    return CommentResponse(
        id=comment.id,
        user_id=comment.user_id,
        wallet_address=user.wallet_address,
        content=comment.content,
        parent_id=comment.parent_id,
        replies_count=0,
        created_at=comment.created_at,
    )


@router.get("/comments/{generation_id}", response_model=CommentListResponse)
async def get_comments(
    generation_id: int,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    """Get paginated comments for a generation (top-level with reply counts)."""
    # Count top-level comments
    count_result = await db.execute(
        select(func.count())
        .select_from(Comment)
        .where(
            Comment.generation_id == generation_id,
            Comment.parent_id.is_(None),
            Comment.is_deleted == False,  # noqa: E712
        )
    )
    total = count_result.scalar() or 0

    # Subquery for reply counts
    replies_count_sub = (
        select(func.count())
        .where(
            Comment.parent_id == Comment.id,
            Comment.is_deleted == False,  # noqa: E712
        )
        .correlate(Comment)
        .scalar_subquery()
    )

    # Fetch top-level comments
    offset = (page - 1) * page_size
    result = await db.execute(
        select(Comment, User.wallet_address)
        .join(User, Comment.user_id == User.id)
        .where(
            Comment.generation_id == generation_id,
            Comment.parent_id.is_(None),
            Comment.is_deleted == False,  # noqa: E712
        )
        .order_by(Comment.created_at.desc())
        .offset(offset)
        .limit(page_size)
    )
    rows = result.all()

    items = []
    for comment, wallet in rows:
        # Count replies for this comment
        rc_result = await db.execute(
            select(func.count())
            .select_from(Comment)
            .where(
                Comment.parent_id == comment.id,
                Comment.is_deleted == False,  # noqa: E712
            )
        )
        rc = rc_result.scalar() or 0

        items.append(CommentResponse(
            id=comment.id,
            user_id=comment.user_id,
            wallet_address=wallet,
            content=comment.content,
            parent_id=comment.parent_id,
            replies_count=rc,
            created_at=comment.created_at,
        ))

    return CommentListResponse(items=items, total=total, page=page, page_size=page_size)


@router.delete("/comment/{comment_id}", status_code=status.HTTP_200_OK)
async def delete_comment(
    comment_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Soft delete own comment."""
    comment = await db.get(Comment, comment_id)
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")
    if comment.user_id != user.id:
        raise HTTPException(status_code=403, detail="Cannot delete another user's comment")

    comment.is_deleted = True
    comment.content = "[deleted]"
    await db.commit()

    return {"detail": "Comment deleted"}


# ============================================================
# FOLLOWS
# ============================================================

@router.post("/follow/{user_id}", response_model=FollowToggleResponse)
async def toggle_follow(
    user_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Toggle follow on a user. Cannot follow self."""
    if user.id == user_id:
        raise HTTPException(status_code=400, detail="Cannot follow yourself")

    # Verify target user exists
    target = await db.get(User, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    # Check existing follow
    result = await db.execute(
        select(Follow).where(
            Follow.follower_id == user.id,
            Follow.following_id == user_id,
        )
    )
    existing = result.scalar_one_or_none()

    if existing:
        await db.delete(existing)
        await db.commit()
        following = False
    else:
        new_follow = Follow(follower_id=user.id, following_id=user_id)
        db.add(new_follow)
        await db.commit()
        following = True

    # Get updated follower count
    count_result = await db.execute(
        select(func.count()).select_from(Follow).where(Follow.following_id == user_id)
    )
    followers_count = count_result.scalar() or 0

    return FollowToggleResponse(following=following, followers_count=followers_count)


@router.get("/followers/{user_id}", response_model=FollowListResponse)
async def get_followers(
    user_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Get followers list for a user."""
    result = await db.execute(
        select(Follow, User.wallet_address)
        .join(User, Follow.follower_id == User.id)
        .where(Follow.following_id == user_id)
        .order_by(Follow.created_at.desc())
    )
    rows = result.all()

    # Get target user wallet
    target = await db.get(User, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    items = [
        FollowResponse(
            id=follow.id,
            follower_wallet=wallet,
            following_wallet=target.wallet_address,
            created_at=follow.created_at,
        )
        for follow, wallet in rows
    ]

    return FollowListResponse(items=items, total=len(items))


@router.get("/following/{user_id}", response_model=FollowListResponse)
async def get_following(
    user_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Get list of users that a user is following."""
    result = await db.execute(
        select(Follow, User.wallet_address)
        .join(User, Follow.following_id == User.id)
        .where(Follow.follower_id == user_id)
        .order_by(Follow.created_at.desc())
    )
    rows = result.all()

    # Get source user wallet
    source = await db.get(User, user_id)
    if not source:
        raise HTTPException(status_code=404, detail="User not found")

    items = [
        FollowResponse(
            id=follow.id,
            follower_wallet=source.wallet_address,
            following_wallet=wallet,
            created_at=follow.created_at,
        )
        for follow, wallet in rows
    ]

    return FollowListResponse(items=items, total=len(items))


# ============================================================
# SOCIAL FEED
# ============================================================

@router.get("/feed", response_model=SocialFeedResponse)
async def social_feed(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    pet_type: Optional[int] = Query(None, ge=0, le=7),
    style: Optional[int] = Query(None, ge=0, le=4),
    sort: str = Query("recent", pattern="^(recent|trending|most_liked)$"),
    user: Optional[User] = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Social feed: paginated gallery with like/comment counts and is_liked status.
    Supports filters by pet_type, style and sort modes: recent, trending, most_liked.
    Trending = most likes in the last 24 hours.
    """
    # Subquery: likes count per generation
    likes_sub = (
        select(
            Like.generation_id,
            func.count(Like.id).label("likes_count"),
        )
        .group_by(Like.generation_id)
        .subquery()
    )

    # Subquery: comments count per generation
    comments_sub = (
        select(
            Comment.generation_id,
            func.count(Comment.id).label("comments_count"),
        )
        .where(Comment.is_deleted == False)  # noqa: E712
        .group_by(Comment.generation_id)
        .subquery()
    )

    # Subquery: user profile display_name
    profile_sub = (
        select(
            UserProfile.user_id,
            UserProfile.display_name,
        )
        .subquery()
    )

    # Subquery: is_liked for current user
    if user:
        liked_sub = (
            select(Like.generation_id)
            .where(Like.user_id == user.id)
            .subquery()
        )
    else:
        liked_sub = None

    # Base query
    query = (
        select(
            Generation.id.label("generation_id"),
            Generation.pet_type,
            Generation.style,
            Generation.prompt,
            Generation.photo_path,
            Generation.video_path,
            User.wallet_address,
            profile_sub.c.display_name,
            func.coalesce(likes_sub.c.likes_count, 0).label("likes_count"),
            func.coalesce(comments_sub.c.comments_count, 0).label("comments_count"),
            Generation.created_at,
        )
        .join(User, Generation.user_id == User.id)
        .outerjoin(likes_sub, Generation.id == likes_sub.c.generation_id)
        .outerjoin(comments_sub, Generation.id == comments_sub.c.generation_id)
        .outerjoin(profile_sub, User.id == profile_sub.c.user_id)
        .where(
            Generation.status == "completed",
            Generation.video_path.isnot(None),
        )
    )

    # Count query
    count_query = (
        select(func.count())
        .select_from(Generation)
        .where(
            Generation.status == "completed",
            Generation.video_path.isnot(None),
        )
    )

    # Apply filters
    if pet_type is not None:
        query = query.where(Generation.pet_type == pet_type)
        count_query = count_query.where(Generation.pet_type == pet_type)

    if style is not None:
        query = query.where(Generation.style == style)
        count_query = count_query.where(Generation.style == style)

    # Sorting
    if sort == "trending":
        # Trending: order by likes in last 24 hours
        cutoff = datetime.now(timezone.utc) - timedelta(hours=24)
        trending_sub = (
            select(
                Like.generation_id,
                func.count(Like.id).label("recent_likes"),
            )
            .where(Like.created_at >= cutoff)
            .group_by(Like.generation_id)
            .subquery()
        )
        query = query.outerjoin(trending_sub, Generation.id == trending_sub.c.generation_id)
        query = query.order_by(
            func.coalesce(trending_sub.c.recent_likes, 0).desc(),
            Generation.created_at.desc(),
        )
    elif sort == "most_liked":
        query = query.order_by(
            func.coalesce(likes_sub.c.likes_count, 0).desc(),
            Generation.created_at.desc(),
        )
    else:  # recent
        query = query.order_by(Generation.created_at.desc())

    # Total count
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    # Paginate
    offset = (page - 1) * page_size
    query = query.offset(offset).limit(page_size)

    result = await db.execute(query)
    rows = result.all()

    # Build liked set for current user
    liked_ids: set[int] = set()
    if user and rows:
        gen_ids = [row.generation_id for row in rows]
        liked_result = await db.execute(
            select(Like.generation_id).where(
                Like.user_id == user.id,
                Like.generation_id.in_(gen_ids),
            )
        )
        liked_ids = {r[0] for r in liked_result.all()}

    items = []
    for row in rows:
        items.append(SocialFeedItem(
            generation_id=row.generation_id,
            pet_type=row.pet_type,
            style=row.style,
            prompt=row.prompt,
            photo_url=get_photo_url(row.photo_path) if row.photo_path else None,
            video_url=get_video_url(row.video_path) if row.video_path else None,
            wallet_address=row.wallet_address,
            display_name=row.display_name,
            likes_count=row.likes_count,
            comments_count=row.comments_count,
            is_liked=row.generation_id in liked_ids,
            created_at=row.created_at,
        ))

    return SocialFeedResponse(items=items, total=total, page=page, page_size=page_size)


# ============================================================
# USER PROFILE
# ============================================================

@router.put("/profile", response_model=UserProfileResponse)
async def update_profile(
    body: UserProfileCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create or update the current user's profile."""
    result = await db.execute(
        select(UserProfile).where(UserProfile.user_id == user.id)
    )
    profile = result.scalar_one_or_none()

    if profile is None:
        profile = UserProfile(user_id=user.id)
        db.add(profile)

    if body.display_name is not None:
        profile.display_name = body.display_name
    if body.bio is not None:
        profile.bio = body.bio
    if body.avatar_url is not None:
        profile.avatar_url = body.avatar_url

    await db.commit()
    await db.refresh(profile)

    # Compute stats
    stats = await _get_profile_stats(user.id, db)

    return UserProfileResponse(
        user_id=user.id,
        wallet_address=user.wallet_address,
        display_name=profile.display_name,
        bio=profile.bio,
        avatar_url=profile.avatar_url,
        **stats,
    )


@router.get("/profile/{wallet_address}", response_model=UserProfileResponse)
async def get_profile(
    wallet_address: str,
    db: AsyncSession = Depends(get_db),
):
    """Get a user's profile by wallet address."""
    result = await db.execute(
        select(User).where(User.wallet_address == wallet_address.lower())
    )
    target_user = result.scalar_one_or_none()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")

    # Get profile
    profile_result = await db.execute(
        select(UserProfile).where(UserProfile.user_id == target_user.id)
    )
    profile = profile_result.scalar_one_or_none()

    # Compute stats
    stats = await _get_profile_stats(target_user.id, db)

    return UserProfileResponse(
        user_id=target_user.id,
        wallet_address=target_user.wallet_address,
        display_name=profile.display_name if profile else None,
        bio=profile.bio if profile else None,
        avatar_url=profile.avatar_url if profile else None,
        **stats,
    )


async def _get_profile_stats(user_id: int, db: AsyncSession) -> dict:
    """Compute follower/following/generation/like stats for a user."""
    # Followers count
    r = await db.execute(
        select(func.count()).select_from(Follow).where(Follow.following_id == user_id)
    )
    followers_count = r.scalar() or 0

    # Following count
    r = await db.execute(
        select(func.count()).select_from(Follow).where(Follow.follower_id == user_id)
    )
    following_count = r.scalar() or 0

    # Generations count (completed)
    r = await db.execute(
        select(func.count())
        .select_from(Generation)
        .where(Generation.user_id == user_id, Generation.status == "completed")
    )
    generations_count = r.scalar() or 0

    # Total likes received on all user's generations
    r = await db.execute(
        select(func.count())
        .select_from(Like)
        .join(Generation, Like.generation_id == Generation.id)
        .where(Generation.user_id == user_id)
    )
    total_likes_received = r.scalar() or 0

    return {
        "followers_count": followers_count,
        "following_count": following_count,
        "generations_count": generations_count,
        "total_likes_received": total_likes_received,
    }
