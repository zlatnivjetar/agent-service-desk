import uuid
from typing import Optional

from psycopg import Connection
from psycopg.types.json import Jsonb

_ALLOWED_STATUSES = {"pending", "processing", "indexed", "failed"}
_ALLOWED_VISIBILITIES = {"internal", "client_visible"}


def list_documents(
    conn: Connection,
    page: int,
    per_page: int,
    status: Optional[str],
    visibility: Optional[str],
    stalled: Optional[bool],
) -> tuple[int, list[dict]]:
    where_clauses: list[str] = []
    params: list = []

    if status is not None and status in _ALLOWED_STATUSES:
        where_clauses.append("status = %s")
        params.append(status)
    if visibility is not None and visibility in _ALLOWED_VISIBILITIES:
        where_clauses.append("visibility = %s")
        params.append(visibility)
    if stalled:
        where_clauses.append("status = 'processing'")
        where_clauses.append("created_at <= now() - interval '15 minutes'")

    where_sql = " AND ".join(where_clauses) if where_clauses else "TRUE"

    # Single query: window function replaces separate COUNT(*) query
    rows = conn.execute(
        f"""
        SELECT id, title, source_filename, content_type, visibility, status, created_at,
            COUNT(*) OVER() AS total_count
        FROM knowledge_documents
        WHERE {where_sql}
        ORDER BY created_at DESC
        LIMIT %s OFFSET %s
        """,
        params + [per_page, (page - 1) * per_page],
    ).fetchall()
    total = rows[0]["total_count"] if rows else 0

    return total, rows


def get_document(conn: Connection, doc_id: str) -> Optional[dict]:
    return conn.execute(
        """
        SELECT id, title, source_filename, content_type, visibility, status, created_at
        FROM knowledge_documents
        WHERE id = %s
        """,
        [doc_id],
    ).fetchone()


def get_chunks(conn: Connection, doc_id: str) -> list[dict]:
    return conn.execute(
        """
        SELECT id, chunk_index, content, token_count
        FROM knowledge_chunks
        WHERE document_id = %s
        ORDER BY chunk_index ASC
        """,
        [doc_id],
    ).fetchall()


def insert_document(
    conn: Connection,
    workspace_id: str,
    title: str,
    visibility: str,
    source_filename: Optional[str],
    content_type: Optional[str],
    metadata: Optional[dict] = None,
) -> dict:
    metadata_jsonb = Jsonb(metadata or {})
    row = conn.execute(
        """
        INSERT INTO knowledge_documents
            (workspace_id, title, visibility, source_filename, content_type, status, metadata)
        VALUES (%s, %s, %s, %s, %s, 'pending', %s)
        RETURNING id, title, source_filename, content_type, visibility, status, created_at
        """,
        [workspace_id, title, visibility, source_filename, content_type, metadata_jsonb],
    ).fetchone()
    return row


def delete_document(conn: Connection, doc_id: str) -> bool:
    result = conn.execute(
        "DELETE FROM knowledge_documents WHERE id = %s RETURNING id",
        [doc_id],
    ).fetchone()
    return result is not None


def get_document_for_ingestion(conn: Connection, doc_id: str) -> Optional[dict]:
    return conn.execute(
        """
        SELECT id, content_type, status, metadata
        FROM knowledge_documents
        WHERE id = %s
        """,
        [doc_id],
    ).fetchone()


def update_document_status(conn: Connection, doc_id: str, new_status: str) -> None:
    conn.execute(
        "UPDATE knowledge_documents SET status = %s, updated_at = now() WHERE id = %s",
        [new_status, doc_id],
    )


def insert_chunks(conn: Connection, document_id: str, chunks: list[dict]) -> None:
    """Insert a list of chunks. Each dict must have: chunk_index, content, embedding, token_count."""
    conn.cursor().executemany(
        """
        INSERT INTO knowledge_chunks (id, document_id, chunk_index, content, embedding, token_count)
        VALUES (%s, %s, %s, %s, %s::vector, %s)
        """,
        [
            (
                str(uuid.uuid4()),
                document_id,
                c["chunk_index"],
                c["content"],
                f"[{','.join(str(x) for x in c['embedding'])}]",
                c["token_count"],
            )
            for c in chunks
        ],
    )
