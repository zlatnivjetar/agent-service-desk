# Agent Service Desk

## Current Milestone

**→ Milestone 6D: Demo Walkthrough & README**

Implementation plans:
- Part 1 (Milestones 1–3): `docs/implementation-plan.md`
- Part 2 (Milestones 4–6): `docs/implementation-plan-part2.md`

When instructed to "implement current milestone", read the matching sub-milestone from the appropriate plan file.

---

## Project Context

Multi-tenant AI-assisted support system for B2B SaaS teams. Ticket triage, grounded RAG drafting with citations, human approval workflows, prompt evaluation harness.

**Frontend:** Next.js 16 (App Router), TypeScript, shadcn/ui, Tailwind, TanStack Query.
**Backend:** FastAPI 0.135.x (Python 3.13), sync psycopg 3.3.x, OpenAI Responses API (SDK 2.26.x).
**Infra:** Neon (Postgres 16 + pgvector), Upstash Redis, Vercel (web), Railway (api).
**Auth:** BetterAuth 1.5.x → JWT → FastAPI validation.

Seed data: 100 orgs, 250 users, 15K tickets, 80K messages, 1K knowledge docs, 150 eval examples.
Three roles: `client\_user` (own org data), `support\_agent` (workspace tickets + internal), `team\_lead` (full access + eval console).

## Monorepo Structure

```
agent-service-desk/
├── web/                    # Next.js 16 (App Router, TypeScript) — see web/CLAUDE.md
├── api/                    # FastAPI (Python 3.13) — see api/CLAUDE.md
├── seed/                   # schema.sql, seed.py, demo accounts
├── docs/                   # specs, architecture, implementation plan
├── justfile                # task runner
└── CLAUDE.md               # this file
```

## Completion Protocol

When I type exactly **COMPLETED**:

1. Update "Current Milestone" at the top of this file to the next sub-milestone
2. Append a summary at the bottom `docs/implementation-log.md`: what changed, key decisions made, key files touched, any gotchas
3. Use the `/concepts-debrief` skill to append a concepts debrief at the bottom of `docs/concepts-log.md`
4. Commit with message: `milestone <ID>: <brief description>`

Only the exact standalone input **COMPLETED** triggers this.
