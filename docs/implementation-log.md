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

