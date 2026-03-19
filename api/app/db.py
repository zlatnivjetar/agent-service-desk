from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

from app.config import settings


def _check_connection(conn):
    """Called by the pool before reusing a connection. Discards it if Neon dropped it."""
    conn.execute("SELECT 1")


pool = ConnectionPool(
    conninfo=settings.database_url,
    min_size=1,
    max_size=10,
    open=False,
    timeout=10,  # seconds to wait for a connection from the pool
    check=_check_connection,
    kwargs={"row_factory": dict_row},
)


def get_db():
    """FastAPI dependency — yields a plain (non-RLS) connection from the pool.
    Only use for background/system operations. User-scoped routes must use get_rls_db."""
    with pool.connection() as conn:
        yield conn
