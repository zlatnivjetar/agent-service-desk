from typing import Optional
from uuid import UUID

from psycopg import Connection


def list_eval_sets(conn: Connection) -> list[dict]:
    return conn.execute(
        """
        SELECT
            es.id,
            es.name,
            es.description,
            COUNT(ee.id)::int AS example_count,
            es.created_at
        FROM eval_sets es
        LEFT JOIN eval_examples ee ON ee.eval_set_id = es.id
        GROUP BY es.id
        ORDER BY es.created_at DESC
        """
    ).fetchall()


def get_eval_set(conn: Connection, set_id: str) -> Optional[dict]:
    return conn.execute(
        """
        SELECT
            es.id,
            es.name,
            es.description,
            COUNT(ee.id)::int AS example_count,
            es.created_at
        FROM eval_sets es
        LEFT JOIN eval_examples ee ON ee.eval_set_id = es.id
        WHERE es.id = %s
        GROUP BY es.id
        """,
        [set_id],
    ).fetchone()


def list_eval_examples(
    conn: Connection, set_id: str, page: int, per_page: int
) -> tuple[int, list[dict]]:
    # Single query: window function replaces separate COUNT(*) query
    rows = conn.execute(
        """
        SELECT id, type, input_text, expected_category, expected_team, expected_chunk_ids,
            COUNT(*) OVER() AS total_count
        FROM eval_examples
        WHERE eval_set_id = %s
        ORDER BY created_at ASC
        LIMIT %s OFFSET %s
        """,
        [set_id, per_page, (page - 1) * per_page],
    ).fetchall()
    total = rows[0]["total_count"] if rows else 0

    return total, rows


def get_eval_set_examples(conn: Connection, set_id: str) -> list[dict]:
    return conn.execute(
        """
        SELECT id, type, input_text, expected_category, expected_team, expected_chunk_ids
        FROM eval_examples
        WHERE eval_set_id = %s
        ORDER BY created_at ASC
        """,
        [set_id],
    ).fetchall()


def create_eval_run(
    conn: Connection, eval_set_id: str, prompt_version_id: str, total_examples: int
) -> dict:
    return conn.execute(
        """
        INSERT INTO eval_runs (eval_set_id, prompt_version_id, status, total_examples)
        VALUES (%s, %s, 'pending', %s)
        RETURNING id, eval_set_id, prompt_version_id, status, total_examples, passed, failed,
                  metrics, created_at, completed_at
        """,
        [eval_set_id, prompt_version_id, total_examples],
    ).fetchone()


def count_examples_in_set(conn: Connection, set_id: str) -> int:
    row = conn.execute(
        "SELECT COUNT(*)::int AS total FROM eval_examples WHERE eval_set_id = %s",
        [set_id],
    ).fetchone()
    return row["total"]


def list_eval_runs(conn: Connection) -> list[dict]:
    return conn.execute(
        """
        SELECT
            er.id,
            er.eval_set_id,
            es.name AS eval_set_name,
            er.prompt_version_id,
            pv.name AS prompt_version_name,
            er.status,
            er.total_examples,
            er.passed,
            er.failed,
            er.metrics,
            er.created_at,
            er.completed_at
        FROM eval_runs er
        JOIN eval_sets es ON es.id = er.eval_set_id
        JOIN prompt_versions pv ON pv.id = er.prompt_version_id
        ORDER BY er.created_at DESC
        """
    ).fetchall()


def get_eval_run(conn: Connection, run_id: str) -> Optional[dict]:
    return conn.execute(
        """
        SELECT
            er.id,
            er.eval_set_id,
            es.name AS eval_set_name,
            er.prompt_version_id,
            pv.name AS prompt_version_name,
            er.status,
            er.total_examples,
            er.passed,
            er.failed,
            er.metrics,
            er.created_at,
            er.completed_at
        FROM eval_runs er
        JOIN eval_sets es ON es.id = er.eval_set_id
        JOIN prompt_versions pv ON pv.id = er.prompt_version_id
        WHERE er.id = %s
        """,
        [run_id],
    ).fetchone()


def get_eval_run_results(conn: Connection, run_id: str) -> list[dict]:
    return conn.execute(
        """
        SELECT id, eval_example_id, passed, model_output, expected_output, notes
        FROM eval_results
        WHERE eval_run_id = %s
        ORDER BY created_at ASC
        """,
        [run_id],
    ).fetchall()


def list_prompt_versions(conn: Connection) -> list[dict]:
    return conn.execute(
        """
        SELECT id, name, type, is_active, created_at
        FROM prompt_versions
        ORDER BY created_at DESC
        """
    ).fetchall()


def get_eval_run_for_execution(conn: Connection, run_id: str) -> Optional[dict]:
    """Get run + prompt version content needed to execute the run."""
    return conn.execute(
        """
        SELECT er.id, er.eval_set_id, er.prompt_version_id, pv.content AS prompt_content
        FROM eval_runs er
        JOIN prompt_versions pv ON pv.id = er.prompt_version_id
        WHERE er.id = %s
        """,
        [run_id],
    ).fetchone()


def get_eval_examples_for_run(conn: Connection, eval_set_id: str) -> list[dict]:
    """Get all examples in the set for processing."""
    return conn.execute(
        """
        SELECT id, type, input_text, expected_category, expected_team, expected_chunk_ids
        FROM eval_examples
        WHERE eval_set_id = %s
        ORDER BY created_at ASC
        """,
        [eval_set_id],
    ).fetchall()


def insert_eval_result(
    conn: Connection,
    run_id: str,
    example_id: str,
    passed: bool,
    model_output: dict,
    expected_output: dict | None,
    notes: str | None,
) -> None:
    """Insert a single eval result."""
    from psycopg.types.json import Jsonb

    conn.execute(
        """
        INSERT INTO eval_results (eval_run_id, eval_example_id, passed, model_output, expected_output, notes)
        VALUES (%s, %s, %s, %s, %s, %s)
        """,
        [run_id, example_id, passed, Jsonb(model_output), Jsonb(expected_output) if expected_output is not None else None, notes],
    )


def update_eval_run_completed(
    conn: Connection, run_id: str, passed: int, failed: int, metrics: dict
) -> None:
    """Update run to completed with final counts and metrics."""
    from psycopg.types.json import Jsonb

    conn.execute(
        """
        UPDATE eval_runs
        SET status = 'completed', passed = %s, failed = %s, metrics = %s, completed_at = NOW()
        WHERE id = %s
        """,
        [passed, failed, Jsonb(metrics), run_id],
    )


def update_eval_run_status(conn: Connection, run_id: str, status: str) -> None:
    """Update run status (e.g., 'running', 'failed')."""
    conn.execute(
        "UPDATE eval_runs SET status = %s WHERE id = %s",
        [status, run_id],
    )
