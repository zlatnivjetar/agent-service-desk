# Agent Service Desk

A multi-tenant AI-assisted support system for B2B SaaS teams. Agents receive ticket triage predictions, RAG-grounded draft responses with traceable citations, and a human approval workflow before any AI-generated content reaches customers. Team leads get a prompt evaluation harness to compare AI quality across prompt versions. Tenant isolation is enforced at the database level via Postgres Row-Level Security.

## Tech Stack

| Layer | Choice | Version |
|---|---|---|
| Frontend | Next.js (App Router) | 16.1.x |
| UI Components | shadcn/ui (Base Nova) + Tailwind | shadcn 4.x, Tailwind v4 |
| State Management | TanStack Query | 5.x |
| Backend | FastAPI | 0.135.x |
| Language | Python | 3.12+ |
| Database | Neon (Postgres + pgvector) | Postgres 16 |
| AI Provider | OpenAI (Responses API) | SDK 2.26.x |
| Auth | BetterAuth (sessions) + JWT (API) | 1.5.x |
| Cache | Upstash Redis | Serverless |
| Frontend Hosting | Vercel | - |
| Backend Hosting | Railway | - |

## Architecture

```mermaid
graph TD
    subgraph "Frontend — Vercel"
        Browser[Browser] --> NextJS[Next.js 16]
        NextJS --> Auth[BetterAuth<br/>Sessions + JWT Minting]
    end

    subgraph "Backend — Railway"
        API[FastAPI]
        API --> RLS[RLS Middleware<br/>Tenant Isolation]
        RLS --> SQL[Query Layer]
        API --> Triage[Triage Pipeline<br/>Classification]
        API --> Draft[Drafting Pipeline<br/>RAG + Tool Use]
        API --> Ingest[Ingestion Pipeline<br/>Chunking + Embedding]
        API --> Eval[Eval Runner<br/>Background]
        Triage --> OpenAI[OpenAI API]
        Draft --> OpenAI
        Ingest --> OpenAI
        Eval --> OpenAI
    end

    subgraph "Data — Neon"
        SQL --> DB[(Postgres 16<br/>pgvector + RLS)]
        Draft --> DB
    end

    Auth --> |JWT| API
    Browser --> |Bearer Token| API
    Auth --> DB
```

**Key design decisions:**
- **RLS as isolation layer**: Every query runs under `SET LOCAL ROLE rls_user` with per-request tenant config. No application-level filtering needed.
- **Predictions are append-only**: AI triage results are stored separately from ticket fields, never overwritten. This makes the eval harness meaningful.
- **Agentic drafting**: The drafting pipeline gives the model a `search_knowledge` tool. It decides when and what to retrieve, creating a natural RAG loop with traceable citations.
- **SQL isolation**: All SQL lives in `api/app/queries/` — routers never write SQL directly.

## Key Surfaces

### Operations Dashboard (Agent/Lead)
Real-time operations overview with KPI cards (open queue, pending review, unassigned high/critical, knowledge issues, latest eval accuracy), interactive charts (tickets created trend with comparison overlay, backlog by status, age-by-priority heatmap), and an action center watchlist. Supports date range filtering (7d/30d/90d/custom), team filtering, comparison mode, and saved views with customizable columns, density, and auto-refresh intervals.

### Ticket Queue
Filterable, sortable, paginated ticket list. Filters by status, priority, category, team, and assignee. URL-synced state so filter combinations are shareable. Customizable column visibility, density modes (comfortable/compact), and saved view management.

### Ticket Workspace
The hero surface. Two-column layout with message thread + reply box on the left, and AI panels on the right:
- **Triage panel**: One-click classification with predicted category, priority, team, confidence score, and escalation flag
- **Draft panel**: AI-generated response with confidence badge and send-ready indicator
- **Evidence panel**: Retrieved knowledge chunks with source document titles and similarity scores
- **Actions**: Status/priority/category/team updates, assignment, draft approval/rejection/escalation

### Review Queue
Pending AI drafts awaiting human review. Each card shows a truncated draft body, confidence score, and time since generation. Agents can approve, reject (with reason), or escalate directly from the queue. Auto-refreshes every 30 seconds.

### Knowledge Base
Document management for the RAG pipeline. Upload `.pdf`, `.md`, or `.txt` files. Documents are chunked and embedded in the background. Inline chunk expansion to inspect what the AI will retrieve. Visibility controls (internal vs. client-visible).

### Eval Console (Team Lead only)
Run evaluations against different prompt versions. Three tabs:
- **Run**: Select an eval set and prompt version, start a background evaluation
- **Runs**: View all completed and in-progress runs with pass/fail counts and accuracy percentages
- **Compare**: Side-by-side metrics and per-example comparison between two runs, with colored deltas

## Demo Credentials

| Role | Email | Password | Can See |
|---|---|---|---|
| Support Agent | agent@demo.com | agent123 | All workspace tickets, triage, drafts, knowledge, reviews |
| Team Lead | lead@demo.com | lead123 | Everything agent sees + eval console |
| Client User | client@demo.com | client123 | Own org tickets only, no AI panels, no internal notes |

### Demo Flows

1. **FAQ Resolution**: Login as agent &rarr; open ticket &rarr; Run Triage &rarr; Generate Draft &rarr; review evidence &rarr; Approve
2. **Low Confidence**: Agent opens ambiguous ticket &rarr; low-confidence draft with `send_ready: false` &rarr; Escalate
3. **Tenant Isolation**: Login as client &rarr; see only own org data, no AI panels. Login as agent &rarr; see all workspace tickets including internal notes
4. **Eval Comparison**: Login as lead &rarr; Eval Console &rarr; run eval set against triage-v1 &rarr; run again against triage-v2 &rarr; compare metrics side-by-side

## Setup

### Prerequisites

- Node.js 20+
- Python 3.12+
- A [Neon](https://neon.tech) database (free tier works)
- An [OpenAI](https://platform.openai.com) API key
- An [Upstash](https://upstash.com) Redis instance (free tier works)

### 1. Clone and install dependencies

```bash
git clone <repo-url> agent-service-desk
cd agent-service-desk

# Frontend
cd web && npm install && cd ..

# Backend
cd api && python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS/Linux:
source .venv/bin/activate
pip install -e .
cd ..
```

### 2. Configure environment variables

Copy `.env.example` values into per-service env files:

**`api/.env.local`**:
```env
DATABASE_URL=postgresql://user:pass@host.neon.tech/dbname?sslmode=require
REDIS_URL=redis://...
OPENAI_API_KEY=sk-...
JWT_SECRET=<random-64-char-string>
CORS_ORIGINS=["http://localhost:3000"]
```

**`web/.env.local`**:
```env
DATABASE_URL=postgresql://user:pass@host.neon.tech/dbname?sslmode=require
BETTER_AUTH_SECRET=<random-secret>
BETTER_AUTH_URL=http://localhost:3000
JWT_SECRET=<same-secret-as-api>
NEXT_PUBLIC_API_URL=http://localhost:8000
```

`JWT_SECRET` must be identical in both files.

### 3. Set up the database

```bash
# Push schema to Neon
just db-push

# Seed data (100 orgs, 15K tickets, 1K knowledge docs, 150 eval examples)
just db-seed

# Create BetterAuth tables
just db-auth-migrate

# Create demo user accounts (BetterAuth + app tables)
just db-seed-auth
just db-demo
```

### 4. Start development servers

```bash
# Terminal 1 — API (port 8000)
just dev-api

# Terminal 2 — Frontend (port 3000)
just dev-web
```

Open http://localhost:3000 and log in with any demo account.

### Optional: Re-embed with real vectors

The seed data uses placeholder embeddings. To get meaningful semantic search results:

```bash
cd seed && python reembed.py
```

This re-embeds all knowledge chunks using OpenAI's `text-embedding-3-small` model (~$0.02).

### Optional: Mock AI mode

To run the full pipeline without spending OpenAI API credits, set `MOCK_AI=1` in `api/.env.local`. Mock mode exercises all DB writes, RLS scoping, and retrieval — only the LLM generation step is stubbed.

## API Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/health` | - | Health check with DB status |
| GET | `/auth/me` | Bearer | Current user info |
| GET | `/tickets` | Bearer | Paginated ticket list with filters |
| GET | `/tickets/stats` | Bearer | Aggregate counts by status/priority |
| GET | `/tickets/{id}` | Bearer | Full ticket detail with messages, prediction, draft |
| PATCH | `/tickets/{id}` | Bearer | Update ticket fields |
| POST | `/tickets/{id}/messages` | Bearer | Add message or internal note |
| POST | `/tickets/{id}/assign` | Bearer | Assign ticket to user |
| POST | `/tickets/{id}/triage` | Agent/Lead | Run AI triage pipeline |
| POST | `/tickets/{id}/draft` | Agent/Lead | Generate AI draft response |
| POST | `/tickets/{id}/redraft` | Agent/Lead | Re-generate draft |
| GET | `/drafts/review-queue` | Agent/Lead | Pending drafts queue |
| POST | `/drafts/{id}/review` | Agent/Lead | Approve/reject/escalate draft |
| GET | `/knowledge/documents` | Bearer | List knowledge documents |
| GET | `/knowledge/documents/{id}` | Bearer | Document detail with chunks |
| POST | `/knowledge/documents` | Bearer | Upload document (multipart) |
| DELETE | `/knowledge/documents/{id}` | Bearer | Delete document |
| GET | `/knowledge/search` | Bearer | Semantic search (`?q=...&top_k=5`) |
| GET | `/eval/sets` | Lead | List eval sets |
| GET | `/eval/sets/{id}` | Lead | Eval set detail with examples |
| POST | `/eval/runs` | Lead | Create and start eval run |
| GET | `/eval/runs` | Lead | List eval runs |
| GET | `/eval/runs/{id}` | Lead | Run detail with results |
| GET | `/eval/runs/compare` | Lead | Compare two runs side-by-side |
| GET | `/prompt-versions` | Bearer | List prompt versions |
| GET | `/users` | Bearer | Workspace users |
| GET | `/dashboard/overview` | Agent/Lead | KPIs and chart data (date range, team filters) |
| GET | `/dashboard/watchlist` | Agent/Lead | Action center items needing attention |
| GET | `/dashboard/views` | Bearer | List saved views for a page |
| POST | `/dashboard/views` | Bearer | Create saved view |
| PATCH | `/dashboard/views/{id}` | Bearer | Update saved view |
| DELETE | `/dashboard/views/{id}` | Bearer | Delete saved view |
| GET | `/dashboard/preferences` | Bearer | User dashboard preferences |
| PATCH | `/dashboard/preferences` | Bearer | Update dashboard preferences |

## Seed Data

The full seed (`just db-seed`) generates:

| Entity | Count |
|---|---|
| Organizations | 100 |
| Users | 250 |
| Tickets | 15,000 |
| Messages | 80,000 |
| Knowledge Documents | 1,000 |
| Knowledge Chunks | ~3,500 |
| Eval Examples | 150 |
| SLA Policies | 10 |
| Prompt Versions | 4 |

The demo accounts (`just db-demo`) add 48 deterministic tickets across all 8 categories and 6 statuses for the demo org.

## Documentation

- [Architecture](docs/architecture.md) — System diagram, data flows, project structure
- [Auth & RLS Model](docs/auth-rls.md) — Authentication flow, RLS execution model, role access rules
- [Retrieval Pipeline](docs/retrieval.md) — RAG overview, embedding strategy, knowledge ingestion, citation traceability
- [Evaluation Methodology](docs/evals.md) — Eval sets, metrics, prompt versioning, running comparisons
- [Deployment Guide](docs/deployment.md) — Vercel + Railway setup, env vars, troubleshooting
- [MVP Specification](docs/project-spec-mvp.md) — Original product spec
- [Full V1 Specification](docs/project-spec.md) — Forward-looking V1 spec beyond what's built

## V1 Extension Path

The MVP is designed for extension without rewrites:

- **Temporal workflows**: Replace `BackgroundTasks` with Temporal for durable, retryable execution of triage/draft/eval pipelines
- **Multi-provider AI**: Abstract the OpenAI provider into a provider interface; add Anthropic, Google, local models
- **Incident clustering**: Group related tickets by embedding similarity for pattern detection
- **Full knowledge console**: Version history, bulk import, automatic re-embedding on updates
- **Advanced eval with regression gates**: CI integration that blocks prompt changes if accuracy drops below threshold
- **Real-time updates**: WebSocket push for ticket changes, draft completions, and eval progress
- **SLA engine**: Active SLA tracking with breach alerts based on the existing `sla_policies` table
