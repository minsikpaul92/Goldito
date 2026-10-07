"""POST /api/rag/reindex-* — keep `knowledge_chunks` in step with what people save (phase-07B 7B.2)."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.deps.auth import CurrentUser, get_current_user
from app.deps.supabase import get_service_client
from app.services import authz, nebius, rag

router = APIRouter(prefix="/api/rag", tags=["rag"])


class ReindexResponse(BaseModel):
    chunks: int


class ReindexCareRequest(BaseModel):
    care_request_id: UUID


def _unavailable(exc: Exception) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail="The assistant couldn't read that just now. It will be used the next time you save.",
    )


@router.post("/reindex-sitter", response_model=ReindexResponse)
def reindex_sitter(user: CurrentUser = Depends(get_current_user)) -> ReindexResponse:
    """The signed-in sitter's house rules & policies → the knowledge base. Empty policies remove them."""
    if user.role != "sitter":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This action is for sitters.")
    db = get_service_client()
    found = db.table("sitter_profiles").select("policies").eq("id", user.id).limit(1).execute()
    policies = (found.data[0].get("policies") if found.data else None) or ""
    try:
        count = rag.index_source(db, source_type="sitter_policy", source_id=user.id, text=policies, sitter_id=user.id)
    except nebius.AIUnavailable as exc:
        raise _unavailable(exc) from exc
    return ReindexResponse(chunks=count)


@router.post("/reindex-care-request", response_model=ReindexResponse)
def reindex_care_request(
    body: ReindexCareRequest,
    user: CurrentUser = Depends(get_current_user),
) -> ReindexResponse:
    """An owner's care request text → the knowledge base, for that pet only."""
    db = get_service_client()
    found = db.table("care_requests").select("id, pet_id, raw_text").eq("id", str(body.care_request_id)).limit(1).execute()
    if not found.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Care request not found.")
    row = found.data[0]
    authz.assert_owner_of(user, UUID(row["pet_id"]))
    try:
        count = rag.index_source(
            db, source_type="care_request", source_id=row["id"], text=row["raw_text"], pet_id=row["pet_id"]
        )
    except nebius.AIUnavailable as exc:
        raise _unavailable(exc) from exc
    return ReindexResponse(chunks=count)
