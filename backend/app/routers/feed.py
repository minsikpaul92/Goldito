"""Feed post delete with media cleanup (phase-05 5.7 follow-up)."""

from uuid import UUID

import cloudinary.uploader
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.deps.auth import CurrentUser, get_current_user
from app.deps.supabase import get_service_client
from app.services import cloudinary as cloudinary_service

router = APIRouter(prefix="/api/feed", tags=["feed"])


class DeleteFeedPostResponse(BaseModel):
    deleted: bool
    media_removed: bool


def _media_in_use(db, media_id: str, *, except_post: str) -> bool:
    """Is the media still referenced by another feed post, task log or safety check?"""
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
    for table in ("task_logs", "safety_checks"):
        used = db.table(table).select("id").eq("media_id", media_id).limit(1).execute()
        if used.data:
            return True
    return False


@router.delete("/{post_id}", response_model=DeleteFeedPostResponse)
def delete_feed_post(
    post_id: UUID,
    user: CurrentUser = Depends(get_current_user),
) -> DeleteFeedPostResponse:
    """Author-only (sitter or owner). Removes the post, then the photo itself (Cloudinary + media row) unless
    something else still uses it, so "Delete" really deletes the file."""
    db = get_service_client()
    found = (
        db.table("feed_posts")
        .select("id, posted_by, media_id, media(cloudinary_public_id, resource_type)")
        .eq("id", str(post_id))
        .limit(1)
        .execute()
    )
    if not found.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found.")
    post = found.data[0]
    if post["posted_by"] != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only delete photos you posted.",
        )

    media_id = post["media_id"]
    media = post.get("media")
    if isinstance(media, list):
        media = media[0] if media else None
    remove_media = bool(media) and not _media_in_use(db, media_id, except_post=str(post_id))

    # Cloudinary first: if it fails nothing has changed and the author can retry.
    if remove_media:
        try:
            cloudinary_service.configure_cloudinary()
            cloudinary.uploader.destroy(
                media["cloudinary_public_id"],
                resource_type=media["resource_type"],
                invalidate=True,
            )
        except RuntimeError as exc:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Cloudinary is not configured.",
            ) from exc
        except Exception as exc:  # noqa: BLE001 — Cloudinary SDK raises varied types
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Couldn't remove the photo file. Try again.",
            ) from exc

    try:
        db.table("feed_posts").delete().eq("id", str(post_id)).execute()
        if remove_media:
            db.table("media").delete().eq("id", media_id).execute()
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Couldn't delete this post. Try again.",
        ) from exc
    return DeleteFeedPostResponse(deleted=True, media_removed=remove_media)
