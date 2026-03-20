from datetime import date, datetime, timedelta, timezone
from typing import Annotated, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from psycopg import Connection
from psycopg.errors import UniqueViolation

from app.auth import CurrentUser, get_current_user
from app.deps import get_rls_db
from app.queries import dashboard as q
from app.schemas.dashboard import (
    DashboardFilters,
    DashboardPreferences,
    DashboardPreferencesUpdate,
    DashboardSavedView,
    DashboardSavedViewCreate,
    DashboardSavedViewUpdate,
    OverviewResponse,
    WatchlistResponse,
)

router = APIRouter()


def require_internal_role(user: CurrentUser) -> None:
    if user.role not in ("support_agent", "team_lead"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Role '{user.role}' cannot access this resource",
        )


def resolve_date_range(
    range_value: str,
    from_date: Optional[date],
    to_date: Optional[date],
) -> tuple[date, date]:
    today = datetime.now(timezone.utc).date()

    if range_value == "custom":
        if from_date is None or to_date is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="custom range requires both from and to",
            )
        if from_date > to_date:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="from must be on or before to",
            )
        return from_date, to_date

    presets = {"7d": 6, "30d": 29, "90d": 89}
    if range_value not in presets:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="range must be one of 7d, 30d, 90d, or custom",
        )

    return today - timedelta(days=presets[range_value]), today


def _validate_default_view(
    conn: Connection,
    view_id: Optional[UUID],
    page: str,
) -> None:
    if view_id is None:
        return
    row = q.get_dashboard_saved_view(conn, str(view_id))
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Default {page} view not found",
        )
    if row["page"] != page:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Default {page} view must point to a {page} saved view",
        )


@router.get("/overview", response_model=OverviewResponse)
def get_overview(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Connection, Depends(get_rls_db)],
    range: str = Query("30d"),
    from_date: Optional[date] = Query(None, alias="from"),
    to_date: Optional[date] = Query(None, alias="to"),
    team: Optional[str] = Query(None),
    assignee_id: Optional[UUID] = Query(None),
):
    require_internal_role(user)
    start_date, end_date = resolve_date_range(range, from_date, to_date)
    payload = q.get_overview_data(
        db,
        start_date,
        end_date,
        team,
        str(assignee_id) if assignee_id else None,
        include_eval=user.role == "team_lead",
    )
    return OverviewResponse(
        generated_at=payload["generated_at"],
        filters=DashboardFilters(
            range=range,
            from_date=start_date,
            to_date=end_date,
            team=team,
            assignee_id=assignee_id,
        ),
        kpis=payload["kpis"],
        charts=payload["charts"],
    )


@router.get("/watchlist", response_model=WatchlistResponse)
def get_watchlist(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Connection, Depends(get_rls_db)],
    range: str = Query("30d"),
    from_date: Optional[date] = Query(None, alias="from"),
    to_date: Optional[date] = Query(None, alias="to"),
    team: Optional[str] = Query(None),
    assignee_id: Optional[UUID] = Query(None),
):
    require_internal_role(user)
    start_date, end_date = resolve_date_range(range, from_date, to_date)
    items = q.get_watchlist_items(
        db,
        start_date,
        end_date,
        team,
        str(assignee_id) if assignee_id else None,
        include_eval=user.role == "team_lead",
    )
    return WatchlistResponse(watchlist_items=items)


@router.get("/views", response_model=list[DashboardSavedView])
def list_saved_views(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Connection, Depends(get_rls_db)],
    page: str = Query(...),
):
    require_internal_role(user)
    if page not in ("overview", "tickets"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="page must be overview or tickets",
        )
    rows = q.list_dashboard_saved_views(db, page)
    return [DashboardSavedView.model_validate(row) for row in rows]


@router.post("/views", response_model=DashboardSavedView, status_code=status.HTTP_201_CREATED)
def create_saved_view(
    body: DashboardSavedViewCreate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Connection, Depends(get_rls_db)],
):
    require_internal_role(user)
    try:
        row = q.create_dashboard_saved_view(db, body.page, body.name, body.state)
    except UniqueViolation:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A saved view with this name already exists for that page",
        )
    return DashboardSavedView.model_validate(row)


@router.patch("/views/{view_id}", response_model=DashboardSavedView)
def update_saved_view(
    view_id: UUID,
    body: DashboardSavedViewUpdate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Connection, Depends(get_rls_db)],
):
    require_internal_role(user)
    updates = body.model_dump(exclude_unset=True)
    try:
        row = q.update_dashboard_saved_view(db, str(view_id), updates)
    except UniqueViolation:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A saved view with this name already exists for that page",
        )
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Saved view not found")
    return DashboardSavedView.model_validate(row)


@router.delete("/views/{view_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_saved_view(
    view_id: UUID,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Connection, Depends(get_rls_db)],
):
    require_internal_role(user)
    deleted = q.delete_dashboard_saved_view(db, str(view_id))
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Saved view not found")


@router.get("/preferences", response_model=DashboardPreferences)
def get_preferences(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Connection, Depends(get_rls_db)],
):
    require_internal_role(user)
    row = q.get_or_create_dashboard_preferences(db)
    return DashboardPreferences.model_validate(row)


@router.patch("/preferences", response_model=DashboardPreferences)
def update_preferences(
    body: DashboardPreferencesUpdate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Connection, Depends(get_rls_db)],
):
    require_internal_role(user)
    updates = body.model_dump(exclude_unset=True)
    if "overview_default_view_id" in updates:
        _validate_default_view(db, updates["overview_default_view_id"], "overview")
    if "tickets_default_view_id" in updates:
        _validate_default_view(db, updates["tickets_default_view_id"], "tickets")
    row = q.update_dashboard_preferences(db, updates)
    return DashboardPreferences.model_validate(row)
