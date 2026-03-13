from collections.abc import Generator
from typing import Annotated

import psycopg
from fastapi import Depends

from app.auth import CurrentUser, get_current_user
from app.db import pool


def get_rls_db(
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
) -> Generator[psycopg.Connection, None, None]:
    """FastAPI dependency that yields a connection with RLS session variables set.
    ALL user-facing route handlers must use this — never bare get_db()."""
    with pool.connection() as conn:
        with conn.transaction():
            conn.execute("SET LOCAL ROLE rls_user")
            conn.execute(
                "SELECT set_config('app.org_id', %s, TRUE), "
                "set_config('app.workspace_id', %s, TRUE), "
                "set_config('app.user_id', %s, TRUE), "
                "set_config('app.user_role', %s, TRUE)",
                (
                    current_user.org_id,
                    current_user.workspace_id,
                    current_user.user_id,
                    current_user.role,
                ),
            )
            yield conn
