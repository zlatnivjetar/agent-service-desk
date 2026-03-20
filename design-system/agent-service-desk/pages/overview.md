# Overview Overrides

## Purpose

The overview page is an operational dashboard, not a BI canvas.
It should surface queue risk, movement, and change over time in one calm, scannable view.

## Chart Rules

- Use restrained chart chrome: soft grids, visible labels, and minimal decorative ink.
- Keep workflow order for status views instead of sorting bars by count.
- Compare mode should add context, not another dashboard row. Use previous-period overlays and KPI deltas rather than duplicating cards.
- Important values should remain visible without hover. Tooltips can add detail, but they should not carry the primary meaning.

## Color Semantics

- Status colors follow the shared badge map:
  - `new` = strongest neutral
  - `open` = brand teal
  - `pending_customer` = warning amber
  - `pending_internal` = warning amber
  - `resolved` = muted sage
  - `closed` = soft neutral slate
- Priority colors follow the shared badge map:
  - `low` = neutral slate
  - `medium` = brown
  - `high` = warning amber
  - `critical` = deep terracotta
- Keep chart surfaces mostly neutral. Color should identify the status or priority, not flood the whole card.

## Age Matrix Pattern

- Represent ticket age by priority as a matrix, with age buckets as columns and priority bands as rows.
- Each cell must show the count directly and remain clickable.
- Use row-level priority color plus fill intensity for count, so color is not the only cue.
- Selected state must be obvious through border or ring treatment, not only fill.

## Compare Mode

- Place `Compare to previous` beside the date controls.
- For all ranges, compare against the immediately preceding window of equal length.
- KPI deltas should read as concise chips, with improvement/worsening tone based on the metric meaning.
- The daily volume chart is the only historical overlay. Backlog and age views stay as current-state operational snapshots.
