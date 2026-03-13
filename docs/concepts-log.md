# Concepts Log

Appended automatically when COMPLETED is triggered in Claude Code.

---

## Milestone 1B: Schema Deployment & Seed Data

**What we built and why**

This milestone takes the schema we designed in 1A and makes it real: we deployed it to a live Neon Postgres database, populated it with realistic fake data, and created three stable demo accounts that will be used to log in and exercise every part of the system. Without this step, all subsequent milestones — the API, the AI pipelines, the frontend — would have nothing to read from or write to. It's the foundation everything else assumes exists.

**Key concepts under the hood**

*PostgreSQL COPY vs. INSERT.* The seed script uses `COPY ... FROM STDIN` rather than individual `INSERT` statements. COPY is a bulk-load protocol that bypasses most of the per-row overhead (parsing, planning, constraint checks per row) and loads data in a single pass. For 80,000 messages this made seeding finish in ~50 seconds instead of the several minutes row-by-row inserts would take. The tradeoff: COPY uses a tab-delimited text format with `\N` as the NULL sentinel, so you need careful escaping. We hit this directly — `escape_copy()` was double-escaping the backslash in `\N`, turning the NULL sentinel into the literal two-character string `\N`. The fix was to check for the sentinel before calling the escape function.

*Row-Level Security (RLS) and the `rls_user` role.* The schema creates a restricted Postgres role called `rls_user` and attaches policies to every tenant-scoped table. When the application runs queries, it sets `SET LOCAL ROLE rls_user` plus session variables (`app.org_id`, `app.workspace_id`, etc.), and Postgres enforces the policies automatically at the storage layer — no application-level WHERE clauses needed. During seeding we bypass this with `RESET ROLE`, which drops back to the superuser (who is exempt from RLS by default). Without the `rls_user` role and policies, a bug in an API route could leak one tenant's tickets to another tenant's session with no safety net.

*Deterministic UUIDs for demo accounts.* The three demo users (`agent@demo.com`, `lead@demo.com`, `client@demo.com`) have hardcoded UUIDs (`00000000-0000-4000-a000-00000000000{1,2,3}`). The rest of the seed is generated from a fixed random seed (42), which makes it reproducible but not human-readable. Hardcoding the demo UUIDs means the auth layer in 1C can reference them by ID in tests without having to query first, and `demo_accounts.py` is fully idempotent — it uses `ON CONFLICT DO NOTHING` on every insert, so running it twice produces the same state.

*`ctid` for insertion-order lookup.* To find "Org #1" (the first org inserted by `seed.py`), we query `ORDER BY ctid ASC`. `ctid` is Postgres's internal physical row address — it encodes the heap page and slot number. Since `COPY` inserts rows sequentially onto heap pages, the smallest `ctid` reliably corresponds to the first row inserted. This is more direct than ordering by `created_at` (which is randomized in the seed) or trying to simulate the RNG to predict the UUID.

*Neon extension naming.* Neon's managed Postgres registers the pgvector extension under the name `"vector"`, not `"pgvector"`. The `CREATE EXTENSION IF NOT EXISTS "pgvector"` call that works on self-hosted Postgres silently fails on Neon with a "control file not found" error. The fix is a one-word change in `schema.sql`, but it's the kind of environment-specific detail that's invisible until you try to deploy.

**How these pieces connect**

The schema and seed data are the contract that every other component depends on. The RLS policies we deployed here are what `get_rls_db` in `api/app/deps.py` (from 1A) enforces on every request — if the policies weren't deployed correctly, the entire access control model silently breaks. The demo account UUIDs and the org/workspace IDs they belong to are what the auth flow in 1C will embed in JWTs and what the frontend in later milestones will use to render a realistic demo. Getting the data shape wrong here means debugging every downstream component against a broken foundation.
