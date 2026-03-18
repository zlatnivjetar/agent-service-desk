"""
Evaluation pipeline.

run_evaluation(eval_run_id) is a background task. It:
1. Loads the eval run, its eval set, and all examples
2. Loads the prompt version specified in the run
3. For each example, runs the appropriate pipeline (triage or retrieval) and compares output
4. Writes eval_results rows
5. Updates the run with final metrics and status
"""

from __future__ import annotations

import logging
from contextlib import contextmanager

from app.db import pool
from app.providers.openai import classify, embed
from app.queries import evals as q

logger = logging.getLogger(__name__)


@contextmanager
def _lead_conn():
    """Pool connection scoped as team_lead for background eval operations.
    Eval tables have RLS policies requiring current_user_role() = 'team_lead'."""
    with pool.connection() as conn:
        with conn.transaction():
            conn.execute("SET LOCAL ROLE rls_user")
            conn.execute(
                "SELECT set_config('app.user_role', 'team_lead', TRUE)",
            )
            yield conn

# Reuse the same schema the triage pipeline uses
TRIAGE_RESPONSE_SCHEMA: dict = {
    "type": "object",
    "properties": {
        "category": {
            "type": "string",
            "enum": [
                "billing",
                "bug_report",
                "feature_request",
                "account_access",
                "integration",
                "api_issue",
                "onboarding",
                "data_export",
            ],
        },
        "urgency": {
            "type": "string",
            "enum": ["low", "medium", "high", "critical"],
        },
        "suggested_team": {
            "type": "string",
            "enum": [
                "general_support",
                "billing_team",
                "engineering",
                "integrations",
                "onboarding",
                "account_management",
            ],
        },
        "escalation_suggested": {"type": "boolean"},
        "escalation_reason": {"type": ["string", "null"]},
        "confidence": {"type": "number", "minimum": 0, "maximum": 1},
    },
    "required": [
        "category",
        "urgency",
        "suggested_team",
        "escalation_suggested",
        "escalation_reason",
        "confidence",
    ],
    "additionalProperties": False,
}


def run_evaluation(eval_run_id: str) -> None:
    """Entry point for the background task. Catches catastrophic failures."""
    try:
        _execute_run(eval_run_id)
    except Exception:
        logger.exception("Eval run %s failed catastrophically", eval_run_id)
        try:
            with _lead_conn() as conn:
                q.update_eval_run_status(conn, eval_run_id, "failed")
        except Exception:
            logger.exception("Could not mark eval run %s as failed", eval_run_id)


def _execute_run(eval_run_id: str) -> None:
    with _lead_conn() as conn:
        run = q.get_eval_run_for_execution(conn, eval_run_id)

    if run is None:
        raise RuntimeError(f"Eval run {eval_run_id} not found")

    with _lead_conn() as conn:
        q.update_eval_run_status(conn, eval_run_id, "running")
        examples = q.get_eval_examples_for_run(conn, str(run["eval_set_id"]))
        workspace_id = _get_first_workspace_id(conn)

    results: list[dict] = []
    for example in examples:
        result = _process_example(example, run["prompt_content"], workspace_id)
        results.append(result)

        try:
            with _lead_conn() as conn:
                q.insert_eval_result(
                    conn,
                    run_id=eval_run_id,
                    example_id=str(example["id"]),
                    passed=result["passed"],
                    model_output=result["model_output"],
                    expected_output=result.get("expected_output"),
                    notes=result.get("notes"),
                )
        except Exception:
            logger.exception(
                "Failed to write result for example %s in run %s",
                example["id"],
                eval_run_id,
            )

    passed = sum(1 for r in results if r["passed"])
    failed = len(results) - passed
    metrics = _compute_metrics(results)

    with _lead_conn() as conn:
        q.update_eval_run_completed(conn, eval_run_id, passed, failed, metrics)


def _process_example(example: dict, prompt_content: str, workspace_id: str | None) -> dict:
    example_type = example["type"]
    try:
        if example_type == "classification":
            return _run_classification(example, prompt_content)
        elif example_type == "routing":
            return _run_routing(example, prompt_content)
        elif example_type == "citation":
            return _run_citation(example, workspace_id)
        else:
            return {
                "passed": False,
                "type": example_type,
                "model_output": {},
                "notes": f"Unknown example type: {example_type}",
            }
    except Exception as exc:
        logger.warning(
            "Example %s failed: %s",
            example["id"],
            exc,
        )
        return {
            "passed": False,
            "type": example_type,
            "model_output": {},
            "notes": f"Error: {exc}",
        }


def _run_classification(example: dict, prompt_content: str) -> dict:
    provider_response = classify(
        system_prompt=prompt_content,
        user_input=example["input_text"],
        response_schema=TRIAGE_RESPONSE_SCHEMA,
    )
    result = provider_response["result"]
    expected_category = example.get("expected_category")
    passed = result.get("category") == expected_category
    return {
        "passed": passed,
        "type": "classification",
        "model_output": result,
        "expected_output": {"category": expected_category},
    }


def _run_routing(example: dict, prompt_content: str) -> dict:
    provider_response = classify(
        system_prompt=prompt_content,
        user_input=example["input_text"],
        response_schema=TRIAGE_RESPONSE_SCHEMA,
    )
    result = provider_response["result"]
    expected_team = example.get("expected_team")
    passed = result.get("suggested_team") == expected_team
    return {
        "passed": passed,
        "type": "routing",
        "model_output": result,
        "expected_output": {"suggested_team": expected_team},
    }


def _run_citation(example: dict, workspace_id: str | None) -> dict:
    query_vector = embed(example["input_text"])
    vector_str = f"[{','.join(str(x) for x in query_vector)}]"

    expected_chunk_ids_raw = example.get("expected_chunk_ids") or []
    expected_chunk_ids = {str(cid) for cid in expected_chunk_ids_raw}

    retrieved_chunk_ids: list[str] = []
    if workspace_id:
        with _lead_conn() as conn:
            rows = conn.execute(
                """
                SELECT kc.id::text AS chunk_id
                FROM knowledge_chunks kc
                JOIN knowledge_documents kd ON kd.id = kc.document_id
                WHERE kd.workspace_id = %s
                  AND kd.status = 'indexed'
                ORDER BY kc.embedding <=> %s::vector
                LIMIT 5
                """,
                [workspace_id, vector_str],
            ).fetchall()
            retrieved_chunk_ids = [row["chunk_id"] for row in rows]

    passed = len(expected_chunk_ids & set(retrieved_chunk_ids)) > 0
    return {
        "passed": passed,
        "type": "citation",
        "model_output": {"retrieved_chunk_ids": retrieved_chunk_ids},
        "expected_output": {"expected_chunk_ids": [str(c) for c in expected_chunk_ids_raw]},
    }


def _compute_metrics(results: list[dict]) -> dict:
    metrics: dict = {}

    classification = [r for r in results if r.get("type") == "classification"]
    if classification:
        metrics["accuracy"] = sum(r["passed"] for r in classification) / len(classification)

    routing = [r for r in results if r.get("type") == "routing"]
    if routing:
        metrics["routing_accuracy"] = sum(r["passed"] for r in routing) / len(routing)

    citation = [r for r in results if r.get("type") == "citation"]
    if citation:
        metrics["citation_hit_rate"] = sum(r["passed"] for r in citation) / len(citation)

    return metrics


def _get_first_workspace_id(conn) -> str | None:
    row = conn.execute("SELECT id::text FROM workspaces ORDER BY created_at LIMIT 1").fetchone()
    return row["id"] if row else None
