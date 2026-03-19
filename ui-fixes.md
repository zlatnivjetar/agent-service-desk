# UI Fixes

This document is meant for an agent applying a UI overhaul to a new dashboard-style codebase. Treat these as implementation rules, not vague design goals. The objective is to create one coherent system so the product stops looking like separate pages built at different times.

## Priority Order

1. Standardize shared primitives.
2. Standardize badges, tables, cards, and filters.
3. Standardize layout shell and spacing.
4. Standardize chart styling and typography.
5. Clean up one-off colors and duplicated component styles.

## Non-Negotiable Rules

### 1. Badges must use one shared style system

This is mandatory.

Rules:

- All badges across the codebase must use the same base badge component.
- Status badges, priority badges, plan badges, and any similar chips must share:
  - the same padding
  - the same border radius
  - the same text sizing
  - the same border treatment
  - the same visual density
- Dot colors, icon colors, and label mappings must come from one central style map.
- Do not leave inline badge color maps duplicated inside feature components.

Implementation target:

- Create one canonical source for badge styling, for example:
  - `STATUS_STYLES`
  - `PRIORITY_STYLES`
  - `PLAN_STYLES`
- Create thin wrappers like:
  - `StatusBadge`
  - `PriorityBadge`
  - `PlanBadge`

Expected result:

- Every badge in the product looks like it belongs to the same system.

### 2. Cards must use one surface style

Rules:

- Create one shared card primitive and route all dashboard surfaces through it.
- In light mode, cards should be true white or a single shared card token, not a mix of gray, off-white, and arbitrary tinted panels.
- Use the same:
  - border
  - corner radius
  - shadow strength
  - header padding
  - content padding

Expected result:

- KPI cards, chart cards, detail cards, and secondary panels all look related.

### 3. Tables must use one table system

Rules:

- All data tables must use the same table primitive or styling contract.
- Standardize:
  - header height
  - cell padding
  - row borders
  - hover background
  - empty state styling
  - pagination footer treatment
- If a table needs custom behavior, extend the base table styling instead of rebuilding from scratch.

Expected result:

- Team tables, ticket tables, client tables, and analytics tables all share the same baseline structure.

### 4. Filters must use one filter bar pattern

Rules:

- Use a single filter-bar container style across all data pages.
- Use the same trigger style for date filters, multiselect filters, and select filters.
- Reset/clear actions must follow the same placement and button style everywhere.
- If some pages need fewer filters, hide controls with configuration. Do not create an entirely different filter UI.

Standardize:

- container background
- border
- radius
- padding
- control height
- control background
- control hover state
- clear/reset behavior

Expected result:

- Dashboard, response-time, team, portal, and other filtered pages feel like they use one filtering system.

## Core Design-System Rules

### 5. Centralize tokens

Rules:

- Define tokens for:
  - background
  - foreground
  - card
  - border
  - muted
  - primary
  - destructive
  - success
  - warning
  - info
  - chart colors
- Replace raw one-off Tailwind palette classes with semantic tokens where possible.

Expected result:

- UI updates happen in one place instead of dozens of components.

### 6. Standardize typography

Rules:

- Create shared typography utilities or component-level text variants for:
  - page titles
  - section titles
  - card labels
  - card values
  - table text
  - captions
- Do not let each page choose its own heading sizes and helper-text styles.

Expected result:

- Information hierarchy is consistent across the whole app.

### 7. Standardize spacing and page rhythm

Rules:

- Use one default page padding pattern for dashboard pages.
- Use one default gap scale for:
  - sections
  - card grids
  - chart rows
  - form groups
- Keep page sections aligned so screens do not jump between different horizontal rhythms.

Expected result:

- Pages feel calm and deliberate instead of crowded or randomly spaced.

## Layout Rules

### 8. Use one shared application shell

Rules:

- Dashboard and portal/admin surfaces should use the same shell pattern unless there is a product reason not to.
- Standardize:
  - sidebar width and collapse behavior
  - main content scrolling region
  - top-right utility actions such as theme toggle
  - page padding inside the main shell

Expected result:

- Navigation feels stable and cross-page transitions feel coherent.

### 9. Sidebar and nav must be treated as product UI, not scaffolding

Rules:

- Use one active-state treatment for nav items.
- Use one icon sizing rule.
- Use one hover state rule.
- If the sidebar collapses, preserve usability with tooltips or equivalent.
- Persist collapse state if the app is navigation-heavy.

Expected result:

- The shell feels intentionally designed, not temporary.

## Chart Rules

### 10. Charts must use one theme and one control language

Rules:

- Centralize chart colors in a shared chart-theme helper.
- Standardize:
  - grid color
  - axis color
  - tooltip background/border/text
  - legend text sizing
  - view toggle controls
- Use the same segmented-control treatment for chart mode toggles.

Expected result:

- Different charts feel like parts of one reporting suite.

### 11. Tooltips must be styled consistently

Rules:

- Use a shared tooltip renderer or shared tooltip styling helper.
- Do not style each chart tooltip independently.

Expected result:

- Cross-chart interaction feels consistent.

## Semantic Styling Rules

### 12. Replace hardcoded semantic colors with shared rules

Rules:

- Error states should use the same destructive token.
- Positive deltas should use the same success token.
- Warning states should use the same warning token.
- Do not leave scattered hardcoded `text-red-*`, `bg-yellow-*`, `bg-blue-*`, etc. when those colors represent semantic meaning.

Expected result:

- Color communicates meaning consistently.

### 13. Keep status and priority hierarchy explicit

Rules:

- Priority should have one consistent visual hierarchy throughout the app.
- Status should have one consistent visual hierarchy throughout the app.
- If urgency needs extra emphasis, apply it the same way everywhere.

Expected result:

- A user can learn the visual language once and reuse it everywhere.

## Page-Level Overhaul Guidance

### 14. Start with the highest-visibility surfaces

Apply shared UI rules first to:

1. KPI cards
2. main dashboard charts
3. primary data tables
4. filter bars
5. sidebar/nav

Reason:

- These are the surfaces users see immediately, so consistency there changes the whole feel of the product fastest.

### 15. Then fix detail and form screens

Apply the same shared system to:

- ticket detail pages
- forms
- auth pages
- feedback modules
- modal or popover content

Reason:

- A dashboard overhaul feels incomplete if only the landing page is polished.

## Minimal Agent Checklist

When applying UI fixes to a new codebase, do this:

1. Create or standardize the shared primitives for badge, card, table, button, input, and filter controls.
2. Centralize semantic tokens and badge style maps.
3. Replace duplicated inline badge styles with shared badge wrappers.
4. Replace one-off card/table/filter styling with shared primitives.
5. Standardize page titles, captions, and KPI typography.
6. Standardize shell layout, spacing, and navigation states.
7. Standardize chart theme, toggles, and tooltips.
8. Remove raw one-off semantic colors that should come from the design system.

## Success Criteria

You are done when:

- badges throughout the codebase use the same styling
- all cards share the same surface treatment
- all tables share the same baseline look
- all filter bars share the same structure and controls
- page spacing and typography feel unified
- charts look like one system instead of separate experiments
- no major screen looks visually unrelated to the rest of the app
