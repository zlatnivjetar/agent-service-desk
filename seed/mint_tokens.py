#!/usr/bin/env python3
"""
Mint short-lived JWTs for the three demo users.
Run from repo root:  python seed/mint_tokens.py

Reads JWT_SECRET and DATABASE_URL from api/.env.local automatically.
Queries the DB for each user's org_id so agent/lead and client get
different orgs (reflecting the role-aware RLS setup).
"""
import os
import sys
import time
from pathlib import Path

try:
    import jwt
except ImportError:
    sys.exit("Missing pyjwt — run: pip install pyjwt  (or activate the api venv)")

try:
    import psycopg
except ImportError:
    sys.exit("Missing psycopg — activate the api venv")

# ---------------------------------------------------------------------------
# Read JWT_SECRET and DATABASE_URL from api/.env.local
# ---------------------------------------------------------------------------
env_path = Path(__file__).parent.parent / "api" / ".env.local"
secret = None
db_url = None
for line in env_path.read_text().splitlines():
    if line.startswith("JWT_SECRET="):
        secret = line.split("=", 1)[1].strip()
    elif line.startswith("DATABASE_URL="):
        db_url = line.split("=", 1)[1].strip()

if not secret:
    sys.exit("JWT_SECRET not found in api/.env.local")
if not db_url:
    sys.exit("DATABASE_URL not found in api/.env.local")

# ---------------------------------------------------------------------------
# Demo user data  (matches demo_accounts.py)
# ---------------------------------------------------------------------------
USERS = [
    ("agent",  "00000000-0000-4000-a000-000000000001", "support_agent"),
    ("lead",   "00000000-0000-4000-a000-000000000002", "team_lead"),
    ("client", "00000000-0000-4000-a000-000000000003", "client_user"),
]

# ---------------------------------------------------------------------------
# Query each user's org_id and shared workspace_id from the DB
# ---------------------------------------------------------------------------
conn = psycopg.connect(db_url)
cur = conn.cursor()

user_orgs: dict[str, str] = {}
for _, user_id, _ in USERS:
    cur.execute(
        "SELECT org_id FROM memberships WHERE user_id = %s LIMIT 1",
        [user_id],
    )
    row = cur.fetchone()
    if not row:
        conn.close()
        sys.exit(f"No membership found for user {user_id}. Run seed/demo_accounts.py first.")
    user_orgs[user_id] = str(row[0])

# All demo users share Workspace #1 (the support provider workspace)
cur.execute(
    "SELECT workspace_id FROM workspace_memberships WHERE user_id = %s LIMIT 1",
    [USERS[0][1]],  # agent is always in Workspace #1
)
ws_row = cur.fetchone()
if not ws_row:
    conn.close()
    sys.exit("No workspace membership found for agent. Run seed/demo_accounts.py first.")
ws_id = str(ws_row[0])
conn.close()

# ---------------------------------------------------------------------------
# Mint & print
# ---------------------------------------------------------------------------
exp = int(time.time()) + 3600  # 1 hour

filter_name = sys.argv[1].lower() if len(sys.argv) > 1 else None

for name, user_id, role in USERS:
    payload = {
        "user_id": user_id,
        "org_id": user_orgs[user_id],
        "workspace_id": ws_id,
        "role": role,
        "exp": exp,
    }
    token = jwt.encode(payload, secret, algorithm="HS256")
    if filter_name == name:
        # bare token — suitable for shell variable capture
        print(token)
    elif filter_name is None:
        print(f"\n# {name} ({role})  org={user_orgs[user_id][:8]}...")
        print(f"export {name.upper()}_JWT={token}")
