#!/usr/bin/env python3
"""
Agent Service Desk — Seed Data Generator

Generates deterministic, realistic seed data for the MVP schema.
Run: DATABASE_URL=postgres://... python seed.py [--clean]

Volumes:
  - 100 organizations, 100 workspaces (1:1 for MVP)
  - 250 users across roles
  - 15,000 tickets with 80,000 messages
  - 1,000 knowledge documents with ~5,000-8,000 chunks
  - 10 SLA policies, 8 categories, 6 teams
  - 150 eval examples, prompt versions, predictions, drafts, approvals
"""

import argparse
import io
import json
import math
import os
import random
import sys
import time
import uuid
from datetime import datetime, timedelta, timezone

import numpy as np
import psycopg
from faker import Faker

# ============================================================================
# Constants
# ============================================================================

SEED = 42
NUM_ORGS = 100
NUM_USERS = 250
NUM_TICKETS = 15_000
NUM_MESSAGES_TARGET = 80_000
NUM_KNOWLEDGE_DOCS = 1_000
NUM_EVAL_EXAMPLES = 150
NUM_SLA_POLICIES = 10

CATEGORIES = [
    "billing", "bug_report", "feature_request", "account_access",
    "integration", "api_issue", "onboarding", "data_export",
]

TEAMS = [
    "general_support", "billing_team", "engineering",
    "integrations", "onboarding", "account_management",
]

STATUSES = [
    "new", "open", "pending_customer", "pending_internal",
    "resolved", "closed",
]

PRIORITIES = ["low", "medium", "high", "critical"]

APPROVAL_STATES = [
    "pending", "approved", "edited_and_approved", "rejected", "escalated",
]

SENDER_TYPES = ["customer", "agent", "system"]

# Category → likely team mapping (with some noise)
CATEGORY_TEAM_MAP = {
    "billing": ["billing_team", "account_management"],
    "bug_report": ["engineering", "general_support"],
    "feature_request": ["engineering", "general_support"],
    "account_access": ["account_management", "general_support"],
    "integration": ["integrations", "engineering"],
    "api_issue": ["engineering", "integrations"],
    "onboarding": ["onboarding", "general_support"],
    "data_export": ["engineering", "general_support"],
}

# Weighted distributions for more realistic data
STATUS_WEIGHTS = [0.05, 0.20, 0.15, 0.10, 0.35, 0.15]
PRIORITY_WEIGHTS = [0.30, 0.40, 0.20, 0.10]
CATEGORY_WEIGHTS = [0.18, 0.20, 0.12, 0.10, 0.12, 0.10, 0.10, 0.08]

# 6-month window for ticket creation dates
DATE_START = datetime(2025, 9, 15, tzinfo=timezone.utc)
DATE_END = datetime(2026, 3, 13, tzinfo=timezone.utc)

# ============================================================================
# Ticket subject/body templates — realistic B2B SaaS support content
# ============================================================================

TICKET_SUBJECTS = {
    "billing": [
        "Invoice #{num} shows incorrect amount",
        "Need refund for double charge on {month}",
        "Plan downgrade mid-cycle — prorated billing question",
        "Can't update payment method — card keeps getting rejected",
        "Disputed charge for {month} — we cancelled before renewal",
        "Need invoice with VAT number for {company}",
        "Annual vs monthly pricing — how to switch?",
        "Unexpected charge after free trial ended",
        "Need W-9 / tax form for vendor onboarding",
        "Credit request for downtime on {date}",
    ],
    "bug_report": [
        "Dashboard crashes when filtering by date range",
        "Export to CSV produces empty file since last update",
        "Login page shows 500 error intermittently",
        "Webhook deliveries failing with timeout errors",
        "Search returns stale results — index seems out of date",
        "Charts not rendering on Safari 17+",
        "Duplicate records appearing after bulk import",
        "Email notifications stopped working {days} days ago",
        "API rate limit counter seems wrong — getting 429 at low volume",
        "Mobile app freezes on the reports screen",
    ],
    "feature_request": [
        "Request: bulk export of all user activity logs",
        "Need SSO/SAML support for enterprise compliance",
        "Webhook retry configuration — want custom backoff",
        "Custom fields on the contact entity",
        "API endpoint for batch operations",
        "Dark mode for the dashboard",
        "Scheduled reports — weekly email digest",
        "Two-factor authentication via hardware key",
        "Custom roles and permissions beyond the current three tiers",
        "Audit log with IP address and device info",
    ],
    "account_access": [
        "Locked out of admin account after password reset",
        "Team member can't access the billing section",
        "SSO login redirects to blank page",
        "Need to transfer account ownership to {name}",
        "Deactivated user still showing in team list",
        "MFA recovery — lost phone, need backup codes",
        "Guest access link expired — can't regenerate",
        "Role change not reflected — still seeing old permissions",
    ],
    "integration": [
        "Salesforce sync stopped working after their API update",
        "Slack notifications not arriving for new tickets",
        "HubSpot contact sync duplicating records",
        "Zapier trigger not firing on status change",
        "Google Workspace SSO setup failing at SAML step",
        "Jira integration — issue links not resolving",
        "Stripe webhook signature validation failing",
        "Microsoft Teams bot not responding to commands",
    ],
    "api_issue": [
        "API returning 500 on GET /v2/contacts since this morning",
        "Rate limit documentation doesn't match actual limits",
        "OAuth token refresh returning invalid_grant",
        "Pagination cursor breaking on large result sets",
        "API response time degraded — p95 over 3s",
        "Batch endpoint returning partial success with no error details",
        "Webhook payload schema changed without notice",
        "SDK v3.2 throwing type errors on Node 20",
    ],
    "onboarding": [
        "Need help with initial data import — CSV format questions",
        "Team onboarding call — 15 users need setup",
        "Migration from {competitor} — can you help export?",
        "Getting started guide seems outdated — UI doesn't match",
        "Custom onboarding checklist for our workflow",
        "Sandbox environment for testing before go-live",
        "Training materials for non-technical team members",
        "Implementation timeline question — go-live in 2 weeks",
    ],
    "data_export": [
        "Need full data export for compliance audit",
        "GDPR data subject access request — user {email}",
        "Export all historical tickets for migration",
        "Monthly reporting data — can we get raw CSV?",
        "Backup of all workspace data before plan change",
        "Data retention policy — how long are records kept?",
        "Export API usage logs for the last 90 days",
        "Need ticket data in JSON format for analytics pipeline",
    ],
}

FIRST_MESSAGES = {
    "billing": [
        "Hi, I noticed our latest invoice (#{num}) has an amount of ${amount} but we're on the Team plan at ${expected}/month. Can you check what happened?",
        "We were charged ${amount} on {date} but we downgraded our plan last week. Shouldn't this be prorated? Our account ID is {account_id}.",
        "We need a refund for the charge on {date}. We explicitly cancelled the subscription before the renewal date. I have the cancellation confirmation email.",
        "Our finance team needs an invoice with our VAT number ({vat}) for tax compliance. The current invoices don't have it. Can this be added retroactively?",
        "My credit card was declined when trying to update payment method. I've tried three different cards. Is there an issue on your end?",
    ],
    "bug_report": [
        "Since the update on {date}, the dashboard crashes whenever I apply a date filter for ranges longer than 30 days. Chrome console shows: TypeError: Cannot read property 'map' of undefined.",
        "The CSV export feature is producing empty files. Steps to reproduce: Go to Reports > Export > Select date range > Click Export CSV. The file downloads but it's 0 bytes. This worked fine last week.",
        "We're seeing intermittent 500 errors on the login page. It affects about 30% of login attempts. Started around {time} today. Error ID: {error_id}.",
        "Our webhook endpoint at {url} has been getting timeout errors from your system. The endpoint responds in <200ms when tested directly. Could your delivery timeout be too short?",
        "Search seems broken — when I search for a contact I just created, it doesn't show up. Even after waiting 10 minutes. Older contacts search fine. Is the index behind?",
    ],
    "feature_request": [
        "We need the ability to bulk export all user activity logs. Our compliance team requires quarterly audits and right now we have to export one user at a time. This is a blocker for our enterprise renewal.",
        "Our security team is requiring SSO/SAML for all SaaS vendors by end of Q2. Is this on your roadmap? We're on the Business plan and willing to upgrade if needed.",
        "The current webhook retry behavior is too aggressive — 3 retries in 60 seconds. We need configurable backoff. Our downstream service occasionally needs 2-3 minutes to recover from deploys.",
        "Would love to see custom fields on the contact entity. We track industry vertical and contract renewal date and currently have to maintain a separate spreadsheet.",
    ],
    "account_access": [
        "I'm the account admin and I've been locked out after a password reset. The reset email worked but when I log in, I get redirected to a 'contact your administrator' page. There's no other admin on the account.",
        "One of our team members ({name}) can't access the billing section even though they have the Finance role. They see a 403 error. We double-checked their permissions in Settings.",
        "We configured SSO with Okta but the login redirect goes to a blank page. SAML response looks correct in our Okta logs. Error happens after the redirect back to your app.",
        "I need to transfer account ownership from {old_owner} to myself ({new_owner}). {old_owner} has left the company and we can't reach them for confirmation.",
    ],
    "integration": [
        "Our Salesforce integration stopped syncing after Salesforce's Spring '26 update. Last successful sync was {date}. Error in the integration logs: 'INVALID_FIELD: No such column: Custom_Field__c'.",
        "Slack notifications for new tickets stopped working. Our Slack app shows as connected in your settings page, and the webhook URL responds correctly when I test it manually.",
        "HubSpot contact sync is creating duplicate records. Every time a contact is updated on your side, a new HubSpot contact is created instead of updating the existing one. Started after we re-authorized the integration.",
        "Zapier trigger 'New Ticket Created' stopped firing. We haven't changed anything on our end. Other Zapier connections to your API are working. Trigger ID: {trigger_id}.",
    ],
    "api_issue": [
        "GET /v2/contacts is returning 500 errors since around {time} this morning. Affects all our API calls to this endpoint. Other endpoints seem fine. Response body: {\"error\": \"internal_server_error\", \"request_id\": \"{req_id}\"}.",
        "Your rate limit docs say 100 requests/minute for our plan tier, but we're hitting 429 responses at around 60 requests/minute. We've verified our counter is accurate. Has the limit changed?",
        "OAuth token refresh is returning invalid_grant. This started happening randomly about {days} days ago. The refresh token is not expired according to the TTL in your docs. We have to re-auth the whole flow to fix it.",
        "The pagination cursor on GET /v2/tickets breaks when the result set is over 10,000 records. The cursor value returned in the response becomes invalid for the next page request. Works fine under 10K.",
    ],
    "onboarding": [
        "We're starting our onboarding process and I have questions about the CSV import format. The template has columns that aren't in the documentation. Specifically: 'external_ref' and 'group_key'. What should these contain?",
        "We have 15 team members that need to be set up. Is there a way to do bulk user creation or do we need to invite them one by one? Also, can we assign roles during the invite process?",
        "We're migrating from {competitor}. They gave us an export file in their proprietary format. Do you have a migration tool or import adapter for {competitor} data?",
        "Your getting started guide references a 'Quick Setup Wizard' but I don't see it anywhere in the UI. The screenshots in the guide show a different interface than what I'm seeing. Was it removed?",
    ],
    "data_export": [
        "We're going through a compliance audit and need a full export of all data associated with our organization. This includes users, tickets, messages, activity logs, and any stored files. What's the fastest way to get this?",
        "We received a GDPR data subject access request for user {email}. We need all data your system stores about this individual, including any analytics or behavioral data. Timeline: 30 days per regulation.",
        "We're migrating to a new platform and need to export all historical tickets with their full message threads. Is there an API endpoint for this or do we need to request a manual export?",
        "Our analytics team needs raw ticket data in JSON format for their pipeline. They need: ticket metadata, all messages, timestamps, and resolution data. Is there a bulk API or export mechanism?",
    ],
}

FOLLOWUP_AGENT_MESSAGES = [
    "Thanks for reaching out. I've looked into this and here's what I found:\n\n{response}\n\nLet me know if you have any other questions.",
    "Hi {name}, I've investigated this issue. {response}\n\nI'll keep this ticket open until you confirm everything looks good.",
    "Good {time_of_day}! I've reviewed your request.\n\n{response}\n\nIs there anything else I can help with?",
    "Thanks for the details — that was helpful. {response}\n\nPlease let me know if this resolves the issue.",
    "I've escalated this internally and here's the update: {response}\n\nI'll follow up again within 24 hours if we have more information.",
]

FOLLOWUP_CUSTOMER_MESSAGES = [
    "Thanks for the update. {response}",
    "I tried what you suggested but {problem}. Any other ideas?",
    "That worked, thank you! One more question though — {question}",
    "I appreciate the quick response. {response} Let me check with my team and get back to you.",
    "This is still happening. {problem} Can we schedule a call to troubleshoot?",
    "Perfect, that resolved it. Thanks for the help!",
    "Not quite what I was looking for. {clarification}",
]

AGENT_RESPONSE_FRAGMENTS = [
    "I've applied a credit of ${amount} to your account. It will reflect on your next invoice.",
    "The engineering team has identified the root cause and a fix is being deployed now. ETA: 2 hours.",
    "I've updated your permissions. Please log out and back in to see the changes.",
    "This is a known issue in version 3.2. Upgrading to 3.3 resolves it. Here's the migration guide.",
    "I've re-triggered the sync manually. It should complete within the next 15 minutes.",
    "I've submitted your feature request to the product team. I'll update this ticket when we have a timeline.",
    "Your export is ready. You can download it from Settings > Data > Exports. The link expires in 7 days.",
    "The rate limit for your plan is actually 150/min, not 100. The docs were outdated — we've updated them.",
    "I've reset the integration authentication. Please go to Settings > Integrations and re-authorize.",
    "The data you requested is attached to this ticket. Let me know if the format works for your team.",
]

CUSTOMER_FOLLOWUP_FRAGMENTS = [
    "that makes sense",
    "I see the same error again after about 30 minutes",
    "can you also check the same issue on our staging account?",
    "our finance team wants to know if we can get a receipt for this",
    "is there an API endpoint we could use for this instead?",
    "when will the fix be available in the EU region?",
    "it worked for the main account but the sub-accounts still show the old behavior",
    "actually, I think the root cause might be something else — we noticed",
    "we found a workaround but it would be great to have an official fix",
]

# ============================================================================
# Knowledge document templates
# ============================================================================

DOC_TEMPLATES = {
    "api_reference": {
        "titles": [
            "API Reference: {entity} Endpoints",
            "REST API Guide: {operation} Operations",
            "API v2: {entity} Resource Documentation",
        ],
        "content": """# {title}

## Overview
This document covers the {entity} API endpoints available in API v2.

## Authentication
All requests require a valid Bearer token in the Authorization header.

## Endpoints

### GET /v2/{entity_lower}
Returns a paginated list of {entity_lower} resources.

**Parameters:**
- `page` (integer, default: 1) — Page number
- `per_page` (integer, default: 25, max: 100) — Items per page
- `sort` (string) — Sort field (created_at, updated_at, name)
- `order` (string) — Sort order (asc, desc)

**Response:** 200 OK with JSON array of {entity_lower} objects.

### GET /v2/{entity_lower}/{{id}}
Returns a single {entity_lower} by ID.

### POST /v2/{entity_lower}
Creates a new {entity_lower} resource.

### PATCH /v2/{entity_lower}/{{id}}
Updates an existing {entity_lower}.

### DELETE /v2/{entity_lower}/{{id}}
Soft-deletes a {entity_lower}. Deleted resources are retained for 30 days.

## Rate Limits
- Standard plan: 150 requests/minute
- Business plan: 500 requests/minute
- Enterprise plan: 2000 requests/minute

Rate limit headers are included in every response:
- `X-RateLimit-Limit`
- `X-RateLimit-Remaining`
- `X-RateLimit-Reset`

## Error Codes
- 400: Bad Request (invalid parameters)
- 401: Unauthorized (missing or invalid token)
- 403: Forbidden (insufficient permissions)
- 404: Not Found
- 429: Rate Limited
- 500: Internal Server Error (include request_id when contacting support)
""",
    },
    "billing_policy": {
        "titles": [
            "Billing Policy: {topic}",
            "Billing FAQ: {topic}",
            "Pricing & Billing: {topic}",
        ],
        "content": """# {title}

## {topic}

### Plan Changes
- Upgrades are effective immediately and prorated for the remaining billing period.
- Downgrades take effect at the next billing cycle. You retain access to higher-tier features until then.
- Mid-cycle downgrades do not generate refunds for the current period.

### Refund Policy
- Refunds are available within 14 days of charge for annual plans.
- Monthly plan refunds are evaluated case-by-case.
- Disputed charges must be reported within 60 days.
- Credits for service outages are calculated at 10x the downtime cost based on your plan's monthly rate.

### Payment Methods
- We accept Visa, Mastercard, American Express, and ACH/wire for annual plans.
- Card updates take effect on the next billing cycle.
- Failed payment retries occur on days 1, 3, 7, and 14 after initial failure.
- Accounts are suspended after 14 days of payment failure.

### Tax & Compliance
- VAT is applied based on the billing address country.
- VAT numbers can be added in Settings > Billing > Tax Information.
- W-9 forms are available upon request for US-based enterprise customers.
- All invoices are downloadable from the Billing History page.
""",
    },
    "troubleshooting": {
        "titles": [
            "Troubleshooting: {issue}",
            "How to Fix: {issue}",
            "Known Issue: {issue}",
        ],
        "content": """# {title}

## Problem Description
Users may experience {issue_lower} under certain conditions.

## Common Causes
1. **Browser cache** — Stale cached assets after a platform update.
2. **Network configuration** — Proxy or firewall blocking WebSocket connections.
3. **Concurrent sessions** — More than 5 active sessions on the same account.
4. **Extension conflicts** — Ad blockers or privacy extensions interfering with API calls.

## Resolution Steps

### Step 1: Clear Browser Cache
- Chrome: Settings > Privacy > Clear Browsing Data > Cached images and files
- Firefox: Settings > Privacy > Clear Data > Cached Web Content
- Safari: Develop > Empty Caches

### Step 2: Check Network
Ensure your network allows connections to:
- `app.example.com` (port 443)
- `api.example.com` (port 443)
- `ws.example.com` (port 443, WebSocket)

### Step 3: Disable Extensions
Temporarily disable browser extensions and test again.

### Step 4: Contact Support
If the issue persists, contact support with:
- Browser and version
- Console error screenshot (F12 > Console)
- Network tab screenshot showing failed requests
- Your account ID and the time of the error
""",
    },
    "integration_guide": {
        "titles": [
            "Integration Guide: {service}",
            "Setting Up {service} Integration",
            "Connecting {service} to Agent Service Desk",
        ],
        "content": """# {title}

## Prerequisites
- Active {service} account with admin permissions
- Agent Service Desk Business plan or higher
- API key from Settings > Integrations

## Setup Steps

### 1. Generate API Credentials
Go to Settings > Integrations > {service} > Connect. Click "Generate API Key".

### 2. Configure in {service}
In your {service} dashboard:
- Navigate to Settings > Integrations > Webhooks
- Add a new webhook with URL: `https://api.example.com/webhooks/{service_lower}`
- Set the webhook secret to the value provided in step 1
- Select events to sync: created, updated, deleted

### 3. Test the Connection
Click "Test Connection" in the Agent Service Desk integration settings.
A successful test will show a green checkmark and the message "Connected successfully."

### 4. Configure Sync Settings
- **Sync direction**: One-way (from {service}) or bi-directional
- **Sync frequency**: Real-time (webhook) or polling (every 5 minutes)
- **Field mapping**: Map {service} fields to Agent Service Desk fields
- **Conflict resolution**: Choose which system takes priority on conflicts

## Troubleshooting
- **Connection timeout**: Verify your {service} firewall allows outbound connections to api.example.com
- **Duplicate records**: Enable deduplication in Settings > Integrations > {service} > Advanced
- **Missing data**: Check field mapping — unmapped fields are not synced
""",
    },
    "onboarding_guide": {
        "titles": [
            "Onboarding Guide: {topic}",
            "Getting Started: {topic}",
            "Quick Start: {topic}",
        ],
        "content": """# {title}

## Welcome to Agent Service Desk

This guide covers {topic_lower} to help you get started quickly.

## Initial Setup (15 minutes)

### 1. Create Your Workspace
After signing up, create your first workspace. A workspace is your team's shared environment for managing support tickets.

### 2. Invite Team Members
Go to Settings > Team > Invite. Enter email addresses and assign roles:
- **Support Agent**: Can view and respond to tickets
- **Team Lead**: Full access including evaluation console
- **Client User**: Customer-facing access to their own tickets

### 3. Import Your Data
Upload existing data via Settings > Data > Import:
- Supported formats: CSV, JSON, XML
- Maximum file size: 100MB
- Required columns: subject, description, status, created_date
- Optional columns: priority, category, assignee_email, tags

### 4. Set Up Knowledge Base
Upload your support documentation:
- Go to Knowledge > Upload
- Supported formats: PDF, Markdown, plain text
- Documents are automatically chunked and indexed for AI retrieval
- Mark documents as "Internal Only" or "Client Visible"

## First Ticket Resolution (5 minutes)

1. Navigate to the Ticket Queue
2. Click on any unassigned ticket
3. Review the AI triage suggestion (category, priority, routing)
4. Review the AI-generated draft reply with citations
5. Approve, edit, or reject the draft
6. The approved reply is sent to the customer

## Next Steps
- Configure integrations (Slack, Salesforce, Jira)
- Set up SLA policies
- Run your first evaluation
""",
    },
}

ENTITIES = ["Contacts", "Tickets", "Organizations", "Invoices", "Users", "Reports", "Workflows", "Projects"]
OPERATIONS = ["CRUD", "Search", "Bulk", "Export", "Webhook", "Analytics"]
BILLING_TOPICS = ["Plan Changes & Upgrades", "Refunds & Credits", "Payment Methods", "Tax & Invoicing", "Enterprise Billing"]
ISSUES = [
    "Dashboard Loading Errors", "Login Failures", "Export Timeouts", "Search Not Working",
    "Notification Delays", "Sync Failures", "Performance Degradation", "Permission Errors",
    "Mobile App Crashes", "Webhook Delivery Issues",
]
SERVICES = ["Salesforce", "HubSpot", "Slack", "Jira", "Zapier", "Stripe", "Microsoft Teams", "Google Workspace", "Zendesk", "Intercom"]
ONBOARDING_TOPICS = ["Your First Workspace", "Team Setup", "Data Import", "Knowledge Base Setup", "AI-Assisted Workflows"]

# ============================================================================
# Helper functions
# ============================================================================

fake = Faker()
Faker.seed(SEED)
rng = random.Random(SEED)
np_rng = np.random.default_rng(SEED)


def uid() -> str:
    """Generate a deterministic UUID from the seeded RNG."""
    return str(uuid.UUID(int=rng.getrandbits(128), version=4))


def ts(dt: datetime) -> str:
    """Format datetime for COPY."""
    return dt.strftime("%Y-%m-%d %H:%M:%S+00")


def rand_date(start: datetime, end: datetime) -> datetime:
    """Random datetime between start and end."""
    delta = (end - start).total_seconds()
    return start + timedelta(seconds=rng.random() * delta)


def null_str(val) -> str:
    """Return COPY-compatible null or value."""
    return "\\N" if val is None else str(val)


def escape_copy(val: str) -> str:
    """Escape special characters for COPY format."""
    if val is None:
        return "\\N"
    return (
        str(val)
        .replace("\\", "\\\\")
        .replace("\t", "\\t")
        .replace("\n", "\\n")
        .replace("\r", "\\r")
    )


def copy_insert(cur, table: str, columns: list[str], rows: list[tuple]):
    """Bulk insert using COPY for maximum performance."""
    buf = io.StringIO()
    for row in rows:
        line = "\t".join(escape_copy(str(v)) if v is not None else "\\N" for v in row)
        buf.write(line + "\n")
    buf.seek(0)
    col_str = ", ".join(columns)
    with cur.copy(f"COPY {table} ({col_str}) FROM STDIN") as copy:
        while data := buf.read(65536):
            copy.write(data.encode("utf-8"))


def progress(msg: str, count: int | None = None):
    suffix = f" ({count:,})" if count is not None else ""
    print(f"  {msg}...{suffix}", flush=True)


# ============================================================================
# Data generation functions
# ============================================================================

def gen_organizations() -> list[tuple]:
    rows = []
    used_slugs = set()
    for _ in range(NUM_ORGS):
        name = fake.company()
        base_slug = name.lower().replace(" ", "-").replace(",", "").replace(".", "")[:40]
        slug = base_slug
        i = 2
        while slug in used_slugs:
            slug = f"{base_slug}-{i}"
            i += 1
        used_slugs.add(slug)
        now = ts(rand_date(DATE_START - timedelta(days=180), DATE_START))
        rows.append((uid(), name, slug, now, now))
    return rows


def gen_users(orgs: list[tuple]) -> tuple[list[tuple], list[tuple], list[tuple]]:
    """Generate users, memberships, and workspace_memberships.
    Returns: (users, memberships, workspace_memberships)
    """
    users = []
    memberships = []
    ws_memberships = []
    used_emails = set()

    # Role distribution: ~50 agents, ~15 leads, ~185 client users
    roles_pool = (
        ["team_lead"] * 15
        + ["support_agent"] * 50
        + ["client_user"] * 185
    )
    rng.shuffle(roles_pool)

    for i in range(NUM_USERS):
        org = orgs[i % NUM_ORGS]
        org_id = org[0]
        role = roles_pool[i]

        email = fake.unique.email()
        while email in used_emails:
            email = fake.unique.email()
        used_emails.add(email)

        name = fake.name()
        created = ts(rand_date(DATE_START - timedelta(days=90), DATE_START + timedelta(days=30)))
        user_id = uid()
        users.append((user_id, email, name, None, created, created))
        memberships.append((uid(), user_id, org_id, created, created))
        # workspace_memberships will be filled after workspaces are created
        ws_memberships.append((user_id, org_id, role, created))

    return users, memberships, ws_memberships


def gen_workspaces(orgs: list[tuple]) -> list[tuple]:
    """One workspace per org for MVP."""
    rows = []
    for org in orgs:
        org_id, org_name = org[0], org[1]
        now = org[3]  # created_at of the org
        rows.append((uid(), org_id, f"{org_name} Support", "support", now, now))
    return rows


def gen_workspace_memberships(ws_mem_temp: list[tuple], workspaces: list[tuple], org_id_to_ws: dict) -> list[tuple]:
    rows = []
    for user_id, org_id, role, created in ws_mem_temp:
        ws_id = org_id_to_ws.get(org_id)
        if ws_id:
            rows.append((uid(), user_id, ws_id, role, created, created))
    return rows


def gen_sla_policies() -> list[tuple]:
    """10 SLA policies across priorities."""
    rows = []
    configs = [
        ("Critical — Enterprise", "critical", 15, 120),
        ("Critical — Standard", "critical", 30, 240),
        ("High — Enterprise", "high", 30, 240),
        ("High — Standard", "high", 60, 480),
        ("High — Basic", "high", 120, 1440),
        ("Medium — Enterprise", "medium", 60, 480),
        ("Medium — Standard", "medium", 120, 1440),
        ("Medium — Basic", "medium", 240, 2880),
        ("Low — Standard", "low", 480, 4320),
        ("Low — Basic", "low", 1440, 10080),
    ]
    for name, priority, first_resp, resolution in configs:
        now = ts(DATE_START)
        rows.append((uid(), name, priority, first_resp, resolution, None, now, now))
    return rows


def gen_prompt_versions() -> list[tuple]:
    """At least 2 triage and 2 draft prompt versions."""
    rows = []
    now = ts(DATE_START)

    # Triage v1
    rows.append((uid(), "triage-v1", "triage", """You are a support ticket classifier. Given a ticket subject and body, output a JSON object with:
- category: one of [billing, bug_report, feature_request, account_access, integration, api_issue, onboarding, data_export]
- urgency: one of [low, medium, high, critical]
- suggested_team: one of [general_support, billing_team, engineering, integrations, onboarding, account_management]
- escalation_suggested: boolean
- escalation_reason: string or null
- confidence: float 0-1

Be conservative with confidence. If the ticket is ambiguous, set confidence below 0.6.""", False, now, now))

    # Triage v2 (active)
    rows.append((uid(), "triage-v2", "triage", """You are an expert support ticket classifier for a B2B SaaS platform.

## Task
Classify the ticket into exactly one category and suggest routing.

## Categories
billing, bug_report, feature_request, account_access, integration, api_issue, onboarding, data_export

## Teams
general_support, billing_team, engineering, integrations, onboarding, account_management

## Rules
1. If the ticket mentions security, legal, or executive complaints → set escalation_suggested=true
2. If the ticket could belong to 2+ categories → pick the primary one, lower confidence
3. If the ticket is vague or missing context → confidence < 0.5
4. Account deletion requests → escalation_suggested=true, reason="account deletion requires manual process"

Output JSON: {category, urgency, suggested_team, escalation_suggested, escalation_reason, confidence}""", True, now, now))

    # Draft v1
    rows.append((uid(), "draft-v1", "draft", """You are a support agent drafting a reply to a customer ticket.

Use the provided knowledge base evidence to ground your response.
Cite specific evidence chunks using [chunk_id] notation.

Rules:
- Do not fabricate information not in the evidence
- If evidence is insufficient, say so explicitly
- Be professional and concise
- Include specific next steps for the customer""", False, now, now))

    # Draft v2 (active)
    rows.append((uid(), "draft-v2", "draft", """You are an expert support agent for a B2B SaaS platform.

## Task
Draft a reply to the customer ticket using the retrieved knowledge base evidence.

## Citation Rules
- Every factual claim must cite a specific evidence chunk: [chunk:UUID]
- If no evidence supports a claim, do not make it
- If evidence is insufficient to fully resolve the ticket, explicitly state what's missing

## Tone
- Professional but warm
- Concise — customers are busy
- Lead with the answer, then explain
- Include concrete next steps

## Refusal Rules
- If asked to share another customer's data → refuse and explain
- If asked to perform account deletion → explain this requires a formal process
- If asked about security vulnerabilities → escalate to security team

Output: {body, cited_evidence, confidence, unresolved_questions, send_ready}""", True, now, now))

    return rows


def gen_tickets(
    orgs: list[tuple],
    org_users: dict[str, list[tuple]],
    org_agents: dict[str, list[str]],
    workspaces: list[tuple],
    org_id_to_ws: dict[str, str],
    sla_policies: list[tuple],
) -> list[tuple]:
    """Generate 15,000 tickets with realistic distribution."""
    rows = []

    # Uneven org distribution: some orgs get many tickets, most get fewer
    # Use a Pareto-like distribution
    org_ids = [o[0] for o in orgs]
    weights = np_rng.pareto(1.5, NUM_ORGS) + 1
    weights = weights / weights.sum()

    # Pre-assign ticket counts per org
    org_ticket_counts = np_rng.multinomial(NUM_TICKETS, weights)

    # SLA policy lookup by priority
    sla_by_priority = {}
    for sla in sla_policies:
        p = sla[2]
        if p not in sla_by_priority:
            sla_by_priority[p] = []
        sla_by_priority[p].append(sla[0])

    # Generate incident spikes: 5 spikes of 10-30 similar tickets
    spike_configs = []
    for _ in range(5):
        spike_date = rand_date(DATE_START + timedelta(days=30), DATE_END - timedelta(days=15))
        spike_category = rng.choice(["api_issue", "bug_report", "integration"])
        spike_count = rng.randint(10, 30)
        spike_subject_base = rng.choice(TICKET_SUBJECTS[spike_category])
        spike_configs.append((spike_date, spike_category, spike_count, spike_subject_base))

    # Track how many spike tickets remain
    spike_tickets_remaining = {i: cfg[2] for i, cfg in enumerate(spike_configs)}
    total_spike = sum(spike_tickets_remaining.values())
    regular_tickets = NUM_TICKETS - total_spike

    ticket_idx = 0
    for org_idx, count in enumerate(org_ticket_counts):
        org_id = org_ids[org_idx]
        ws_id = org_id_to_ws.get(org_id)
        if not ws_id:
            continue

        client_users = [u for u in org_users.get(org_id, []) if u[1] == "client_user"]
        agents = org_agents.get(org_id, [])

        if not client_users:
            # Assign tickets to any user in the org
            all_users = org_users.get(org_id, [])
            if not all_users:
                continue
            client_users = all_users

        for _ in range(int(count)):
            if ticket_idx >= NUM_TICKETS:
                break

            # Check if this should be a spike ticket
            is_spike = False
            spike_idx = None
            for si, remaining in spike_tickets_remaining.items():
                if remaining > 0 and rng.random() < 0.02:
                    is_spike = True
                    spike_idx = si
                    break

            if is_spike and spike_idx is not None:
                cfg = spike_configs[spike_idx]
                spike_tickets_remaining[spike_idx] -= 1
                category = cfg[1]
                created = cfg[0] + timedelta(minutes=rng.randint(0, 120))
                subject_tpl = cfg[3]
            else:
                category = rng.choices(CATEGORIES, weights=CATEGORY_WEIGHTS)[0]
                created = rand_date(DATE_START, DATE_END)
                subject_tpl = rng.choice(TICKET_SUBJECTS[category])

            # Fill template placeholders
            subject = subject_tpl.format(
                num=rng.randint(10000, 99999),
                month=fake.month_name(),
                company=fake.company(),
                date=fake.date_this_year().isoformat(),
                name=fake.name(),
                days=rng.randint(1, 14),
                email=fake.email(),
            )

            creator = rng.choice(client_users)
            creator_id = creator[0]
            status = rng.choices(STATUSES, weights=STATUS_WEIGHTS)[0]
            priority = rng.choices(PRIORITIES, weights=PRIORITY_WEIGHTS)[0]
            team = rng.choice(CATEGORY_TEAM_MAP[category])

            assignee_id = rng.choice(agents) if agents and status != "new" and rng.random() > 0.2 else None
            sla_id = rng.choice(sla_by_priority.get(priority, [None]))

            rows.append((
                uid(), org_id, ws_id, creator_id, null_str(assignee_id),
                subject, status, priority, category, team, null_str(sla_id),
                ts(created), ts(created),
            ))
            ticket_idx += 1

    # Fill remaining spike tickets into random orgs
    for si, remaining in spike_tickets_remaining.items():
        cfg = spike_configs[si]
        for _ in range(remaining):
            if ticket_idx >= NUM_TICKETS:
                break
            org_idx = rng.randint(0, NUM_ORGS - 1)
            org_id = org_ids[org_idx]
            ws_id = org_id_to_ws.get(org_id)
            client_users = [u for u in org_users.get(org_id, []) if u[1] == "client_user"]
            if not client_users:
                client_users = org_users.get(org_id, [])
            if not client_users or not ws_id:
                continue

            creator = rng.choice(client_users)
            created = cfg[0] + timedelta(minutes=rng.randint(0, 120))
            category = cfg[1]
            subject_tpl = cfg[3]
            subject = subject_tpl.format(
                num=rng.randint(10000, 99999), month=fake.month_name(),
                company=fake.company(), date=fake.date_this_year().isoformat(),
                name=fake.name(), days=rng.randint(1, 14), email=fake.email(),
            )
            priority = rng.choices(PRIORITIES, weights=PRIORITY_WEIGHTS)[0]
            team = rng.choice(CATEGORY_TEAM_MAP[category])
            agents = org_agents.get(org_id, [])
            assignee_id = rng.choice(agents) if agents else None

            rows.append((
                uid(), org_id, ws_id, creator[0], null_str(assignee_id),
                subject, "open", priority, category, team, "\\N",
                ts(created), ts(created),
            ))
            ticket_idx += 1

    return rows[:NUM_TICKETS]


def gen_messages(
    tickets: list[tuple],
    org_agents: dict[str, list[str]],
) -> list[tuple]:
    """Generate ~80,000 messages across 15,000 tickets.
    Average ~5-6 messages per ticket with variation (1-12).
    """
    rows = []

    # Distribution: most tickets get 4-6 messages, some get 1-2, some get 8-12
    msg_counts = []
    for _ in range(len(tickets)):
        r = rng.random()
        if r < 0.05:
            msg_counts.append(rng.randint(1, 2))      # 5% very short
        elif r < 0.15:
            msg_counts.append(rng.randint(2, 3))      # 10% short
        elif r < 0.70:
            msg_counts.append(rng.randint(4, 6))      # 55% typical
        elif r < 0.90:
            msg_counts.append(rng.randint(7, 9))      # 20% longer
        else:
            msg_counts.append(rng.randint(10, 12))     # 10% long threads

    # Scale to hit target
    total_msgs = sum(msg_counts)
    scale = NUM_MESSAGES_TARGET / total_msgs
    msg_counts = [max(1, round(c * scale)) for c in msg_counts]

    # Fine-tune to hit exactly target
    diff = NUM_MESSAGES_TARGET - sum(msg_counts)
    indices = list(range(len(msg_counts)))
    rng.shuffle(indices)
    for i in indices:
        if diff == 0:
            break
        if diff > 0:
            msg_counts[i] += 1
            diff -= 1
        elif msg_counts[i] > 1:
            msg_counts[i] -= 1
            diff += 1

    for t_idx, ticket in enumerate(tickets):
        ticket_id = ticket[0]
        org_id = ticket[1]
        creator_id = ticket[3]
        category = ticket[8]
        ticket_created = datetime.strptime(ticket[11], "%Y-%m-%d %H:%M:%S+00").replace(tzinfo=timezone.utc)
        agents = org_agents.get(org_id, [])
        count = msg_counts[t_idx]

        msg_time = ticket_created

        for m_idx in range(count):
            msg_time = msg_time + timedelta(minutes=rng.randint(5, 480))

            if m_idx == 0:
                # First message is always from the customer
                sender_type = "customer"
                sender_id = creator_id
                templates = FIRST_MESSAGES.get(category, FIRST_MESSAGES["billing"])
                body = rng.choice(templates).format(
                    num=rng.randint(10000, 99999),
                    amount=rng.randint(20, 2000),
                    expected=rng.choice([29, 49, 99, 199, 499]),
                    date=fake.date_this_year().isoformat(),
                    month=fake.month_name(),
                    account_id=f"ACC-{rng.randint(10000, 99999)}",
                    vat=f"EU{rng.randint(100000000, 999999999)}",
                    name=fake.name(),
                    old_owner=fake.name(),
                    new_owner=fake.name(),
                    time=f"{rng.randint(6, 18):02d}:{rng.choice(['00','15','30','45'])} UTC",
                    error_id=f"ERR-{uid()[:8]}",
                    url=f"https://{fake.domain_name()}/webhooks/inbound",
                    trigger_id=f"trg_{rng.randint(100000, 999999)}",
                    req_id=uid()[:12],
                    days=rng.randint(1, 14),
                    email=fake.email(),
                    competitor=rng.choice(["Zendesk", "Freshdesk", "Intercom", "Help Scout"]),
                    service_lower=rng.choice(SERVICES).lower(),
                )
            elif m_idx % 2 == 1:
                # Agent responses
                sender_type = "agent"
                sender_id = rng.choice(agents) if agents else creator_id
                tpl = rng.choice(FOLLOWUP_AGENT_MESSAGES)
                body = tpl.format(
                    name=fake.first_name(),
                    response=rng.choice(AGENT_RESPONSE_FRAGMENTS),
                    time_of_day=rng.choice(["morning", "afternoon", "evening"]),
                )
            else:
                # Customer follow-ups
                sender_type = "customer"
                sender_id = creator_id
                tpl = rng.choice(FOLLOWUP_CUSTOMER_MESSAGES)
                body = tpl.format(
                    response=rng.choice(CUSTOMER_FOLLOWUP_FRAGMENTS),
                    problem=rng.choice(CUSTOMER_FOLLOWUP_FRAGMENTS),
                    question=rng.choice(CUSTOMER_FOLLOWUP_FRAGMENTS),
                    clarification=rng.choice(CUSTOMER_FOLLOWUP_FRAGMENTS),
                )

            # ~5% of agent messages are internal notes
            is_internal = sender_type == "agent" and rng.random() < 0.05

            rows.append((
                uid(), ticket_id, sender_id, sender_type,
                body, str(is_internal).lower(),  # boolean for COPY
                ts(msg_time), ts(msg_time),
            ))

    return rows


def gen_knowledge_docs(workspaces: list[tuple]) -> tuple[list[tuple], list[tuple]]:
    """Generate 1,000 knowledge documents with ~5-8 chunks each."""
    docs = []
    chunks = []

    ws_ids = [w[0] for w in workspaces]
    doc_types = list(DOC_TEMPLATES.keys())

    for i in range(NUM_KNOWLEDGE_DOCS):
        ws_id = rng.choice(ws_ids)
        doc_type = rng.choice(doc_types)
        template = DOC_TEMPLATES[doc_type]

        # Generate title and content based on template
        if doc_type == "api_reference":
            entity = rng.choice(ENTITIES)
            operation = rng.choice(OPERATIONS)
            title = rng.choice(template["titles"]).format(entity=entity, operation=operation)
            content = template["content"].format(
                title=title, entity=entity, entity_lower=entity.lower()
            )
        elif doc_type == "billing_policy":
            topic = rng.choice(BILLING_TOPICS)
            title = rng.choice(template["titles"]).format(topic=topic)
            content = template["content"].format(title=title, topic=topic)
        elif doc_type == "troubleshooting":
            issue = rng.choice(ISSUES)
            title = rng.choice(template["titles"]).format(issue=issue)
            content = template["content"].format(
                title=title, issue_lower=issue.lower()
            )
        elif doc_type == "integration_guide":
            service = rng.choice(SERVICES)
            title = rng.choice(template["titles"]).format(service=service)
            content = template["content"].format(
                title=title, service=service, service_lower=service.lower().replace(" ", "-")
            )
        else:  # onboarding_guide
            topic = rng.choice(ONBOARDING_TOPICS)
            title = rng.choice(template["titles"]).format(topic=topic)
            content = template["content"].format(
                title=title, topic_lower=topic.lower()
            )

        visibility = "internal" if rng.random() < 0.35 else "client_visible"
        created = ts(rand_date(DATE_START - timedelta(days=60), DATE_END))
        doc_id = uid()
        docs.append((
            doc_id, ws_id, title, f"{title.lower().replace(' ', '_')[:40]}.md",
            "text/markdown", visibility, "indexed", "{}",
            created, created,
        ))

        # Chunk the content: split by double-newline paragraphs
        paragraphs = [p.strip() for p in content.split("\n\n") if p.strip()]
        # Group paragraphs into chunks of 2-4 paragraphs
        chunk_idx = 0
        j = 0
        while j < len(paragraphs):
            chunk_size = rng.randint(2, 4)
            chunk_text = "\n\n".join(paragraphs[j:j + chunk_size])
            token_count = len(chunk_text.split()) * 4 // 3  # rough token estimate

            # NOTE: Embeddings are random placeholders. Run the ingestion pipeline
            # to generate real embeddings from an embedding model.
            embedding = np_rng.normal(0, 0.1, 1536).tolist()
            embedding_str = "[" + ",".join(f"{v:.6f}" for v in embedding) + "]"

            chunks.append((
                uid(), doc_id, chunk_idx, chunk_text,
                embedding_str, token_count, "{}",
                created, created,
            ))
            chunk_idx += 1
            j += chunk_size

    return docs, chunks


def gen_ticket_predictions(
    tickets: list[tuple],
    prompt_versions: list[tuple],
) -> list[tuple]:
    """Generate predictions for ~60% of tickets."""
    rows = []
    # Find active triage prompt
    triage_prompts = [p for p in prompt_versions if p[2] == "triage"]
    if not triage_prompts:
        return rows

    for ticket in tickets:
        if rng.random() > 0.60:
            continue

        ticket_id = ticket[0]
        category = ticket[8]
        priority = ticket[7]
        team = ticket[9]

        prompt = rng.choice(triage_prompts)
        prompt_id = prompt[0]

        # Sometimes the prediction matches, sometimes it doesn't
        if rng.random() < 0.82:
            pred_category = category
            pred_team = team
            confidence = round(rng.uniform(0.70, 0.98), 3)
        else:
            pred_category = rng.choice(CATEGORIES)
            pred_team = rng.choice(TEAMS)
            confidence = round(rng.uniform(0.20, 0.65), 3)

        pred_priority = priority if rng.random() < 0.85 else rng.choice(PRIORITIES)
        escalation = rng.random() < 0.08
        escalation_reason = "Security concern flagged" if escalation else None

        latency = rng.randint(400, 2200)
        prompt_tokens = rng.randint(300, 800)
        completion_tokens = rng.randint(80, 200)
        token_usage = json.dumps({
            "prompt_tokens": prompt_tokens,
            "completion_tokens": completion_tokens,
            "total_tokens": prompt_tokens + completion_tokens,
        })
        cost = round((prompt_tokens * 0.003 + completion_tokens * 0.006) / 10, 2)

        created = ticket[11]
        rows.append((
            uid(), ticket_id, prompt_id, pred_category, pred_priority,
            pred_team, str(escalation).lower(), null_str(escalation_reason),
            confidence, latency, token_usage, cost, created,
        ))

    return rows


def gen_draft_generations(
    tickets: list[tuple],
    prompt_versions: list[tuple],
    chunk_ids: list[str],
) -> list[tuple]:
    """Generate drafts for ~40% of tickets."""
    rows = []
    draft_prompts = [p for p in prompt_versions if p[2] == "draft"]
    if not draft_prompts:
        return rows

    for ticket in tickets:
        if rng.random() > 0.40:
            continue

        ticket_id = ticket[0]
        prompt = rng.choice(draft_prompts)
        prompt_id = prompt[0]

        # Pick 1-4 evidence chunks
        num_evidence = rng.randint(1, min(4, len(chunk_ids)))
        evidence_ids = rng.sample(chunk_ids, num_evidence)
        evidence_str = "{" + ",".join(evidence_ids) + "}"

        body = rng.choice(AGENT_RESPONSE_FRAGMENTS) + "\n\n" + rng.choice([
            "I've included the relevant documentation links below.",
            "Please refer to our knowledge base article for more details.",
            "Let me know if this resolves your issue.",
            "I've also attached a reference to our API documentation.",
        ])

        confidence = round(rng.uniform(0.40, 0.95), 3)
        send_ready = confidence > 0.70 and rng.random() < 0.80
        unresolved = None
        if confidence < 0.60:
            unresolved = "{" + ",".join([
                f'"{q}"' for q in rng.sample([
                    "Need to verify account plan details",
                    "Unclear which API version customer is using",
                    "Missing reproduction steps",
                    "Cannot confirm billing cycle dates",
                    "Integration version not specified",
                ], rng.randint(1, 2))
            ]) + "}"

        latency = rng.randint(1500, 7500)
        prompt_tokens = rng.randint(800, 2000)
        completion_tokens = rng.randint(200, 600)
        token_usage = json.dumps({
            "prompt_tokens": prompt_tokens,
            "completion_tokens": completion_tokens,
            "total_tokens": prompt_tokens + completion_tokens,
        })
        cost = round((prompt_tokens * 0.003 + completion_tokens * 0.006) / 10, 2)

        # Approval outcome for some drafts
        if rng.random() < 0.65:
            outcome = rng.choices(
                APPROVAL_STATES,
                weights=[0.10, 0.45, 0.20, 0.15, 0.10],
            )[0]
        else:
            outcome = None

        created = ticket[11]
        rows.append((
            uid(), ticket_id, prompt_id, body, evidence_str,
            confidence, null_str(unresolved), str(send_ready).lower(),
            latency, token_usage, cost, null_str(outcome), created,
        ))

    return rows


def gen_approval_actions(
    drafts: list[tuple],
    org_agents: dict[str, list[str]],
    tickets: list[tuple],
    ticket_id_to_org: dict[str, str],
) -> list[tuple]:
    """Generate approval actions for drafts that have an outcome."""
    rows = []
    for draft in drafts:
        outcome = draft[11]
        if outcome == "\\N" or outcome is None:
            continue

        draft_id = draft[0]
        ticket_id = draft[1]
        org_id = ticket_id_to_org.get(ticket_id)
        agents = org_agents.get(org_id, []) if org_id else []
        if not agents:
            continue

        actor = rng.choice(agents)
        edited_body = None
        if outcome == "edited_and_approved":
            edited_body = draft[3] + "\n\n[Edited by agent: minor clarification added]"

        reason = None
        if outcome == "rejected":
            reason = rng.choice([
                "Inaccurate information in the draft",
                "Tone needs adjustment",
                "Missing critical context",
                "Wrong customer data referenced",
            ])
        elif outcome == "escalated":
            reason = rng.choice([
                "Security concern — needs security team review",
                "Legal request — routing to legal",
                "Executive complaint — needs manager attention",
                "Complex technical issue beyond draft capability",
            ])

        created = draft[12]  # same timestamp as draft for simplicity
        rows.append((
            uid(), draft_id, actor, outcome,
            null_str(edited_body), null_str(reason), created,
        ))

    return rows


def gen_eval_data(prompt_versions: list[tuple]) -> tuple[list[tuple], list[tuple]]:
    """Generate eval sets and examples."""
    eval_sets = []
    eval_examples = []
    now = ts(DATE_START + timedelta(days=30))

    # Create 3 eval sets
    sets = [
        (uid(), "Classification Accuracy", "Tests category classification across all 8 categories", now, now),
        (uid(), "Routing Accuracy", "Tests team routing suggestion accuracy", now, now),
        (uid(), "Citation Quality", "Tests whether drafts cite relevant knowledge chunks", now, now),
    ]
    eval_sets = sets

    # Distribute 150 examples: 60 classification, 50 routing, 40 citation
    for i in range(60):
        cat = rng.choice(CATEGORIES)
        subject = rng.choice(TICKET_SUBJECTS[cat])
        text = subject.format(
            num=rng.randint(10000, 99999), month=fake.month_name(),
            company=fake.company(), date=fake.date_this_year().isoformat(),
            name=fake.name(), days=rng.randint(1, 14), email=fake.email(),
        )
        eval_examples.append((
            uid(), sets[0][0], "classification", text,
            cat, "\\N", "\\N", "{}", now, now,
        ))

    for i in range(50):
        cat = rng.choice(CATEGORIES)
        team = rng.choice(CATEGORY_TEAM_MAP[cat])
        subject = rng.choice(TICKET_SUBJECTS[cat])
        text = subject.format(
            num=rng.randint(10000, 99999), month=fake.month_name(),
            company=fake.company(), date=fake.date_this_year().isoformat(),
            name=fake.name(), days=rng.randint(1, 14), email=fake.email(),
        )
        eval_examples.append((
            uid(), sets[1][0], "routing", text,
            "\\N", team, "\\N", "{}", now, now,
        ))

    for i in range(40):
        cat = rng.choice(CATEGORIES)
        subject = rng.choice(TICKET_SUBJECTS[cat])
        text = subject.format(
            num=rng.randint(10000, 99999), month=fake.month_name(),
            company=fake.company(), date=fake.date_this_year().isoformat(),
            name=fake.name(), days=rng.randint(1, 14), email=fake.email(),
        )
        eval_examples.append((
            uid(), sets[2][0], "citation", text,
            "\\N", "\\N", "{}", "{}", now, now,
        ))

    return eval_sets, eval_examples


# ============================================================================
# Main
# ============================================================================

def truncate_all(conn):
    """Truncate all tables in reverse dependency order."""
    tables = [
        "eval_results", "eval_runs", "eval_examples", "eval_sets",
        "approval_actions", "draft_generations", "ticket_predictions",
        "ticket_assignments", "ticket_messages", "tickets",
        "knowledge_chunks", "knowledge_documents",
        "prompt_versions", "sla_policies",
        "workspace_memberships", "workspaces",
        "memberships", "users", "organizations",
    ]
    with conn.cursor() as cur:
        for t in tables:
            cur.execute(f"TRUNCATE TABLE {t} CASCADE")
    conn.commit()
    print("  All tables truncated.")


def main():
    parser = argparse.ArgumentParser(description="Seed Agent Service Desk database")
    parser.add_argument("--clean", action="store_true", help="Truncate all tables before seeding")
    args = parser.parse_args()

    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        print("ERROR: DATABASE_URL environment variable is required.")
        sys.exit(1)

    t0 = time.time()
    print("Agent Service Desk — Seed Data Generator")
    print("=" * 50)

    conn = psycopg.connect(db_url)
    conn.autocommit = False

    if args.clean:
        print("\nCleaning database...")
        truncate_all(conn)

    print("\nGenerating data...")

    # --- Organizations ---
    progress("Generating organizations", NUM_ORGS)
    orgs = gen_organizations()

    # --- Workspaces (1:1 with orgs) ---
    progress("Generating workspaces", NUM_ORGS)
    workspaces = gen_workspaces(orgs)
    org_id_to_ws = {w[1]: w[0] for w in workspaces}  # org_id → workspace_id

    # --- Users, Memberships ---
    progress("Generating users", NUM_USERS)
    users, memberships, ws_mem_temp = gen_users(orgs)

    # --- Workspace Memberships ---
    ws_memberships = gen_workspace_memberships(ws_mem_temp, workspaces, org_id_to_ws)

    # Build lookup: org_id → list of (user_id, role)
    org_users: dict[str, list[tuple]] = {}
    org_agents: dict[str, list[str]] = {}
    for user_id, org_id, role, _ in ws_mem_temp:
        org_users.setdefault(org_id, []).append((user_id, role))
        if role in ("support_agent", "team_lead"):
            org_agents.setdefault(org_id, []).append(user_id)

    # --- SLA Policies ---
    progress("Generating SLA policies", NUM_SLA_POLICIES)
    sla_policies = gen_sla_policies()

    # --- Prompt Versions ---
    progress("Generating prompt versions", 4)
    prompt_versions = gen_prompt_versions()

    # --- Tickets ---
    progress("Generating tickets", NUM_TICKETS)
    tickets = gen_tickets(orgs, org_users, org_agents, workspaces, org_id_to_ws, sla_policies)
    actual_tickets = len(tickets)

    ticket_id_to_org = {t[0]: t[1] for t in tickets}

    # --- Messages ---
    progress(f"Generating messages (~{NUM_MESSAGES_TARGET:,})", None)
    messages = gen_messages(tickets, org_agents)
    progress(f"Messages generated", len(messages))

    # --- Knowledge Documents + Chunks ---
    progress("Generating knowledge documents", NUM_KNOWLEDGE_DOCS)
    knowledge_docs, knowledge_chunks = gen_knowledge_docs(workspaces)
    progress("Knowledge chunks generated", len(knowledge_chunks))
    chunk_ids = [c[0] for c in knowledge_chunks]

    # --- Ticket Predictions ---
    progress("Generating ticket predictions", None)
    predictions = gen_ticket_predictions(tickets, prompt_versions)
    progress("Predictions generated", len(predictions))

    # --- Draft Generations ---
    progress("Generating draft generations", None)
    drafts = gen_draft_generations(tickets, prompt_versions, chunk_ids)
    progress("Drafts generated", len(drafts))

    # --- Approval Actions ---
    progress("Generating approval actions", None)
    approvals = gen_approval_actions(drafts, org_agents, tickets, ticket_id_to_org)
    progress("Approvals generated", len(approvals))

    # --- Eval Sets + Examples ---
    progress("Generating eval data", NUM_EVAL_EXAMPLES)
    eval_sets, eval_examples = gen_eval_data(prompt_versions)

    # ===================================================================
    # Insert data using COPY for performance
    # ===================================================================
    print("\nInserting data...")

    with conn.cursor() as cur:
        # Disable RLS for seeding (run as superuser)
        cur.execute("SET SESSION ROLE DEFAULT")

        progress("Inserting organizations")
        copy_insert(cur, "organizations",
            ["id", "name", "slug", "created_at", "updated_at"], orgs)

        progress("Inserting users")
        copy_insert(cur, "users",
            ["id", "email", "full_name", "avatar_url", "created_at", "updated_at"], users)

        progress("Inserting memberships")
        copy_insert(cur, "memberships",
            ["id", "user_id", "org_id", "created_at", "updated_at"], memberships)

        progress("Inserting workspaces")
        copy_insert(cur, "workspaces",
            ["id", "org_id", "name", "slug", "created_at", "updated_at"], workspaces)

        progress("Inserting workspace memberships")
        copy_insert(cur, "workspace_memberships",
            ["id", "user_id", "workspace_id", "role", "created_at", "updated_at"], ws_memberships)

        progress("Inserting SLA policies")
        copy_insert(cur, "sla_policies",
            ["id", "name", "priority", "first_response_mins", "resolution_mins",
             "description", "created_at", "updated_at"], sla_policies)

        progress("Inserting prompt versions")
        copy_insert(cur, "prompt_versions",
            ["id", "name", "type", "content", "is_active", "created_at", "updated_at"], prompt_versions)

        progress(f"Inserting tickets ({actual_tickets:,})")
        copy_insert(cur, "tickets",
            ["id", "org_id", "workspace_id", "creator_id", "assignee_id",
             "subject", "status", "priority", "category", "team", "sla_policy_id",
             "created_at", "updated_at"], tickets)

        progress(f"Inserting messages ({len(messages):,})")
        copy_insert(cur, "ticket_messages",
            ["id", "ticket_id", "sender_id", "sender_type", "body", "is_internal",
             "created_at", "updated_at"], messages)

        progress(f"Inserting knowledge documents ({len(knowledge_docs):,})")
        copy_insert(cur, "knowledge_documents",
            ["id", "workspace_id", "title", "source_filename", "content_type",
             "visibility", "status", "metadata", "created_at", "updated_at"], knowledge_docs)

        progress(f"Inserting knowledge chunks ({len(knowledge_chunks):,})")
        copy_insert(cur, "knowledge_chunks",
            ["id", "document_id", "chunk_index", "content", "embedding",
             "token_count", "metadata", "created_at", "updated_at"], knowledge_chunks)

        progress(f"Inserting ticket predictions ({len(predictions):,})")
        copy_insert(cur, "ticket_predictions",
            ["id", "ticket_id", "prompt_version_id", "predicted_category",
             "predicted_priority", "predicted_team", "escalation_suggested",
             "escalation_reason", "confidence", "latency_ms", "token_usage",
             "estimated_cost_cents", "created_at"], predictions)

        progress(f"Inserting draft generations ({len(drafts):,})")
        copy_insert(cur, "draft_generations",
            ["id", "ticket_id", "prompt_version_id", "body", "evidence_chunk_ids",
             "confidence", "unresolved_questions", "send_ready", "latency_ms",
             "token_usage", "estimated_cost_cents", "approval_outcome", "created_at"], drafts)

        progress(f"Inserting approval actions ({len(approvals):,})")
        copy_insert(cur, "approval_actions",
            ["id", "draft_generation_id", "acted_by", "action",
             "edited_body", "reason", "created_at"], approvals)

        progress("Inserting eval sets")
        copy_insert(cur, "eval_sets",
            ["id", "name", "description", "created_at", "updated_at"], eval_sets)

        progress(f"Inserting eval examples ({len(eval_examples):,})")
        copy_insert(cur, "eval_examples",
            ["id", "eval_set_id", "type", "input_text", "expected_category",
             "expected_team", "expected_chunk_ids", "metadata",
             "created_at", "updated_at"], eval_examples)

    conn.commit()
    conn.close()

    elapsed = time.time() - t0
    print(f"\n{'=' * 50}")
    print(f"Seeding complete in {elapsed:.1f}s")
    print(f"  Organizations:  {len(orgs):>8,}")
    print(f"  Users:          {len(users):>8,}")
    print(f"  Workspaces:     {len(workspaces):>8,}")
    print(f"  Tickets:        {actual_tickets:>8,}")
    print(f"  Messages:       {len(messages):>8,}")
    print(f"  Knowledge Docs: {len(knowledge_docs):>8,}")
    print(f"  Chunks:         {len(knowledge_chunks):>8,}")
    print(f"  Predictions:    {len(predictions):>8,}")
    print(f"  Drafts:         {len(drafts):>8,}")
    print(f"  Approvals:      {len(approvals):>8,}")
    print(f"  Eval Examples:  {len(eval_examples):>8,}")
    print(f"  Prompt Versions:{len(prompt_versions):>8,}")
    print(f"  SLA Policies:   {len(sla_policies):>8,}")


if __name__ == "__main__":
    main()
