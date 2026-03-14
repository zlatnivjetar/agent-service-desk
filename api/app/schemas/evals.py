from datetime import datetime
from typing import Any, Literal, Optional
from uuid import UUID

from pydantic import BaseModel


class EvalExample(BaseModel):
    id: UUID
    type: Literal["classification", "routing", "citation"]
    input_text: str
    expected_category: Optional[str] = None
    expected_team: Optional[str] = None
    expected_chunk_ids: Optional[list[UUID]] = None


class EvalSetListItem(BaseModel):
    id: UUID
    name: str
    description: Optional[str] = None
    example_count: int
    created_at: datetime


class EvalSetDetail(EvalSetListItem):
    examples: list[EvalExample]


class EvalResult(BaseModel):
    id: UUID
    eval_example_id: UUID
    passed: bool
    model_output: Any
    expected_output: Optional[Any] = None
    notes: Optional[str] = None


class EvalRunListItem(BaseModel):
    id: UUID
    eval_set_id: UUID
    eval_set_name: str
    prompt_version_id: UUID
    prompt_version_name: str
    status: str
    total_examples: int
    passed: int
    failed: int
    metrics: Optional[Any] = None
    created_at: datetime
    completed_at: Optional[datetime] = None


class EvalRunDetail(EvalRunListItem):
    results: list[EvalResult]


class EvalRunCreate(BaseModel):
    eval_set_id: UUID
    prompt_version_id: UUID


class MetricDiff(BaseModel):
    accuracy_a: Optional[float] = None
    accuracy_b: Optional[float] = None
    routing_accuracy_a: Optional[float] = None
    routing_accuracy_b: Optional[float] = None
    citation_hit_rate_a: Optional[float] = None
    citation_hit_rate_b: Optional[float] = None


class EvalComparison(BaseModel):
    run_a: EvalRunDetail
    run_b: EvalRunDetail
    metric_diff: MetricDiff


class PromptVersion(BaseModel):
    id: UUID
    name: str
    type: str
    is_active: bool
    created_at: datetime
