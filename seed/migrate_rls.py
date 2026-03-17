#!/usr/bin/env python3
"""
Apply RLS policy migration: make ticket_isolation role-aware and remove
explicit org_id checks from child-table policies (they now rely on ticket
RLS inheritance via EXISTS subqueries).

Run from repo root:
  DATABASE_URL=postgres://... python seed/migrate_rls.py
"""
import os
import sys
import psycopg

db_url = os.environ.get("DATABASE_URL")
if not db_url:
    sys.exit("ERROR: DATABASE_URL environment variable is required.")

MIGRATIONS = [
    # ticket_isolation: role-aware (client by org, agents/leads by workspace)
    """
    ALTER POLICY ticket_isolation ON tickets USING (
        CASE current_user_role()
            WHEN 'client_user' THEN org_id = current_org_id()
            ELSE workspace_id = current_workspace_id()
        END
    )
    """,
    # message_isolation: remove explicit org check; let ticket_isolation handle it
    """
    ALTER POLICY message_isolation ON ticket_messages USING (
        EXISTS (
            SELECT 1 FROM tickets t
            WHERE t.id = ticket_messages.ticket_id
        )
        AND (
            current_user_role() IN ('support_agent', 'team_lead')
            OR (current_user_role() = 'client_user' AND is_internal = FALSE)
        )
    )
    """,
    # assignment_isolation: same — remove explicit org check
    """
    ALTER POLICY assignment_isolation ON ticket_assignments USING (
        EXISTS (
            SELECT 1 FROM tickets t
            WHERE t.id = ticket_assignments.ticket_id
        )
    )
    """,
    # prediction_isolation: remove explicit org check
    """
    ALTER POLICY prediction_isolation ON ticket_predictions USING (
        current_user_role() IN ('support_agent', 'team_lead')
        AND EXISTS (
            SELECT 1 FROM tickets t
            WHERE t.id = ticket_predictions.ticket_id
        )
    )
    """,
    # draft_isolation: remove explicit org check
    """
    ALTER POLICY draft_isolation ON draft_generations USING (
        current_user_role() IN ('support_agent', 'team_lead')
        AND EXISTS (
            SELECT 1 FROM tickets t
            WHERE t.id = draft_generations.ticket_id
        )
    )
    """,
    # approval_isolation: remove explicit org check
    """
    ALTER POLICY approval_isolation ON approval_actions USING (
        current_user_role() IN ('support_agent', 'team_lead')
        AND EXISTS (
            SELECT 1 FROM draft_generations dg
            JOIN tickets t ON t.id = dg.ticket_id
            WHERE dg.id = approval_actions.draft_generation_id
        )
    )
    """,
]

print("Applying RLS policy migration...")
conn = psycopg.connect(db_url)
conn.autocommit = True
with conn.cursor() as cur:
    for sql in MIGRATIONS:
        cur.execute(sql)
        print(f"  OK: {sql.split()[2]} ON {sql.split()[4]}")
conn.close()
print("Migration complete.")
