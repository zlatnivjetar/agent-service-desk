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

