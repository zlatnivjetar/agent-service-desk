from typing import Annotated

from fastapi import APIRouter, Depends
from psycopg import Connection

from app.auth import CurrentUser, get_current_user
from app.deps import get_rls_db
from app.queries import evals as q
from app.schemas.evals import PromptVersion

router = APIRouter()


@router.get("", response_model=list[PromptVersion])
def list_prompt_versions(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Connection, Depends(get_rls_db)],
):
    rows = q.list_prompt_versions(db)
    return [PromptVersion.model_validate(row) for row in rows]
