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
) -> tuple[int, list[dict]]:
    where_clauses: list[str] = []
    params: list = []

    if status is not None and status in _ALLOWED_STATUSES:
        where_clauses.append("status = %s")
        params.append(status)
    if visibility is not None and visibility in _ALLOWED_VISIBILITIES:
        where_clauses.append("visibility = %s")
        params.append(visibility)

    where_sql = " AND ".join(where_clauses) if where_clauses else "TRUE"

    total_row = conn.execute(
        f"SELECT count(*) AS total FROM knowledge_documents WHERE {where_sql}", params
    ).fetchone()
    total = total_row["total"]

    rows = conn.execute(
        f"""
        SELECT id, title, source_filename, content_type, visibility, status, created_at
        FROM knowledge_documents
        WHERE {where_sql}
        ORDER BY created_at DESC
        LIMIT %s OFFSET %s
        """,
        params + [per_page, (page - 1) * per_page],
    ).fetchall()

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
    raw_content: Optional[str],
) -> dict:
    metadata = Jsonb({"raw_content": raw_content} if raw_content is not None else {})
    row = conn.execute(
        """
        INSERT INTO knowledge_documents
            (workspace_id, title, visibility, source_filename, content_type, status, metadata)
        VALUES (%s, %s, %s, %s, %s, 'pending', %s)
        RETURNING id, title, source_filename, content_type, visibility, status, created_at
        """,
        [workspace_id, title, visibility, source_filename, content_type, metadata],
    ).fetchone()
    return row


def delete_document(conn: Connection, doc_id: str) -> bool:
    result = conn.execute(
        "DELETE FROM knowledge_documents WHERE id = %s RETURNING id",
        [doc_id],
    ).fetchone()
    return result is not None
