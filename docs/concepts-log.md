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

---

## Milestone 1C: Authentication Flow

**What we built and why**

This milestone wires together the two halves of the system so they can trust each other. Before this, the browser had no way to prove its identity to FastAPI, and FastAPI had no way to know which tenant was making a request. We built the full chain: BetterAuth handles browser login and sessions in Next.js; a token endpoint mints a short-lived JWT from that session; and FastAPI validates that JWT on every request. After this milestone, every API call carries a verified identity.

**Key concepts under the hood**

*Why two auth layers (BetterAuth + JWT)?* BetterAuth lives in Next.js and manages the browser session — email/password login, cookies, session renewal. FastAPI is a completely separate process and can't read Next.js cookies. The solution is to treat the JWT as a translation layer: Next.js's `/api/token` route reads the BetterAuth session (which it can verify directly), looks up the user's org/workspace/role from our database, and signs a compact JWT. FastAPI only needs to verify the JWT signature with a shared secret — it never calls BetterAuth. This keeps the two services fully decoupled while maintaining a single source of truth for identity.

*JWT signing with `jose`.* The `jose` library (used in `token/route.ts`) signs JWTs using the HS256 algorithm: a HMAC-SHA256 signature computed over the header + payload using the `JWT_SECRET`. FastAPI's `PyJWT` library verifies it using the same secret. The JWT carries `user_id`, `org_id`, `workspace_id`, and `role` as claims with a 1-hour expiry. Without the expiry, a stolen token would be valid forever. Without the signature, any client could forge claims. The shared secret means both services must have the same `JWT_SECRET` in their `.env.local` — a mismatch silently breaks all API calls.

*Email as the join key in `token/route.ts`.* When the token route reads the BetterAuth session, it gets BetterAuth's own user ID (an auto-generated string like `M0NGiNfUfC9sRNTPmrGHrYR1ils7dRH4`), not our app's UUID. Rather than adding a `better_auth_id` column to our `users` table, we join on email — both our `users` table and BetterAuth's `user` table share the email field. The query joins `users → memberships → workspace_memberships` to get the full set of claims. This keeps the schema clean and works because email is enforced unique in both tables.

*Next.js 16 `proxy.ts` vs. `middleware.ts`.* In Next.js 16, the `middleware.ts` convention was deprecated in favour of `proxy.ts`, and the exported function must be named `proxy` (not `middleware`). The proxy runs before every matched request and checks for the presence of BetterAuth's session cookie (`better-auth.session_token`). It does NOT validate the cookie — just checks it exists. Full validation happens in server routes that call `auth.api.getSession()`. The cookie-presence check is enough to gate navigation (unauthenticated users get redirected to `/login`) without needing a database round-trip on every page load.

*BetterAuth's internal Kysely adapter.* BetterAuth uses Kysely as its SQL query builder under the hood. When you pass a `pg.Pool` to `betterAuth({ database: pool })`, BetterAuth detects that the object has a `connect` method and automatically wraps it in `new PostgresDialect({ pool })`. There is no CLI for migrations in BetterAuth 1.5.x (the `bin` field in `package.json` is empty). Instead, the internal context object (accessible at `auth.$context`, a Promise) exposes `runMigrations()`, which we call from `seed/migrate_auth.ts`. This is not part of the public API and was discovered by reading the compiled source in `dist/`.

**How these pieces connect**

The JWT that `token/route.ts` mints is exactly what FastAPI's `get_current_user` dependency (from 1A) decodes on every request. The claims it extracts — `user_id`, `org_id`, `workspace_id`, `role` — are what `get_rls_db` (also from 1A) sets as Postgres session variables to activate RLS. If the token mints the wrong `org_id` or `workspace_id`, every query in the system silently returns wrong-tenant data or nothing at all. The next milestone (1D) verifies that RLS is actually activated correctly by adding integration tests against the live database.

---

## Milestone 1D: RLS Middleware in FastAPI

**What we built and why**

This milestone activates the Row-Level Security policies that were deployed in 1B but never actually enforced. Before this, every FastAPI route was connecting to Postgres as the superuser, which bypasses RLS entirely — meaning any authenticated user could theoretically read any org's data. We wired in a `get_rls_db` dependency that wraps every request's database connection in a transaction, switches to the restricted `rls_user` role, and sets the four session variables the RLS policies read. After this milestone, data isolation is enforced at the database layer, not the application layer.

**Key concepts under the hood**

*`SET LOCAL` requires a transaction.* PostgreSQL's `SET LOCAL` scopes a session variable to the current transaction — when the transaction ends, the variable resets. This is ideal for connection pooling: you set `SET LOCAL ROLE rls_user` at the start of a request, run all your queries, and when the connection returns to the pool the role automatically drops back. But `SET LOCAL` only works inside an explicit transaction. Without `conn.transaction()`, psycopg operates in autocommit mode and `SET LOCAL` silently has no effect — queries run as the superuser the whole time. The original `deps.py` was missing the `conn.transaction()` wrapper, so RLS was never activating despite the code looking correct.

*`GRANT rls_user TO neondb_owner`.* To `SET ROLE rls_user`, the current Postgres user must be a member of that role. The schema created `rls_user` and granted it table permissions, but never made `neondb_owner` (the app's connection user) a member. This is a Postgres security requirement — you can't switch into a role you don't belong to. The fix is one line: `GRANT rls_user TO neondb_owner`. Without it, every request that tries to activate RLS gets `permission denied to set role "rls_user"` and returns a 500.

*RLS policies filter at the row level, not the query level.* The four session variables — `app.org_id`, `app.workspace_id`, `app.user_id`, `app.user_role` — are read by helper functions in the schema (`current_org_id()`, `current_user_role()`, etc.) that the RLS policies call on every row access. A `SELECT * FROM tickets` with RLS active returns only rows where `org_id = current_org_id()`. A `client_user` querying `ticket_messages` gets only non-internal rows because the `message_isolation` policy appends `AND (current_user_role() = 'client_user' AND is_internal = FALSE)`. This happens inside Postgres — the application never writes WHERE clauses for tenant isolation, and a missing WHERE clause can't accidentally leak data.

**How these pieces connect**

Every route handler written from here on uses `Depends(get_rls_db)` instead of `Depends(get_db)` — this is the convention that makes all of Milestone 2 (the full API layer) safe by default. If a developer accidentally uses `get_db` in a user-facing route, they bypass RLS and expose cross-tenant data with no other safety net. The debug endpoints we built here are temporary but serve as the integration test harness for RLS correctness — the fact that `client_user` sees `internal: 0` and fewer knowledge docs proves the policies are actually firing, not just defined.

---

## Milestone 2B: Knowledge Document Endpoints

**What we built and why**

This milestone exposes the knowledge base through the API — the documents and chunks that the RAG drafting pipeline will search over in Milestone 3. For now the endpoints are deliberately minimal: list, detail, upload (creates a record at `status=pending`), and delete. The ingestion pipeline that actually parses, chunks, and embeds uploaded files comes later. This gives the system a stable API contract for the knowledge domain before the AI layer is wired in.

**Key concepts under the hood**

*RLS handling visibility without application code.* The `knowledge_documents` table has a `visibility` column (`internal` or `client_visible`), and the RLS policy in the schema filters rows based on `current_user_role()`. A `client_user` querying the list endpoint gets only `client_visible` docs — not because the router adds a WHERE clause, but because Postgres strips the other rows before they reach the application. This is validated directly: the agent sees 10 docs, the client sees 6. If someone accidentally removed the RLS policy, clients would see internal docs (internal knowledge, workarounds, escalation procedures) that are supposed to be agent-only.

*`Jsonb()` wrapper for psycopg 3 JSONB columns.* When inserting a Python dict into a JSONB column, psycopg 3 can't automatically adapt a plain `dict` type using a `%s` placeholder. You must wrap it with `psycopg.types.json.Jsonb(my_dict)`. This is different from psycopg 2, which would silently serialize the dict. Without the wrapper you get `ProgrammingError: cannot adapt type 'dict'` at runtime. We use this to store the raw uploaded file content in `metadata.raw_content` as a staging area for the ingestion pipeline.

*Connection pool health checks for Neon.* Neon's serverless Postgres aggressively closes idle connections. A `ConnectionPool` without a `check` function hands out connections from the pool without testing them first — if Neon dropped the connection while it was idle, the first query on that connection fails with `SSL connection has been closed unexpectedly`. Adding `check=_check_connection` (which runs `SELECT 1`) tells the pool to verify each connection before use and discard broken ones. The overhead is one trivial query per checkout, which is negligible compared to the alternative of random 500s.

*Upload stored as pending, not immediately processed.* The `POST /knowledge/documents` endpoint inserts a row with `status=pending` and stores the raw file content in JSONB metadata. It does not parse, chunk, or embed. This separation is intentional: ingestion is a slow, expensive, async operation (embedding an entire document costs API calls and time), while the upload endpoint must return quickly. The `status` field (`pending → processing → indexed`) tracks the document through its lifecycle, and the frontend can poll or subscribe to see when a doc becomes searchable.

**How these pieces connect**

The `knowledge_documents` and `knowledge_chunks` tables set up in 1B are now fully accessible through the API. When the ingestion pipeline is built in Milestone 3, it will read `status=pending` docs from the DB, chunk and embed them, write to `knowledge_chunks`, and update `status=indexed`. The retrieval pipeline (also Milestone 3) will query `knowledge_chunks.embedding` via pgvector to find relevant chunks for a given ticket — that's the data the `GET /knowledge/documents/{doc_id}` detail endpoint already exposes (minus the embedding vectors, which are never returned to clients). Getting the schema shapes right here means the RAG pipeline can be built against real, stable data.

---

## Milestone 2A: Ticket & Message Endpoints

**What we built and why**

This milestone is the first real API surface — the endpoints the frontend will call to display the ticket queue, open a ticket detail, update ticket fields, post messages, and reassign tickets. Before this, the system could authenticate users and enforce RLS, but had no data-serving layer. Everything in Milestone 2 follows the same pattern: thin route handlers, Pydantic schemas for shapes, and SQL isolated in query functions. The tickets domain is the largest and most central, so getting the pattern right here means 2B and 2C can follow the same structure cleanly.

**Key concepts under the hood**

*Router → Schema → Query separation.* Each endpoint in `routers/tickets.py` is intentionally thin: it validates the incoming request via Pydantic, calls a function in `queries/tickets.py`, and returns a schema. No SQL lives in the router; no HTTP concepts (status codes, request bodies) leak into the query layer. This separation matters because the query layer is reused across multiple endpoints — `get_ticket()` is called by `GET /tickets/{id}`, `PATCH /tickets/{id}`, and `POST /tickets/{id}/assign`. If the SQL were inline in each route handler, a bug fix would need to be applied in three places.

*Whitelisting sort parameters before SQL interpolation.* Pagination filters like `status=open` are passed as `%s` parameters and are safe. But `ORDER BY t.{sort_by} {sort_order}` cannot be parameterized — Postgres doesn't allow column names or keywords as bind parameters. We solve this by checking `sort_by` against `_ALLOWED_SORT_COLUMNS` (a set of known column names) and `sort_order` against `{"asc", "desc"}` before interpolating them. Without the whitelist, a malicious `sort_by=id; DROP TABLE tickets--` in the query string would be executed as SQL.

*Dynamic UPDATE with a field whitelist.* `PATCH /tickets/{id}` accepts a partial update body — any subset of `{status, priority, assignee_id, category, team}`. The query builds a SET clause dynamically from whichever fields are non-null. The field names come from a Pydantic model (not raw user input), but we still check them against `_ALLOWED_UPDATE_FIELDS` before interpolating into the SET clause. Values are always passed as `%s` parameters. This pattern is the safe way to implement partial updates in SQL without an ORM.

*Aggregating sub-queries into a detail response.* `GET /tickets/{id}` returns a `TicketDetail` that embeds messages, the latest prediction, the latest draft, and assignment history. These live in four separate tables, so we make four separate queries rather than a single large JOIN. JOINs with one-to-many relationships (one ticket, many messages) cause row multiplication that requires deduplication logic; separate queries are simpler, predictable, and easier to read. The `_build_detail()` helper in the router collects all four results and assembles the response, and is reused by the PATCH and assign endpoints which also return `TicketDetail`.

**How these pieces connect**

The RLS enforcement from 1D is invisible here but active on every query — the ticket list is already scoped to the current user's org, and internal messages are already filtered for `client_user` sessions, with no WHERE clauses written in the query functions. The `schemas/` and `queries/` packages established here are the template for 2B (knowledge documents) and 2C (review queue), which add new files to those packages following the exact same structure. When the frontend is built in Milestone 4, it will call these endpoints directly — getting the response shape right now means the frontend can be built against a stable contract.