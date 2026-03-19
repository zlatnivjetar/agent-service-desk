# Agent Service Desk Design System

> Read the page override in `design-system/agent-service-desk/pages/[page-name].md` first.
> If a page file exists, it narrows or clarifies the rules below.
> If no page file exists, this master file is the source of truth.

## Product Direction

Agent Service Desk is a dense enterprise workspace for agents and team leads.
The interface should feel calm, reliable, and operational rather than loud or promotional.

Core principles:

- Teal is the only brand accent for primary actions, active states, and selected controls.
- Surfaces stay neutral. Cards, tables, chips, and sidebars should not introduce extra accent fills.
- Semantic colors are reserved for meaning: success, warning, danger, info, neutral.
- Shared primitives decide the look. Pages should not hard-code button or badge colors.

## Core Tokens

### Brand

| Token | Role |
| --- | --- |
| `--primary` | Primary actions, active tabs, selected states |
| `--primary-foreground` | Text on primary buttons |
| `--primary-soft` | Brand-tinted banners and selected containers |
| `--primary-border` | Borders for brand-tinted surfaces |
| `--primary-hover` | Hover state for primary actions |

### Semantics

| Token | Use |
| --- | --- |
| `--success` | Resolved, completed, approved, indexed, high confidence |
| `--warning` | Pending, escalated, needs attention, high priority |
| `--destructive` | Failed, rejected, critical |
| `--info` | Open, processing, customer-facing informational states |
| `--neutral` | Closed, internal, system, unknown, low-emphasis states |

Each semantic color can also have soft and border companions for low-contrast surfaces:

- `--success-soft`, `--success-border`
- `--warning-soft`, `--warning-border`
- `--destructive-soft`, `--destructive-border`
- `--info-soft`, `--info-border`
- `--neutral-soft`, `--neutral-border`

### Surfaces

| Token | Use |
| --- | --- |
| `--background` | App background |
| `--card` | Cards, tables, dialogs |
| `--muted` | Soft neutral fills and selected rows |
| `--border` | Shared border token |
| `--input` | Input and control borders |

## Typography

- Font family: Inter
- Headings: compact, high-contrast, no decorative color fills
- Body text: neutral foreground with muted copy only where hierarchy requires it

## Spacing And Rhythm

- Use a 4px / 8px spacing rhythm.
- App shell padding should be consistent across Tickets, Reviews, Knowledge, Evals, and ticket detail.
- Page headers should use one vertical pattern: title, then subdued metadata line.
- Dense tables and card lists should align to the same content gutter instead of adding page-specific padding stacks.

## Button Hierarchy

There should be one dominant action per card, row, panel, or dialog.

- `default`: brand teal primary button
- `secondary`: low-contrast filled neutral
- `outline`: neutral outline
- `ghost`: text-only or icon-only
- `destructive`: subdued danger treatment, never louder than the primary action

Rules:

- Remove orange CTAs entirely.
- Do not create page-level primary button colors.
- If a row already has a primary action, every other action in that row must step down to secondary, outline, ghost, or destructive.

## Badge Pattern

All read-only status chips use the same structure:

- very light neutral background
- subtle border
- dark readable text
- small colored dot on the left
- rounded capsule shape with consistent height and padding

Tone mapping:

- brand: new, client visible, agent-owned, selected count
- info: open, customer, processing
- warning: pending customer, pending internal, pending review, high priority, escalated
- success: resolved, indexed, completed, approved, high confidence
- danger: failed, rejected, critical
- neutral: closed, internal, system, unknown, low priority

Avoid:

- full-fill pills for routine statuses
- black fallback badges
- one-off badge recipes in page code

## Page Behaviors

- Table subject text is normal foreground text. Brand color appears on hover or active interaction, not by default.
- Selection banners and compare states may use `--primary-soft` plus `--primary-border`.
- Message states and AI workflow panels should use soft semantic surfaces instead of saturated utility fills.
- Sidebar branding, avatar fallbacks, and app-level brand marks must come from tokens, not literal hex values.

## Anti-Patterns

- Orange primary actions
- Black default badges
- Hard-coded heading colors
- Raw utility colors such as `bg-blue-100`, `bg-amber-50`, `bg-white`, or literal hex values in page code when shared tokens exist
- Multiple competing CTAs in one action cluster
- Status meaning communicated only by background fill without readable text

## Delivery Checklist

- Shared primitives render the intended teal-led hierarchy without page overrides.
- Buttons follow one action hierarchy across all main product surfaces.
- Status, priority, visibility, confidence, and review outcome chips all use the neutral badge-with-dot pattern.
- Tickets, Reviews, Knowledge, Evals, and ticket detail feel like one product family.
- Design docs describe the actual enterprise service desk experience rather than unrelated marketing templates.
