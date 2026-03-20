from datetime import datetime
from typing import Optional

from psycopg import Connection

_ALLOWED_SORT_COLUMNS = {"created_at", "confidence"}
_ALLOWED_SORT_ORDERS = {"asc", "desc"}


def list_pending_drafts(
    conn: Connection,
    page: int,
    per_page: int,
    confidence_max: Optional[float],
    created_before: Optional[datetime],
    sort_by: str,
    sort_order: str,
) -> tuple[int, list[dict]]:
    if sort_by not in _ALLOWED_SORT_COLUMNS:
        sort_by = "created_at"
    if sort_order not in _ALLOWED_SORT_ORDERS:
        sort_order = "asc"

    where_clauses = ["(dg.approval_outcome = 'pending' OR dg.approval_outcome IS NULL)"]
    params: list = []

    if confidence_max is not None:
        where_clauses.append("dg.confidence <= %s")
        params.append(confidence_max)
    if created_before is not None:
        where_clauses.append("dg.created_at <= %s")
        params.append(created_before)

    # Single query: window function replaces separate COUNT(*) query
    rows = conn.execute(
        f"""
        SELECT
            dg.id AS draft_generation_id,
            dg.ticket_id,
            t.subject AS ticket_subject,
            LEFT(dg.body, 200) AS body,
            dg.confidence,
            dg.approval_outcome,
            EXTRACT(EPOCH FROM (now() - dg.created_at)) AS time_since_generation,
            dg.created_at,
            COUNT(*) OVER() AS total_count
        FROM draft_generations dg
        JOIN tickets t ON t.id = dg.ticket_id
        WHERE {' AND '.join(where_clauses)}
        ORDER BY dg.{sort_by} {sort_order}
        LIMIT %s OFFSET %s
        """,
        params + [per_page, (page - 1) * per_page],
    ).fetchall()
    total = rows[0]["total_count"] if rows else 0

    return total, rows


def get_draft(conn: Connection, draft_id: str) -> Optional[dict]:
    return conn.execute(
        "SELECT id, ticket_id, approval_outcome FROM draft_generations WHERE id = %s",
        [draft_id],
    ).fetchone()


def insert_approval_action(
    conn: Connection,
    draft_id: str,
    acted_by: str,
    action: str,
    edited_body: Optional[str],
    reason: Optional[str],
) -> dict:
    row = conn.execute(
        """
        INSERT INTO approval_actions (draft_generation_id, acted_by, action, edited_body, reason)
        VALUES (%s, %s, %s, %s, %s)
        RETURNING id, action, acted_by, reason, created_at
        """,
        [draft_id, acted_by, action, edited_body, reason],
    ).fetchone()
    return row


def update_draft_outcome(conn: Connection, draft_id: str, outcome: str) -> None:
    conn.execute(
        "UPDATE draft_generations SET approval_outcome = %s WHERE id = %s",
        [outcome, draft_id],
    )


def update_ticket_status(conn: Connection, ticket_id: str, new_status: str) -> None:
    conn.execute(
        "UPDATE tickets SET status = %s, updated_at = now() WHERE id = %s",
        [new_status, ticket_id],
    )
