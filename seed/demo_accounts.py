#!/usr/bin/env python3
"""
Agent Service Desk — Demo Accounts Setup

Creates 3 deterministic demo accounts:
  - agent@demo.com  → support_agent  (Org #1 / Workspace #1)
  - lead@demo.com   → team_lead      (Org #1 / Workspace #1)
  - client@demo.com → client_user    (Org #2 / Workspace #1)

Agent and lead are in the "support provider" org (Org #1).
Client is in a separate customer org (Org #2) but is a workspace member of
Workspace #1 so they can submit and view their company's tickets.

Demo tickets are created with org_id=Org #2, workspace_id=Workspace #1 so:
  - Agents/leads see them via workspace_id scope (+ all ~289 Org #1 seed tickets)
  - Client sees only their 48 org_id-scoped tickets

Run after seed.py:
  DATABASE_URL=postgres://... python demo_accounts.py
"""

import os
import sys
import uuid
from datetime import datetime, timedelta, timezone

import psycopg

# ---------------------------------------------------------------------------
# Hardcoded deterministic UUIDs — stable across reseeds
# ---------------------------------------------------------------------------

DEMO_AGENT_ID  = "00000000-0000-4000-a000-000000000001"
DEMO_LEAD_ID   = "00000000-0000-4000-a000-000000000002"
DEMO_CLIENT_ID = "00000000-0000-4000-a000-000000000003"

# Dedicated org for the demo client — deterministic, not from seed data.
# Starts empty so the client sees ONLY the 48 demo tickets we insert here.
DEMO_CLIENT_ORG_ID = "00000000-0000-4000-b000-000000000001"

DEMO_USERS = [
    (DEMO_AGENT_ID,  "agent@demo.com",  "Alex Agent",   "support_agent"),
    (DEMO_LEAD_ID,   "lead@demo.com",   "Lee Lead",     "team_lead"),
    (DEMO_CLIENT_ID, "client@demo.com", "Chris Client", "client_user"),
]

DEMO_ORG_MEM_IDS = [
    "00000000-0000-4000-a000-000000000011",
    "00000000-0000-4000-a000-000000000012",
    "00000000-0000-4000-a000-000000000013",
]

DEMO_WS_MEM_IDS = [
    "00000000-0000-4000-a000-000000000021",
    "00000000-0000-4000-a000-000000000022",
    "00000000-0000-4000-a000-000000000023",
]

# ---------------------------------------------------------------------------
# Demo ticket data — guaranteed spread across all categories × statuses
# ---------------------------------------------------------------------------

CATEGORIES = [
    "billing", "bug_report", "feature_request", "account_access",
    "integration", "api_issue", "onboarding", "data_export",
]

STATUSES = ["new", "open", "pending_customer", "pending_internal", "resolved", "closed"]
PRIORITIES = ["low", "medium", "high", "critical"]

CATEGORY_TEAM = {
    "billing":          "billing_team",
    "bug_report":       "engineering",
    "feature_request":  "engineering",
    "account_access":   "account_management",
    "integration":      "integrations",
    "api_issue":        "engineering",
    "onboarding":       "onboarding",
    "data_export":      "general_support",
}

DEMO_SUBJECTS = {
    "billing":          "Demo: Invoice shows incorrect charge for Enterprise plan",
    "bug_report":       "Demo: Dashboard crashes on date range filter",
    "feature_request":  "Demo: Request for bulk user export functionality",
    "account_access":   "Demo: Admin locked out after password reset",
    "integration":      "Demo: Salesforce sync stopped after API update",
    "api_issue":        "Demo: GET /v2/contacts returning 500 errors",
    "onboarding":       "Demo: Questions about CSV import format",
    "data_export":      "Demo: Need full data export for compliance audit",
}

_NS = uuid.UUID("00000000-0000-4000-a000-000000000000")


def demo_uuid(*parts: str) -> str:
    return str(uuid.uuid5(_NS, ":".join(parts)))


def main():
    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        print("ERROR: DATABASE_URL environment variable is required.")
        sys.exit(1)

    conn = psycopg.connect(db_url)
    conn.autocommit = False

    with conn.cursor() as cur:
        # Run as superuser — bypasses RLS for seeding
        cur.execute("RESET ROLE")

        # ------------------------------------------------------------------
        # Find Org #1 (support provider) and Workspace #1.
        # ctid tracks heap insertion order — matches COPY order from seed.py.
        # ------------------------------------------------------------------
        cur.execute("""
            SELECT o.id, w.id
            FROM organizations o
            JOIN workspaces w ON w.org_id = o.id
            ORDER BY o.ctid ASC
            LIMIT 1
        """)
        row = cur.fetchone()
        if not row:
            print("ERROR: No organizations found. Run seed.py first.")
            conn.close()
            sys.exit(1)

        org_id, ws_id = str(row[0]), str(row[1])

        # Grab a medium-priority SLA policy for demo tickets
        cur.execute("SELECT id FROM sla_policies WHERE priority = 'medium' LIMIT 1")
        sla_row = cur.fetchone()
        sla_id = str(sla_row[0]) if sla_row else None

        now = datetime.now(timezone.utc)

        def fmtts(dt: datetime) -> str:
            return dt.strftime("%Y-%m-%d %H:%M:%S+00")

        now_str = fmtts(now)

        # Create the dedicated demo client org (empty — no seed tickets)
        cur.execute("""
            INSERT INTO organizations (id, name, slug, created_at, updated_at)
            VALUES (%s, 'Acme Corp (Demo)', 'acme-corp-demo', %s, %s)
            ON CONFLICT DO NOTHING
        """, (DEMO_CLIENT_ORG_ID, now_str, now_str))

        client_org_id = DEMO_CLIENT_ORG_ID
        print(f"Support Org (agent/lead): {org_id}")
        print(f"Client Org (demo):        {client_org_id}")
        print(f"Workspace #1 (shared):    {ws_id}")

        # ------------------------------------------------------------------
        # 1. Demo users
        # ------------------------------------------------------------------
        print("\nInserting demo users...")
        for user_id, email, name, _ in DEMO_USERS:
            cur.execute("""
                INSERT INTO users (id, email, full_name, created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s)
                ON CONFLICT DO NOTHING
            """, (user_id, email, name, now_str, now_str))

        # ------------------------------------------------------------------
        # 2. Org memberships
        #    Agent + lead → Org #1 (support provider)
        #    Client       → Org #2 (customer org)
        # ------------------------------------------------------------------
        print("Inserting org memberships...")
        org_for_user = [org_id, org_id, client_org_id]  # agent, lead, client
        for mem_id, (user_id, _, _, _), user_org in zip(DEMO_ORG_MEM_IDS, DEMO_USERS, org_for_user):
            cur.execute("""
                INSERT INTO memberships (id, user_id, org_id, created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s)
                ON CONFLICT (id) DO UPDATE SET org_id = EXCLUDED.org_id
            """, (mem_id, user_id, user_org, now_str, now_str))

        # ------------------------------------------------------------------
        # 3. Workspace memberships
        # ------------------------------------------------------------------
        print("Inserting workspace memberships...")
        for ws_mem_id, (user_id, _, _, role) in zip(DEMO_WS_MEM_IDS, DEMO_USERS):
            cur.execute("""
                INSERT INTO workspace_memberships (id, user_id, workspace_id, role, created_at, updated_at)
                VALUES (%s, %s, %s, %s::user_role, %s, %s)
                ON CONFLICT DO NOTHING
            """, (ws_mem_id, user_id, ws_id, role, now_str, now_str))

        # ------------------------------------------------------------------
        # 4. Demo tickets — one per category × status (8 × 6 = 48 tickets)
        #    This guarantees full spread regardless of Pareto distribution.
        # ------------------------------------------------------------------
        print("Inserting demo tickets (8 categories × 6 statuses = 48 tickets)...")
        ticket_count = 0
        msg_count = 0

        for cat_idx, category in enumerate(CATEGORIES):
            team = CATEGORY_TEAM[category]
            subject_base = DEMO_SUBJECTS[category]

            for stat_idx, status in enumerate(STATUSES):
                priority = PRIORITIES[stat_idx % len(PRIORITIES)]
                ticket_id = demo_uuid("ticket", category, status)
                days_ago = cat_idx * len(STATUSES) + stat_idx + 1
                created = fmtts(now - timedelta(days=days_ago))

                assignee_id = DEMO_AGENT_ID if status != "new" else None

                cur.execute("""
                    INSERT INTO tickets (
                        id, org_id, workspace_id, creator_id, assignee_id,
                        subject, status, priority, category, team, sla_policy_id,
                        created_at, updated_at
                    ) VALUES (
                        %s, %s, %s, %s, %s, %s,
                        %s::ticket_status, %s::ticket_priority,
                        %s::ticket_category, %s::team_name,
                        %s, %s, %s
                    )
                    ON CONFLICT (id) DO UPDATE SET
                        org_id = EXCLUDED.org_id,
                        workspace_id = EXCLUDED.workspace_id
                """, (
                    ticket_id, client_org_id, ws_id, DEMO_CLIENT_ID, assignee_id,
                    f"{subject_base} [{status}]",
                    status, priority, category, team,
                    sla_id, created, created,
                ))
                ticket_count += 1

                # Opening message from client
                msg1_id = demo_uuid("msg", ticket_id, "0")
                msg1_time = fmtts(now - timedelta(days=days_ago))
                cur.execute("""
                    INSERT INTO ticket_messages (
                        id, ticket_id, sender_id, sender_type,
                        body, is_internal, created_at, updated_at
                    ) VALUES (%s, %s, %s, %s::message_sender_type, %s, %s, %s, %s)
                    ON CONFLICT DO NOTHING
                """, (
                    msg1_id, ticket_id, DEMO_CLIENT_ID, "customer",
                    f"Hi, I'm experiencing an issue with {category.replace('_', ' ')}. "
                    f"Can you help? This is a demo ticket to showcase the {status} status.",
                    False, msg1_time, msg1_time,
                ))
                msg_count += 1

                # Agent reply (except for 'new' tickets)
                if status != "new":
                    msg2_id = demo_uuid("msg", ticket_id, "1")
                    msg2_time = fmtts(now - timedelta(days=days_ago) + timedelta(hours=2))
                    cur.execute("""
                        INSERT INTO ticket_messages (
                            id, ticket_id, sender_id, sender_type,
                            body, is_internal, created_at, updated_at
                        ) VALUES (%s, %s, %s, %s::message_sender_type, %s, %s, %s, %s)
                        ON CONFLICT DO NOTHING
                    """, (
                        msg2_id, ticket_id, DEMO_AGENT_ID, "agent",
                        f"Hi Chris, thanks for reaching out! I'm looking into this "
                        f"{category.replace('_', ' ')} issue now and will update you shortly.",
                        False, msg2_time, msg2_time,
                    ))
                    msg_count += 1

    conn.commit()
    conn.close()

    print(f"\nDemo setup complete:")
    print(f"  Tickets inserted:  {ticket_count}")
    print(f"  Messages inserted: {msg_count}")
    print(f"\nDemo accounts:")
    for user_id, email, name, role in DEMO_USERS:
        print(f"  {email:<25} {role:<16} id={user_id}")
    print(f"\n  Support Org (agent/lead): {org_id}")
    print(f"  Client Org:               {client_org_id}")
    print(f"  Workspace #1 (shared):    {ws_id}")
    print(f"\nMint tokens with: python seed/mint_tokens.py")


if __name__ == "__main__":
    main()
