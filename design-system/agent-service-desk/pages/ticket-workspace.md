# Ticket Workspace Overrides

## Purpose

The ticket workspace is the detail view where agents read context, draft responses, run triage, and update ownership.
It should feel like a focused continuation of the queue, not a different product.

## Layout

- Shared page gutter and consistent card rhythm.
- Main message column remains dominant.
- The right rail groups AI and workflow controls into clearly separated neutral cards.

## Action Hierarchy

- `Generate Draft`, `Approve`, `Approve Edited Draft`, `Send`, `Run Triage`, and `Resolve` use the shared primary button only when they are the dominant action in their section.
- Edit, escalate, re-draft, reopen, and field updates step down to secondary or outline.
- Destructive review actions stay semantic but quieter than the primary CTA.

## Surfaces

- Message states use soft semantic surfaces, not raw teal or amber utility fills.
- Headings use shared foreground tokens.
- Metadata chips and workflow states use the shared badge family.

## Interaction Notes

- Internal notes must remain obvious through semantic treatment, not through harsh full fills.
- AI workflow panels should read as part of the same product family as the rest of the workspace.
