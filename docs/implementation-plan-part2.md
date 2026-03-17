# Agent Service Desk — Implementation Plan (Part 2)

**Location:** `docs/implementation-plan-part2.md` (inside the repo — Claude Code reads it automatically)
**Scope:** Milestones 4–6 (Frontend Surfaces, Eval System, Demo Readiness)
**Depends on:** Part 1 (Milestones 1–3) fully implemented — all API endpoints, AI pipelines, auth, and RLS are live.

\---

## Pre-Implementation: Design System Generation

Before starting Milestone 4A, generate the project's design system using the ui-ux-pro-max skill. This is a **one-time setup step** that produces `design-system/MASTER.md` — the single source of truth for colors, typography, spacing, component patterns, and accessibility standards.

Run this from the repo root:

```bash
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "B2B SaaS support dashboard professional" --design-system --persist -p "Agent Service Desk"
```

Then generate page-specific overrides for each major surface:

```bash
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "ticket queue list filtering sorting" --design-system --persist -p "Agent Service Desk" --page "ticket-queue"
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "ticket detail workspace messages evidence citations" --design-system --persist -p "Agent Service Desk" --page "ticket-workspace"
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "review queue approval actions draft" --design-system --persist -p "Agent Service Desk" --page "review-queue"
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "knowledge upload document management" --design-system --persist -p "Agent Service Desk" --page "knowledge-upload"
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "evaluation console metrics comparison charts" --design-system --persist -p "Agent Service Desk" --page "eval-console"
```

**After generation, read `design-system/MASTER.md` and every page override before implementing any milestone.** The MASTER.md is authoritative — all component decisions (colors, radius, typography, spacing, shadows, animation durations) must come from it, not from ad-hoc choices.

\---

## How to use each sub-milestone with Claude Code

Same as Part 1 — each sub-milestone is a self-contained work order:

1. Make sure Claude Code has access to your repo
2. Paste the sub-milestone content directly as your prompt
3. The work order IS the plan — no need to "plan first"
4. After Claude Code finishes, verify the "Done when" checklist manually

**Important:** Every sub-milestone must read `design-system/MASTER.md` (and the relevant page override if one exists) at the start of implementation. The design system is the source of truth for all visual decisions.

\---

## Existing API Endpoints (for reference)

These endpoints are implemented and tested. Frontend code calls them via `apiClient` from `web/src/lib/api-client.ts`.

| Method | Path | Auth | Description |
|-|-|-|-|
| GET | `/health` | None | Health check |
| GET | `/auth/me` | Bearer | Current user info |
| GET | `/tickets` | Bearer | Paginated ticket list (filters: status, priority, assignee_id, category, team, sort_by, sort_order) |
| GET | `/tickets/{id}` | Bearer | Ticket detail (messages, prediction, draft, assignments) |
| PATCH | `/tickets/{id}` | Bearer | Update ticket fields |
| POST | `/tickets/{id}/messages` | Bearer | Add message |
| POST | `/tickets/{id}/assign` | Bearer | Assign ticket |
| POST | `/tickets/{id}/triage` | Bearer | Run triage pipeline (agent/lead only) |
| POST | `/tickets/{id}/draft` | Bearer | Generate draft (agent/lead only) |
| POST | `/tickets/{id}/redraft` | Bearer | Re-generate draft (agent/lead only) |
| GET | `/knowledge/documents` | Bearer | List knowledge docs (filters: status, visibility) |
| GET | `/knowledge/documents/{id}` | Bearer | Doc detail with chunks |
| POST | `/knowledge/documents` | Bearer | Upload document (multipart: title, visibility, file) |
| DELETE | `/knowledge/documents/{id}` | Bearer | Delete document |
| GET | `/knowledge/search?q=...&top_k=5` | Bearer | Semantic search |
| GET | `/drafts/review-queue` | Bearer | Pending drafts queue (agent/lead only) |
| POST | `/drafts/{id}/review` | Bearer | Approve/reject/escalate draft (agent/lead only) |
| GET | `/eval/sets` | Bearer | List eval sets (lead only) |
| GET | `/eval/sets/{id}` | Bearer | Eval set detail with examples (lead only) |
| GET | `/eval/sets/{id}/examples` | Bearer | Paginated examples (lead only) |
| POST | `/eval/runs` | Bearer | Create eval run (lead only) |
| GET | `/eval/runs` | Bearer | List eval runs (lead only) |
| GET | `/eval/runs/{id}` | Bearer | Run detail with results (lead only) |
| GET | `/eval/runs/compare?run_a_id=...&run_b_id=...` | Bearer | Compare two runs (lead only) |
| GET | `/prompt-versions` | Bearer | List prompt versions |
| GET | `/debug/tickets/count` | Bearer | Debug: ticket count |
| GET | `/debug/messages/count` | Bearer | Debug: message count |
| GET | `/debug/knowledge/count` | Bearer | Debug: knowledge count |

\---

## Existing Pydantic Response Shapes (for TypeScript type mirroring)

When defining TypeScript interfaces in the frontend, mirror these shapes exactly:

**`TicketListItem`:** `id`, `subject`, `status`, `priority`, `category?`, `team?`, `assignee_id?`, `assignee_name?`, `org_name?`, `confidence?`, `sla_policy_name?`, `created_at`, `updated_at`

**`TicketDetail`** (extends TicketListItem): `messages[]`, `latest_prediction?`, `latest_draft?`, `assignments[]`

**`TicketMessage`:** `id`, `sender_id?`, `sender_name?`, `sender_type`, `body`, `is_internal`, `created_at`

**`TicketPrediction`:** `id`, `predicted_category?`, `predicted_priority?`, `predicted_team?`, `escalation_suggested`, `escalation_reason?`, `confidence`, `created_at`

**`TicketDraft`:** `id`, `body`, `evidence_chunk_ids[]`, `confidence`, `unresolved_questions?[]`, `send_ready`, `approval_outcome?`, `created_at`

**`DraftQueueItem`:** `draft_generation_id`, `ticket_id`, `ticket_subject`, `body` (truncated), `confidence`, `approval_outcome?`, `time_since_generation`, `created_at`

**`KnowledgeDocListItem`:** `id`, `title`, `source_filename?`, `content_type?`, `visibility`, `status`, `created_at`

**`KnowledgeDocDetail`** (extends list item): `chunks[]`

**`KnowledgeSearchResult`:** `chunk_id`, `document_id`, `document_title`, `content`, `similarity`, `chunk_index`

**`EvalSetListItem`:** `id`, `name`, `description?`, `example_count`, `created_at`

**`EvalRunListItem`:** `id`, `eval_set_id`, `eval_set_name`, `prompt_version_id`, `prompt_version_name`, `status`, `total_examples`, `passed`, `failed`, `metrics?`, `created_at`, `completed_at?`

**`EvalRunDetail`** (extends list item): `results[]`

**`EvalResult`:** `id`, `eval_example_id`, `passed`, `model_output`, `expected_output?`, `notes?`

**`PaginatedResponse`:** `items[]`, `total`, `page`, `per_page`, `total_pages`

\---

## Existing Frontend Infrastructure

Already built and working:

- **`web/src/lib/api-client.ts`** — `apiClient.get<T>()`, `.post<T>()`, `.patch<T>()`, `.del()` with JWT auto-refresh
- **`web/src/lib/auth-client.ts`** — BetterAuth browser client (`authClient.signIn.email()`)
- **`web/src/lib/auth.ts`** — BetterAuth server instance with pg pool
- **`web/src/lib/utils.ts`** — `cn()` utility (clsx + tailwind-merge)
- **`web/src/proxy.ts`** — Auth guard: redirects unauthenticated users to `/login`, authenticated users away from `/login`
- **`web/src/app/api/auth/[...all]/route.ts`** — BetterAuth catch-all handler
- **`web/src/app/api/token/route.ts`** — JWT minting (reads BetterAuth session, joins to users/memberships, returns JWT)
- **`web/src/app/login/page.tsx`** — Login form (email/password)
- **`web/src/app/page.tsx`** — Redirects to `/tickets`
- **`web/src/components/ui/button.tsx`** — shadcn Button (CVA variants: default, outline, secondary, ghost, destructive, link; sizes: xs, sm, default, lg, icon, icon-xs, icon-sm, icon-lg)
- **`web/src/app/globals.css`** — Full design token system: oklch colors, radius scale, sidebar tokens, chart colors, dark mode
- **`web/components.json`** — shadcn config: style=base-nova, rsc=true, icon=lucide, baseColor=neutral

Dependencies installed: Next.js 16.1.6, React 19.2.3, `@tanstack/react-query` 5.x, `better-auth` 1.5.x, `zod` 4.x, `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`, `tw-animate-css`, `jose`, `shadcn` 4.x, `@base-ui/react`.

\---

## Milestone 4 — Frontend Surfaces

**Goal:** All five product surfaces from the MVP spec (ticket queue, ticket workspace, review queue, knowledge upload, eval console) implemented as working pages with real data from the API.

\---

### Milestone 4A: App Shell, Layout & Navigation

**Paste this into Claude Code:**

> Build the application shell — the persistent layout that wraps all authenticated pages. This includes the sidebar, header, main content area, and TanStack Query provider.
>
> **Read `design-system/MASTER.md` first. All visual decisions (colors, spacing, radius, typography) come from there.**
>
> **Step 1: Install required shadcn components**
>
> Run these commands from `web/`:
> ```bash
> npx shadcn@latest add sidebar
> npx shadcn@latest add separator
> npx shadcn@latest add tooltip
> npx shadcn@latest add avatar
> npx shadcn@latest add dropdown-menu
> npx shadcn@latest add badge
> npx shadcn@latest add skeleton
> ```
>
> **Step 2: Create TypeScript types**
>
> Create `web/src/types/api.ts` — shared TypeScript interfaces mirroring the FastAPI Pydantic schemas. These are used across all pages:
>
> ```typescript
> // Mirror every Pydantic model from the API exactly.
> // Use the "Existing Pydantic Response Shapes" section of the implementation plan
> // as the source of truth for field names and types.
> //
> // Include at minimum:
> //   TicketListItem, TicketDetail, TicketMessage, TicketPrediction,
> //   TicketDraft, TicketAssignment, DraftQueueItem, ApprovalRequest,
> //   KnowledgeDocListItem, KnowledgeDocDetail, KnowledgeChunk,
> //   KnowledgeSearchResult, EvalSetListItem, EvalSetDetail,
> //   EvalRunListItem, EvalRunDetail, EvalResult, EvalComparison,
> //   MetricDiff, PromptVersion, PaginatedResponse, CurrentUser
> //
> // All UUID fields are `string` in TypeScript.
> // All datetime fields are `string` (ISO 8601 from the API).
> // Optional fields use `field?: type | null`.
> ```
>
> **Step 3: Create TanStack Query provider**
>
> Create `web/src/components/providers.tsx`:
> ```typescript
> "use client"
>
> import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
> import { useState } from "react"
>
> export function Providers({ children }: { children: React.ReactNode }) {
>   const [queryClient] = useState(
>     () =>
>       new QueryClient({
>         defaultOptions: {
>           queries: {
>             staleTime: 30 * 1000,    // 30s — avoids refetching on every mount
>             retry: 1,
>           },
>         },
>       })
>   )
>
>   return (
>     <QueryClientProvider client={queryClient}>
>       {children}
>     </QueryClientProvider>
>   )
> }
> ```
>
> **Step 4: Create the user context hook**
>
> Create `web/src/hooks/use-current-user.ts`:
> - Export a `useCurrentUser()` hook that calls `apiClient.get<CurrentUser>("/auth/me")` via `useQuery` with key `["current-user"]`
> - The `CurrentUser` type has: `user_id: string`, `org_id: string`, `workspace_id: string`, `role: string`
> - This hook is used by the sidebar to show role-based navigation
>
> **Step 5: Create the sidebar component**
>
> Create `web/src/components/app-sidebar.tsx`:
> - Use the shadcn `Sidebar` primitives: `Sidebar`, `SidebarContent`, `SidebarGroup`, `SidebarGroupLabel`, `SidebarGroupContent`, `SidebarMenu`, `SidebarMenuItem`, `SidebarMenuButton`, `SidebarHeader`, `SidebarFooter`
> - **Header section:** App name "Agent Service Desk" with a small logo placeholder (a `<div>` with bg-primary and rounded-md, 8x8, containing initials "SD")
> - **Main navigation group** (label: "Workspace"):
>   - Tickets → `/tickets` (icon: `Inbox` from lucide-react)
>   - Review Queue → `/reviews` (icon: `ClipboardCheck` from lucide-react)
>   - Knowledge → `/knowledge` (icon: `BookOpen` from lucide-react)
> - **Admin navigation group** (label: "Admin") — **only visible when `role === "team_lead"`**:
>   - Eval Console → `/evals` (icon: `FlaskConical` from lucide-react)
> - **Footer section:**
>   - Show current user avatar (fallback to initials), user name, and role as a Badge
>   - DropdownMenu on the footer with a single "Sign out" option that calls `authClient.signOut()` and redirects to `/login`
> - Use `usePathname()` from `next/navigation` to highlight the active nav item
> - Client User role: show only "Tickets" in the navigation (no Review Queue, no Knowledge, no Eval Console)
>
> **Step 6: Create the app layout**
>
> Create `web/src/app/(app)/layout.tsx` — this is the **route group** layout that wraps all authenticated pages:
>
> ```typescript
> // This layout provides:
> // 1. The Providers wrapper (TanStack Query)
> // 2. The SidebarProvider + Sidebar
> // 3. The main content area with SidebarInset
> // 4. A top header bar inside SidebarInset with:
> //    - SidebarTrigger (hamburger to collapse/expand sidebar)
> //    - Separator
> //    - Breadcrumb showing current page name
> ```
>
> Structure:
> ```
> web/src/app/(app)/
> ├── layout.tsx        ← the shell layout
> ├── tickets/
> │   └── page.tsx      ← ticket queue (4B)
> │   └── [id]/
> │       └── page.tsx  ← ticket workspace (4C)
> ├── reviews/
> │   └── page.tsx      ← review queue (4D)
> ├── knowledge/
> │   └── page.tsx      ← knowledge upload (4E)
> └── evals/
>     └── page.tsx      ← eval console (5B)
> ```
>
> For now, create placeholder `page.tsx` files in each route folder that return a simple `<h1>` with the page name (e.g., "Ticket Queue", "Review Queue", etc.). These will be implemented in subsequent milestones.
>
> **Step 7: Update root layout**
>
> Update `web/src/app/layout.tsx`:
> - Change the `<title>` from "Create Next App" to "Agent Service Desk"
> - Change the description to "AI-assisted support ticket resolution"
> - The root layout should NOT include the Providers wrapper — that goes in the `(app)` layout only (login page doesn't need TanStack Query)
>
> **Step 8: Move existing routes**
>
> - Move `web/src/app/page.tsx` (the redirect to `/tickets`) — this file should stay at the root since it redirects into the `(app)` group
> - The login page stays at `web/src/app/login/page.tsx` (outside the `(app)` group, so it doesn't get the sidebar)
>
> **Step 9: Install shadcn breadcrumb**
>
> ```bash
> npx shadcn@latest add breadcrumb
> ```
>
> Create `web/src/components/page-breadcrumb.tsx`:
> - Reads the current pathname and converts it to a breadcrumb trail
> - `/tickets` → "Tickets"
> - `/tickets/[id]` → "Tickets" / "Ticket Detail"
> - `/reviews` → "Review Queue"
> - `/knowledge` → "Knowledge"
> - `/evals` → "Eval Console"

**Done when:**

* `npm run build` succeeds with zero TypeScript errors
* `http://localhost:3000/tickets` shows the sidebar with navigation and a "Ticket Queue" placeholder heading
* Sidebar highlights the correct nav item based on the current URL
* Login as `lead@demo.com` — all 4 nav items visible (Tickets, Review Queue, Knowledge, Eval Console)
* Login as `agent@demo.com` — 3 nav items visible (Tickets, Review Queue, Knowledge)
* Login as `client@demo.com` — only 1 nav item visible (Tickets)
* Sign out button works: clears session, redirects to `/login`
* Login page does NOT show the sidebar
* Browser navigating directly to `/reviews` works without a full page reload (client-side navigation)

\---

### Milestone 4B: Ticket Queue Page

**Paste this into Claude Code:**

> Implement the ticket queue — a filterable, sortable, paginated table of tickets. This is the landing page after login.
>
> **Read `design-system/MASTER.md` and `design-system/pages/ticket-queue.md` first.**
>
> **Step 1: Install required shadcn components**
>
> ```bash
> npx shadcn@latest add table
> npx shadcn@latest add select
> npx shadcn@latest add input
> npx shadcn@latest add card
> ```
>
> **Step 2: Create the ticket query hook**
>
> Create `web/src/hooks/use-tickets.ts`:
>
> ```typescript
> // Hook: useTickets(params)
> // Wraps: apiClient.get<PaginatedResponse<TicketListItem>>("/tickets", { params })
> // Query key: ["tickets", params]
> //
> // The params object includes all filter/sort/pagination values:
> //   page, per_page, status, priority, assignee_id, category, team, sort_by, sort_order
> //
> // Build the query string by iterating over params and appending non-null values:
> //   const searchParams = new URLSearchParams()
> //   Object.entries(params).forEach(([key, value]) => {
> //     if (value != null) searchParams.set(key, String(value))
> //   })
> //   return apiClient.get<PaginatedResponse>(`/tickets?${searchParams}`)
> ```
>
> **Step 3: Create URL-synced filter state**
>
> Create `web/src/hooks/use-ticket-filters.ts`:
> - Uses `useSearchParams()` from `next/navigation` to read current URL query params
> - Uses `useRouter()` to push updated params when filters change
> - Returns an object: `{ filters, setFilter, clearFilters, sortBy, sortOrder, setSorting, page, setPage }`
> - Default values: `page=1`, `per_page=25`, `sort_by="created_at"`, `sort_order="desc"`, all filters null
> - When any filter changes, reset `page` to 1
> - When changing pages, preserve all other params
> - All state lives in the URL — no `useState` for filter values
>
> **Step 4: Build the ticket queue page**
>
> Replace `web/src/app/(app)/tickets/page.tsx` with the full implementation:
>
> **Page header area:**
> - Title: "Tickets" (h1)
> - Subtitle: total count from API response (e.g., "337 tickets")
>
> **Filter bar** (horizontal row of Select dropdowns + clear button):
> - Status filter: Select with options from the `ticket_status` enum: `new`, `open`, `pending_customer`, `pending_internal`, `resolved`, `closed`. Placeholder: "All statuses"
> - Priority filter: Select with options: `low`, `medium`, `high`, `critical`. Placeholder: "All priorities"
> - Category filter: Select with options from `ticket_category` enum: `billing`, `bug_report`, `feature_request`, `account_access`, `integration`, `api_issue`, `onboarding`, `data_export`. Placeholder: "All categories"
> - Team filter: Select with options from `team_name` enum: `general_support`, `billing_team`, `engineering`, `integrations`, `onboarding`, `account_management`. Placeholder: "All teams"
> - "Clear filters" button (ghost variant) — only visible when any filter is active
>
> **Ticket table** (shadcn Table):
> - Columns: Subject, Status, Priority, Category, Assignee, Org, Confidence, Created
> - Subject column: truncate to ~60 chars, link to `/tickets/[id]`
> - Status column: Badge with variant mapping:
>   - `new` → default
>   - `open` → secondary (or a blue-toned custom variant)
>   - `pending_customer` → outline
>   - `pending_internal` → outline
>   - `resolved` → success (green) — add this as a custom `--color-success` token if not already in globals.css: `oklch(0.627 0.194 149.214)` light, `oklch(0.765 0.177 163.223)` dark
>   - `closed` → muted
> - Priority column: Badge with color:
>   - `low` → muted
>   - `medium` → secondary
>   - `high` → warning (amber) — add `--color-warning` token: `oklch(0.769 0.188 70.08)` light, `oklch(0.828 0.189 84.429)` dark
>   - `critical` → destructive
> - Category column: formatted with underscores replaced by spaces, title-cased
> - Assignee column: name or "Unassigned" in muted text
> - Org column: `org_name`
> - Confidence column: display as percentage (e.g., `0.87` → "87%"), muted if null
> - Created column: relative time (e.g., "2h ago", "3d ago"). Use a simple `formatRelativeTime()` helper — do not install a date library; write a small utility function that handles seconds/minutes/hours/days
> - Sortable columns: clicking "Created", "Priority", or "Status" column headers toggles sort_by/sort_order in the URL
> - Show a sort indicator arrow (ChevronUp/ChevronDown from lucide) on the active sort column
>
> **Pagination** (below the table):
> - Show: "Page X of Y" with Previous/Next buttons
> - Disable Previous on page 1, disable Next on last page
> - Buttons use the Button component (variant="outline", size="sm")
>
> **Loading state:**
> - While `useTickets` is loading, show a Skeleton in place of each table row (5 skeleton rows)
> - Use the shadcn `Skeleton` component
>
> **Empty state:**
> - If the API returns 0 tickets for the current filters, show a centered message: "No tickets match your filters" with a "Clear filters" button
>
> **Row click behavior:**
> - Clicking anywhere on a table row navigates to `/tickets/[id]` (use `router.push()`)
> - Add `cursor-pointer` and `hover:bg-muted/50` to each row

**Done when:**

* `npm run build` succeeds with zero TypeScript errors
* `http://localhost:3000/tickets` shows the ticket table with data from the API
* All 337 tickets (for agent@demo.com) are accessible via pagination (14 pages of 25)
* Selecting "Status: open" filter → URL changes to `?status=open`, table shows only open tickets, total count updates
* Selecting a second filter (e.g., priority=high) → URL is `?status=open&priority=high`, both filters applied
* "Clear filters" resets to all tickets
* Clicking "Created" column header → URL changes to `?sort_by=created_at&sort_order=asc`, rows reorder
* Clicking "Created" again → `sort_order=desc`
* Page 2 button → URL changes to `?page=2`, next 25 tickets shown
* Clicking a ticket row navigates to `/tickets/[id]`
* Loading state shows skeleton rows before data arrives
* Refreshing the page with `?status=open&page=2` in the URL restores the exact filter state (URL is the source of truth)
* Login as client@demo.com — same page works, but shows only that org's tickets

\---

### Milestone 4C: Ticket Workspace Page

**Paste this into Claude Code:**

> Implement the ticket workspace — the single-ticket resolution surface. This is the hero surface of the project. It shows the message thread, triage prediction, evidence panel, AI draft, and action buttons.
>
> **Read `design-system/MASTER.md` and `design-system/pages/ticket-workspace.md` first.**
>
> **Step 1: Install required shadcn components**
>
> ```bash
> npx shadcn@latest add tabs
> npx shadcn@latest add textarea
> npx shadcn@latest add dialog
> npx shadcn@latest add scroll-area
> npx shadcn@latest add alert
> ```
>
> **Step 2: Create the ticket detail query hook**
>
> Create `web/src/hooks/use-ticket-detail.ts`:
>
> ```typescript
> // Hook: useTicketDetail(ticketId: string)
> // Wraps: apiClient.get<TicketDetail>(`/tickets/${ticketId}`)
> // Query key: ["ticket", ticketId]
> //
> // Also create mutation hooks in this file:
> //
> // useUpdateTicket(ticketId) — PATCH /tickets/{id}
> //   onSuccess: invalidate ["ticket", ticketId]
> //
> // useAddMessage(ticketId) — POST /tickets/{id}/messages
> //   onSuccess: invalidate ["ticket", ticketId]
> //
> // useAssignTicket(ticketId) — POST /tickets/{id}/assign
> //   onSuccess: invalidate ["ticket", ticketId]
> //
> // useTriageTicket(ticketId) — POST /tickets/{id}/triage
> //   onSuccess: invalidate ["ticket", ticketId]
> //
> // useGenerateDraft(ticketId) — POST /tickets/{id}/draft
> //   onSuccess: invalidate ["ticket", ticketId]
> //
> // useRedraft(ticketId) — POST /tickets/{id}/redraft
> //   onSuccess: invalidate ["ticket", ticketId]
> //
> // useReviewDraft(draftId) — POST /drafts/{draftId}/review
> //   onSuccess: invalidate ["ticket", ticketId] AND ["reviews"]
> ```
>
> **Step 3: Build the page layout**
>
> Replace `web/src/app/(app)/tickets/[id]/page.tsx`:
>
> The page uses a two-column layout on desktop (≥1024px) and stacked on mobile:
>
> ```
> ┌─────────────────────────────────┬──────────────────────────┐
> │  LEFT COLUMN (flex-1)           │  RIGHT COLUMN (w-[400px])│
> │                                 │                          │
> │  Ticket Header                  │  Triage Panel            │
> │  Message Thread                 │  Evidence Panel          │
> │  Reply Box                      │  Draft Panel             │
> │                                 │  Actions                 │
> └─────────────────────────────────┴──────────────────────────┘
> ```
>
> On mobile (<1024px), the right column stacks below the left column.
>
> **Step 4: Ticket Header component**
>
> Create `web/src/components/ticket/ticket-header.tsx`:
> - Subject as h1
> - Row of metadata badges: status, priority, category, team
> - Assignee info: avatar + name, or "Unassigned" with an "Assign" button
> - SLA badge (static, based on priority): Critical → "SLA: 1h", High → "SLA: 4h", Medium → "SLA: 8h", Low → "SLA: 24h"
> - Org name in muted text
> - Created/Updated timestamps in muted text
>
> **Step 5: Message Thread component**
>
> Create `web/src/components/ticket/message-thread.tsx`:
> - Renders `ticket.messages` as a vertical thread
> - Each message shows:
>   - Sender avatar (or initials fallback) + name + sender_type Badge (customer / agent / system)
>   - Timestamp (relative format)
>   - Message body (preserve whitespace with `whitespace-pre-wrap`)
>   - If `is_internal === true`: show with a subtle yellow/amber left border and an "Internal" badge (only visible to agent/lead — but the API already handles RLS filtering, so just render what's returned)
> - Messages are ordered chronologically (oldest first — the API already returns them this way)
> - Wrap in a ScrollArea with max height of `calc(100vh - 300px)` on desktop
> - Auto-scroll to the bottom when the thread loads
>
> **Step 6: Reply Box component**
>
> Create `web/src/components/ticket/reply-box.tsx`:
> - Textarea for composing a message
> - Checkbox: "Internal note" (only visible when `role !== "client_user"`)
> - "Send" button that calls `useAddMessage` mutation
> - Disable the button and show "Sending…" while the mutation is pending
> - Clear the textarea on success
> - Show error text below the textarea if the mutation fails
>
> **Step 7: Triage Panel component**
>
> Create `web/src/components/ticket/triage-panel.tsx`:
> - Card with title "AI Triage"
> - If `ticket.latest_prediction` exists:
>   - Predicted category (Badge)
>   - Predicted priority (Badge with color matching the queue page convention)
>   - Predicted team (Badge)
>   - Confidence (progress bar or percentage display with color: green ≥0.8, amber 0.5–0.79, red <0.5)
>   - Escalation: if `escalation_suggested === true`, show Alert with `escalation_reason`
> - If no prediction:
>   - Show "Not triaged yet" message
>   - "Run Triage" button (calls `useTriageTicket` mutation)
>   - Only visible to `support_agent` and `team_lead` roles
> - While triage is running, show a loading spinner on the button
>
> **Step 8: Evidence Panel component**
>
> Create `web/src/components/ticket/evidence-panel.tsx`:
> - Card with title "Retrieved Evidence"
> - If `ticket.latest_draft` exists and has `evidence_chunk_ids`:
>   - For MVP, display the evidence_chunk_ids as a numbered list of chunk references
>   - Each shows: document title, chunk index, a snippet of the content (if the draft response includes evidence_chunks — the `DraftGenerationResponse` schema has this field, but `TicketDraft` doesn't; see note below)
> - If no draft/evidence: show "No evidence retrieved yet" in muted text
>
> **Important note on evidence display:** The `GET /tickets/{id}` endpoint returns `latest_draft` as `TicketDraft`, which only contains `evidence_chunk_ids` (a list of UUIDs), not the full chunk content. The full `DraftGenerationResponse` (with `evidence_chunks[]`) is only returned from `POST /tickets/{id}/draft` and `POST /tickets/{id}/redraft`.
>
> To show evidence content for previously generated drafts, the implementation should:
> 1. After a successful draft/redraft mutation, store the `evidence_chunks` array from the response in local component state
> 2. For page loads where a draft already exists, show "X evidence chunks referenced" with chunk IDs rather than full content (or optionally add a new API endpoint in a future enhancement)
>
> **Step 9: Draft Panel component**
>
> Create `web/src/components/ticket/draft-panel.tsx`:
> - Card with title "AI Draft"
> - If `ticket.latest_draft` exists:
>   - Draft body rendered with `whitespace-pre-wrap`
>   - Confidence badge (same color logic as triage panel)
>   - `send_ready` status: green checkmark if true, amber warning if false
>   - If `unresolved_questions` exists and is non-empty, show them as a bulleted list under an "Unresolved Questions" sub-heading
>   - Approval status badge if `approval_outcome` is set
>   - If approval_outcome is null (pending):
>     - Four action buttons in a row: "Approve" (default), "Edit & Approve" (secondary), "Reject" (destructive), "Escalate" (outline)
>     - "Approve" calls `useReviewDraft({ action: "approved" })`
>     - "Edit & Approve" opens a Dialog with a Textarea pre-filled with the draft body. On submit, calls `useReviewDraft({ action: "edited_and_approved", edited_body: ... })`
>     - "Reject" opens a Dialog asking for a reason (Textarea). On submit, calls `useReviewDraft({ action: "rejected", reason: ... })`
>     - "Escalate" calls `useReviewDraft({ action: "escalated" })`
> - If no draft:
>   - "Generate Draft" button (calls `useGenerateDraft`)
>   - Only visible to `support_agent` and `team_lead`
> - If a draft exists and has been approved/rejected:
>   - "Re-draft" button (calls `useRedraft`) — creates a new draft, never overwrites
>   - Only visible to `support_agent` and `team_lead`
> - While generating, show a loading state: skeleton lines + "Generating draft…" text
>
> **Step 10: Ticket Actions sidebar section**
>
> Create `web/src/components/ticket/ticket-actions.tsx`:
> - Card with title "Actions"
> - Status change: Select dropdown with ticket_status options + "Update" button (calls `useUpdateTicket`)
> - Priority change: Select dropdown with ticket_priority options (same pattern)
> - Assign: Input to search for users (for MVP, a simple Select with the agent and lead demo user IDs) + "Assign" button (calls `useAssignTicket`)
> - "Resolve" button: one-click to set status=resolved (calls `useUpdateTicket({ status: "resolved" })`)
> - "Reopen" button: only visible when status is resolved or closed (calls `useUpdateTicket({ status: "open" })`)
>
> **Step 11: Wire it all together on the page**
>
> The page component (`[id]/page.tsx`):
> - Reads `params.id` from the URL
> - Calls `useTicketDetail(id)` for the data
> - Calls `useCurrentUser()` for role-based conditional rendering
> - Shows a full-page Skeleton while loading
> - Shows a "Ticket not found" message if the query returns 404
> - Renders the two-column layout with all components above

**Done when:**

* `npm run build` succeeds with zero TypeScript errors
* Navigate from ticket queue to a specific ticket — the workspace loads with all panels
* Message thread shows all messages in chronological order, internal notes have distinct styling
* Reply box sends a message: type text → click Send → message appears in thread after refetch
* Internal note checkbox: check it, send message → message appears with internal badge
* Triage panel: if prediction exists, shows all fields with colored badges; if not, "Run Triage" button works and panel updates
* Draft panel: if draft exists, shows body + confidence + approval buttons; if not, "Generate Draft" button works
* Approve button on draft → approval_outcome updates to "approved", action buttons disappear, "Re-draft" button appears
* Edit & Approve: dialog opens with pre-filled body, can edit and submit
* Reject: dialog opens, requires reason, submit works
* Status change dropdown works — select "resolved" → ticket status updates
* Two-column layout on desktop (≥1024px), stacked on mobile (<1024px)
* Client user login → sees messages and ticket header only (no triage panel, no draft panel, no action buttons — these components check role before rendering)
* Page handles the `loading → data → error` states gracefully (no flash of empty content)

\---

### Milestone 4D: Review Queue Page

**Paste this into Claude Code:**

> Implement the review queue — a list of AI-generated drafts awaiting human review. Agents and team leads use this to quickly approve, edit, or reject drafts without opening each ticket individually.
>
> **Read `design-system/MASTER.md` and `design-system/pages/review-queue.md` first.**
>
> **Step 1: Create the review queue query hook**
>
> Create `web/src/hooks/use-review-queue.ts`:
>
> ```typescript
> // Hook: useReviewQueue(params: { page: number; per_page: number })
> // Wraps: apiClient.get<PaginatedResponse<DraftQueueItem>>(`/drafts/review-queue?${searchParams}`)
> // Query key: ["reviews", params]
> //
> // Also create:
> // useReviewDraftFromQueue(draftId, ticketId?) — POST /drafts/{draftId}/review
> //   onSuccess: invalidate ["reviews"]
> //   (ticketId is optional — if provided, also invalidate ["ticket", ticketId])
> ```
>
> **Step 2: Build the review queue page**
>
> Replace `web/src/app/(app)/reviews/page.tsx`:
>
> **Page header:**
> - Title: "Review Queue" (h1)
> - Subtitle: total pending count (e.g., "59 drafts pending review")
>
> **Queue layout — use a card-based list, not a table** (each draft needs enough space for the body preview and action buttons):
>
> Each draft Card shows:
> - **Left section:**
>   - Ticket subject (link to `/tickets/[ticket_id]`) — use the `ticket_subject` field
>   - Draft body preview (the `body` field — already truncated to 200 chars by the API)
>   - Time since generation: format `time_since_generation` (seconds) into "Xm ago", "Xh ago", "Xd ago"
> - **Right section:**
>   - Confidence badge (same color logic: green ≥0.8, amber 0.5–0.79, red <0.5)
>   - Action buttons row:
>     - "Approve" (size="sm", default variant) — calls `useReviewDraftFromQueue({ action: "approved" })`
>     - "Edit" (size="sm", secondary variant) — opens a Dialog with a Textarea pre-filled with the truncated body + a note that the full body will be fetched. Since the review queue only has the truncated body, the "Edit & Approve" dialog should first navigate to the ticket workspace where the full draft body is available. **Implementation: clicking "Edit" navigates to `/tickets/[ticket_id]` where the full draft editing UX already exists from 4C.**
>     - "Reject" (size="sm", destructive variant) — opens a small Dialog for reason input, then calls `useReviewDraftFromQueue({ action: "rejected", reason })`
>     - "Escalate" (size="sm", outline variant) — calls `useReviewDraftFromQueue({ action: "escalated" })`
>   - Disable all buttons while any mutation is in flight (prevent double-clicks)
>
> **Pagination:**
> - Same pattern as the ticket queue: "Page X of Y" with Previous/Next buttons
> - URL-synced: `?page=2`
>
> **Empty state:**
> - If no pending drafts: show a centered message with a CheckCircle icon: "All caught up! No drafts pending review."
>
> **Loading state:**
> - Show 3 skeleton cards while loading
>
> **Auto-refresh:**
> - Set `refetchInterval: 30_000` (30 seconds) on the `useReviewQueue` query so new drafts appear without manual refresh

**Done when:**

* `npm run build` succeeds with zero TypeScript errors
* Login as agent@demo.com → navigate to Review Queue → see pending drafts from the API
* Each card shows: ticket subject (clickable), draft preview, time since generation, confidence badge, action buttons
* "Approve" on a draft → card disappears from the queue (after refetch), total count decreases
* "Reject" → dialog asks for reason → submit → card disappears
* "Escalate" → card disappears
* "Edit" → navigates to `/tickets/[ticket_id]` (the workspace where full edit is possible)
* Login as client@demo.com → navigate to `/reviews` → 403 or redirect (client users can't access review queue; the sidebar already hides it, but direct URL should be handled — either show "Access denied" or redirect to `/tickets`)
* Pagination works with URL sync
* Empty state displays correctly when all drafts are reviewed
* Page auto-refreshes every 30 seconds (verify by approving a draft in another tab and waiting)

\---

### Milestone 4E: Knowledge Upload Page

**Paste this into Claude Code:**

> Implement the knowledge management page — upload documents, view status, delete. This powers the RAG pipeline.
>
> **Read `design-system/MASTER.md` and `design-system/pages/knowledge-upload.md` first.**
>
> **Step 1: Install required shadcn components**
>
> ```bash
> npx shadcn@latest add alert-dialog
> npx shadcn@latest add progress
> ```
>
> **Step 2: Create the knowledge query hooks**
>
> Create `web/src/hooks/use-knowledge.ts`:
>
> ```typescript
> // Hook: useKnowledgeDocs(params: { page, per_page, status?, visibility? })
> // Wraps: apiClient.get<PaginatedResponse<KnowledgeDocListItem>>(`/knowledge/documents?${searchParams}`)
> // Query key: ["knowledge-docs", params]
> //
> // Hook: useKnowledgeDocDetail(docId: string)
> // Wraps: apiClient.get<KnowledgeDocDetail>(`/knowledge/documents/${docId}`)
> // Query key: ["knowledge-doc", docId]
> //
> // Hook: useUploadDocument()
> // This is a mutation that sends a multipart/form-data POST.
> // IMPORTANT: apiClient.post() sends JSON. For file upload, use fetch directly:
> //
> //   const formData = new FormData()
> //   formData.append("title", title)
> //   formData.append("visibility", visibility)
> //   formData.append("file", file)
> //
> //   const token = await getToken()  // need to export getToken from api-client
> //   const res = await fetch(`${API_URL}/knowledge/documents`, {
> //     method: "POST",
> //     headers: { Authorization: `Bearer ${token}` },
> //     body: formData,  // do NOT set Content-Type — the browser sets it with the boundary
> //   })
> //
> // To support this, update api-client.ts to export the getToken function and the API_URL constant.
> //
> // onSuccess: invalidate ["knowledge-docs"]
> //
> // Hook: useDeleteDocument()
> // Wraps: apiClient.del(`/knowledge/documents/${docId}`)
> // onSuccess: invalidate ["knowledge-docs"]
> ```
>
> **Step 3: Build the knowledge page**
>
> Replace `web/src/app/(app)/knowledge/page.tsx`:
>
> **Page header:**
> - Title: "Knowledge Base" (h1)
> - Subtitle: total document count
> - "Upload Document" button (default variant) — opens the upload dialog
>
> **Filter bar:**
> - Status filter: Select with options: `pending`, `processing`, `indexed`, `failed`. Placeholder: "All statuses"
> - Visibility filter: Select with options: `internal`, `client_visible`. Placeholder: "All visibility"
> - URL-synced (same pattern as ticket queue)
>
> **Document list — use a Card-based layout:**
>
> Each document Card shows:
> - Document title (bold)
> - Source filename in muted text
> - Status badge:
>   - `pending` → outline (gray)
>   - `processing` → secondary (blue)
>   - `indexed` → success (green)
>   - `failed` → destructive (red)
> - Visibility badge: `internal` → secondary, `client_visible` → default
> - Created date (relative time)
> - Actions (right-aligned):
>   - "View chunks" button (outline, size="sm") — navigates to an expanded view of the doc OR expands inline
>   - "Delete" button (destructive ghost, size="sm") — opens AlertDialog confirmation
>
> **For inline chunk expansion:**
> When "View chunks" is clicked, expand the card to show the document's chunks underneath. Use `useKnowledgeDocDetail(docId)` triggered on expand. Each chunk shows:
> - Chunk index (e.g., "#1", "#2")
> - Token count
> - Content preview (first 200 chars)
>
> **Upload dialog:**
>
> Create `web/src/components/knowledge/upload-dialog.tsx`:
> - Dialog with title "Upload Knowledge Document"
> - Fields:
>   - "Title" — text Input (required)
>   - "Visibility" — Select: "Internal only" (value: "internal"), "Client visible" (value: "client_visible")
>   - "File" — native file input, accept=".pdf,.md,.txt"
> - "Upload" button:
>   - Calls `useUploadDocument` mutation
>   - Shows "Uploading…" while pending
>   - On success: close dialog, show brief success state (the new doc appears in the list with status="pending", then transitions to "indexed" on next refetch)
>   - On error: show error message in the dialog
>
> **Delete confirmation:**
>
> Use an AlertDialog:
> - Title: "Delete document"
> - Description: "This will permanently delete '{title}' and all its chunks. This action cannot be undone."
> - Cancel + "Delete" (destructive) buttons
> - On confirm: call `useDeleteDocument` mutation
>
> **Pagination:**
> - Same pattern as ticket queue
>
> **Empty state:**
> - "No documents uploaded yet. Upload your first document to power the AI drafting pipeline."
> - Upload button
>
> **Auto-refresh for processing documents:**
> - If any document in the current page has `status === "processing"`, set `refetchInterval: 5_000` (5 seconds) to poll until it transitions to `indexed` or `failed`
> - Otherwise, no auto-refresh

**Done when:**

* `npm run build` succeeds with zero TypeScript errors
* Login as agent@demo.com → Knowledge page shows seed documents from the API
* Status and visibility filters work with URL sync
* Upload dialog: select a .md file, set title and visibility → document appears in list with "pending" status → refreshes to "indexed" after background ingestion completes (use `MOCK_AI=1` on the API for fast testing)
* Upload a .txt file → same flow works
* Upload validation: reject a .jpg file (not in allowed extensions)
* "View chunks" on an indexed document → expands to show chunk list with index, token count, content preview
* "Delete" on a document → confirmation dialog → confirm → document removed from list
* Pagination works
* Client user cannot see this page (sidebar hides it, direct URL should show access denied or redirect)

\---

## Milestone 5 — Evaluation System

**Goal:** Working eval console where team leads can run eval sets against prompt versions, view per-example results, and compare two runs side-by-side.

\---

### Milestone 5A: Eval Runner Backend

**Paste this into Claude Code:**

> The API has eval endpoints for CRUD (creating runs, listing results), but there is no actual eval runner — the `POST /eval/runs` endpoint creates a run record with `status=pending` but never executes it. Implement the evaluation runner that actually processes each example and writes results.
>
> **Step 1: Create the eval pipeline**
>
> Create `api/app/pipelines/evaluation.py`:
>
> ```python
> """
> Evaluation pipeline.
>
> run_evaluation(eval_run_id) is a background task. It:
> 1. Loads the eval run, its eval set, and all examples
> 2. Loads the prompt version specified in the run
> 3. For each example, runs the appropriate pipeline (triage or draft) and compares output to expected
> 4. Writes eval_results rows
> 5. Updates the run with final metrics and status
> """
> ```
>
> **Core logic for each example type:**
>
> **Classification examples** (`type === "classification"`):
> - Call `classify()` from the provider module using the example's `input_text` as the ticket content and the prompt version's `content` as the system prompt
> - Compare `model_output.category` to `expected_category`
> - `passed = (model_output.category == expected_category)`
> - Store `model_output` as the full structured output from the model
>
> **Routing examples** (`type === "routing"`):
> - Same `classify()` call (triage produces both category and team)
> - Compare `model_output.suggested_team` to `expected_team`
> - `passed = (model_output.suggested_team == expected_team)`
>
> **Citation examples** (`type === "citation"`):
> - More complex: need to run retrieval + draft generation for the example's `input_text`
> - For MVP, use a simplified approach: embed the `input_text`, run `search_knowledge` to get top-5 chunks, check if any of the `expected_chunk_ids` appear in the results
> - `passed = len(set(expected_chunk_ids) & set(retrieved_chunk_ids)) > 0`
> - Note: seed data `expected_chunk_ids` may reference chunks with random embeddings (not real semantic content). This means citation examples may fail — that's expected and the eval console should still display the results correctly. The value is in demonstrating the evaluation framework, not in achieving high scores with random embeddings.
>
> **Metrics computation:**
> After all examples are processed:
> ```python
> metrics = {}
> classification_examples = [r for r in results if r.type == "classification"]
> if classification_examples:
>     metrics["accuracy"] = sum(r.passed for r in classification_examples) / len(classification_examples)
>
> routing_examples = [r for r in results if r.type == "routing"]
> if routing_examples:
>     metrics["routing_accuracy"] = sum(r.passed for r in routing_examples) / len(routing_examples)
>
> citation_examples = [r for r in results if r.type == "citation"]
> if citation_examples:
>     metrics["citation_hit_rate"] = sum(r.passed for r in citation_examples) / len(citation_examples)
> ```
>
> **Error handling:**
> - If a single example fails (provider error, timeout), mark that result as `passed=False` with `notes` explaining the error, but continue processing remaining examples
> - If the entire run fails catastrophically, update the run status to `failed`
>
> **Step 2: Add eval query functions**
>
> Add to `api/app/queries/evals.py`:
>
> ```python
> def get_eval_run_for_execution(conn, run_id: str) -> dict | None:
>     """Get run + prompt version content for execution."""
>     # JOIN eval_runs with prompt_versions to get the prompt content
>     ...
>
> def get_eval_examples_for_run(conn, eval_set_id: str) -> list[dict]:
>     """Get all examples in the set for processing."""
>     ...
>
> def insert_eval_result(conn, run_id: str, example_id: str, passed: bool,
>                        model_output: dict, expected_output: dict | None, notes: str | None):
>     """Insert a single eval result."""
>     ...
>
> def update_eval_run_completed(conn, run_id: str, passed: int, failed: int,
>                                metrics: dict):
>     """Update run to completed with final counts and metrics."""
>     ...
>
> def update_eval_run_status(conn, run_id: str, status: str):
>     """Update run status (running, failed)."""
>     ...
> ```
>
> **Step 3: Wire the eval runner to the endpoint**
>
> Update `api/app/routers/evals.py`:
> - Import `BackgroundTasks` from FastAPI
> - In `create_eval_run()`, add `background_tasks: BackgroundTasks` parameter
> - After creating the run record, add: `background_tasks.add_task(run_evaluation, str(run["id"]))`
> - The run starts with `status=pending`, transitions to `running` when the task begins, and to `completed` or `failed` when done
>
> **Step 4: Handle the background task connection**
>
> The eval runner is a background task (like ingestion), so it cannot use `get_rls_db`. Use `pool.connection()` directly (eval data is not tenant-scoped — RLS doesn't apply to eval tables, and the runner operates as a system process).
>
> Verify in `schema.sql`: eval tables (`eval_sets`, `eval_examples`, `eval_runs`, `eval_results`) should NOT have RLS policies. If they do, the runner needs to set up the connection like `_workspace_conn` in ingestion.py. Check and handle accordingly.

**Done when:**

* `POST /eval/runs` creates a run AND triggers background execution
* After a few seconds, `GET /eval/runs/{id}` shows `status: "completed"` (or `status: "running"` if still processing)
* `GET /eval/runs/{id}` returns `results[]` with per-example `passed`, `model_output`, `expected_output`, `notes`
* `metrics` field contains `accuracy`, `routing_accuracy`, and/or `citation_hit_rate` as applicable
* `passed` + `failed` counts sum to `total_examples`
* If using `MOCK_AI=1`: mock classify returns consistent results, all classification examples compare against mock output
* Compare endpoint still works: `GET /eval/runs/compare?run_a_id=X&run_b_id=Y` now shows real metrics for both runs
* Running two eval runs against different prompt versions produces potentially different metrics (since the prompt content differs)
* A single example failure (e.g., provider timeout) does not crash the entire run — it's marked as failed and the run continues

\---

### Milestone 5B: Eval Console Frontend

**Paste this into Claude Code:**

> Implement the eval console — the team lead-only page for running evaluations and comparing prompt versions. This is a key differentiator of the project.
>
> **Read `design-system/MASTER.md` and `design-system/pages/eval-console.md` first.**
>
> **Step 1: Install required shadcn components (if not already installed from previous milestones)**
>
> ```bash
> npx shadcn@latest add collapsible
> ```
>
> **Step 2: Create eval query hooks**
>
> Create `web/src/hooks/use-evals.ts`:
>
> ```typescript
> // Hook: useEvalSets()
> // Wraps: apiClient.get<EvalSetListItem[]>("/eval/sets")
> // Query key: ["eval-sets"]
> //
> // Hook: useEvalRuns()
> // Wraps: apiClient.get<EvalRunListItem[]>("/eval/runs")
> // Query key: ["eval-runs"]
> //
> // Hook: useEvalRunDetail(runId: string)
> // Wraps: apiClient.get<EvalRunDetail>(`/eval/runs/${runId}`)
> // Query key: ["eval-run", runId]
> // enabled: !!runId
> //
> // Hook: useEvalComparison(runAId: string, runBId: string)
> // Wraps: apiClient.get<EvalComparison>(`/eval/runs/compare?run_a_id=${runAId}&run_b_id=${runBId}`)
> // Query key: ["eval-comparison", runAId, runBId]
> // enabled: !!runAId && !!runBId
> //
> // Hook: usePromptVersions()
> // Wraps: apiClient.get<PromptVersion[]>("/prompt-versions")
> // Query key: ["prompt-versions"]
> //
> // Hook: useCreateEvalRun()
> // Wraps: apiClient.post<EvalRunListItem>("/eval/runs", body)
> // onSuccess: invalidate ["eval-runs"]
> ```
>
> **Step 3: Build the eval console page**
>
> Replace `web/src/app/(app)/evals/page.tsx`:
>
> The eval console has three sections, organized as Tabs:
>
> **Tab 1: "Run Evaluation"**
>
> Create `web/src/components/eval/run-eval-form.tsx`:
> - Title: "New Evaluation Run"
> - Two Select dropdowns:
>   - "Eval Set" — populated from `useEvalSets()`, show `name` + `(N examples)` for each
>   - "Prompt Version" — populated from `usePromptVersions()`, show `name` + `type` + active badge
> - "Run Evaluation" button (default variant)
>   - Calls `useCreateEvalRun({ eval_set_id, prompt_version_id })`
>   - On success: show a success message "Eval run started" and switch to the "Runs" tab
>   - Disable button while mutation is pending, show "Starting…"
>
> **Tab 2: "Runs"**
>
> Create `web/src/components/eval/eval-runs-list.tsx`:
> - Table of all eval runs from `useEvalRuns()`
> - Columns: Eval Set, Prompt Version, Status, Passed, Failed, Accuracy, Created
> - Status badge:
>   - `pending` → outline
>   - `running` → secondary with a subtle pulse animation
>   - `completed` → success
>   - `failed` → destructive
> - Accuracy column: display `metrics.accuracy` as percentage, or "—" if not computed yet
> - Clickable rows: clicking a run selects it for detail view (expand inline or navigate within the page)
> - For runs with `status === "running"` or `status === "pending"`: set `refetchInterval: 5_000` on the query
> - **Run detail (expanded):**
>   - Show metrics summary: accuracy %, routing accuracy %, citation hit rate % (only show metrics that exist)
>   - Collapsible per-example results table:
>     - Columns: Input (truncated to 80 chars), Type, Expected, Model Output, Result (pass/fail icon)
>     - Passed rows: green CheckCircle icon
>     - Failed rows: red XCircle icon
>     - If `notes` exists, show it as a tooltip or small text below the row
> - **Select for comparison:** Each run row has a checkbox. When exactly 2 runs are checked, show a "Compare" button that switches to Tab 3
>
> **Tab 3: "Compare"**
>
> Create `web/src/components/eval/eval-comparison.tsx`:
> - This tab is only active when two run IDs are selected
> - Uses `useEvalComparison(runAId, runBId)` to fetch the comparison data
> - **Metrics comparison panel** (top):
>   - Three metric rows: Classification Accuracy, Routing Accuracy, Citation Hit Rate
>   - Each row shows: Run A value, Run B value, delta (with color: green if B > A, red if B < A, gray if equal)
>   - Display as a simple 3-column layout: "Metric | Run A | Run B | Delta"
> - **Side-by-side results** (below metrics):
>   - For each example in the eval set, show a row with:
>     - Input text (truncated)
>     - Run A result (pass/fail icon + model output)
>     - Run B result (pass/fail icon + model output)
>   - Highlight rows where results differ between runs (e.g., subtle amber background)
>   - This is the core eval UX — a reviewer can see exactly which examples improved or regressed
>
> **Access control:**
> - The entire eval page is team_lead only
> - On page load, check `useCurrentUser()` role. If not `team_lead`, show: "Access restricted. The evaluation console is available to team leads only."
> - The sidebar already hides this link for non-leads, but this handles direct URL access

**Done when:**

* `npm run build` succeeds with zero TypeScript errors
* Login as lead@demo.com → Eval Console shows three tabs
* "Run Evaluation" tab: can select an eval set and prompt version from dropdowns, click "Run Evaluation" → run starts
* "Runs" tab: shows the run with `status=pending` → transitions to `running` → transitions to `completed` (auto-refresh)
* Completed run shows metrics: accuracy, routing_accuracy, citation_hit_rate as percentages
* Click a completed run → expanded detail shows per-example results with pass/fail icons and model output
* Select two completed runs → "Compare" button appears
* "Compare" tab: shows metrics side-by-side with deltas, and per-example result comparison
* Rows where Run A passed but Run B failed (or vice versa) are highlighted
* Login as agent@demo.com → navigate to `/evals` → "Access restricted" message
* Login as client@demo.com → navigate to `/evals` → "Access restricted" message

\---

## Milestone 6 — Demo Readiness

**Goal:** Polish, performance, deployment configuration, and demo walkthrough documentation. The system must support the four demo flows from the spec.

\---

### Milestone 6A: Error Handling, Loading States & Polish

**Paste this into Claude Code:**

> Review all frontend pages and add consistent error handling, loading states, and edge-case coverage. This milestone is about polish — making the demo feel production-grade.
>
> **Read `design-system/MASTER.md` first — apply the pre-delivery checklist.**
>
> **Step 1: Create a global error boundary**
>
> Create `web/src/components/error-boundary.tsx`:
> - A React error boundary component that catches render errors
> - Shows a centered card with: "Something went wrong" heading, the error message, and a "Try again" button that calls `window.location.reload()`
> - Log the error to console (no external error reporting in MVP)
>
> Wrap the `(app)/layout.tsx` children with this error boundary.
>
> **Step 2: Create reusable loading/error/empty components**
>
> Create `web/src/components/ui/page-loading.tsx`:
> - Full-page centered spinner or skeleton appropriate for initial page loads
> - Use a simple SVG spinner (Loader2 icon from lucide with `animate-spin`)
>
> Create `web/src/components/ui/page-error.tsx`:
> - Full-page centered error state: red AlertCircle icon + error message + "Retry" button
> - Accept props: `message: string`, `onRetry?: () => void`
>
> Create `web/src/components/ui/empty-state.tsx`:
> - Centered content area with icon, title, description, and optional action button
> - Accept props: `icon: LucideIcon`, `title: string`, `description: string`, `action?: { label: string, onClick: () => void }`
>
> **Step 3: Audit every page for state coverage**
>
> Go through each page and verify these states are handled:
>
> | Page | Loading | Error | Empty | Access Denied |
> |-|-|-|-|-|
> | Ticket Queue | Skeleton rows | PageError with retry | EmptyState "No tickets" | N/A (all roles) |
> | Ticket Workspace | Full Skeleton | PageError "Ticket not found" or error | N/A (ticket always has data) | Client: hide triage/draft/actions |
> | Review Queue | Skeleton cards | PageError with retry | EmptyState "All caught up" | Client: show "Access denied" |
> | Knowledge | Skeleton cards | PageError with retry | EmptyState "No documents" | Client: show "Access denied" |
> | Eval Console | Skeleton | PageError with retry | EmptyState "No runs yet" | Non-lead: show "Access denied" |
>
> **Step 4: Add toast notifications for mutations**
>
> Install shadcn sonner (toast library):
> ```bash
> npx shadcn@latest add sonner
> ```
>
> Add `<Toaster />` to the `(app)/layout.tsx`.
>
> Add toast calls to all mutations across the app:
> - Draft approved → `toast.success("Draft approved")`
> - Draft rejected → `toast.success("Draft rejected")`
> - Draft generated → `toast.success("Draft generated")`
> - Triage completed → `toast.success("Triage complete")`
> - Message sent → `toast.success("Message sent")`
> - Document uploaded → `toast.success("Document uploaded")`
> - Document deleted → `toast.success("Document deleted")`
> - Eval run started → `toast.success("Evaluation started")`
> - Any mutation error → `toast.error(error.message || "Something went wrong")`
> - Ticket updated → `toast.success("Ticket updated")`
> - Ticket assigned → `toast.success("Ticket assigned")`
>
> **Step 5: Keyboard shortcuts**
>
> Add basic keyboard navigation to the ticket workspace:
> - `Ctrl+Enter` / `Cmd+Enter` in the reply textarea → submit the message
> - `Escape` in any open Dialog → close the dialog (shadcn Dialog already handles this, but verify)
>
> **Step 6: Responsive audit**
>
> Test every page at these breakpoints (use Chrome DevTools):
> - **375px** (mobile): sidebar should be collapsible/overlay, content stacks vertically
> - **768px** (tablet): sidebar should be collapsible, content can start using horizontal space
> - **1024px** (small desktop): full two-column layout on ticket workspace
> - **1440px** (large desktop): comfortable spacing, no content stretching beyond max-width
>
> For the ticket workspace two-column layout:
> - Below 1024px: right panel stacks below the message thread
> - The sidebar should use `collapsible="icon"` behavior on smaller screens
>
> **Step 7: Update the login page**
>
> The current login page (`web/src/app/login/page.tsx`) uses hardcoded Tailwind classes instead of design system tokens. Update it to:
> - Use `bg-background` and `text-foreground` instead of `bg-zinc-50` / `text-zinc-900`
> - Use `bg-card` and `border-border` instead of `bg-white` / `border-zinc-200`
> - Use the shadcn Button component instead of a raw `<button>`
> - Use the shadcn Input component (install it: `npx shadcn@latest add input` and `npx shadcn@latest add label`)
> - Add the three demo account credentials below the form for easy login during demos:
>   ```
>   Demo accounts:
>   agent@demo.com / agent123 — Support Agent
>   lead@demo.com / lead123 — Team Lead
>   client@demo.com / client123 — Client User
>   ```
>   Style as muted text below the form card

**Done when:**

* `npm run build` succeeds with zero TypeScript errors
* Every page shows a proper loading skeleton on first load (not a blank screen)
* Every page shows a proper error state when the API is unreachable (stop the API server, reload a page)
* Every mutation shows a toast on success and on error
* Login page uses design system tokens and shows demo credentials
* Ctrl+Enter sends a message in the ticket workspace
* No horizontal scroll at any breakpoint (375px, 768px, 1024px, 1440px)
* Sidebar collapses properly on mobile
* Ticket workspace stacks to single-column below 1024px
* Error boundary catches a render error (intentionally throw in a component to test) and shows the fallback UI

\---

### Milestone 6B: API Performance Endpoints & Optimizations

**Paste this into Claude Code:**

> Add any missing API support needed for the frontend and optimize critical paths for the performance targets: ticket queue < 500ms, ticket workspace < 600ms.
>
> **Step 1: Add users list endpoint (for the assignee picker)**
>
> The ticket workspace needs a list of users in the workspace for the "Assign" dropdown.
>
> Create `api/app/routers/users.py`:
> ```python
> # GET /users — returns users in the current workspace
> # Query: SELECT u.id, u.full_name, u.email, wm.role
> #        FROM users u
> #        JOIN workspace_memberships wm ON wm.user_id = u.id
> #        WHERE wm.workspace_id = current_setting('app.workspace_id')::uuid
> #        ORDER BY u.full_name
> # Response: list of { id, full_name, email, role }
> # Auth: any authenticated user
> ```
>
> Create `api/app/schemas/users.py`:
> ```python
> class UserListItem(BaseModel):
>     id: UUID
>     full_name: str
>     email: str
>     role: str
> ```
>
> Add to `api/app/queries/users.py` and register in `main.py`.
>
> **Step 2: Add ticket counts endpoint (for dashboard-style stats)**
>
> Create or extend a stats endpoint for the ticket queue header:
>
> Add to `api/app/routers/tickets.py`:
> ```python
> # GET /tickets/stats — returns aggregate counts for the current workspace
> # Response: {
> #   total: int,
> #   by_status: { new: int, open: int, pending_customer: int, ... },
> #   by_priority: { low: int, medium: int, high: int, critical: int }
> # }
> ```
>
> This enables the ticket queue page to show summary stats without loading all tickets.
>
> **Step 3: Verify query performance**
>
> Check that these critical queries have appropriate indexes (most should already exist from schema.sql):
>
> ```sql
> -- Ticket list query uses: WHERE org_id, workspace_id (RLS), + optional filters
> -- Needed index: already covered by RLS policy and default PK indexes
> -- Verify with EXPLAIN ANALYZE on the list query
>
> -- Knowledge search uses: ORDER BY embedding <=> query_vector
> -- Needed index: already should have an ivfflat or hnsw index on knowledge_chunks.embedding
> -- If not, add: CREATE INDEX ON knowledge_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
>
> -- Review queue uses: WHERE approval_outcome IS NULL OR approval_outcome = 'pending'
> -- Needed index: CREATE INDEX idx_draft_pending ON draft_generations (created_at) WHERE approval_outcome IS NULL OR approval_outcome = 'pending';
> ```
>
> Check `seed/schema.sql` for existing indexes. If the vector index is missing, add it.
>
> **Step 4: Update the frontend ticket workspace to use the users endpoint**
>
> Update `web/src/components/ticket/ticket-actions.tsx`:
> - Replace the hardcoded demo user Select with a dynamically populated dropdown from `GET /users`
> - Create `web/src/hooks/use-users.ts` with `useWorkspaceUsers()` hook

**Done when:**

* `GET /users` returns workspace users with name, email, role
* `GET /tickets/stats` returns total + by_status + by_priority counts
* Ticket workspace assignee picker shows real user list from the API (not hardcoded IDs)
* `EXPLAIN ANALYZE` on the ticket list query shows index scan (not sequential scan) for RLS-filtered queries
* Vector index exists on `knowledge_chunks.embedding` (verify with `\di` in psql or a SQL query against `pg_indexes`)
* Ticket queue loads in under 500ms (measure with browser DevTools Network tab — time from navigation to content painted)
* Ticket workspace loads in under 600ms

\---

### Milestone 6C: Deployment Configuration

**Paste this into Claude Code:**

> Set up deployment configuration for Vercel (frontend) and Railway (backend). The goal is to have both services deployable from the Git repo with minimal manual setup.
>
> **Step 1: Vercel configuration**
>
> Create `web/vercel.json`:
> ```json
> {
>   "framework": "nextjs",
>   "buildCommand": "npm run build",
>   "outputDirectory": ".next"
> }
> ```
>
> Verify `web/next.config.ts` has the correct configuration:
> - Add `output: "standalone"` for optimized production builds (smaller deployment)
> - Add `images` config if using `next/image` with external domains
>
> Environment variables needed in Vercel:
> ```
> DATABASE_URL=<neon connection string>
> BETTER_AUTH_SECRET=<secret>
> BETTER_AUTH_URL=https://<vercel-domain>
> JWT_SECRET=<secret>
> NEXT_PUBLIC_API_URL=https://<railway-domain>
> ```
>
> **Step 2: Railway configuration**
>
> Create `api/railway.json`:
> ```json
> {
>   "build": {
>     "builder": "NIXPACKS"
>   },
>   "deploy": {
>     "startCommand": "uvicorn app.main:app --host 0.0.0.0 --port $PORT",
>     "restartPolicyType": "ON_FAILURE"
>   }
> }
> ```
>
> Create `api/Procfile` (Railway also reads this):
> ```
> web: uvicorn app.main:app --host 0.0.0.0 --port $PORT
> ```
>
> Create `api/nixpacks.toml` for Railway's build system:
> ```toml
> [phases.setup]
> nixPkgs = ["python312"]
>
> [phases.install]
> cmds = ["pip install -e ."]
>
> [start]
> cmd = "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"
> ```
>
> Environment variables needed in Railway:
> ```
> DATABASE_URL=<neon connection string>
> REDIS_URL=<upstash redis url>
> OPENAI_API_KEY=<key>
> JWT_SECRET=<same as vercel>
> CORS_ORIGINS=["https://<vercel-domain>"]
> ```
>
> **Step 3: Update CORS configuration**
>
> Update `api/app/config.py` to handle CORS_ORIGINS as a JSON string (Railway sets env vars as strings):
> ```python
> # The cors_origins field should accept both:
> # - A Python list: ["http://localhost:3000"]
> # - A JSON string: '["https://my-app.vercel.app"]'
> # pydantic-settings can handle the list form from .env.local,
> # but Railway sends a plain string. Add a validator if needed.
> ```
>
> **Step 4: Production health check**
>
> Update `api/app/routers/health.py`:
> - Add a `version` field to the health response (read from `pyproject.toml` or a hardcoded `"0.5.0"`)
> - Add an `environment` field (read from a new `ENVIRONMENT` env var, default `"development"`)
> - Railway and Vercel can use `GET /health` as their health check endpoint
>
> **Step 5: Create deployment documentation**
>
> Create `docs/deployment.md`:
> - Step-by-step instructions for deploying to Vercel + Railway
> - Environment variable reference (all required vars, which service needs which)
> - How to run database migrations on a new deploy (`just db-push` or `seed/push_schema.py`)
> - How to seed demo data
> - CORS configuration notes
> - Troubleshooting: common issues (CORS errors, JWT mismatch, Neon connection drops)

**Done when:**

* `web/vercel.json` and `api/railway.json` (or `Procfile`/`nixpacks.toml`) exist with correct configuration
* `npm run build` in `web/` succeeds with `output: "standalone"` in next.config.ts
* CORS configuration handles both development (localhost:3000) and production (Vercel domain) origins
* Health endpoint returns version and environment info
* `docs/deployment.md` has complete step-by-step instructions
* API starts correctly with `uvicorn app.main:app --host 0.0.0.0 --port 8000` from the `api/` directory (simulating Railway's start command)

\---

### Milestone 6D: Demo Walkthrough & README

**Paste this into Claude Code:**

> Create the demo-ready README and verify all four demo flows from the spec work end-to-end.
>
> **Step 1: Verify Demo Flow 1 — Standard FAQ Ticket**
>
> Manually walk through this flow and document any issues:
> 1. Login as `agent@demo.com`
> 2. Open a ticket from the queue
> 3. Click "Run Triage" → triage panel populates with category, priority, team, confidence
> 4. Click "Generate Draft" → draft panel shows body with citations, evidence panel shows retrieved chunks, confidence badge
> 5. Click "Approve" → approval_outcome updates, ticket status changes
>
> If any step fails, fix the issue before proceeding.
>
> **Step 2: Verify Demo Flow 2 — Low Confidence / Insufficient Evidence**
>
> Find or create a ticket on a topic with no matching knowledge:
> 1. Login as `agent@demo.com`
> 2. Open a ticket that has ambiguous content (check seed data for edge cases)
> 3. Run triage → should show lower confidence
> 4. Generate draft → draft should have `send_ready: false` and mention insufficient evidence
> 5. Agent sees low confidence → clicks "Escalate"
>
> **Step 3: Verify Demo Flow 3 — Tenant Isolation**
>
> 1. Login as `client@demo.com` (Org #1)
> 2. Navigate to tickets → should only see Org #1 tickets
> 3. Verify: no triage panel, no draft panel, no internal notes visible, no review queue, no knowledge page, no eval console
> 4. Login as `agent@demo.com` → can see all workspace tickets including internal notes
> 5. Verify: AI drafts for one org never cite another org's knowledge (this is enforced by RLS at the API level)
>
> **Step 4: Verify Demo Flow 4 — Eval Comparison**
>
> 1. Login as `lead@demo.com`
> 2. Go to Eval Console
> 3. Run eval set "Classification Accuracy" against triage-v1
> 4. Wait for completion
> 5. Run same eval set against triage-v2
> 6. Wait for completion
> 7. Select both runs → Compare
> 8. Side-by-side metrics and per-example results should display
>
> **Step 5: Write the README**
>
> Replace `README.md` (currently the default create-next-app readme or placeholder) with:
>
> ```markdown
> # Agent Service Desk
>
> [One paragraph overview: AI-assisted support system for B2B SaaS teams.
>  Ticket triage, grounded RAG drafting with citations, human approval workflows,
>  and a prompt evaluation harness. Built with Next.js, FastAPI, and OpenAI.]
>
> ## Tech Stack
>
> [Table: Frontend, Backend, Database, AI, Auth, Infra — with versions]
>
> ## Architecture
>
> [Mermaid diagram showing: User → Next.js → FastAPI → OpenAI / Postgres+pgvector / Redis
>  Include: auth flow, RLS enforcement point, background task flow]
>
> ## Key Surfaces
>
> [2-3 screenshots placeholder comments — actual screenshots added after deployment]
> - Ticket Workspace (the hero surface)
> - Eval Console comparison view
> - Ticket Queue with filters
>
> ## Demo
>
> [Loom link placeholder — record after deployment]
>
> ### Demo Credentials
>
> | Role | Email | Password |
> |-|-|-|
> | Support Agent | agent@demo.com | agent123 |
> | Team Lead | lead@demo.com | lead123 |
> | Client User | client@demo.com | client123 |
>
> ### Demo Flows
>
> 1. **FAQ Resolution:** Login as agent → open ticket → triage → draft → approve
> 2. **Low Confidence:** Agent opens ambiguous ticket → low-confidence draft → escalate
> 3. **Tenant Isolation:** Login as client → see only own org data; login as agent → see all
> 4. **Eval Comparison:** Login as lead → run eval → run again with different prompt → compare
>
> ## Setup
>
> ### Prerequisites
> - Node.js 20+
> - Python 3.12+
> - A Neon database (free tier works)
> - An OpenAI API key
> - An Upstash Redis instance
>
> ### Quick Start
> [Step-by-step: clone, env setup, db push, seed, dev servers, demo accounts]
>
> ## Documentation
>
> - [MVP Specification](docs/project-spec-mvp.md)
> - [Full V1 Specification](docs/project-spec.md) — shows forward thinking beyond what's built
> - [Architecture](docs/architecture.md)
> - [Auth & RLS Model](docs/auth-rls.md)
> - [Retrieval Pipeline](docs/retrieval.md)
> - [Evaluation Methodology](docs/evals.md)
> - [Deployment Guide](docs/deployment.md)
>
> ## V1 Extension Path
>
> [Brief list: Temporal workflows, multi-provider, incident clustering, full knowledge console,
>  advanced eval with regression gates — each builds on MVP foundation without rewrites]
> ```
>
> **Step 6: Create remaining documentation**
>
> Create these doc files (if they don't already exist):
>
> `docs/architecture.md`:
> - System diagram (Mermaid)
> - Data flow for the core ticket resolution loop
> - Background task architecture
> - Key tech decisions and why
>
> `docs/auth-rls.md`:
> - Auth flow diagram (BetterAuth → JWT → FastAPI → RLS)
> - RLS execution model (SET LOCAL ROLE, set_config)
> - Access rules per role
> - How tenant isolation is enforced
>
> `docs/retrieval.md`:
> - RAG pipeline overview
> - Embedding strategy (model, dimensions, chunking)
> - Knowledge ingestion flow
> - Semantic search query construction
> - Citation traceability
>
> `docs/evals.md`:
> - Evaluation methodology
> - Eval set structure
> - Metrics: accuracy, routing accuracy, citation hit rate
> - Prompt versioning approach
> - How to run and compare evaluations

**Done when:**

* All four demo flows work end-to-end without errors
* `README.md` contains: overview, tech stack, architecture diagram, demo credentials, setup instructions, documentation links
* `docs/architecture.md` exists with system diagram and data flow
* `docs/auth-rls.md` exists with auth flow and RLS explanation
* `docs/retrieval.md` exists with RAG pipeline documentation
* `docs/evals.md` exists with evaluation methodology
* `docs/deployment.md` exists (from 6C)
* `npm run build` succeeds
* The API starts without errors
* A fresh reader could follow the README to set up and run the system from scratch

\---

## Summary: All Milestones

| ID | Name | Depends On | Key Deliverable |
|-|-|-|-|
| 4A | App Shell, Layout & Navigation | Part 1 complete | Sidebar, routing, providers, types |
| 4B | Ticket Queue Page | 4A | Filterable/sortable/paginated ticket table |
| 4C | Ticket Workspace Page | 4A, 4B | Hero surface: messages, triage, evidence, draft, actions |
| 4D | Review Queue Page | 4A, 4C (shares draft review hooks) | Draft approval queue with inline actions |
| 4E | Knowledge Upload Page | 4A | Document upload, status tracking, chunk viewer, delete |
| 5A | Eval Runner Backend | Part 1 complete | Background eval execution, metrics computation |
| 5B | Eval Console Frontend | 4A, 5A | Run evals, view results, compare prompt versions |
| 6A | Error Handling & Polish | 4B–5B complete | Toasts, error boundaries, loading states, responsive audit |
| 6B | API Performance & Optimizations | 4C (needs users endpoint) | Users endpoint, stats endpoint, query performance |
| 6C | Deployment Configuration | All code complete | Vercel + Railway config, deployment docs |
| 6D | Demo Walkthrough & README | Everything | README, architecture docs, demo flow verification |
