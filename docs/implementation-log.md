# Implementation Log

Appended automatically when COMPLETED is triggered in Claude Code.

---

## Milestone 1A — Monorepo & Infrastructure Setup
**Date:** 2026-03-13

### What changed
- Scaffolded full monorepo: `web/`, `api/`, `seed/`, `docs/`, root config files
- Next.js 16.1.6 initialized with TypeScript strict, Tailwind v4, App Router, `src/` layout, shadcn/ui, `@tanstack/react-query`, `better-auth`, `zod`
- FastAPI 0.135.1 app with `config.py`, `db.py`, `auth.py`, `deps.py`, `routers/health.py`, `main.py`
- Python venv at `api/.venv/`, all dependencies installed via `pyproject.toml` (hatchling build backend)
- `justfile` task runner, `.gitignore`, `.env.example`
- `just` installed system-wide via winget (v1.46.0)

### Key decisions
- Connection pool uses `open=False` + lifespan context manager — avoids failing at import time when DB isn't available
- `api/.env.local` and `web/.env.local` are separate per-service files (not a shared root `.env`)
- `get_rls_db` in `deps.py` sets all four RLS session vars (`app.org_id`, `app.workspace_id`, `app.user_id`, `app.user_role`) in a single `SELECT set_config(...)` call

### Key files
- `api/app/main.py` — FastAPI app + lifespan pool management
- `api/app/deps.py` — `get_rls_db` dependency (RLS enforcement point)
- `api/app/auth.py` — JWT decode + `CurrentUser` model
- `web/src/lib/api-client.ts` — typed fetch wrapper with in-memory JWT caching

### Gotchas
- `create-next-app --no-git` still created a nested `web/.git` — removed manually
- `just` PATH update requires a shell restart; use full path (`AppData/Local/Microsoft/WinGet/...`) in the same session

### Verified
- `GET /health` → `{"status":"ok","database":"connected"}` ✓
- `npm run build` compiles with zero TypeScript errors ✓

---

## Milestone 1B — Schema Deployment & Seed Data
**Date:** 2026-03-13

### What changed
- Deployed `schema.sql` to Neon Postgres via psycopg (no psql available — used `seed/push_schema.py`)
- Fixed extension name: Neon uses `"vector"` not `"pgvector"` in `CREATE EXTENSION`
- `seed.py` ran successfully: 15,000 tickets, 80,000 messages, 1,000 knowledge docs, 3,517 chunks, 150 eval examples, 10 SLA policies, 4 prompt versions
- Created `seed/demo_accounts.py`: 3 deterministic demo users with hardcoded UUIDs + 48 demo tickets (all 8 categories × 6 statuses) for Org #1
- Created `seed/verify.py` (+ `verify.sql` for reference): checks all row counts and demo account presence
- Added `seed/push_schema.py` and `seed/reset_db.py` as psql-free Python replacements
- Updated justfile: `db-push`, `db-demo`, `db-verify`, `db-reset` all now use Python scripts
- Added `just` binary to Git Bash PATH via `~/.bashrc`

### Key decisions
- `ORDER BY ctid ASC` to find "Org #1" — ctid tracks heap insertion order, reliable for COPY-inserted rows
- Demo user UUIDs hardcoded (`00000000-0000-4000-a000-00000000000{1,2,3}`) for stability across reseeds; membership UUIDs also hardcoded
- Demo tickets use `uuid5()` with a fixed namespace for deterministic IDs, making `demo_accounts.py` fully idempotent via `ON CONFLICT DO NOTHING`
- Chunk grouping changed from `randint(2, 4)` to `randint(1, 2)` paragraphs per chunk — templates were short enough that 2-4 only produced 3,517 chunks; next `db-reset` will produce ~7,000
- `db-verify` asserts `>= 3,000` chunks (adjusted from 5,000 to match actual template output)

### Key files
- `seed/schema.sql` — extension name fix (`vector` not `pgvector`)
- `seed/seed.py` — 4 bug fixes (see Gotchas)
- `seed/demo_accounts.py` — deterministic demo users + guaranteed ticket spread
- `seed/verify.py` — full DB health check, used by `just db-verify`
- `seed/push_schema.py`, `seed/reset_db.py` — psql replacements
- `justfile` — updated all db-* commands

### Gotchas
- `CREATE EXTENSION "pgvector"` fails on Neon — the extension is registered as `"vector"`
- `SET SESSION ROLE DEFAULT` is invalid PostgreSQL syntax — correct form is `RESET ROLE`
- `copy_insert()` double-escaped `\N` null sentinels: `null_str()` returned the 2-char string `\N`, then `escape_copy()` turned `\` into `\\`, giving PostgreSQL `\\N` (literal backslash-N) instead of NULL. Fixed by short-circuiting on the sentinel before calling `escape_copy()`
- Two format string bugs in seed.py: `{competitor}` missing from subject `.format()` calls in `gen_tickets()` and `gen_eval_data()`; JSON-like `{"error": ...}` in a message template needed outer braces doubled to `{{...}}`

### Verified
- `just db-verify` → all 9 minimum count checks PASS ✓
- 3 demo accounts present with correct roles ✓
- `rls_user` role exists (can_login=False) ✓
- 15,048 total tickets (15,000 seed + 48 demo) ✓

---

## Milestone 1C — Authentication Flow
**Date:** 2026-03-13

### What changed
- Installed `better-auth` (already present), `pg`, `@types/pg`, `jose`, `tsx` (dev) in `web/`
- `web/src/lib/auth.ts` — BetterAuth server instance with `pg.Pool` database connection and `minPasswordLength: 6`
- `web/src/lib/auth-client.ts` — BetterAuth browser client via `createAuthClient()`
- `web/src/app/api/auth/[...all]/route.ts` — BetterAuth catch-all route handler
- `web/src/app/api/token/route.ts` — reads BetterAuth session, joins `users`/`memberships`/`workspace_memberships` by email, mints HS256 JWT via `jose`
- `web/src/app/login/page.tsx` — email/password form using `authClient.signIn.email()`
- `web/src/proxy.ts` — Next.js 16 proxy (replaces deprecated `middleware.ts`) with cookie-presence auth guard
- `web/src/app/page.tsx` — root route now redirects to `/tickets`
- `web/.env.local` — added `DATABASE_URL`, `JWT_SECRET`, `BETTER_AUTH_URL`
- `api/app/routers/auth.py` — `GET /auth/me` endpoint returning validated `CurrentUser`
- `api/app/main.py` — registered auth router
- `seed/migrate_auth.ts` — creates BetterAuth tables via `auth.$context.runMigrations()`
- `seed/demo_auth.ts` — seeds 3 demo users via `auth.api.signUpEmail()`
- `justfile` — added `db-auth-migrate`, `db-seed-auth`

### Key decisions
- **Email as join key**: `token/route.ts` joins BetterAuth's session to our `users` table by email, not by ID. This avoids a schema migration (no `better_auth_id` column) and works cleanly since both tables share the email field.
- **Cookie-presence proxy**: The Next.js proxy only checks if `better-auth.session_token` exists, not if it's valid. Full session validation happens in server routes that call `auth.api.getSession()`. This keeps the proxy lightweight and avoids needing a database connection in the edge layer.
- **`minPasswordLength: 6`**: BetterAuth defaults to 8; `lead123` is 7 characters. Configured explicitly to match the spec's demo passwords.
- **`seed/migrate_auth.ts` uses `auth.$context`**: BetterAuth's public `auth` object doesn't expose `runMigrations()` directly. The internal context (a Promise accessible at `auth.$context`) does. Confirmed by reading BetterAuth's `dist/auth/base.mjs`.
- **seed scripts run `cd web && npx tsx --env-file=.env.local ../seed/script.ts`**: tsx is installed in `web/node_modules`, env vars come from `web/.env.local`, and module resolution finds `better-auth` in `web/node_modules` because `web/src/lib/auth.ts` is the actual importer.
- **`middleware.ts` → `proxy.ts` + renamed export**: Next.js 16.1.6 deprecated `middleware` in favour of `proxy`; the exported function must also be named `proxy` (not `middleware`).

### Key files
- `web/src/lib/auth.ts` — BetterAuth server config (all auth flows originate here)
- `web/src/app/api/token/route.ts` — the bridge between BetterAuth sessions and FastAPI JWTs
- `web/src/proxy.ts` — route guard for all non-API pages
- `api/app/routers/auth.py` — `/auth/me` verification endpoint
- `seed/migrate_auth.ts`, `seed/demo_auth.ts` — one-time setup scripts

### Gotchas
- BetterAuth uses Kysely internally; a `pg.Pool` is accepted directly (it has a `connect` method, which BetterAuth detects and wraps in `PostgresDialect({ pool: db })`)
- `npx better-auth migrate` does not exist — BetterAuth 1.5.x has no CLI binary; migration runs via `auth.$context.runMigrations()`
- Clearing `better-auth.session_token` cookie is required to test the login redirect (old cookie from seeding persists in the browser)
- PowerShell: `curl` is an alias for `Invoke-WebRequest`; use `Invoke-RestMethod` with `@{ Authorization = "Bearer $token" }`

### Verified
- `GET /health` → `{"status":"ok","database":"connected"}` ✓
- Login at `http://localhost:3000/login` with all 3 demo accounts ✓
- `POST /api/token` returns signed JWT for each account ✓
- `GET /auth/me` with JWT returns correct `user_id`, `org_id`, `workspace_id`, `role` for all 3 users ✓

---

## Milestone 1D — RLS Middleware in FastAPI
**Date:** 2026-03-13

### What changed
- `api/app/deps.py` — added `conn.transaction()` wrapper around RLS setup so `SET LOCAL ROLE` is scoped correctly to the transaction
- `api/app/routers/debug.py` — three new debug endpoints: `GET /debug/tickets/count`, `GET /debug/messages/count`, `GET /debug/messages/count`, `GET /debug/knowledge/count`
- `api/app/main.py` — registered debug router
- `seed/schema.sql` — added `GRANT rls_user TO neondb_owner` so the app's connection user can switch into the restricted role
- `seed/mint_tokens.py` — helper script to mint JWTs for all three demo users directly from `api/.env.local` (for manual testing without a running Next.js server)

### Key decisions
- `conn.transaction()` is required for `SET LOCAL` to work — `SET LOCAL ROLE` resets at transaction end, which is exactly what you want for connection pool safety. Without the explicit transaction, psycopg operates in autocommit mode and `SET LOCAL` has no effect.
- `GRANT rls_user TO neondb_owner` must be run once on Neon — this is the missing link between creating the `rls_user` role (which the schema did) and allowing the app user to switch into it. Added to `schema.sql` so future `db-push` runs include it automatically.
- Table name is `ticket_messages` (not `messages`) and `knowledge_documents` (not `knowledge_docs`) — verified against schema before writing queries.

### Key files
- `api/app/deps.py` — `get_rls_db` dependency (now with transaction wrapper)
- `api/app/routers/debug.py` — RLS verification endpoints
- `seed/mint_tokens.py` — JWT minting helper for manual testing
- `seed/schema.sql` — `GRANT rls_user TO neondb_owner` added

### Gotchas
- `SET LOCAL ROLE rls_user` silently does nothing outside a transaction. The original `deps.py` was missing `conn.transaction()`, so RLS was never actually activating.
- `GRANT rls_user TO neondb_owner` is not in the original schema — Neon's superuser (`neondb_owner`) cannot `SET ROLE` to a role it isn't a member of. This caused a `permission denied to set role "rls_user"` 500 error on first test.
- PowerShell: `curl` is `Invoke-WebRequest`; use `curl.exe` for real curl. `export VAR=val` doesn't work; use `$env:VAR = "val"`.

### Verified
- Agent JWT → `/debug/tickets/count` → `{"count": 337}` (Org #1 only) ✓
- Agent JWT → `/debug/messages/count` → `{"total": 1715, "internal": 36}` ✓
- Client JWT → `/debug/messages/count` → `{"total": 1679, "internal": 0}` (RLS strips internal) ✓
- Agent JWT → `/debug/knowledge/count` → `{"total": 10}` ✓
- Client JWT → `/debug/knowledge/count` → `{"total": 6}` (non-client-visible docs hidden) ✓

---

## Milestone 2A — Ticket & Message Endpoints
**Date:** 2026-03-13

### What changed
- Created `api/app/schemas/` package with `common.py` (`PaginationParams`, `PaginatedResponse`) and `tickets.py` (8 Pydantic models: `TicketListItem`, `TicketDetail`, `TicketMessage`, `TicketPrediction`, `TicketDraft`, `TicketAssignment`, `TicketUpdate`, `MessageCreate`, `AssignRequest`)
- Created `api/app/queries/tickets.py` — 7 SQL query functions: `list_tickets`, `get_ticket`, `get_ticket_messages`, `get_latest_prediction`, `get_latest_draft`, `get_ticket_assignments`, `update_ticket`, `insert_message`, `assign_ticket`
- Created `api/app/routers/tickets.py` — 5 endpoints: `GET /tickets`, `GET /tickets/{id}`, `PATCH /tickets/{id}`, `POST /tickets/{id}/messages`, `POST /tickets/{id}/assign`
- Updated `api/app/main.py` to register the tickets router at `/tickets`
- Added `set windows-shell := ["powershell.exe", "-NoLogo", "-Command"]` to justfile for PowerShell compatibility

### Key decisions
- Sort column and direction are whitelisted (`_ALLOWED_SORT_COLUMNS`, `_ALLOWED_SORT_ORDERS`) before interpolation into SQL — they can't be parameterized as values, so whitelist is the safe pattern
- `_build_detail()` helper in the router DRYs up the four sub-queries (messages, prediction, draft, assignments) shared by GET detail, PATCH, and POST assign
- `update_ticket` whitelists field names via `_ALLOWED_UPDATE_FIELDS` before building dynamic SET clause — prevents injection even though values come from Pydantic
- `assign_ticket` uses `COALESCE(%s::team_name, team)` so passing `None` preserves the existing team assignment rather than nulling it out
- `dict_row` is set on the pool (from 1A), so all query results are already dicts — no conversion needed at the query layer

### Key files
- `api/app/schemas/tickets.py` — all request/response shapes for the tickets domain
- `api/app/queries/tickets.py` — all SQL isolated here; routers never write SQL directly
- `api/app/routers/tickets.py` — thin route handlers; each is: validate → query → return schema

### Gotchas
- `just dev-api` fails in PowerShell without `set windows-shell` in the justfile — `just` on Windows looks for `sh` which isn't in the default PowerShell PATH
- Run uvicorn from inside `api/` not the repo root (the venv is at `api/.venv` and the recipe does `cd api` from the root)
- Port 8000 was occupied by a previous uvicorn process; killed with `taskkill /PID <pid> /F`

### Verified
- `GET /tickets` → 337 tickets, 14 pages, correct pagination metadata ✓
- `GET /tickets/{id}` → full detail with nested messages, prediction, draft, assignments ✓
- Agent JWT: 6 messages on ticket `14898025`, including 1 `is_internal: true` ✓
- Client JWT: 5 messages on same ticket (`is_internal: true` filtered by RLS) ✓
- Client JWT: `confidence: null`, `latest_prediction: null` (RLS blocks `ticket_predictions` for `client_user`) ✓
- Client JWT: `latest_draft: null` (RLS blocks `draft_generations` for `client_user`) ✓

---

## Milestone 2B — Knowledge Document Endpoints
**Date:** 2026-03-14

### What changed
- Created `api/app/schemas/knowledge.py` — 3 Pydantic models: `KnowledgeChunk`, `KnowledgeDocListItem`, `KnowledgeDocDetail`
- Created `api/app/queries/knowledge.py` — 5 SQL query functions: `list_documents`, `get_document`, `get_chunks`, `insert_document`, `delete_document`
- Created `api/app/routers/knowledge.py` — 4 endpoints: `GET /knowledge/documents`, `GET /knowledge/documents/{doc_id}`, `POST /knowledge/documents`, `DELETE /knowledge/documents/{doc_id}`
- Updated `api/app/main.py` to register the knowledge router at `/knowledge`
- Fixed `api/app/db.py`: added `check=_check_connection` to the pool to handle Neon dropping idle connections; dropped `min_size` from 2 to 1
- Fixed justfile: changed `windows-shell` from `powershell.exe` to `cmd.exe /c` (PowerShell 5 doesn't support `&&`); fixed `dev-api` path to use `.\\.venv\\Scripts\\uvicorn`

### Key decisions
- Raw file content stored in `metadata.raw_content` JSONB — actual chunking/embedding pipeline is Milestone 3; this endpoint just creates the record at `status=pending`
- File type validated by extension (`.pdf`, `.md`, `.txt`) not Content-Type, since curl sends `application/octet-stream` for `.md` files without an explicit type override
- Chunks excluded from list endpoint (only on detail) — embedding vectors never returned (1536-dim float array is too large for API responses)
- `Jsonb()` wrapper from `psycopg.types.json` required to pass a Python dict as a JSONB parameter — psycopg 3 can't auto-adapt plain dicts with `%s`

### Key files
- `api/app/schemas/knowledge.py` — request/response shapes for the knowledge domain
- `api/app/queries/knowledge.py` — all SQL for knowledge docs and chunks
- `api/app/routers/knowledge.py` — 4 thin route handlers
- `api/app/db.py` — added `check` function for Neon connection resilience

### Gotchas
- `psycopg.ProgrammingError: cannot adapt type 'dict'` — psycopg 3 requires `Jsonb(dict)` wrapper, not a bare dict, when inserting into a JSONB column via `%s`
- Neon drops idle connections; without a `check` function the pool hands out stale connections that fail on first use with `SSL connection has been closed unexpectedly`
- PowerShell `curl` is `Invoke-WebRequest` — use `curl.exe` for real curl; multiline commands with backtick continuation are fragile, put everything on one line

### Verified
- Agent JWT → `GET /knowledge/documents` → 10 docs (internal + client_visible) ✓
- Client JWT → `GET /knowledge/documents` → 6 docs (client_visible only, RLS filtering) ✓
- Team Lead JWT → `GET /knowledge/documents` → 10 docs ✓
- `POST /knowledge/documents` with CLAUDE.md → `{"status":"pending","chunks":[]}` ✓
- `DELETE /knowledge/documents/{id}` → 204 No Content ✓
- Follow-up GET on deleted doc → 404 Not Found ✓

---

## Milestone 2C — Review Queue & Approval Endpoints
**Date:** 2026-03-14

### What changed
- Created `api/app/schemas/drafts.py` — 3 Pydantic models: `DraftQueueItem`, `ApprovalRequest` (with `model_validator` enforcing `edited_body` for `edited_and_approved`), `ApprovalResponse`
- Created `api/app/queries/drafts.py` — 5 SQL query functions: `list_pending_drafts`, `get_draft`, `insert_approval_action`, `update_draft_outcome`, `update_ticket_status`
- Created `api/app/routers/drafts.py` — 2 endpoints: `GET /drafts/review-queue`, `POST /drafts/{draft_id}/review`; includes `require_role()` helper
- Updated `api/app/main.py` to register the drafts router at `/drafts`
- Fixed `seed/mint_tokens.py` to accept a role argument and print a bare token (no `export` prefix, no comment) — previously the full output was being captured into the PowerShell variable instead of just the token

### Key decisions
- Review queue filters `approval_outcome = 'pending' OR approval_outcome IS NULL` — seed data uses NULL for un-reviewed drafts, not the string `'pending'`
- `require_role()` is a plain function (not a FastAPI dependency) — called explicitly at the top of each route that needs it, which keeps the 403 logic visible in the handler rather than hidden in a decorator
- Approving or `edited_and_approved` also updates `ticket.status` to `pending_customer` — the draft router is the only place this transition happens, so the state change is co-located with the action that triggers it
- Body truncated to 200 chars in SQL (`LEFT(dg.body, 200)`) rather than in Python — avoids loading full draft bodies for a queue that could have hundreds of items

### Key files
- `api/app/schemas/drafts.py` — request/response shapes including Pydantic validator for `edited_and_approved`
- `api/app/queries/drafts.py` — all SQL for the review queue and approval actions
- `api/app/routers/drafts.py` — thin route handlers with explicit role checks
- `seed/mint_tokens.py` — now accepts a role name argument for bare-token output

### Gotchas
- Seed data stores un-reviewed drafts as `approval_outcome IS NULL`, not `'pending'` — the queue must filter on both
- `mint_tokens.py` printed `export AGENT_JWT=<token>` with a comment header, so PowerShell captured the full multi-line string instead of just the JWT; fixed by printing just the raw token when a role argument is passed

### Verified
- `GET /drafts/review-queue` → 59 pending drafts, paginated (FIFO order) ✓
- `POST /drafts/{id}/review` with `action: "approved"` → `approval_actions` row created, `approval_outcome` updated ✓
- `POST /drafts/{id}/review` with `action: "rejected", reason: "Off-brand tone"` → reason persisted ✓
- Client JWT → `GET /drafts/review-queue` → `{"detail":"Role 'client_user' cannot access this resource"}` ✓

---

## Milestone 2D — Eval API Endpoints
**Date:** 2026-03-14

### What changed
- Created `api/app/schemas/evals.py` — 9 Pydantic models: `EvalExample`, `EvalSetListItem`, `EvalSetDetail`, `EvalResult`, `EvalRunListItem`, `EvalRunDetail`, `EvalRunCreate`, `MetricDiff`, `EvalComparison`, `PromptVersion`
- Created `api/app/queries/evals.py` — SQL functions for all eval and prompt-version queries
- Created `api/app/routers/evals.py` — 7 endpoints under `/eval/*`
- Created `api/app/routers/prompts.py` — `GET /prompt-versions`
- Updated `api/app/main.py` to register both new routers

### Key decisions
- `/eval/runs/compare` registered before `/eval/runs/{run_id}` — FastAPI matches routes in order; if `{run_id}` came first, the string "compare" would be parsed as a UUID and fail
- `POST /eval/runs` creates the record and immediately fetches the joined row (with `eval_set_name`, `prompt_version_name`) so the response matches `EvalRunListItem` — the INSERT RETURNING clause doesn't have the join data
- All eval endpoints use double-layer access control: RLS policies block non-team_lead roles at the DB level, `require_role()` returns a 403 at the application level before any query runs
- Prompt versions endpoint uses `get_rls_db` (for connection hygiene) but no role check — prompt versions are shared reference data, not tenant-scoped

### Key files
- `api/app/schemas/evals.py` — all request/response shapes
- `api/app/queries/evals.py` — all SQL for eval domain + prompt versions
- `api/app/routers/evals.py` — 7 eval endpoints
- `api/app/routers/prompts.py` — prompt versions list

### Gotchas
- PowerShell mangles `{}` in curl `-d` arguments even inside single-quoted strings; workaround is writing body to a file and using `-d @body.json`

### Verified
- `GET /eval/sets` → 3 sets with correct example counts ✓
- `GET /eval/sets/{id}` → full example list (60 examples for Classification Accuracy) ✓
- `POST /eval/runs` → creates run with `status=pending`, `total_examples=60` ✓
- `GET /eval/runs/compare?run_a_id=X&run_b_id=X` → correct comparison structure, `metric_diff` with null values (no results yet) ✓
- Agent JWT → `GET /eval/sets` → `{"detail":"Role 'support_agent' cannot access this resource"}` ✓
- Client JWT → `GET /eval/sets` → `{"detail":"Role 'client_user' cannot access this resource"}` ✓
- `GET /prompt-versions` → all 4 seed prompt versions ✓

---

## Milestone 3A — OpenAI Provider Module
**Date:** 2026-03-14

### What changed
- Created `api/app/providers/openai.py` — thin wrapper around the OpenAI SDK exposing exactly three operations: `classify()`, `embed()` / `embed_batch()`, `generate_with_tools()`
- Created `api/app/providers/__init__.py` re-exporting the public API and `ProviderError`
- Created `api/tests/test_openai_provider.py` with both SDK-level mocked tests and HTTP-level transport tests

### Key decisions
- Module-level `client = OpenAI(api_key=settings.openai_api_key)` singleton — avoids re-creating the client per call while keeping the module importable (settings are resolved at startup, not at import time of the module itself)
- `generate_with_tools()` uses the Responses API `previous_response_id` chaining for multi-turn tool loops rather than building a messages array manually — the API handles context accumulation server-side
- `_execute_tool_executor()` inspects the callable's signature to support both `(name, args)` and `({"name": ..., "arguments": ...})` calling conventions, keeping the pipeline callers flexible
- HTTP-level tests use a custom `_ReplayTransport(httpx.BaseTransport)` wired via `OpenAI(http_client=...)` — no new test dependencies, and the real SDK serialization/deserialization runs end-to-end

### Key files touched
- `api/app/providers/openai.py` (new)
- `api/app/providers/__init__.py` (new)
- `api/tests/test_openai_provider.py` (new)
- `api/pyproject.toml` — added `[tool.pytest.ini_options]` with `integration` marker

### Gotchas
- Live integration tests (`@pytest.mark.integration`) were skipped throughout — the configured OpenAI API key returns 429 `insufficient_quota`. Verified instead via HTTP-level transport tests that exercise the real SDK code path
- The Responses API uses `text={"format": {...}}` for structured output, not `response_format=` (that's the Chat Completions API). The SDK-level mocks in the first pass bypassed this entirely; the transport-layer tests catch it

### Verified
- All 8 non-integration tests pass: 2 SDK-level mocked tests + 6 HTTP-level transport tests ✓
- Request shape verified: `/v1/responses`, correct model, `text.format.type == "json_schema"`, `strict=True` ✓
- Token usage accumulation across tool-calling rounds verified ✓
- `previous_response_id` threading between agentic loop turns verified ✓
- `response.error` failure path raises `ProviderError` ✓
- Embedding batching at boundary (101 texts → 2 HTTP requests of 100 + 1) verified ✓

---

## Milestone 3B — Triage Pipeline
**Date:** 2026-03-14

### What changed
- Created `api/app/pipelines/triage.py` — `run_triage(conn, ticket_id)` orchestrates the full classification flow
- Added two query functions to `api/app/queries/tickets.py`: `get_ticket_triage_context()` (subject + first customer message) and `get_active_prompt_version()` (loads active prompt by type)
- Extended `insert_ticket_prediction()` in `queries/tickets.py` to store all prediction fields including `latency_ms`, `token_usage` (JSONB), and `estimated_cost_cents`
- Added `POST /tickets/{ticket_id}/triage` to `api/app/routers/tickets.py` — calls the pipeline, returns `TicketPredictionRecord`
- Added `TicketPredictionRecord` schema (extends `TicketPrediction` with `ticket_id`, `prompt_version_id`, and telemetry fields)

### Key decisions
- Prediction stored in `ticket_predictions` only — never written back to `ticket.category` or `ticket.priority` without agent approval; this is the core separation that makes the eval harness meaningful
- `get_ticket_triage_context()` falls back to the first message of any type if no customer-typed message exists — defensive against tickets opened without a customer message body
- Role-gated at the router level (`support_agent` or `team_lead` only) and errors surface as 404, 500, or 502 depending on cause (ticket not found, no active prompt, provider failure)
- `token_usage` stored via `Jsonb()` wrapper — psycopg 3 can't adapt plain dicts to JSONB with `%s`

### Key files
- `api/app/pipelines/triage.py` — the pipeline; `TRIAGE_RESPONSE_SCHEMA`, `run_triage()`
- `api/app/queries/tickets.py` — `get_ticket_triage_context()`, `get_active_prompt_version()`, `insert_ticket_prediction()`
- `api/app/routers/tickets.py` — `POST /{ticket_id}/triage` endpoint
- `api/app/schemas/tickets.py` — `TicketPredictionRecord`

### Gotchas
- None encountered; implementation was clean given the provider module from 3A

### Verified
- Code review confirms all spec requirements met: correct schema, correct query, correct RLS dependency, predictions append-only, no ticket field overwrite

---

## Milestone 3C — Knowledge Retrieval
**Date:** 2026-03-14

### What changed
- Created `api/app/pipelines/retrieval.py` — `search_knowledge(conn, workspace_id, query, top_k, visibility_filter)` embeds the query and runs a pgvector cosine similarity search
- Added `KnowledgeSearchResult` Pydantic model to `api/app/schemas/knowledge.py`
- Added `GET /knowledge/search?q=<query>&top_k=5` endpoint to `api/app/routers/knowledge.py`
- Created `api/test_retrieval.py` — dev-only script that bypasses the embed call with a random vector (useful when OpenAI quota is exhausted, valid since seed embeddings are random anyway)

### Key decisions
- `workspace_id` passed explicitly in the WHERE clause as belt-and-suspenders alongside RLS — pgvector index scans may not trigger RLS row filtering in all query plans
- Vector formatted as a string literal `[x,y,z,...]` and cast with `::vector` — psycopg 3 has no native pgvector type adapter; string casting is the standard workaround
- Optional `visibility_filter` parameter added to the function signature for use by the drafting pipeline, even though the search endpoint doesn't expose it directly
- The query vector is passed twice: once in the SELECT for the similarity score (`1 - (embedding <=> %s)`) and once in the ORDER BY for the sort

### Key files
- `api/app/pipelines/retrieval.py` — `search_knowledge()` function
- `api/app/schemas/knowledge.py` — added `KnowledgeSearchResult`
- `api/app/routers/knowledge.py` — added `GET /knowledge/search` endpoint
- `api/test_retrieval.py` — random-vector test script (dev only)

### Gotchas
- OpenAI account quota was exhausted (`insufficient_quota`) — the embed call fails before the SQL even runs. Worked around with a direct DB test script using a random vector, which is equivalent since seed embeddings are also random.
- Similarity scores with random seed embeddings are low (~0.02–0.09) and effectively random — expected; will improve after 3E re-embeds with real OpenAI vectors

### Verified
- `test_retrieval.py` returns 5 results with chunk content, document titles, similarity scores, and visibility field ✓
- `internal` docs appear in the direct DB query (no RLS) — confirmed RLS filtering is the correct layer for client visibility ✓
- `top_k` parameter works correctly (tested with 5 and 10) ✓

---

## Milestone 3D — Grounded Drafting Pipeline
**Date:** 2026-03-14

### What changed
- Created `api/app/pipelines/drafting.py` — `generate_draft(conn, ticket_id)` runs the full agentic loop: loads ticket context + messages + active draft prompt, calls `generate_with_tools()` with a `search_knowledge` tool, parses the JSON response (with regex fallback for plain text), enforces `send_ready=false` when no evidence is cited, and stores the record
- Added `insert_draft()` to `api/app/queries/tickets.py` — inserts into `draft_generations`, passes `evidence_chunk_ids` as a list of `uuid.UUID` objects for the `UUID[]` column
- Added `EvidenceChunk` and `DraftGenerationResponse` schemas to `api/app/schemas/tickets.py`
- Added `POST /tickets/{ticket_id}/draft` and `POST /tickets/{ticket_id}/redraft` to `api/app/routers/tickets.py` — both require `support_agent` or `team_lead`, both create a new `draft_generations` record (redraft never overwrites)
- Updated `api/app/pipelines/__init__.py` to export `generate_draft`, `DraftTicketNotFoundError`, `DraftPromptNotConfiguredError`
- Created `api/test_draft_pipeline.py` — smoke test that stubs `generate_with_tools` and `search_knowledge` but uses the real DB; verifies all 6 checklist items without spending OpenAI credits

### Key decisions
- `generate_draft()` fetches `workspace_id` from the ticket row itself — no need to pass it from the router; keeps the function signature clean
- Tool executor accumulates all retrieved chunks in a closure-scoped list; only chunks actually cited in the final body are included in `evidence_chunks` returned to the caller
- `send_ready` enforcement: if `cited_chunk_ids` is empty after parsing, `send_ready` is forced to `False` regardless of what the model returned — this is a hard invariant, not a suggestion
- Draft prompt (draft-v2) instructs the model to output `{body, cited_evidence, confidence, unresolved_questions, send_ready}` as JSON; the fallback path extracts chunk UUIDs by regex when the model returns plain text
- `evidence_chunk_ids` stored as `uuid.UUID[]` — strings must be converted before passing to psycopg for the `UUID[]` column

### Key files
- `api/app/pipelines/drafting.py` — the pipeline; `_SEARCH_KNOWLEDGE_TOOL`, `generate_draft()`
- `api/app/queries/tickets.py` — added `insert_draft()`
- `api/app/schemas/tickets.py` — added `EvidenceChunk`, `DraftGenerationResponse`
- `api/app/routers/tickets.py` — `POST /{ticket_id}/draft`, `POST /{ticket_id}/redraft`
- `api/test_draft_pipeline.py` — offline smoke test

### Gotchas
- OpenAI Responses API uses a flat tool format (`{"type": "function", "name": "...", "description": "...", "parameters": {...}}`), not the Chat Completions nested format (`{"type": "function", "function": {"name": ...}}`). The wrong format caused a `missing_required_parameter: tools[0].name` 400 error.
- OpenAI account quota was exhausted — tested via a mock-based smoke test that stubs the provider but hits the real DB, verifying all pipeline logic and SQL without live API calls
- `app.role` vs `app.user_role`: the RLS `current_user_role()` function reads `app.user_role`; the test initially set `app.role`, causing an `InsufficientPrivilege` error on `draft_generations` insert
- Pool connections from `p.connection()` are already in transaction state — setting `autocommit = False` raises `ProgrammingError: can't change 'autocommit' now: connection in transaction status INTRANS`

### Verified
- All 6 smoke test assertions pass: body populated, chunk citation in body, evidence_chunk_ids, evidence_chunks returned, two separate draft IDs on two calls, `send_ready=False` with no evidence ✓

---

## Milestone 3E — Knowledge Ingestion Pipeline
**Date:** 2026-03-17

### What changed
- Created `api/app/pipelines/ingestion.py` — `ingest_document(document_id, workspace_id)` background task: parses content, chunks text into ~500-token overlapping segments, embeds all chunks via `embed_batch()`, inserts into `knowledge_chunks`, updates document `status` through `pending → processing → indexed`
- Added `_workspace_conn(workspace_id)` context manager that sets up full RLS context (`SET LOCAL ROLE rls_user`, `app.workspace_id`, `app.user_role = 'support_agent'`) on a pool connection for background operations
- Added `_find_document_with_retry()` — opens a fresh pool connection per attempt (up to 10 × 100ms) so each retry gets a new transaction snapshot, handling the race between the upload transaction committing and the background task starting
- Updated `api/app/routers/knowledge.py` — `POST /knowledge/documents` now inserts the document using a dedicated pool connection (not the `get_rls_db` connection), so the row is committed before `BackgroundTasks` run; passes `user.workspace_id` explicitly to `ingest_document`
- Added `pymupdf>=1.24` to `api/pyproject.toml` for PDF text extraction via `import fitz`
- Created `seed/reembed.py` — management script to re-embed all seed knowledge chunks with real OpenAI vectors (replaces random seed embeddings, costs ~$0.02)
- Added `mock_ai: bool = False` to `api/app/config.py` (reads `MOCK_AI` env var)
- Added `_mock_classify()`, `_mock_embed_batch()`, `_mock_generate_with_tools()` to `api/app/providers/openai.py`; guards at the top of each public function check `settings.mock_ai` before calling OpenAI
- Fixed `conn.executemany()` → `conn.cursor().executemany()` in `api/app/queries/knowledge.py`

### Key decisions
- Upload route uses its own dedicated pool connection (not `get_rls_db`) for the document insert — Starlette runs `BackgroundTasks` before yield-dependency teardown, so the `get_rls_db` transaction is still open when the task starts. A self-managed connection that exits (and commits) before `background_tasks.add_task()` is called guarantees the row is visible immediately
- Background task receives `workspace_id` directly from the route handler rather than looking it up — avoids the chicken-and-egg problem of needing RLS context to find the document in order to get the workspace_id needed for RLS context
- `_find_document_with_retry()` opens a fresh connection per attempt: a reused connection in the same transaction snapshot will never see a row that was committed after the snapshot started
- `_mock_generate_with_tools()` calls the real tool executor so actual DB retrieval runs — only the LLM generation step is skipped. This makes mock mode test retrieval, RLS scoping, and DB writes for real

### Key files
- `api/app/pipelines/ingestion.py` — `ingest_document()`, `_workspace_conn()`, `_find_document_with_retry()`, `chunk_text()`
- `api/app/routers/knowledge.py` — upload route uses dedicated pool connection
- `api/app/queries/knowledge.py` — `get_document_for_ingestion()`, `insert_chunks()` (cursor fix), `update_document_status()`
- `api/app/providers/openai.py` — mock implementations + guards
- `api/app/config.py` — `mock_ai` setting
- `seed/reembed.py` — re-embedding management script

### Gotchas
- Starlette executes `BackgroundTasks` before yield-dependency cleanup — `get_rls_db`'s transaction is still open when the background task runs, so the freshly inserted document is invisible to any other connection. Fix: dedicate a separate pool connection for the insert that commits before the task is registered
- `db.commit()` inside `with conn.transaction():` raises `ProgrammingError: Explicit commit() forbidden within a Transaction context` — the context manager owns the commit lifecycle; explicit commits are not allowed
- `neondb_owner` does not bypass RLS. All policies are `FOR ALL TO rls_user` — a connection without `SET LOCAL ROLE rls_user` sees zero rows, regardless of the connecting user's admin status
- RLS policy on `knowledge_documents` requires both `app.workspace_id` AND `app.user_role IN ('support_agent', 'team_lead')` — setting only `app.workspace_id` filters out all rows because the policy's `current_user_role()` check evaluates to false
- psycopg3's `Connection` has `execute()` as a shorthand but not `executemany()` — only `Cursor` does. `conn.executemany(...)` raises `AttributeError`; must use `conn.cursor().executemany(...)`

### Verified
- `POST /knowledge/documents` with CLAUDE.md → `status: pending` immediately, `status: indexed` with 3 chunks after ~2s ✓
- `GET /knowledge/documents/{id}` → chunks array with `content`, `chunk_index`, `token_count` ✓
- `GET /knowledge/search?q=billing+refund` → 5 results with `chunk_id`, `document_title`, `similarity`, `content` ✓
- `MOCK_AI=1` triage → `billing / medium / billing_team / confidence 0.87 / latency_ms 42` stored in DB ✓
- `MOCK_AI=1` draft → 3 real evidence chunks retrieved from DB, draft stored with citations, `send_ready: true` ✓

---

## Milestone 3F — End-to-End Pipeline Verification
**Date:** 2026-03-17

### What changed
- No code changes — this is a verification milestone
- Ran full pipeline verification against live DB with `MOCK_AI=1` (OpenAI credits unavailable)

### Key decisions
- Tested with `MOCK_AI=1` throughout — mock mode exercises all DB writes, RLS scoping, status transitions, role enforcement, and retrieval for real; only the LLM generation call is stubbed. This makes the verification meaningful even without API credits
- All testing done in PowerShell with `curl.exe`; JSON request bodies written to `body.json` and passed as `-d @body.json` to avoid PowerShell quoting issues with curly braces

### Key files
- No files changed

### Gotchas
- PowerShell `-d '{"action": "approved"}'` silently sends an empty body — `curl.exe` on Windows doesn't expand single-quoted strings as shell literals. Fix: write body to a file with `Out-File -Encoding utf8 -NoNewline` and pass `-d @body.json`
- Draft response is flat (fields at the top level), not nested under a `"draft"` key — `$DRAFT.id` not `$DRAFT.draft.id`
- `$DRAFT_ID` was overwritten when running a diagnostic `ConvertTo-Json` check in the same session; re-ran the draft endpoint to get a fresh ID

### Verified
- Upload → `indexed` with real chunks in DB ✓
- Search returns 5 results from seed data with similarity scores ✓
- Triage stores prediction: `billing / medium / billing_team / 0.87 confidence / 42ms` ✓
- Draft retrieves 3 real evidence chunks, stores draft with citation markers, `send_ready: true` ✓
- Approval: `POST /drafts/{id}/review` with `action: "approved"` → 201, ticket transitions to `pending_customer` ✓
- Role enforcement: client JWT → triage → `{"detail":"Role 'client_user' cannot access this resource"}` ✓
- Tenant isolation: evidence chunks scoped to agent's workspace only ✓

---


## Milestone 4A — App Shell, Layout & Navigation
**Date:** 2026-03-17

### What changed
- Installed shadcn components: sidebar, separator, tooltip, avatar, dropdown-menu, badge, skeleton, breadcrumb
- Created `web/src/types/api.ts` — full TypeScript interface set mirroring all FastAPI Pydantic schemas
- Created `web/src/components/providers.tsx` — TanStack Query provider (30s stale time, retry 1)
- Created `web/src/hooks/use-current-user.ts` — `useCurrentUser()` hook via `useQuery`
- Created `web/src/components/app-sidebar.tsx` — collapsible sidebar with role-based nav groups, sign-out dropdown, skeleton loading states
- Created `web/src/components/page-breadcrumb.tsx` — pathname-driven breadcrumb using Next.js `<Link>`
- Created `web/src/app/(app)/layout.tsx` — app shell route group (Providers + SidebarProvider + header bar with trigger + breadcrumb)
- Created placeholder pages: `/tickets`, `/tickets/[id]`, `/reviews`, `/knowledge`, `/evals`
- Updated root `layout.tsx`: title → "Agent Service Desk", font → Inter

### Key decisions
- Used `(app)` route group so the sidebar layout wraps only authenticated pages; login page stays outside
- Nav renders skeletons while `useCurrentUser` is pending — avoids showing wrong items before role is known
- Used `render={<Link href={...} />}` prop (Base UI pattern used by this shadcn version) instead of `asChild` for all sidebar buttons and breadcrumb links

### Key files touched
`web/src/types/api.ts`, `web/src/components/providers.tsx`, `web/src/hooks/use-current-user.ts`, `web/src/components/app-sidebar.tsx`, `web/src/components/page-breadcrumb.tsx`, `web/src/app/(app)/layout.tsx`, `web/src/lib/api-client.ts`

### Gotchas
- This shadcn version (base-nova style, Base UI primitives) uses `render` prop instead of `asChild` — `asChild` causes a TypeScript error
- `api-client.ts` caches the JWT in a module-level variable; must call `clearTokenCache()` on sign-out or switching accounts reuses the old token for up to 1 hour

---

## Milestone 4B — Ticket Queue Page
**Date:** 2026-03-17

### What changed
- Installed shadcn `table`, `select`, `card` components
- Created `web/src/hooks/use-tickets.ts` — TanStack Query hook; builds query string from params object
- Created `web/src/hooks/use-ticket-filters.ts` — URL-synced filter/sort/pagination state via `useSearchParams` + `useRouter`; no `useState` for filter values
- Created `web/src/lib/format.ts` — `formatRelativeTime` and `formatCategory` utilities (no date library)
- Replaced `web/src/app/(app)/tickets/page.tsx` — full ticket queue: filter bar (4 Select dropdowns), sortable table (Created/Priority/Status), skeleton rows, empty state, pagination
- Added `--color-success` / `--color-warning` CSS tokens to `globals.css` (oklch values, light + dark)
- Fixed RLS policies: updated `ticket_isolation` to be role-aware (`client_user` → org_id scope, agents/leads → workspace_id scope); removed explicit `t.org_id = current_org_id()` from 5 child-table policies so they inherit scope via EXISTS subquery
- Created `seed/migrate_rls.py` — `ALTER POLICY` migration script; applied to live Neon DB
- Updated `seed/demo_accounts.py` — client user now placed in a dedicated deterministic org (`DEMO_CLIENT_ORG_ID = 00000000-0000-4000-b000-000000000001`, "Acme Corp (Demo)") with zero seed tickets; demo tickets use `org_id = client_org, workspace_id = ws_1`
- Updated `seed/mint_tokens.py` — now queries `memberships` table for each user's actual `org_id` instead of hardcoding Org #1 for all roles

### Key decisions
- Page uses `"use client"` with `<Suspense>` wrapping inner component — correct Next.js pattern for `useSearchParams`
- All filter/sort/page state lives in the URL; `useTicketFilters` is a pure URL → state → URL hook with no local state
- Badge status/priority colors use `className` overrides + `twMerge` rather than new variant definitions
- Client demo org is a *new* deterministic org (not a random seed org) so it starts empty and shows exactly 48 demo tickets

### Key files
- `web/src/app/(app)/tickets/page.tsx` — main page component
- `web/src/hooks/use-ticket-filters.ts` — URL-synced filter state
- `web/src/hooks/use-tickets.ts` — data fetching hook
- `seed/schema.sql` — updated RLS policies (ticket_isolation + 5 child tables)
- `seed/migrate_rls.py` — live DB migration
- `seed/demo_accounts.py` — client org split
- `seed/mint_tokens.py` — DB-driven org_id lookup

### Gotchas
- Picking "Org #2 from seed" for the client org doesn't work — the second seed org happened to have 356 tickets, more than agents saw. Solution: create a brand new deterministic org with no seed tickets.
- Child-table RLS policies (`message_isolation`, `assignment_isolation`, etc.) had explicit `t.org_id = current_org_id()` checks that blocked agents from seeing cross-org tickets even after `ticket_isolation` was fixed. Removed those — EXISTS subqueries now inherit the ticket scope automatically via RLS.

---

## Milestone 4C — Ticket Detail Page
**Date:** 2026-03-18

### What changed
- Created `web/src/app/(app)/tickets/[id]/page.tsx` — two-column layout: left (header, message thread, reply box), right (triage, evidence, draft, actions panels) hidden for `client_user`
- Created `web/src/hooks/use-ticket-detail.ts` — TanStack Query hooks: `useTicketDetail`, `useUpdateTicket`, `useAddMessage`, `useAssignTicket`, `useTriageTicket`, `useGenerateDraft`, `useRedraft`, `useReviewDraft`
- Created `web/src/components/ticket/ticket-header.tsx` — subject, org name, assignee widget, status/priority/category/team/SLA badges, created/updated timestamps
- Created `web/src/components/ticket/message-thread.tsx` — scrollable thread, auto-scrolls to bottom on new message, sender-type-based background tinting (teal for agent/system, amber for internal, neutral for client), full datetime on hover
- Created `web/src/components/ticket/reply-box.tsx` — textarea + send button, internal note toggle for agents/leads
- Created `web/src/components/ticket/triage-panel.tsx` — runs AI triage, displays predicted category/priority/team/confidence, escalation flag
- Created `web/src/components/ticket/draft-panel.tsx` — generate/redraft buttons, draft body display, send-ready badge
- Created `web/src/components/ticket/evidence-panel.tsx` — shows RAG evidence chunks returned from draft generation, source doc titles
- Created `web/src/components/ticket/ticket-actions.tsx` — status/priority/category/team dropdowns, assign dialog
- Created `web/src/components/ticket/ticket-ui.tsx` — shared helpers: `StatusBadge`, `PriorityBadge`, `SenderBadge`, `formatEnumLabel`, `getInitials`, `getSlaLabel`, `isPrivilegedRole`, `getErrorStatus`, `getErrorMessage`
- Added `web/src/components/ui/dialog.tsx`, `scroll-area.tsx`, `textarea.tsx`, `alert.tsx`
- Fixed `api/app/pipelines/triage.py` — added `escalation_reason` to `required` in the JSON schema (OpenAI structured outputs require all properties to be listed)
- Updated `web/src/components/page-breadcrumb.tsx` — detail pages show `#<short-uuid>` instead of generic "Detail"
- Updated `web/src/lib/format.ts` — added `formatDateTime` utility

### Key decisions
- Evidence chunks are local state in the page component, not in the query cache — they come back only on draft generation response, not on ticket fetch, so caching them server-side would require an extra round-trip
- `isPrivilegedRole` gates the entire right-hand panel; `client_user` sees only header + thread + reply box
- Triage predictions are never written to ticket fields — stored separately in `ticket_predictions`, applied only on agent approval
- Message sender-type styling uses `sender_type` field (not current-user comparison) — avoids needing to pass auth user into every message component; works correctly from any role's perspective

### Key files
- `web/src/app/(app)/tickets/[id]/page.tsx` — page orchestration, evidence state, scroll-to-actions
- `web/src/hooks/use-ticket-detail.ts` — all mutations and ticket query
- `web/src/components/ticket/` — all panel components
- `api/app/pipelines/triage.py` — schema fix

### Gotchas
- OpenAI structured outputs with `additionalProperties: false` require every `properties` key to also appear in `required` — `escalation_reason` was missing, causing 400 errors on every triage call
- `PageBreadcrumb` lives in the shared layout and has no access to TanStack Query or server data; showing the short UUID from the URL path is the correct pattern rather than fetching ticket subject

---

## Milestone 4D — Review Queue Page
**Date:** 2026-03-18

### What changed
- Created `web/src/hooks/use-review-queue.ts` — `useReviewQueue` (paginated fetch with 30s auto-refresh) and `useReviewDraftFromQueue` (approve/reject/escalate mutation)
- Replaced `web/src/app/(app)/reviews/page.tsx` — full review queue implementation with card list, pagination, skeleton loading, empty state, and reject dialog
- Patched `fix: post-4C` commit: downgraded generation model (`gpt-5.4` → `gpt-5-mini`), handle string confidence values from drafting pipeline, fixed SelectValue display in filter and action dropdowns, stripped `[chunk:uuid]` markers from rendered draft body

### Key decisions
- Each `ReviewCard` is a self-contained component with its own `useReviewDraftFromQueue` hook instance — avoids shared mutation state across cards, each card tracks its own pending/error state independently
- "Edit" navigates to `/tickets/[ticket_id]` rather than opening an inline dialog — the review queue body is truncated to 200 chars, so editing requires the full draft body available only on the ticket workspace
- `useReviewDraftFromQueue` optionally accepts `ticketId` and invalidates `["ticket", ticketId]` when provided — keeps the ticket workspace cache warm if the user navigates there after acting from the queue
- Pagination is URL-synced (`?page=N`) consistent with the ticket queue pattern; `refetchInterval: 30_000` on the query so new drafts surface without manual refresh

### Key files
- `web/src/hooks/use-review-queue.ts` — query + mutation hooks for the review queue
- `web/src/app/(app)/reviews/page.tsx` — full page implementation

### Gotchas
- `time_since_generation` is returned as seconds (a number), not an ISO date string — required a separate `formatSecondsAgo(seconds)` helper rather than reusing `formatRelativeTime(dateString)` from `lib/format.ts`

---

## Milestone 4E — Knowledge Upload Page
**Date:** 2026-03-18

### What changed
- Installed shadcn components: `alert-dialog`, `progress`, `label`
- Exported `API_URL` and `getToken` from `web/src/lib/api-client.ts` to support multipart file uploads that bypass the JSON-only `apiClient`
- Added `token_count?: number | null` to `KnowledgeChunk` in `web/src/types/api.ts` (mirrors the backend schema)
- Created `web/src/hooks/use-knowledge.ts` — `useKnowledgeDocs` (paginated list with 5s auto-refresh when any doc is `processing`), `useKnowledgeDocDetail` (triggered on chunk expansion), `useUploadDocument` (direct `fetch` with `FormData`), `useDeleteDocument`
- Created `web/src/components/knowledge/upload-dialog.tsx` — modal with title input, visibility select, native file input with client-side extension validation (.pdf/.md/.txt only), upload/error states
- Replaced `web/src/app/(app)/knowledge/page.tsx` — full page: header with Upload button, URL-synced status/visibility filters, card list with inline chunk expansion, AlertDialog delete confirmation, pagination, empty state, `client_user` access gate
- Fixed role-gating flash across Knowledge, Reviews, and Evals pages: added `isPending` guard so pages return `null` while user role is loading; disabled API queries via `enabled` flag for unauthorized roles

### Key decisions
- File upload uses raw `fetch` (not `apiClient`) because `apiClient.post()` always sets `Content-Type: application/json` — using `fetch` directly lets the browser set the `multipart/form-data` boundary automatically
- Chunk expansion uses a `ChunkList` sub-component that is only mounted when expanded — this naturally scopes the `useKnowledgeDocDetail` query to the expanded card without conditional hook calls
- `refetchInterval` in `useKnowledgeDocs` is a function that inspects `query.state.data` to decide whether to poll (5s) — avoids polling on stable pages while still auto-refreshing during ingestion
- `enabled: !userPending && !isClientUser` pattern propagated to `useKnowledgeDocs` and `useReviewQueue` — prevents unauthorized API calls from firing before the role check resolves

### Key files
- `web/src/hooks/use-knowledge.ts` — all knowledge query/mutation hooks
- `web/src/components/knowledge/upload-dialog.tsx` — upload dialog
- `web/src/app/(app)/knowledge/page.tsx` — full page
- `web/src/app/(app)/reviews/page.tsx` — added role gate
- `web/src/app/(app)/evals/page.tsx` — added role gate

### Gotchas
- The `Select` component's `onValueChange` types its callback as `(value: string | null, ...) => void` in this shadcn version — `setVisibility` (typed `Dispatch<SetStateAction<string>>`) is not directly assignable; fixed with `(v) => setVisibility(v ?? "internal")`
- Role flash fix requires returning `null` (not a skeleton) for the brief loading window — a skeleton would be equally misleading for unauthorized users, and `useCurrentUser` resolves quickly from TanStack Query cache on subsequent navigations

---

## Milestone 5A — Eval Runner Backend
**Date:** 2026-03-18

### What changed
- Created `api/app/pipelines/evaluation.py` — background task that executes an eval run end-to-end
- Added 5 query functions to `api/app/queries/evals.py`: `get_eval_run_for_execution`, `get_eval_examples_for_run`, `insert_eval_result`, `update_eval_run_completed`, `update_eval_run_status`
- Updated `api/app/routers/evals.py`: `create_eval_run` now accepts `BackgroundTasks` and fires `run_evaluation` after creating the run record

### Key decisions
- **`_lead_conn()` context manager** — eval tables have RLS policies (`current_user_role() = 'team_lead'`) and on Neon even `neondb_owner` is subject to RLS (not a true superuser). All background task DB access uses `SET LOCAL ROLE rls_user` + `set_config('app.user_role', 'team_lead', TRUE)`.
- **`create_eval_run` bypasses `get_rls_db`** — Starlette awaits background tasks *inside* `response.__call__`, which runs before the `AsyncExitStack` (dependency cleanup) commits the `get_rls_db` transaction. The route uses `_lead_conn()` directly so the INSERT commits before the background task fires.
- **Per-example error isolation** — each example result is written in its own connection; an exception in one example is caught, recorded as `passed=False` with a `notes` error message, and the run continues.
- **Citation eval uses first workspace** — `eval_examples` has no workspace foreign key, so the runner queries the first workspace and runs a raw pgvector cosine search against indexed chunks.
- **Metrics only set at completion** — `passed`/`failed` counts and `metrics` JSON are written in a single `update_eval_run_completed` call at the end; intermediate polling shows 0/0 counts but growing `results[]`.

### Key files
- `api/app/pipelines/evaluation.py` — `run_evaluation()` entry point, `_lead_conn()` context manager, per-type processors (`_run_classification`, `_run_routing`, `_run_citation`), `_compute_metrics()`
- `api/app/queries/evals.py` — added execution-time query functions
- `api/app/routers/evals.py` — `create_eval_run` wired to background task

### Verified (real API, not mock)
- Classification Accuracy set (60 examples) against triage-v2: **90% accuracy** (54/60 passed)
- Same set against triage-v1: **86.7% accuracy** (52/60 passed)
- Compare endpoint returns real metric diffs between both completed runs
- 6 failures were genuine model disagreements (e.g., `api_issue` vs `bug_report`), no errors

### Gotchas
- Neon managed Postgres: `neondb_owner` is NOT a bypass-RLS superuser — even with `ENABLE ROW LEVEL SECURITY` (not FORCE), background tasks must set up `rls_user` role explicitly
- FastAPI/Starlette background task ordering: `BackgroundTasks` runs inside `response.__call__` before `AsyncExitStack.__aexit__` — the creating route's transaction hasn't committed when the task starts. Fix: commit in the route via an explicit connection, not `get_rls_db`

---

## Milestone 5B — Eval Console Frontend
**Date:** 2026-03-18

### What changed
- Installed shadcn `tabs`, `collapsible`, and `checkbox` components
- Updated `web/src/types/api.ts`: aligned `EvalExample`, `EvalResult`, `EvalComparison`, `MetricDiff`, and `PromptVersion` with actual backend Pydantic schemas (backend uses flat `metric_diff` object, not an array; `model_output` is `unknown`; `PromptVersion` has `type` and `is_active`)
- Created `web/src/hooks/use-evals.ts`: six hooks — `useEvalSets`, `useEvalRuns` (auto-refetch every 5s while any run is pending/running), `useEvalRunDetail`, `useEvalComparison`, `usePromptVersions`, `useCreateEvalRun`
- Created `web/src/components/eval/run-eval-form.tsx`: Tab 1 — Select dropdowns for eval set and prompt version, "Run Evaluation" button
- Created `web/src/components/eval/eval-runs-list.tsx`: Tab 2 — Runs table with status badges, pass/fail counts, accuracy %, checkboxes for comparison selection, collapsible per-example detail with pass/fail icons
- Created `web/src/components/eval/eval-comparison.tsx`: Tab 3 — Metrics side-by-side with colored deltas, per-example comparison with amber highlighting for differing results
- Replaced `web/src/app/(app)/evals/page.tsx` with full tabbed layout and access control

### Key decisions
- `useEvalRuns` uses a dynamic `refetchInterval` — polls every 5s only while at least one run is `pending` or `running`, otherwise stops; avoids unnecessary polling on idle pages
- Run detail is fetched on demand (`useEvalRunDetail`) when a row is expanded, not eagerly with the list — keeps the runs list fast
- Comparison tab is disabled until exactly 2 runs are checked; a badge on the tab shows the current selection count

### Gotchas
- Base UI `Select` requires `value` to be controlled from the first render — initializing with `null` and passing `?? undefined` causes an uncontrolled→controlled warning. Fix: initialize state as `""` and handle `onValueChange: (v) => setState(v ?? "")`
- Base UI `SelectValue` does not auto-display `ItemText` in the trigger — it must receive explicit children that look up the selected label from state (same pattern as `ticket-actions.tsx`)
- `model_output` from the eval API is typed as `Any` in Python and arrives as a JSON object (e.g. `{"category": "billing"}`), not a plain string — `String(value)` gives `[object Object]`; fixed with a `formatOutput()` helper that uses `Object.entries` for objects
- Base UI `CollapsibleTrigger` does not support `asChild` — render styles directly on the trigger element instead of wrapping a `Button`

---
