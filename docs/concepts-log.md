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

## Milestone 2C: Review Queue & Approval Endpoints

**What we built and why**

This milestone adds the human-in-the-loop layer: the interface through which support agents review AI-generated drafts and decide whether to approve, edit, reject, or escalate them. Before this, the system could generate and store drafts (via seed data), but there was no way to act on them. The review queue is the operational heart of the product — it's the screen an agent opens every morning to work through pending replies.

**Key concepts under the hood**

*Denormalized `approval_outcome` on `draft_generations`.* The `approval_actions` table is the authoritative record of who did what and when. But the review queue needs to efficiently filter for drafts that haven't been acted on yet — scanning `approval_actions` for every draft on every page load would be expensive. Instead, the schema also stores `approval_outcome` directly on `draft_generations` as a denormalized copy. When `POST /drafts/{id}/review` runs, it writes to both tables: inserts the `approval_actions` row (the audit trail) and updates `draft_generations.approval_outcome` (the fast-query field). Without the denormalized column, the queue query would need a NOT EXISTS subquery across a large table on every request.

*Application-level role checks layered on top of RLS.* RLS policies already prevent `client_user` sessions from reading `draft_generations` at the database level — a client querying the review queue would get an empty result set, not a 403. But an empty result set is a confusing response for an unauthorized action. The `require_role()` helper in the router raises a 403 before the query runs, giving the caller a clear signal that the endpoint is off-limits for their role. The two layers serve different purposes: RLS is the safety net that enforces isolation even if application code has a bug; the application check provides the correct HTTP semantics.

*Writing a state transition to two tables atomically.* Approving a draft involves three writes: inserting an `approval_actions` row, updating `draft_generations.approval_outcome`, and (for `approved` or `edited_and_approved`) updating `tickets.status` to `pending_customer`. All three happen inside the same psycopg connection, which is already wrapped in a transaction by `get_rls_db`. If the process crashes after the first write but before the third, the database is left in an inconsistent state — a draft marked approved with a ticket still showing its old status. The transaction wrapper means all three writes either commit together or roll back together.

**How these pieces connect**

The `approval_actions` table written here will be read by the eval harness in Milestone 5 — it's how the system measures whether agent edits to AI drafts correlate with low-confidence scores, which feeds back into prompt improvement. The `ticket.status = 'pending_customer'` transition written here is what the frontend's ticket queue will use to surface "ready to send" tickets in Milestone 4. If the status transition were missing or written to the wrong value, the ticket would stay stuck in its previous state and the agent would have no way to know a reply was ready.

---

## Milestone 2D: Eval API Endpoints

**What we built and why**

This milestone adds the read layer for the evaluation system — the endpoints the team lead console will use to browse eval sets, inspect examples, create eval runs, and compare two runs side-by-side. The actual model execution that fills in results comes in Milestone 5; what we're building now is the scaffolding that holds those results and exposes them through a stable API. It's also the first part of the system that's genuinely team_lead-only — eval data has no relevance to agents or clients.

**Key concepts under the hood**

*Route ordering for static vs. dynamic segments.* FastAPI matches routes in the order they're registered. `GET /eval/runs/compare` and `GET /eval/runs/{run_id}` both start with `/eval/runs/` — if `{run_id}` is registered first, FastAPI tries to parse the string `"compare"` as a UUID, fails, and returns a 422 instead of matching the compare route. The fix is simply registering `/runs/compare` before `/runs/{run_id}` in the router file. This is a general FastAPI rule: any static path segment that conflicts with a dynamic one must be declared first.

*Two-layer access control: RLS + application check.* The eval RLS policies (`eval_set_access`, `eval_run_access`, etc.) block non-`team_lead` sessions at the database level — a `support_agent` querying `eval_sets` gets zero rows back, not an error. But zero rows is the wrong HTTP response for an unauthorized action; it looks like the data doesn't exist rather than being off-limits. The `require_role()` check at the top of each route handler fires before any query runs and returns a 403 with a clear message. The two layers serve different purposes: RLS is the safety net, the application check gives correct semantics.

*POST then SELECT for join-enriched responses.* `POST /eval/runs` inserts a row and needs to return `EvalRunListItem`, which includes `eval_set_name` and `prompt_version_name` from joined tables. `INSERT ... RETURNING` only returns columns from the inserted row — it can't follow foreign keys. Rather than duplicating the join in the INSERT, we insert, get back the new `id` from RETURNING, then immediately call `get_eval_run()` which runs the full SELECT with the joins. This keeps the insert SQL clean and reuses the same read query that all other run-fetching paths use.

**How these pieces connect**

The eval data model established here — sets → examples → runs → results — is the schema that Milestone 5's eval runner will write into. If the schemas or queries defined here model the relationships incorrectly, the runner will either fail to insert results or the comparison endpoint will produce nonsense diffs. The `GET /prompt-versions` endpoint, while simple, is what the eval console UI will use to populate the "which prompt to test against" dropdown — it needs to exist and return stable data before the frontend can build that screen.

---

## Milestone 3A: OpenAI Provider Module

**What we built and why**

This milestone wraps the OpenAI SDK into a single internal module that exposes exactly the three AI operations the system needs: structured classification (`classify`), vector embedding (`embed` / `embed_batch`), and tool-calling generation (`generate_with_tools`). Every AI pipeline in the system — triage, drafting, retrieval — will call this module rather than touching the SDK directly. The goal is to keep all OpenAI-specific knowledge (model names, API shapes, retry logic, cost estimation) in one place so the rest of the codebase can treat AI as a simple function call.

**Key concepts under the hood**

*The agentic tool-calling loop.* `generate_with_tools()` implements a multi-turn pattern: send a request with tools defined, check whether the response contains function calls, execute them locally via `tool_executor`, then send the results back using `previous_response_id` to continue the same conversation. This repeats up to three times (the safety limit) before either returning the final text or raising `ProviderError`. The `previous_response_id` chaining is specific to the Responses API — the server accumulates context between turns so we never have to build a growing messages array ourselves. Without the round limit, a badly-behaved model could call tools indefinitely; without `previous_response_id`, each turn would start from scratch and the model couldn't see what it already retrieved.

*Retry with exponential backoff and non-retryable error discrimination.* `_call_with_retries()` catches `RateLimitError`, `APITimeoutError`, and `APIError`, but not blindly — `_should_retry()` inspects the error before deciding whether to back off or give up immediately. A `RateLimitError` with code `insufficient_quota` means the account has no credits; retrying is pointless and wastes time, so it raises immediately. A transient 429 (rate limiting, not quota) or any 5xx is worth retrying with `0.5 * 2^(attempt-1)` second delays. Without this discrimination, a permanently broken API key would silently burn through all three retry attempts before surfacing the real error.

*HTTP-layer testing as a substitute for live API calls.* The real OpenAI client uses `httpx` internally. By passing a custom `httpx.BaseTransport` via `OpenAI(http_client=httpx.Client(transport=...))`, we can intercept all HTTP traffic and return pre-crafted responses — the full SDK serialization and deserialization runs, so mistakes in the request JSON shape (wrong field name, wrong nesting) or response attribute access (`response.output_text`, `response.usage.input_tokens`) surface as test failures rather than being hidden by mocks that stub the SDK client directly. This is meaningfully different from the SDK-level mocks also in the test file, which bypass the SDK entirely and couldn't have caught, for example, that the Responses API uses `text={"format": {...}}` rather than `response_format=`.

**How these pieces connect**

The provider module is the floor everything in Milestone 3 builds on. The triage pipeline (3B) calls `classify()`, the retrieval pipeline (3C) calls `embed()`, and the drafting pipeline (3D) calls `generate_with_tools()`. If any of those function signatures, return shapes, or error types are wrong here, every downstream pipeline breaks at the same spot. The `estimated_cost_cents` field returned by each function is also what the eval harness (Milestone 5) will use to track the cost of running eval sets — getting the token-to-cost arithmetic right now means eval cost reporting is trustworthy without any further changes.

---

## Milestone 3B: Triage Pipeline

**What we built and why**

This milestone is the first AI workflow in the system — it takes an incoming support ticket and classifies it: category, urgency, recommended team, escalation flag, and confidence score. It sits between the provider module (which handles raw OpenAI calls) and the human review layer (which decides what to do with AI output). The pipeline's central design constraint is that predictions are stored separately and never automatically applied — this separation is what makes the eval harness in Milestone 5 possible.

**Key concepts under the hood**

*Predictions stored separately from ticket fields.* The model's output goes into a dedicated `ticket_predictions` table, not back onto `ticket.category` or `ticket.priority`. This separation is the architectural decision that makes accuracy measurement meaningful: you need both what the model predicted and what the agent ultimately chose to exist as independent records. If predictions overwrote ticket fields, you'd destroy the ground truth needed to measure whether the model is improving across prompt versions. It also means triage can be run multiple times on the same ticket without corrupting ticket state — each call appends a new row.

*Prompt content loaded from the database at runtime.* The triage system prompt is fetched from `prompt_versions` on every call (filtered for `type='triage' AND is_active=TRUE`), rather than being hardcoded in the pipeline. This matters because the eval harness needs to compare predictions produced by different prompt versions — if the prompt were baked into code, evaluating v1 vs v2 would require two separate deployments. With prompts in the database, a team lead can mark a new version active, run triage, and immediately have a fresh set of predictions to compare. The `prompt_version_id` stored on every prediction row is the link that makes that comparison queryable.

*Structured output as a reliability contract.* The classification call passes a JSON schema (`TRIAGE_RESPONSE_SCHEMA`) that constrains the model to return a specific shape with valid enum values for category, urgency, and team. This isn't just a parsing convenience — it's a guarantee that the model's output can be written directly to the database. Without it, the model might return a free-text response like "This looks like a billing issue" that can't be stored in the `predicted_category` column. The schema also enforces the enum values, so a response with `"urgency": "very urgent"` is rejected by the API before it reaches the application, rather than silently storing an invalid value.

**How these pieces connect**

This pipeline is the first real consumer of the provider module from 3A — it calls `classify()` and depends on the return shape (`result`, `latency_ms`, `token_usage`, `estimated_cost_cents`) being stable and correct. The `prompt_version_id` stored on every prediction is the foreign key the eval harness (Milestone 5) uses to isolate which predictions came from which prompt when computing accuracy comparisons. If the wrong `prompt_version_id` were stored here — or the prediction shape were missing fields — the eval runner would either fail to insert results or produce comparisons that mix predictions from different prompts, making the metrics meaningless.

---

## Milestone 3C: Knowledge Retrieval

**What we built and why**

This milestone adds the retrieval half of RAG (Retrieval-Augmented Generation): given a natural language query, find the most semantically relevant chunks of documentation from the knowledge base. It sits between the embeddings capability in the provider module and the drafting pipeline in 3D, which will call this function as a tool to gather evidence before writing a reply. Without retrieval, the drafting pipeline would have to hallucinate answers from nothing; with it, the model can ground its response in real, citable documentation.

**Key concepts under the hood**

*Cosine similarity search with pgvector.* When you embed two pieces of text, semantically similar content produces vectors that point in roughly the same direction in high-dimensional space. Cosine distance (`<=>` in pgvector) measures the angle between two vectors — 0 means identical direction (highly similar), 1 means perpendicular (unrelated). By embedding the query and sorting chunks by `embedding <=> query_vector`, we get the chunks whose meaning is closest to what the user asked — not just chunks that share keywords. This is fundamentally different from a `LIKE '%billing%'` search, which would miss a chunk that says "subscription cancellation refund" if the query says "how do I get my money back".

*Belt-and-suspenders workspace filtering.* The `WHERE kd.workspace_id = %s` clause in the query exists even though RLS already limits the connection to the current workspace. The reason is defence in depth: pgvector's index scans (IVFFLAT, HNSW) pre-filter candidates before the planner applies row-level policies, and in some query plans RLS predicates can be applied after the top-k candidates are already selected rather than before. Passing `workspace_id` explicitly in the WHERE clause forces the planner to scope the search correctly regardless of how it chooses to apply RLS. Without it, a query might return chunks from another workspace that happened to score highly, with RLS only filtering them out later — or not at all if the planner chose a plan that evaluated similarity first.

*Vector as a string literal cast to the `vector` type.* psycopg 3 has no native type adapter for pgvector — it doesn't know how to turn a Python `list[float]` into a `vector` column value. The solution is to format the list as a string (`[0.1, 0.2, ...]`) and append `::vector` to cast it inside SQL. This is the standard workaround for databases with custom types that the driver doesn't natively support. The alternative — installing `pgvector-python` — would add a dependency purely to handle this formatting step; the string cast is equivalent and keeps the dependency list lean. The vector appears twice in the query (once in the SELECT for the similarity score, once in the ORDER BY for sorting) so the string is parameterized as `%s` in both positions.

**How these pieces connect**

The retrieval pipeline is what makes the drafting pipeline in 3D grounded rather than generative. When OpenAI calls the `search_knowledge` tool during draft generation, the tool executor calls `search_knowledge()` from this pipeline, formats the returned chunks as a text block, and sends them back to the model. If retrieval returns wrong-workspace chunks (a workspace isolation bug) or empty results (a visibility filter misconfiguration), the drafted reply either cites someone else's documentation or is ungrounded and gets `send_ready = false`. The similarity scores are currently meaningless because seed embeddings are random — that's expected and known. After Milestone 3E re-embeds the knowledge base with real OpenAI vectors, the same query and the same code will start returning semantically relevant results without any changes here.

---

## Milestone 3D: Grounded Drafting Pipeline

**What we built and why**

This milestone adds the core AI feature of the product: generating a draft support reply for a ticket that is grounded in real documentation rather than hallucinated. The pipeline lets the model decide what to look up, retrieves the relevant knowledge chunks, and produces a reply with explicit citation markers — so an agent reviewing the draft can trace every factual claim back to a source. It sits between the retrieval pipeline (3C, which provides the search capability) and the frontend (upcoming), where agents will review and approve these drafts before they're sent to customers.

**Key concepts under the hood**

*Agentic tool calling — the model as an active participant, not a passive text generator.* In a standard LLM call, you give the model all the context upfront and it produces output. In an agentic loop, the model can pause mid-generation, request external information by calling a tool, receive the results, and then continue. Here, OpenAI's Responses API runs that loop: on the first call, the model sees the ticket and decides to search for "enterprise billing refund policy"; the system executes that search and sends the results back; the model then generates a grounded reply. This is meaningfully different from retrieval-augmented generation (RAG) where you pre-emptively retrieve before the model sees anything — here the model chooses what to search for based on the specific question, which produces more targeted evidence. Without the tool-calling loop, the only options are to stuff the entire knowledge base into the prompt (too large) or to guess what to retrieve upfront (often wrong).

*Closure-scoped state for tracking retrieved chunks.* The tool executor — the function that runs each time the model calls `search_knowledge` — is defined as a closure inside `generate_draft()`. It accumulates every chunk it retrieves into a local list (`retrieved_chunks`), which is readable after `generate_with_tools()` returns. This matters because the model may call the tool multiple times with different queries, and we want to track the full set of retrieved chunks so we can later filter it down to only those actually cited in the final body. The alternative — returning chunks from the tool executor — doesn't work because the provider module's interface only expects a string result; threading extra data out through return values would require changing the provider contract. The closure pattern keeps all the side-effect collection local to the pipeline without leaking into the provider.

*Citation enforcement as a hard invariant, not a model suggestion.* The model is prompted to set `send_ready: true` when it has sufficient evidence, but the pipeline overrides this with its own check: if `cited_chunk_ids` is empty after parsing the response, `send_ready` is forced to `false` regardless of what the model said. This matters because the whole point of grounded drafting is that agents can trust citations — a draft that claims to be send-ready but cites nothing is worse than one that honestly says it doesn't have enough evidence. The model's `send_ready` judgement is treated as a hint; the pipeline's structural check (are there actual chunk IDs in the body?) is the authoritative gate. Without this, a confident-sounding but uncited draft could slip through to a customer.

**How these pieces connect**

This pipeline is the consumer of both the retrieval pipeline (3C) and the prompt versioning system built in 2D — the active draft prompt is fetched by type at runtime, which means swapping to a better prompt requires only flipping `is_active` in the database, not a code deploy. The `draft_generations` table is append-only by design: every call to `/draft` or `/redraft` creates a new row, so the approval workflow (2C) always has the full history and the eval harness (upcoming in 3E+) can compare drafts across prompt versions. If the citation parsing were wrong — for example, regex failing to extract UUIDs from a differently-formatted body — `evidence_chunk_ids` would be empty, `send_ready` would be forced false, and the review queue would fill with drafts marked as lacking evidence even when the body contains citations. That's the failure mode to watch for once live embeddings are in place and the model starts producing real citation markers.

---

## Milestones 3E + 3F: Knowledge Ingestion Pipeline & End-to-End Verification

**What we built and why**

Milestone 3E added the ingestion pipeline — the background process that takes a freshly uploaded document and turns it into searchable vector data. When an agent uploads a PDF or markdown file, the upload handler stores the raw bytes in the document's JSONB metadata and returns immediately with `status=pending`. A background task then picks up from there: it parses the file (using PyMuPDF for PDFs, raw string for text), chunks the content into ~2000-character overlapping segments, calls OpenAI's embedding API on all chunks in a single batched request, and writes the resulting vectors into `knowledge_chunks`. If any step fails, the document is marked `status=failed`; on success it becomes `status=indexed` and the chunks are immediately queryable by the retrieval pipeline.

This two-phase design (upload-then-ingest) is the right architecture for slow, expensive async work. The HTTP response must be fast — an agent shouldn't wait 30 seconds for a file upload to finish. By separating upload from processing, the endpoint returns in milliseconds while the heavy lifting happens in a background task. The `status` field tracks the document through its lifecycle so the frontend can show meaningful progress without polling aggressively.

Milestone 3F verified the entire RAG pipeline worked end-to-end — upload → ingest → retrieve → draft — on real data and against a real database, without requiring live OpenAI credits. To make this possible, we built a three-tier mock mode controlled by a `MOCK_AI=1` environment variable: `classify()` returns a fixed triage result, `embed_batch()` returns deterministic numpy-seeded vectors, and `generate_with_tools()` actually calls the real tool executor (hitting the live database for retrieval) then synthesizes a realistic draft JSON. This means mock mode exercises the full data flow — RLS policies, vector similarity, chunk formatting, citation parsing — while bypassing the parts that cost money and require an API key.

In the course of verifying, we uncovered and fixed three distinct layered bugs in the ingestion pipeline that had been invisible in earlier milestones because ingestion was never actually exercised end to end. All three bugs were about the gap between the HTTP request context (where `get_rls_db` handles role setup automatically) and the background task context (where there's no request, no dependency injection, and no automatic setup at all).

**Key concepts under the hood**

*Starlette's BackgroundTasks lifecycle and transaction visibility.* Starlette runs `BackgroundTasks` before yield-dependency teardown. In FastAPI, dependencies written with `yield` (like `get_rls_db`) keep their resources open until after the response is sent — including after background tasks run. This means: if `upload_document` uses the `get_rls_db` dependency, its transaction is still open when the background task starts. A transaction in Postgres holds a consistent snapshot of the database as it was when the transaction started. Any row inserted inside that transaction is invisible to other connections until the transaction commits. So the background task would open its own connection, query for the freshly uploaded document, and get no rows — because the upload transaction hadn't committed yet. The fix is to avoid `get_rls_db` entirely in the upload route and instead open a dedicated pool connection, commit it explicitly before adding the background task, and only then call `add_task()`. The background task starts after the dedicated connection has already committed, so the document row is visible to any new connection from that point on.

*RLS and background tasks — no request context means no automatic setup.* Every RLS policy on `knowledge_documents` and `knowledge_chunks` is defined `FOR ALL TO rls_user`. The pool's connection user (`neondb_owner`) has no matching policies — it sees zero rows on every table guarded by RLS. In normal request handlers, `get_rls_db` runs `SET LOCAL ROLE rls_user` plus the four session config variables automatically. Background tasks have no request context, no dependency injection, and no `get_rls_db`. If the background task connects to the pool and queries the database as `neondb_owner`, all queries silently return empty results with no error. The fix is `_workspace_conn()`, a context manager that every background operation goes through: it opens a pool connection, starts a transaction, and manually runs `SET LOCAL ROLE rls_user` plus `set_config('app.workspace_id', ...)` and `set_config('app.user_role', 'support_agent', TRUE)`. The user role config is required because the `knowledge_documents` policy checks both `workspace_id = current_workspace_id()` AND `current_user_role() IN ('support_agent', 'team_lead')`. Missing either config causes total row filtering with no visible error.

*Transaction snapshot isolation and the retry-with-fresh-connection pattern.* Each database connection in psycopg3 operates on a consistent snapshot acquired when the connection's transaction starts. If a connection is opened before a row is committed — or before the previous transaction finishes — it will never see that row, no matter how long it waits or how many times it queries. This is not a timing race; it is a fundamental guarantee of MVCC (Multi-Version Concurrency Control). For the ingestion retry loop, this means that retrying on the same connection object is useless: the snapshot is fixed for the life of that transaction. The correct pattern is to open a brand new connection for each retry attempt, which acquires a fresh snapshot that can see all commits that happened up to that point. `_find_document_with_retry()` does exactly this — each of its ten attempts calls `_workspace_conn()`, which creates a fresh pool connection and a fresh transaction, giving it the latest view of the database.

*psycopg3's Connection vs. Cursor API surface.* psycopg3 adds `Connection.execute()` as a convenience shorthand that internally creates a cursor, runs the query, and returns it. This makes single-statement execution feel like a one-liner. However, psycopg3 does NOT add `Connection.executemany()` — only `Cursor.executemany()` exists. `executemany()` is needed to insert all chunks in a single batched call rather than looping over individual `execute()` calls. Calling `conn.executemany(...)` raises `AttributeError: 'Connection' object has no attribute 'executemany'` at runtime. The fix is `conn.cursor().executemany(...)`, which explicitly creates the cursor and calls the method that actually exists. This is a subtle psycopg3 API surface asymmetry — `execute()` was promoted to the connection, `executemany()` was not.

*Mock AI mode — deterministic testing without API credits.* The `MOCK_AI=1` environment variable bypasses all OpenAI API calls while still exercising the full data path. The key design decision is that the mock implementations are not all identical in character. `_mock_classify()` returns a hardcoded dict — there's no variation needed because triage classification just needs a valid shape. `_mock_embed_batch()` is deterministic but non-constant: it uses numpy's seeded RNG, deriving a seed from `abs(hash(text))`. The same text always produces the same 1536-dimensional vector, which means similarity searches are stable between runs and re-indexing the same content produces identical embeddings. `_mock_generate_with_tools()` is the most realistic: it calls the real `tool_executor` with a plausible query string, so the actual retrieval pipeline — the pgvector similarity search, the RLS filtering, the chunk formatting — runs against the live database. Then it synthesizes a JSON response that matches the schema the drafting pipeline expects. This means mock mode validates the retrieval → formatting → citation parsing → draft storage chain completely, with only the LLM generation itself replaced by a hardcoded string.

**How these pieces connect**

The ingestion pipeline is the last piece that makes the knowledge base actually searchable. Before 3E, the knowledge base contained 1,000 seed documents with placeholder (random) embeddings — enough to verify the query shape and the RLS policies, but not enough to produce meaningful retrieval results. After 3E, the full lifecycle exists: a document goes from raw file bytes to indexed, queryable vector chunks. The `seed/reembed.py` script can run on all existing seed documents to backfill real embeddings, at which point the retrieval pipeline (3C) and the drafting pipeline (3D) will start producing semantically meaningful results without any code changes.

The three bugs fixed in 3F reveal a structural pattern: every component built before 3E was exercised only within request context, where `get_rls_db` handled all the RLS setup automatically. The ingestion pipeline was the first component that runs entirely outside request context, and it exposed that the automatic setup was load-bearing in ways that weren't visible earlier. The `_workspace_conn()` context manager is now the canonical pattern for any future background operation — it encapsulates the same three-step setup (role switch, workspace config, user role config) that `get_rls_db` does implicitly. If another background pipeline is added later (e.g., scheduled re-indexing, automated eval runs), it must go through `_workspace_conn()` or an equivalent, or it will silently see empty tables.

The mock AI mode built in 3F also serves a long-term purpose beyond just this milestone's testing. Every future feature that involves an AI pipeline — re-ranking, classification fine-tuning, multi-step agents — can be developed and tested locally without burning API credits or requiring a live OpenAI key. The mock implementations are realistic enough to exercise the full data path (especially `_mock_generate_with_tools`, which hits the real database) while being fast, deterministic, and free. This makes CI-level testing of AI-adjacent code practical in a way it wouldn't be if tests required live API calls.
---

## Milestone 4C: Ticket Detail Page

**What we built and why**

The ticket detail page is the primary workspace for support agents — the surface where all the AI outputs built in milestones 3A–3D become actionable. It brings together the message thread, AI triage predictions, RAG-grounded draft, evidence citations, and approval/assignment controls into a single coherent view. The left column handles the human conversation (reading messages, sending replies, seeing ticket metadata); the right column handles the AI-assisted workflow (running triage, generating a draft, reviewing evidence, approving or rejecting). Client users see only the left column — the right is gated entirely on role.

**Key concepts under the hood**

*Role-based UI gating vs. role-based API gating — and why both must exist.* The right-hand panel (triage, draft, evidence, actions) is hidden from `client_user` in the frontend via an `isPrivilegedRole` check. But this is purely cosmetic — if a client user knew the API endpoint for `/tickets/:id/triage` and posted to it directly, the backend's `require_role` dependency would block the request independently. The frontend gating exists to avoid exposing confusing UI to users who can't use it; the backend gating exists as the actual security boundary. Collapsing both into one layer — either hiding the UI but not protecting the API, or protecting the API but showing broken UI — would be wrong in different ways: the first is a security hole, the second is a poor user experience. Both layers are necessary and each does its own job.

*Local state for derived data that isn't refetched on ticket load.* Evidence chunks returned by a draft generation call are stored in local component state (`useState`), not in the TanStack Query cache alongside the ticket. The reason is that `/tickets/:id` — the ticket fetch endpoint — doesn't return evidence chunks; they only come back on the draft generation response (`/tickets/:id/draft`). Putting evidence in the query cache would require either a separate query (an extra round-trip on every page load) or stitching two separate queries' results together in the component. Instead, evidence is captured from the mutation response and held locally until the ticket's `latest_draft.id` changes — at which point it's cleared, signalling that the evidence belongs to a stale draft. Without this, a user could redraft a ticket and see old evidence chunks paired with a new draft body, which would be actively misleading.

*Structured output schema strictness as an API contract.* OpenAI's structured outputs mode enforces that when `additionalProperties: false` is set on a response schema, every key listed in `properties` must also appear in `required`. This is stricter than standard JSON Schema, which allows optional properties not in `required`. The triage schema had `escalation_reason` in `properties` (typed as `string | null`) but not in `required`, which caused every triage call to fail with a 400. The fix is mechanical — add the key to `required` — but the concept matters: making a field nullable (`"type": ["string", "null"]`) is the correct way to express "this field is always present but may have no value", as opposed to truly optional fields which JSON Schema allows to be absent entirely. OpenAI structured outputs does not support truly optional fields; every field must always be present in the output, with null used to express absence of a value.

**How these pieces connect**

The ticket detail page is the convergence point of every backend pipeline built in milestones 2 and 3: the triage endpoint calls the classification pipeline, the draft endpoint calls the retrieval and drafting pipelines, and the approval actions write to `draft_approvals`. If the backend schemas returned by any of those endpoints didn't match the TypeScript types in `types/api.ts`, the UI would silently render nothing or show undefined in place of data — without a type error, because the mismatch lives at the network boundary. The review queue page (4D) depends on the same approval flow: drafts approved here move into the review queue, so any inconsistency in how `send_ready` or `latest_draft` is modelled here will surface as missing or broken entries there.

---

## Milestone 4D: Review Queue Page

**What we built and why**

The review queue gives agents a dedicated surface to process AI-generated drafts without opening each ticket individually — a triage-and-act interface rather than a read-and-compose one. It sits between the drafting pipeline (which produces draft records in the database) and actual customer responses (which only go out after a human approves). Every draft generated anywhere in the system funnels through this page; the ticket workspace (4C) is for composing and drafting, the review queue is for bulk approval.

**Key concepts under the hood**

*Per-component mutation scope to isolate pending state.* Each `ReviewCard` instantiates its own `useReviewDraftFromQueue` hook rather than sharing a single mutation at the page level. In TanStack Query (and React's hook model generally), a mutation hook creates an independent state machine — pending, error, success — scoped to the component that calls it. If the approve/reject/escalate mutation were lifted to the page level and shared, any card's action would set `isPending` globally, disabling the action buttons on every other card simultaneously. Scoping the mutation to the card means only that card's buttons disable while its action is in flight. This is a general principle: mutation state is per-action, not per-resource-type. Even though all cards act on the same resource type (`draft_generation`), each pending action is independent.

*Lazy cache invalidation as the correctness strategy for list views.* When an agent approves a draft, the card doesn't disappear because the frontend removes it optimistically — it disappears because the `onSuccess` callback invalidates the `["reviews"]` query, triggering a refetch from the server that returns the list without the approved draft. The alternative, optimistic removal, would require the frontend to predict the server's new list state and roll back on error. For a queue where every action changes the list membership — approval, rejection, and escalation all remove the item — optimistic updates would need error rollback logic for three separate actions. Lazy invalidation avoids all of that: the server is always the source of truth, and the only thing the client does on success is ask for the latest state. The cost is a brief moment where the approved card is still visible; the benefit is that the list is always consistent with what the database actually contains.

*Polling as a practical alternative to push for low-frequency updates.* The review queue refetches from the API every 30 seconds (`refetchInterval: 30_000`) so new drafts appear without the agent manually refreshing. The alternative — WebSockets or Server-Sent Events — would push new drafts to the client the moment they appear. Polling is the right choice here because the review queue is not a real-time surface: a 30-second lag before a new draft card appears is operationally acceptable, the implementation is a one-line option on a `useQuery` call, and it requires zero server-side infrastructure (no persistent connections, no pub/sub broker, no message queue). WebSockets become worth the complexity when latency must be under a second or when the server needs to push to many clients simultaneously — neither applies to a review queue used by a handful of agents.

**How these pieces connect**

The review queue is the approval gateway for the entire drafting pipeline. Drafts created in milestone 3D are append-only records in `draft_generations`; the `/drafts/review-queue` endpoint surfaces the subset that have no approval outcome yet. Actions taken here write to `draft_approvals` and are reflected immediately in the ticket workspace (4C) via shared query invalidation — `useReviewDraftFromQueue` invalidates both `["reviews"]` and `["ticket", ticketId]`, so if an agent approves a draft from the queue while the ticket workspace is open in another tab, the workspace's draft panel will update on its next refetch. The knowledge upload page (4E) and eval console (5B) are independent surfaces and don't depend on anything built here, but the overall system's human-in-the-loop story is only complete once the review queue exists: without it, generated drafts accumulate in the database with no mechanism for agents to act on them in bulk.

---

## Milestone 5A: Eval Runner Backend

**What we built and why**

Before this milestone, `POST /eval/runs` created a run record with `status=pending` and stopped — the system had evaluation data and endpoints but no mechanism to actually run evaluations. This milestone adds the background worker that processes each example in an eval set, compares model output against expected answers, writes per-example results, and computes aggregate metrics. It sits between the eval CRUD layer (which manages sets, examples, and run records) and the eval console frontend (5B), which needs real results to display.

**Key concepts under the hood**

*Background task lifecycle relative to the HTTP response.* In Starlette (the framework underlying FastAPI), background tasks are awaited as part of `response.__call__` — they run before the dependency cleanup stack unwinds. This matters because FastAPI's `get_rls_db` dependency holds a database transaction open until the dependency generator is cleaned up, which happens *after* `response.__call__` returns. The consequence: if the route that creates the eval run uses `get_rls_db`, the run's INSERT hasn't committed by the time the background task fires, so the task queries for a row that doesn't exist yet. The fix is to create the run in an explicit connection that commits inside the route handler, not in the dependency-managed transaction. Without understanding this ordering, you'd see a race condition that disappears under load (when the event loop is busier and timing shifts) and is nearly impossible to debug from symptoms alone.

*RLS on managed Postgres vs. self-hosted Postgres.* On standard Postgres, a table owner bypasses row-level security when the table has `ENABLE ROW LEVEL SECURITY` (without `FORCE`). On Neon's managed Postgres, the application user (`neondb_owner`) is not a true superuser and does not get this bypass — RLS applies to it just like any other role. This means a background task that opens a raw pool connection and queries eval tables (which have an RLS policy requiring `current_user_role() = 'team_lead'`) gets zero rows back rather than an error, making the failure look like missing data rather than a permission problem. The fix is to set up the RLS session variables explicitly in every background task connection (`SET LOCAL ROLE rls_user` + `set_config('app.user_role', 'team_lead', TRUE)`), the same pattern the ingestion pipeline uses for knowledge document access. Skipping this on a self-hosted Postgres would work fine — the bug only surfaces on Neon's managed environment.

*Per-example error isolation in a batch processing loop.* When running 60 examples sequentially, a single provider timeout or malformed response from the model must not abort the remaining 59. The runner wraps each example's processing and result-writing in its own try/except, catches any exception, records that example as `passed=False` with an error message in `notes`, and continues. This is distinct from the outer catastrophic failure handler, which catches errors in the entire run's setup (e.g., run record not found) and marks the whole run `failed`. The two tiers exist because they represent different kinds of failure: an example-level failure is recoverable and partial (the run can still produce useful metrics from the examples that did complete), while a setup failure means no meaningful results are possible at all. Collapsing them into a single handler would mean one bad API call aborts the entire evaluation.

**How these pieces connect**

The eval runner is the engine behind every metric the eval console (5B) will display. The `metrics` JSONB field on `eval_runs`, the `passed`/`failed` counts, and every row in `eval_results` are all written exclusively by this pipeline — the CRUD endpoints only read them. If the runner computed metrics incorrectly (e.g., dividing by the wrong denominator, or conflating classification and routing examples), the console would show plausible-looking numbers that are silently wrong, and the compare endpoint would surface misleading diffs between prompt versions. The pipeline reuses the same `TRIAGE_RESPONSE_SCHEMA` and `classify()` call as the triage pipeline, which means any change to the live triage prompt format will also affect eval scores — intentionally, since evals are meant to measure the same model behaviour that runs in production.

---

## Milestone 5B: Eval Console Frontend

**What we built and why**

The eval console gives team leads a purpose-built interface for understanding how well a prompt version is performing and whether a change made things better or worse. Without it, the eval runner (5A) produces results in the database with no way to inspect them except raw SQL. The console sits at the top of the evaluation workflow: it triggers runs, surfaces per-example pass/fail detail, and — most importantly — makes two runs directly comparable in a side-by-side view that shows which specific examples changed, not just aggregate accuracy numbers.

**Key concepts under the hood**

*Polling interval tied to live data state rather than a fixed schedule.* The runs list (`useEvalRuns`) polls the API every 5 seconds — but only while at least one run is in `pending` or `running` status. When all runs are `completed` or `failed`, the refetch interval returns `false` and polling stops entirely. A fixed interval (e.g., always poll every 5 seconds) would work correctly but wastes network and API resources when the user is just reviewing completed results. A WebSocket or SSE approach would push status changes without polling at all, but adds server-side infrastructure complexity that isn't justified for a low-frequency operation like eval runs. The conditional polling approach is a pragmatic middle ground: it's responsive during the live phase (showing `pending → running → completed` transitions in near-real-time) and quiet at rest. The same pattern appears in the knowledge upload page (4E) for document ingestion status.

*On-demand detail fetching as a UX and performance tradeoff.* The runs list endpoint (`GET /eval/runs`) returns summary rows — status, counts, metrics — but not per-example results. `useEvalRunDetail` fires a second request only when the user clicks a row to expand it. The alternative is to embed results in the list endpoint from the start, but a completed eval run for a 60-example set means 60 `EvalResult` rows in the response even when the user never expands it. Over a page with many runs, that's a lot of data transferred and rendered to nothing. Fetching on demand keeps the list fast and only pays the cost when the detail is actually needed. TanStack Query caches the detail response, so collapsing and re-expanding the same row doesn't re-fetch.

*Controlled Select inputs with explicit trigger labels.* Base UI's `Select` component (used by this project's shadcn build) requires `SelectValue` to receive explicit children that render the selected item's label — unlike Radix UI's version, which automatically mirrors `SelectItem` text into the trigger. This means the trigger's display text must be computed by looking up the selected ID in the loaded data (`evalSets?.find(s => s.id === evalSetId)?.name`). The same component also requires that the `value` prop is never `undefined` after the first render — once the component mounts as controlled (`value=""`) it must stay controlled. Passing `value={someNullableState ?? undefined}` transitions from uncontrolled to controlled when the user makes a selection, triggering a React warning and potentially incorrect behavior. The fix is to initialize state as `""` and always pass a string, handling null in the `onValueChange` handler (`v => setState(v ?? "")`). This is an implementation detail of Base UI specifically — Radix UI handles both cases more permissively — but it recurs on every Select in the project and the ticket-actions component already demonstrates the correct pattern.

**How these pieces connect**

The eval console is the frontend counterpart to the eval runner (5A) and the prompt versioning system built across milestones 3–5. Its hooks (`useEvalSets`, `useEvalRuns`, `useEvalComparison`) call the endpoints built in 5A, and the TypeScript types in `api.ts` must match the Pydantic schemas exactly — a mismatch (like the `metric_diffs` array vs. the actual `metric_diff` flat object) causes the comparison panel to silently fail or render nothing. Milestone 6A (polish) will add loading skeletons, empty states, and error boundaries to this page, but the data layer and component structure are complete here. The overall demo story depends on this console: without it, a team lead has no way to run an evaluation, view results, or compare prompt versions — the most technically differentiating feature of the system has no UI.


---

## Milestone 6A: Error Handling, Loading States & Polish

**What we built and why**

Every page in the app previously had gaps: a blank screen during loading, no indication when the API was unreachable, and silent failures when mutations went wrong. This milestone adds the infrastructure that makes the demo feel production-grade — error boundaries, consistent loading and error components, toast notifications for every mutation, a keyboard shortcut, and a login page rebuilt with design system tokens. It sits on top of all prior milestones and touches every frontend surface without changing any backend logic.

**Key concepts under the hood**

*React error boundaries as the last line of defence against render crashes.* An error boundary is a React class component that implements `getDerivedStateFromError` — a static lifecycle method that catches any JavaScript exception thrown during a child component's render phase and replaces the crashed subtree with fallback UI instead of letting the whole app go blank. Function components cannot be error boundaries; the class component API is the only mechanism React exposes for this. Without one, a single unhandled `undefined` access inside a deeply nested component (say, a null check missing on a ticket field) would unmount the entire page tree with no user-visible explanation. The boundary placed in `(app)/layout.tsx` catches errors anywhere in the authenticated app without needing one per page. The tradeoff is coarse granularity: a crash in the reply box shows the same fallback as a crash in the header — but for an MVP, one boundary at the page level is the right starting point before adding finer-grained boundaries around individual panels.

*Toast notifications as ephemeral feedback separate from persistent error state.* Toasts (via Sonner) and inline error messages serve different roles and intentionally coexist. A toast is transient — it auto-dismisses after a few seconds and is appropriate for confirming that an action succeeded or briefly surfacing a failure ("Draft approved", "Failed to send message"). Inline error text inside a form or card is persistent — it stays visible until the user takes another action, making it the right choice when the error needs to remain visible while the user decides what to do next (e.g., a rejection reason dialog where the submission failed). Replacing inline errors with toasts entirely would mean an error disappears before the user reads it; replacing toasts with inline errors would mean success confirmations clutter the UI permanently. The mutations across this codebase use both: `toast.success`/`toast.error` in the `onSuccess`/`onError` callbacks of `mutate()`, and inline `<p role="alert">` elements that survive until the next attempt.

*Keyboard shortcut handling at the textarea level, not the form level.* The `Ctrl+Enter` shortcut for submitting a reply is attached as `onKeyDown` on the `<Textarea>` element rather than as a global `keydown` event listener on `document`. A global listener would fire regardless of which element has focus — pressing `Ctrl+Enter` while typing a rejection reason in a dialog would also trigger the reply submission. Scoping the handler to the textarea means the shortcut only fires when that specific input has focus, which is the user's natural expectation. The handler also guards against firing when the textarea is empty or the mutation is already pending, matching the same conditions that disable the submit button, so keyboard and pointer paths always have identical preconditions.

**How these pieces connect**

This milestone is purely additive to the frontend — no backend changes, no new routes, no schema modifications. Everything added here sits on top of the data layer built in milestones 3–5: the toasts fire from the same mutation hooks that were already wired, the error states surface the `isError` flag that TanStack Query already tracked, and the error boundary catches exceptions from any of the existing components. Milestone 6B adds new API endpoints (users list, ticket stats) and wires them into the ticket workspace, which means its components will also need to follow the toast and error-state patterns established here — the `PageError` and `EmptyState` components are now the standard building blocks for any new page state.

---

## Milestone 6B: API Performance Endpoints & Optimizations

**What we built and why**

The ticket workspace had a hardcoded list of two demo users in its assignee picker — fine for local testing, but disconnected from the actual data in the database. This milestone replaces that with a real `GET /users` endpoint and adds a `GET /tickets/stats` aggregate endpoint for future dashboard use. It also adds a missing partial index on the draft review queue query. Together, these changes close the gap between the demo and a production-ready system by ensuring every dropdown and count in the UI reflects live data.

**Key concepts under the hood**

*Route registration order as a disambiguation rule.* FastAPI matches routes top-to-bottom and treats path segments as either literals or parameters — it cannot tell from the path string alone whether `stats` in `/tickets/stats` is a literal word or a value to fill a `{ticket_id}` parameter. If `/tickets/{ticket_id}` is registered first, every request to `/tickets/stats` matches it and FastAPI passes `"stats"` as the `ticket_id` UUID, which fails validation. Registering `/tickets/stats` first means FastAPI resolves it as a literal match before it ever reaches the parameterised route. This is a consistent architectural pattern: any fixed sub-path on a resource (like `/stats`, `/me`, `/count`) must be declared above the wildcard route in the same router. Getting this wrong produces a 422 Unprocessable Entity error that looks like a type error rather than a routing problem, which makes it easy to misdiagnose.

*Single-pass aggregation with filtered counts.* The stats query uses `COUNT(*) FILTER (WHERE status = 'new')` — a SQL standard clause that conditions which rows contribute to a given aggregate, all within a single scan of the `tickets` table. The alternative would be separate queries per status (`SELECT COUNT(*) FROM tickets WHERE status = 'new'`, then `... WHERE status = 'open'`, etc.), which scans the table once per status value. Filtered aggregates do the same work in one pass regardless of how many categories you count, and there's no GROUP BY to manage — each category gets its own named column in a single result row. This matters on the `tickets` table specifically because it's large (15K rows in seed data, growing with production use), scoped by RLS on every query, and called on every page load of the ticket queue header.

*Partial indexes as a targeted read optimisation.* A partial index is a regular B-tree index with a `WHERE` clause that controls which rows are included in the index. For the draft review queue, nearly all queries filter on `approval_outcome IS NULL OR approval_outcome = 'pending'` — the subset of drafts awaiting a decision. Adding `idx_draft_pending` on `draft_generations(created_at) WHERE approval_outcome IS NULL OR approval_outcome = 'pending'` means the index only contains rows the query actually cares about, making it smaller (faster to scan) and more selective (the planner is more likely to choose it over a sequential scan). A full index on `approval_outcome` would also help but would index every approved and rejected draft too — rows the review queue query never touches. The partial index is a good fit whenever a query has a stable, high-selectivity predicate that filters out a large fraction of rows.

**How these pieces connect**

The `/users` endpoint is RLS-scoped the same way as every other data endpoint — it reads `current_setting('app.workspace_id')` to filter users to the current workspace, which is set by `get_rls_db` before the query runs. If that session variable weren't set correctly (e.g., if a route accidentally used bare `get_db()` instead of `get_rls_db`), the query would throw a Postgres error or return users from the wrong workspace. The frontend `useWorkspaceUsers()` hook feeds directly into the assignee picker in `ticket-actions.tsx`, replacing the hardcoded demo UUIDs — any deployment where the users table is empty (e.g., a fresh environment without seed data) will show an empty dropdown. The partial index in `schema.sql` only takes effect on new database deployments or full resets; an existing live Neon instance needs a manual `CREATE INDEX` migration to gain the benefit.


---

## Milestone 6C: Deployment Configuration

## What we built and why

This milestone wires the application to two cloud platforms — Vercel for the Next.js frontend and Railway for the FastAPI backend — so the system can run outside a developer's laptop. The challenge isn't writing code: it's configuring each platform to find, build, and run the right service from a monorepo, and making sure the two services can talk to each other securely across the internet.

## Key concepts under the hood

*Monorepo deployment with per-service root directories.* A monorepo keeps multiple services in one repository, but deployment platforms expect a single project at the repo root. The solution is to tell each platform where its service lives — Vercel's "Root Directory" set to `web/`, Railway's set to `api/`. This means each platform only sees its own slice of the repo: it won't try to build the Python code on Vercel or the Next.js code on Railway. Getting this wrong causes the platform to look for the wrong build artifacts (e.g., Vercel looking for `package.json` at the repo root and failing because it only exists in `web/`).

*The `__Secure-` cookie prefix as a browser security mechanism.* Browsers enforce a rule: any cookie whose name starts with `__Secure-` may only be set over HTTPS and must carry the `Secure` flag. BetterAuth automatically applies this prefix to session cookies when it detects the app is running on HTTPS — so the cookie that's named `better-auth.session_token` in local development becomes `__Secure-better-auth.session_token` in production. Any code that checks for the session cookie by exact name (like a middleware auth guard) will silently fail to find it unless it accounts for both names. The fix is straightforward once you know it exists, but the failure mode — successful login that immediately bounces back to the login page — is hard to diagnose from the outside because the sign-in API call returns 200.

*Environment-aware configuration via a JSON string validator.* On Railway, every environment variable is a plain string — there's no native concept of a list. pydantic-settings can parse a Python list written in `.env.local` format (`["http://localhost:3000"]`), but when Railway sends the same value as a raw string, the field validator needs to explicitly call `json.loads()` on it before pydantic sees it. Without this, the CORS origins list would either fail to parse entirely or be treated as a single string (the literal characters `[`, `"`, `h`, ...) instead of a list of origins, causing all cross-origin API requests from the frontend to be blocked.

## How these pieces connect

Every other milestone assumes a working deployment target — this one creates it. The frontend's `NEXT_PUBLIC_API_URL` points at Railway, so if Railway isn't reachable or CORS isn't configured correctly, every API call from the browser fails silently. The auth cookie fix is load-bearing for all authenticated surfaces: if the middleware doesn't recognise the `__Secure-`-prefixed cookie, no user can reach any page behind the auth guard regardless of whether their credentials are correct. Milestone 6D (demo walkthrough) depends entirely on 6C being stable — a broken deploy makes it impossible to verify the end-to-end demo flows.
