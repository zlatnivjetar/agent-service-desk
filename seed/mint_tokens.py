#!/usr/bin/env python3
"""
Mint short-lived JWTs for the three demo users.
Run from repo root:  python seed/mint_tokens.py

Reads JWT_SECRET from api/.env.local automatically.
"""
import os
import sys
import time
from pathlib import Path

try:
    import jwt
except ImportError:
    sys.exit("Missing pyjwt — run: pip install pyjwt  (or activate the api venv)")

# ---------------------------------------------------------------------------
# Read JWT_SECRET from api/.env.local
# ---------------------------------------------------------------------------
env_path = Path(__file__).parent.parent / "api" / ".env.local"
secret = None
for line in env_path.read_text().splitlines():
    if line.startswith("JWT_SECRET="):
        secret = line.split("=", 1)[1].strip()
        break
if not secret:
    sys.exit("JWT_SECRET not found in api/.env.local")

# ---------------------------------------------------------------------------
# Demo user data  (matches demo_accounts.py + memory notes)
# ---------------------------------------------------------------------------
ORG_ID  = "3eb13b90-4668-4257-bdd6-40fb06671ad1"
WS_ID   = "093923de-8bab-4e3b-a628-6bfbe767dcea"

USERS = [
    ("agent",  "00000000-0000-4000-a000-000000000001", "support_agent"),
    ("lead",   "00000000-0000-4000-a000-000000000002", "team_lead"),
    ("client", "00000000-0000-4000-a000-000000000003", "client_user"),
]

# ---------------------------------------------------------------------------
# Mint & print
# ---------------------------------------------------------------------------
exp = int(time.time()) + 3600  # 1 hour

for name, user_id, role in USERS:
    payload = {
        "user_id": user_id,
        "org_id": ORG_ID,
        "workspace_id": WS_ID,
        "role": role,
        "exp": exp,
    }
    token = jwt.encode(payload, secret, algorithm="HS256")
    print(f"\n# {name} ({role})")
    print(f"export {name.upper()}_JWT={token}")
