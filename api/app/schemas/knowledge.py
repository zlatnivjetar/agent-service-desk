from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel


class KnowledgeChunk(BaseModel):
    id: UUID
    chunk_index: int
    content: str
    token_count: Optional[int] = None


class KnowledgeDocListItem(BaseModel):
    id: UUID
    title: str
    source_filename: Optional[str] = None
    content_type: Optional[str] = None
    visibility: str
    status: str
    created_at: datetime


class KnowledgeDocDetail(KnowledgeDocListItem):
    chunks: list[KnowledgeChunk] = []


class KnowledgeDocUpload(BaseModel):
    title: str
    visibility: str  # 'internal' | 'client_visible'


class KnowledgeSearchResult(BaseModel):
    chunk_id: str
    document_id: str
    document_title: str
    content: str
    similarity: float
    chunk_index: int
