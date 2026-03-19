# Ticket Queue Overrides

## Purpose

The ticket queue is a high-density operations table.
It should optimize for scanning, filtering, and quick status recognition.

## Layout

- Full-width content inside the shared app gutter.
- Header pattern: page title, muted total count, then filter row.
- Keep the table dominant. Avoid decorative summary blocks above it.

## Content Hierarchy

- Subject is the primary text column and should render as normal foreground text.
- Brand color appears only on hover, focus, or active navigation.
- Category, assignee, org, confidence, and created columns stay neutral and low-noise.

## Controls

- Filters use shared neutral controls.
- Clear filters stays ghost.
- Pagination stays outline.

## Badge Usage

- Status and priority both use the shared neutral badge plus colored dot pattern.
- Do not introduce per-column badge styling.

## Density Rules

- Preserve readable column spacing, but prefer compact rows over decorative whitespace.
- Truncation is acceptable for long subjects if the full value is available on hover.
