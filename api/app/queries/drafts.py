from typing import Optional

from psycopg import Connection


def list_pending_drafts(
    conn: Connection,
    page: int,
    per_page: int,
) -> tuple[int, list[dict]]:
    total_row = conn.execute(
        """
        SELECT count(*) AS total
        FROM draft_generations dg
        WHERE dg.approval_outcome = 'pending' OR dg.approval_outcome IS NULL
        """
    ).fetchone()
    total = total_row["total"]

    rows = conn.execute(
        """
        SELECT
            dg.id AS draft_generation_id,
            dg.ticket_id,
            t.subject AS ticket_subject,
            LEFT(dg.body, 200) AS body,
            dg.confidence,
            dg.approval_outcome,
            EXTRACT(EPOCH FROM (now() - dg.created_at)) AS time_since_generation,
            dg.created_at
        FROM draft_generations dg
        JOIN tickets t ON t.id = dg.ticket_id
        WHERE dg.approval_outcome = 'pending' OR dg.approval_outcome IS NULL
        ORDER BY dg.created_at ASC
        LIMIT %s OFFSET %s
        """,
        [per_page, (page - 1) * per_page],
    ).fetchall()

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
