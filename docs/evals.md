# Evaluation Methodology

## Overview

The evaluation system measures AI pipeline quality across three dimensions: ticket classification accuracy, team routing accuracy, and knowledge citation hit rate. It enables prompt version comparison so team leads can validate improvements before activating a new prompt in production.

## Eval Set Structure

An **eval set** is a named collection of **eval examples**, each with a type, input text, and expected output:

| Field | Description |
|---|---|
| `type` | One of: `classification`, `routing`, `citation` |
| `input_text` | Ticket text or combined input to feed the model |
| `expected_category` | Expected ticket category (for `classification` type) |
| `expected_team` | Expected team assignment (for `routing` type) |
| `expected_chunk_ids` | Expected knowledge chunk UUIDs (for `citation` type) |

The seed data includes three eval sets:

| Set Name | Type | Examples | Purpose |
|---|---|---|---|
| Classification Accuracy | `classification` | 60 | Tests category prediction (billing, bug_report, etc.) |
| Routing Accuracy | `routing` | 60 | Tests team assignment (engineering, billing_team, etc.) |
| Citation Quality | `citation` | 30 | Tests evidence retrieval relevance |

## Metrics

### Classification Accuracy

For each example, the model's `predicted_category` is compared to `expected_category`. An example passes if they match exactly.

**Metric**: `accuracy = passed / total`

### Routing Accuracy

For each example, the model's `predicted_team` is compared to `expected_team`. An example passes if they match exactly.

**Metric**: `routing_accuracy = passed / total`

### Citation Hit Rate

For each example, the model generates a draft and the retrieved `evidence_chunk_ids` are compared against `expected_chunk_ids`. An example passes if there is any overlap between the retrieved and expected chunk sets.

**Metric**: `citation_hit_rate = passed / total`

### Aggregate Metrics

Each completed eval run stores a `metrics` JSON object:

```json
{
  "accuracy": 0.90,
  "routing_accuracy": 0.85,
  "citation_hit_rate": 0.73,
  "avg_confidence": 0.82,
  "avg_latency_ms": 1250
}
```

## Prompt Versioning

Prompts are versioned in the `prompt_versions` table with two types: `triage` and `draft`. Each type has at most one active version (enforced by a partial unique index).

| Field | Description |
|---|---|
| `name` | Human-readable name (e.g., "triage-v2", "draft-v1") |
| `type` | `triage` or `draft` |
| `content` | The full prompt template text |
| `is_active` | Whether this version is currently used in production |

The seed data includes four prompt versions:

| Name | Type | Active | Description |
|---|---|---|---|
| triage-v1 | triage | No | Basic classification prompt |
| triage-v2 | triage | Yes | Improved prompt with examples |
| draft-v1 | draft | No | Simple drafting prompt |
| draft-v2 | draft | Yes | Enhanced prompt with citation instructions |

When running an eval, you select which prompt version to test against. This allows A/B comparison between prompt iterations without changing production behavior.

## Running Evaluations

### From the UI (Team Lead only)

1. Navigate to the **Eval Console** tab
2. In the **Run Evaluation** tab:
   - Select an eval set (e.g., "Classification Accuracy")
   - Select a prompt version (e.g., "triage-v2")
   - Click "Run Evaluation"
3. The run starts in the background. The **Runs** tab auto-refreshes every 5 seconds while the run is active.
4. Once completed, expand a run to see per-example pass/fail results with model output.

### From the API

```bash
# Create and start an eval run
POST /eval/runs
{
  "eval_set_id": "<eval-set-uuid>",
  "prompt_version_id": "<prompt-version-uuid>"
}

# Check run status
GET /eval/runs/{run_id}

# List all runs
GET /eval/runs
```

## Comparing Evaluations

The comparison feature enables side-by-side analysis of two eval runs:

### From the UI

1. In the **Runs** tab, check exactly two completed runs
2. The **Compare** tab activates with a badge showing "2 selected"
3. Switch to the Compare tab to see:
   - **Metrics side-by-side**: Each metric shown for both runs with colored deltas (green for improvement, red for regression)
   - **Per-example comparison**: Each example shows both runs' results, with amber highlighting where results differ

### From the API

```bash
GET /eval/runs/compare?run_a_id=<uuid>&run_b_id=<uuid>
```

Returns:

```json
{
  "run_a": { "id": "...", "metrics": {...}, ... },
  "run_b": { "id": "...", "metrics": {...}, ... },
  "metric_diff": {
    "accuracy": 0.033,
    "routing_accuracy": -0.017,
    "citation_hit_rate": 0.10
  },
  "per_example": [
    {
      "example_id": "...",
      "input_text": "...",
      "result_a": { "passed": true, "model_output": {...} },
      "result_b": { "passed": false, "model_output": {...} }
    }
  ]
}
```

## Background Execution

Eval runs execute as FastAPI `BackgroundTasks`:

1. `POST /eval/runs` creates the run record with `status = 'pending'` and triggers the background task
2. The task iterates through all examples in the eval set
3. For each example, it runs the appropriate AI pipeline (triage for classification/routing, draft for citation)
4. Each result is written individually with its own database connection — a failure in one example is caught, recorded as `passed = false` with error notes, and execution continues
5. After all examples complete, aggregate metrics are computed and the run transitions to `status = 'completed'`

### Status Lifecycle

```
pending → running → completed
                  → failed (only on total failure, not individual example failures)
```
