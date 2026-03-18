from typing import Annotated

from fastapi import APIRouter, Depends
from psycopg import Connection

from app.deps import get_rls_db
from app.queries import users as q
from app.schemas.users import UserListItem

router = APIRouter()


@router.get("", response_model=list[UserListItem])
def list_users(db: Annotated[Connection, Depends(get_rls_db)]):
    rows = q.list_workspace_users(db)
    return [UserListItem.model_validate(row) for row in rows]
