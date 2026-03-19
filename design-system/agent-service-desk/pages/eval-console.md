# Eval Console Overrides

## Purpose

The eval console is an analysis workspace with three surfaces:

- Run evaluation
- Review runs
- Compare two runs

It should inherit the same enterprise shell as the rest of the product while allowing denser data presentation.

## Layout

- Shared page gutter only.
- Title and description follow the standard header rhythm.
- Tabs should feel neutral, with brand reserved for active and selected states.

## Brand Usage

- `Run Evaluation` and `Compare` are primary brand actions.
- Selected-run banners and compare counters may use `--primary-soft` and `--primary-border`.
- Do not use literal teal fills or separate CTA colors.

## Metrics And States

- Run status chips use the shared badge pattern.
- Metric deltas use semantic text color only where meaning changes.
- Comparison panels use shared surface tokens instead of raw white utility fills.
- Highlighted differences may use warning-soft backgrounds, not saturated amber blocks.
