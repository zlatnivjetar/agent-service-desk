from typing import Annotated

import psycopg
from fastapi import APIRouter, Depends

from app.deps import get_rls_db

router = APIRouter(prefix="/debug", tags=["debug"])


@router.get("/tickets/count")
def tickets_count(db: Annotated[psycopg.Connection, Depends(get_rls_db)]):
    row = db.execute("SELECT count(*) AS count FROM tickets").fetchone()
    return {"count": row["count"]}


@router.get("/messages/count")
def messages_count(db: Annotated[psycopg.Connection, Depends(get_rls_db)]):
    row = db.execute(
        "SELECT count(*) AS total, count(*) FILTER (WHERE is_internal = true) AS internal "
        "FROM ticket_messages"
    ).fetchone()
    return {"total": row["total"], "internal": row["internal"]}


@router.get("/knowledge/count")
def knowledge_count(db: Annotated[psycopg.Connection, Depends(get_rls_db)]):
    row = db.execute("SELECT count(*) AS total FROM knowledge_documents").fetchone()
    return {"total": row["total"]}
