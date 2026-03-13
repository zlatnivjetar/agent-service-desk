#!/usr/bin/env python3
"""Drop and recreate the public schema. Use before db-push for a clean slate."""
import os, sys
import psycopg

db_url = os.environ.get("DATABASE_URL")
if not db_url:
    print("ERROR: DATABASE_URL environment variable is required.")
    sys.exit(1)

print("Dropping and recreating public schema...")
conn = psycopg.connect(db_url)
conn.autocommit = True
with conn.cursor() as cur:
    cur.execute("DROP SCHEMA public CASCADE")
    cur.execute("CREATE SCHEMA public")
conn.close()
print("Schema reset. Run db-push next.")
