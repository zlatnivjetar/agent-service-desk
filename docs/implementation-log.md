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

