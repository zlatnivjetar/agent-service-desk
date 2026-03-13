from fastapi import APIRouter, Depends

from app.auth import CurrentUser, get_current_user

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/me")
def me(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    """Return the validated JWT claims. Used to verify the full auth chain."""
    return user
