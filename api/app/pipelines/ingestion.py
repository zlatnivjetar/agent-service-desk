"""
Knowledge ingestion pipeline.

ingest_document() runs as a background task. It:
1. Finds the document record (retrying until the upload transaction commits)
2. Updates status to 'processing'
3. Parses text based on content_type
4. Chunks the text into ~500-token pieces with overlap
5. Embeds all chunks via OpenAI
6. Inserts chunks into knowledge_chunks
7. Updates status to 'indexed'

Background tasks cannot use get_rls_db (no request context), so we set up the
RLS role and workspace_id manually on each pool connection.
"""

from __future__ import annotations

import base64
import logging
import time
from contextlib import contextmanager

from app.db import pool
from app.providers.openai import embed_batch
from app.queries import knowledge as q

logger = logging.getLogger(__name__)


@contextmanager
def _workspace_conn(workspace_id: str):
    """Pool connection scoped to a specific workspace for background operations."""
    with pool.connection() as conn:
        with conn.transaction():
            conn.execute("SET LOCAL ROLE rls_user")
            conn.execute(
                "SELECT set_config('app.workspace_id', %s, TRUE),"
                "       set_config('app.user_role', 'support_agent', TRUE)",
                [workspace_id],
            )
            yield conn


def ingest_document(document_id: str, workspace_id: str) -> None:
    try:
        _run_ingestion(document_id, workspace_id)
    except Exception:
        logger.exception("Ingestion failed for document %s", document_id)
        _set_failed(document_id, workspace_id)


def _find_document_with_retry(
    document_id: str,
    workspace_id: str,
    attempts: int = 10,
    delay: float = 0.1,
) -> dict | None:
    """Open a fresh connection per attempt so each try gets a new snapshot.

    The background task can start before the upload handler's transaction commits.
    A new connection sees the row as soon as it is committed.
    """
    for _ in range(attempts):
        with _workspace_conn(workspace_id) as conn:
            doc = q.get_document_for_ingestion(conn, document_id)
        if doc is not None:
            return doc
        time.sleep(delay)
    return None


def _run_ingestion(document_id: str, workspace_id: str) -> None:
    doc = _find_document_with_retry(document_id, workspace_id)
    if doc is None:
        logger.error("Ingestion: document %s not found after retries", document_id)
        return

    with _workspace_conn(workspace_id) as conn:
        q.update_document_status(conn, document_id, "processing")

        content_type = doc["content_type"] or ""
        metadata = doc["metadata"] or {}

        try:
            text = _parse_content(content_type, metadata)
        except Exception:
            logger.exception("Ingestion: parse failed for document %s", document_id)
            q.update_document_status(conn, document_id, "failed")
            return

        if not text or not text.strip():
            logger.error("Ingestion: empty text for document %s", document_id)
            q.update_document_status(conn, document_id, "failed")
            return

        chunk_texts = chunk_text(text)
        embeddings = embed_batch(chunk_texts)

        chunks = [
            {
                "chunk_index": i,
                "content": chunk_texts[i],
                "embedding": embeddings[i],
                "token_count": len(chunk_texts[i]) // 4,
            }
            for i in range(len(chunk_texts))
        ]
        q.insert_chunks(conn, document_id, chunks)
        q.update_document_status(conn, document_id, "indexed")

        logger.info(
            "Ingestion complete for document %s: %d chunks", document_id, len(chunks)
        )


def _parse_content(content_type: str, metadata: dict) -> str:
    if content_type == "application/pdf":
        raw_b64 = metadata.get("raw_bytes_b64")
        if not raw_b64:
            raise ValueError("PDF document missing raw_bytes_b64 in metadata")
        raw_bytes = base64.b64decode(raw_b64)
        return _extract_pdf_text(raw_bytes)

    # text/markdown, text/plain, text/x-markdown
    raw_content = metadata.get("raw_content")
    if raw_content is None:
        raise ValueError("Text document missing raw_content in metadata")
    return raw_content


def _extract_pdf_text(raw_bytes: bytes) -> str:
    import fitz  # pymupdf

    doc = fitz.open(stream=raw_bytes, filetype="pdf")
    pages = []
    for page in doc:
        pages.append(page.get_text())
    doc.close()
    return "\n\n".join(pages)


def chunk_text(text: str, target_chars: int = 2000, overlap_chars: int = 400) -> list[str]:
    """Split text into overlapping chunks."""
    paragraphs = text.split("\n\n")
    chunks: list[str] = []
    current_chunk = ""

    for para in paragraphs:
        if len(current_chunk) + len(para) > target_chars and current_chunk:
            chunks.append(current_chunk.strip())
            current_chunk = current_chunk[-overlap_chars:] + "\n\n" + para
        else:
            current_chunk += ("\n\n" if current_chunk else "") + para

    if current_chunk.strip():
        chunks.append(current_chunk.strip())

    return chunks


def _set_failed(document_id: str, workspace_id: str) -> None:
    try:
        with _workspace_conn(workspace_id) as conn:
            q.update_document_status(conn, document_id, "failed")
    except Exception:
        logger.exception("Ingestion: could not set failed status for document %s", document_id)
