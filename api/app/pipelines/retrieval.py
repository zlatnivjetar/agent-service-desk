"""
Knowledge retrieval pipeline.

search_knowledge() embeds a query and runs a cosine similarity search
against knowledge_chunks, filtered by workspace and visibility via RLS.
"""

from psycopg import Connection

from app.providers.openai import embed


def search_knowledge(
    conn: Connection,
    workspace_id: str,
    query: str,
    top_k: int = 5,
    visibility_filter: str | None = None,
) -> list[dict]:
    query_vector = embed(query)
    vector_str = f"[{','.join(str(x) for x in query_vector)}]"

    sql = """
        SELECT kc.id          AS chunk_id,
               kc.chunk_index,
               kc.content,
               kc.token_count,
               kd.id          AS document_id,
               kd.title       AS document_title,
               kd.visibility,
               1 - (kc.embedding <=> %s::vector) AS similarity
        FROM knowledge_chunks kc
        JOIN knowledge_documents kd ON kd.id = kc.document_id
        WHERE kd.workspace_id = %s
          AND kd.status = 'indexed'
        ORDER BY kc.embedding <=> %s::vector
        LIMIT %s
    """
    params: list = [vector_str, workspace_id, vector_str, top_k]

    if visibility_filter is not None:
        sql = """
            SELECT kc.id          AS chunk_id,
                   kc.chunk_index,
                   kc.content,
                   kc.token_count,
                   kd.id          AS document_id,
                   kd.title       AS document_title,
                   kd.visibility,
                   1 - (kc.embedding <=> %s::vector) AS similarity
            FROM knowledge_chunks kc
            JOIN knowledge_documents kd ON kd.id = kc.document_id
            WHERE kd.workspace_id = %s
              AND kd.status = 'indexed'
              AND kd.visibility = %s
            ORDER BY kc.embedding <=> %s::vector
            LIMIT %s
        """
        params = [vector_str, workspace_id, visibility_filter, vector_str, top_k]

    with conn.cursor() as cur:
        cur.execute(sql, params)
        rows = cur.fetchall()

    return [
        {
            "chunk_id": str(row["chunk_id"]),
            "document_id": str(row["document_id"]),
            "document_title": row["document_title"],
            "content": row["content"],
            "similarity": float(row["similarity"]),
            "chunk_index": row["chunk_index"],
        }
        for row in rows
    ]
