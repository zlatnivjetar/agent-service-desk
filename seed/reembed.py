#!/usr/bin/env python3
"""
Re-embed seed knowledge chunks with real OpenAI embeddings.

The seed data has random embeddings. This script replaces them with real
text-embedding-3-small vectors so similarity search actually works.

Usage:
    DATABASE_URL=postgres://... OPENAI_API_KEY=sk-... python reembed.py

Cost estimate: ~$0.02 for 5,000-8,000 chunks (text-embedding-3-small at $0.02/1M tokens).
"""

import os
import sys
import time

import psycopg
from psycopg.rows import dict_row
from openai import OpenAI

EMBEDDING_MODEL = "text-embedding-3-small"
EMBEDDING_DIMENSIONS = 1536
BATCH_SIZE = 100


def embed_batch(client: OpenAI, texts: list[str]) -> list[list[float]]:
    response = client.embeddings.create(
        model=EMBEDDING_MODEL,
        input=texts,
        dimensions=EMBEDDING_DIMENSIONS,
        encoding_format="float",
    )
    return [item.embedding for item in response.data]


def main() -> None:
    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        print("ERROR: DATABASE_URL environment variable is required.")
        sys.exit(1)

    openai_key = os.environ.get("OPENAI_API_KEY")
    if not openai_key:
        print("ERROR: OPENAI_API_KEY environment variable is required.")
        sys.exit(1)

    client = OpenAI(api_key=openai_key)

    with psycopg.connect(db_url, row_factory=dict_row) as conn:
        rows = conn.execute(
            "SELECT id, content FROM knowledge_chunks WHERE content IS NOT NULL AND content != '' ORDER BY id"
        ).fetchall()

    total = len(rows)
    print(f"Found {total} chunks to re-embed.")

    if total == 0:
        print("Nothing to do.")
        return

    updated = 0
    start = time.perf_counter()

    with psycopg.connect(db_url, row_factory=dict_row) as conn:
        for batch_start in range(0, total, BATCH_SIZE):
            batch = rows[batch_start : batch_start + BATCH_SIZE]
            texts = [r["content"] for r in batch]
            ids = [r["id"] for r in batch]

            embeddings = embed_batch(client, texts)

            for chunk_id, embedding in zip(ids, embeddings):
                vector_str = f"[{','.join(str(x) for x in embedding)}]"
                conn.execute(
                    "UPDATE knowledge_chunks SET embedding = %s::vector WHERE id = %s",
                    [vector_str, chunk_id],
                )

            updated += len(batch)
            elapsed = time.perf_counter() - start
            print(f"  {updated}/{total} chunks embedded ({elapsed:.1f}s)")

    elapsed = time.perf_counter() - start
    print(f"\nDone. Re-embedded {updated} chunks in {elapsed:.1f}s.")


if __name__ == "__main__":
    main()
