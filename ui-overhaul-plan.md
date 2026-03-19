# UI Overhaul Plan

## Objective

Finish the UI overhaul by turning the remaining mixed styling into one coherent system:

- Teal is the only brand accent for primary actions and active states.
- Orange is removed from action styling.
- Badges become neutral capsules with a colored dot and readable dark text.
- Semantic colors are reserved for meaning, not for random page-level decoration.
- Shared primitives become trustworthy again so pages stop hard-coding colors.

## Audit Summary

### 1. The current source of truth is stale

- `design-system/agent-service-desk/MASTER.md` still defines orange as the CTA accent and describes a "vibrant and block-based" style that does not match the current product direction.
- `design-system/agent-service-desk/pages/ticket-queue.md` and `design-system/agent-service-desk/pages/review-queue.md` are clearly off-target and describe unrelated page types.
- `ui-fix-plan.md` documents an earlier state of the app. Some of its proposed primitives already exist, but the codebase still bypasses them.

Implication:

- The product has no reliable design source of truth right now. That increases drift every time a new page or control is touched.

### 2. Shared primitives still encode the wrong defaults

- `web/src/app/globals.css` sets `--primary` to a near-black value, so the default button and badge styling resolves to black instead of teal.
- `web/src/components/ui/badge.tsx` uses a filled default badge variant. `web/src/components/ui/status-badges.tsx` does not override that variant, so any style map entry without an explicit background becomes a black pill.
- `web/src/lib/badge-styles.ts` mixes true semantic styles with one-off color recipes like blue utility classes and neutral fallbacks that accidentally inherit the black badge base.
- `web/src/components/ui/button.tsx` still pushes teams toward page-level overrides because the global brand hierarchy is wrong and the default action color is not the intended brand color.

Implication:

- The "unstyled" look is not only page-specific. It starts in the primitives.

### 3. Token bypassing is widespread

Hard-coded colors are still present in production page code, including:

- `web/src/app/(app)/tickets/page.tsx`
- `web/src/app/(app)/reviews/page.tsx`
- `web/src/app/(app)/evals/page.tsx`
- `web/src/components/eval/run-eval-form.tsx`
- `web/src/components/eval/eval-runs-list.tsx`
- `web/src/components/eval/eval-comparison.tsx`
- `web/src/components/ticket/draft-panel.tsx`
- `web/src/components/ticket/reply-box.tsx`
- `web/src/components/ticket/ticket-actions.tsx`
- `web/src/components/ticket/triage-panel.tsx`
- `web/src/components/ticket/message-thread.tsx`
- `web/src/components/ticket/ticket-header.tsx`
- `web/src/components/app-sidebar.tsx`

Patterns found:

- literal orange CTA buttons
- literal teal text and banners
- literal dark heading colors
- raw white surfaces in some eval panels
- raw amber and teal fills in message states

### 4. The issues are broader than the screenshots

The screenshots correctly show unfinished styling on Tickets, Reviews, Knowledge, and Evals, but the same drift continues in the ticket workspace:

- Draft actions still use orange buttons.
- Reply send action still uses orange.
- Triage and resolve actions use literal teal instead of the shared button system.
- Message state backgrounds use raw amber and teal surfaces outside the token system.
- Page titles and state cards still use literal heading colors.

## Target Visual System

### Brand and color hierarchy

Use one restrained hierarchy:

- Brand teal for primary actions, active tabs, selected states, focused controls, and intentional links on hover.
- Neutral surfaces for cards, tables, chips, and secondary actions.
- Semantic colors only for meaning:
  - success
  - warning
  - danger
  - info
  - neutral

Recommended token shape:

- brand: `--primary`, `--primary-foreground`, `--primary-soft`, `--primary-border`, `--primary-hover`
- semantics: `--success`, `--warning`, `--destructive`, `--info`, `--neutral`
- surfaces: `--card`, `--muted`, `--border`, `--background`

### Badge pattern

All badges should use the same structure:

- very light neutral background
- subtle border
- dark readable label text
- small colored dot at the left
- no full-fill pills for normal status chips

Use semantic dots instead of full semantic fills:

- brand: new, client visible, agent-owned, selected count
- info: open, customer
- warning: pending customer, pending internal, high priority, escalated
- success: resolved, indexed, completed, approved, high confidence
- danger: failed, rejected, critical
- neutral: closed, internal, system, unknown, low priority

### Button hierarchy

Buttons need one clear action hierarchy:

- `default`: teal primary
- `secondary`: low-contrast filled neutral
- `outline`: neutral outline
- `ghost`: text-only or icon-only
- `destructive`: subdued danger treatment, not a loud second CTA

Page rule:

- each row, card, dialog, or panel should have one dominant CTA at most
- all other actions should be secondary, outline, ghost, or subdued destructive

## Implementation Plan

### Phase 0 - Repair the source of truth

Files:

- `design-system/agent-service-desk/MASTER.md`
- `design-system/agent-service-desk/pages/ticket-queue.md`
- `design-system/agent-service-desk/pages/review-queue.md`
- `design-system/agent-service-desk/pages/knowledge-upload.md`
- `design-system/agent-service-desk/pages/eval-console.md`
- `ui-overhaul-plan.md`

Tasks:

- Replace the stale orange-led design guidance with the new teal-led, neutral enterprise direction.
- Remove irrelevant page narratives so the page docs describe the actual product surfaces.
- Document the badge pattern explicitly: neutral chip plus colored dot.
- Document action hierarchy explicitly: one primary action, everything else de-emphasized.

Acceptance criteria:

- Design docs no longer recommend orange CTAs for this product.
- Page-level design notes match the actual app instead of unrelated templates.

### Phase 1 - Fix global tokens and primitive defaults

Files:

- `web/src/app/globals.css`
- `web/src/components/ui/button.tsx`
- `web/src/components/ui/badge.tsx`
- `web/src/components/ui/alert.tsx`

Tasks:

- Change the core primary token from black to teal.
- Add missing semantic support for `info` and `neutral` states.
- Update button variants so the shared primary button is teal by default.
- Clean up button hover and focus behavior so pages do not need custom color overrides just to feel interactive.
- Redefine the shared badge base so status badges start from a neutral surface, not a filled primary pill.
- Normalize alert styling so warnings and informational states align with the new semantic palette.

Acceptance criteria:

- A plain `<Button>` renders as the intended teal primary button.
- A plain status badge does not render as a black pill.
- Hover, focus, and disabled states are consistent across default buttons.

### Phase 2 - Rebuild the badge system around one reusable pattern

Files:

- `web/src/lib/badge-styles.ts`
- `web/src/components/ui/badge.tsx`
- `web/src/components/ui/status-badges.tsx`
- `web/src/components/ticket/ticket-ui.tsx`

Tasks:

- Replace the current `className`-only badge map with a more structured shape, for example:
  - `label`
  - `tone`
  - `dotClassName`
  - optional `emphasis`
- Build one shared badge presentation for all read-only status chips.
- Make the colored dot part of the shared badge component, not copied per page.
- Convert neutral and fallback states away from the accidental black background.
- Shorten overly verbose badge copy where density matters, especially confidence-related chips.
- Keep the wrapper components thin and semantic:
  - `TicketStatusBadge`
  - `TicketPriorityBadge`
  - `KnowledgeStatusBadge`
  - `ApprovalOutcomeBadge`
  - `ConfidenceBadge`
  - `SenderBadge`
  - `VisibilityBadge`
  - `EvalRunStatusBadge`
  - `RoleBadge`

Acceptance criteria:

- All badges share spacing, height, typography, border treatment, and dot placement.
- Pending, unknown, internal, and fallback badges no longer appear black or unreadable.
- Confidence, status, priority, and visibility chips all look like members of the same family.

### Phase 3 - Standardize buttons and action density

Files:

- `web/src/components/ui/button.tsx`
- `web/src/app/(app)/reviews/page.tsx`
- `web/src/app/(app)/knowledge/page.tsx`
- `web/src/components/eval/run-eval-form.tsx`
- `web/src/components/eval/eval-runs-list.tsx`
- `web/src/components/ticket/draft-panel.tsx`
- `web/src/components/ticket/reply-box.tsx`
- `web/src/components/ticket/ticket-actions.tsx`
- `web/src/components/ticket/triage-panel.tsx`

Tasks:

- Remove every literal orange CTA override and replace it with the shared primary button variant.
- Replace literal teal overrides with token-driven shared variants.
- De-emphasize secondary actions in crowded action groups.

Specific action rules:

- Reviews:
  - `Approve` stays primary.
  - `Edit` becomes secondary or outline.
  - `Reject` becomes subdued destructive.
  - `Escalate` becomes outline or ghost.
- Knowledge:
  - `Upload Document` becomes the shared primary teal button.
  - `View chunks` stays outline.
  - delete stays ghost destructive.
- Evals:
  - `Run Evaluation` and `Compare` use the shared primary button.
  - selection banners and tab counters use tokenized teal, not literal teal classes.
- Ticket workspace:
  - `Generate Draft`, `Approve`, `Approve Edited Draft`, and `Send` use the shared primary button.
  - `Reject` and destructive confirmations remain semantic but visually quieter than the primary CTA.

Acceptance criteria:

- `#F97316` is removed from runtime UI code.
- Buttons no longer compete with each other inside the same row or panel.
- The primary action is visually obvious without turning the page into a multi-color control cluster.

### Phase 4 - Page-specific cleanup

#### Tickets

Files:

- `web/src/app/(app)/tickets/page.tsx`

Tasks:

- Change subject text from teal to normal foreground text.
- Keep hover and focus styling subtle, for example underline plus brand tint on interaction only.
- Apply the rebuilt status and priority badge system.
- Leave the other table columns largely as-is unless needed for spacing or alignment.

Acceptance criteria:

- Subject reads like table content, not like a permanent highlighted link.
- Status and priority chips look intentional and readable.

#### Reviews

Files:

- `web/src/app/(app)/reviews/page.tsx`

Tasks:

- Apply the new confidence badge styling.
- Reduce action noise by enforcing the single-primary-button rule.
- Keep card content hierarchy intact while making the right-hand control column calmer.

Acceptance criteria:

- Review cards no longer feel rainbow-colored.
- Confidence chips and action buttons match the rest of the app.

#### Knowledge

Files:

- `web/src/app/(app)/knowledge/page.tsx`
- `web/src/components/knowledge/upload-dialog.tsx`

Tasks:

- Replace the black top-right button with the shared primary teal action.
- Apply the shared badge system to document status and visibility.
- Keep `View chunks` as a neutral secondary control.
- Ensure upload dialog actions inherit the same button hierarchy.

Acceptance criteria:

- Knowledge page matches the rest of the product without introducing a new black CTA style.

#### Eval Console

Files:

- `web/src/app/(app)/evals/page.tsx`
- `web/src/components/eval/run-eval-form.tsx`
- `web/src/components/eval/eval-runs-list.tsx`
- `web/src/components/eval/eval-comparison.tsx`

Tasks:

- Replace hard-coded heading colors with shared text tokens.
- Restyle status chips, compare banners, count pills, and metrics so they use the shared system.
- Replace raw white panels in comparison view with shared surface tokens.
- Replace emerald/red/amber utility colors with semantic tokens.
- Keep selected and compare states brand-led but calmer than the current teal banner treatment.

Acceptance criteria:

- The Eval Console feels like part of the same product as Tickets and Knowledge.
- Status chips, metric deltas, and compare UI all follow the new semantic system.

#### Ticket workspace

Files:

- `web/src/app/(app)/tickets/[id]/page.tsx`
- `web/src/components/ticket/ticket-header.tsx`
- `web/src/components/ticket/draft-panel.tsx`
- `web/src/components/ticket/reply-box.tsx`
- `web/src/components/ticket/ticket-actions.tsx`
- `web/src/components/ticket/triage-panel.tsx`
- `web/src/components/ticket/message-thread.tsx`

Tasks:

- Remove orange CTAs and literal teal action overrides.
- Replace hard-coded heading colors with shared text tokens.
- Convert message state fills to tokenized soft surfaces instead of raw teal and amber utility colors.
- Replace the checkbox accent override with token-based control styling.
- Keep AI workflow panels visually connected to the rest of the app rather than looking like a different design pass.

Acceptance criteria:

- Ticket detail no longer breaks the visual language established on the list pages.

#### App shell and layout

Files:

- `web/src/app/(app)/layout.tsx`
- `web/src/components/app-sidebar.tsx`
- `web/src/components/page-breadcrumb.tsx`

Tasks:

- Standardize content padding across pages. Right now layout uses `p-4` while some pages add their own `p-6`.
- Replace literal teal branding fills with token-driven brand styling in the sidebar logo and avatar fallback.
- Ensure page headers, breadcrumbs, and content containers keep a consistent rhythm.

Acceptance criteria:

- Moving between Tickets, Reviews, Knowledge, Evals, and ticket detail feels spatially consistent.

### Phase 5 - Cleanup and verification

Files:

- all touched files above

Tasks:

- Run lint in `web/`.
- Manually review the following pages in desktop and tablet widths:
  - `/tickets`
  - `/tickets/[id]`
  - `/reviews`
  - `/knowledge`
  - `/evals` with `run`, `runs`, and `compare` tabs
- Grep for leftover raw color drift.

Recommended verification commands:

```powershell
cd web
npm run lint
```

```powershell
rg -n "#F97316|#EA6A0A|#0D9488|#0F172A" web/src
```

```powershell
rg -n "bg-blue-100|text-blue-800|border-blue-200|bg-teal-50|bg-amber-50|bg-white" web/src
```

Acceptance criteria:

- No orange CTA classes remain in app UI code.
- Hard-coded teal and dark text values are replaced by tokens or justified brand uses.
- Badge rendering is consistent across all pages.
- Buttons follow one action hierarchy.
- The stale design docs are no longer pointing the team in the wrong direction.

## Definition of Done

The overhaul is complete when all of the following are true:

- teal is the only non-semantic brand action color
- status and priority chips use the neutral badge plus dot pattern
- Tickets, Reviews, Knowledge, Evals, and ticket detail all use the same action hierarchy
- there are no accidental black buttons or black fallback badges
- page code is no longer compensating for broken primitive defaults with literal colors
- the design docs describe the actual product direction instead of an outdated one
