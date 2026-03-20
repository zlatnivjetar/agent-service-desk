from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Optional
from urllib.parse import urlencode

from psycopg import Connection
from psycopg.types.json import Jsonb

OPEN_WORK_QUEUE_STATUSES = (
    "new",
    "open",
    "pending_customer",
    "pending_internal",
)

AGE_BUCKETS = ("0_1d", "2_3d", "4_7d", "8_14d", "15d_plus")
PREFERENCE_FIELDS = {
    "landing_page",
    "time_zone",
    "overview_density",
    "tickets_density",
    "overview_visible_columns",
    "tickets_visible_columns",
    "overview_auto_refresh_seconds",
    "tickets_auto_refresh_seconds",
    "overview_default_view_id",
    "tickets_default_view_id",
}


def _ticket_scope_sql(
    start_date: date,
    end_date: date,
    team: Optional[str],
    assignee_id: Optional[str],
    *,
    table_alias: str = "t",
    include_created_range: bool = True,
) -> tuple[str, list]:
    clauses: list[str] = []
    params: list = []

    if include_created_range:
        clauses.append(f"{table_alias}.created_at::date BETWEEN %s AND %s")
        params.extend([start_date, end_date])
    if team is not None:
        clauses.append(f"{table_alias}.team = %s")
        params.append(team)
    if assignee_id is not None:
        clauses.append(f"{table_alias}.assignee_id = %s")
        params.append(assignee_id)

    return (" AND ".join(clauses) if clauses else "TRUE"), params


def _build_href(path: str, params: dict[str, object | None]) -> str:
    encoded = urlencode(
        {
            key: value
            for key, value in params.items()
            if value is not None and value != ""
        }
    )
    return f"{path}?{encoded}" if encoded else path


def _iso(dt: datetime) -> str:
    return dt.replace(microsecond=0).isoformat().replace("+00:00", "Z")


def get_or_create_dashboard_preferences(conn: Connection) -> dict:
    conn.execute(
        """
        INSERT INTO dashboard_preferences (user_id, workspace_id)
        VALUES (current_user_id(), current_workspace_id())
        ON CONFLICT (user_id) DO NOTHING
        """
    )
    return conn.execute(
        """
        SELECT
            landing_page,
            time_zone,
            overview_density,
            tickets_density,
            overview_visible_columns,
            tickets_visible_columns,
            overview_auto_refresh_seconds,
            tickets_auto_refresh_seconds,
            overview_default_view_id,
            tickets_default_view_id
        FROM dashboard_preferences
        WHERE user_id = current_user_id()
          AND workspace_id = current_workspace_id()
        """
    ).fetchone()


def update_dashboard_preferences(conn: Connection, updates: dict) -> dict:
    set_clauses: list[str] = []
    params: list = []

    for field, value in updates.items():
        if field not in PREFERENCE_FIELDS:
            continue
        set_clauses.append(f"{field} = %s")
        params.append(value)

    if not set_clauses:
        return get_or_create_dashboard_preferences(conn)

    conn.execute(
        """
        INSERT INTO dashboard_preferences (user_id, workspace_id)
        VALUES (current_user_id(), current_workspace_id())
        ON CONFLICT (user_id) DO NOTHING
        """
    )
    conn.execute(
        f"""
        UPDATE dashboard_preferences
        SET {", ".join(set_clauses)}
        WHERE user_id = current_user_id()
          AND workspace_id = current_workspace_id()
        """,
        params,
    )
    return get_or_create_dashboard_preferences(conn)


def list_dashboard_saved_views(conn: Connection, page: str) -> list[dict]:
    return conn.execute(
        """
        SELECT id, page, name, state, created_at, updated_at
        FROM dashboard_saved_views
        WHERE user_id = current_user_id()
          AND workspace_id = current_workspace_id()
          AND page = %s
        ORDER BY lower(name), created_at ASC
        """,
        [page],
    ).fetchall()


def get_dashboard_saved_view(conn: Connection, view_id: str) -> Optional[dict]:
    return conn.execute(
        """
        SELECT id, page, name, state, created_at, updated_at
        FROM dashboard_saved_views
        WHERE id = %s
          AND user_id = current_user_id()
          AND workspace_id = current_workspace_id()
        """,
        [view_id],
    ).fetchone()


def create_dashboard_saved_view(
    conn: Connection, page: str, name: str, state: dict
) -> dict:
    return conn.execute(
        """
        INSERT INTO dashboard_saved_views (user_id, workspace_id, page, name, state)
        VALUES (current_user_id(), current_workspace_id(), %s, %s, %s)
        RETURNING id, page, name, state, created_at, updated_at
        """,
        [page, name, Jsonb(state)],
    ).fetchone()


def update_dashboard_saved_view(conn: Connection, view_id: str, updates: dict) -> Optional[dict]:
    set_clauses: list[str] = []
    params: list = []

    if "name" in updates:
        set_clauses.append("name = %s")
        params.append(updates["name"])
    if "state" in updates:
        set_clauses.append("state = %s")
        params.append(Jsonb(updates["state"]))

    if not set_clauses:
        return get_dashboard_saved_view(conn, view_id)

    set_clauses.append("updated_at = now()")
    params.append(view_id)

    row = conn.execute(
        f"""
        UPDATE dashboard_saved_views
        SET {", ".join(set_clauses)}
        WHERE id = %s
          AND user_id = current_user_id()
          AND workspace_id = current_workspace_id()
        RETURNING id, page, name, state, created_at, updated_at
        """,
        params,
    ).fetchone()
    return row


def delete_dashboard_saved_view(conn: Connection, view_id: str) -> bool:
    row = conn.execute(
        """
        DELETE FROM dashboard_saved_views
        WHERE id = %s
          AND user_id = current_user_id()
          AND workspace_id = current_workspace_id()
        RETURNING id
        """,
        [view_id],
    ).fetchone()
    if row is None:
        return False

    conn.execute(
        """
        UPDATE dashboard_preferences
        SET
            overview_default_view_id = CASE
                WHEN overview_default_view_id = %s::uuid THEN NULL
                ELSE overview_default_view_id
            END,
            tickets_default_view_id = CASE
                WHEN tickets_default_view_id = %s::uuid THEN NULL
                ELSE tickets_default_view_id
            END
        WHERE user_id = current_user_id()
          AND workspace_id = current_workspace_id()
        """,
        [view_id, view_id],
    )
    return True


def get_overview_data(
    conn: Connection,
    start_date: date,
    end_date: date,
    team: Optional[str],
    assignee_id: Optional[str],
    *,
    include_eval: bool,
) -> dict:
    ticket_scope_sql, ticket_scope_params = _ticket_scope_sql(
        start_date, end_date, team, assignee_id
    )

    open_count = conn.execute(
        f"""
        SELECT COUNT(*)::int AS count
        FROM tickets t
        WHERE {ticket_scope_sql}
          AND t.status = ANY(%s)
        """,
        ticket_scope_params + [list(OPEN_WORK_QUEUE_STATUSES)],
    ).fetchone()["count"]

    pending_review_count = conn.execute(
        f"""
        SELECT COUNT(*)::int AS count
        FROM draft_generations dg
        JOIN tickets t ON t.id = dg.ticket_id
        WHERE {ticket_scope_sql}
          AND (dg.approval_outcome IS NULL OR dg.approval_outcome = 'pending')
        """,
        ticket_scope_params,
    ).fetchone()["count"]

    unassigned_high_critical_count = conn.execute(
        f"""
        SELECT COUNT(*)::int AS count
        FROM tickets t
        WHERE {ticket_scope_sql}
          AND t.status = ANY(%s)
          AND t.priority IN ('high', 'critical')
          AND t.assignee_id IS NULL
        """,
        ticket_scope_params + [list(OPEN_WORK_QUEUE_STATUSES)],
    ).fetchone()["count"]

    knowledge_issue_count = conn.execute(
        """
        SELECT (
            COUNT(*) FILTER (WHERE status = 'failed')
            + COUNT(*) FILTER (
                WHERE status = 'processing'
                  AND created_at <= now() - interval '15 minutes'
            )
        )::int AS count
        FROM knowledge_documents
        """
    ).fetchone()["count"]

    latest_eval_summary = None
    if include_eval:
        latest_eval_summary = conn.execute(
            """
            SELECT
                er.id AS run_id,
                es.name AS eval_set_name,
                pv.name AS prompt_version_name,
                er.status,
                (er.metrics->>'accuracy')::float AS accuracy,
                er.failed,
                er.created_at
            FROM eval_runs er
            JOIN eval_sets es ON es.id = er.eval_set_id
            JOIN prompt_versions pv ON pv.id = er.prompt_version_id
            ORDER BY er.created_at DESC
            LIMIT 1
            """
        ).fetchone()

    created_series_scope_sql, created_series_scope_params = _ticket_scope_sql(
        start_date,
        end_date,
        team,
        assignee_id,
        include_created_range=False,
    )
    created_by_day_rows = conn.execute(
        f"""
        WITH days AS (
            SELECT generate_series(%s::date, %s::date, interval '1 day')::date AS day
        )
        SELECT
            d.day AS date,
            COUNT(t.id)::int AS count
        FROM days d
        LEFT JOIN tickets t
          ON t.created_at::date = d.day
         AND {created_series_scope_sql}
        GROUP BY d.day
        ORDER BY d.day
        """,
        [start_date, end_date] + created_series_scope_params,
    ).fetchall()

    backlog_rows = conn.execute(
        f"""
        SELECT status, COUNT(*)::int AS count
        FROM tickets t
        WHERE {ticket_scope_sql}
          AND t.status = ANY(%s)
        GROUP BY status
        """,
        ticket_scope_params + [list(OPEN_WORK_QUEUE_STATUSES)],
    ).fetchall()
    backlog_by_status = {status: 0 for status in OPEN_WORK_QUEUE_STATUSES}
    for row in backlog_rows:
        backlog_by_status[row["status"]] = row["count"]

    age_rows = conn.execute(
        f"""
        SELECT
            CASE
                WHEN current_date - t.created_at::date <= 1 THEN '0_1d'
                WHEN current_date - t.created_at::date <= 3 THEN '2_3d'
                WHEN current_date - t.created_at::date <= 7 THEN '4_7d'
                WHEN current_date - t.created_at::date <= 14 THEN '8_14d'
                ELSE '15d_plus'
            END AS bucket,
            COUNT(*) FILTER (WHERE t.priority = 'low')::int AS low,
            COUNT(*) FILTER (WHERE t.priority = 'medium')::int AS medium,
            COUNT(*) FILTER (WHERE t.priority = 'high')::int AS high,
            COUNT(*) FILTER (WHERE t.priority = 'critical')::int AS critical
        FROM tickets t
        WHERE {ticket_scope_sql}
          AND t.status = ANY(%s)
        GROUP BY bucket
        """,
        ticket_scope_params + [list(OPEN_WORK_QUEUE_STATUSES)],
    ).fetchall()
    age_by_priority = {
        bucket: {"bucket": bucket, "low": 0, "medium": 0, "high": 0, "critical": 0}
        for bucket in AGE_BUCKETS
    }
    for row in age_rows:
        age_by_priority[row["bucket"]] = {
            "bucket": row["bucket"],
            "low": row["low"],
            "medium": row["medium"],
            "high": row["high"],
            "critical": row["critical"],
        }

    return {
        "generated_at": datetime.now(timezone.utc),
        "kpis": {
            "open_work_queue_count": open_count,
            "pending_review_count": pending_review_count,
            "unassigned_high_critical_count": unassigned_high_critical_count,
            "knowledge_issue_count": knowledge_issue_count,
            "latest_eval_summary": latest_eval_summary,
        },
        "charts": {
            "tickets_created_by_day": created_by_day_rows,
            "backlog_by_status": [
                {"status": status, "count": backlog_by_status[status]}
                for status in OPEN_WORK_QUEUE_STATUSES
            ],
            "age_by_priority": [age_by_priority[bucket] for bucket in AGE_BUCKETS],
        },
    }


def get_watchlist_items(
    conn: Connection,
    start_date: date,
    end_date: date,
    team: Optional[str],
    assignee_id: Optional[str],
    *,
    include_eval: bool,
) -> list[dict]:
    items: list[dict] = []
    ticket_scope_sql, ticket_scope_params = _ticket_scope_sql(
        start_date, end_date, team, assignee_id
    )

    unassigned_high_critical = conn.execute(
        f"""
        SELECT COUNT(*)::int AS count
        FROM tickets t
        WHERE {ticket_scope_sql}
          AND t.status = ANY(%s)
          AND t.priority IN ('high', 'critical')
          AND t.assignee_id IS NULL
        """,
        ticket_scope_params + [list(OPEN_WORK_QUEUE_STATUSES)],
    ).fetchone()["count"]
    if unassigned_high_critical > 0:
        items.append(
            {
                "key": "unassigned_high_critical",
                "title": "Unassigned high-priority queue",
                "count": unassigned_high_critical,
                "severity": "critical",
                "reason": "High and critical tickets are unassigned in the open work queue.",
                "href": _build_href(
                    "/tickets",
                    {
                        "range": "custom",
                        "from": start_date.isoformat(),
                        "to": end_date.isoformat(),
                        "team": team,
                        "priority": "high_critical",
                        "assignee": "unassigned",
                        "sort_by": "created_at",
                        "sort_order": "asc",
                    },
                ),
            }
        )

    stale_cutoff = datetime.now(timezone.utc) - timedelta(hours=24)
    stale_pending_internal = conn.execute(
        f"""
        SELECT COUNT(*)::int AS count
        FROM tickets t
        WHERE {ticket_scope_sql}
          AND t.status = 'pending_internal'
          AND t.updated_at <= %s
        """,
        ticket_scope_params + [stale_cutoff],
    ).fetchone()["count"]
    if stale_pending_internal > 0:
        items.append(
            {
                "key": "stale_pending_internal",
                "title": "Pending internal follow-ups are stale",
                "count": stale_pending_internal,
                "severity": "warning",
                "reason": "Tickets have been pending internal action for more than 24 hours.",
                "href": _build_href(
                    "/tickets",
                    {
                        "range": "custom",
                        "from": start_date.isoformat(),
                        "to": end_date.isoformat(),
                        "team": team,
                        "assignee": assignee_id,
                        "status": "pending_internal",
                        "updated_before": _iso(stale_cutoff),
                        "sort_by": "updated_at",
                        "sort_order": "asc",
                    },
                ),
            }
        )

    low_confidence_cutoff = datetime.now(timezone.utc) - timedelta(hours=1)
    low_confidence_reviews = conn.execute(
        f"""
        SELECT COUNT(*)::int AS count
        FROM draft_generations dg
        JOIN tickets t ON t.id = dg.ticket_id
        WHERE {ticket_scope_sql}
          AND (dg.approval_outcome IS NULL OR dg.approval_outcome = 'pending')
          AND dg.confidence < 0.70
          AND dg.created_at <= %s
        """,
        ticket_scope_params + [low_confidence_cutoff],
    ).fetchone()["count"]
    if low_confidence_reviews > 0:
        items.append(
            {
                "key": "low_confidence_reviews",
                "title": "Low-confidence drafts need review",
                "count": low_confidence_reviews,
                "severity": "warning",
                "reason": "Pending drafts below 70% confidence have been waiting for more than 60 minutes.",
                "href": _build_href(
                    "/reviews",
                    {
                        "confidence_max": "0.7",
                        "created_before": _iso(low_confidence_cutoff),
                        "sort_by": "confidence",
                        "sort_order": "asc",
                    },
                ),
            }
        )

    knowledge_failed = conn.execute(
        """
        SELECT COUNT(*)::int AS count
        FROM knowledge_documents
        WHERE status = 'failed'
        """
    ).fetchone()["count"]
    if knowledge_failed > 0:
        items.append(
            {
                "key": "knowledge_failed",
                "title": "Knowledge ingestion failures",
                "count": knowledge_failed,
                "severity": "critical",
                "reason": "Some knowledge documents failed to index and need intervention.",
                "href": "/knowledge?status=failed",
            }
        )

    knowledge_stalled = conn.execute(
        """
        SELECT COUNT(*)::int AS count
        FROM knowledge_documents
        WHERE status = 'processing'
          AND created_at <= now() - interval '15 minutes'
        """
    ).fetchone()["count"]
    if knowledge_stalled > 0:
        items.append(
            {
                "key": "knowledge_stalled",
                "title": "Knowledge ingestion is stalled",
                "count": knowledge_stalled,
                "severity": "warning",
                "reason": "Processing documents have been stuck for more than 15 minutes.",
                "href": "/knowledge?status=processing&stalled=true",
            }
        )

    if include_eval:
        eval_item = _get_eval_watchlist_item(conn)
        if eval_item is not None:
            items.append(eval_item)

    severity_order = {"critical": 0, "warning": 1, "info": 2}
    items.sort(key=lambda item: (severity_order[item["severity"]], -item["count"]))
    return items


def _get_eval_watchlist_item(conn: Connection) -> Optional[dict]:
    latest_failed = conn.execute(
        """
        SELECT
            er.id,
            er.created_at,
            es.name AS eval_set_name
        FROM eval_runs er
        JOIN eval_sets es ON es.id = er.eval_set_id
        WHERE er.status = 'failed'
        ORDER BY er.created_at DESC
        LIMIT 1
        """
    ).fetchone()

    latest_completed = conn.execute(
        """
        SELECT
            er.id,
            er.eval_set_id,
            er.created_at,
            es.name AS eval_set_name,
            (er.metrics->>'accuracy')::float AS accuracy
        FROM eval_runs er
        JOIN eval_sets es ON es.id = er.eval_set_id
        WHERE er.status = 'completed'
        ORDER BY er.created_at DESC
        LIMIT 1
        """
    ).fetchone()

    regression_item = None
    if latest_completed is not None and latest_completed["accuracy"] is not None:
        previous_completed = conn.execute(
            """
            SELECT
                (metrics->>'accuracy')::float AS accuracy
            FROM eval_runs
            WHERE status = 'completed'
              AND eval_set_id = %s
              AND created_at < %s
            ORDER BY created_at DESC
            LIMIT 1
            """,
            [latest_completed["eval_set_id"], latest_completed["created_at"]],
        ).fetchone()
        if (
            previous_completed is not None
            and previous_completed["accuracy"] is not None
            and previous_completed["accuracy"] - latest_completed["accuracy"] >= 0.03
        ):
            drop = previous_completed["accuracy"] - latest_completed["accuracy"]
            regression_item = {
                "key": "eval_failed_or_regressed",
                "title": "Eval accuracy regressed",
                "count": 1,
                "severity": "warning",
                "reason": f"{latest_completed['eval_set_name']} dropped by {(drop * 100):.1f} percentage points.",
                "href": "/evals?tab=runs",
                "created_at": latest_completed["created_at"],
            }

    if latest_failed is None and regression_item is None:
        return None

    if latest_failed is not None and (
        regression_item is None or latest_failed["created_at"] >= regression_item["created_at"]
    ):
        return {
            "key": "eval_failed_or_regressed",
            "title": "Latest eval run failed",
            "count": 1,
            "severity": "critical",
            "reason": f"{latest_failed['eval_set_name']} has a failed run that needs investigation.",
            "href": "/evals?tab=runs",
        }

    regression_item.pop("created_at", None)
    return regression_item
