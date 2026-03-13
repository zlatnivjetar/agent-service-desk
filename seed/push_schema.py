#!/usr/bin/env python3
"""Deploy schema.sql to the database. Fallback for environments without psql."""
import os, sys
import psycopg

db_url = os.environ.get("DATABASE_URL")
if not db_url:
    print("ERROR: DATABASE_URL environment variable is required.")
    sys.exit(1)

schema_path = os.path.join(os.path.dirname(__file__), "schema.sql")
schema = open(schema_path).read()

print(f"Deploying schema to database...")
conn = psycopg.connect(db_url)
conn.autocommit = True
with conn.cursor() as cur:
    cur.execute(schema)
conn.close()
print("Schema deployed successfully.")
