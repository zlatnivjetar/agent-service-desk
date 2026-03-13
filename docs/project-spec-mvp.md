Status: Design Specification (MVP)
Owner: David
Repository: agent-service-desk
Last Updated: 2026-03-13
Target Version: v0.5 (MVP)
Extends To: project-spec.md (full V1)

# Agent Service Desk — MVP Specification

## 1. Overview

**Agent Service Desk** is a multi-tenant AI-assisted support system for B2B SaaS teams. It helps support agents resolve tickets faster by combining ticket triage, grounded drafting, knowledge retrieval, and human approval workflows.

This MVP focuses on the core AI-assisted resolution loop: a ticket comes in, the system classifies it, retrieves relevant knowledge, drafts a grounded response with citations, and a human reviews it before sending.

The full V1 spec (`project-spec.md`) extends this foundation with incident clustering, multi-provider abstraction, Temporal workflows, a full knowledge management console, and advanced evaluation capabilities. Every decision in this MVP is designed to be forward-compatible with V1.

### MVP operating model

* AI classifies, retrieves, drafts, and suggests routing
* Humans approve, edit, reject, or escalate
* No autonomous outbound sending
* Single AI provider (OpenAI Responses API)

### What this MVP proves to a reviewer

* End-to-end RAG pipeline with citation traceability
* Structured LLM outputs for triage and classification
* Agentic tool calling (retrieval tools invoked by the model)
* Human-in-the-loop approval workflows
* Prompt versioning and basic evaluation harness
* Multi-tenant data isolation via Postgres RLS
* Production-grade system design thinking (cost, latency, auditability)

---

## 2. User Roles

### Support Agent

* View assigned and workspace-visible tickets
* Review AI-generated drafts and triage suggestions
* Approve, edit, reject, or escalate drafts
* Add internal notes

### Team Lead

* Full workspace ticket access
* Access evaluation console
* Review approval queue across the team

### Client User

* View only own organization's tickets and messages
* Create tickets
* Cannot access internal notes, internal knowledge, or other orgs' data

---

## 3. Product Surfaces

### 3.1 Ticket Queue

Workspace-level ticket list showing:

* status
* priority
* SLA state (badge only — no SLA engine in MVP)
* assignee
* category
* confidence score
* organization

Required queue features:

* filtering by status, priority, assignee, category
* sorting
* pagination
* URL-synced filters

Deferred to V1: saved views, bulk actions, duplicate/incident markers.

---

### 3.2 Ticket Workspace

Single-ticket resolution interface. This is the hero surface of the project.

Visible elements:

* ticket metadata and message thread
* assignee and routing suggestion
* SLA badge (static, based on priority)
* retrieved evidence panel with source citations
* AI-generated draft reply
* confidence score
* suggested next action (approve, escalate, request more info)
* approval action buttons

Required ticket actions:

* approve draft
* edit and approve
* reject draft
* escalate
* re-run retrieval and draft
* assign or reassign
* add internal note
* resolve or reopen

Deferred to V1: similar tickets panel, audit history timeline, full SLA timers.

---

### 3.3 Knowledge Upload

Minimal knowledge management — just enough to power retrieval.

* upload a document (PDF, Markdown, plain text)
* auto-parse, chunk, embed, and index on upload
* view list of uploaded documents with status
* delete a document (removes chunks and embeddings)
* visibility flag: internal-only or client-visible

Deferred to V1: versioning, re-indexing, metadata tagging, archive, chunk lineage viewer, manual document creation.

---

### 3.4 Review Queue

Queue of AI-generated drafts awaiting human decision.

Each item shows:

* ticket reference
* draft summary (first line or truncated)
* confidence score
* approval status
* time since generation

Review actions:

* approve
* edit and approve
* reject
* escalate

Deferred to V1: evidence count, policy risk markers, latency, provider/model metadata, regeneration action.

---

### 3.5 Evaluation Console

Minimal but functional eval harness. This is a key differentiator — most portfolio projects skip evaluation entirely.

MVP capabilities:

* maintain a small labeled eval set (category, routing, citation quality)
* run an eval set against the current prompt version
* view results: per-example pass/fail with model output
* compare two prompt versions side-by-side on the same eval set
* track basic metrics: classification accuracy, routing accuracy, citation hit rate

Deferred to V1: provider comparison, regression gates, cost/latency tracking, batch scheduling, escalation precision/recall.

---

## 4. Functional Requirements

### 4.1 Intake and Triage

For every new ticket, the system must produce a structured triage prediction:

* `category` (from a fixed set of ~8 categories)
* `urgency` (low / medium / high / critical)
* `suggested_team` (from a fixed set of ~6 teams)
* `escalation_suggested` (boolean + reason)
* `confidence` (0-1 float)

This is a single structured LLM call using the ticket content as input. The prediction is stored separately from any human-authored data.

Deferred to V1: subcategory, SLA risk inference, missing context detection, policy-sensitive content detection, duplicate detection.

---

### 4.2 Grounded Drafting

The system must generate a draft reply containing:

* response body
* cited evidence (linked to specific knowledge chunks)
* confidence score
* unresolved questions (if context is incomplete)
* send readiness flag

Drafting rules:

* a draft cannot be marked ready-to-send without supporting evidence
* if the model cannot find sufficient evidence, the draft must say so explicitly rather than fabricating an answer
* unsupported claims must be avoided — the prompt must instruct refusal over hallucination

---

### 4.3 Routing Suggestion

The system suggests:

* owner team
* assignee (optional — can be "unassigned")
* escalation type and reason (if applicable)

Routing is based on ticket content and the triage prediction. In MVP, routing uses the same structured output call as triage.

Deferred to V1: routing from historical patterns, incident clusters, SLA policy, organization metadata.

---

### 4.4 Knowledge Retrieval

The retrieval pipeline for draft generation:

1. build a retrieval query from the ticket content
2. apply tenant and visibility filters (RLS)
3. run semantic search against knowledge chunk embeddings (pgvector)
4. return top-k evidence chunks with source document references

Required retrieval tool (callable by the agent):

* `search_knowledge` — semantic search over knowledge chunks

Deferred to V1: `search_similar_tickets`, `get_sla_policy`, `get_org_context`, `get_recent_incidents`, lexical retrieval, merge-and-rerank.

Retrieval requirements:

* all evidence must be traceable to chunk IDs and document IDs
* citations in drafts must reference specific chunks
* retrieval must respect org/workspace visibility via RLS
* internal-only docs must never appear in client-visible outputs

---

### 4.5 Human Approval

Every outbound AI-generated reply requires human approval.

Allowed approval states:

* pending
* approved
* edited_and_approved
* rejected
* escalated

---

## 5. System Architecture

### 5.1 Application Layers

**Web Application**

* Next.js (App Router)
* TypeScript
* shadcn/ui + Tailwind
* TanStack Query

**Agent Runtime**

* FastAPI (Python)
* Structured tool calling via OpenAI Responses API
* Retrieval orchestration
* Triage and draft execution

**Data Layer**

* PostgreSQL with pgvector extension
* Redis (session cache, optional queue)

### 5.2 Model Provider

* OpenAI Responses API (single provider in MVP)
* Used for: classification, drafting, extraction, tool calling, structured outputs

The provider layer should be a thin abstraction (a single module with a clear interface) so that adding Anthropic or other providers in V1 is straightforward, but do not build a full adapter pattern in MVP.

### 5.3 Background Processing

MVP does not use Temporal or any workflow engine. Long-running tasks use:

* simple async Python tasks (background tasks in FastAPI, or a lightweight task queue like `arq` with Redis)
* knowledge ingestion (parse → chunk → embed → index) runs as a background job triggered by upload

Deferred to V1: Temporal workflows for ingestion, enrichment, clustering, evaluation, re-indexing.

---

## 6. Authentication and Authorization

### 6.1 Identity Flow

1. User authenticates in Next.js (email/password via BetterAuth or similar)
2. Web app resolves user session, org, and workspace
3. Web app issues a short-lived signed JWT for service calls
4. FastAPI validates the JWT and extracts claims

Required token claims:

* `user_id`
* `org_id`
* `workspace_id`
* `role`
* `exp`

### 6.2 RLS Execution Model

Every data access in FastAPI must run inside a transaction with:

* `SET LOCAL ROLE rls_user`
* `set_config('app.user_id', ...)`
* `set_config('app.org_id', ...)`
* `set_config('app.workspace_id', ...)`
* `set_config('app.user_role', ...)`

This applies to: ticket reads, message reads, knowledge retrieval, and draft generation context assembly.

### 6.3 Access Rules

**Client User** can access only: own org tickets, own org messages, client-visible knowledge. Cannot access: internal notes, internal docs, other orgs' data, review queue, eval console.

**Support Agent** can access: workspace-visible tickets, internal knowledge, assigned queues, review actions.

**Team Lead** can access: full workspace tickets, full review queue, evaluation console.

---

## 7. Data Model

Minimum entity set for MVP:

* `organizations`
* `users`
* `memberships` (user ↔ org)
* `workspaces`
* `workspace_memberships` (user ↔ workspace + role)
* `tickets`
* `ticket_messages`
* `ticket_predictions` (model-generated triage, stored separately from human truth)
* `ticket_assignments`
* `knowledge_documents`
* `knowledge_chunks` (with embedding vector column)
* `draft_generations` (stores: prompt version, evidence IDs, confidence, latency, token usage, approval outcome)
* `approval_actions`
* `prompt_versions`
* `eval_sets`
* `eval_examples`
* `eval_runs`
* `eval_results`

Deferred to V1: `ticket_events`, `ticket_tags`, `ticket_clusters`, `sla_policies`, `organization_metadata`, `knowledge_document_versions`, `retrieval_runs`, `tool_calls`, `provider_runs`, `attachments`.

### 7.1 Important entity requirements

**`ticket_predictions`** — model inferences stored separately from human-authored data. This separation is critical for evaluation.

**`draft_generations`** — must store: prompt version ID, retrieved evidence chunk IDs, confidence, latency, token usage, estimated cost, and final approval outcome. This enables evaluation and cost tracking.

**`prompt_versions`** — every prompt used for triage and drafting must be versioned. A prompt version record contains: name, type (triage | draft), content, created_at, is_active flag.

---

## 8. Evaluation Requirements

### 8.1 Eval Set

Seed a small labeled dataset (~50 examples minimum) covering:

* category classification (ticket text → expected category)
* routing (ticket text → expected team)
* citation quality (ticket + knowledge → does the draft cite relevant chunks?)

### 8.2 Metrics

Track at minimum:

* classification accuracy
* routing accuracy
* citation hit rate (% of drafts that cite at least one relevant chunk)

### 8.3 Prompt Comparison

The eval console must support running the same eval set against two different prompt versions and displaying results side-by-side. This is the core eval UX.

Deferred to V1: regression gates, provider comparison, escalation precision/recall, unsupported-claim rate, cost/latency tracking per eval run.

---

## 9. Seed Data Requirements

### 9.1 Minimum dataset

* 100 organizations
* 250 users (mix of agents, leads, client users)
* 15,000 tickets
* 80,000 messages
* 1,000 knowledge documents (chunked and embedded)
* 10 SLA policies (static data — no SLA engine in MVP, but the data exists)
* 8 ticket categories
* 6 routing teams
* 150 eval examples

### 9.2 Seed realism requirements

Dataset must include:

* repeated ticket categories with varying wording
* ambiguous ticket wording
* conflicting old/new docs
* internal-only and client-visible knowledge docs
* billing edge cases
* tickets where evidence is insufficient (to test refusal behavior)
* low-confidence scenarios
* routing edge cases
* tickets that should be refused or escalated
* incident-like duplicate spikes (data exists even though clustering is deferred to V1)
* sufficient volume to stress-test query performance with RLS filtering

---

## 10. Demo Flows

The deployed system must support these walkthrough scenarios:

### 10.1 Standard FAQ Ticket

* ticket arrives → triage classifies it → retrieval finds relevant docs → grounded draft generated with citations → agent approves

### 10.2 Low-Confidence / Insufficient Evidence

* ticket arrives on a topic with no matching knowledge → model produces a low-confidence draft that asks clarifying questions instead of fabricating → agent sees the low confidence and escalates

### 10.3 Tenant Isolation Proof

* log in as Org A client → can only see Org A tickets and knowledge
* log in as Org B client → can only see Org B data
* AI drafts for Org A never cite Org B knowledge

### 10.4 Eval Comparison

* open eval console → run eval set against prompt v1 → run against prompt v2 → compare classification accuracy and citation hit rate side-by-side

Deferred to V1: billing dispute flow, product bug / incident signal flow.

---

## 11. Performance Targets

* ticket queue load: < 500ms
* ticket workspace load: < 600ms
* triage prediction: < 2s
* draft generation (including retrieval): < 8s p95
* approval action persistence: < 300ms

These are practical targets for a demo system, not production SLAs.

---

## 12. Required Deliverables

Repository must include:

* full source code (monorepo: `/web`, `/api`, `/docs`, `/seed`)
* `README.md` with overview, architecture summary, setup instructions, demo credentials, screenshots, and Loom walkthrough link
* `docs/project-spec-mvp.md` (this document)
* `docs/project-spec.md` (full V1 spec — shows system thinking beyond what's built)
* `docs/architecture.md` (system diagram, data flow, tech decisions)
* `docs/auth-rls.md` (auth flow, RLS model, tenant isolation explanation)
* `docs/retrieval.md` (RAG pipeline, embedding strategy, chunk design)
* `docs/evals.md` (evaluation methodology, metrics, prompt versioning approach)
* schema and seed files
* environment variable reference
* demo credentials

### 12.1 README quality standard

The README is the most important file in the repo. A hiring manager will spend 30-60 seconds on it. It must contain:

* one-paragraph overview of what the system does
* tech stack list
* architecture diagram (can be a simple Mermaid diagram)
* 2-3 screenshots of the key surfaces (ticket workspace, eval console)
* Loom walkthrough link (2-3 minutes showing the core demo flow)
* setup instructions (docker-compose up or equivalent)
* demo credentials
* link to the full V1 spec to show forward thinking

---

## 13. Non-Goals for MVP

Do not build:

* Temporal or any workflow engine
* multi-provider abstraction (single provider only)
* incident / duplicate clustering
* full knowledge management (versioning, re-indexing, metadata, archive)
* SLA engine or timer logic
* audit history / event sourcing
* similar tickets panel
* bulk queue actions
* saved views
* autonomous outbound replies

---

## 14. V1 Extension Path

After MVP is solid and demo-ready, the full V1 spec adds:

* Temporal workflows for ingestion, enrichment, clustering, evaluation
* multi-provider support (Anthropic, Gemini adapters)
* incident and duplicate detection with clustering
* full knowledge console with versioning and chunk lineage
* SLA engine with timer logic
* tool call logging and audit history
* advanced evaluation: regression gates, provider comparison, cost/latency tracking
* expanded seed data (15,000 tickets, 1,000 knowledge docs, 100 orgs)

Each of these extensions builds on the MVP foundation without requiring rewrites.


