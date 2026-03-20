#!/usr/bin/env python3
"""
Apply dashboard schema additions to an existing database.

Run from repo root:
  DATABASE_URL=postgres://... python seed/migrate_dashboard.py
"""
import os
import sys

import psycopg

db_url = os.environ.get("DATABASE_URL")
if not db_url:
    sys.exit("ERROR: DATABASE_URL environment variable is required.")

SQL = """
CREATE TABLE IF NOT EXISTS dashboard_preferences (
    user_id                         UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    workspace_id                    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    landing_page                    TEXT NOT NULL DEFAULT 'overview'
        CHECK (landing_page IN ('overview', 'tickets')),
    time_zone                       TEXT NOT NULL DEFAULT 'browser'
        CHECK (time_zone IN ('browser', 'UTC')),
    overview_density                TEXT NOT NULL DEFAULT 'comfortable'
        CHECK (overview_density IN ('comfortable', 'compact')),
    tickets_density                 TEXT NOT NULL DEFAULT 'comfortable'
        CHECK (tickets_density IN ('comfortable', 'compact')),
    overview_visible_columns        TEXT[] NOT NULL DEFAULT ARRAY[
        'subject', 'status', 'priority', 'created', 'assignee', 'category'
    ],
    tickets_visible_columns         TEXT[] NOT NULL DEFAULT ARRAY[
        'subject', 'status', 'priority', 'created', 'assignee', 'org', 'category', 'confidence'
    ],
    overview_auto_refresh_seconds   INT NOT NULL DEFAULT 30
        CHECK (overview_auto_refresh_seconds IN (0, 30, 60)),
    tickets_auto_refresh_seconds    INT NOT NULL DEFAULT 0
        CHECK (tickets_auto_refresh_seconds IN (0, 30, 60)),
    overview_default_view_id        UUID,
    tickets_default_view_id         UUID,
    created_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dashboard_saved_views (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    page            TEXT NOT NULL CHECK (page IN ('overview', 'tickets')),
    name            TEXT NOT NULL,
    state           JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'dashboard_saved_views_user_id_page_name_key'
    ) THEN
        ALTER TABLE dashboard_saved_views
            ADD CONSTRAINT dashboard_saved_views_user_id_page_name_key
            UNIQUE (user_id, page, name);
    END IF;
END
$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON dashboard_preferences TO rls_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON dashboard_saved_views TO rls_user;

CREATE INDEX IF NOT EXISTS idx_dashboard_preferences_workspace_user
    ON dashboard_preferences(workspace_id, user_id);
CREATE INDEX IF NOT EXISTS idx_dashboard_saved_views_workspace_user_page
    ON dashboard_saved_views(workspace_id, user_id, page);

ALTER TABLE dashboard_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE dashboard_saved_views ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'dashboard_preferences'
          AND policyname = 'dashboard_preferences_access'
    ) THEN
        CREATE POLICY dashboard_preferences_access ON dashboard_preferences
            FOR ALL TO rls_user
            USING (
                workspace_id = current_workspace_id()
                AND user_id = current_user_id()
            )
            WITH CHECK (
                workspace_id = current_workspace_id()
                AND user_id = current_user_id()
            );
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'dashboard_saved_views'
          AND policyname = 'dashboard_saved_view_access'
    ) THEN
        CREATE POLICY dashboard_saved_view_access ON dashboard_saved_views
            FOR ALL TO rls_user
            USING (
                workspace_id = current_workspace_id()
                AND user_id = current_user_id()
            )
            WITH CHECK (
                workspace_id = current_workspace_id()
                AND user_id = current_user_id()
            );
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'trg_set_updated_at_dashboard_preferences'
    ) THEN
        CREATE TRIGGER trg_set_updated_at_dashboard_preferences
            BEFORE UPDATE ON dashboard_preferences
            FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'trg_set_updated_at_dashboard_saved_views'
    ) THEN
        CREATE TRIGGER trg_set_updated_at_dashboard_saved_views
            BEFORE UPDATE ON dashboard_saved_views
            FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    END IF;
END
$$;
"""

print("Applying dashboard migration...")
conn = psycopg.connect(db_url)
conn.autocommit = True
with conn.cursor() as cur:
    cur.execute(SQL)
conn.close()
print("Dashboard migration complete.")
