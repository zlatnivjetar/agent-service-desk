# Agent Service Desk

## Current Milestone

**→ Milestone 1B: Schema Deployment \& Seed Data**

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
2. Append a summary to `docs/implementation-log.md`: what changed, key desicions made, key files touched, any gotchas
3. Commit with message: `milestone <ID>: <brief description>`

Only the exact standalone input **COMPLETED** triggers this.

