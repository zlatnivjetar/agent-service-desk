# API — FastAPI Backend

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
* OpenAI models: `gpt-5-mini` for classification/triage and grounded drafting, `text-embedding-3-small` for embeddings

## Key Patterns

* **Router → Schema → Query:** routes are thin, schemas define shapes, queries isolate SQL
* **Auth dependency chain:** `get\_current\_user` extracts JWT claims → `get\_rls\_db` combines auth + RLS-scoped connection
* **Provider module:** `app/providers/openai.py` — thin wrapper with `classify()`, `embed()`, `generate\_with\_tools()`
* **Pipeline modules:** `app/pipelines/{triage,drafting,retrieval,ingestion}.py` — each encapsulates one AI workflow

## Structure

```
app/
├── main.py         # FastAPI app, CORS, routers
├── config.py       # pydantic-settings Settings class
├── db.py           # psycopg ConnectionPool
├── deps.py         # get\_rls\_db dependency
├── auth.py         # JWT validation, CurrentUser
├── routers/        # HTTP endpoints
├── schemas/        # Pydantic request/response models
├── queries/        # SQL query functions
├── pipelines/      # triage, drafting, retrieval, ingestion
└── providers/      # OpenAI wrapper module
```
