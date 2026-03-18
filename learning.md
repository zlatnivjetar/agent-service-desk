# Agent Service Desk: What Was Built

## The short version

This repo is an internal AI-assisted support operations system for B2B software companies.

It is not trying to replace Zendesk, Intercom, or a full CRM. It is focused on one narrow, high-value workflow:

1. a support ticket comes in
2. the system classifies it
3. it searches the company knowledge base for relevant evidence
4. it drafts a reply with citations
5. a human reviews the draft before anything goes out

The core idea is: make support agents faster without letting the AI act autonomously.

## Who would use this

The best fit is a company that already has:

- a support team handling a steady flow of tickets
- internal docs, runbooks, policies, and help articles
- multiple support scenarios like billing, account access, onboarding, integrations, or API issues
- a need to keep customer data isolated by tenant or organization

Typical examples:

- B2B SaaS companies
- API/platform companies
- fintech or billing-heavy SaaS products
- enterprise software vendors with internal support playbooks
- products where support often has to consult docs before answering

This is especially useful when support work is repetitive but still risky enough that a human should approve the answer.

## What problem it solves

Support teams lose a lot of time on the same sequence over and over:

- read the ticket
- figure out what type of issue it is
- decide which team should own it
- search docs, policies, and prior knowledge
- write a response
- make sure the response is safe and accurate

This system compresses that loop.

Instead of starting from a blank page, the agent gets:

- an AI triage suggestion
- a suggested team/routing direction
- retrieved evidence from the knowledge base
- a draft reply
- a confidence signal
- a review workflow before approval

So the agent spends less time gathering context and more time judging, editing, and approving.

## The main workflow

Here is the practical flow the codebase is built around:

### 1. Ticket Queue

Agents land in a shared queue of tickets. They can filter and sort by status, priority, category, team, and assignee.

This is the operational inbox.

### 2. Ticket Workspace

Opening a ticket shows the full workspace:

- the message thread
- ticket metadata
- AI triage
- retrieved evidence
- AI draft
- agent actions like assign, update status, approve, reject, or escalate

This is the main "work surface" of the product.

### 3. AI Triage

The triage pipeline uses an LLM to produce structured predictions such as:

- category
- urgency / priority
- suggested team
- whether escalation is recommended
- confidence

Important detail: these predictions are stored separately from the ticket itself. That means the AI suggestion is treated as a suggestion, not as ground truth.

### 4. Knowledge Retrieval

The system stores knowledge documents, splits them into chunks, embeds them, and searches them with pgvector.

That lets the draft pipeline pull back specific evidence rather than relying on the model's memory.

This is what makes the drafting pipeline a grounded RAG workflow rather than a generic chatbot.

### 5. Draft Generation

The drafting pipeline is the most interesting part technically.

The model can call a `search_knowledge` tool, look up relevant documentation, and then generate a reply that references chunk IDs as citations.

The resulting draft stores:

- body text
- cited evidence chunk IDs
- confidence
- unresolved questions
- send readiness
- token usage, latency, and estimated cost

If there is no evidence, the system forces `send_ready = false`.

### 6. Human Review

Nothing is sent automatically in this MVP.

Agents or team leads review drafts and can:

- approve
- edit and approve
- reject
- escalate

There is also a dedicated review queue for pending drafts, which means agents can process AI output in bulk.

This human-in-the-loop step is a major part of the product's purpose. The system is designed to assist judgment, not replace it.

## How it speeds up workflow

The speedup comes from removing low-value manual setup work:

- Triage is faster because the agent does not classify every ticket from scratch.
- Routing is faster because the model suggests the likely owning team.
- Research is faster because relevant docs are retrieved automatically.
- Writing is faster because the agent starts from a draft instead of a blank reply.
- Review is faster because drafts are centralized in a queue.

In plain terms, the product turns support work from:

"Read -> investigate -> search -> write"

into:

"Review -> verify -> edit -> approve"

That is a meaningful productivity change for support teams.

## Why the knowledge base matters

The knowledge console is not just an admin page. It is what feeds the AI.

Agents upload documents, which are then:

1. parsed
2. chunked
3. embedded
4. indexed

Those chunks become the evidence pool used during drafting and retrieval.

So if you want better AI answers in this product, you improve the knowledge base. The quality of the AI is tightly coupled to the quality of uploaded documentation.

## What Evals are, in plain English

This is the part that often confuses people:

Evals are not customer-facing support tasks. They are offline tests for the AI system itself.

Think of them as a benchmark suite for prompts and model behavior.

The repo stores:

- eval sets
- labeled examples
- eval runs
- per-example results
- aggregate metrics

An eval run takes a prompt version and tests it against a fixed set of examples. Then it scores whether the output was correct.

In this MVP, the main tracked metrics are:

- classification accuracy
- routing accuracy
- citation hit rate

### Why that matters

Without evals, changing a prompt is basically guesswork.

A new prompt might sound better in one demo ticket but silently make billing classification worse, route more tickets to the wrong team, or retrieve weaker evidence.

The eval system exists so a team lead can answer questions like:

- "Did triage prompt v2 actually improve accuracy?"
- "Did the new prompt make routing worse?"
- "Are citations still hitting the expected knowledge chunks?"

That is why the eval console is strategically important. It turns prompt work from opinion into measurement.

### The easiest mental model

Production workflow:

- help the agent answer this ticket

Eval workflow:

- test whether the AI system is getting better or worse overall

So the runtime product helps agents do work, while evals help the team safely improve the AI that assists those agents.

## Why Evals matter especially in this repo

This project is not just "AI writes support replies."

It is trying to show a more mature AI product pattern:

- prompts are versioned
- outputs are logged with metadata
- human approval is required
- model quality can be compared over time

That is a much stronger operating model than just calling an LLM and hoping the result looks good.

In other words, evals are the quality-control layer for the AI workflow.

## Security and tenant isolation

Another major theme in the codebase is safe data access.

The app uses:

- Better Auth in Next.js for login
- short-lived JWTs for API access
- Postgres Row-Level Security for tenant isolation

That means users should only see the tickets and knowledge they are allowed to see. Client users are intentionally restricted compared with support agents and team leads.

This matters because the product is built for multi-tenant support environments where leaking one company's data into another company's workflow would be a serious failure.

## What is actually built vs. what is planned

The implemented product is an MVP with these real surfaces:

- ticket queue
- ticket workspace
- knowledge upload and chunk viewing
- review queue
- eval console
- OpenAI-based triage, retrieval, and grounded drafting

The docs also describe a bigger V1 vision, including things like:

- incident clustering
- duplicate detection
- richer SLA logic
- multi-provider comparisons
- Temporal-based workflows

Those future ideas matter because they show where the architecture is headed, but the current codebase is mainly about proving the core support-resolution loop end to end.

## Final mental model

The best way to understand this repo is:

It is an AI co-pilot for internal support agents at a B2B software company.

Its job is to help humans resolve tickets faster by combining:

- structured triage
- knowledge retrieval
- grounded drafting
- human approval
- evaluation of prompt quality over time

If you remember one sentence, remember this:

**This system is not trying to let AI run support by itself; it is trying to make human support teams faster, safer, and more measurable.**
