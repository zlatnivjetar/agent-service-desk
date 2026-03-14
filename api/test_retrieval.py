#!/usr/bin/env python3
"""
Quick test for the knowledge retrieval SQL — bypasses the OpenAI embed call
by using a random vector (fine since seed embeddings are random anyway).

Run from api/:
    .venv/Scripts/python test_retrieval.py [top_k]
"""
import json
import os
import random
import sys
from pathlib import Path

import psycopg
from psycopg.rows import dict_row

# ---------------------------------------------------------------------------
# Read DATABASE_URL from api/.env.local
# ---------------------------------------------------------------------------
env_path = Path(__file__).parent / ".env.local"
db_url = None
for line in env_path.read_text().splitlines():
    if line.startswith("DATABASE_URL="):
        db_url = line.split("=", 1)[1].strip()
        break
if not db_url:
    sys.exit("DATABASE_URL not found in api/.env.local")

# Use the workspace from memory (workspace #1)
WORKSPACE_ID = "093923de-8bab-4e3b-a628-6bfbe767dcea"
TOP_K = int(sys.argv[1]) if len(sys.argv) > 1 else 5
DIMENSIONS = 1536

# ---------------------------------------------------------------------------
# Build a random query vector
# ---------------------------------------------------------------------------
random_vector = [random.uniform(-1.0, 1.0) for _ in range(DIMENSIONS)]
vector_str = f"[{','.join(str(x) for x in random_vector)}]"

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

with psycopg.connect(db_url, row_factory=dict_row) as conn:
    with conn.cursor() as cur:
        cur.execute(sql, [vector_str, WORKSPACE_ID, vector_str, TOP_K])
        rows = cur.fetchall()

results = [
    {
        "chunk_id": str(row["chunk_id"]),
        "document_id": str(row["document_id"]),
        "document_title": row["document_title"],
        "content": row["content"][:120] + "..." if len(row["content"]) > 120 else row["content"],
        "similarity": round(float(row["similarity"]), 4),
        "chunk_index": row["chunk_index"],
        "visibility": row["visibility"],
    }
    for row in rows
]

print(f"\n{len(results)} results for random query vector (top_k={TOP_K}):\n")
print(json.dumps(results, indent=2))
