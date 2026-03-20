from datetime import date, datetime
from typing import Any, Literal, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


DashboardPage = Literal["overview", "tickets"]
Density = Literal["comfortable", "compact"]
TimeZoneSetting = Literal["browser", "UTC"]
LandingPage = Literal["overview", "tickets"]
AutoRefreshSeconds = Literal[0, 30, 60]
DateRangePreset = Literal["7d", "30d", "90d", "custom"]
WatchlistSeverity = Literal["critical", "warning", "info"]


class DashboardFilters(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    range: DateRangePreset
    from_date: Optional[date] = Field(default=None, alias="from")
    to_date: Optional[date] = Field(default=None, alias="to")
    team: Optional[str] = None
    assignee_id: Optional[UUID] = None


class LatestEvalSummary(BaseModel):
    run_id: UUID
    eval_set_name: str
    prompt_version_name: str
    status: str
    accuracy: Optional[float] = None
    failed: int
    created_at: datetime


class OverviewKpis(BaseModel):
    open_work_queue_count: int
    pending_review_count: int
    unassigned_high_critical_count: int
    knowledge_issue_count: int
    latest_eval_summary: Optional[LatestEvalSummary] = None


class TicketsCreatedPoint(BaseModel):
    date: date
    count: int


class BacklogByStatusPoint(BaseModel):
    status: str
    count: int


class AgeByPriorityPoint(BaseModel):
    bucket: Literal["0_1d", "2_3d", "4_7d", "8_14d", "15d_plus"]
    low: int
    medium: int
    high: int
    critical: int


class OverviewCharts(BaseModel):
    tickets_created_by_day: list[TicketsCreatedPoint]
    backlog_by_status: list[BacklogByStatusPoint]
    age_by_priority: list[AgeByPriorityPoint]


class OverviewResponse(BaseModel):
    generated_at: datetime
    filters: DashboardFilters
    kpis: OverviewKpis
    charts: OverviewCharts


class WatchlistItem(BaseModel):
    key: str
    title: str
    count: int
    severity: WatchlistSeverity
    reason: str
    href: str


class WatchlistResponse(BaseModel):
    watchlist_items: list[WatchlistItem]


class DashboardSavedView(BaseModel):
    id: UUID
    page: DashboardPage
    name: str
    state: dict[str, Any]
    created_at: datetime
    updated_at: datetime


class DashboardSavedViewCreate(BaseModel):
    page: DashboardPage
    name: str
    state: dict[str, Any]


class DashboardSavedViewUpdate(BaseModel):
    name: Optional[str] = None
    state: Optional[dict[str, Any]] = None


class DashboardPreferences(BaseModel):
    landing_page: LandingPage
    time_zone: TimeZoneSetting
    overview_density: Density
    tickets_density: Density
    overview_visible_columns: list[str]
    tickets_visible_columns: list[str]
    overview_auto_refresh_seconds: AutoRefreshSeconds
    tickets_auto_refresh_seconds: AutoRefreshSeconds
    overview_default_view_id: Optional[UUID] = None
    tickets_default_view_id: Optional[UUID] = None


class DashboardPreferencesUpdate(BaseModel):
    landing_page: Optional[LandingPage] = None
    time_zone: Optional[TimeZoneSetting] = None
    overview_density: Optional[Density] = None
    tickets_density: Optional[Density] = None
    overview_visible_columns: Optional[list[str]] = None
    tickets_visible_columns: Optional[list[str]] = None
    overview_auto_refresh_seconds: Optional[AutoRefreshSeconds] = None
    tickets_auto_refresh_seconds: Optional[AutoRefreshSeconds] = None
    overview_default_view_id: Optional[UUID] = None
    tickets_default_view_id: Optional[UUID] = None
