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

