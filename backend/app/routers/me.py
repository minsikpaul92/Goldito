from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.deps.auth import CurrentUser, Role, get_current_user

router = APIRouter(prefix="/api", tags=["me"])


class MeResponse(BaseModel):
    id: str
    email: str | None
    role: Role
    display_name: str


@router.get("/me", response_model=MeResponse)
def me(user: CurrentUser = Depends(get_current_user)) -> MeResponse:
    return MeResponse(id=user.id, email=user.email, role=user.role, display_name=user.display_name)
