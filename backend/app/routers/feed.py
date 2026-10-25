"""Feed post delete: from my Feed only, or for both within 30 minutes, with media cleanup (phase-05 5.7, #345)."""

import logging
from typing import Literal
from uuid import UUID

import cloudinary.uploader
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.deps.auth import CurrentUser, get_current_user
from app.deps.supabase import get_service_client
from app.services import authz
from app.services import cloudinary as cloudinary_service

router = APIRouter(prefix="/api/feed", tags=["feed"])
log = logging.getLogger("goldito.feed")


class DeleteFeedPostResponse(BaseModel):
    removed: bool
    # The post row is gone for everyone (nobody can see it any more), not only from my Feed.
    deleted: bool
    media_removed: bool


def _media_in_use(db, media_id: str, *, except_post: str) -> bool:
    """Is the media still referenced by another feed post, task log, check-in, safety check, Diary page, handoff check or sticker?"""
    other_posts = (
        db.table("feed_posts")
        .select("id")
        .eq("media_id", media_id)
        .neq("id", except_post)
        .limit(1)
        .execute()
    )
    if other_posts.data:
        return True
    # A task or check-in photo also shows in the Diary / History, a Diary page's picture box (014t) and a handoff check
    # (Received) point at it too: deleting its feed post keeps the file.
    for table in ("task_logs", "care_checkins", "safety_checks", "daily_reports", "handoff_checks", "pet_stickers"):
        used = db.table(table).select("id").eq("media_id", media_id).limit(1).execute()
        if used.data:
            return True
    return False


def _remove_for_me(user: CurrentUser, post_id: UUID, scope: str) -> bool:
    """The database decides who may remove it and whether nobody can see it any more (`remove_feed_post`, 015j)."""
    try:
        answer = authz.rpc_json(user.access_token, "remove_feed_post", {"p_post": str(post_id), "p_scope": scope})
    except authz.RpcError as exc:
        if exc.message == "not_found":
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found.") from exc
        if exc.message == "not_author":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only the person who posted it can delete it for both.",
            ) from exc
        if exc.message == "too_late":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="It has been more than 30 minutes. It can only be deleted on your side.",
            ) from exc
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Couldn't delete this photo. Try again.",
        ) from exc
    return bool((answer or {}).get("purge"))


@router.delete("/{post_id}", response_model=DeleteFeedPostResponse)
def delete_feed_post(
    post_id: UUID,
    scope: Literal["me", "everyone"] = "me",
    user: CurrentUser = Depends(get_current_user),
) -> DeleteFeedPostResponse:
    """`scope=me` takes the post out of my Feed only; `scope=everyone` is the author's, for a shared post, within 30
    minutes. Only when nobody can see the post any more is it deleted, and then the photo itself (Cloudinary + media
    row) too, unless something else still uses it."""
    purge = _remove_for_me(user, post_id, scope)
    if not purge:
        return DeleteFeedPostResponse(removed=True, deleted=False, media_removed=False)

    db = get_service_client()
    found = (
        db.table("feed_posts")
        .select("id, media_id, media(cloudinary_public_id, resource_type)")
        .eq("id", str(post_id))
        .limit(1)
        .execute()
    )
    if not found.data:
        return DeleteFeedPostResponse(removed=True, deleted=True, media_removed=False)
    post = found.data[0]
    media_id = post["media_id"]
    media = post.get("media")
    if isinstance(media, list):
        media = media[0] if media else None
    remove_media = bool(media) and not _media_in_use(db, media_id, except_post=str(post_id))

    # The person's delete is already recorded, so a file that will not go is left behind rather than failing it.
    if remove_media:
        try:
            cloudinary_service.configure_cloudinary()
            cloudinary.uploader.destroy(
                media["cloudinary_public_id"],
                resource_type=media["resource_type"],
                invalidate=True,
            )
        except Exception:  # noqa: BLE001 — Cloudinary SDK raises varied types
            log.warning("feed post %s deleted, file %s not removed", post_id, media["cloudinary_public_id"])
            remove_media = False

    try:
        db.table("feed_posts").delete().eq("id", str(post_id)).execute()
        if remove_media:
            db.table("media").delete().eq("id", media_id).execute()
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Couldn't delete this post. Try again.",
        ) from exc
    return DeleteFeedPostResponse(removed=True, deleted=True, media_removed=remove_media)
