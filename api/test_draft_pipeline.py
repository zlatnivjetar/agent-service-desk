"""
Milestone 3D smoke test — stubs OpenAI, uses real DB.

Verifies:
1. Pipeline runs end-to-end
2. Draft stored with correct fields (body, evidence_chunk_ids, confidence, etc.)
3. [chunk:UUID] markers appear in body
4. token_usage and latency_ms populated
5. Running it twice creates two separate draft_generations rows
6. send_ready=false when no evidence cited
"""

import json
import sys
import uuid
from unittest.mock import patch

# Bootstrap env
import os
os.environ.setdefault("ENV_FILE", ".env.local")

from app.config import settings  # noqa: E402
from app.db import pool  # noqa: E402

# ---------------------------------------------------------------------------
# Fake provider responses
# ---------------------------------------------------------------------------

FAKE_CHUNK_ID = str(uuid.uuid4())

FAKE_GENERATE_RESULT = {
    "content": json.dumps({
        "body": (
            f"Thank you for reaching out about the invoice discrepancy. "
            f"According to our billing policy [chunk:{FAKE_CHUNK_ID}], "
            f"Enterprise plan charges are calculated at the start of each billing cycle. "
            f"Please allow 3-5 business days for any adjustments to appear."
        ),
        "cited_evidence": [FAKE_CHUNK_ID],
        "confidence": 0.85,
        "unresolved_questions": [],
        "send_ready": True,
    }),
    "tool_calls_made": [
        {"name": "search_knowledge", "arguments": {"query": "enterprise plan billing invoice"}}
    ],
    "latency_ms": 1234,
    "token_usage": {"prompt_tokens": 500, "completion_tokens": 120, "total_tokens": 620},
    "estimated_cost_cents": 0.045,
}

FAKE_CHUNK = {
    "chunk_id": FAKE_CHUNK_ID,
    "document_id": str(uuid.uuid4()),
    "document_title": "Enterprise Billing FAQ",
    "content": "Enterprise plan charges are applied at the start of each billing cycle.",
    "similarity": 0.91,
    "chunk_index": 0,
}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

TICKET_ID = "37cd5cc8-0a5e-5267-a6c7-6dd65040a4ca"  # billing demo ticket


def _make_fake_generate(search_result):
    """Return a fake generate_with_tools that calls the tool_executor once."""
    def fake(system_prompt, user_input, tools, tool_executor):
        tool_executor("search_knowledge", {"query": "enterprise billing invoice"})
        if search_result:
            return FAKE_GENERATE_RESULT
        return {
            "content": json.dumps({
                "body": "I was unable to find relevant documentation for this issue.",
                "cited_evidence": [],
                "confidence": 0.3,
                "unresolved_questions": ["No matching knowledge base articles found."],
                "send_ready": False,
            }),
            "tool_calls_made": [],
            "latency_ms": 100,
            "token_usage": {"prompt_tokens": 200, "completion_tokens": 50, "total_tokens": 250},
            "estimated_cost_cents": 0.01,
        }
    return fake


def run_test():
    pool.open()
    from app.pipelines.drafting import generate_draft
    from app.db import pool as p

    with p.connection() as conn:
        _set_rls(conn)

        # ── Test 1-4: happy path ──
        with (
            patch("app.pipelines.drafting.generate_with_tools", side_effect=_make_fake_generate([FAKE_CHUNK])),
            patch("app.pipelines.drafting.search_knowledge", return_value=[FAKE_CHUNK]),
        ):
            print("\n── Test 1: generate_draft() runs end-to-end ──")
            result = generate_draft(conn, TICKET_ID)
            draft = result["draft"]
            evidence = result["evidence_chunks"]

            assert draft["body"], "body is empty"
            assert draft["latency_ms"] is not None and draft["latency_ms"] >= 0, f"latency_ms wrong: {draft['latency_ms']}"
            assert draft["token_usage"] is not None and "total_tokens" in draft["token_usage"], "token_usage wrong"
            assert draft["estimated_cost_cents"] is not None, "estimated_cost_cents missing"
            assert draft["approval_outcome"] == "pending", "approval_outcome wrong"
            assert draft["confidence"] == 0.85, "confidence wrong"
            assert draft["send_ready"] is True, "send_ready should be True"
            print("  ✓ body, latency_ms, token_usage, cost, approval_outcome, confidence, send_ready")

            print("\n── Test 2: [chunk:UUID] marker in body ──")
            assert f"[chunk:{FAKE_CHUNK_ID}]" in draft["body"], "no chunk citation in body"
            print(f"  ✓ found [chunk:{FAKE_CHUNK_ID}]")

            print("\n── Test 3: evidence_chunk_ids populated ──")
            ids_as_str = [str(cid) for cid in draft["evidence_chunk_ids"]]
            assert FAKE_CHUNK_ID in ids_as_str, f"chunk not in evidence_chunk_ids: {ids_as_str}"
            print(f"  ✓ evidence_chunk_ids: {ids_as_str}")

            print("\n── Test 4: evidence_chunks returned ──")
            assert len(evidence) == 1, f"expected 1 evidence chunk, got {len(evidence)}"
            assert evidence[0]["chunk_id"] == FAKE_CHUNK_ID
            print(f"  ✓ evidence_chunks[0]: {evidence[0]['document_title']}")

            print("\n── Test 5: second call creates a new record ──")
            first_draft_id = str(draft["id"])
            result2 = generate_draft(conn, TICKET_ID)
            second_draft_id = str(result2["draft"]["id"])
            assert first_draft_id != second_draft_id, "same draft ID returned twice!"
            print(f"  ✓ draft 1: {first_draft_id}")
            print(f"  ✓ draft 2: {second_draft_id}")

        # ── Test 6: no evidence → send_ready=false ──
        with (
            patch("app.pipelines.drafting.generate_with_tools", side_effect=_make_fake_generate([])),
            patch("app.pipelines.drafting.search_knowledge", return_value=[]),
        ):
            print("\n── Test 6: no evidence → send_ready=false ──")
            result3 = generate_draft(conn, TICKET_ID)
            draft3 = result3["draft"]
            assert draft3["send_ready"] is False, "send_ready should be False with no evidence"
            assert draft3["confidence"] == 0.3
            assert len(draft3["unresolved_questions"]) > 0
            print(f"  ✓ send_ready=False, confidence={draft3['confidence']}")
            print(f"  ✓ unresolved_questions: {draft3['unresolved_questions']}")

        conn.rollback()  # don't dirty the DB

    pool.close()
    print("\n✓ All tests passed")


def _set_rls(conn):
    conn.execute("SET LOCAL ROLE rls_user")
    conn.execute(
        "SELECT set_config('app.org_id', %s, TRUE), "
        "set_config('app.workspace_id', %s, TRUE), "
        "set_config('app.user_id', %s, TRUE), "
        "set_config('app.user_role', %s, TRUE)",
        [
            "3eb13b90-4668-4257-bdd6-40fb06671ad1",
            "093923de-8bab-4e3b-a628-6bfbe767dcea",
            "00000000-0000-4000-a000-000000000001",
            "support_agent",
        ],
    )



if __name__ == "__main__":
    try:
        run_test()
    except AssertionError as e:
        print(f"\n✗ FAILED: {e}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        import traceback
        traceback.print_exc()
        sys.exit(1)
