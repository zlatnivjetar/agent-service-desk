# Agent Service Desk

This file mirrors `CLAUDE.md` for Codex/AGENT consumers. Keep it aligned with `CLAUDE.md` when project instructions change.

## Current Milestone

**-> Milestone 4C: Ticket Detail Page**

Implementation plans:
- Part 1 (Milestones 1-3): `docs/implementation-plan.md`
- Part 2 (Milestones 4-6): `docs/implementation-plan-part2.md`

When instructed to "implement current milestone", read the matching sub-milestone from the appropriate plan file.

---

## Project Context

Multi-tenant AI-assisted support system for B2B SaaS teams. Ticket triage, grounded RAG drafting with citations, human approval workflows, prompt evaluation harness.

**Frontend:** Next.js 16 (App Router), TypeScript, shadcn/ui, Tailwind, TanStack Query.
**Backend:** FastAPI 0.135.x (Python 3.13), sync psycopg 3.3.x, OpenAI Responses API (SDK 2.26.x).
**Infra:** Neon (Postgres 16 + pgvector), Upstash Redis, Vercel (web), Railway (api).
**Auth:** BetterAuth 1.5.x -> JWT -> FastAPI validation.

Seed data: 100 orgs, 250 users, 15K tickets, 80K messages, 1K knowledge docs, 150 eval examples.
Three roles: `client_user` (own org data), `support_agent` (workspace tickets + internal), `team_lead` (full access + eval console).

## Critical Rules

* ALL route handlers MUST use `Depends(get_rls_db)` from `app/deps.py` - never bare `get_db()` (bypasses RLS)
* Every RLS-scoped connection runs: `SET LOCAL ROLE rls_user` + `set_config('app.org_id', ...)` etc.
* Background tasks (ingestion, eval runs) use `get_db()` directly - system operations, not user-scoped
* `ticket_predictions` are stored SEPARATELY from ticket fields - never overwrite ticket.category with model output without agent approval
* `draft_generations` are append-only - redrafting creates a new record, never overwrites
* Drafts without cited evidence MUST have `send_ready = false`
* Internal-only knowledge docs must NEVER appear in client-visible contexts
* Use parameterized queries (`%s` placeholders) - never f-string user input into SQL
* Set `row_factory=dict_row` on psycopg connections
* OpenAI models: `gpt-5-mini` for classification/triage, `gpt-5.4` for grounded drafting, `text-embedding-3-small` for embeddings

## Design System

`design-system/agent-service-desk/MASTER.md` is the source of truth for colors, typography, spacing, shadows, and component specs. Read it at the start of every frontend milestone.

Page overrides in `design-system/agent-service-desk/pages/` exist but contain generic landing-page patterns - ignore their section orders and CTA placements. Use only their layout/density overrides when relevant.

Palette: Teal primary (#0D9488), orange accent (#F97316), slate text (#0F172A), light background (#F8FAFC). Font: Inter.

## Monorepo Structure

```text
agent-service-desk/
- web/                    # Next.js 16 (App Router, TypeScript)
- api/                    # FastAPI (Python 3.13)
  - app/
    - main.py             # FastAPI app, CORS, routers
    - config.py           # pydantic-settings Settings class
    - db.py               # psycopg ConnectionPool
    - deps.py             # get_rls_db dependency
    - auth.py             # JWT validation, CurrentUser
    - routers/            # HTTP endpoints
    - schemas/            # Pydantic request/response models
    - queries/            # SQL query functions
    - pipelines/          # triage, drafting, retrieval, ingestion
    - providers/          # OpenAI wrapper module
- seed/                   # schema.sql, seed.py, demo accounts
- docs/                   # specs, architecture, implementation plan
- justfile                # task runner
- CLAUDE.md               # Claude-facing repo instructions
- AGENT.md                # this file
```

## Key Patterns

* **Router -> Schema -> Query:** routes are thin, schemas define shapes, queries isolate SQL
* **Auth dependency chain:** `get_current_user` extracts JWT claims -> `get_rls_db` combines auth + RLS-scoped connection
* **Provider module:** `api/app/providers/openai.py` - thin wrapper with `classify()`, `embed()`, `generate_with_tools()`
* **Pipeline modules:** `api/app/pipelines/{triage,drafting,retrieval,ingestion}.py` - each encapsulates one AI workflow

## Completion Protocol

When I type exactly **COMPLETED**:

1. Update "Current Milestone" at the top of both `AGENT.md` and `CLAUDE.md` to the next sub-milestone
2. Append a summary at the bottom of `docs/implementation-log.md`: what changed, key decisions made, key files touched, any gotchas
3. Append a concepts debrief at the bottom of `docs/concepts-log.md`
4. Commit with message: `milestone <ID>: <brief description>`
5. The concepts debrief must append `## Milestone <ID>: <name>` and include exactly three sections: `What we built and why` (2-3 plain-language sentences on the problem solved and where it fits), `Key concepts under the hood` (3 concept-first explanations covering what it is, why it was chosen, and what breaks without it), and `How these pieces connect` (2-3 sentences on how this milestone integrates with what came before and what comes next)

Only the exact standalone input **COMPLETED** triggers this.
