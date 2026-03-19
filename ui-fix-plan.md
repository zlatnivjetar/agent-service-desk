# UI Fix Plan

Actionable plan for making the agent-service-desk frontend feel like one cohesive product instead of pages built at different times. Steps are ordered by visibility — fix the most-seen surfaces first.

---

## Current State Summary

- **Badge style maps are duplicated** — `STATUS_CLASSES` and `PRIORITY_CLASSES` exist both in `tickets/page.tsx` and `ticket-ui.tsx`. Knowledge page has its own separate `STATUS_CLASSES`.
- **Shared badge components exist** (`StatusBadge`, `PriorityBadge` in `ticket-ui.tsx`) but aren't used on the tickets list page, which has its own inline badge rendering.
- **Card component is consistent** — all cards use `<Card className="border-0 bg-white/90 shadow-sm ring-1 ring-foreground/8">`. This is good but the styling is inline, not tokenized.
- **Table usage varies** — tickets page and evals page both use `<Table>` but with different header styles, cell padding, and hover treatments.
- **Filter patterns differ** — tickets has 4 selects in a row, knowledge has 2, reviews has none. No shared filter bar container.
- **No charts exist** — chart CSS tokens (`--chart-1` through `--chart-5`) are defined but unused. This is fine for now.
- **Token system is solid** — OKLch colors in `globals.css` with proper light/dark mode support. Semantic tokens (`success`, `warning`, `destructive`) exist.
- **Typography is ad-hoc** — each page chooses its own heading size, text color, and helper text style.
- **Sidebar is functional** but nav items lack explicit active-state highlighting beyond Next.js defaults.

---

## Phase 1 — Standardize Badge System (Highest Duplication)

**Goal:** Every badge in the app uses the same base styling and central color maps.

### Step 1.1: Consolidate all badge style maps into one file

Create `web/src/lib/badge-styles.ts` (or extend `ticket-ui.tsx` and re-export) with:

```ts
// Ticket status
export const TICKET_STATUS_STYLES = { new, open, pending_customer, pending_internal, resolved, closed }

// Ticket priority
export const TICKET_PRIORITY_STYLES = { low, medium, high, critical }

// Knowledge doc status
export const KNOWLEDGE_STATUS_STYLES = { pending, processing, indexed, failed }

// Draft approval outcome
export const APPROVAL_OUTCOME_STYLES = { approved, edited_and_approved, rejected, escalated, pending }

// Confidence level
export const CONFIDENCE_STYLES = { high, medium, low }

// Sender type
export const SENDER_STYLES = { customer, agent, system }

// Visibility
export const VISIBILITY_STYLES = { internal, client_visible }
```

Each entry contains: `className` (for Badge), `dotClassName` (optional colored dot), `label` (display text).

### Step 1.2: Create thin badge wrapper components

In `web/src/components/ui/status-badges.tsx`:

```ts
export function TicketStatusBadge({ status }: { status: TicketStatus })
export function TicketPriorityBadge({ priority }: { priority: TicketPriority })
export function KnowledgeStatusBadge({ status }: { status: KnowledgeDocStatus })
export function ApprovalOutcomeBadge({ outcome }: { outcome: ApprovalOutcome })
export function ConfidenceBadge({ confidence }: { confidence: number })
export function SenderBadge({ senderType }: { senderType: SenderType })
export function VisibilityBadge({ visibility }: { visibility: string })
export function RoleBadge({ role }: { role: string })
```

All wrap `<Badge>` from `ui/badge.tsx` and apply classes from the central style maps.

### Step 1.3: Replace all inline badge rendering

- **`tickets/page.tsx`** — remove local `STATUS_CLASSES` / `PRIORITY_CLASSES`, use `<TicketStatusBadge>` / `<TicketPriorityBadge>`
- **`ticket-ui.tsx`** — keep as the canonical source, export everything. Remove duplicate maps from here if moved to dedicated file.
- **`knowledge/page.tsx`** — remove local `STATUS_CLASSES`, use `<KnowledgeStatusBadge>`, `<VisibilityBadge>`
- **`reviews/page.tsx`** — use `<ApprovalOutcomeBadge>`, `<ConfidenceBadge>`
- **`evals/` components** — use shared badge for run status (completed/running/failed)
- **`app-sidebar.tsx`** — use `<RoleBadge>` for the user role in footer

### Step 1.4: Ensure consistent badge dimensions

All badges should share:
- Same padding: `px-2 py-0.5` (or `px-2.5 py-1` for slightly larger)
- Same border radius: `rounded-md` (from the Badge CVA variant)
- Same text size: `text-xs`
- Same font weight: `font-medium`
- Same border treatment: all use `border` class with appropriate border color

Audit and fix any badge that deviates from this baseline.

**Files touched:**
- `web/src/lib/badge-styles.ts` (new — central style maps)
- `web/src/components/ui/status-badges.tsx` (new — wrapper components)
- `web/src/app/(app)/tickets/page.tsx` (remove inline maps, use shared badges)
- `web/src/app/(app)/knowledge/page.tsx` (same)
- `web/src/app/(app)/reviews/page.tsx` (same)
- `web/src/components/ticket/ticket-ui.tsx` (consolidate, re-export)
- `web/src/components/eval/eval-runs-list.tsx` (use shared badges)
- `web/src/components/app-sidebar.tsx` (use RoleBadge)

---

## Phase 2 — Standardize Card Surfaces

**Goal:** All cards share one surface treatment. Currently consistent but inline — tokenize it.

### Step 2.1: Define a default card style in the Card component

Update `web/src/components/ui/card.tsx` to bake in the standard surface treatment:

```ts
// Default card class (currently applied inline everywhere):
// "border-0 bg-white/90 shadow-sm ring-1 ring-foreground/8"
// → Bake into the Card component's base className
```

This way, every `<Card>` automatically gets the right surface. Pages that currently add these classes inline can drop them.

### Step 2.2: Add card variants for different contexts

Define variants via CVA (already used for Badge/Button):
- `default` — standard surface (white/90, subtle ring, soft shadow)
- `flat` — no shadow, no ring (for nested cards or secondary panels)
- `elevated` — slightly stronger shadow (for modal-like cards or KPI cards)
- `interactive` — adds hover state (for clickable cards like review queue items)

### Step 2.3: Standardize card header/content padding

Audit all card usage and ensure:
- `CardHeader` uses consistent padding everywhere
- `CardContent` uses consistent padding
- No card manually overrides padding unless there's a specific layout reason
- Gap between CardHeader and CardContent is consistent

### Step 2.4: Remove inline card styling from all pages

Search for `bg-white/90`, `ring-foreground`, `shadow-sm` applied directly to `<Card>` and remove — let the component handle it.

**Files touched:**
- `web/src/components/ui/card.tsx` (add default surface styling + variants)
- All pages/components that render `<Card>` (remove inline surface classes)

---

## Phase 3 — Standardize Tables

**Goal:** All data tables share the same baseline structure, header styling, and interaction patterns.

### Step 3.1: Enhance the base Table component

Update `web/src/components/ui/table.tsx` with standardized:
- Header: consistent background (`bg-muted/50`), font weight, text color, height
- Cell padding: uniform `px-4 py-3`
- Row hover: consistent `hover:bg-muted/50` (subtle highlight)
- Row borders: consistent `border-b border-border/50`
- Empty state: built-in empty state slot

### Step 3.2: Create a standard table wrapper

Create `web/src/components/ui/data-table.tsx` — a reusable wrapper that provides:
- Consistent rounded container with border
- Responsive horizontal scroll
- Skeleton loading state (configurable column count)
- Empty state with icon/message/action
- Pagination footer with consistent styling

### Step 3.3: Standardize the tickets table

Refactor `tickets/page.tsx` table to use the enhanced base components:
- Remove custom skeleton rendering — use the data-table skeleton
- Remove custom empty state — use the data-table empty state
- Ensure the subject link color uses a semantic token, not hardcoded teal

### Step 3.4: Standardize the eval runs table

Refactor `eval-runs-list.tsx` to use the same base table styling:
- Align header height, cell padding, and hover states with the tickets table
- Use shared badge components for run status

**Files touched:**
- `web/src/components/ui/table.tsx` (enhance base styles)
- `web/src/components/ui/data-table.tsx` (new — reusable table wrapper)
- `web/src/app/(app)/tickets/page.tsx` (use data-table patterns)
- `web/src/components/eval/eval-runs-list.tsx` (use data-table patterns)

---

## Phase 4 — Standardize Filter Bar

**Goal:** All data pages use the same filter bar container and control styles.

### Step 4.1: Create a shared FilterBar component

Create `web/src/components/ui/filter-bar.tsx`:

```tsx
export function FilterBar({ children, onClear, hasActiveFilters }: FilterBarProps)
```

Provides:
- Consistent container: flex row, gap, padding, optional background/border
- Responsive: wraps on small screens
- Clear filters button: consistent placement (right side), consistent style
- Active filter indicator: subtle visual when filters are active

### Step 4.2: Create standardized filter controls

Create `web/src/components/ui/filter-select.tsx` — a thin wrapper around the existing `<Select>` that standardizes:
- Trigger width (consistent min-width)
- Trigger height (matches other controls)
- Placeholder text color
- Active state (when a non-default value is selected)

### Step 4.3: Migrate tickets page filters

Replace the inline filter rendering in `tickets/page.tsx` with:
```tsx
<FilterBar onClear={clearFilters} hasActiveFilters={hasActiveFilters}>
  <FilterSelect label="Status" value={status} options={STATUS_OPTIONS} onChange={setStatus} />
  <FilterSelect label="Priority" value={priority} options={PRIORITY_OPTIONS} onChange={setPriority} />
  <FilterSelect label="Category" value={category} options={CATEGORY_OPTIONS} onChange={setCategory} />
  <FilterSelect label="Team" value={team} options={TEAM_OPTIONS} onChange={setTeam} />
</FilterBar>
```

### Step 4.4: Migrate knowledge page filters

Same pattern but with fewer controls:
```tsx
<FilterBar onClear={clearFilters} hasActiveFilters={hasActiveFilters}>
  <FilterSelect label="Status" value={status} options={KNOWLEDGE_STATUS_OPTIONS} onChange={setStatus} />
  <FilterSelect label="Visibility" value={visibility} options={VISIBILITY_OPTIONS} onChange={setVisibility} />
</FilterBar>
```

### Step 4.5: Add filter bar to review queue (optional)

If the review queue grows, it should have filter controls too. At minimum, reserve the pattern so adding filters later is trivial.

**Files touched:**
- `web/src/components/ui/filter-bar.tsx` (new)
- `web/src/components/ui/filter-select.tsx` (new)
- `web/src/app/(app)/tickets/page.tsx` (use FilterBar + FilterSelect)
- `web/src/app/(app)/knowledge/page.tsx` (same)

---

## Phase 5 — Standardize Typography

**Goal:** Consistent information hierarchy across all pages.

### Step 5.1: Define typography scale

Create `web/src/components/ui/typography.tsx` or add to a shared utilities file:

| Variant | Element | Classes | Usage |
|---------|---------|---------|-------|
| `page-title` | `h1` | `text-2xl font-semibold tracking-tight` | Top of each page |
| `page-description` | `p` | `text-sm text-muted-foreground` | Below page title |
| `section-title` | `h2` | `text-lg font-semibold` | Card headers, section dividers |
| `card-label` | `span` | `text-sm font-medium text-muted-foreground` | KPI labels, field labels |
| `card-value` | `span` | `text-2xl font-bold tabular-nums` | KPI values, stat numbers |
| `body` | `p` | `text-sm text-foreground` | Default body text |
| `caption` | `span` | `text-xs text-muted-foreground` | Timestamps, helper text |

### Step 5.2: Apply page title pattern consistently

Every page should follow:
```tsx
<div className="flex items-center justify-between">
  <div>
    <h1 className="text-2xl font-semibold tracking-tight">Page Title</h1>
    <p className="text-sm text-muted-foreground">Page description</p>
  </div>
  {/* Page-level actions (upload button, etc.) */}
</div>
```

Audit all pages for consistent title treatment:
- `tickets/page.tsx` — "Tickets" + subtitle
- `reviews/page.tsx` — "Review Queue" + subtitle
- `knowledge/page.tsx` — "Knowledge Base" + subtitle
- `evals/page.tsx` — "Eval Console" + subtitle

### Step 5.3: Standardize timestamps and captions

All timestamps should use the same format and the `caption` style. Check:
- Ticket list "Created" column
- Ticket detail header (created_at, updated_at)
- Message thread timestamps
- Knowledge doc timestamps
- Eval run timestamps

**Files touched:**
- `web/src/components/ui/typography.tsx` (new — optional, or just ensure consistency via Tailwind classes)
- All page files (audit and standardize title/description/timestamp styling)

---

## Phase 6 — Layout & Navigation Polish

**Goal:** The shell feels intentionally designed and stable across page transitions.

### Step 6.1: Standardize page content padding

Every page inside the `(app)` layout should use the same content padding:
```tsx
<div className="p-6">  {/* or whatever the standard is */}
```

Audit all pages and ensure consistent:
- Horizontal padding
- Top/bottom padding
- Max width (if any — currently none, which is fine for dashboard layouts)
- Gap between page header (title + filters) and main content

### Step 6.2: Polish sidebar active states

In `AppSidebar`, ensure the active nav item has a clear, intentional active style:
- Active background: `bg-primary/10` or `bg-accent`
- Active text: `text-primary` or `font-medium`
- Active icon: matching color
- Hover state for inactive items: subtle background change

Check that `isActive` logic in sidebar items produces the right visual.

### Step 6.3: Add sidebar collapse persistence

If the sidebar supports collapse (it does — `collapsible="icon"`):
- Persist collapse state to `localStorage`
- Restore on page load
- Ensure tooltips show on collapsed nav items (already configured)

### Step 6.4: Standardize page transitions

Ensure there's no layout shift when navigating between pages:
- Sidebar width should not change
- Main content area padding should not change
- Page title area should be at the same vertical position on every page

**Files touched:**
- `web/src/app/(app)/layout.tsx` (standardize content wrapper padding)
- `web/src/components/app-sidebar.tsx` (active states, collapse persistence)
- All page files (ensure consistent content padding)

---

## Phase 7 — Semantic Color Cleanup

**Goal:** Semantic colors communicate meaning consistently; no hardcoded one-off colors.

### Step 7.1: Audit hardcoded color classes

Search for raw Tailwind color classes used for semantic meaning:
- `text-red-*`, `bg-red-*` → should use `destructive` token
- `text-green-*`, `bg-green-*` → should use `success` token
- `text-yellow-*`, `bg-yellow-*` → should use `warning` token
- `text-blue-*`, `bg-blue-*` → should use `info` token (or `primary`)
- `text-teal-*`, `bg-teal-*` → evaluate if semantic or decorative

### Step 7.2: Add missing semantic tokens if needed

Check if `globals.css` has an `info` token. If not, add one:
```css
--info: oklch(0.6 0.15 250);  /* blue tone for informational states */
```

### Step 7.3: Replace hardcoded colors with tokens

- `bg-blue-100 text-blue-800 border-blue-200` (used for "open" status, "processing" knowledge status, "customer" sender) → define as an `info` semantic variant or keep as-is if it's truly decorative and consistent.
- Ticket subject link color `#0D9488` (teal) → use `text-primary` or define a `link` color token.
- Eval pass/fail icons using `text-green-600` / `text-red-600` → use `text-success` / `text-destructive`.

### Step 7.4: Ensure dark mode compatibility

Every color replacement must work in both light and dark mode. Semantic tokens from `globals.css` already have dark variants, so using them automatically fixes dark mode.

**Files touched:**
- `web/src/app/globals.css` (add missing tokens if needed)
- Components with hardcoded colors (replace with semantic tokens)

---

## Phase 8 — Detail & Form Page Polish

**Goal:** Non-dashboard pages match the same visual system.

### Step 8.1: Polish ticket detail page

The ticket detail (`tickets/[id]/page.tsx`) is the most complex page. Ensure:
- Card panels (header, messages, triage, draft, evidence, actions) use the standard card surface
- Badge components use the shared wrappers from Phase 1
- Typography matches the scale from Phase 5
- Spacing between panels is consistent

### Step 8.2: Polish login page

Ensure the login page:
- Uses the same card surface treatment
- Uses the same button styles
- Typography matches (page title, description, labels)
- Quick-login buttons are visually consistent

### Step 8.3: Polish modal/dialog content

Check all dialogs for consistent:
- Content padding
- Title typography
- Button placement (right-aligned, primary action on right)
- Input/textarea styling

Dialogs to audit:
- Reject draft dialog
- Edit draft dialog
- Knowledge upload dialog

### Step 8.4: Polish empty states

Ensure all empty states (`EmptyState` component) use:
- Consistent icon size and color
- Consistent title/description typography
- Consistent action button style

**Files touched:**
- `web/src/app/(app)/tickets/[id]/page.tsx` (use shared components)
- `web/src/app/login/page.tsx` (align styling)
- `web/src/components/knowledge/upload-dialog.tsx` (align styling)
- `web/src/components/ticket/draft-panel.tsx` (dialog styling)
- `web/src/components/ui/empty-state.tsx` (verify consistency)

---

## Implementation Order Summary

| # | Phase | Complexity | Visual Impact |
|---|-------|-----------|--------------|
| 1 | Badge system | Medium | High — badges are everywhere |
| 2 | Card surfaces | Low | Medium — already mostly consistent |
| 3 | Tables | Medium | High — tables are the main content |
| 4 | Filter bar | Low-Medium | Medium — affects all data pages |
| 5 | Typography | Low | High — affects information hierarchy |
| 6 | Layout & nav | Low-Medium | Medium — affects navigation feel |
| 7 | Semantic colors | Low | Medium — affects dark mode & consistency |
| 8 | Detail & form pages | Medium | Medium — completes the polish |

---

## Additional High-Leverage Ideas

### A. Add loading progress bar

Add a thin progress bar at the top of the page (NProgress-style) that shows during route transitions. This gives immediate feedback that navigation is happening, even before data loads.

### B. Add subtle page transition animation

A simple fade-in (`animate-in fade-in-0 duration-150`) on the main content area makes page transitions feel intentional rather than abrupt.

### C. Skeleton states that match real content

Ensure skeleton loading states match the actual content layout (same number of rows, same column widths) so there's no layout shift when data arrives.

### D. Responsive design audit

Check all pages at common breakpoints (1024px, 768px, 640px):
- Does the sidebar collapse properly on mobile?
- Do filter bars wrap correctly?
- Do tables scroll horizontally?
- Do card grids reflow?

### E. Focus and keyboard navigation

Ensure:
- Tab order is logical on all pages
- Focus rings are visible and consistent
- Buttons and links have appropriate focus styles
- Modal focus trapping works

---

## Success Criteria

- [ ] All badges across the app use the same styling system
- [ ] All cards share the same surface treatment (no inline overrides)
- [ ] All tables share the same baseline structure and hover/border treatment
- [ ] All filter bars use the same container and control styles
- [ ] Page titles, descriptions, and captions are typographically consistent
- [ ] Sidebar active states are visually clear and intentional
- [ ] No hardcoded semantic colors (red/green/yellow) — all use tokens
- [ ] Ticket detail, login, and dialog pages match the design system
- [ ] Dark mode works correctly on all surfaces
- [ ] No major page looks visually unrelated to the rest of the app
