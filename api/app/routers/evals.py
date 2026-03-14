from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from psycopg import Connection

from app.auth import CurrentUser, get_current_user
from app.deps import get_rls_db
from app.queries import evals as q
from app.schemas.common import PaginatedResponse
from app.schemas.evals import (
    EvalComparison,
    EvalExample,
    EvalRunCreate,
    EvalRunDetail,
    EvalRunListItem,
    EvalSetDetail,
    EvalSetListItem,
    MetricDiff,
)

router = APIRouter()


def require_role(user: CurrentUser, allowed: list[str]) -> None:
    if user.role not in allowed:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Role '{user.role}' cannot access this resource",
        )


def _build_run_detail(run: dict, conn: Connection) -> EvalRunDetail:
    results_rows = q.get_eval_run_results(conn, str(run["id"]))
    return EvalRunDetail(
        **{k: run[k] for k in run},
        results=results_rows,
    )


@router.get("/sets", response_model=list[EvalSetListItem])
def list_eval_sets(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Connection, Depends(get_rls_db)],
):
    require_role(user, ["team_lead"])
    rows = q.list_eval_sets(db)
    return [EvalSetListItem.model_validate(row) for row in rows]


@router.get("/sets/{set_id}", response_model=EvalSetDetail)
def get_eval_set(
    set_id: UUID,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Connection, Depends(get_rls_db)],
):
    require_role(user, ["team_lead"])
    row = q.get_eval_set(db, str(set_id))
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Eval set not found")
    examples = q.get_eval_set_examples(db, str(set_id))
    return EvalSetDetail(
        **{k: row[k] for k in row},
        examples=[EvalExample.model_validate(e) for e in examples],
    )


@router.get("/sets/{set_id}/examples", response_model=PaginatedResponse)
def list_eval_examples(
    set_id: UUID,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Connection, Depends(get_rls_db)],
    page: int = Query(1, ge=1),
    per_page: int = Query(25, ge=1, le=100),
):
    require_role(user, ["team_lead"])
    row = q.get_eval_set(db, str(set_id))
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Eval set not found")
    total, rows = q.list_eval_examples(db, str(set_id), page, per_page)
    items = [EvalExample.model_validate(r) for r in rows]
    return PaginatedResponse(
        items=items,
        total=total,
        page=page,
        per_page=per_page,
        total_pages=(total + per_page - 1) // per_page,
    )


# /runs/compare must be registered before /runs/{run_id} to avoid UUID parsing "compare"
@router.get("/runs/compare", response_model=EvalComparison)
def compare_eval_runs(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Connection, Depends(get_rls_db)],
    run_a_id: UUID = Query(...),
    run_b_id: UUID = Query(...),
):
    require_role(user, ["team_lead"])

    run_a = q.get_eval_run(db, str(run_a_id))
    if run_a is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="run_a not found")

    run_b = q.get_eval_run(db, str(run_b_id))
    if run_b is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="run_b not found")

    if run_a["eval_set_id"] != run_b["eval_set_id"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Runs must belong to the same eval set to be compared",
        )

    detail_a = _build_run_detail(run_a, db)
    detail_b = _build_run_detail(run_b, db)

    metrics_a = run_a["metrics"] or {}
    metrics_b = run_b["metrics"] or {}
    metric_diff = MetricDiff(
        accuracy_a=metrics_a.get("accuracy"),
        accuracy_b=metrics_b.get("accuracy"),
        routing_accuracy_a=metrics_a.get("routing_accuracy"),
        routing_accuracy_b=metrics_b.get("routing_accuracy"),
        citation_hit_rate_a=metrics_a.get("citation_hit_rate"),
        citation_hit_rate_b=metrics_b.get("citation_hit_rate"),
    )

    return EvalComparison(run_a=detail_a, run_b=detail_b, metric_diff=metric_diff)


@router.post("/runs", response_model=EvalRunListItem, status_code=status.HTTP_201_CREATED)
def create_eval_run(
    body: EvalRunCreate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Connection, Depends(get_rls_db)],
):
    require_role(user, ["team_lead"])
    total = q.count_examples_in_set(db, str(body.eval_set_id))
    run = q.create_eval_run(db, str(body.eval_set_id), str(body.prompt_version_id), total)

    # Fetch the joined row so we can return eval_set_name and prompt_version_name
    full_run = q.get_eval_run(db, str(run["id"]))
    return EvalRunListItem.model_validate(full_run)


@router.get("/runs", response_model=list[EvalRunListItem])
def list_eval_runs(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Connection, Depends(get_rls_db)],
):
    require_role(user, ["team_lead"])
    rows = q.list_eval_runs(db)
    return [EvalRunListItem.model_validate(row) for row in rows]


@router.get("/runs/{run_id}", response_model=EvalRunDetail)
def get_eval_run(
    run_id: UUID,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Connection, Depends(get_rls_db)],
):
    require_role(user, ["team_lead"])
    run = q.get_eval_run(db, str(run_id))
    if run is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Eval run not found")
    return _build_run_detail(run, db)
