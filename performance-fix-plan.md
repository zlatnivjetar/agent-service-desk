# Performance Fix Plan

Actionable plan for eliminating perceived slowness in the agent-service-desk frontend and backend. Steps are ordered by impact — do the highest-leverage items first.

---

## Current State Summary

- **All pages are `"use client"`** — no server-side prefetch or hydration. Every page mounts empty and waits for client-side fetches.
- **No route or data prefetching** — clicking a sidebar link cold-loads both code and data.
- **Paginated lists use 2 queries** (separate `COUNT(*)` + rows) in 4 endpoints.
- **Ticket detail assembles 5 separate queries** per request.
- **Ticket list uses a correlated subquery** for prediction confidence (runs per-row).
- **No `placeholderData`** — pagination/filter changes flash empty states.
- **No next-page prefetch** on pagination controls.
- **TanStack Query defaults are reasonable** (30s staleTime, 1 retry) but reference data like users list could be cached longer.
- **Missing composite indexes** for common sort patterns (workspace + created_at, workspace + updated_at).

---

## Phase 1 — Server Prefetch & Hydration (Biggest Single Win)

**Goal:** Dashboard pages render with real data on first paint instead of loading spinners.

### Step 1.1: Create a server-side query prefetch utility

Create `web/src/lib/prefetch.ts` — a helper that:
- Creates a `QueryClient` on the server
- Exposes `prefetchQuery()` with the same query keys used by client hooks
- Returns `dehydrate(queryClient)` for passing to `HydrationBoundary`

Since all API calls require a JWT (derived from the session cookie), the prefetch utility needs to:
- Read the BetterAuth session cookie from `cookies()`
- Exchange it for a JWT by calling the `/api/token` route internally (or directly minting one server-side)
- Use that JWT to call the FastAPI backend

### Step 1.2: Convert top-level pages to server components with hydration

For each page, create a **server component wrapper** that prefetches, then renders the client component inside `<HydrationBoundary>`.

**Pages to convert (in order):**

| Page | File | Prefetch queries |
|------|------|-----------------|
| Tickets list | `(app)/tickets/page.tsx` | `["tickets", defaultParams]`, `["users"]` |
| Ticket detail | `(app)/tickets/[id]/page.tsx` | `["ticket", id]` |
| Review queue | `(app)/reviews/page.tsx` | `["reviews", defaultParams]` |
| Knowledge | `(app)/knowledge/page.tsx` | `["knowledge-docs", defaultParams]` |
| Evals | `(app)/evals/page.tsx` | `["eval-sets"]`, `["eval-runs"]`, `["prompt-versions"]` |

**Pattern per page:**
```
page.tsx (server) → prefetch → <HydrationBoundary> → <ClientPage /> (existing code, moved)
```

The client component keeps its existing `useQuery` calls — they read from the hydrated cache instead of refetching.

### Step 1.3: Prefetch `current-user` in the app layout

Move the `useCurrentUser()` prefetch into `(app)/layout.tsx` (server component wrapper) so user data is available immediately on every page load. This also enables role-gated sidebar items to render without a flash.

**Files touched:**
- `web/src/lib/prefetch.ts` (new)
- `web/src/app/(app)/layout.tsx` (add server prefetch wrapper)
- `web/src/app/(app)/tickets/page.tsx` (split into server wrapper + client component)
- `web/src/app/(app)/tickets/[id]/page.tsx` (same)
- `web/src/app/(app)/reviews/page.tsx` (same)
- `web/src/app/(app)/knowledge/page.tsx` (same)
- `web/src/app/(app)/evals/page.tsx` (same)

---

## Phase 2 — Route & Data Prefetching (Instant Navigation)

**Goal:** First navigation to adjacent dashboard pages feels warm, not cold.

### Step 2.1: Prefetch likely routes on sidebar mount

In `AppSidebar`, after the sidebar mounts and user data is available:
- Call `router.prefetch()` for the top 3-4 sidebar destinations
- Respect `navigator.connection?.saveData` — skip on slow connections

### Step 2.2: Prefetch data on sidebar hover/focus

On `onMouseEnter` / `onFocus` of each sidebar nav item:
- `queryClient.prefetchQuery()` the primary data for that destination
- Use the same query keys as the page hooks so the cache is shared

**Mapping:**
| Nav item | Prefetch query keys |
|----------|-------------------|
| Tickets | `["tickets", defaultParams]` |
| Review Queue | `["reviews", defaultParams]` |
| Knowledge | `["knowledge-docs", defaultParams]` |
| Eval Console | `["eval-sets"]`, `["eval-runs"]` |

### Step 2.3: Prefetch reference data in the authenticated layout

In `(app)/layout.tsx`, prefetch stable reference data that many pages need:
- `["users"]` (workspace members — used by ticket assignee dropdowns, already 5m staleTime)

**Files touched:**
- `web/src/components/app-sidebar.tsx` (add hover/focus prefetch + idle route prefetch)
- `web/src/app/(app)/layout.tsx` (prefetch reference data)

---

## Phase 3 — Backend Query Optimization (Make Prefetch Fast)

**Goal:** Prefetch and hydration only feel instant if the underlying queries are fast.

### Step 3.1: Combine count + rows into a single query

Replace the 2-query pagination pattern with a window function:

```sql
SELECT *, COUNT(*) OVER() AS total_count
FROM tickets
WHERE ...
ORDER BY ... LIMIT %s OFFSET %s
```

This halves the query count for 4 endpoints:
- `list_tickets()` — `api/app/queries/tickets.py`
- `list_pending_drafts()` — `api/app/queries/drafts.py`
- `list_eval_examples()` — `api/app/queries/evals.py`
- `list_documents()` — `api/app/queries/knowledge.py`

Update the Python return type: extract `total_count` from the first row (or 0 if empty).

### Step 3.2: Consolidate ticket detail into fewer queries

Replace 5 separate queries in `_build_detail()` with 1-2 queries:

**Option A (recommended):** A single SQL function / CTE query that returns the ticket + messages + latest prediction + latest draft + assignments in one round-trip, using JSON aggregation:

```sql
WITH ticket AS (SELECT ... FROM tickets WHERE id = %s),
     msgs AS (SELECT json_agg(...) FROM ticket_messages WHERE ticket_id = %s ORDER BY created_at),
     pred AS (SELECT ... FROM ticket_predictions WHERE ticket_id = %s ORDER BY created_at DESC LIMIT 1),
     draft AS (SELECT ... FROM draft_generations WHERE ticket_id = %s ORDER BY created_at DESC LIMIT 1),
     assigns AS (SELECT json_agg(...) FROM ticket_assignments WHERE ticket_id = %s)
SELECT t.*, msgs.messages, pred.*, draft.*, assigns.assignments
FROM ticket t, msgs, pred, draft, assigns
```

**Option B (simpler):** Use `Promise.all`-style parallelism in Python — but psycopg3 sync driver doesn't support concurrent queries on a single connection, so this requires a pipeline or multiple connections. Less practical.

Go with Option A.

### Step 3.3: Replace correlated subquery with a lateral join or window function

In `_TICKET_SELECT`, replace the correlated subquery for prediction confidence:

```sql
-- Before (correlated, runs per row):
(SELECT tp.confidence FROM ticket_predictions tp WHERE tp.ticket_id = t.id ORDER BY tp.created_at DESC LIMIT 1)

-- After (lateral join, single pass):
LEFT JOIN LATERAL (
  SELECT confidence FROM ticket_predictions WHERE ticket_id = t.id ORDER BY created_at DESC LIMIT 1
) tp ON true
```

Or use `DISTINCT ON`:
```sql
LEFT JOIN (
  SELECT DISTINCT ON (ticket_id) ticket_id, confidence
  FROM ticket_predictions ORDER BY ticket_id, created_at DESC
) tp ON tp.ticket_id = t.id
```

### Step 3.4: Add missing composite indexes

```sql
-- Ticket list sorted by created_at (most common default sort)
CREATE INDEX idx_tickets_workspace_created ON tickets (workspace_id, created_at DESC);

-- Ticket list sorted by updated_at
CREATE INDEX idx_tickets_workspace_updated ON tickets (workspace_id, updated_at DESC);

-- Prediction confidence lookup (support lateral join / correlated subquery)
CREATE INDEX idx_ticket_predictions_ticket_created ON ticket_predictions (ticket_id, created_at DESC);

-- Draft lookup by ticket (support latest-draft query)
CREATE INDEX idx_draft_generations_ticket_created ON draft_generations (ticket_id, created_at DESC);
```

### Step 3.5: Add a combined dashboard endpoint (optional, high value)

Create `GET /tickets/dashboard` that returns both stats and the first page of tickets in one response:

```python
@router.get("/tickets/dashboard")
def get_dashboard(db, user):
    stats = q.get_ticket_stats(db)
    total, tickets = q.list_tickets(db, page=1, per_page=25)
    return {"stats": stats, "tickets": tickets, "total": total}
```

This eliminates 1 round-trip on dashboard load (currently stats + tickets = 2 separate API calls, though stats isn't currently fetched on the tickets page, this would be useful if/when a dashboard summary page is added).

**Files touched:**
- `api/app/queries/tickets.py` (rewrite list_tickets, consolidate ticket detail, fix subquery)
- `api/app/queries/drafts.py` (combine count + rows)
- `api/app/queries/evals.py` (combine count + rows)
- `api/app/queries/knowledge.py` (combine count + rows)
- `api/app/routers/tickets.py` (update _build_detail, optionally add dashboard endpoint)
- `seed/schema.sql` (add new indexes)

---

## Phase 4 — Client-Side Interaction Performance

**Goal:** Filtering, sorting, and pagination never blank the UI.

### Step 4.1: Add `placeholderData: keepPreviousData` to paginated queries

In every hook that supports pagination/filtering:
- `useTickets()` — keep previous ticket rows visible while fetching new page/filter
- `useReviewQueue()` — keep previous reviews visible
- `useKnowledgeDocs()` — keep previous docs visible

```ts
import { keepPreviousData } from "@tanstack/react-query";

useQuery({
  queryKey: ["tickets", params],
  queryFn: ...,
  placeholderData: keepPreviousData,
});
```

Add a subtle loading indicator (e.g., opacity reduction or top progress bar) while `isFetching && isPlaceholderData` is true.

### Step 4.2: Prefetch next page on paginated tables

After page `n` loads, prefetch page `n+1`:

```ts
// In useTickets or the page component
useEffect(() => {
  if (data && page < Math.ceil(data.total / perPage)) {
    queryClient.prefetchQuery({
      queryKey: ["tickets", { ...params, page: page + 1 }],
      queryFn: () => fetchTickets({ ...params, page: page + 1 }),
    });
  }
}, [data, page]);
```

Apply to: ticket list, review queue, knowledge docs.

### Step 4.3: Memoize filter state to prevent query key churn

In `useTicketFilters()`, ensure the returned params object is memoized so that identity-stable query keys don't cause unnecessary refetches:

```ts
const params = useMemo(() => ({
  status, priority, category, team, page, sort_by, sort_order,
}), [status, priority, category, team, page, sort_by, sort_order]);
```

If this is already the case, verify. If `useSearchParams()` returns a new object on every render, the query key will churn.

**Files touched:**
- `web/src/hooks/use-tickets.ts` (placeholderData, next-page prefetch)
- `web/src/hooks/use-review-queue.ts` (placeholderData)
- `web/src/hooks/use-knowledge.ts` (placeholderData)
- `web/src/hooks/use-ticket-filters.ts` (memoize params)
- `web/src/app/(app)/tickets/page.tsx` (subtle loading indicator for placeholder state)

---

## Phase 5 — Caching Improvements

**Goal:** Reference data loads instantly; mutations invalidate cleanly.

### Step 5.1: Increase staleTime for stable reference data

| Query | Current staleTime | Target staleTime | Reason |
|-------|-------------------|-------------------|--------|
| `["users"]` | 5 min | 10 min | Users rarely change within a session |
| `["eval-sets"]` | 30s (default) | 5 min | Eval sets are stable reference data |
| `["prompt-versions"]` | 30s (default) | 5 min | Prompt versions rarely change |
| `["current-user"]` | 30s (default) | Infinity | User's own profile doesn't change mid-session; invalidate on logout |

### Step 5.2: Ensure mutations invalidate aggregate caches

When a ticket is updated (status, priority change) and a stats/dashboard endpoint exists, invalidate `["tickets-stats"]` too. Currently mutations invalidate ticket detail — extend to include any summary queries.

### Step 5.3: Derive secondary metrics from existing data

If the frontend needs ticket counts by status for sidebar badges or summary cards, compute them from the already-fetched ticket list (if the full set is small enough) rather than issuing a separate API call.

**Files touched:**
- `web/src/hooks/use-users.ts` (increase staleTime)
- `web/src/hooks/use-evals.ts` (increase staleTime for sets/versions)
- `web/src/hooks/use-current-user.ts` (set staleTime to Infinity)
- Various mutation hooks (extend invalidation)

---

## Phase 6 — Additional Backend Optimizations

### Step 6.1: Add connection pool timeout

In `api/app/db.py`, add a connection timeout to prevent indefinite hangs:

```python
pool = ConnectionPool(
    conninfo=settings.database_url,
    min_size=1,
    max_size=10,
    open=False,
    timeout=10,  # seconds to wait for a connection
    check=_check_connection,
    kwargs={"row_factory": dict_row},
)
```

### Step 6.2: Consider reducing health check frequency

The current `check=_check_connection` runs `SELECT 1` on every connection reuse. For Neon (which may drop idle connections), this is reasonable but adds ~1ms per query. If latency is tight, consider a max-age-based check instead.

### Step 6.3: Batch RLS session setup

Currently `get_rls_db()` runs 5 `SET LOCAL` / `set_config` calls per request. These are already within a single transaction, but could be combined into a single `SELECT set_config(...), set_config(...), ...` call to reduce round-trips.

---

## Implementation Order Summary

| # | Phase | Estimated Complexity | Impact |
|---|-------|---------------------|--------|
| 1 | Server prefetch & hydration | Medium-High | Eliminates loading spinners on first paint |
| 2 | Route & data prefetching | Low-Medium | Instant sidebar navigation |
| 3 | Backend query optimization | Medium | Halves query count, 5→1 detail queries |
| 4 | Client interaction performance | Low | No more blank flashes on filter/page |
| 5 | Caching improvements | Low | Reference data always instant |
| 6 | Additional backend optimizations | Low | Connection resilience, minor latency |

---

## Success Criteria

- [ ] Dashboard tickets page shows real data on first paint (no loading spinner)
- [ ] First navigation to Reviews/Knowledge/Evals feels warm
- [ ] Pagination does not blank the UI — old rows stay visible
- [ ] Filter changes do not blank the UI
- [ ] Ticket detail loads in a single API round-trip
- [ ] Paginated list endpoints use 1 query instead of 2
- [ ] Reference data (users, eval sets) loads instantly from cache
- [ ] Backend hot paths have proper composite indexes
