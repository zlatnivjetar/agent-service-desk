-- Agent Service Desk — MVP Schema
-- Version: v0.5 (MVP)
-- Designed for forward-compatibility with V1 extensions.
-- Run with: psql $DATABASE_URL -f schema.sql

BEGIN;

-- ============================================================================
-- Extensions
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";      -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pgvector";       -- vector type + similarity search

-- ============================================================================
-- Enums
-- ============================================================================

CREATE TYPE user_role AS ENUM ('client_user', 'support_agent', 'team_lead');

CREATE TYPE ticket_status AS ENUM (
    'new', 'open', 'pending_customer', 'pending_internal',
    'resolved', 'closed'
);

CREATE TYPE ticket_priority AS ENUM ('low', 'medium', 'high', 'critical');

CREATE TYPE ticket_category AS ENUM (
    'billing', 'bug_report', 'feature_request', 'account_access',
    'integration', 'api_issue', 'onboarding', 'data_export'
);

CREATE TYPE team_name AS ENUM (
    'general_support', 'billing_team', 'engineering',
    'integrations', 'onboarding', 'account_management'
);

CREATE TYPE approval_state AS ENUM (
    'pending', 'approved', 'edited_and_approved', 'rejected', 'escalated'
);

CREATE TYPE prompt_type AS ENUM ('triage', 'draft');

CREATE TYPE message_sender_type AS ENUM ('customer', 'agent', 'system');

CREATE TYPE knowledge_visibility AS ENUM ('internal', 'client_visible');

CREATE TYPE knowledge_doc_status AS ENUM ('pending', 'processing', 'indexed', 'failed');

CREATE TYPE eval_example_type AS ENUM ('classification', 'routing', 'citation');

CREATE TYPE eval_run_status AS ENUM ('pending', 'running', 'completed', 'failed');

-- ============================================================================
-- Tables
-- ============================================================================

-- Organizations -----------------------------------------------------------------

CREATE TABLE organizations (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    slug        TEXT NOT NULL UNIQUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Users -------------------------------------------------------------------------

CREATE TABLE users (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email       TEXT NOT NULL UNIQUE,
    full_name   TEXT NOT NULL,
    avatar_url  TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Memberships (user ↔ org) ------------------------------------------------------

CREATE TABLE memberships (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    org_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, org_id)
);

-- Workspaces --------------------------------------------------------------------

CREATE TABLE workspaces (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    slug        TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (org_id, slug)
);

-- Workspace memberships (user ↔ workspace + role) --------------------------------

CREATE TABLE workspace_memberships (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    role            user_role NOT NULL DEFAULT 'client_user',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, workspace_id)
);

-- SLA Policies (static reference data — no engine in MVP) -----------------------

CREATE TABLE sla_policies (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                TEXT NOT NULL,
    priority            ticket_priority NOT NULL,
    first_response_mins INT NOT NULL,     -- target first response time in minutes
    resolution_mins     INT NOT NULL,     -- target resolution time in minutes
    description         TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tickets -----------------------------------------------------------------------

CREATE TABLE tickets (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    creator_id      UUID NOT NULL REFERENCES users(id),
    assignee_id     UUID REFERENCES users(id),
    subject         TEXT NOT NULL,
    status          ticket_status NOT NULL DEFAULT 'new',
    priority        ticket_priority NOT NULL DEFAULT 'medium',
    category        ticket_category,                    -- may be null before triage
    team            team_name,                          -- may be null before routing
    sla_policy_id   UUID REFERENCES sla_policies(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ticket Messages ---------------------------------------------------------------

CREATE TABLE ticket_messages (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id       UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    sender_id       UUID REFERENCES users(id),          -- null for system messages
    sender_type     message_sender_type NOT NULL DEFAULT 'customer',
    body            TEXT NOT NULL,
    is_internal     BOOLEAN NOT NULL DEFAULT FALSE,     -- internal notes invisible to clients
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ticket Assignments (history of who was assigned) --------------------------------

CREATE TABLE ticket_assignments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id       UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    assigned_to     UUID NOT NULL REFERENCES users(id),
    assigned_by     UUID REFERENCES users(id),
    team            team_name,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Prompt Versions ---------------------------------------------------------------

CREATE TABLE prompt_versions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    type        prompt_type NOT NULL,
    content     TEXT NOT NULL,                           -- the full prompt template
    is_active   BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ensure at most one active prompt per type
CREATE UNIQUE INDEX uq_active_prompt_per_type
    ON prompt_versions (type) WHERE is_active = TRUE;

-- Ticket Predictions (model-generated triage — separated from human data) --------

CREATE TABLE ticket_predictions (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id               UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    prompt_version_id       UUID NOT NULL REFERENCES prompt_versions(id),
    predicted_category      ticket_category,
    predicted_priority      ticket_priority,
    predicted_team          team_name,
    escalation_suggested    BOOLEAN NOT NULL DEFAULT FALSE,
    escalation_reason       TEXT,
    confidence              REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    latency_ms              INT,
    token_usage             JSONB,          -- {prompt_tokens, completion_tokens, total_tokens}
    estimated_cost_cents    REAL,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Knowledge Documents -----------------------------------------------------------

CREATE TABLE knowledge_documents (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    title           TEXT NOT NULL,
    source_filename TEXT,
    content_type    TEXT,                                -- e.g. 'text/markdown', 'application/pdf'
    visibility      knowledge_visibility NOT NULL DEFAULT 'internal',
    status          knowledge_doc_status NOT NULL DEFAULT 'pending',
    metadata        JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Knowledge Chunks --------------------------------------------------------------

CREATE TABLE knowledge_chunks (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id     UUID NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
    chunk_index     INT NOT NULL,                       -- position within the document
    content         TEXT NOT NULL,
    embedding       vector(1536),                       -- OpenAI ada-002 / text-embedding-3-small dimension
    token_count     INT,
    metadata        JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (document_id, chunk_index)
);

-- Draft Generations -------------------------------------------------------------

CREATE TABLE draft_generations (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id           UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    prompt_version_id   UUID NOT NULL REFERENCES prompt_versions(id),
    body                TEXT NOT NULL,                   -- the generated draft reply
    evidence_chunk_ids  UUID[] NOT NULL DEFAULT '{}',    -- references to knowledge_chunks
    confidence          REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    unresolved_questions TEXT[],                          -- questions the model flagged
    send_ready          BOOLEAN NOT NULL DEFAULT FALSE,
    latency_ms          INT,
    token_usage         JSONB,                           -- {prompt_tokens, completion_tokens, total_tokens}
    estimated_cost_cents REAL,
    approval_outcome    approval_state,                  -- denormalized from approval_actions for quick access
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Approval Actions --------------------------------------------------------------

CREATE TABLE approval_actions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    draft_generation_id UUID NOT NULL REFERENCES draft_generations(id) ON DELETE CASCADE,
    acted_by            UUID NOT NULL REFERENCES users(id),
    action              approval_state NOT NULL,
    edited_body         TEXT,                            -- populated only for 'edited_and_approved'
    reason              TEXT,                            -- optional note (e.g., rejection reason)
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Eval Sets ---------------------------------------------------------------------

CREATE TABLE eval_sets (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    description TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Eval Examples -----------------------------------------------------------------

CREATE TABLE eval_examples (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    eval_set_id         UUID NOT NULL REFERENCES eval_sets(id) ON DELETE CASCADE,
    type                eval_example_type NOT NULL,
    input_text          TEXT NOT NULL,                   -- ticket text or combined input
    expected_category   ticket_category,                 -- for classification examples
    expected_team       team_name,                       -- for routing examples
    expected_chunk_ids  UUID[],                          -- for citation examples
    metadata            JSONB DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Eval Runs ---------------------------------------------------------------------

CREATE TABLE eval_runs (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    eval_set_id         UUID NOT NULL REFERENCES eval_sets(id) ON DELETE CASCADE,
    prompt_version_id   UUID NOT NULL REFERENCES prompt_versions(id),
    status              eval_run_status NOT NULL DEFAULT 'pending',
    total_examples      INT NOT NULL DEFAULT 0,
    passed              INT NOT NULL DEFAULT 0,
    failed              INT NOT NULL DEFAULT 0,
    metrics             JSONB DEFAULT '{}',              -- {accuracy, routing_accuracy, citation_hit_rate}
    started_at          TIMESTAMPTZ,
    completed_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Eval Results ------------------------------------------------------------------

CREATE TABLE eval_results (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    eval_run_id         UUID NOT NULL REFERENCES eval_runs(id) ON DELETE CASCADE,
    eval_example_id     UUID NOT NULL REFERENCES eval_examples(id) ON DELETE CASCADE,
    passed              BOOLEAN NOT NULL,
    model_output        JSONB NOT NULL,                  -- raw model response
    expected_output     JSONB,                           -- expected values for comparison
    notes               TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ============================================================================
-- Indexes
-- ============================================================================

-- Foreign key indexes (Postgres does not auto-index FKs)
CREATE INDEX idx_memberships_user_id ON memberships(user_id);
CREATE INDEX idx_memberships_org_id ON memberships(org_id);
CREATE INDEX idx_workspaces_org_id ON workspaces(org_id);
CREATE INDEX idx_workspace_memberships_user_id ON workspace_memberships(user_id);
CREATE INDEX idx_workspace_memberships_workspace_id ON workspace_memberships(workspace_id);
CREATE INDEX idx_tickets_org_id ON tickets(org_id);
CREATE INDEX idx_tickets_workspace_id ON tickets(workspace_id);
CREATE INDEX idx_tickets_creator_id ON tickets(creator_id);
CREATE INDEX idx_tickets_assignee_id ON tickets(assignee_id);
CREATE INDEX idx_ticket_messages_ticket_id ON ticket_messages(ticket_id);
CREATE INDEX idx_ticket_messages_sender_id ON ticket_messages(sender_id);
CREATE INDEX idx_ticket_assignments_ticket_id ON ticket_assignments(ticket_id);
CREATE INDEX idx_ticket_predictions_ticket_id ON ticket_predictions(ticket_id);
CREATE INDEX idx_knowledge_documents_workspace_id ON knowledge_documents(workspace_id);
CREATE INDEX idx_knowledge_chunks_document_id ON knowledge_chunks(document_id);
CREATE INDEX idx_draft_generations_ticket_id ON draft_generations(ticket_id);
CREATE INDEX idx_approval_actions_draft_id ON approval_actions(draft_generation_id);
CREATE INDEX idx_eval_examples_eval_set_id ON eval_examples(eval_set_id);
CREATE INDEX idx_eval_runs_eval_set_id ON eval_runs(eval_set_id);
CREATE INDEX idx_eval_runs_prompt_version_id ON eval_runs(prompt_version_id);
CREATE INDEX idx_eval_results_eval_run_id ON eval_results(eval_run_id);
CREATE INDEX idx_eval_results_example_id ON eval_results(eval_example_id);

-- Ticket queue composite indexes (workspace + status + priority is the main queue query)
CREATE INDEX idx_tickets_queue ON tickets(workspace_id, status, priority);
CREATE INDEX idx_tickets_workspace_category ON tickets(workspace_id, category);
CREATE INDEX idx_tickets_workspace_assignee ON tickets(workspace_id, assignee_id);

-- Ticket date filtering
CREATE INDEX idx_tickets_created_at ON tickets(created_at);

-- Knowledge retrieval: visibility filtering
CREATE INDEX idx_knowledge_docs_workspace_visibility
    ON knowledge_documents(workspace_id, visibility);

-- pgvector similarity search (HNSW for better recall than IVFFlat)
CREATE INDEX idx_knowledge_chunks_embedding
    ON knowledge_chunks USING hnsw (embedding vector_cosine_ops);

-- Prompt versions lookup
CREATE INDEX idx_prompt_versions_type_active ON prompt_versions(type, is_active);

-- Draft generations by approval outcome (review queue)
CREATE INDEX idx_draft_generations_approval ON draft_generations(approval_outcome);

-- Messages ordered within a ticket
CREATE INDEX idx_ticket_messages_ticket_created
    ON ticket_messages(ticket_id, created_at);


-- ============================================================================
-- Row-Level Security
-- ============================================================================

-- Create the role that all application queries execute under.
-- The application sets config params before each query transaction.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rls_user') THEN
        CREATE ROLE rls_user NOLOGIN;
    END IF;
END
$$;

-- Grant base permissions to rls_user
GRANT USAGE ON SCHEMA public TO rls_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO rls_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO rls_user;

-- Enable RLS on all tenant-scoped tables
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE draft_generations ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE eval_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE eval_examples ENABLE ROW LEVEL SECURITY;
ALTER TABLE eval_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE eval_results ENABLE ROW LEVEL SECURITY;

-- SLA policies, prompt versions, and users are not tenant-scoped
-- (shared reference data or managed by superuser)

-- Helper: current session org
CREATE OR REPLACE FUNCTION current_org_id() RETURNS UUID AS $$
    SELECT NULLIF(current_setting('app.org_id', TRUE), '')::UUID;
$$ LANGUAGE SQL STABLE;

CREATE OR REPLACE FUNCTION current_workspace_id() RETURNS UUID AS $$
    SELECT NULLIF(current_setting('app.workspace_id', TRUE), '')::UUID;
$$ LANGUAGE SQL STABLE;

CREATE OR REPLACE FUNCTION current_user_id() RETURNS UUID AS $$
    SELECT NULLIF(current_setting('app.user_id', TRUE), '')::UUID;
$$ LANGUAGE SQL STABLE;

CREATE OR REPLACE FUNCTION current_user_role() RETURNS TEXT AS $$
    SELECT current_setting('app.user_role', TRUE);
$$ LANGUAGE SQL STABLE;

-- ---------------------------------------------------------------------------
-- RLS Policies
-- ---------------------------------------------------------------------------

-- Organizations: users can see their own org
CREATE POLICY org_isolation ON organizations
    FOR ALL TO rls_user
    USING (id = current_org_id());

-- Memberships: users can see memberships in their own org
CREATE POLICY membership_isolation ON memberships
    FOR ALL TO rls_user
    USING (org_id = current_org_id());

-- Workspaces: users can see workspaces in their own org
CREATE POLICY workspace_isolation ON workspaces
    FOR ALL TO rls_user
    USING (org_id = current_org_id());

-- Workspace memberships: users can see memberships in their workspace
CREATE POLICY ws_membership_isolation ON workspace_memberships
    FOR ALL TO rls_user
    USING (workspace_id = current_workspace_id());

-- Tickets: org-level isolation (all roles see only their org's tickets)
-- Additional workspace filtering can be done at the application layer
CREATE POLICY ticket_isolation ON tickets
    FOR ALL TO rls_user
    USING (org_id = current_org_id());

-- Ticket messages: accessible if the parent ticket is accessible
-- Client users cannot see internal notes
CREATE POLICY message_isolation ON ticket_messages
    FOR ALL TO rls_user
    USING (
        EXISTS (
            SELECT 1 FROM tickets t
            WHERE t.id = ticket_messages.ticket_id
            AND t.org_id = current_org_id()
        )
        AND (
            -- Non-client roles can see everything
            current_user_role() IN ('support_agent', 'team_lead')
            OR
            -- Client users cannot see internal notes
            (current_user_role() = 'client_user' AND is_internal = FALSE)
        )
    );

-- Ticket assignments: accessible if the parent ticket is accessible
CREATE POLICY assignment_isolation ON ticket_assignments
    FOR ALL TO rls_user
    USING (
        EXISTS (
            SELECT 1 FROM tickets t
            WHERE t.id = ticket_assignments.ticket_id
            AND t.org_id = current_org_id()
        )
    );

-- Ticket predictions: only support agents and team leads (not client users)
CREATE POLICY prediction_isolation ON ticket_predictions
    FOR ALL TO rls_user
    USING (
        current_user_role() IN ('support_agent', 'team_lead')
        AND EXISTS (
            SELECT 1 FROM tickets t
            WHERE t.id = ticket_predictions.ticket_id
            AND t.org_id = current_org_id()
        )
    );

-- Knowledge documents: workspace isolation + visibility
CREATE POLICY knowledge_doc_isolation ON knowledge_documents
    FOR ALL TO rls_user
    USING (
        workspace_id = current_workspace_id()
        AND (
            current_user_role() IN ('support_agent', 'team_lead')
            OR
            (current_user_role() = 'client_user' AND visibility = 'client_visible')
        )
    );

-- Knowledge chunks: accessible if the parent document is accessible
CREATE POLICY knowledge_chunk_isolation ON knowledge_chunks
    FOR ALL TO rls_user
    USING (
        EXISTS (
            SELECT 1 FROM knowledge_documents kd
            WHERE kd.id = knowledge_chunks.document_id
            AND kd.workspace_id = current_workspace_id()
            AND (
                current_user_role() IN ('support_agent', 'team_lead')
                OR (current_user_role() = 'client_user' AND kd.visibility = 'client_visible')
            )
        )
    );

-- Draft generations: only support agents and team leads
CREATE POLICY draft_isolation ON draft_generations
    FOR ALL TO rls_user
    USING (
        current_user_role() IN ('support_agent', 'team_lead')
        AND EXISTS (
            SELECT 1 FROM tickets t
            WHERE t.id = draft_generations.ticket_id
            AND t.org_id = current_org_id()
        )
    );

-- Approval actions: only support agents and team leads
CREATE POLICY approval_isolation ON approval_actions
    FOR ALL TO rls_user
    USING (
        current_user_role() IN ('support_agent', 'team_lead')
        AND EXISTS (
            SELECT 1 FROM draft_generations dg
            JOIN tickets t ON t.id = dg.ticket_id
            WHERE dg.id = approval_actions.draft_generation_id
            AND t.org_id = current_org_id()
        )
    );

-- Eval tables: team leads only
CREATE POLICY eval_set_access ON eval_sets
    FOR ALL TO rls_user
    USING (current_user_role() = 'team_lead');

CREATE POLICY eval_example_access ON eval_examples
    FOR ALL TO rls_user
    USING (current_user_role() = 'team_lead');

CREATE POLICY eval_run_access ON eval_runs
    FOR ALL TO rls_user
    USING (current_user_role() = 'team_lead');

CREATE POLICY eval_result_access ON eval_results
    FOR ALL TO rls_user
    USING (current_user_role() = 'team_lead');


-- ============================================================================
-- Updated-at trigger (auto-set updated_at on UPDATE)
-- ============================================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all tables with updated_at
DO $$
DECLARE
    tbl TEXT;
BEGIN
    FOR tbl IN
        SELECT table_name FROM information_schema.columns
        WHERE column_name = 'updated_at'
        AND table_schema = 'public'
    LOOP
        EXECUTE format(
            'CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON %I
             FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
            tbl
        );
    END LOOP;
END;
$$;

COMMIT;
