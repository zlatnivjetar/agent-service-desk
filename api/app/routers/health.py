from fastapi import APIRouter, Depends
from psycopg import Connection

from app.db import get_db

router = APIRouter()


@router.get("/health")
def health(db: Connection = Depends(get_db)):
    db.execute("SELECT 1")
    return {"status": "ok", "database": "connected"}
