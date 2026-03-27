"use client"

import { useEffect, useMemo, useSyncExternalStore } from "react"
import { useQuery } from "@tanstack/react-query"
import Link from "next/link"
import dynamic from "next/dynamic"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Clock3,
  Settings2,
  TrendingUp,
} from "lucide-react"
import { toast } from "sonner"

import { useCurrentUser } from "@/hooks/use-current-user"
import { useWorkspaceUsers } from "@/hooks/use-users"
import { useTickets } from "@/hooks/use-tickets"
import {
  useDashboardPreferences,
  useDashboardSavedViews,
  useCreateDashboardSavedView,
  useDeleteDashboardSavedView,
  useUpdateDashboardPreferences,
  useUpdateDashboardSavedView,
} from "@/hooks/use-dashboard"
import { overviewCombinedQueryOptions } from "@/lib/actions/overview"
import { DataTable, DataTableEmpty, DataTablePagination } from "@/components/ui/data-table"
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { FilterBar } from "@/components/ui/filter-bar"
import { FilterSelect } from "@/components/ui/filter-select"
import { buttonVariants } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { PageError } from "@/components/ui/page-error"
import { PageLoading } from "@/components/ui/page-loading"
import { AppPage, PageHeader } from "@/components/app-page"
import { DateRangeControls } from "@/components/dashboard/date-range-controls"
import {
  AgePriorityMatrix,
  BacklogByStatusChart,
  ComparisonToggle,
  OverviewKpiCard,
  TicketsCreatedTrendChart,
  type KpiDelta,
} from "@/components/dashboard/overview-visuals"
import { TicketPriorityBadge, TicketStatusBadge } from "@/components/ui/status-badges"
import { BADGE_TONE_DOT_CLASSNAMES, getDashboardWatchlistStyle } from "@/lib/badge-styles"
import { formatCategory, formatDateTime, formatRelativeTime } from "@/lib/format"
import {
  DEFAULT_OVERVIEW_COLUMNS,
  OVERVIEW_ALLOWED_QUERY_KEYS,
  OVERVIEW_TABLE_COLUMNS,
  TEAM_OPTIONS,
  getAgeBucketRange,
  getDefaultRangePreset,
  getPreviousRangeBounds,
  getRangeBounds,
  hrefFromState,
  serializeQueryState,
} from "@/lib/dashboard"
import { replaceUrl } from "@/lib/url-state"
import { cn } from "@/lib/utils"

const DashboardSettingsDrawer = dynamic(
  () =>
    import("@/components/dashboard/dashboard-settings-drawer").then(
      (module) => module.DashboardSettingsDrawer
    ),
  { ssr: false }
)

function maxDate(a: string | null, b: string | null) {
  if (!a) return b
  if (!b) return a
  return a > b ? a : b
}

function minDate(a: string | null, b: string | null) {
  if (!a) return b
  if (!b) return a
  return a < b ? a : b
}

function getCountDelta(
  current: number | undefined,
  previous: number | undefined,
  trend: "higher_is_worse" | "higher_is_better" = "higher_is_worse"
): KpiDelta | null {
  if (current == null || previous == null) return null

  const delta = current - previous
  if (delta === 0) {
    return { label: "No change", tone: "neutral" }
  }

  const improved = trend === "higher_is_better" ? delta > 0 : delta < 0
  return {
    label: `${delta > 0 ? "+" : "-"}${Math.abs(delta)} vs prev`,
    tone: improved ? "success" : "warning",
  }
}

function getAccuracyDelta(
  current: number | null | undefined,
  previous: number | null | undefined
): KpiDelta | null {
  if (current == null || previous == null) return null

  const delta = (current - previous) * 100
  if (Math.abs(delta) < 0.05) {
    return { label: "No change", tone: "neutral" }
  }

  return {
    label: `${delta > 0 ? "+" : "-"}${Math.abs(delta).toFixed(1)} pts`,
    tone: delta > 0 ? "success" : "danger",
  }
}

function OverviewPageContent() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { data: user, isPending: userPending } = useCurrentUser()
  const isInternal = user?.role === "support_agent" || user?.role === "team_lead"

  const preferencesQuery = useDashboardPreferences({ enabled: isInternal })
  const viewsQuery = useDashboardSavedViews("overview", { enabled: isInternal })
  const usersQuery = useWorkspaceUsers()

  const updatePreferences = useUpdateDashboardPreferences()
  const createSavedView = useCreateDashboardSavedView()
  const updateSavedView = useUpdateDashboardSavedView("overview")
  const deleteSavedView = useDeleteDashboardSavedView("overview")

  const range = getDefaultRangePreset(searchParams.get("range"))
  const fromValue = searchParams.get("from")
  const toValue = searchParams.get("to")
  const team = searchParams.get("team")
  const assigneeId = searchParams.get("assignee_id")
  const selectedStatus = searchParams.get("status")
  const selectedPriority = searchParams.get("priority")
  const selectedAgeBucket = searchParams.get("age_bucket")
  const compareMode = searchParams.get("compare") === "1"
  const page = Math.max(1, Number(searchParams.get("page") ?? "1"))

  const rangeBounds = getRangeBounds(range, fromValue, toValue)
  const comparisonBounds = compareMode
    ? getPreviousRangeBounds(rangeBounds.from, rangeBounds.to)
    : null
  const ageBounds = selectedAgeBucket
    ? getAgeBucketRange(selectedAgeBucket, rangeBounds.to)
    : { from: null, to: null }
  const createdFrom = maxDate(rangeBounds.from, ageBounds.from)
  const createdTo = minDate(rangeBounds.to, ageBounds.to)

  const preferences = preferencesQuery.data
  const visibleColumns = preferences?.overview_visible_columns ?? DEFAULT_OVERVIEW_COLUMNS
  const density = preferences?.overview_density ?? "comfortable"
  const autoRefreshSeconds = preferences?.overview_auto_refresh_seconds ?? 30
  const timeZone = preferences?.time_zone ?? "browser"
  const defaultViewId = preferences?.overview_default_view_id ?? null
  const savedViews = useMemo(() => viewsQuery.data ?? [], [viewsQuery.data])
  const chartsReady = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  )

  useEffect(() => {
    if (!isInternal) return
    if (!preferences || viewsQuery.isLoading) return
    if (searchParams.toString() !== "") return
    if (!defaultViewId) return
    const defaultView = savedViews.find((view) => view.id === defaultViewId)
    if (!defaultView) return
    replaceUrl(hrefFromState(pathname, defaultView.state))
  }, [
    defaultViewId,
    isInternal,
    pathname,
    preferences,
    savedViews,
    searchParams,
    viewsQuery.isLoading,
  ])

  const overviewParams = useMemo(
    () => ({
      range,
      from: range === "custom" ? fromValue : undefined,
      to: range === "custom" ? toValue : undefined,
      team,
      assignee_id: assigneeId,
    }),
    [assigneeId, fromValue, range, team, toValue]
  )
  const comparisonParams = useMemo(
    () =>
      comparisonBounds
        ? {
            range: "custom",
            from: comparisonBounds.from,
            to: comparisonBounds.to,
            team,
            assignee_id: assigneeId,
          }
        : null,
    [assigneeId, comparisonBounds, team]
  )

  const overviewCombinedQuery = useQuery({
    ...overviewCombinedQueryOptions({
      params: overviewParams,
      comparisonParams,
    }),
    enabled: isInternal,
    refetchInterval: autoRefreshSeconds > 0 ? autoRefreshSeconds * 1000 : false,
  })
  const ticketsQuery = useTickets(
    {
      page,
      per_page: 10,
      status: selectedStatus,
      priority: selectedPriority,
      team,
      assignee_id: assigneeId,
      created_from: createdFrom,
      created_to: createdTo,
      sort_by: "created_at",
      sort_order: "desc",
    },
    {
      enabled: isInternal,
      refetchInterval: autoRefreshSeconds > 0 ? autoRefreshSeconds * 1000 : false,
    }
  )

  const assigneeOptions = useMemo(() => {
    const internalUsers = (usersQuery.data ?? []).filter(
      (workspaceUser) => workspaceUser.role !== "client_user"
    )
    return internalUsers.map((workspaceUser) => ({
      value: workspaceUser.id,
      label: workspaceUser.full_name,
    }))
  }, [usersQuery.data])

  function pushParams(next: URLSearchParams) {
    const query = next.toString()
    replaceUrl(query ? `${pathname}?${query}` : pathname)
  }

  function updateParams(updates: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams.toString())
    Object.entries(updates).forEach(([key, value]) => {
      if (value == null || value === "") {
        next.delete(key)
      } else {
        next.set(key, value)
      }
    })
    next.delete("page")
    pushParams(next)
  }

  function setParam(key: string, value: string | null) {
    updateParams({ [key]: value })
  }

  function setRange(value: "7d" | "30d" | "90d" | "custom") {
    const next = new URLSearchParams(searchParams.toString())
    next.set("range", value)
    if (value === "custom") {
      const seededRange = getRangeBounds(range, fromValue, toValue)
      next.set("from", fromValue ?? seededRange.from)
      next.set("to", toValue ?? seededRange.to)
    } else {
      next.delete("from")
      next.delete("to")
    }
    next.delete("page")
    pushParams(next)
  }

  function setCompareMode(enabled: boolean) {
    updateParams({ compare: enabled ? "1" : null })
  }

  function clearFilters() {
    replaceUrl(`${pathname}?range=30d`)
  }

  function setPage(newPage: number) {
    const next = new URLSearchParams(searchParams.toString())
    next.set("page", String(newPage))
    replaceUrl(`${pathname}?${next.toString()}`)
  }

  function applySavedView(state: Record<string, unknown>) {
    replaceUrl(hrefFromState(pathname, state))
  }

  function currentState() {
    const state = serializeQueryState(searchParams, OVERVIEW_ALLOWED_QUERY_KEYS)
    if (!state.range) {
      state.range = range
    }
    if (range === "custom" && fromValue && toValue) {
      state.from = fromValue
      state.to = toValue
    }
    return state
  }

  function updateOverviewPreferences(updates: {
    density: "comfortable" | "compact"
    visibleColumns: string[]
    autoRefreshSeconds: 0 | 30 | 60
  }) {
    updatePreferences.mutate(
      {
        overview_density: updates.density,
        overview_visible_columns: updates.visibleColumns,
        overview_auto_refresh_seconds: updates.autoRefreshSeconds,
      },
      {
        onSuccess: () => toast.success("Overview settings saved"),
        onError: (error) => toast.error((error as Error).message || "Failed to save settings"),
      }
    )
  }

  const headCellClass = density === "compact" ? "h-8 px-3 text-xs" : undefined
  const bodyCellClass = density === "compact" ? "px-3 py-2 text-xs" : undefined
  const hasActiveFilters =
    range !== "30d" ||
    compareMode ||
    !!team ||
    !!assigneeId ||
    !!selectedStatus ||
    !!selectedPriority ||
    !!selectedAgeBucket

  if (userPending || (isInternal && (preferencesQuery.isLoading || viewsQuery.isLoading) && searchParams.toString() === "")) {
    return <PageLoading />
  }

  if (user?.role === "client_user") {
    return (
      <div className="flex flex-col items-center gap-3 py-20 text-center">
        <BarChart3 className="size-10 text-muted-foreground" />
        <p className="text-base font-medium text-foreground">Access restricted</p>
        <p className="text-sm text-muted-foreground">
          The operations overview is available to support agents and team leads only.
        </p>
      </div>
    )
  }

  if (!isInternal) {
    return <PageLoading />
  }

  if (overviewCombinedQuery.isError) {
    return (
      <PageError
        message="Failed to load dashboard overview."
        onRetry={() => {
          overviewCombinedQuery.refetch()
          ticketsQuery.refetch()
        }}
      />
    )
  }

  const overview = overviewCombinedQuery.data?.overview
  const watchlistItems = overviewCombinedQuery.data?.watchlist.watchlist_items ?? []
  const tickets = ticketsQuery.data?.items ?? []
  const totalPages = ticketsQuery.data?.total_pages ?? 1
  const kpis = overview?.kpis
  const comparisonOverview = overviewCombinedQuery.data?.comparisonOverview ?? null
  const comparisonKpis = comparisonOverview?.kpis
  const isRefreshing =
    (overviewCombinedQuery.isPlaceholderData || ticketsQuery.isPlaceholderData) &&
    (overviewCombinedQuery.data != null || ticketsQuery.data != null)

  return (
    <AppPage>
      <PageHeader
        title="Operations Overview"
        meta={<p>Queue health, current risks, and ticket drill-down from one page.</p>}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="px-2 text-[11px]" dotClassName="bg-primary">
              Updated {overview ? formatDateTime(overview.generated_at, timeZone) : "just now"}
            </Badge>
            {isRefreshing ? (
              <Badge variant="secondary" className="px-2 text-[11px]">
                Updating
              </Badge>
            ) : null}
          </div>
        }
      />

      <FilterBar
        onClear={clearFilters}
        hasActiveFilters={hasActiveFilters}
        actions={
          <DashboardSettingsDrawer
            page="overview"
            views={savedViews}
            defaultViewId={defaultViewId}
            density={density}
            availableColumns={OVERVIEW_TABLE_COLUMNS}
            visibleColumns={visibleColumns}
            autoRefreshSeconds={autoRefreshSeconds}
            onApplyView={(view) => applySavedView(view.state)}
            onCreateView={(name) =>
              createSavedView.mutate(
                { page: "overview", name, state: currentState() },
                {
                  onSuccess: () => toast.success("Saved overview view"),
                  onError: (error) => toast.error((error as Error).message || "Failed to save view"),
                }
              )
            }
            onOverwriteView={(viewId) =>
              updateSavedView.mutate(
                { id: viewId, body: { state: currentState() } },
                {
                  onSuccess: () => toast.success("View updated"),
                  onError: (error) => toast.error((error as Error).message || "Failed to update view"),
                }
              )
            }
            onRenameView={(viewId, name) =>
              updateSavedView.mutate(
                { id: viewId, body: { name } },
                {
                  onSuccess: () => toast.success("View renamed"),
                  onError: (error) => toast.error((error as Error).message || "Failed to rename view"),
                }
              )
            }
            onDeleteView={(viewId) =>
              deleteSavedView.mutate(viewId, {
                onSuccess: () => toast.success("View deleted"),
                onError: (error) => toast.error((error as Error).message || "Failed to delete view"),
              })
            }
            onSetDefaultView={(viewId) =>
              updatePreferences.mutate(
                { overview_default_view_id: viewId },
                {
                  onSuccess: () => toast.success(viewId ? "Default view updated" : "Default view cleared"),
                  onError: (error) => toast.error((error as Error).message || "Failed to update default view"),
                }
              )
            }
            onSavePreferences={updateOverviewPreferences}
            preferencesPending={updatePreferences.isPending}
            viewsPending={createSavedView.isPending || updateSavedView.isPending || deleteSavedView.isPending}
          />
        }
      >
        <DateRangeControls
          range={range}
          from={fromValue}
          to={toValue}
          onRangeChange={setRange}
          onFromChange={(value) => setParam("from", value)}
          onToChange={(value) => setParam("to", value)}
        />
        <ComparisonToggle enabled={compareMode} onToggle={setCompareMode} />
        <FilterSelect
          value={team}
          onValueChange={(value) => setParam("team", value || null)}
          placeholder="All teams"
          options={TEAM_OPTIONS}
          className="w-44"
        />
        <FilterSelect
          value={assigneeId}
          onValueChange={(value) => setParam("assignee_id", value || null)}
          placeholder="All assignees"
          options={assigneeOptions}
          className="w-44"
        />
      </FilterBar>

      <div className={cn("space-y-6 transition-opacity duration-200", isRefreshing && "opacity-70")}>
      <div className={`grid gap-4 ${user?.role === "team_lead" ? "xl:grid-cols-5" : "md:grid-cols-2 xl:grid-cols-4"}`}>
        <OverviewKpiCard
          title="Open work queue"
          value={kpis?.open_work_queue_count ?? 0}
          description="Open tickets in new, open, and pending states"
          icon={<TrendingUp className="size-4 text-primary" />}
          delta={compareMode ? getCountDelta(kpis?.open_work_queue_count, comparisonKpis?.open_work_queue_count) : null}
        />
        <OverviewKpiCard
          title="Pending review"
          value={kpis?.pending_review_count ?? 0}
          description="Drafts waiting for a human decision"
          icon={<Clock3 className="size-4 text-warning" />}
          delta={compareMode ? getCountDelta(kpis?.pending_review_count, comparisonKpis?.pending_review_count) : null}
        />
        <OverviewKpiCard
          title="Unassigned high/critical"
          value={kpis?.unassigned_high_critical_count ?? 0}
          description="Work items with elevated urgency and no owner"
          icon={<AlertTriangle className="size-4 text-destructive" />}
          delta={
            compareMode
              ? getCountDelta(
                  kpis?.unassigned_high_critical_count,
                  comparisonKpis?.unassigned_high_critical_count
                )
              : null
          }
        />
        <OverviewKpiCard
          title="Knowledge issues"
          value={kpis?.knowledge_issue_count ?? 0}
          description="Failed or stalled document ingestion jobs"
          icon={<BarChart3 className="size-4 text-info" />}
          delta={compareMode ? getCountDelta(kpis?.knowledge_issue_count, comparisonKpis?.knowledge_issue_count) : null}
        />
        {user?.role === "team_lead" ? (
          <OverviewKpiCard
            title="Latest eval"
            value={
              kpis?.latest_eval_summary?.accuracy != null
                ? `${(kpis.latest_eval_summary.accuracy * 100).toFixed(1)}%`
                : kpis?.latest_eval_summary?.status ?? "-"
            }
            description={
              kpis?.latest_eval_summary
                ? `${kpis.latest_eval_summary.eval_set_name} - ${kpis.latest_eval_summary.prompt_version_name}`
                : "No eval runs yet"
            }
            icon={<Settings2 className="size-4 text-primary" />}
            delta={
              compareMode
                ? getAccuracyDelta(
                    kpis?.latest_eval_summary?.accuracy,
                    comparisonKpis?.latest_eval_summary?.accuracy
                  )
                : null
            }
          />
        ) : null}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Tickets created by day</CardTitle>
            <CardDescription>
              {compareMode
                ? "Current volume with the previous period overlaid for context."
                : "Volume trend over the selected range."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {chartsReady ? (
              <TicketsCreatedTrendChart
                currentSeries={overview?.charts.tickets_created_by_day ?? []}
                previousSeries={comparisonOverview?.charts.tickets_created_by_day}
                compareEnabled={compareMode}
                timeZone={timeZone}
              />
            ) : (
              <ChartPlaceholder />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Backlog by status</CardTitle>
            <CardDescription>Click a bar to filter the detail table.</CardDescription>
          </CardHeader>
          <CardContent>
            {chartsReady ? (
              <BacklogByStatusChart
                data={overview?.charts.backlog_by_status ?? []}
                selectedStatus={selectedStatus}
                onSelect={(status) =>
                  updateParams({
                    status,
                    priority: null,
                    age_bucket: null,
                  })
                }
              />
            ) : (
              <ChartPlaceholder />
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Ticket age by priority</CardTitle>
          <CardDescription>
            Open work queue broken into fixed age buckets and priority bands.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {chartsReady ? (
            <AgePriorityMatrix
              data={overview?.charts.age_by_priority ?? []}
              selectedPriority={selectedPriority}
              selectedAgeBucket={selectedAgeBucket}
              onSelect={(priority, bucket) =>
                updateParams({
                  priority,
                  age_bucket: bucket,
                  status: null,
                })
              }
            />
          ) : (
            <ChartPlaceholder />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Action center</CardTitle>
          <CardDescription>Only items with immediate follow-up appear here.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {watchlistItems.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/80 bg-muted/35 px-4 py-6 text-center text-sm text-muted-foreground">
              No active watchlist items.
            </div>
          ) : (
            watchlistItems.map((item) => {
              const style = getDashboardWatchlistStyle(item.severity)

              return (
                <div
                  key={item.key}
                  className="flex flex-col gap-3 rounded-xl border border-border/70 bg-card px-4 py-4 surface-shadow-sm sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-foreground">{item.title}</span>
                      <Badge
                        dotClassName={cn(
                          BADGE_TONE_DOT_CLASSNAMES[style.tone],
                          style.dotClassName
                        )}
                        dotStyle={
                          style.dotColorVar ? { backgroundColor: style.dotColorVar } : undefined
                        }
                      >
                        {item.count}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{item.reason}</p>
                  </div>
                  <Link
                    href={item.href}
                    className={cn(buttonVariants({ variant: "outline", size: "sm" }), "cursor-pointer")}
                  >
                    Open
                    <ArrowRight className="size-4" />
                  </Link>
                </div>
              )
            })
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Filtered ticket details</CardTitle>
          <CardDescription>
            Queue rows update from the overview filters and chart selections.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <DataTable>
            <TableHeader>
              <TableRow>
                {visibleColumns.includes("subject") ? (
                  <TableHead className={headCellClass}>Subject</TableHead>
                ) : null}
                {visibleColumns.includes("status") ? (
                  <TableHead className={headCellClass}>Status</TableHead>
                ) : null}
                {visibleColumns.includes("priority") ? (
                  <TableHead className={headCellClass}>Priority</TableHead>
                ) : null}
                {visibleColumns.includes("created") ? (
                  <TableHead className={headCellClass}>Created</TableHead>
                ) : null}
                {visibleColumns.includes("assignee") ? (
                  <TableHead className={headCellClass}>Assignee</TableHead>
                ) : null}
                {visibleColumns.includes("category") ? (
                  <TableHead className={headCellClass}>Category</TableHead>
                ) : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {tickets.length === 0 ? (
                <DataTableEmpty
                  colSpan={visibleColumns.length}
                  message="No tickets match the current overview filters"
                />
              ) : (
                tickets.map((ticket) => (
                  <TableRow
                    key={ticket.id}
                    className="group cursor-pointer"
                    onClick={() => router.push(`/tickets/${ticket.id}`)}
                  >
                    {visibleColumns.includes("subject") ? (
                      <TableCell className={bodyCellClass}>
                        <span
                          className="block max-w-[34rem] truncate font-medium transition-colors duration-150 group-hover:text-primary"
                          title={ticket.subject}
                        >
                          {ticket.subject}
                        </span>
                      </TableCell>
                    ) : null}
                    {visibleColumns.includes("status") ? (
                      <TableCell className={bodyCellClass}>
                        <TicketStatusBadge status={ticket.status} />
                      </TableCell>
                    ) : null}
                    {visibleColumns.includes("priority") ? (
                      <TableCell className={bodyCellClass}>
                        <TicketPriorityBadge priority={ticket.priority} />
                      </TableCell>
                    ) : null}
                    {visibleColumns.includes("created") ? (
                      <TableCell className={bodyCellClass}>
                        <span className="text-muted-foreground">
                          {formatRelativeTime(ticket.created_at)}
                        </span>
                      </TableCell>
                    ) : null}
                    {visibleColumns.includes("assignee") ? (
                      <TableCell className={bodyCellClass}>
                        {ticket.assignee_name ?? (
                          <span className="text-muted-foreground">Unassigned</span>
                        )}
                      </TableCell>
                    ) : null}
                    {visibleColumns.includes("category") ? (
                      <TableCell className={bodyCellClass}>
                        <span className="text-muted-foreground">
                          {formatCategory(ticket.category)}
                        </span>
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))
              )}
            </TableBody>
          </DataTable>

          <DataTablePagination page={page} totalPages={totalPages} onPageChange={setPage} />
        </CardContent>
      </Card>
      </div>
    </AppPage>
  )
}

export default function OverviewPageClient() {
  return <OverviewPageContent />
}

function ChartPlaceholder() {
  return <div className="h-full w-full animate-pulse rounded-lg bg-muted/35" />
}
