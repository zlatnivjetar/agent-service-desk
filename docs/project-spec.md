Status: Design Specification
Owner: David
Repository: agent-service-desk
Last Updated: 2026-03-12
Target Version: v1

# Agent Service Desk — Project Specification

## 1. Overview

**Agent Service Desk** is a multi-tenant support operations system for B2B SaaS teams. It helps support agents resolve tickets faster by combining ticket triage, grounded drafting, routing, SLA awareness, duplicate detection, and human approval workflows.

The system is designed for internal support agents first. AI-generated outputs are assistive in V1 and must be reviewed by a human before any outbound reply is sent.

---

## 2. Product Scope

### Core capabilities

* Shared support queue
* Ticket workspace with AI-assisted resolution
* Knowledge ingestion and retrieval
* Routing and escalation suggestions
* SLA-aware triage
* Duplicate and incident detection
* Human review and approval
* Evaluation console for AI quality and regression tracking

### V1 operating model

* AI can classify, retrieve, draft, and suggest actions
* Humans approve, edit, reject, or escalate
* No autonomous outbound sending in V1

---

## 3. Primary Use Case

A support agent opens a ticket. The system:

* classifies the ticket
* retrieves relevant docs, policies, and similar historical tickets
* suggests routing and escalation
* drafts a response with citations
* flags missing context or low confidence
* requires human approval before send

---

## 4. User Roles

### Support Agent

* View assigned and workspace-visible tickets
* Review AI suggestions
* Approve, edit, reject, or escalate drafts
* Add notes, tags, and internal comments

### Team Lead

* Full workspace ticket access
* Manage routing, escalations, and incident clusters
* Access evaluation console
* Review agent performance and approval queues

### Client User

* View only own organization tickets and messages
* Create tickets
* View ticket status and responses
* Access only client-visible knowledge

### System Worker

* Runs ingestion, enrichment, clustering, and evaluation workflows
* No unrestricted access
* Must execute under scoped identity and RLS context

---

## 5. Core Product Surfaces

## 5.1 Shared Queue

A workspace-level ticket queue with:

* status
* priority
* SLA state
* assignee
* team
* channel
* organization
* confidence
* category
* duplicate/incident markers

### Required queue features

* filtering
* sorting
* pagination
* saved views
* URL-synced filters
* bulk assignment and triage actions
* status and SLA badges

---

## 5.2 Ticket Workspace

Single-ticket interface showing:

* ticket metadata
* full message thread
* assignee and routing information
* SLA timers
* organization/account metadata
* retrieved evidence
* similar tickets
* draft reply
* confidence score
* suggested next action
* approval actions
* audit history

### Required ticket actions

* approve draft
* edit and approve
* reject draft
* escalate
* re-run retrieval
* re-run draft
* assign or reassign
* add internal note
* tag ticket
* resolve or reopen

---

## 5.3 Knowledge Console

Knowledge management interface for:

* internal docs
* public docs
* runbooks
* billing policies
* feature documentation
* incident playbooks
* release notes

### Required knowledge features

* upload file
* create document manually
* versioning
* metadata tagging
* visibility control
* re-index
* archive
* view chunk lineage for citations

---

## 5.4 Review Queue

Queue of AI-generated outputs awaiting human decision.

Each item includes:

* ticket reference
* draft summary
* confidence
* evidence count
* policy risk markers
* approval status
* latency
* provider/model used

### Review actions

* approve
* edit and approve
* reject
* escalate
* mark insufficient evidence
* send back for regeneration

---

## 5.5 Evaluation Console

Evaluation interface for offline and batch testing.

### Required evaluation capabilities

* run saved eval sets
* compare prompt versions
* compare providers
* compare retrieval strategies
* inspect failures
* track regressions over time

### Evaluation dimensions

* classification correctness
* routing correctness
* escalation correctness
* citation relevance
* unsupported-claim rate
* refusal behavior when evidence is insufficient
* cost
* latency

---

## 6. Functional Requirements

## 6.1 Intake and Triage

For every new or updated ticket, the system must:

* classify category
* infer urgency
* infer owning team
* infer escalation need
* infer SLA risk
* detect missing required context
* detect policy-sensitive content
* detect probable duplicates

### Example structured output

* `category`
* `subcategory`
* `urgency`
* `owner_team`
* `sla_risk`
* `escalation_required`
* `missing_context_fields`
* `duplicate_cluster_id`
* `confidence`

---

## 6.2 Grounded Drafting

The system must generate a draft reply containing:

* response body
* cited evidence
* confidence score
* unresolved questions
* suggested internal action
* send readiness status

### Drafting rules

* A draft cannot be marked ready-to-send without evidence or an explicit insufficient-evidence state
* Unsupported claims must be avoided
* If context is incomplete, the draft must ask clarifying questions instead of over-claiming

---

## 6.3 Routing and Escalation

The system must suggest:

* owner team
* assignee
* severity
* escalation type
* escalation destination
* handoff reason

### Routing sources

* ticket content
* organization metadata
* SLA policy
* historical patterns
* recent incident clusters
* internal policy documents

---

## 6.4 Duplicate and Incident Detection

The system must:

* identify similar tickets
* cluster probable duplicates
* identify possible incident patterns
* surface cluster summary
* allow lead confirmation or dismissal

### Cluster outputs

* cluster id
* suspected cause summary
* affected organizations
* affected ticket count
* first seen / last seen
* related docs or incidents

---

## 6.5 Knowledge Ingestion

The system must support:

* file parsing
* metadata extraction
* chunking
* embedding
* indexing
* visibility assignment
* version activation
* version history

### Supported document types

* PDF
* Markdown
* HTML
* plain text
* copied internal notes
* policy records

---

## 6.6 Human Approval

Every outbound AI-generated reply in V1 must require human approval.

### Allowed approval states

* pending
* approved
* edited_and_approved
* rejected
* escalated
* regenerated

---

## 7. System Architecture

## 7.1 Application Layers

### Web Application

* Next.js
* TypeScript
* App Router
* shadcn/ui
* Tailwind
* TanStack Query

### Agent Runtime

* FastAPI
* Python
* structured tool orchestration
* provider abstraction
* retrieval orchestration
* draft and triage execution

### Data Layer

* Postgres
* pgvector
* Redis
* object storage

### Workflow Layer

* Temporal

---

## 7.2 Model Provider Layer

### Primary

* OpenAI Responses API

### Secondary

* Anthropic native API adapter

### Experimental

* Gemini adapter

### Provider responsibilities

* classification
* drafting
* extraction
* summarization
* tool calling
* structured outputs

---

## 8. Authentication and Authorization

## 8.1 Identity Flow

1. User authenticates in Next.js
2. Web app resolves user session and workspace membership
3. Web app issues a short-lived signed service token
4. FastAPI validates the token
5. Every tool call and retrieval query runs inside a scoped DB transaction with RLS context

### Required token claims

* `user_id`
* `org_id`
* `workspace_id`
* `role`
* `session_version`
* `exp`

---

## 8.2 RLS Execution Model

Every sensitive operation must run inside a transaction with:

* `SET LOCAL ROLE rls_user`
* `set_config('app.user_id', ...)`
* `set_config('app.org_id', ...)`
* `set_config('app.workspace_id', ...)`
* `set_config('app.user_role', ...)`

This applies to:

* ticket reads
* message reads
* knowledge retrieval
* draft generation context assembly
* routing context
* workflow side effects
* evaluation runs on tenant-scoped data

---

## 8.3 Access Rules

### Client User

Can access only:

* own organization tickets
* own organization messages
* own organization ticket events where appropriate
* client-visible knowledge
* own organization attachments

Cannot access:

* internal notes
* internal-only docs
* other organizations’ data
* review queue
* eval console
* incident management

### Support Agent

Can access:

* workspace-visible tickets
* internal knowledge
* assigned queues
* review actions relevant to role

### Team Lead

Can access:

* full workspace ticket set
* full review queue
* incident clusters
* evaluation console
* team-level metrics

### System Worker

Can access only what is allowed by scoped service identity and RLS context.

---

# 9. Retrieval System

## 9.1 Core Retrieval Sources

* knowledge chunks
* similar historical tickets
* SLA policies
* organization metadata
* recent incident records
* internal runbooks

## 9.2 Retrieval Pipeline

1. build retrieval query from ticket state
2. apply tenant and visibility filters
3. run lexical retrieval
4. run semantic retrieval
5. merge and rerank
6. return evidence set for drafting/routing

## 9.3 Required retrieval tools

* `search_knowledge`
* `search_similar_tickets`
* `get_sla_policy`
* `get_org_context`
* `get_recent_incidents`

## 9.4 Retrieval requirements

* all evidence must be traceable to internal ids
* citations must point to exact chunk/document versions
* retrieval must respect org/workspace visibility
* internal-only docs must never leak into client-visible outputs

---

# 10. Agent Runtime Requirements

## 10.1 Core runtime responsibilities

* run structured triage
* call retrieval tools
* generate grounded drafts
* generate routing and escalation suggestions
* log all tool usage
* persist outputs and metadata

## 10.2 Tool call logging

Every tool call must store:

* run id
* tool name
* caller identity scope
* input
* output summary
* latency
* success/failure state
* timestamp

## 10.3 Prompt versioning

Every production prompt used for:

* triage
* routing
* escalation
* drafting
* summarization

must be versioned and linked to generated outputs.

---

# 11. Async Workflows

Use Temporal for long-running or non-request/response work.

## 11.1 Knowledge Ingestion Workflow

* upload accepted
* parse
* classify
* chunk
* embed
* index
* activate version
* mark status complete

## 11.2 Ticket Enrichment Workflow

* classify ticket
* retrieve evidence
* generate draft
* generate routing suggestion
* generate escalation suggestion
* persist predictions
* enqueue review item

## 11.3 Incident Clustering Workflow

* batch recent tickets
* compute similarity
* propose clusters
* persist candidates
* notify lead queue

## 11.4 Evaluation Workflow

* load eval set
* execute provider/prompt run
* score outputs
* persist metrics
* mark regressions

## 11.5 Re-index Workflow

* detect new doc version
* archive previous active version
* regenerate embeddings
* update chunk mappings
* preserve historical citation lineage

---

# 12. Data Model

Minimum entity set:

* `organizations`
* `users`
* `memberships`
* `workspaces`
* `workspace_memberships`
* `tickets`
* `ticket_messages`
* `ticket_events`
* `ticket_tags`
* `ticket_assignments`
* `ticket_predictions`
* `ticket_clusters`
* `sla_policies`
* `organization_metadata`
* `knowledge_documents`
* `knowledge_document_versions`
* `knowledge_chunks`
* `attachments`
* `retrieval_runs`
* `draft_generations`
* `tool_calls`
* `approval_actions`
* `provider_runs`
* `prompt_versions`
* `eval_sets`
* `eval_examples`
* `eval_runs`
* `eval_results`

## 12.1 Important entity requirements

### `ticket_predictions`

Stores model-generated inferences separately from human-authored truth.

### `draft_generations`

Stores:

* provider
* model
* prompt version
* ticket snapshot hash
* retrieved evidence ids
* confidence
* latency
* token usage
* estimated cost
* approval outcome

### `knowledge_document_versions`

Must preserve version history and exact citation source.

### `provider_runs`

Must enable comparison across providers and model versions.

---

# 13. Evaluation Requirements

## 13.1 Offline Eval Set

Seed labeled examples for:

* category classification
* routing
* escalation
* citation quality
* safe refusal
* low-confidence handling

## 13.2 Metrics

Track at minimum:

* classification accuracy
* routing accuracy
* escalation precision
* escalation recall
* citation hit rate
* unsupported-claim rate
* average latency
* p95 latency
* approval rate
* edit distance between AI draft and final sent response

## 13.3 Regression Gates

A new prompt/model/provider configuration must fail promotion if it:

* increases unsupported claims
* reduces routing accuracy
* reduces citation quality
* materially increases latency without quality improvement
* materially increases cost without quality improvement

---

# 14. Performance Targets

* shared queue load: **< 400ms**
* ticket workspace load: **< 500ms**
* retrieval step: **< 250ms**
* triage prediction: **< 1.5s**
* draft generation p95: **< 6s**
* review action persistence: **< 200ms**
* queue filter interactions: **< 500ms**
* similar-ticket clustering: async
* knowledge ingestion: async with visible progress

---

# 15. Seed Data Requirements

## 15.1 Minimum dataset

* 100 organizations
* 250 users
* 15,000 tickets
* 80,000 messages
* 1,000 knowledge documents
* 10 SLA policies
* 8 ticket categories
* 6 routing teams
* 150 eval examples

## 15.2 Seed realism requirements

Dataset must include:

* repeated ticket categories
* ambiguous ticket wording
* conflicting old/new docs
* internal-only and client-visible docs
* billing edge cases
* incident-like duplicate spikes
* low-confidence scenarios
* routing edge cases
* tickets that should be refused or escalated

---

# 16. Demo Flows

The system must support these demo flows:

## 16.1 Standard FAQ Ticket

* retrieve docs
* generate grounded reply
* agent approves

## 16.2 Billing Dispute

* retrieve policy
* request missing details
* route to billing
* avoid unsupported resolution promises

## 16.3 Product Bug / Incident Signal

* detect similar recent tickets
* suggest escalation to engineering
* create or attach incident cluster

## 16.4 Low-Confidence Case

* do not over-claim
* ask clarifying questions
* mark not ready to send

## 16.5 Tenant Isolation Proof

* Org A cannot access Org B tickets
* Org A cannot retrieve Org B knowledge
* AI outputs for Org A cannot cite Org B data

---

# 17. Required Deliverables

Repository must include:

* full source code
* setup instructions
* architecture documentation
* schema and seed files
* workflow documentation
* environment variable reference
* demo credentials
* performance benchmark results
* evaluation methodology
* screenshots
* loom walkthrough

---

# 18. README / Docs Structure

Recommended docs:

* `README.md`
* `docs/project-spec.md`
* `docs/architecture.md`
* `docs/auth-rls.md`
* `docs/retrieval.md`
* `docs/workflows.md`
* `docs/evals.md`
* `docs/performance.md`

## README contents

* overview
* tech stack
* architecture summary
* setup instructions
* demo credentials
* screenshots
* loom link
* key workflows
* performance summary
* assumptions
* future improvements

---

# 19. Non-Goals for V1

Do not include:

* autonomous outbound replies
* voice interfaces
* full omnichannel platform
* full CRM
* full ticketing replacement
* generic multi-agent platform layer
* social media support integrations
* complex billing engine
* broad workflow builder UI

---

# 20. Stretch Goals

Only after core quality is strong:

* provider comparison mode
* A/B prompt experiments
* approval analytics dashboard
* incident summary generation
* cached context optimization
* handoff summarization for engineering or billing

---

# 21. Final Product Definition

**Agent Service Desk** is a multi-tenant AI support operations system for human agents. It combines grounded drafting, routing, SLA-aware triage, duplicate detection, knowledge retrieval, and approval workflows under strict tenant isolation and auditable AI execution.
