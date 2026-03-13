#!/usr/bin/env python3
"""Database verification — checks row counts and demo account setup."""
import os, sys
import psycopg

db_url = os.environ.get("DATABASE_URL")
if not db_url:
    print("ERROR: DATABASE_URL environment variable is required.")
    sys.exit(1)

conn = psycopg.connect(db_url)
conn.autocommit = True

print("=== Agent Service Desk — Database Verification ===\n")
print("--- Row counts ---")

tables = [
    "organizations", "users", "workspaces", "memberships",
    "workspace_memberships", "sla_policies", "prompt_versions",
    "tickets", "ticket_messages", "knowledge_documents",
    "knowledge_chunks", "ticket_predictions", "draft_generations",
    "approval_actions", "eval_sets", "eval_examples",
]

counts = {}
with conn.cursor() as cur:
    for t in tables:
        cur.execute(f"SELECT count(*) FROM {t}")
        n = cur.fetchone()[0]
        counts[t] = n
        print(f"  {t:<30} {n:>10,}")

print("\n--- Minimum volume assertions ---")
MINIMUMS = {
    "organizations":    100,
    "users":            250,
    "tickets":        15_000,
    "ticket_messages": 75_000,
    "knowledge_documents": 1_000,
    "knowledge_chunks":  3_000,
    "eval_examples":      150,
    "sla_policies":        10,
    "prompt_versions":      4,
}

all_passed = True
for table, minimum in MINIMUMS.items():
    actual = counts.get(table, 0)
    status = "PASS" if actual >= minimum else "FAIL"
    if status == "FAIL":
        all_passed = False
    print(f"  [{status}] {table}: {actual:,} >= {minimum:,}")

if all_passed:
    print("\n  All minimum count checks PASSED")
else:
    print("\n  Some checks FAILED — see above")

print("\n--- Demo accounts ---")
with conn.cursor() as cur:
    cur.execute("""
        SELECT u.email, wm.role, u.id
        FROM users u
        JOIN workspace_memberships wm ON wm.user_id = u.id
        WHERE u.email LIKE '%@demo.com'
        ORDER BY u.email
    """)
    rows = cur.fetchall()
    if rows:
        for email, role, uid in rows:
            print(f"  {str(email):<25} {str(role):<16} id={uid}")
    else:
        print("  MISSING — run: just db-demo")

print("\n--- RLS role ---")
with conn.cursor() as cur:
    cur.execute("SELECT rolname, rolcanlogin FROM pg_roles WHERE rolname = 'rls_user'")
    row = cur.fetchone()
    if row:
        print(f"  [PASS] rls_user exists (can_login={row[1]})")
    else:
        print("  [FAIL] rls_user role not found")

conn.close()
print("\n=== Verification complete ===")
sys.exit(0 if all_passed else 1)
