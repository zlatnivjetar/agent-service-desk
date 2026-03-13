# Agent Service Desk — Implementation Plan (Part 1)

**Location:** `docs/implementation-plan.md` (inside the repo — Claude Code reads it automatically)
**Scope:** Milestones 1–3 (Scaffold, API Layer, AI Pipeline)
**Part 2** (Milestones 4–6: Frontend, Eval System, Demo Readiness) will be written after Part 1 is implemented, so work orders can reference real code.

\---

## Stack Decisions

|Layer|Choice|Version|Why|
|-|-|-|-|
|Database|Neon (Postgres 16 + pgvector)|Postgres 16|Managed, serverless-friendly, pgvector built-in|
|Backend|Railway (FastAPI)|FastAPI 0.135.x, Python 3.13|Simple deploy from Git, supports background workers|
|Frontend|Vercel (Next.js, App Router)|Next.js 16|Standard for Next.js, zero-config|
|Cache/Queue|Upstash Redis|—|Serverless Redis, needed for background job queue|
|AI Provider|OpenAI Responses API|SDK 2.26.x|Single provider for MVP|
|AI Models|gpt-5-mini (triage), gpt-5.4 (drafting), text-embedding-3-small (embeddings)|—|Mini for fast/cheap classification, 5.4 for grounded generation|
|Auth|BetterAuth → JWT → FastAPI|BetterAuth 1.5.x|Auth lives in Next.js, FastAPI validates tokens|
|DB Access|Sync psycopg|psycopg 3.3.x|Simpler than async; FastAPI's thread pool handles concurrency fine|

\---

## How to use each sub-milestone with Claude Code

Each sub-milestone below is a self-contained work order. When you're ready to implement it:

1. Make sure Claude Code has access to your repo (it reads your codebase automatically)
2. Paste the sub-milestone content directly as your prompt
3. No need to ask Claude Code to "plan first" — the work order IS the plan
4. After Claude Code finishes, verify the "Done when" checklist manually

**Tip:** If a sub-milestone is large (like 3D), tell Claude Code: "Let's implement this incrementally. Start with \[first item] and we'll continue." This keeps context window usage tight.

\---

## Milestone 1 — Project Scaffold \& Data Layer

**Goal:** Monorepo structure, Neon database with seed data, auth flow working end-to-end, RLS enforced. No UI yet.

\---

### Milestone 1A: Monorepo \& Infrastructure Setup

**Paste this into Claude Code:**

> Initialize the monorepo for "Agent Service Desk" with this exact structure:
>
> ```
> agent-service-desk/
> ├── web/                    # Next.js 16 (App Router, TypeScript)
> ├── api/                    # FastAPI (Python 3.13)
> ├── seed/                   # schema.sql + seed.py
> ├── docs/                   # project specs and architecture docs
> ├── .env.example
> ├── .gitignore
> ├── justfile                # task runner
> └── README.md
> ```
>
> \*\*`/web` setup:\*\*
> - Initialize with `npx create-next-app@latest web --typescript --tailwind --app --src-dir`
> - Install dependencies: `@tanstack/react-query`, `better-auth`, `zod`
> - Initialize shadcn/ui with default config
> - TypeScript strict mode enabled
> - Path alias `@/` pointing to `src/`
> - Create `web/src/lib/api-client.ts` — a thin fetch wrapper that:
>   - Reads `NEXT\_PUBLIC\_API\_URL` from env (default `http://localhost:8000`)
>   - Attaches `Authorization: Bearer <token>` header from session
>   - Has typed methods: `get<T>(path)`, `post<T>(path, body)`, `patch<T>(path, body)`, `del(path)`
>   - Throws on non-2xx responses with the error body
>
> \*\*`/api` setup:\*\*
> - Create `pyproject.toml` using `hatchling` as build backend
> - Dependencies: `fastapi`, `uvicorn\[standard]`, `psycopg\[binary]`, `pydantic>=2`, `pydantic-settings`, `pyjwt\[crypto]`, `httpx`, `openai>=2.26`, `numpy`, `redis`, `arq`, `python-multipart`
> - Create this package structure:
>   ```
>   api/
>   ├── pyproject.toml
>   ├── app/
>   │   ├── \_\_init\_\_.py
>   │   ├── main.py           # FastAPI app instance, CORS, router includes
>   │   ├── config.py          # Settings class using pydantic-settings
>   │   ├── db.py              # psycopg connection pool
>   │   ├── deps.py            # FastAPI dependencies (db session, current user)
>   │   ├── auth.py            # JWT validation logic
>   │   └── routers/
>   │       ├── \_\_init\_\_.py
>   │       └── health.py      # GET /health endpoint
>   ```
>
> \*\*`app/config.py` pattern\*\* (this is how FastAPI apps manage settings — a single `Settings` class that reads from env vars):
> ```python
> from pydantic\_settings import BaseSettings
>
> class Settings(BaseSettings):
>     database\_url: str
>     redis\_url: str = "redis://localhost:6379"
>     openai\_api\_key: str
>     jwt\_secret: str
>     jwt\_algorithm: str = "HS256"
>     jwt\_expiry\_minutes: int = 60
>     cors\_origins: list\[str] = \["http://localhost:3000"]
>
>     class Config:
>         env\_file = ".env.local"
>
> settings = Settings()
> ```
>
> \*\*`app/db.py` pattern\*\* (sync psycopg3 connection pool — this creates a pool on startup that all requests share):
> ```python
> from psycopg\_pool import ConnectionPool
> from app.config import settings
>
> pool = ConnectionPool(conninfo=settings.database\_url, min\_size=2, max\_size=10)
>
> def get\_db():
>     """FastAPI dependency that yields a connection from the pool.
>     Usage: db: Connection = Depends(get\_db)"""
>     with pool.connection() as conn:
>         yield conn
> ```
>
> \*\*`app/main.py`:\*\*
> - Create FastAPI app with title "Agent Service Desk API"
> - Add CORS middleware allowing origins from `settings.cors\_origins`
> - Include the health router
> - `GET /health` returns `{"status": "ok", "database": "connected"}` (test the DB connection)
>
> \*\*`.env.example`:\*\*
> ```
> DATABASE\_URL=postgresql://user:pass@host.neon.tech/agent\_service\_desk?sslmode=require
> REDIS\_URL=redis://localhost:6379
> OPENAI\_API\_KEY=sk-...
> JWT\_SECRET=change-me-to-a-random-64-char-string
> BETTER\_AUTH\_SECRET=change-me
> NEXT\_PUBLIC\_API\_URL=http://localhost:8000
> ```
>
> \*\*`justfile`:\*\*
> ```
> dev-web:
>     cd web \&\& npm run dev
>
> dev-api:
>     cd api \&\& uvicorn app.main:app --reload --port 8000
>
> db-push:
>     psql $DATABASE\_URL -f seed/schema.sql
>
> db-seed:
>     cd seed \&\& python seed.py
>
> db-reset:
>     psql $DATABASE\_URL -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
>     just db-push
>     just db-seed
> ```
>
> \*\*`.gitignore`\*\* should include: `node\_modules/`, `.next/`, `\_\_pycache\_\_/`, `.env.local`, `\*.pyc`, `.venv/`

**Done when:**

* `just dev-api` starts uvicorn on port 8000 without errors
* `curl http://localhost:8000/health` returns `{"status": "ok", "database": "connected"}`
* `just dev-web` starts Next.js on port 3000
* Both read from `.env.local`

\---

### Milestone 1B: Schema Deployment \& Seed Data

**Paste this into Claude Code:**

> I have `seed/schema.sql` and `seed/seed.py` in the repo (already placed during 1A).
>
> \*\*Tasks:\*\*
>
> 1. Create a Neon database called `agent\_service\_desk` (I'll do this manually in the Neon console). Put the connection string in `.env.local` as `DATABASE\_URL`.
>
> 2. Verify `schema.sql` runs cleanly against Neon:
>    - Neon supports pgvector natively, but the extension may need `CREATE EXTENSION IF NOT EXISTS "pgvector"` — this is already in the schema, confirm it works
>    - Run `just db-push` and verify no errors
>
> 3. Install seed dependencies: `cd seed \&\& pip install psycopg\[binary] faker numpy`
>
> 4. Run `just db-seed` and verify output shows these approximate volumes:
>    - Organizations: 100
>    - Users: 250
>    - Tickets: 15,000
>    - Messages: \~80,000
>    - Knowledge Docs: 1,000
>    - Chunks: \~5,000–8,000
>    - Eval Examples: 150
>    - Prompt Versions: 4
>    - SLA Policies: 10
>
> 5. Add 3 deterministic demo accounts to the seed script (or a separate `seed/demo\_accounts.py` script that runs after `seed.py`):
>    - `agent@demo.com` → support\_agent role, member of Org #1 (first org in the seed), Workspace #1
>    - `lead@demo.com` → team\_lead role, member of Org #1, Workspace #1
>    - `client@demo.com` → client\_user role, member of Org #1, Workspace #1
>    - Use deterministic UUIDs for these users (hardcode them) so they're stable across reseeds
>    - These users need entries in: `users`, `memberships`, `workspace\_memberships`
>    - Make sure Org #1 has a good spread of ticket categories, statuses, and priorities (the Pareto distribution in the seed may give it too few — verify and adjust weights if needed)
>
> 6. Update `just db-reset` to also run the demo accounts script if it's separate.
>
> 7. Add a `just db-verify` command that runs a SQL script checking row counts match expected volumes.

**Done when:**

* `just db-push` completes without errors on Neon
* `just db-seed` completes and prints the volume summary
* `psql $DATABASE\_URL -c "SELECT count(\*) FROM tickets"` returns 15,000 (plus the demo account tickets if any)
* `psql $DATABASE\_URL -c "SELECT email, role FROM workspace\_memberships wm JOIN users u ON u.id = wm.user\_id WHERE u.email LIKE '%demo.com'"` returns all 3 demo users with correct roles
* The `rls\_user` role exists: `psql $DATABASE\_URL -c "SELECT 1 FROM pg\_roles WHERE rolname = 'rls\_user'"` returns a row

\---

### Milestone 1C: Authentication Flow

**Context you need to understand before this step:**

The auth chain works like this:

```
Browser → Next.js (BetterAuth handles login/session) → Next.js API route mints JWT → Browser stores JWT → Browser sends JWT to FastAPI → FastAPI validates JWT and extracts claims
```

**Why this two-step approach?** BetterAuth manages the actual user identity (email/password, sessions, cookies) in Next.js. But FastAPI is a separate service — it can't read Next.js cookies. So Next.js mints a short-lived JWT containing the user's identity claims, and the browser sends that JWT to FastAPI. FastAPI only needs to validate the JWT signature and read the claims — it never touches BetterAuth directly.

**The JWT contains these claims:**

```json
{
  "user\_id": "uuid",
  "org\_id": "uuid",
  "workspace\_id": "uuid",
  "role": "support\_agent",
  "exp": 1234567890
}
```

FastAPI extracts these claims and uses them to set Postgres RLS session variables (next milestone).

\---

**Paste this into Claude Code:**

> Implement the authentication flow for Agent Service Desk.
>
> \*\*Architecture:\*\* BetterAuth in Next.js handles login/sessions. Next.js mints a JWT containing user claims. The browser sends this JWT to FastAPI, which validates it and extracts the claims. FastAPI never talks to BetterAuth directly.
>
> \*\*Step 1: BetterAuth setup in `/web`\*\*
>
> - Install `better-auth` in `/web`
> - Create `web/src/lib/auth.ts` — BetterAuth server instance configured with:
>   - Database: use the same Neon `DATABASE\_URL` (BetterAuth will create its own tables for sessions)
>   - Email/password provider enabled
>   - Session strategy: database sessions (default)
> - Create `web/src/lib/auth-client.ts` — BetterAuth client for browser-side session access
> - Create the BetterAuth API route handler at `web/src/app/api/auth/\[...all]/route.ts`
>
> \*\*Step 2: JWT minting in Next.js\*\*
>
> - Create `web/src/app/api/token/route.ts` — a Next.js API route that:
>   1. Reads the BetterAuth session (user is authenticated via cookies)
>   2. Looks up the user's org\_id, workspace\_id, and role from the database (query `memberships` and `workspace\_memberships` tables using the BetterAuth user ID — note: you need to map BetterAuth's user ID to our `users` table, see note below)
>   3. Signs a JWT with these claims: `user\_id`, `org\_id`, `workspace\_id`, `role`, `exp` (1 hour expiry)
>   4. Uses `JWT\_SECRET` from env to sign with HS256
>   5. Returns `{ "token": "eyJ..." }`
>
> \*\*Important mapping note:\*\* BetterAuth creates its own `user` table. Our schema has a separate `users` table. You have two options:
> - Option A (simpler for MVP): Make our demo accounts' UUIDs match what BetterAuth generates, or insert into BetterAuth's user table during seeding
> - Option B: Add a `better\_auth\_id` column to our `users` table and join on it
> - Go with whichever is simpler. The key requirement is: given a BetterAuth session, we can look up the user's org\_id, workspace\_id, and role from our schema tables.
>
> \*\*Step 3: Update the API client in `/web`\*\*
>
> - Update `web/src/lib/api-client.ts` to:
>   1. Before each request, check if we have a cached JWT and it's not expired
>   2. If no JWT or expired, call `POST /api/token` to get a fresh one
>   3. Attach `Authorization: Bearer <jwt>` to every request to FastAPI
>   4. Store the JWT in memory (not localStorage — just a module-level variable)
>
> \*\*Step 4: JWT validation in FastAPI\*\*
>
> - Create `api/app/auth.py`:
>   ```python
>   import jwt
>   from fastapi import Depends, HTTPException, status
>   from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
>   from pydantic import BaseModel
>   from app.config import settings
>
>   security = HTTPBearer()
>
>   class CurrentUser(BaseModel):
>       user\_id: str
>       org\_id: str
>       workspace\_id: str
>       role: str  # 'client\_user' | 'support\_agent' | 'team\_lead'
>
>   def get\_current\_user(
>       credentials: HTTPAuthorizationCredentials = Depends(security),
>   ) -> CurrentUser:
>       """FastAPI dependency — extracts and validates JWT claims.
>
>       Usage in any route:
>           @router.get("/something")
>           def something(user: CurrentUser = Depends(get\_current\_user)):
>               # user.org\_id, user.role, etc.
>       """
>       try:
>           payload = jwt.decode(
>               credentials.credentials,
>               settings.jwt\_secret,
>               algorithms=\[settings.jwt\_algorithm],
>           )
>           return CurrentUser(
>               user\_id=payload\["user\_id"],
>               org\_id=payload\["org\_id"],
>               workspace\_id=payload\["workspace\_id"],
>               role=payload\["role"],
>           )
>       except jwt.ExpiredSignatureError:
>           raise HTTPException(status\_code=status.HTTP\_401\_UNAUTHORIZED, detail="Token expired")
>       except jwt.InvalidTokenError:
>           raise HTTPException(status\_code=status.HTTP\_401\_UNAUTHORIZED, detail="Invalid token")
>   ```
>
> - Create a test endpoint: `GET /auth/me` that returns the `CurrentUser` object. This is for verifying the auth chain works.
>
> \*\*Step 5: Login page\*\*
>
> - Create `web/src/app/login/page.tsx` — simple email/password form using BetterAuth's `signIn.email()` client method
> - On success, redirect to `/tickets` (the page doesn't exist yet — just redirect there)
> - Create `web/src/middleware.ts` — Next.js middleware that redirects unauthenticated users to `/login`
>
> \*\*Step 6: Seed the demo accounts into BetterAuth\*\*
>
> - Create `seed/demo\_auth.ts` (or add to the demo accounts script) that creates the 3 demo users in BetterAuth's database:
>   - `agent@demo.com` / password: `agent123`
>   - `lead@demo.com` / password: `lead123`
>   - `client@demo.com` / password: `client123`
> - Ensure the BetterAuth user IDs map to our `users` table IDs (however you solved the mapping in Step 2)

**Done when:**

* Start both dev servers (`just dev-web`, `just dev-api`)
* Go to `http://localhost:3000/login`
* Log in as `agent@demo.com` / `agent123`
* Browser is redirected to `/tickets`
* Open browser dev tools → Network tab → call `http://localhost:3000/api/token` → get a JWT back
* Call `curl -H "Authorization: Bearer <that-jwt>" http://localhost:8000/auth/me` → returns `{"user\_id": "...", "org\_id": "...", "workspace\_id": "...", "role": "support\_agent"}`
* Repeat for `lead@demo.com` (role: team\_lead) and `client@demo.com` (role: client\_user)

\---

### Milestone 1D: RLS Middleware in FastAPI

**Context you need to understand before this step:**

Postgres Row-Level Security (RLS) is already defined in `schema.sql` — the policies exist. But RLS only activates when queries run as the `rls\_user` role (not the superuser role your connection string uses by default).

The pattern is: before every query in a request, FastAPI sets session-level variables that the RLS policies read. Here's what happens on every request:

```
1. Request arrives with JWT → extract user\_id, org\_id, workspace\_id, role
2. Get a DB connection from the pool
3. Run these SET commands:
   SET LOCAL ROLE rls\_user;
   SELECT set\_config('app.user\_id', '<uuid>', true);
   SELECT set\_config('app.org\_id', '<uuid>', true);
   SELECT set\_config('app.workspace\_id', '<uuid>', true);
   SELECT set\_config('app.user\_role', '<role>', true);
4. Now every query on this connection is filtered by RLS policies
5. At the end of the request, the connection returns to the pool and the role resets
```

`SET LOCAL` means the setting only applies within the current transaction. This is safe for connection pooling — no state leaks between requests.

\---

**Paste this into Claude Code:**

> Implement RLS enforcement middleware in FastAPI. Every DB query must run inside a transaction with RLS session variables set.
>
> \*\*Update `api/app/deps.py`\*\* — create a dependency that combines auth + RLS-scoped DB connection:
>
> ```python
> from contextlib import contextmanager
> from psycopg import Connection
> from app.db import pool
> from app.auth import CurrentUser, get\_current\_user
> from fastapi import Depends
>
> def get\_rls\_db(user: CurrentUser = Depends(get\_current\_user)):
>     """FastAPI dependency that yields a DB connection with RLS session vars set.
>
>     Every query executed on this connection is automatically scoped to the
>     user's org/workspace by Postgres RLS policies defined in schema.sql.
>
>     Usage:
>         @router.get("/tickets")
>         def list\_tickets(db: Connection = Depends(get\_rls\_db)):
>             # All queries here are RLS-scoped automatically
>             rows = db.execute("SELECT \* FROM tickets").fetchall()
>     """
>     with pool.connection() as conn:
>         with conn.transaction():
>             conn.execute("SET LOCAL ROLE rls\_user")
>             conn.execute("SELECT set\_config('app.user\_id', %s, true)", (user.user\_id,))
>             conn.execute("SELECT set\_config('app.org\_id', %s, true)", (user.org\_id,))
>             conn.execute("SELECT set\_config('app.workspace\_id', %s, true)", (user.workspace\_id,))
>             conn.execute("SELECT set\_config('app.user\_role', %s, true)", (user.role,))
>             yield conn
> ```
>
> \*\*Create test endpoints in `api/app/routers/debug.py`\*\* (these are temporary — they verify RLS works):
>
> - `GET /debug/tickets/count` — returns `{"count": N}` where N is `SELECT count(\*) FROM tickets` on the RLS-scoped connection. Different users should see different counts based on their org.
>
> - `GET /debug/messages/count` — returns `{"total": N, "internal": M}`. For `total`, count all messages for tickets in this org. For `internal`, count messages where `is\_internal = true`. A client\_user should see `internal: 0` because the RLS policy filters them out.
>
> - `GET /debug/knowledge/count` — returns `{"total": N}`. Client users should see only `client\_visible` docs. Agents/leads should see all docs in their workspace.
>
> \*\*Important notes for Claude Code:\*\*
> - The RLS policies are already in `seed/schema.sql` — don't recreate them
> - The helper functions `current\_org\_id()`, `current\_workspace\_id()`, `current\_user\_id()`, `current\_user\_role()` are already defined in the schema — they read the session config vars
> - The `rls\_user` role is created in the schema — verify it exists on Neon (it should from `just db-push`)
> - Use `Depends(get\_rls\_db)` as the standard DB dependency going forward — never use `get\_db` directly in route handlers (that bypasses RLS)
> - The `user: CurrentUser` can also be injected alongside `db` if the route needs role information: `def route(user: CurrentUser = Depends(get\_current\_user), db: Connection = Depends(get\_rls\_db))`

**Done when:**

Test with curl using JWTs from each demo user:

```bash
# Get JWTs (or use the /api/token endpoint from the browser)
# Then:

# Agent (support\_agent in Org #1) — sees all Org #1 tickets
curl -H "Authorization: Bearer $AGENT\_JWT" http://localhost:8000/debug/tickets/count
# → {"count": <some number, only Org #1 tickets>}

# Client (client\_user in Org #1) — sees Org #1 tickets BUT no internal messages
curl -H "Authorization: Bearer $CLIENT\_JWT" http://localhost:8000/debug/messages/count
# → {"total": <N>, "internal": 0}

# Agent — sees internal messages
curl -H "Authorization: Bearer $AGENT\_JWT" http://localhost:8000/debug/messages/count
# → {"total": <N>, "internal": <M where M > 0>}

# Client — sees fewer knowledge docs (only client\_visible)
curl -H "Authorization: Bearer $CLIENT\_JWT" http://localhost:8000/debug/knowledge/count
# Agent count should be higher than client count
```

Cross-org isolation: if you mint a JWT with a different org\_id, it should return 0 tickets for the original org's data. The RLS policies enforce this at the database level.

\---

## Milestone 2 — Core API Layer

**Goal:** Full CRUD API for all entities the frontend needs. No AI yet — just data access with RLS. After this milestone, every endpoint the frontend will call exists and returns real data.

**Convention established in M1:** All route handlers use `Depends(get\_rls\_db)` for DB access and `Depends(get\_current\_user)` when they need role info.

\---

### Milestone 2A: Ticket \& Message Endpoints

**Paste this into Claude Code:**

> Implement the ticket and message API endpoints. All data access must use the `get\_rls\_db` dependency from `app/deps.py` (established in Milestone 1D) so RLS is enforced automatically.
>
> \*\*File structure:\*\*
> ```
> api/app/
> ├── routers/
> │   ├── tickets.py          # ticket CRUD + message endpoints
> │   └── ...
> ├── schemas/
> │   ├── \_\_init\_\_.py
> │   ├── tickets.py          # Pydantic response/request models
> │   └── common.py           # shared pagination, filter models
> └── queries/
>     ├── \_\_init\_\_.py
>     └── tickets.py           # raw SQL queries as functions
> ```
>
> \*\*Why this structure:\*\* Routers define HTTP interface. Schemas define request/response shapes. Queries isolate SQL. This keeps routes thin — a route handler is typically: validate input → call query function → return schema.
>
> \*\*`app/schemas/common.py`\*\* — shared types used across multiple routers:
> ```python
> from pydantic import BaseModel
>
> class PaginationParams(BaseModel):
>     page: int = 1
>     per\_page: int = 25  # max 100
>
> class PaginatedResponse(BaseModel):
>     items: list  # overridden in specific responses
>     total: int
>     page: int
>     per\_page: int
>     total\_pages: int
> ```
>
> \*\*`app/schemas/tickets.py`\*\* — define these Pydantic models:
>
> - `TicketListItem` — what appears in the queue: id, subject, status, priority, category, team, assignee\_id, assignee\_name, org\_name, confidence (from latest prediction, nullable), sla\_policy\_name, created\_at, updated\_at
> - `TicketDetail` — full ticket with nested data: all fields from TicketListItem plus messages (list), latest prediction (nullable), latest draft (nullable), assignments (list)
> - `TicketMessage` — id, sender\_id, sender\_name, sender\_type, body, is\_internal, created\_at
> - `TicketPrediction` — id, predicted\_category, predicted\_priority, predicted\_team, escalation\_suggested, escalation\_reason, confidence, created\_at
> - `TicketDraft` — id, body, evidence\_chunk\_ids, confidence, unresolved\_questions, send\_ready, approval\_outcome, created\_at
> - `TicketUpdate` (request body) — status, priority, assignee\_id, category, team (all optional)
> - `MessageCreate` (request body) — body, is\_internal (default false)
> - `AssignRequest` (request body) — assignee\_id, team (optional)
>
> \*\*`app/routers/tickets.py`\*\* — implement these endpoints:
>
> \*\*`GET /tickets`\*\* — Paginated ticket list
> - Query params: `page`, `per\_page`, `status` (optional), `priority` (optional), `assignee\_id` (optional), `category` (optional), `team` (optional), `sort\_by` (default: `created\_at`), `sort\_order` (default: `desc`)
> - SQL: `SELECT` from `tickets` with optional WHERE clauses, joined to get assignee name and org name
> - For confidence: LEFT JOIN to `ticket\_predictions` to get the latest prediction's confidence (subquery: `SELECT confidence FROM ticket\_predictions WHERE ticket\_id = t.id ORDER BY created\_at DESC LIMIT 1`)
> - For SLA: LEFT JOIN `sla\_policies` to get policy name
> - Return `PaginatedResponse` with `items: list\[TicketListItem]`
> - RLS handles org scoping automatically — no need to add `WHERE org\_id = ...`
>
> \*\*`GET /tickets/{ticket\_id}`\*\* — Full ticket detail
> - Fetch ticket base data
> - Fetch messages ordered by created\_at (RLS filters internal notes for client\_users automatically)
> - Fetch latest prediction (ORDER BY created\_at DESC LIMIT 1)
> - Fetch latest draft with its approval\_outcome
> - Fetch assignment history
> - Return `TicketDetail`
>
> \*\*`PATCH /tickets/{ticket\_id}`\*\* — Update ticket
> - Request body: `TicketUpdate` (partial updates)
> - Build dynamic UPDATE SET clause from non-null fields
> - Return updated ticket
>
> \*\*`POST /tickets/{ticket\_id}/messages`\*\* — Add message
> - Request body: `MessageCreate`
> - Insert into `ticket\_messages` with `sender\_id` from current user, `sender\_type` based on user role (client\_user → 'customer', support\_agent/team\_lead → 'agent')
> - Return created message
>
> \*\*`POST /tickets/{ticket\_id}/assign`\*\* — Assign/reassign
> - Request body: `AssignRequest`
> - Update `tickets.assignee\_id`
> - Insert into `ticket\_assignments` for history
> - Return updated ticket
>
> \*\*SQL query pattern\*\* — use parameterized queries with psycopg:
> ```python
> # Example in app/queries/tickets.py
> def list\_tickets(conn, page, per\_page, filters, sort\_by, sort\_order):
>     where\_clauses = \[]
>     params = \[]
>
>     if filters.status:
>         where\_clauses.append("t.status = %s")
>         params.append(filters.status)
>     # ... more filters
>
>     where\_sql = " AND ".join(where\_clauses) if where\_clauses else "TRUE"
>
>     count\_sql = f"SELECT count(\*) FROM tickets t WHERE {where\_sql}"
>     total = conn.execute(count\_sql, params).fetchone()\[0]
>
>     query\_sql = f"""
>         SELECT t.\*, u.full\_name as assignee\_name, o.name as org\_name,
>                (SELECT tp.confidence FROM ticket\_predictions tp
>                 WHERE tp.ticket\_id = t.id ORDER BY tp.created\_at DESC LIMIT 1) as confidence,
>                sp.name as sla\_policy\_name
>         FROM tickets t
>         LEFT JOIN users u ON u.id = t.assignee\_id
>         LEFT JOIN organizations o ON o.id = t.org\_id
>         LEFT JOIN sla\_policies sp ON sp.id = t.sla\_policy\_id
>         WHERE {where\_sql}
>         ORDER BY t.{sort\_by} {sort\_order}
>         LIMIT %s OFFSET %s
>     """
>     params.extend(\[per\_page, (page - 1) \* per\_page])
>     rows = conn.execute(query\_sql, params).fetchall()
>     return total, rows
> ```
>
> \*\*Important:\*\*
> - Use `conn.execute(sql, params)` with `%s` placeholders — never f-string user input into SQL
> - Use `psycopg.rows.dict\_row` row factory on connections so results come back as dicts
> - Register the router in `app/main.py`: `app.include\_router(tickets.router, prefix="/tickets", tags=\["tickets"])`
> - Don't forget to set `row\_factory=dict\_row` when getting connections, or set it on the pool

**Done when:**

* `curl -H "Authorization: Bearer $AGENT\_JWT" "http://localhost:8000/tickets?page=1\&per\_page=10"` returns 10 tickets with total count, pagination metadata
* `curl -H "Authorization: Bearer $AGENT\_JWT" "http://localhost:8000/tickets?status=open\&priority=high"` returns filtered results
* `curl -H "Authorization: Bearer $AGENT\_JWT" "http://localhost:8000/tickets/{id}"` returns full detail with messages, prediction, draft
* Client user sees the same tickets but messages exclude internal notes
* `PATCH` and `POST` endpoints persist data correctly

\---

### Milestone 2B: Knowledge Document Endpoints

**Paste this into Claude Code:**

> Implement knowledge document API endpoints. Follow the same patterns established in Milestone 2A: schemas in `app/schemas/`, queries in `app/queries/`, router in `app/routers/`.
>
> \*\*`app/schemas/knowledge.py`:\*\*
> - `KnowledgeDocListItem` — id, title, source\_filename, content\_type, visibility, status, created\_at
> - `KnowledgeDocDetail` — all list fields plus chunks (list of `KnowledgeChunk`)
> - `KnowledgeChunk` — id, chunk\_index, content (truncated to 500 chars for list view), token\_count
> - `KnowledgeDocUpload` (request) — title, visibility ('internal' | 'client\_visible'), file (uploaded file)
>
> \*\*`app/routers/knowledge.py`:\*\*
>
> \*\*`GET /knowledge/documents`\*\* — List documents
> - Query params: `status` (optional), `visibility` (optional)
> - RLS handles workspace scoping + visibility filtering automatically
> - Return paginated list of `KnowledgeDocListItem`
>
> \*\*`GET /knowledge/documents/{doc\_id}`\*\* — Document with chunks
> - Return `KnowledgeDocDetail` including all chunks ordered by chunk\_index
> - Chunks should NOT include the embedding vector (it's a 1536-dim float array — too large for API response)
>
> \*\*`POST /knowledge/documents`\*\* — Upload document
> - Accept multipart form upload with fields: title, visibility, file
> - Accept file types: `.pdf`, `.md`, `.txt` (reject others with 400)
> - Insert a `knowledge\_documents` row with status='pending'
> - Store the raw file content (for now, just in the DB `metadata` JSONB field — we'll handle actual file storage later if needed)
> - Return the created document (status will be 'pending' — ingestion happens in Milestone 3)
> - For MVP, the actual parsing/chunking/embedding pipeline is built in Milestone 3. This endpoint just creates the record.
>
> \*\*`DELETE /knowledge/documents/{doc\_id}`\*\* — Delete document
> - Cascade deletes handle chunks (FK with ON DELETE CASCADE in schema)
> - Return 204 No Content
>
> \*\*Important:\*\*
> - Use `python-multipart` for file upload handling (already in dependencies)
> - Client users can only see `client\_visible` docs — RLS policy handles this, but verify it
> - Register router: `app.include\_router(knowledge.router, prefix="/knowledge", tags=\["knowledge"])`

**Done when:**

* List endpoint returns seed knowledge docs scoped to workspace
* Client user sees fewer docs than agent (only client\_visible)
* Upload creates a new doc with status='pending'
* Delete removes doc (verify chunks cascade deleted too)
* Doc detail includes chunks without embedding vectors

\---

### Milestone 2C: Review Queue \& Approval Endpoints

**Paste this into Claude Code:**

> Implement the review queue and draft approval endpoints. Same patterns as 2A/2B.
>
> \*\*`app/schemas/drafts.py`:\*\*
> - `DraftQueueItem` — draft\_generation\_id, ticket\_id, ticket\_subject, body (truncated to 200 chars), confidence, approval\_outcome, time\_since\_generation (computed), created\_at
> - `ApprovalRequest` — action ('approved' | 'edited\_and\_approved' | 'rejected' | 'escalated'), edited\_body (optional, required if action is 'edited\_and\_approved'), reason (optional)
> - `ApprovalResponse` — id, action, acted\_by, reason, created\_at
>
> \*\*`app/routers/drafts.py`:\*\*
>
> \*\*`GET /review-queue`\*\* — Pending drafts
> - Query: drafts where `approval\_outcome = 'pending'` (or IS NULL — check seed data to see which convention is used)
> - Join to `tickets` to get ticket subject
> - Sort by `draft\_generations.created\_at ASC` (oldest first — FIFO queue)
> - Paginated
> - Only support\_agents and team\_leads can access (RLS policy already enforces this, but add an application-level check too for a clear 403)
>
> \*\*`POST /drafts/{draft\_id}/review`\*\* — Submit approval decision
> - Request body: `ApprovalRequest`
> - Validate: if action is 'edited\_and\_approved', `edited\_body` must be present
> - Insert `approval\_actions` row with `acted\_by` = current user
> - Update `draft\_generations.approval\_outcome` to match the action
> - If action is 'approved' or 'edited\_and\_approved', also update the ticket status to 'pending\_customer' (the reply is ready to send)
> - Return `ApprovalResponse`
>
> \*\*Role check pattern\*\* — use this in routes that need role enforcement beyond RLS:
> ```python
> from fastapi import HTTPException, status
>
> def require\_role(user: CurrentUser, allowed: list\[str]):
>     if user.role not in allowed:
>         raise HTTPException(
>             status\_code=status.HTTP\_403\_FORBIDDEN,
>             detail=f"Role '{user.role}' cannot access this resource",
>         )
> ```
>
> \*\*Register router:\*\* `app.include\_router(drafts.router, prefix="/drafts", tags=\["drafts"])`

**Done when:**

* `GET /review-queue` returns pending drafts from seed data (there should be many — seed generates drafts with various approval states)
* Approving a draft: POST review action → draft's `approval\_outcome` updates → `approval\_actions` row created
* Client user gets 403 on review queue
* Rejecting with a reason persists the reason text

\---

### Milestone 2D: Eval API Endpoints

**Paste this into Claude Code:**

> Implement the evaluation API endpoints. Same patterns as 2A-2C. These are read-only for now — the actual eval runner that executes eval runs against the model is built in Milestone 5.
>
> \*\*`app/schemas/evals.py`:\*\*
> - `EvalSetListItem` — id, name, description, example\_count, created\_at
> - `EvalSetDetail` — all list fields plus examples (list of `EvalExample`)
> - `EvalExample` — id, type ('classification' | 'routing' | 'citation'), input\_text, expected\_category, expected\_team, expected\_chunk\_ids
> - `EvalRunListItem` — id, eval\_set\_id, eval\_set\_name, prompt\_version\_id, prompt\_version\_name, status, total\_examples, passed, failed, metrics (JSONB), created\_at, completed\_at
> - `EvalRunDetail` — all list fields plus results (list of `EvalResult`)
> - `EvalResult` — id, eval\_example\_id, passed, model\_output (JSONB), expected\_output (JSONB), notes
> - `EvalRunCreate` (request) — eval\_set\_id, prompt\_version\_id
> - `EvalComparison` — run\_a (EvalRunDetail), run\_b (EvalRunDetail), metric\_diff (object showing accuracy\_a, accuracy\_b, routing\_accuracy\_a, routing\_accuracy\_b, etc.)
>
> \*\*`app/routers/evals.py`:\*\*
>
> \*\*`GET /eval/sets`\*\* — List eval sets with example counts
>
> \*\*`GET /eval/sets/{set\_id}`\*\* — Eval set with all examples
>
> \*\*`GET /eval/sets/{set\_id}/examples`\*\* — Paginated examples for a set
>
> \*\*`POST /eval/runs`\*\* — Create an eval run
> - Request body: `EvalRunCreate`
> - Insert `eval\_runs` row with status='pending', total\_examples = count of examples in the set
> - For now, just creates the record. The actual execution (calling the model for each example) is built in Milestone 5.
> - Return the created run
>
> \*\*`GET /eval/runs`\*\* — List all eval runs (most recent first)
>
> \*\*`GET /eval/runs/{run\_id}`\*\* — Run detail with per-example results
>
> \*\*`GET /eval/runs/compare`\*\* — Compare two runs
> - Query params: `run\_a\_id`, `run\_b\_id`
> - Both runs must be on the same eval set (return 400 if not)
> - Return `EvalComparison` with side-by-side results and metric diffs
>
> \*\*`GET /prompt-versions`\*\* — List all prompt versions (needed by eval console to select which prompt to eval against)
> - This is a simple read from `prompt\_versions` table — no RLS needed (prompt versions are shared, not tenant-scoped)
>
> \*\*Access control:\*\* All eval endpoints are team\_lead only. RLS policies enforce this, but add application-level `require\_role(user, \['team\_lead'])` checks too.
>
> \*\*Register routers:\*\*
> - `app.include\_router(evals.router, prefix="/eval", tags=\["evals"])`
> - `app.include\_router(prompts.router, prefix="/prompt-versions", tags=\["prompts"])` (or inline in evals router)

**Done when:**

* `GET /eval/sets` returns the seed eval sets with example counts
* `GET /eval/sets/{id}` returns examples grouped by type
* `POST /eval/runs` creates a run with status='pending'
* `GET /eval/runs/compare?run\_a\_id=X\&run\_b\_id=Y` returns comparison structure (even if both runs have no results yet — the structure should be correct)
* Client user and support\_agent get 403 on all eval endpoints
* Prompt versions endpoint returns all 4 seed prompt versions

\---

## Milestone 3 — AI Pipeline

**Goal:** Triage, retrieval, and grounded drafting working end-to-end. Knowledge ingestion pipeline running. This is the technical core.

**Context on how the OpenAI Responses API works:**

The Responses API is OpenAI's primary API for model interaction (it replaced Chat Completions for new development). Key concepts:

1. **Structured outputs** — you give the model a JSON schema and it returns valid JSON matching that schema. Used for triage (classification output must match the exact schema).
2. **Tool calling** — you define "tools" the model can invoke. The model decides when to call them and what arguments to pass. The flow is:

   * You send a message + tool definitions
   * Model responds with a tool call (e.g., "call search\_knowledge with query='billing refund policy'")
   * You execute the tool, send the result back
   * Model generates its final response using the tool result
3. **For drafting:** The model gets the ticket content + a `search\_knowledge` tool. It calls the tool to retrieve evidence, then generates a grounded draft using that evidence.

\---

### Milestone 3A: OpenAI Provider Module

**Paste this into Claude Code:**

> Create a thin OpenAI provider module. This wraps the OpenAI Python SDK for our three use cases: structured classification, embedding, and tool-calling generation.
>
> \*\*File:\*\* `api/app/providers/openai.py`
>
> \*\*Why a wrapper?\*\* The OpenAI SDK is verbose. This module exposes exactly the 3 operations we need, handles retries/errors, and captures metrics (latency, token usage, cost). If we add Anthropic or other providers in V1, we replace this one file.
>
> ```python
> """
> OpenAI provider module.
>
> Three operations:
> 1. classify() — structured output, returns typed JSON
> 2. embed() — text → 1536-dim vector
> 3. generate\_with\_tools() — generation with tool calling, returns content + tool calls
> """
>
> import time
> from openai import OpenAI
> from app.config import settings
>
> client = OpenAI(api\_key=settings.openai\_api\_key)
> ```
>
> Implement these functions:
>
> \*\*`classify(system\_prompt: str, user\_input: str, response\_schema: dict) → dict`\*\*
> - Uses `client.responses.create()` with `response\_format={"type": "json\_schema", "json\_schema": {"name": "triage", "strict": True, "schema": response\_schema}}`
> - Model: `gpt-5-mini` (fast, cheap, good enough for classification)
> - Returns: `{"result": <parsed JSON>, "latency\_ms": int, "token\_usage": {"prompt\_tokens": N, "completion\_tokens": N, "total\_tokens": N}, "estimated\_cost\_cents": float}`
> - Cost estimation: check platform.openai.com/pricing for current gpt-5-mini rates — calculate from token counts
> - Retry: up to 3 attempts with exponential backoff on 429 or 5xx errors
> - Timeout: 10 seconds
>
> \*\*`embed(text: str) → list\[float]`\*\*
> - Uses `client.embeddings.create()` with model `text-embedding-3-small`
> - Returns the 1536-dim vector as a list of floats
> - For batch efficiency, also create `embed\_batch(texts: list\[str]) → list\[list\[float]]` that sends up to 100 texts per API call
>
> \*\*`generate\_with\_tools(system\_prompt: str, user\_input: str, tools: list\[dict], tool\_executor: callable) → dict`\*\*
> - This is the agentic loop for drafting:
>   1. Send initial request with tools defined
>   2. If model responds with tool calls → execute them via `tool\_executor` → send results back
>   3. Repeat until model produces a final text response (no more tool calls)
>   4. Max 3 tool-calling rounds (safety limit)
> - Model: `gpt-5.4` (needs to be smarter for grounded generation)
> - Tools format (OpenAI function calling schema):
>   ```python
>   tools = \[{
>       "type": "function",
>       "function": {
>           "name": "search\_knowledge",
>           "description": "Search the knowledge base for relevant documentation",
>           "parameters": {
>               "type": "object",
>               "properties": {
>                   "query": {"type": "string", "description": "Search query"}
>               },
>               "required": \["query"]
>           }
>       }
>   }]
>   ```
> - Returns: `{"content": str, "tool\_calls\_made": list, "latency\_ms": int, "token\_usage": dict, "estimated\_cost\_cents": float}`
> - Cost: gpt-5.4 pricing varies — check platform.openai.com/pricing for current rates
>
> \*\*Error handling:\*\*
> - Wrap all calls in try/except for `openai.APIError`, `openai.RateLimitError`, `openai.APITimeoutError`
> - Log errors with enough context to debug (model, prompt length, error message)
> - On permanent failure after retries, raise a custom `ProviderError` exception
>
> \*\*Test file:\*\* `api/tests/test\_openai\_provider.py`
> - Test `classify()` with a sample ticket text → should return valid JSON matching the triage schema
> - Test `embed()` → should return a list of exactly 1536 floats
> - Test `generate\_with\_tools()` with a mock tool executor → should complete the agentic loop
> - These tests call the real OpenAI API — skip them in CI (mark with `@pytest.mark.integration`)

**Done when:**

* `classify()` returns valid triage JSON for a billing ticket ("Invoice shows incorrect amount")
* `embed()` returns a 1536-dim vector
* `generate\_with\_tools()` with a mock `search\_knowledge` tool completes and returns generated content
* All functions return latency\_ms and token\_usage
* Retry logic handles rate limits (test with a low timeout to trigger it)

\---

### Milestone 3B: Triage Pipeline

**Paste this into Claude Code:**

> Implement the triage pipeline — classifies a ticket and stores the prediction.
>
> \*\*File:\*\* `api/app/pipelines/triage.py`
>
> \*\*Flow:\*\*
> 1. Load the active triage prompt: `SELECT \* FROM prompt\_versions WHERE type = 'triage' AND is\_active = TRUE`
> 2. Load ticket content: subject + first message body (the customer's initial message)
> 3. Call `classify()` from `app/providers/openai.py` with:
>    - system\_prompt = the active triage prompt content
>    - user\_input = f"Subject: {ticket.subject}\\n\\nBody: {first\_message.body}"
>    - response\_schema = the triage JSON schema (see below)
> 4. Store the prediction in `ticket\_predictions`:
>    - ticket\_id, prompt\_version\_id, predicted\_category, predicted\_priority, predicted\_team
>    - escalation\_suggested, escalation\_reason, confidence
>    - latency\_ms, token\_usage, estimated\_cost\_cents
> 5. Optionally update the ticket's `category` and `team` fields if they're currently NULL
>
> \*\*Triage response schema:\*\*
> ```json
> {
>   "type": "object",
>   "properties": {
>     "category": {"type": "string", "enum": \["billing", "bug\_report", "feature\_request", "account\_access", "integration", "api\_issue", "onboarding", "data\_export"]},
>     "urgency": {"type": "string", "enum": \["low", "medium", "high", "critical"]},
>     "suggested\_team": {"type": "string", "enum": \["general\_support", "billing\_team", "engineering", "integrations", "onboarding", "account\_management"]},
>     "escalation\_suggested": {"type": "boolean"},
>     "escalation\_reason": {"type": \["string", "null"]},
>     "confidence": {"type": "number", "minimum": 0, "maximum": 1}
>   },
>   "required": \["category", "urgency", "suggested\_team", "escalation\_suggested", "confidence"],
>   "additionalProperties": false
> }
> ```
>
> \*\*Endpoint:\*\* `POST /tickets/{ticket\_id}/triage`
> - Add to `api/app/routers/tickets.py`
> - Calls the triage pipeline
> - Returns the stored `TicketPrediction` object
> - Only support\_agent and team\_lead can trigger triage
>
> \*\*Important:\*\*
> - The prompt content comes from the database (the seed created 2 triage prompts — v1 inactive, v2 active)
> - The prediction is stored SEPARATELY from the ticket — never overwrite ticket fields with model output without the agent's approval (this separation is critical for evaluation)
> - Use `get\_rls\_db` for all database access

**Done when:**

* `POST /tickets/{ticket\_id}/triage` for a billing ticket → returns prediction with `category: "billing"`, reasonable confidence
* Prediction stored in `ticket\_predictions` with all fields including latency and token usage
* Running triage twice on the same ticket creates 2 separate prediction records (predictions are append-only)
* Triage completes in < 2 seconds

\---

### Milestone 3C: Knowledge Retrieval

**Context on how vector search works in this project:**

The knowledge base is pre-chunked and pre-embedded (seed data created chunks with 1536-dim vectors). When a ticket needs evidence:

1. Take the ticket text → embed it → get a query vector
2. Run a cosine similarity search: find chunks whose embedding is closest to the query vector
3. Filter by workspace + visibility (RLS handles this)
4. Return the top-k most similar chunks

pgvector handles step 2 with: `SELECT \*, 1 - (embedding <=> query\_vector) as similarity FROM knowledge\_chunks ORDER BY embedding <=> query\_vector LIMIT k`

The `<=>` operator is cosine distance. `1 - distance = similarity` (1.0 = identical, 0.0 = unrelated).

**Important caveat:** The seed data has RANDOM embeddings (not real). This means similarity search will return random chunks during development. Real retrieval quality requires re-embedding the knowledge docs with actual OpenAI embeddings. We'll handle that in Milestone 3E (ingestion pipeline). For now, the pipeline works end-to-end — it just returns random results.

\---

**Paste this into Claude Code:**

> Implement the knowledge retrieval function that will be used as a tool by the drafting pipeline.
>
> \*\*File:\*\* `api/app/pipelines/retrieval.py`
>
> \*\*Function: `search\_knowledge(conn, workspace\_id: str, query: str, top\_k: int = 5, visibility\_filter: str | None = None) → list\[dict]`\*\*
>
> 1. Embed the query: `query\_vector = embed(query)` using the provider module
> 2. Format the vector for pgvector: `'\[0.1, 0.2, ...]'` (pgvector expects a string representation)
> 3. Run the similarity search:
>    ```sql
>    SELECT kc.id, kc.chunk\_index, kc.content, kc.token\_count,
>           kd.id as document\_id, kd.title as document\_title, kd.visibility,
>           1 - (kc.embedding <=> %s::vector) as similarity
>    FROM knowledge\_chunks kc
>    JOIN knowledge\_documents kd ON kd.id = kc.document\_id
>    WHERE kd.workspace\_id = %s
>      AND kd.status = 'indexed'
>    ORDER BY kc.embedding <=> %s::vector
>    LIMIT %s
>    ```
>    Note: Pass the vector string twice (once for the SELECT similarity calculation, once for the ORDER BY)
>
> 4. Return list of dicts: `\[{"chunk\_id": str, "document\_id": str, "document\_title": str, "content": str, "similarity": float, "chunk\_index": int}, ...]`
>
> \*\*Important notes:\*\*
> - This function runs INSIDE an RLS-scoped connection — the `knowledge\_documents` and `knowledge\_chunks` RLS policies automatically filter by workspace and visibility
> - However, we also pass `workspace\_id` explicitly in the WHERE clause as a belt-and-suspenders approach, since pgvector index scans may not trigger RLS correctly in all cases
> - The vector must be passed as a string literal `'\[0.1, 0.2, ...]'` — psycopg doesn't have native pgvector type support. Format it as: `f"\[{','.join(str(x) for x in query\_vector)}]"`
> - Alternatively, install `pgvector-python` package for cleaner integration
>
> \*\*Endpoint for testing:\*\* `GET /knowledge/search?q=<query>\&top\_k=5`
> - Add to `api/app/routers/knowledge.py`
> - Calls `search\_knowledge()` with the current user's workspace\_id
> - Returns the list of matching chunks with similarity scores
> - This endpoint is also useful for the frontend later (evidence panel refresh)

**Done when:**

* `GET /knowledge/search?q=billing+refund` returns 5 chunks with similarity scores
* Results include document titles and chunk content
* Client user's results exclude `internal` visibility docs (verify by comparing result sets between agent and client)
* The similarity scores will be random-ish (because seed embeddings are random) — that's expected. The pipeline is correct; results will improve after re-embedding in 3E.

\---

### Milestone 3D: Grounded Drafting Pipeline

**Context on how the agentic drafting loop works:**

This is the most complex pipeline. Here's the full flow:

```
1. Agent clicks "Generate Draft" on a ticket
2. System loads ticket + messages + active draft prompt
3. System calls OpenAI with the draft prompt + search\_knowledge tool definition
4. OpenAI decides to call search\_knowledge("billing refund policy")
5. System executes the retrieval (Milestone 3C) → returns evidence chunks
6. System sends the evidence back to OpenAI
7. OpenAI generates a draft response with citations like \[chunk:uuid]
8. System parses the response → extracts body, cited chunk IDs, confidence, etc.
9. System stores a draft\_generations record with all metadata
```

The model is literally deciding what to search for, reviewing the results, and writing a response. This is what makes it "agentic" — the model uses tools to gather information rather than relying on what's in the prompt.

\---

**Paste this into Claude Code:**

> Implement the grounded drafting pipeline — generates an AI draft reply for a ticket using retrieved evidence.
>
> \*\*File:\*\* `api/app/pipelines/drafting.py`
>
> \*\*Function: `generate\_draft(conn, ticket\_id: str, workspace\_id: str) → dict`\*\*
>
> Step-by-step:
>
> 1. \*\*Load context:\*\*
>    - Ticket: subject, status, priority, category
>    - Messages: all messages for this ticket, ordered by created\_at (this is the conversation thread)
>    - Active draft prompt: `SELECT \* FROM prompt\_versions WHERE type = 'draft' AND is\_active = TRUE`
>
> 2. \*\*Build the user input string:\*\*
>    ```
>    Ticket Subject: {subject}
>    Category: {category}
>    Priority: {priority}
>
>    Conversation:
>    \[{sender\_type}] {body}
>    \[{sender\_type}] {body}
>    ...
>    ```
>
> 3. \*\*Define the search\_knowledge tool\*\* for OpenAI:
>    ```python
>    tools = \[{
>        "type": "function",
>        "function": {
>            "name": "search\_knowledge",
>            "description": "Search the knowledge base for relevant documentation to help answer the customer's question. Use specific, targeted queries.",
>            "parameters": {
>                "type": "object",
>                "properties": {
>                    "query": {
>                        "type": "string",
>                        "description": "Search query — be specific (e.g., 'refund policy for annual plans' not just 'refund')"
>                    }
>                },
>                "required": \["query"]
>            }
>        }
>    }]
>    ```
>
> 4. \*\*Create the tool executor\*\* — this is the function that runs when the model calls search\_knowledge:
>    ```python
>    def tool\_executor(tool\_name: str, tool\_args: dict) -> str:
>        if tool\_name == "search\_knowledge":
>            chunks = search\_knowledge(conn, workspace\_id, tool\_args\["query"], top\_k=5)
>            # Format results as a string the model can read
>            evidence\_text = ""
>            for chunk in chunks:
>                evidence\_text += f"\\n\[chunk:{chunk\['chunk\_id']}] (from: {chunk\['document\_title']})\\n{chunk\['content']}\\n"
>            return evidence\_text
>        return "Unknown tool"
>    ```
>
> 5. \*\*Call the model\*\* using `generate\_with\_tools()` from the provider module:
>    - system\_prompt = active draft prompt content
>    - user\_input = the formatted ticket/conversation string
>    - tools = the search\_knowledge tool definition
>    - tool\_executor = the function above
>
> 6. \*\*Parse the model's response.\*\* The model should produce JSON (the draft prompt instructs it to). Parse out:
>    - `body`: the draft reply text
>    - `cited\_evidence`: list of chunk IDs referenced in the reply
>    - `confidence`: float 0-1
>    - `unresolved\_questions`: list of strings (things the model couldn't resolve)
>    - `send\_ready`: boolean (false if confidence is low or evidence is insufficient)
>
>    If the model returns plain text instead of JSON, fall back to:
>    - body = the full text
>    - extract chunk IDs by regex matching `\[chunk:UUID]` patterns
>    - confidence = 0.5 (unknown)
>    - unresolved\_questions = \[]
>    - send\_ready = false
>
> 7. \*\*Store `draft\_generations` record:\*\*
>    ```sql
>    INSERT INTO draft\_generations
>        (id, ticket\_id, prompt\_version\_id, body, evidence\_chunk\_ids,
>         confidence, unresolved\_questions, send\_ready, latency\_ms,
>         token\_usage, estimated\_cost\_cents, approval\_outcome)
>    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'pending')
>    ```
>    - `evidence\_chunk\_ids` is a UUID\[] column — pass as a Python list
>
> 8. \*\*Return\*\* the full draft record plus the evidence chunks used
>
> \*\*Endpoints:\*\* Add to `api/app/routers/tickets.py`:
>
> \*\*`POST /tickets/{ticket\_id}/draft`\*\* — Generate a new draft
> - Calls `generate\_draft()`
> - Returns the stored draft with evidence details
> - Only support\_agent and team\_lead
>
> \*\*`POST /tickets/{ticket\_id}/redraft`\*\* — Re-run drafting
> - Same as `/draft` — creates a new draft\_generations record (doesn't overwrite)
> - Previous drafts remain accessible
>
> \*\*Important:\*\*
> - The model may call `search\_knowledge` multiple times with different queries — that's expected and good
> - Track which chunks were actually cited in the final response, not just which were retrieved
> - A draft with no cited evidence must have `send\_ready = false`
> - Token usage should include ALL rounds (initial + tool calls + final generation)
> - Latency should measure the full pipeline (all rounds combined)

**Done when:**

* `POST /tickets/{ticket\_id}/draft` generates a draft with cited evidence
* Draft stored in `draft\_generations` with all metadata fields populated
* Evidence chunks are real knowledge chunks from the DB (even though similarity is random due to fake embeddings)
* Draft body contains citation markers like `\[chunk:UUID]`
* Token usage and cost are tracked
* Running `/draft` twice creates 2 separate draft records
* Pipeline completes in < 8 seconds (p95)
* For a ticket with no relevant knowledge → low confidence, `send\_ready: false`, unresolved questions populated

\---

### Milestone 3E: Knowledge Ingestion Pipeline

**Context on the chunking and embedding pipeline:**

When a user uploads a document, it needs to be:

1. **Parsed** — extract plain text from PDF/Markdown/text
2. **Chunked** — split into \~500-token chunks with overlap (so evidence retrieval returns focused, relevant pieces, not entire documents)
3. **Embedded** — each chunk gets a 1536-dim vector from OpenAI
4. **Stored** — chunks + embeddings inserted into `knowledge\_chunks`

This runs as a **background job** because embedding 10+ chunks takes several seconds. The user uploads the doc, gets an immediate response, and the status transitions: `pending` → `processing` → `indexed` (or `failed`).

\---

**Paste this into Claude Code:**

> Implement the knowledge ingestion pipeline as a background job.
>
> \*\*File:\*\* `api/app/pipelines/ingestion.py`
>
> \*\*Function: `ingest\_document(document\_id: str)`\*\*
>
> This runs in the background (not in a request handler). It operates as a superuser (not RLS-scoped) because it needs to write to the DB without user context.
>
> 1. \*\*Load the document\*\* from `knowledge\_documents`:
>    - Get the raw content from the `metadata` JSONB field (stored during upload in 2B)
>    - Get the `content\_type`
>
> 2. \*\*Update status\*\* to `processing`
>
> 3. \*\*Parse content\*\* based on content\_type:
>    - `text/markdown` or `text/plain`: use the raw content directly
>    - `application/pdf`: extract text using `pymupdf` (install `pymupdf` package — it's `import fitz`)
>    - If parsing fails, set status to `failed` and return
>
> 4. \*\*Chunk the content:\*\*
>    - Target chunk size: \~500 tokens (\~2000 characters as a rough estimate)
>    - Overlap: 100 tokens (\~400 characters) between adjacent chunks
>    - Chunking strategy: split by paragraphs first (double newline), then merge small paragraphs into chunks up to the target size, then split oversized paragraphs at sentence boundaries
>    - Each chunk gets a `chunk\_index` (0, 1, 2, ...)
>
>    ```python
>    def chunk\_text(text: str, target\_chars: int = 2000, overlap\_chars: int = 400) -> list\[str]:
>        """Split text into overlapping chunks."""
>        paragraphs = text.split("\\n\\n")
>        chunks = \[]
>        current\_chunk = ""
>
>        for para in paragraphs:
>            if len(current\_chunk) + len(para) > target\_chars and current\_chunk:
>                chunks.append(current\_chunk.strip())
>                # Overlap: keep the last overlap\_chars of the current chunk
>                current\_chunk = current\_chunk\[-overlap\_chars:] + "\\n\\n" + para
>            else:
>                current\_chunk += ("\\n\\n" if current\_chunk else "") + para
>
>        if current\_chunk.strip():
>            chunks.append(current\_chunk.strip())
>
>        return chunks
>    ```
>    This is a simple implementation — good enough for MVP. The key property is: every chunk is self-contained enough to be useful evidence.
>
> 5. \*\*Embed all chunks\*\* using `embed\_batch()` from the provider module:
>    - Send chunks in batches of up to 100 (OpenAI's batch limit)
>    - Each chunk gets a 1536-dim vector
>
> 6. \*\*Insert chunks\*\* into `knowledge\_chunks`:
>    ```sql
>    INSERT INTO knowledge\_chunks (id, document\_id, chunk\_index, content, embedding, token\_count)
>    VALUES (%s, %s, %s, %s, %s::vector, %s)
>    ```
>    - Estimate `token\_count` as `len(chunk) // 4` (rough approximation)
>
> 7. \*\*Update document status\*\* to `indexed`
>
> 8. If any step fails, set status to `failed` and log the error
>
> \*\*Background execution:\*\*
>
> Use FastAPI's `BackgroundTasks` for simplicity (no need for arq/Redis yet):
>
> ```python
> from fastapi import BackgroundTasks
>
> @router.post("/knowledge/documents")
> def upload\_document(
>     ...,
>     background\_tasks: BackgroundTasks,
>     db = Depends(get\_rls\_db),
> ):
>     # ... create the document record (existing code from 2B) ...
>     # Trigger background ingestion:
>     background\_tasks.add\_task(ingest\_document, doc\_id)
>     return doc
> ```
>
> \*\*Important:\*\*
> - The background task runs OUTSIDE the request's DB transaction, so it needs its own DB connection from the pool
> - Use a non-RLS connection for the background task (it's a system operation, not a user operation): use `get\_db()` not `get\_rls\_db()`
> - Install `pymupdf` for PDF parsing: add to `pyproject.toml` dependencies
>
> \*\*Re-embedding seed data (optional but recommended):\*\*
>
> Create a management script `seed/reembed.py` that:
> 1. Reads all `knowledge\_chunks` where content is not empty
> 2. Generates real embeddings using `embed\_batch()`
> 3. Updates the embedding column
> 4. This replaces the random vectors from the seed with real ones
>
> This costs \~$0.02 for 5,000-8,000 chunks with text-embedding-3-small (very cheap). Run it once after seeding to make retrieval actually work.

**Done when:**

* Upload a new `.md` file via `POST /knowledge/documents` → status goes to `pending` immediately
* After a few seconds, status transitions to `indexed`
* `SELECT count(\*) FROM knowledge\_chunks WHERE document\_id = '{new\_doc\_id}'` returns multiple chunks
* Chunks have real embeddings (not null, not all zeros)
* `GET /knowledge/search?q=<query about the new doc>` returns chunks from the new doc with reasonable similarity scores
* PDF upload works (extract text → chunk → embed)
* If you run `reembed.py`, retrieval quality on seed data improves noticeably

\---

### Milestone 3F: End-to-End Pipeline Verification

**This is not a coding milestone — it's a manual verification checklist. Don't paste this into Claude Code. Walk through it yourself.**

Test the full flow that the demo will show:

**Test 1: Standard FAQ ticket**

1. Pick a billing ticket from seed data
2. `POST /tickets/{id}/triage` → verify reasonable classification
3. `POST /tickets/{id}/draft` → verify draft has citations
4. `POST /drafts/{draft\_id}/review` with action `approved` → verify approval persists

**Test 2: Low confidence scenario**

1. Create a new ticket about a topic with no matching knowledge (e.g., "Can you help with my quantum computing setup?")
2. Triage it → should still classify (maybe as feature\_request or general with low confidence)
3. Draft it → should have low confidence, unresolved questions, `send\_ready: false`

**Test 3: Tenant isolation**

1. Using an Org #1 agent JWT, draft a ticket → check that evidence only comes from Org #1's workspace
2. Using a client\_user JWT, verify they cannot trigger triage or drafting (role check)

**Test 4: Performance**

* Triage: < 2s
* Draft (including retrieval): < 8s p95
* Measure by checking `latency\_ms` in the stored records

**Done when:** All 4 tests pass. This validates that Milestones 1–3 form a working system before building the frontend.

\---

## What's in Part 2 (Milestones 4–6)

Written after Part 1 is implemented, referencing real code:

* **Milestone 4:** Frontend surfaces — layout, ticket queue, ticket workspace, review queue, knowledge upload
* **Milestone 5:** Eval system — eval runner backend, eval console UI, prompt comparison view
* **Milestone 6:** Demo readiness — demo flow verification, performance tuning, documentation, README, deployment

\---

## Risk Register

|Risk|Impact|Mitigation|
|-|-|-|
|BetterAuth ↔ custom users table mapping is awkward|M1C takes 2x longer|Pick the simplest option (shared IDs or lookup column) and commit — don't over-engineer|
|Seed embeddings are random — retrieval returns noise|Drafts cite irrelevant chunks until re-embed|Run `reembed.py` early in M3. It costs \~$0.02 and makes everything after it more testable|
|OpenAI latency spikes push draft gen past 8s|Demo feels slow|Use gpt-5-mini for drafting as fallback. Quality drops but latency improves. Make the model configurable|
|Neon cold starts add latency to first request|First query after idle is slow|Neon's serverless driver has connection caching. Use their `@neondatabase/serverless` for Next.js if needed. FastAPI pool stays warm during dev|
|RLS policies have bugs not caught by seed data|Data leaks between tenants|M1D debug endpoints are specifically designed to catch this. Test cross-org isolation explicitly before building anything else|



