from psycopg import Connection


def list_workspace_users(conn: Connection) -> list[dict]:
    return conn.execute(
        """
        SELECT u.id, u.full_name, u.email, wm.role
        FROM users u
        JOIN workspace_memberships wm ON wm.user_id = u.id
        WHERE wm.workspace_id = current_setting('app.workspace_id')::uuid
        ORDER BY u.full_name
        """,
    ).fetchall()
