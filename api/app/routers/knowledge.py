import base64
from typing import Annotated, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Query, UploadFile, status
from psycopg import Connection

from app.auth import CurrentUser, get_current_user
from app.db import pool
from app.deps import get_rls_db
from app.pipelines.ingestion import ingest_document
from app.pipelines.retrieval import search_knowledge
from app.queries import knowledge as q
from app.schemas.common import PaginatedResponse
from app.schemas.knowledge import KnowledgeChunk, KnowledgeDocDetail, KnowledgeDocListItem, KnowledgeSearchResult

router = APIRouter()

_ALLOWED_EXTENSIONS = {".pdf", ".md", ".txt"}
_ALLOWED_CONTENT_TYPES = {
    "application/pdf",
    "text/markdown",
    "text/plain",
    "text/x-markdown",
}


@router.get("/documents", response_model=PaginatedResponse)
def list_documents(
    db: Annotated[Connection, Depends(get_rls_db)],
    page: int = Query(1, ge=1),
    per_page: int = Query(25, ge=1, le=100),
    status: Optional[str] = Query(None),
    visibility: Optional[str] = Query(None),
):
    total, rows = q.list_documents(
        conn=db,
        page=page,
        per_page=per_page,
        status=status,
        visibility=visibility,
    )
    items = [KnowledgeDocListItem.model_validate(row) for row in rows]
    return PaginatedResponse(
        items=items,
        total=total,
        page=page,
        per_page=per_page,
        total_pages=(total + per_page - 1) // per_page,
    )


@router.get("/documents/{doc_id}", response_model=KnowledgeDocDetail)
def get_document(
    doc_id: str,
    db: Annotated[Connection, Depends(get_rls_db)],
):
    doc = q.get_document(db, doc_id)
    if doc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    chunks = q.get_chunks(db, doc_id)
    return KnowledgeDocDetail(
        **doc,
        chunks=[KnowledgeChunk.model_validate(c) for c in chunks],
    )


@router.post(
    "/documents",
    response_model=KnowledgeDocDetail,
    status_code=status.HTTP_201_CREATED,
)
async def upload_document(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    background_tasks: BackgroundTasks,
    title: str = Form(...),
    visibility: str = Form(...),
    file: UploadFile = File(...),
):
    if visibility not in ("internal", "client_visible"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="visibility must be 'internal' or 'client_visible'",
        )

    filename = file.filename or ""
    suffix = "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if suffix not in _ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File type '{suffix}' not supported. Allowed: .pdf, .md, .txt",
        )

    raw_bytes = await file.read()
    content_type = file.content_type or ""

    if content_type == "application/pdf":
        metadata: dict = {"raw_bytes_b64": base64.b64encode(raw_bytes).decode("ascii")}
    else:
        metadata = {"raw_content": raw_bytes.decode("utf-8", errors="replace")}

    # Use a dedicated connection that commits immediately so the background
    # ingestion task can find the document row as soon as it starts.
    # (BackgroundTasks run before yield-dependency teardown in Starlette, so
    # the get_rls_db transaction would still be open when the task begins.)
    with pool.connection() as insert_conn:
        with insert_conn.transaction():
            insert_conn.execute("SET LOCAL ROLE rls_user")
            insert_conn.execute(
                "SELECT set_config('app.workspace_id', %s, TRUE),"
                "       set_config('app.user_role', %s, TRUE)",
                [user.workspace_id, user.role],
            )
            doc = q.insert_document(
                conn=insert_conn,
                workspace_id=user.workspace_id,
                title=title,
                visibility=visibility,
                source_filename=filename or None,
                content_type=content_type,
                metadata=metadata,
            )
    # insert_conn context has exited — transaction committed, row is visible
    doc_id = str(doc["id"])
    background_tasks.add_task(ingest_document, doc_id, user.workspace_id)
    return KnowledgeDocDetail(**doc, chunks=[])


@router.get("/search", response_model=list[KnowledgeSearchResult])
def search_knowledge_endpoint(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Connection, Depends(get_rls_db)],
    q: str = Query(..., alias="q"),
    top_k: int = Query(5, ge=1, le=20),
):
    results = search_knowledge(conn=db, workspace_id=user.workspace_id, query=q, top_k=top_k)
    return results


@router.delete("/documents/{doc_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_document(
    doc_id: str,
    db: Annotated[Connection, Depends(get_rls_db)],
):
    found = q.delete_document(db, doc_id)
    if not found:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
