# Performance Fixes

This document is meant for an agent working in a new dashboard-style codebase. Apply the items below in roughly this order. The goal is not micro-optimization. The goal is to remove the biggest causes of perceived slowness first.

## Priority Order

1. Make first render feel immediate.
2. Make first navigation to other dashboard pages feel immediate.
3. Reduce backend round-trips so cached/prefetched data is actually fast to fetch.
4. Keep stale UI visible during refetch instead of flashing empty states.

## Highest-Leverage Fixes

### 1. Server-prefetch page data and hydrate it into the client

Use server-side query prefetch plus dehydration/hydration for each important page.

Implementation pattern:

- Create a `QueryClient` on the server page.
- `prefetchQuery()` the data needed for the first visible screen.
- Wrap the client page content in `HydrationBoundary`.
- On the client, read the same query key with React Query instead of refetching from scratch.

Why this matters:

- This is the main fix for "the dashboard renders immediately after login".
- The page mounts with real data already present instead of rendering an empty shell and waiting for client-side fetches.

Apply this first to:

- dashboard home
- response-time page
- team page
- clients page
- portal or ticket list page

Rule:

- Any page that is a top-level dashboard destination should ship hydrated initial data if the user expects data to be visible immediately on first visit.

### 2. Prefetch likely next routes and their data

Prewarm both the route and the data for nearby pages.

Implementation pattern:

- Call `router.prefetch()` for likely destinations.
- Also `prefetchQuery()` the data those pages need.
- Trigger prewarm on:
  - idle after layout mount
  - nav item hover
  - nav item focus
- Skip aggressive prewarming for users on slow connections or `saveData`.

Why this matters:

- This is the main fix for "other pages render immediately the first time I visit them".
- Route prefetch alone is not enough. Data prefetch is what makes the destination feel already loaded.

Apply this to:

- sidebar navigation
- top nav tabs if present
- other high-probability next-step navigation

Rule:

- For the top 3-5 most common destinations from the dashboard shell, prefetch both code and data.

### 3. Collapse backend round-trips on hot paths

Do not optimize the UI while leaving slow query paths underneath it.

Implementation pattern:

- Combine repeated auth/session reads with request-level caching.
- Batch RLS/session setup if your DB layer requires it.
- Move expensive aggregate/reporting queries into optimized DB functions or equivalent backend endpoints.
- Replace separate `count + rows` pagination queries with a single query where possible.
- Add indexes that match real filters and sort patterns.

Why this matters:

- Prefetch and hydration only feel instant if the prefetched query itself is fast.
- This is the hidden enabler behind all the snappy behavior.

Focus areas:

- dashboard summary queries
- chart aggregation queries
- client or ticket list queries
- ticket detail queries
- paginated response-time or reporting queries

Rules:

- Avoid N+1 query patterns on any dashboard screen.
- Avoid separate round-trips for count, filters, and page data when a single query can provide all three.
- Add indexes for the combinations users actually filter by.

## Interaction-Level Fixes

### Keep previous data during refetch

Use stale-while-revalidate behavior for pagination, filters, and sorting.

Implementation pattern:

- Use `placeholderData: previousData` or the equivalent stale-data handoff in your data layer.
- Show a subtle loading signal while keeping old rows/cards visible.

Why this matters:

- The UI looks stable instead of flashing skeletons on every interaction.
- This is one of the biggest perceived-performance wins after hydration/prefetching.

Use it on:

- paginated tables
- filtered chart pages
- sortable list views

### Prefetch the next page in paginated tables

Implementation pattern:

- After page `n` loads, prefetch page `n + 1`.
- Keep page `n` visible while page `n + 1` loads.

Use it on:

- ticket lists
- overdue/resolution tables
- large admin lists

### Update URL state without forcing unnecessary route refetches

Implementation pattern:

- For filter state, prefer URL updates that do not trigger a full soft-navigation/refetch cycle unless a route change is actually needed.
- Memoize parsed filter state so query keys and effects do not churn.

Why this matters:

- Filter interactions stay cheap.
- The page avoids accidental double-fetch patterns.

## Caching Fixes

### Cache stable reference data

Cache lookup data such as:

- team members
- ticket types
- static filter options
- shared lookup tables

Rules:

- Long `staleTime` for reference data.
- Prefetch reference data in the main authenticated layout if many screens need it.

### Cache session/user context per request

Rules:

- Do not read session/user context multiple times in the same render/request if it can be cached once.
- If auth supports cookie/session caching, enable it.

### Tag or scope aggregate caches so mutations can invalidate them

Rules:

- If creating/updating tickets changes dashboard aggregates, invalidate aggregate caches after successful mutations.
- Do not disable caching globally just to avoid stale data.

## Query Composition Rules

- Use `Promise.all(...)` when independent datasets are needed for the same screen.
- If framework behavior serializes multiple calls from the same screen, consider:
  - one combined endpoint
  - one combined server action
  - one orchestrator query that loads multiple datasets in parallel server-side
- Derive secondary UI metrics from already-fetched data when possible instead of issuing a new request.

Good examples:

- compute summary-by-priority from a histogram plus one detail payload
- merge chart bins client-side from one fine-grained dataset
- filter/sort locally when the full working set is already reasonably small

## Minimal Agent Checklist

When applying performance fixes to a new codebase, do this:

1. Add server prefetch plus hydration to each top-level dashboard page.
2. Add route plus data prewarming to the main navigation.
3. Keep previous data visible during pagination/filter/sort refetches.
4. Cache reference data and session context.
5. Combine independent queries with `Promise.all(...)`.
6. Collapse hot-path backend round-trips and fix expensive query plans.
7. Add indexes for real filter/sort combinations.

## Success Criteria

You are done when:

- dashboard home shows meaningful data on first paint
- first visit to adjacent dashboard pages feels warm, not cold
- filtering/sorting/pagination does not blank the UI
- reference filters open instantly
- backend hot paths no longer make multiple unnecessary round-trips
