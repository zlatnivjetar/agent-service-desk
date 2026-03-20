from datetime import date, datetime
from typing import Optional

from psycopg import Connection
from psycopg.types.json import Jsonb

_ALLOWED_SORT_COLUMNS = {"created_at", "updated_at", "priority", "status", "subject"}
_ALLOWED_SORT_ORDERS = {"asc", "desc"}

# Base SELECT for single-ticket lookups (get, update, assign)
_TICKET_SELECT = """
    SELECT
        t.id, t.subject, t.status, t.priority, t.category, t.team,
        t.assignee_id, t.created_at, t.updated_at,
        u.full_name   AS assignee_name,
        o.name        AS org_name,
        sp.name       AS sla_policy_name,
        tp.confidence
    FROM tickets t
    LEFT JOIN users u  ON u.id  = t.assignee_id
    LEFT JOIN organizations o   ON o.id  = t.org_id
    LEFT JOIN sla_policies sp   ON sp.id = t.sla_policy_id
    LEFT JOIN LATERAL (
        SELECT confidence FROM ticket_predictions
        WHERE ticket_id = t.id ORDER BY created_at DESC LIMIT 1
    ) tp ON true
"""

_ALLOWED_UPDATE_FIELDS = {"status", "priority", "assignee_id", "category", "team"}


def list_tickets(
    conn: Connection,
    page: int,
    per_page: int,
    status: Optional[str],
    priority: Optional[str],
    assignee: Optional[str],
    assignee_id: Optional[str],
    category: Optional[str],
    team: Optional[str],
    created_from: Optional[date],
    created_to: Optional[date],
    updated_before: Optional[datetime],
    sort_by: str,
    sort_order: str,
) -> tuple[int, list[dict]]:
    # Whitelist sort params — never interpolated from raw user input
    if sort_by not in _ALLOWED_SORT_COLUMNS:
        sort_by = "created_at"
    if sort_order not in _ALLOWED_SORT_ORDERS:
        sort_order = "desc"

    where_clauses: list[str] = []
    params: list = []

    if status is not None:
        where_clauses.append("t.status = %s")
        params.append(status)
    if priority is not None:
        if priority == "high_critical":
            where_clauses.append("t.priority IN ('high', 'critical')")
        else:
            where_clauses.append("t.priority = %s")
            params.append(priority)
    if assignee == "unassigned":
        where_clauses.append("t.assignee_id IS NULL")
    elif assignee is not None:
        where_clauses.append("t.assignee_id = %s")
        params.append(assignee)
    elif assignee_id is not None:
        where_clauses.append("t.assignee_id = %s")
        params.append(assignee_id)
    if category is not None:
        where_clauses.append("t.category = %s")
        params.append(category)
    if team is not None:
        where_clauses.append("t.team = %s")
        params.append(team)
    if created_from is not None:
        where_clauses.append("t.created_at::date >= %s")
        params.append(created_from)
    if created_to is not None:
        where_clauses.append("t.created_at::date <= %s")
        params.append(created_to)
    if updated_before is not None:
        where_clauses.append("t.updated_at <= %s")
        params.append(updated_before)

    where_sql = " AND ".join(where_clauses) if where_clauses else "TRUE"

    # Single query: window function replaces separate COUNT(*) query
    query_sql = (
        "SELECT *, COUNT(*) OVER() AS total_count FROM (\n"
        + _TICKET_SELECT
        + f"    WHERE {where_sql}\n"
        + ") sub\n"
        + f"ORDER BY {sort_by} {sort_order}\n"
        + "LIMIT %s OFFSET %s"
    )
    page_params = params + [per_page, (page - 1) * per_page]
    rows = conn.execute(query_sql, page_params).fetchall()
    total = rows[0]["total_count"] if rows else 0
    return total, rows


def get_ticket(conn: Connection, ticket_id: str) -> Optional[dict]:
    return conn.execute(
        _TICKET_SELECT + "WHERE t.id = %s", [ticket_id]
    ).fetchone()


def get_ticket_messages(conn: Connection, ticket_id: str) -> list[dict]:
    return conn.execute(
        """
        SELECT
            m.id, m.sender_id, m.sender_type, m.body, m.is_internal, m.created_at,
            u.full_name AS sender_name
        FROM ticket_messages m
        LEFT JOIN users u ON u.id = m.sender_id
        WHERE m.ticket_id = %s
        ORDER BY m.created_at ASC
        """,
        [ticket_id],
    ).fetchall()


def get_ticket_triage_context(conn: Connection, ticket_id: str) -> Optional[dict]:
    return conn.execute(
        """
        SELECT
            t.id,
            t.subject,
            COALESCE(
                (
                    SELECT tm.body
                    FROM ticket_messages tm
                    WHERE tm.ticket_id = t.id
                      AND tm.sender_type = 'customer'
                      AND tm.is_internal = FALSE
                    ORDER BY tm.created_at ASC
                    LIMIT 1
                ),
                (
                    SELECT tm.body
                    FROM ticket_messages tm
                    WHERE tm.ticket_id = t.id
                    ORDER BY tm.created_at ASC
                    LIMIT 1
                )
            ) AS first_message_body
        FROM tickets t
        WHERE t.id = %s
        """,
        [ticket_id],
    ).fetchone()


def get_active_prompt_version(conn: Connection, prompt_type: str) -> Optional[dict]:
    return conn.execute(
        """
        SELECT id, name, type, content, is_active, created_at, updated_at
        FROM prompt_versions
        WHERE type = %s AND is_active = TRUE
        LIMIT 1
        """,
        [prompt_type],
    ).fetchone()


def get_latest_prediction(conn: Connection, ticket_id: str) -> Optional[dict]:
    return conn.execute(
        """
        SELECT
            id, ticket_id, prompt_version_id, predicted_category, predicted_priority,
            predicted_team, escalation_suggested, escalation_reason, confidence,
            latency_ms, token_usage, estimated_cost_cents, created_at
        FROM ticket_predictions
        WHERE ticket_id = %s
        ORDER BY created_at DESC
        LIMIT 1
        """,
        [ticket_id],
    ).fetchone()


def get_latest_draft(conn: Connection, ticket_id: str) -> Optional[dict]:
    return conn.execute(
        """
        SELECT
            id, body, evidence_chunk_ids, confidence, unresolved_questions,
            send_ready, approval_outcome, created_at
        FROM draft_generations
        WHERE ticket_id = %s
        ORDER BY created_at DESC
        LIMIT 1
        """,
        [ticket_id],
    ).fetchone()


def get_ticket_assignments(conn: Connection, ticket_id: str) -> list[dict]:
    return conn.execute(
        """
        SELECT id, assigned_to, assigned_by, team, created_at
        FROM ticket_assignments
        WHERE ticket_id = %s
        ORDER BY created_at ASC
        """,
        [ticket_id],
    ).fetchall()


_TICKET_DETAIL_SQL = """
    WITH msgs AS (
        SELECT COALESCE(json_agg(
            json_build_object(
                'id', m.id,
                'sender_id', m.sender_id,
                'sender_type', m.sender_type,
                'body', m.body,
                'is_internal', m.is_internal,
                'created_at', m.created_at,
                'sender_name', u.full_name
            ) ORDER BY m.created_at ASC
        ), '[]'::json) AS data
        FROM ticket_messages m
        LEFT JOIN users u ON u.id = m.sender_id
        WHERE m.ticket_id = %s
    ),
    pred AS (
        SELECT
            id, predicted_category, predicted_priority,
            predicted_team, escalation_suggested, escalation_reason, confidence,
            created_at
        FROM ticket_predictions
        WHERE ticket_id = %s
        ORDER BY created_at DESC
        LIMIT 1
    ),
    drft AS (
        SELECT
            id, body, evidence_chunk_ids, confidence, unresolved_questions,
            send_ready, approval_outcome, created_at
        FROM draft_generations
        WHERE ticket_id = %s
        ORDER BY created_at DESC
        LIMIT 1
    ),
    assigns AS (
        SELECT COALESCE(json_agg(
            json_build_object(
                'id', a.id,
                'assigned_to', a.assigned_to,
                'assigned_by', a.assigned_by,
                'team', a.team,
                'created_at', a.created_at
            ) ORDER BY a.created_at ASC
        ), '[]'::json) AS data
        FROM ticket_assignments a
        WHERE a.ticket_id = %s
    )
    SELECT
        t.id, t.subject, t.status, t.priority, t.category, t.team,
        t.assignee_id, t.created_at, t.updated_at,
        u.full_name   AS assignee_name,
        o.name        AS org_name,
        sp.name       AS sla_policy_name,
        (SELECT pred.confidence FROM pred) AS confidence,
        msgs.data     AS messages,
        (SELECT row_to_json(pred.*) FROM pred) AS latest_prediction,
        (SELECT row_to_json(drft.*) FROM drft) AS latest_draft,
        assigns.data  AS assignments
    FROM tickets t
    LEFT JOIN users u  ON u.id  = t.assignee_id
    LEFT JOIN organizations o   ON o.id  = t.org_id
    LEFT JOIN sla_policies sp   ON sp.id = t.sla_policy_id
    CROSS JOIN msgs
    CROSS JOIN assigns
    WHERE t.id = %s
"""


def get_ticket_detail(conn: Connection, ticket_id: str) -> Optional[dict]:
    """Fetch ticket + messages + prediction + draft + assignments in one query."""
    return conn.execute(
        _TICKET_DETAIL_SQL,
        [ticket_id] * 5,
    ).fetchone()


def insert_ticket_prediction(
    conn: Connection,
    ticket_id: str,
    prompt_version_id: str,
    predicted_category: str,
    predicted_priority: str,
    predicted_team: str,
    escalation_suggested: bool,
    escalation_reason: Optional[str],
    confidence: float,
    latency_ms: Optional[int],
    token_usage: dict,
    estimated_cost_cents: Optional[float],
) -> dict:
    return conn.execute(
        """
        INSERT INTO ticket_predictions (
            ticket_id,
            prompt_version_id,
            predicted_category,
            predicted_priority,
            predicted_team,
            escalation_suggested,
            escalation_reason,
            confidence,
            latency_ms,
            token_usage,
            estimated_cost_cents
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        RETURNING
            id, ticket_id, prompt_version_id, predicted_category, predicted_priority,
            predicted_team, escalation_suggested, escalation_reason, confidence,
            latency_ms, token_usage, estimated_cost_cents, created_at
        """,
        [
            ticket_id,
            prompt_version_id,
            predicted_category,
            predicted_priority,
            predicted_team,
            escalation_suggested,
            escalation_reason,
            confidence,
            latency_ms,
            Jsonb(token_usage),
            estimated_cost_cents,
        ],
    ).fetchone()


def update_ticket(conn: Connection, ticket_id: str, updates: dict) -> Optional[dict]:
    set_clauses: list[str] = []
    params: list = []

    for field, value in updates.items():
        if field not in _ALLOWED_UPDATE_FIELDS:
            continue
        set_clauses.append(f"{field} = %s")
        # UUID values must be stringified for psycopg enum columns
        params.append(str(value) if hasattr(value, "hex") else value)

    if not set_clauses:
        return get_ticket(conn, ticket_id)

    set_clauses.append("updated_at = now()")
    params.append(ticket_id)

    result = conn.execute(
        f"UPDATE tickets SET {', '.join(set_clauses)} WHERE id = %s RETURNING id",
        params,
    ).fetchone()
    return result  # {id: UUID} or None; caller uses get_ticket_detail for full data


def insert_message(
    conn: Connection,
    ticket_id: str,
    sender_id: str,
    sender_type: str,
    body: str,
    is_internal: bool,
) -> dict:
    row = conn.execute(
        """
        INSERT INTO ticket_messages (ticket_id, sender_id, sender_type, body, is_internal)
        VALUES (%s, %s, %s, %s, %s)
        RETURNING id, sender_id, sender_type, body, is_internal, created_at
        """,
        [ticket_id, sender_id, sender_type, body, is_internal],
    ).fetchone()

    # Fetch sender name (dict_row returns a Mapping — copy to plain dict for mutation)
    row = dict(row)
    if row["sender_id"]:
        user = conn.execute(
            "SELECT full_name FROM users WHERE id = %s", [row["sender_id"]]
        ).fetchone()
        row["sender_name"] = user["full_name"] if user else None
    else:
        row["sender_name"] = None

    return row


def insert_draft(
    conn: Connection,
    ticket_id: str,
    prompt_version_id: str,
    body: str,
    evidence_chunk_ids: list,
    confidence: float,
    unresolved_questions: list[str],
    send_ready: bool,
    latency_ms: Optional[int],
    token_usage: dict,
    estimated_cost_cents: Optional[float],
) -> dict:
    return conn.execute(
        """
        INSERT INTO draft_generations (
            ticket_id, prompt_version_id, body, evidence_chunk_ids,
            confidence, unresolved_questions, send_ready, latency_ms,
            token_usage, estimated_cost_cents, approval_outcome
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'pending')
        RETURNING
            id, ticket_id, prompt_version_id, body, evidence_chunk_ids,
            confidence, unresolved_questions, send_ready, latency_ms,
            token_usage, estimated_cost_cents, approval_outcome, created_at
        """,
        [
            ticket_id,
            prompt_version_id,
            body,
            evidence_chunk_ids,
            confidence,
            unresolved_questions,
            send_ready,
            latency_ms,
            Jsonb(token_usage),
            estimated_cost_cents,
        ],
    ).fetchone()


def get_ticket_stats(conn: Connection) -> dict:
    rows = conn.execute(
        """
        SELECT
            COUNT(*)                                            AS total,
            COUNT(*) FILTER (WHERE status = 'new')             AS status_new,
            COUNT(*) FILTER (WHERE status = 'open')            AS status_open,
            COUNT(*) FILTER (WHERE status = 'pending_customer') AS status_pending_customer,
            COUNT(*) FILTER (WHERE status = 'pending_internal') AS status_pending_internal,
            COUNT(*) FILTER (WHERE status = 'resolved')        AS status_resolved,
            COUNT(*) FILTER (WHERE status = 'closed')          AS status_closed,
            COUNT(*) FILTER (WHERE priority = 'low')           AS priority_low,
            COUNT(*) FILTER (WHERE priority = 'medium')        AS priority_medium,
            COUNT(*) FILTER (WHERE priority = 'high')          AS priority_high,
            COUNT(*) FILTER (WHERE priority = 'critical')      AS priority_critical
        FROM tickets
        """
    ).fetchone()
    return {
        "total": rows["total"],
        "by_status": {
            "new": rows["status_new"],
            "open": rows["status_open"],
            "pending_customer": rows["status_pending_customer"],
            "pending_internal": rows["status_pending_internal"],
            "resolved": rows["status_resolved"],
            "closed": rows["status_closed"],
        },
        "by_priority": {
            "low": rows["priority_low"],
            "medium": rows["priority_medium"],
            "high": rows["priority_high"],
            "critical": rows["priority_critical"],
        },
    }


def assign_ticket(
    conn: Connection,
    ticket_id: str,
    assignee_id: str,
    assigned_by: str,
    team: Optional[str],
) -> Optional[dict]:
    result = conn.execute(
        """
        UPDATE tickets
        SET assignee_id = %s,
            team = COALESCE(%s::team_name, team),
            updated_at = now()
        WHERE id = %s
        RETURNING id
        """,
        [assignee_id, team, ticket_id],
    ).fetchone()
    if result is None:
        return None
    conn.execute(
        """
        INSERT INTO ticket_assignments (ticket_id, assigned_to, assigned_by, team)
        VALUES (%s, %s, %s, %s)
        """,
        [ticket_id, assignee_id, assigned_by, team],
    )
    return result  # {id: UUID}; caller uses get_ticket_detail for full data
