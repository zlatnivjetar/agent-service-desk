# Agent Service Desk

## Current Milestone

**→ Milestone 2D: Eval API Endpoints**

Full implementation plan: `docs/implementation-plan.md`
When instructed to "implement current milestone", read the matching sub-milestone from that file.

\---

## Project Context

Multi-tenant AI-assisted support system for B2B SaaS teams. Ticket triage, grounded RAG drafting with citations, human approval workflows, prompt evaluation harness.

**Frontend:** Next.js 16 (App Router), TypeScript, shadcn/ui, Tailwind, TanStack Query.
**Backend:** FastAPI 0.135.x (Python 3.13), sync psycopg 3.3.x, OpenAI Responses API (SDK 2.26.x).
**Infra:** Neon (Postgres 16 + pgvector), Upstash Redis, Vercel (web), Railway (api).
**Auth:** BetterAuth 1.5.x → JWT → FastAPI validation.

Seed data: 100 orgs, 250 users, 15K tickets, 80K messages, 1K knowledge docs, 150 eval examples.
Three roles: `client\_user` (own org data), `support\_agent` (workspace tickets + internal), `team\_lead` (full access + eval console).

## Critical Rules

* ALL route handlers MUST use `Depends(get\_rls\_db)` from `app/deps.py` — never bare `get\_db()` (bypasses RLS)
* Every RLS-scoped connection runs: `SET LOCAL ROLE rls\_user` + `set\_config('app.org\_id', ...)` etc.
* Background tasks (ingestion, eval runs) use `get\_db()` directly — system operations, not user-scoped
* `ticket\_predictions` are stored SEPARATELY from ticket fields — never overwrite ticket.category with model output without agent approval
* `draft\_generations` are append-only — redrafting creates a new record, never overwrites
* Drafts without cited evidence MUST have `send\_ready = false`
* Internal-only knowledge docs must NEVER appear in client-visible contexts
* Use parameterized queries (`%s` placeholders) — never f-string user input into SQL
* Set `row\_factory=dict\_row` on psycopg connections
* OpenAI models: `gpt-5-mini` for classification/triage, `gpt-5.4` for grounded drafting, `text-embedding-3-small` for embeddings

## Monorepo Structure

```
agent-service-desk/
├── web/                    # Next.js 16 (App Router, TypeScript)
├── api/                    # FastAPI (Python 3.13)
│   └── app/
│       ├── main.py         # FastAPI app, CORS, routers
│       ├── config.py       # pydantic-settings Settings class
│       ├── db.py           # psycopg ConnectionPool
│       ├── deps.py         # get\_rls\_db dependency
│       ├── auth.py         # JWT validation, CurrentUser
│       ├── routers/        # HTTP endpoints
│       ├── schemas/        # Pydantic request/response models
│       ├── queries/        # SQL query functions
│       ├── pipelines/      # triage, drafting, retrieval, ingestion
│       └── providers/      # OpenAI wrapper module
├── seed/                   # schema.sql, seed.py, demo accounts
├── docs/                   # specs, architecture, implementation plan
├── justfile                # task runner
└── CLAUDE.md               # this file
```

## Key Patterns

* **Router → Schema → Query:** routes are thin, schemas define shapes, queries isolate SQL
* **Auth dependency chain:** `get\_current\_user` extracts JWT claims → `get\_rls\_db` combines auth + RLS-scoped connection
* **Provider module:** `api/app/providers/openai.py` — thin wrapper with `classify()`, `embed()`, `generate\_with\_tools()`
* **Pipeline modules:** `api/app/pipelines/{triage,drafting,retrieval,ingestion}.py` — each encapsulates one AI workflow

## Completion Protocol

When I type exactly **COMPLETED**:

1. Update "Current Milestone" at the top of this file to the next sub-milestone
2. Append a summary at the bottom `docs/implementation-log.md`: what changed, key decisions made, key files touched, any gotchas
3. Append a concepts debrief at the bottom of `docs/concepts-log.md` (format below)
4. Commit with message: `milestone <ID>: <brief description>`

Only the exact standalone input **COMPLETED** triggers this.

### Concepts Debrief Format (`docs/concepts-log.md`)

For each completed milestone, append a section titled `## Milestone <ID>: <name>` containing:

**What we built and why** — 2-3 sentences explaining the purpose of this milestone in plain language. What problem does it solve? Where does it sit in the overall system?

**Key concepts under the hood** — For each major tool, pattern, or technique used in this milestone, write a short paragraph (3-5 sentences) covering: what it is, why we used it here instead of alternatives, and what would go wrong without it. Limit to 3 key concepts that will be the most useful to someone learning how it works and why it is done. Use concrete examples from the code we just wrote, not generic definitions. However, for the examples from the written code, do not focus on things that are not relevant to someone learning the key concepts. Good explanation example: "*Router → Schema → Query separation.* Each endpoint in `routers/tickets.py` is intentionally thin: it validates the incoming request via Pydantic, calls a function in `queries/tickets.py`, and returns a schema. No SQL lives in the router; no HTTP concepts (status codes, request bodies) leak into the query layer.". Bad explanation example: "When inserting a Python dict into a JSONB column, psycopg 3 can't automatically adapt a plain `dict` type using a `%s` placeholder. You must wrap it with `psycopg.types.json.Jsonb(my_dict)`. This is different from psycopg 2, which would silently serialize the dict.".

**How these pieces connect** — 2-3 sentences on how this milestone's work integrates with what came before and what comes next. What would break downstream if we got this wrong?

Write this for someone who built the thing but wants to understand it well enough to explain it confidently in a technical interview — no jargon dumps, no oversimplification.