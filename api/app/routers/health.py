from fastapi import APIRouter, Depends
from psycopg import Connection

from app.config import settings
from app.db import get_db

router = APIRouter()

VERSION = "0.1.0"


@router.get("/health")
def health(db: Connection = Depends(get_db)):
    db.execute("SELECT 1")
    return {
        "status": "ok",
        "database": "connected",
        "version": VERSION,
        "environment": settings.environment,
    }
